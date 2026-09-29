/* S96: ⚡1分足タブ「✏️ 入力中のみ」で入力途中のカードだけ表示する */
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
const shown = () => page.$$eval('#scalpSlots [data-slot]', els => els.map(e => Number(e.dataset.slot)));
const card = i => `#scalpSlots [data-slot="${i}"]`;
const open = async () => { await page.click('.tab-btn[data-tab="scalp"]'); await page.click('#tabPanel-scalp [data-sc-pane="cards"]'); };

await open();
check('初期は5枚すべて表示', (await shown()).length === 5);
check('件数表示', (await page.textContent('#scalpActiveCount')).includes('入力中 0 / 5'));

await page.selectOption(card(1) + ' [data-sc-pair]', 'USDJPY');
await page.click(card(1) + ' [data-sc="direction"][data-v="long"]');
await page.selectOption(card(3) + ' [data-sc-pair]', 'EURUSD');   // 通貨だけ＝空扱い
check('件数が1に', (await page.textContent('#scalpActiveCount')).includes('入力中 1 / 5'));

await page.click('#scalpActiveOnly');
check('ボタンがONになる', await page.$eval('#scalpActiveOnly', el => el.classList.contains('on')));
check('入力中のカードだけ表示', JSON.stringify(await shown()) === '[1]');

// 触っている最中に空へ戻しても消えない
await page.click(card(1) + ' [data-sc="direction"][data-v="long"]');
check('操作中のカードは空に戻っても残る', JSON.stringify(await shown()) === '[1]');
await page.click(card(1) + ' [data-sc="direction"][data-v="short"]');

// 設定は再読み込み後も残る
await page.reload();
await open();
check('再読み込み後もON', await page.$eval('#scalpActiveOnly', el => el.classList.contains('on')));
check('再読み込み後も絞り込み', JSON.stringify(await shown()) === '[1]');

// 追加したカードは空でも出る
await page.click('#scalpAddCard');
check('＋カードを追加は空でも表示', JSON.stringify(await shown()) === '[1,5]');
await page.selectOption(card(5) + ' [data-sc-pair]', 'GBPUSD');
await page.click(card(5) + ' [data-sc="direction"][data-v="long"]');

// 💾で空になったカードは隠れる
await page.click(card(1) + ' [data-sc-act="save"]');
check('💾後に空になったカードは隠れる', JSON.stringify(await shown()) === '[5]');

// 追加カードの🧹で消えても番号がずれない
await page.click('#scalpAddCard');
await page.click(card(5) + ' [data-sc-act="clear"]');
check('追加カード削除後、残りの追加カードは表示', JSON.stringify(await shown()) === '[5]');
await page.click(card(5) + ' [data-sc-act="clear"]');
check('すべて空なら案内を表示', (await shown()).length === 0 && (await page.textContent('#scalpSlots')).includes('入力中のカードはありません'));

// ✎は隠れたカードに読み込んでも表示される
await page.click('[data-scalp-edit]');
check('✎で読み込んだカードは表示される', (await shown()).length === 1);

await page.click('#scalpActiveOnly');
check('OFFで全カード表示', (await shown()).length === 5);

check('375pxで横スクロールなし', await page.evaluate(() => document.documentElement.scrollWidth <= 375));
check('コンソールエラーなし', errors.length === 0);
if (errors.length) console.log(errors);
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
