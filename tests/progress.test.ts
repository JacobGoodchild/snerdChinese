import { describe, expect, it } from 'vitest';
import { decayColor, mergeImport, ago } from '../src/progress';

const hsl = (s: string) => s.match(/hsl\(([\d.]+), ([\d.]+)%, ([\d.]+)%\)/)!.slice(1).map(Number);

describe('decayColor', () => {
  it('starts at soft sage green', () => expect(hsl(decayColor(0))).toEqual([138, 42, 88]));
  it('reaches warm amber around day 12', () => expect(hsl(decayColor(12))).toEqual([42, 65, 88]));
  it('settles on muted terracotta from day 28 on', () => {
    expect(hsl(decayColor(28))).toEqual([10, 55, 88]);
    expect(hsl(decayColor(400))).toEqual([10, 55, 88]);
  });
  it('moves smoothly and only ever warms up (hue never goes back)', () => {
    let prev = 138;
    for (let d = 0; d <= 30; d += 0.25) {
      const [h, , l] = hsl(decayColor(d));
      expect(h).toBeLessThanOrEqual(prev);
      expect(prev - h).toBeLessThan(6); // no sudden jumps
      expect(l).toBe(88);
      prev = h;
    }
  });
});

describe('mergeImport', () => {
  it('keeps the newest review per word', () => {
    const cur = { 爱: 100, 好: 500 };
    const n = mergeImport(cur, JSON.stringify({ app: 'snerdChinese', reviews: { 爱: 300, 好: 200, 你: 50 } }));
    expect(n).toBe(3);
    expect(cur).toEqual({ 爱: 300, 好: 500, 你: 50 });
  });
  it('accepts a bare map and ignores junk values', () => {
    const cur: Record<string, number> = {};
    mergeImport(cur, JSON.stringify({ 我: 10, bad: 'x', worse: null }));
    expect(cur).toEqual({ 我: 10 });
  });
  it('rejects files that are not backups', () => {
    expect(() => mergeImport({}, '"hello"')).toThrow();
    expect(() => mergeImport({}, 'not json')).toThrow();
  });
});

describe('ago', () => {
  it('reads naturally', () => {
    expect(ago(Date.now())).toBe('reviewed today');
    expect(ago(Date.now() - 86_400_000 * 1.2)).toBe('reviewed yesterday');
    expect(ago(Date.now() - 86_400_000 * 9.5)).toBe('reviewed 9 days ago');
  });
});
