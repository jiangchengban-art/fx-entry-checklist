/* S95: ⚡1分足タブのカードを5枚より増やせる（＋カードを追加・追加分は🧹で消す・空きが無ければ自動で足す） */
import { chromium } from 'playwright';
import path from 'path';

const URL = 'file:///' + path.resolve('index.html').replace(/\\/g, '/');
let pass = 0, fail = 0;
const check = (n, c) => { if (c) { pass++; console.log('OK  ', n); } else { fail++; console.log('FAIL', n); } };

const browser = await chromium.launch().catch(() =>
  chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }));
const errors = [];
const page = await (await browser.newContext({ viewport: { width: 375, height: 900 } })).newPage();
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e)));
await page.goto(URL);
await page.evaluate(() => localStorage.clear());
await page.reload();
const count = () => page.locator('#scalpSlots [data-slot]').count();
const slots = () => page.evaluate(() => JSON.parse(localStorage.getItem('mochipoyo_scalp_slots_v1') || '[]'));
const card = i => `#scalpSlots [data-slot="${i}"]`;

await page.click('.tab-btn[data-tab="scalp"]');
await page.click('#tabPanel-scalp [data-sc-pane="cards"]');
check('初期は5枚', await count() === 5);
check('＋カードを追加ボタンがある', await page.isVisible('#scalpAddCard'));

await page.click('#scalpAddCard');
check('押すと6枚', await count() === 6);
await page.click('#scalpAddCard');
check('もう一度で7枚', await count() === 7);

await page.selectOption(card(6) + ' [data-sc-pair]', 'EURUSD');
await page.click(card(6) + ' [data-sc="direction"][data-v="long"]');
await page.reload();
await page.click('.tab-btn[data-tab="scalp"]');
await page.click('#tabPanel-scalp [data-sc-pane="cards"]');
check('再読み込み後も7枚', await count() === 7);
check('7枚目の内容が残る', (await slots())[6].pair === 'EURUSD' && (await slots())[6].direction === 'long');

await page.click(card(6) + ' [data-sc-act="save"]');
const tr = await page.evaluate(() => JSON.parse(localStorage.getItem('mochipoyo_trades_v1') || '[]'));
check('追加カードからも💾で記録できる', tr.length === 1 && tr[0].pair === 'EURUSD');
check('保存後も追加カードは残る', await count() === 7);

await page.click(card(5) + ' [data-sc-act="clear"]');
check('追加カードの🧹でカードごと消える', await count() === 6);
check('後ろのカードが詰まる', (await slots())[5].pair === 'EURUSD');
await page.click(card(0) + ' [data-sc-act="clear"]');
check('元の5枚の🧹では消えない', await count() === 6);
await page.click(card(5) + ' [data-sc-act="clear"]');
check('5枚未満にはならない（6枚目を消して5枚）', await count() === 5);

// 空きが無いときの✎は自動で1枚足す
for (let i = 0; i < 5; i++) {
  await page.selectOption(card(i) + ' [data-sc-pair]', 'USDJPY');
  await page.click(card(i) + ' [data-sc="direction"][data-v="short"]');
}
await page.click('[data-scalp-edit]');
check('空きが無ければ✎で1枚足して読み込む', await count() === 6 && (await slots())[5].editId === tr[0].id);

check('375pxで横スクロールなし', await page.evaluate(() => document.documentElement.scrollWidth <= 375));
check('コンソールエラーなし', errors.length === 0);
if (errors.length) console.log(errors);
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
