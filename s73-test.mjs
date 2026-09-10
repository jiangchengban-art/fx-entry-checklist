import { chromium } from 'playwright';
import path from 'path';

const FILE = 'file://' + path.resolve('C:/Users/owner/fx-entry-checklist/index.html');
let pass = 0, fail = 0;
const ok = (n, c) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n); };

const browser = await chromium.launch().catch(() => chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }));
const page = await browser.newPage();
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

const now = Date.now();
const seed = {
  pairs: [
    { id: 'w1', pair: 'USDJPY', alerts: {
        h1: { on: true, at: new Date(now - 3 * 3600e3 - 15 * 60e3).toISOString(), chAt: new Date().toISOString() },
        h4: { on: true, at: new Date(now - 50 * 3600e3).toISOString(), chAt: new Date().toISOString() },
        d:  { on: false, at: '', chAt: new Date().toISOString() },
      }, trend: {}, trendAt: new Date(now - 2 * 3600e3).toISOString() },
    { id: 'w2', pair: 'EURUSD', alerts: {}, trend: {}, trendAt: new Date(now - 2 * 3600e3).toISOString() },
  ],
  judgeLog: [], snapshots: [],
};
await page.addInitScript(s => {
  localStorage.setItem('mochipoyo_market_view_v1', JSON.stringify(s));
}, seed);
await page.goto(FILE);
await page.waitForTimeout(600);

const chips = page.locator('[data-trend-item="w1"] .trend-head .fresh.alert');
ok('ONの足の数だけチップが出る（2件）', await chips.count() === 2);
const t1 = (await chips.nth(0).innerText()).replace(/\s/g, '');
const t2 = (await chips.nth(1).innerText()).replace(/\s/g, '');
ok('1H は 3h15m と出る（実際: ' + t1 + '）', t1 === '1H3h15m');
ok('4H は 2d2h と出る（実際: ' + t2 + '）', t2 === '4H2d2h');
ok('OFFの足は出ない', !(t1 + t2).includes('D'));
ok('title に発生日時が入る', (await chips.nth(0).getAttribute('title')).includes('からの経過時間'));

const w2 = page.locator('[data-trend-item="w2"] .trend-head .fresh');
ok('アラート無しは従来の鮮度チップに落ちる', await w2.count() === 1 &&
   !(await w2.first().getAttribute('class')).includes('alert'));

ok('GOボタンの直後に並ぶ', await page.locator('[data-trend-item="w1"] .go-btn + .fresh.alert').count() === 1);
ok('バッジ下の発生日時表示は残っている', await page.locator('[data-trend-item="w1"] .mv-alert-times .item').count() === 2);
ok('コンソールエラーなし: ' + errs.join(' | '), errs.length === 0);

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
