// Sanity checks on the generated data in public/data.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const dir = new URL('../public/data/', import.meta.url);
const read = (f: string) => JSON.parse(fs.readFileSync(new URL(f, dir), 'utf8'));

describe('generated data', () => {
  const levels = [1, 2, 3, 4, 5, 6, 7].map((l) => read(`hsk${l}.json`) as [string, string, string][]);
  it('has every HSK 3.0 level with roughly the official word counts', () => {
    // Official HSK 3.0 (2021): 500, 772, 973, 1000, 1071, 1140, 5636 new words per level.
    const official = [500, 772, 973, 1000, 1071, 1140, 5636];
    levels.forEach((l, k) => expect(Math.abs(l.length - official[k]) / official[k]).toBeLessThan(0.05));
  });
  it('has pinyin and English for every word, and no duplicates', () => {
    const seen = new Set<string>();
    for (const w of levels.flat()) {
      expect(w[1]).toBeTruthy();
      expect(w[2]).toBeTruthy();
      expect(seen.has(w[0])).toBe(false);
      seen.add(w[0]);
    }
  });
  it('has a character file for every character used', () => {
    const missing = new Set<string>();
    for (const w of levels.flat()) for (const c of w[0]) {
      if (!fs.existsSync(new URL(`chars/${c.codePointAt(0)!.toString(16)}.json`, dir))) missing.add(c);
    }
    expect([...missing]).toEqual([]);
  });
  it('only uses example sentences that actually contain the word', () => {
    for (const l of [1, 2, 3, 4, 5, 6, 7]) {
      const ex = read(`ex/hsk${l}.json`) as Record<string, [string, string, string, number][]>;
      for (const [w, list] of Object.entries(ex)) for (const s of list) {
        expect(s[0].includes(w)).toBe(true);
        expect(s[2].length).toBeGreaterThan(0);
        expect(Number.isInteger(s[3])).toBe(true);
      }
    }
  });
  it('gives nearly every HSK 1 word an example sentence', () => {
    const ex = read('ex/hsk1.json');
    expect(Object.keys(ex).length / levels[0].length).toBeGreaterThan(0.97);
  });
});
