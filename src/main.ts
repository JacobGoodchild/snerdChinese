import './style.css';
import {
  loadReviews, saveReviews, decayColor, daysSince, ago, exportReviews, mergeImport, pref, type Reviews,
} from './progress';

// ---------- types ----------
type Word = [s: string, p: string, e: string, alt?: [string, string]];
type Example = [zh: string, py: string, en: string, id: number];
interface CharData {
  c: string; d: string; p: string[]; r: string; dc: string; parts: string[];
  et: { type: 'pictographic' | 'ideographic' | 'pictophonetic'; hint?: string; phonetic?: string; semantic?: string } | null;
  comp: Record<string, { d: string; p: string }>;
  s: string[]; m: (number | null)[];
}
interface Item { word: Word; level: number; el: HTMLButtonElement; }

const BASE = import.meta.env.BASE_URL + 'data/';
const LEVELS = [
  { n: 1, total: 150, sub: 'The first 150 words — greetings, numbers, family and your very first sentences.' },
  { n: 2, total: 300, sub: '300 words in total — simple, direct exchanges about everyday things.' },
  { n: 3, total: 600, sub: '600 words in total — handle daily life, study, work and travel.' },
  { n: 4, total: 1200, sub: '1,200 words in total — talk fluently about a wide range of topics.' },
  { n: 5, total: 2500, sub: '2,500 words in total — read newspapers, watch films, give a full speech.' },
  { n: 6, total: 5000, sub: '5,000 words in total — understand what you read and hear, and say what you mean.' },
];

const app = document.getElementById('app')!;
const reviews: Reviews = loadReviews();
const items: Item[] = [];
const levelEls = new Map<number, { count: HTMLElement; bar: HTMLElement; items: Item[] }>();
const charCache = new Map<string, Promise<CharData | null>>();
const exCache = new Map<number, Promise<Record<string, Example>>>();

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const fetchJSON = <T,>(url: string): Promise<T> => fetch(url).then((r) => { if (!r.ok) throw new Error(url); return r.json(); });

// ---------- colours & counters ----------
function paint(item: Item) {
  const ts = reviews[item.word[0]];
  item.el.style.backgroundColor = ts ? decayColor(daysSince(ts)) : '';
}
function updateCounts() {
  let total = 0, done = 0;
  for (const [, l] of levelEls) {
    const n = l.items.filter((i) => reviews[i.word[0]]).length;
    l.count.textContent = `${n} / ${l.items.length}`;
    l.bar.style.width = `${(100 * n) / l.items.length}%`;
    total += l.items.length; done += n;
  }
  document.getElementById('totalCount')!.textContent = `${done.toLocaleString()} / ${total.toLocaleString()} reviewed`;
}
function repaintAll() { items.forEach(paint); updateCounts(); }

function markReviewed(i: number) {
  const item = items[i];
  reviews[item.word[0]] = Date.now();
  saveReviews(reviews);
  paint(item);
  item.el.classList.remove('stamp');
  void item.el.offsetWidth;
  item.el.classList.add('stamp');
  updateCounts();
  if (open?.idx === i) refreshStatus();
}

// ---------- speech ----------
let zhVoice: SpeechSynthesisVoice | undefined;
function pickVoice() {
  const vs = speechSynthesis.getVoices();
  zhVoice = vs.find((v) => v.lang === 'zh-CN') || vs.find((v) => /^zh[-_](CN|Hans)/i.test(v.lang)) || vs.find((v) => v.lang.startsWith('zh'));
}
if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
function speak(text: string) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'zh-CN';
  if (zhVoice) u.voice = zhVoice;
  u.rate = 0.85;
  speechSynthesis.speak(u);
}
const SPEAKER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>';

// ---------- render sections ----------
function tileClass(s: string) { return s.length >= 5 ? 'tile xlong' : s.length === 4 ? 'tile long' : 'tile'; }

async function init() {
  const lists = await Promise.all(LEVELS.map((l) => fetchJSON<Word[]>(`${BASE}hsk${l.n}.json`)));
  app.innerHTML = '';
  const nav = document.getElementById('levelNav')!;
  LEVELS.forEach((lvl, k) => {
    nav.insertAdjacentHTML('beforeend', `<a href="#hsk${lvl.n}">HSK ${lvl.n}</a>`);
    const sec = document.createElement('section');
    sec.className = 'level';
    sec.id = `hsk${lvl.n}`;
    const start = items.length;
    sec.innerHTML = `
      <div class="level-head"><h2>HSK ${lvl.n}</h2><span class="count"></span></div>
      <p class="level-sub">${lvl.sub}</p>
      <div class="progress"><i></i></div>
      <div class="grid">${lists[k].map((w, j) => `<button class="${tileClass(w[0])}" data-i="${start + j}" lang="zh-CN">${w[0]}</button>`).join('')}</div>`;
    app.appendChild(sec);
    const tiles = sec.querySelectorAll<HTMLButtonElement>('.tile');
    const lvItems = lists[k].map((word, j) => ({ word, level: lvl.n, el: tiles[j] }));
    items.push(...lvItems);
    levelEls.set(lvl.n, { count: sec.querySelector('.count')!, bar: sec.querySelector('.progress i')!, items: lvItems });
  });
  repaintAll();
}

// ---------- inline drawer ----------
let open: { idx: number; drawer: HTMLElement } | null = null;

/** Last tile in the same visual row as tile i. */
function rowEnd(i: number): HTMLElement {
  const el = items[i].el;
  const top = el.offsetTop;
  const grid = el.parentElement!;
  let last: HTMLElement = el;
  for (let n = el.nextElementSibling as HTMLElement | null; n; n = n.nextElementSibling as HTMLElement | null) {
    if (!n.classList.contains('tile')) continue;
    if (n.offsetTop !== top || n.parentElement !== grid) break;
    last = n;
  }
  return last;
}

function closeDrawer() {
  if (!open) return;
  const d = open.drawer;
  items[open.idx].el.classList.remove('open');
  d.classList.remove('show');
  d.addEventListener('transitionend', () => d.remove(), { once: true });
  setTimeout(() => d.remove(), 450);
  open = null;
}

function openDrawer(i: number, scroll = false) {
  if (open?.idx === i) { closeDrawer(); return; }
  const prev = open;
  // If the new tile sits in the same row as the open drawer, just swap the content in place.
  if (prev && prev.drawer.previousElementSibling === rowEnd(i) && !prev.drawer.classList.contains('closing')) {
    items[prev.idx].el.classList.remove('open');
    open = { idx: i, drawer: prev.drawer };
  } else {
    // Measure the target row before closing the old drawer, so the old one can animate out.
    closeDrawer();
    const d = document.createElement('div');
    d.className = 'drawer';
    d.innerHTML = '<div class="inner"></div>';
    rowEnd(i).after(d);
    void d.offsetHeight;
    requestAnimationFrame(() => d.classList.add('show'));
    open = { idx: i, drawer: d };
  }
  items[i].el.classList.add('open');
  renderPanel(i);
  if (scroll) items[i].el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function reposition() {
  if (!open) return;
  const end = rowEnd(open.idx);
  if (open.drawer.previousElementSibling !== end) end.after(open.drawer);
}
let rt = 0;
window.addEventListener('resize', () => { clearTimeout(rt); rt = window.setTimeout(reposition, 80); });

function refreshStatus() {
  if (!open) return;
  const w = items[open.idx].word[0];
  const st = open.drawer.querySelector('.status');
  const btn = open.drawer.querySelector('.mark-btn');
  const ts = reviews[w];
  if (st) st.innerHTML = ts ? `<span class="dot" style="background:${decayColor(daysSince(ts))}"></span>${ago(ts)}` : '<span class="dot"></span>not reviewed yet';
  if (btn) { btn.classList.toggle('done', !!ts); btn.innerHTML = `${ts ? '✓ reviewed' : 'mark reviewed'} <kbd>space</kbd>`; }
}

function renderPanel(i: number) {
  const { word, level } = items[i];
  const [s, p, e, alt] = word;
  const inner = open!.drawer.querySelector('.inner')!;
  inner.innerHTML = `
    <div class="panel">
      <div class="word-head">
        <div class="big" lang="zh-CN">${s}</div>
        <div class="word-info">
          <div class="py">${esc(p)}</div>
          <div class="en">${esc(e)}</div>
          ${alt ? `<div class="alt">also <b>${esc(alt[0])}</b> — ${esc(alt[1])}</div>` : ''}
          <div class="tags">
            <span class="tag">HSK ${level}</span>
            <span class="status"></span>
          </div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="icon-btn say-word" title="Pronounce (R)">${SPEAKER}<kbd>r</kbd></button>
          <button class="icon-btn mark-btn"></button>
        </div>
      </div>
      <div class="label">Character breakdown</div>
      <div class="chars">${[...new Set(s)].map((c) => `<div class="char" data-c="${c}"><div class="glyph-fallback" lang="zh-CN">${c}</div><div></div></div>`).join('')}</div>
      <div class="label">Example</div>
      <div class="ex"><p class="none">loading…</p></div>
      <div class="hint"><kbd>space</kbd> mark reviewed · <kbd>r</kbd> speak · <kbd>←</kbd><kbd>→</kbd> previous / next word · <kbd>esc</kbd> close</div>
    </div>`;
  refreshStatus();
  inner.querySelector('.say-word')!.addEventListener('click', () => speak(s));
  inner.querySelector('.mark-btn')!.addEventListener('click', () => markReviewed(i));

  for (const c of new Set(s)) {
    loadChar(c).then((data) => {
      if (open?.idx !== i) return;
      const box = inner.querySelector<HTMLElement>(`.char[data-c="${c}"]`);
      if (box) box.outerHTML = charCard(c, data);
    });
  }
  loadExamples(level).then((ex) => {
    if (open?.idx !== i) return;
    renderExample(inner.querySelector('.ex')!, s, ex[s]);
  });
}

// ---------- characters ----------
function loadChar(c: string) {
  if (!charCache.has(c)) {
    charCache.set(c, fetchJSON<CharData>(`${BASE}chars/${c.codePointAt(0)!.toString(16)}.json`).catch(() => null));
  }
  return charCache.get(c)!;
}

const PART_COLORS = ['var(--part0)', 'var(--part1)', 'var(--part2)'];
const firstLeaf = (ids: string) => [...ids].find((ch) => !/[⿰-⿻？]/.test(ch)) || ids;
const isLeaf = (ids: string) => [...ids].length === 1 && !/[⿰-⿻]/.test(ids);

function role(d: CharData, part: string) {
  if (d.et?.type !== 'pictophonetic') return '';
  if (d.et.semantic && part.includes(d.et.semantic)) return 'meaning';
  if (d.et.phonetic && part.includes(d.et.phonetic)) return 'sound';
  return '';
}
/** One colour per top-level part: meaning parts teal, sound parts amber, others by position. */
function partColors(d: CharData) {
  const used = new Set<number>();
  const cols: (number | null)[] = d.parts.map((part) => {
    const r = role(d, part);
    const k = r === 'meaning' ? 0 : r === 'sound' ? 1 : null;
    if (k !== null) used.add(k);
    return k;
  });
  return cols.map((k) => {
    if (k !== null) return PART_COLORS[k];
    const free = [0, 1, 2].find((x) => !used.has(x)) ?? 2;
    used.add(free);
    return PART_COLORS[free];
  });
}

function glyphSVG(d: CharData) {
  const cols = partColors(d);
  const paths = d.s.map((path, k) => {
    const m = d.m[k];
    const fill = m !== null && m !== undefined && d.parts.length > 1 ? cols[m] ?? 'var(--stroke)' : 'var(--ink)';
    return `<path d="${path}" fill="${fill}"/>`;
  }).join('');
  return `<svg class="glyph" viewBox="0 0 1024 1024" role="img" aria-label="${d.c}"><g stroke="none"><line x1="512" y1="40" x2="512" y2="984" stroke="#eeede8" stroke-width="6" stroke-dasharray="20 20"/><line x1="40" y1="512" x2="984" y2="512" stroke="#eeede8" stroke-width="6" stroke-dasharray="20 20"/></g><g transform="scale(1,-1) translate(0,-900)">${paths}</g></svg>`;
}

function z(c: string) { return `<span class="z" lang="zh-CN">${c}</span>`; }
function describe(c: string, d: CharData) {
  const info = (ch: string) => d.comp[ch] || { d: '', p: '' };
  const named = (ch: string) => {
    const x = info(ch);
    return `${z(ch)}${x.d ? ` <i>${esc(x.d)}</i>` : ''}`;
  };
  const leafList = d.parts.map((part) => (isLeaf(part) ? named(part) : [...part].filter((x) => !/[⿰-⿻？]/.test(x)).map(named).join(' + '))).join(' + ');
  const et = d.et;
  const hint = et?.hint ? esc(et.hint) : '';
  if (et?.type === 'pictophonetic' && (et.semantic || et.phonetic)) {
    const out: string[] = [];
    if (et.semantic) out.push(`${named(et.semantic)} carries the <b>meaning</b>${hint ? ` (${hint})` : ''}`);
    if (et.phonetic) {
      const ph = info(et.phonetic).p;
      const strip = (x: string) => x.normalize('NFD').replace(/[̀-ͯ]/g, '');
      const same = ph && d.p.some((own) => own === ph);
      const close = ph && d.p.some((own) => strip(own) === strip(ph));
      out.push(`${z(et.phonetic)}${ph ? ` <i>${esc(ph)}</i>` : ''} gives the <b>sound</b>${same ? ' — an exact match' : close ? ' — same syllable, different tone' : ph ? ' — an older, looser sound hint' : ''}`);
    }
    return out.join('; ') + '.';
  }
  if (et?.type === 'ideographic') return `An <b>idea</b> made by combining parts${leafList ? `: ${leafList}` : ''}.${hint ? ` ${hint}.` : ''}`;
  if (et?.type === 'pictographic') return `A <b>picture</b>${hint ? ` of ${hint.replace(/^(a|an|the) /i, (m) => m.toLowerCase())}` : ''}.`;
  if (leafList) return `Built from ${leafList}.`;
  return 'A basic building block — it isn’t broken down any further.';
}

function charCard(c: string, d: CharData | null) {
  if (!d) return `<div class="char"><div class="glyph-fallback" lang="zh-CN">${c}</div><div><div class="char-top"><span class="zh">${c}</span></div><p class="none">No breakdown available.</p></div></div>`;
  const cols = partColors(d);
  const chips = d.parts.length > 1
    ? `<div class="parts">${d.parts.map((part, k) => {
        const lead = isLeaf(part) ? part : firstLeaf(part);
        const label = isLeaf(part) ? part : [...part].filter((x) => !/[⿰-⿻？]/.test(x)).join('');
        const x = d.comp[lead];
        const r = role(d, part);
        return `<span class="part" style="border-color:${cols[k]};color:${cols[k]}">${z(label)}${x?.d && isLeaf(part) ? esc(x.d) : ''}${r ? `<span class="role">${r}</span>` : ''}</span>`;
      }).join('')}</div>`
    : '';
  const rad = d.parts.includes(d.r) ? '' : d.r && d.r !== c ? `<div class="radical">radical ${z(d.r)} ${d.comp[d.r]?.d ? esc(d.comp[d.r].d) : ''}</div>` : d.r === c ? '<div class="radical">this character is itself a radical</div>' : '';
  return `<div class="char">
    ${d.s.length ? glyphSVG(d) : `<div class="glyph-fallback" lang="zh-CN">${c}</div>`}
    <div>
      <div class="char-top"><span class="zh" lang="zh-CN">${c}</span><span class="cp">${esc(d.p.join(', '))}</span>${d.et ? `<span class="etype ${d.et.type}">${d.et.type}</span>` : ''}</div>
      <div class="char-def">${esc(d.d)}</div>
      <div class="explain">${describe(c, d)}</div>
      ${chips}
      ${rad}
    </div>
  </div>`;
}

// ---------- example sentences ----------
function loadExamples(level: number) {
  if (!exCache.has(level)) exCache.set(level, fetchJSON<Record<string, Example>>(`${BASE}ex/hsk${level}.json`).catch(() => ({})));
  return exCache.get(level)!;
}

function renderExample(box: Element, word: string, ex?: Example) {
  if (!ex) {
    box.innerHTML = '<p class="none">No matching sentence in the Tatoeba corpus yet — rather than invent one, this space stays empty.</p>';
    return;
  }
  const [zh, py, en, id] = ex;
  const showPy = pref.get('showPinyin', false);
  const showEn = pref.get('showEnglish', false);
  const hl = esc(zh).split(word).join(`<mark>${word}</mark>`);
  box.innerHTML = `
    <div class="ex-body">
      <div class="ex-zh" lang="zh-CN">${hl}</div>
      <div class="ex-py" ${showPy ? '' : 'hidden'}>${esc(py)}</div>
      <div class="ex-en" ${showEn ? '' : 'hidden'}>${esc(en)}</div>
      <div class="ex-tools">
        <button class="icon-btn say-ex" title="Play sentence">${SPEAKER}</button>
        <button class="icon-btn toggle t-py" aria-pressed="${showPy}">pinyin</button>
        <button class="icon-btn toggle t-en" aria-pressed="${showEn}">english</button>
        <a class="src" href="https://tatoeba.org/en/sentences/show/${id}" target="_blank" rel="noopener">Tatoeba #${id}</a>
      </div>
    </div>`;
  box.querySelector('.say-ex')!.addEventListener('click', () => speak(zh));
  const bind = (sel: string, target: string, key: string) => {
    const btn = box.querySelector<HTMLElement>(sel)!;
    btn.addEventListener('click', () => {
      const el = box.querySelector<HTMLElement>(target)!;
      el.hidden = !el.hidden;
      btn.setAttribute('aria-pressed', String(!el.hidden));
      pref.set(key, !el.hidden);
    });
  };
  bind('.t-py', '.ex-py', 'showPinyin');
  bind('.t-en', '.ex-en', 'showEnglish');
}

// ---------- events ----------
let clickTimer = 0;
app.addEventListener('click', (ev) => {
  const t = (ev.target as HTMLElement).closest<HTMLButtonElement>('.tile');
  if (!t) return;
  const i = +t.dataset.i!;
  if (ev.detail === 0) { openDrawer(i); return; } // keyboard (Enter)
  if (ev.detail > 1) return; // part of a double-click
  clearTimeout(clickTimer);
  clickTimer = window.setTimeout(() => openDrawer(i), 220);
});
app.addEventListener('dblclick', (ev) => {
  const t = (ev.target as HTMLElement).closest<HTMLButtonElement>('.tile');
  if (!t) return;
  clearTimeout(clickTimer);
  markReviewed(+t.dataset.i!);
});

document.addEventListener('keydown', (ev) => {
  if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
  const tag = (ev.target as HTMLElement).tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  const focusedTile = (ev.target as HTMLElement).closest?.('.tile') as HTMLButtonElement | null;
  if (ev.key === ' ') {
    const i = open ? open.idx : focusedTile ? +focusedTile.dataset.i! : -1;
    if (i < 0) return;
    ev.preventDefault();
    markReviewed(i);
  } else if (!open) {
    return;
  } else if (ev.key === 'Escape') {
    const el = items[open.idx].el;
    closeDrawer();
    el.focus({ preventScroll: true });
  } else if (ev.key === 'r' || ev.key === 'R') {
    speak(items[open.idx].word[0]);
  } else if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') {
    const next = open.idx + (ev.key === 'ArrowRight' ? 1 : -1);
    if (next < 0 || next >= items.length) return;
    ev.preventDefault();
    openDrawer(next, true);
    items[next].el.focus({ preventScroll: true });
  }
});

// Re-colour when coming back to the tab (days may have passed).
document.addEventListener('visibilitychange', () => { if (!document.hidden) repaintAll(); });

// ---------- export / import ----------
const flash = (msg: string) => {
  const f = document.getElementById('flash')!;
  f.textContent = msg;
  f.style.opacity = '1';
  setTimeout(() => (f.style.opacity = '0'), 2600);
};
document.getElementById('exportBtn')!.addEventListener('click', () => {
  exportReviews(reviews);
  flash(`exported ${Object.keys(reviews).length} words`);
});
const fileInput = document.getElementById('importFile') as HTMLInputElement;
document.getElementById('importBtn')!.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async () => {
  const f = fileInput.files?.[0];
  if (!f) return;
  try {
    const n = mergeImport(reviews, await f.text());
    saveReviews(reviews);
    repaintAll();
    if (open) refreshStatus();
    flash(`imported ${n} words`);
  } catch {
    flash('that file isn’t a snerdChinese backup');
  }
  fileInput.value = '';
});

init().catch(() => { app.innerHTML = '<p class="loading">Couldn’t load the word lists. Try refreshing.</p>'; });
