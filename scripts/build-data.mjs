// Builds the static JSON data the app loads, from three open-source datasets:
//   - drkameleon/complete-hsk-vocabulary  (HSK 2.0 "old" levels 1–6 word lists)
//   - skishore/makemeahanzi               (character decompositions, etymology, stroke SVGs)
//   - Tatoeba (CC-BY 2.0 FR)              (real Chinese→English example sentences)
//
// Run with:  npm run data
// Raw downloads are cached in .cache/ (git-ignored). Output goes to public/data/.

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { pinyin } from 'pinyin-pro';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const CACHE = path.join(ROOT, '.cache');
const OUT = path.join(ROOT, 'public', 'data');
const TATOEBA = 'https://downloads.tatoeba.org/exports/per_language';

const SOURCES = {
  'hsk.json': 'https://raw.githubusercontent.com/drkameleon/complete-hsk-vocabulary/main/complete.json',
  'dictionary.txt': 'https://raw.githubusercontent.com/skishore/makemeahanzi/master/dictionary.txt',
  'graphics.txt': 'https://raw.githubusercontent.com/skishore/makemeahanzi/master/graphics.txt',
  'cmn.tsv.bz2': `${TATOEBA}/cmn/cmn_sentences.tsv.bz2`,
  'eng.tsv.bz2': `${TATOEBA}/eng/eng_sentences.tsv.bz2`,
  'cmn-eng.tsv.bz2': `${TATOEBA}/cmn/cmn-eng_links.tsv.bz2`,
};

fs.mkdirSync(CACHE, { recursive: true });
for (const [file, url] of Object.entries(SOURCES)) {
  const dest = path.join(CACHE, file);
  if (!fs.existsSync(dest)) {
    console.log(`downloading ${url}`);
    execSync(`curl -sSfL -o "${dest}" "${url}"`, { stdio: 'inherit' });
  }
  if (file.endsWith('.bz2') && !fs.existsSync(dest.slice(0, -4))) {
    execSync(`bunzip2 -kf "${dest}"`);
  }
}
const read = (f) => fs.readFileSync(path.join(CACHE, f), 'utf8');
const lines = (f) => read(f).split('\n').filter(Boolean);

// ---------- 1. HSK words ----------
const LEVELS = [1, 2, 3, 4, 5, 6];
const raw = JSON.parse(read('hsk.json'));
const isVariant = (m) => /^(old |unofficial |archaic |)variant of|^see |^abbr\. for/i.test(m);

const words = []; // {s, level, p, e, alt}
for (const w of raw) {
  const old = w.level.filter((l) => l.startsWith('old-')).map((l) => +l.slice(4));
  if (!old.length) continue;
  const level = Math.min(...old);
  const [main, ...rest] = w.forms;
  const p = main.transcriptions.pinyin.replace(/\s+/g, '');
  const meanings = main.meanings.filter((m) => !isVariant(m));
  const e = (meanings.length ? meanings : main.meanings).slice(0, 3).join('; ');
  // One alternative reading, if it's a genuinely different pronunciation with a real meaning
  let alt;
  for (const f of rest) {
    const fp = f.transcriptions.pinyin.replace(/\s+/g, '');
    const fm = f.meanings.filter((m) => !isVariant(m));
    if (fp.toLowerCase() !== p.toLowerCase() && fm.length && !/taxi/i.test(fm[0])) {
      alt = [fp, fm.slice(0, 2).join('; ')];
      break;
    }
  }
  words.push({ s: w.simplified, level, freq: w.frequency, p, e, alt });
}
words.sort((a, b) => a.level - b.level || a.freq - b.freq);
const wordSet = new Set(words.map((w) => w.s));

// Level at which each character is first met
const charLevel = new Map();
for (const w of words) for (const c of w.s) if (!charLevel.has(c)) charLevel.set(c, w.level);

// ---------- 2. Example sentences (Tatoeba) ----------
const PUNCT = '，。！？、：；“”‘’（）《》…—·「」 ';
const zh = new Map();
for (const l of lines('cmn.tsv')) {
  const [id, , text] = l.split('\t');
  const t = text.trim();
  const han = [...t].filter((c) => !PUNCT.includes(c));
  if (han.length < 4 || han.length > 22) continue;
  // Keep only sentences written entirely in HSK 1–6 characters. This filters out
  // traditional-script sentences and keeps the examples at a learnable level.
  if (!han.every((c) => charLevel.has(c))) continue;
  zh.set(id, { t, len: han.length, max: Math.max(...han.map((c) => charLevel.get(c))) });
}
const zhToEn = new Map();
for (const l of lines('cmn-eng.tsv')) {
  const [a, b] = l.split('\t');
  if (zh.has(a) && !zhToEn.has(a)) zhToEn.set(a, b);
}
const needEn = new Set(zhToEn.values());
const en = new Map();
for (const l of lines('eng.tsv')) {
  const i = l.indexOf('\t');
  const id = l.slice(0, i);
  if (needEn.has(id)) en.set(id, l.slice(l.indexOf('\t', i + 1) + 1).trim());
}
const sentences = [...zh.entries()]
  .filter(([id]) => en.has(zhToEn.get(id)))
  .map(([id, v]) => ({ id: +id, ...v, en: en.get(zhToEn.get(id)) }))
  .sort((a, b) => a.id - b.id);
console.log(`usable Tatoeba sentence pairs: ${sentences.length}`);

// Index sentences by character for fast lookup
const byChar = new Map();
sentences.forEach((s, i) => {
  for (const c of new Set(s.t)) {
    if (!byChar.has(c)) byChar.set(c, []);
    byChar.get(c).push(i);
  }
});
// Longer HSK words containing each word (so 天 doesn't just match inside 明天)
const longer = new Map();
for (const W of wordSet) {
  for (let i = 0; i < W.length; i++)
    for (let j = i + 1; j <= W.length; j++) {
      const sub = W.slice(i, j);
      if (sub !== W && wordSet.has(sub)) {
        if (!longer.has(sub)) longer.set(sub, []);
        longer.get(sub).push([W, i]);
      }
    }
}
const cleanHit = (text, w) => {
  for (let i = text.indexOf(w); i !== -1; i = text.indexOf(w, i + 1)) {
    const inside = (longer.get(w) || []).some(([W, off]) => text.startsWith(W, i - off) && i - off >= 0);
    if (!inside) return true;
  }
  return false;
};

const sentPinyin = (t) =>
  pinyin(t, { toneType: 'symbol' })
    .replace(/\s*([，。！？、：；）》」…—])\s*/g, (_, p) => ({ '，': ', ', '。': '. ', '！': '! ', '？': '? ', '、': ', ', '：': ': ', '；': '; ', '）': ') ', '》': '" ', '」': '" ', '…': '… ', '—': ' — ' })[p])
    .replace(/\s*([（《「“”‘’])\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const examples = Object.fromEntries(LEVELS.map((l) => [l, {}]));
let found = 0;
for (const w of words) {
  const pool = byChar.get(w.s[0]) || [];
  let best, bestScore = Infinity;
  for (const i of pool) {
    const s = sentences[i];
    if (!s.t.includes(w.s)) continue;
    let score = 10 * Math.max(0, s.max - w.level) + 0.35 * Math.abs(s.len - 11);
    if (!cleanHit(s.t, w.s)) score += 12;
    if (score < bestScore) { bestScore = score; best = s; }
  }
  if (best) {
    found++;
    examples[w.level][w.s] = [best.t, sentPinyin(best.t), best.en, best.id];
  }
}
console.log(`example sentences found for ${found}/${words.length} words`);

// ---------- 3. Characters (Make Me a Hanzi) ----------
const dict = new Map(lines('dictionary.txt').map((l) => { const o = JSON.parse(l); return [o.character, o]; }));
const graphics = new Map(lines('graphics.txt').map((l) => { const o = JSON.parse(l); return [o.character, o]; }));

const ARITY = { '⿰': 2, '⿱': 2, '⿲': 3, '⿳': 3, '⿴': 2, '⿵': 2, '⿶': 2, '⿷': 2, '⿸': 2, '⿹': 2, '⿺': 2, '⿻': 2 };
// Split an IDS string into its top-level parts: "⿰氵⿱一月" -> ["氵", "⿱一月"]
function topParts(ids) {
  const chars = [...ids];
  if (!ARITY[chars[0]]) return [];
  let i = 1;
  const take = () => {
    const start = i;
    const walk = () => { const c = chars[i++]; if (ARITY[c]) for (let k = 0; k < ARITY[c]; k++) walk(); };
    walk();
    return chars.slice(start, i).join('');
  };
  const parts = [];
  for (let k = 0; k < ARITY[chars[0]]; k++) parts.push(take());
  return parts;
}
const leaves = (ids) => [...ids].filter((c) => !ARITY[c] && c !== '？');
const brief = (c) => {
  const d = dict.get(c);
  return d ? { d: (d.definition || '').split(/[;,]/)[0].trim(), p: d.pinyin?.[0] || '' } : { d: '', p: '' };
};

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'chars'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'ex'), { recursive: true });

let charCount = 0;
for (const c of charLevel.keys()) {
  const d = dict.get(c);
  if (!d) continue;
  const g = graphics.get(c);
  const parts = topParts(d.decomposition || '');
  const comp = {};
  for (const l of new Set([...leaves(d.decomposition || ''), d.radical])) if (l && l !== c) comp[l] = brief(l);
  const out = {
    c,
    d: d.definition || '',
    p: d.pinyin || [],
    r: d.radical,
    dc: d.decomposition,
    parts,
    et: d.etymology || null,
    comp,
    s: g ? g.strokes : [],
    m: d.matches.map((m) => (m ? m[0] : null)),
  };
  fs.writeFileSync(path.join(OUT, 'chars', `${c.codePointAt(0).toString(16)}.json`), JSON.stringify(out));
  charCount++;
}

for (const l of LEVELS) {
  const list = words.filter((w) => w.level === l).map((w) => (w.alt ? [w.s, w.p, w.e, w.alt] : [w.s, w.p, w.e]));
  fs.writeFileSync(path.join(OUT, `hsk${l}.json`), JSON.stringify(list));
  fs.writeFileSync(path.join(OUT, 'ex', `hsk${l}.json`), JSON.stringify(examples[l]));
  console.log(`HSK ${l}: ${list.length} words, ${Object.keys(examples[l]).length} examples`);
}
console.log(`wrote ${charCount} character files`);
