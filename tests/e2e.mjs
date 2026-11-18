// End-to-end check in a real browser. Run after `npm run build`:
//   npm run test:e2e
// Needs Playwright with Chromium available (npx playwright install chromium).
import { preview } from 'vite';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const server = await preview({ preview: { port: 4179, strictPort: true } });
const url = 'http://localhost:4179/snerdChinese/';
const browser = await chromium.launch();
const errors = [];
const step = (name) => console.log('  ✓', name);

try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  await page.waitForSelector('.tile');
  assert.ok((await page.locator('.tile').count()) > 4950);
  step('renders all HSK 1–6 words');

  // Seed reviews at different ages and check the colour decay.
  await page.evaluate(() => {
    const D = 864e5, n = Date.now();
    localStorage.setItem('snerdChinese.reviews.v1', JSON.stringify({ 了: n, 是: n - 12 * D, 他: n - 30 * D }));
  });
  await page.reload();
  await page.waitForSelector('.tile');
  const bg = (w) => page.locator('#hsk1 .tile', { hasText: new RegExp(`^${w}$`) }).first().evaluate((e) => getComputedStyle(e).backgroundColor);
  assert.equal(await bg('了'), 'rgb(212, 237, 219)'); // sage
  assert.equal(await bg('是'), 'rgb(244, 232, 205)'); // amber
  assert.equal(await bg('他'), 'rgb(241, 213, 208)'); // terracotta
  assert.equal(await bg('的'), 'rgb(253, 252, 249)'); // untouched
  step('colours fade sage → amber → terracotta');

  // Single click opens a drawer directly under the clicked row.
  const tile = page.locator('.tile[data-i="20"]');
  await tile.click();
  await page.waitForSelector('.drawer.show .char svg.glyph');
  const placement = await page.evaluate(() => {
    const d = document.querySelector('.drawer');
    const t = document.querySelector('.tile[data-i="20"]');
    return { prevTop: d.previousElementSibling.offsetTop, tileTop: t.offsetTop, nextTop: d.nextElementSibling.offsetTop };
  });
  assert.equal(placement.prevTop, placement.tileTop);
  assert.ok(placement.nextTop > placement.tileTop + 200);
  step('drawer opens under the clicked row and pushes the rest down');

  await page.keyboard.press('Space');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('snerdChinese.reviews.v1')));
  const word = await tile.textContent();
  assert.ok(Date.now() - saved[word] < 10_000);
  step('space marks the open word reviewed');

  await tile.click();
  await page.waitForTimeout(600);
  assert.equal(await page.locator('.drawer').count(), 0);
  step('clicking the same word again closes the drawer');

  await page.locator('.tile[data-i="6"]').dblclick();
  await page.waitForTimeout(400);
  assert.equal(await page.locator('.drawer').count(), 0, 'double-click should not open the drawer');
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('snerdChinese.reviews.v1')));
  assert.ok(after[await page.locator('.tile[data-i="6"]').textContent()]);
  step('double-click marks a word without opening it');

  await page.reload();
  await page.waitForSelector('.tile');
  assert.match(await page.locator('#totalCount').textContent(), /^5 \//);
  step('progress survives a reload');

  await page.keyboard.press('/');
  await page.keyboard.type('xinqing');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.drawer.show .family');
  assert.equal(await page.locator('.big').textContent(), '心情');
  step('search by pinyin opens the word');

  await page.locator('.char[data-c="情"] button.part[data-sub="青"]').click();
  await page.waitForSelector('.char.nested');
  step('component breakdown expands');

  await page.waitForSelector('.ex-zh');
  assert.ok((await page.locator('.ex-zh').textContent()).includes('心情'));
  await page.keyboard.press('e');
  assert.ok(await page.locator('.ex-en').isVisible());
  step('example sentence with English toggle');

  const mobile = await browser.newPage({ viewport: { width: 375, height: 800 } });
  await mobile.goto(url);
  await mobile.waitForSelector('.tile');
  await mobile.locator('.tile[data-i="5"]').click();
  await mobile.waitForSelector('.drawer.show .char svg.glyph');
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth), 375);
  step('no sideways scrolling on a phone');

  assert.deepEqual(errors, []);
  console.log('all end-to-end checks passed');
} finally {
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}
