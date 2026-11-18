// Review timestamps in localStorage + the slow sage → amber → terracotta decay colour.

const KEY = 'snerdChinese.reviews.v1';
const DAY = 86_400_000;

export type Reviews = Record<string, number>; // word -> lastReviewed (ms epoch)

function safeGet(k: string): string | null {
  try { return localStorage.getItem(k); } catch { return null; }
}
function safeSet(k: string, v: string) {
  try { localStorage.setItem(k, v); } catch { /* storage unavailable: progress lives in memory only */ }
}

export function loadReviews(): Reviews {
  try {
    const v = JSON.parse(safeGet(KEY) || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}
export function saveReviews(r: Reviews) { safeSet(KEY, JSON.stringify(r)); }

export const pref = {
  get: (k: string, d: boolean) => { const v = safeGet('snerdChinese.' + k); return v === null ? d : v === '1'; },
  set: (k: string, v: boolean) => safeSet('snerdChinese.' + k, v ? '1' : '0'),
};

// Colour stops: [day, hue, saturation]. Lightness stays at 88% so nothing looks harsh.
const STOPS: [number, number, number][] = [
  [0, 138, 42],   // soft sage
  [12, 42, 65],   // warm amber
  [28, 10, 55],   // muted terracotta
];
const smooth = (t: number) => t * t * (3 - 2 * t);

export function daysSince(ts: number, now = Date.now()) { return Math.max(0, (now - ts) / DAY); }

export function decayColor(days: number): string {
  if (days >= STOPS[STOPS.length - 1][0]) {
    const [, h, s] = STOPS[STOPS.length - 1];
    return `hsl(${h}, ${s}%, 88%)`;
  }
  for (let i = 0; i < STOPS.length - 1; i++) {
    const [d0, h0, s0] = STOPS[i];
    const [d1, h1, s1] = STOPS[i + 1];
    if (days <= d1) {
      const t = smooth((days - d0) / (d1 - d0));
      return `hsl(${(h0 + (h1 - h0) * t).toFixed(1)}, ${(s0 + (s1 - s0) * t).toFixed(1)}%, 88%)`;
    }
  }
  return `hsl(${STOPS[0][1]}, ${STOPS[0][2]}%, 88%)`;
}

export function ago(ts: number): string {
  const d = Math.floor(daysSince(ts));
  if (d === 0) return 'reviewed today';
  if (d === 1) return 'reviewed yesterday';
  return `reviewed ${d} days ago`;
}

export function exportReviews(r: Reviews) {
  const blob = new Blob(
    [JSON.stringify({ app: 'snerdChinese', version: 1, exportedAt: new Date().toISOString(), reviews: r }, null, 1)],
    { type: 'application/json' },
  );
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `snerdChinese-progress-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Merges an imported backup, keeping the most recent review for each word. Returns words merged. */
export function mergeImport(current: Reviews, text: string): number {
  const data = JSON.parse(text);
  const incoming = data && typeof data === 'object' && data.reviews ? data.reviews : data;
  if (!incoming || typeof incoming !== 'object') throw new Error('not a snerdChinese backup');
  let n = 0;
  for (const [w, ts] of Object.entries(incoming)) {
    if (typeof ts !== 'number' || !isFinite(ts)) continue;
    if (!current[w] || ts > current[w]) current[w] = ts;
    n++;
  }
  return n;
}
