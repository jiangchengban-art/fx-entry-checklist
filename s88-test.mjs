import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const filePath = 'file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/');

let browser;
try {
  browser = await chromium.launch();
} catch {
  browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
}
const page = await browser.newPage({ viewport: { width: 375, height: 800 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

await page.goto(filePath);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForSelector('#tabBar');

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('OK  ', name); }
  else { fail++; console.log('FAIL', name); }
}
const trades = () => page.evaluate(() => JSON.parse(localStorage.getItem('mochipoyo_trades_v1') || '[]'));

// 1. タブが存在し開ける
await page.click('.tab-btn[data-tab="scalp"]');
check('⚡タブが表示される', await page.isVisible('#tabPanel-scalp'));
check('日時の初期値が入っている', (await page.inputValue('#sDatetime')).length === 16);
check('空状態の表示', (await page.textContent('#scalpList')).includes('まだ記録がありません'));

// 2. 方向で形状が絞られる
await page.click('[data-scalp-single="direction"] [data-value="long"]');
check('ロングでダブルトップが隠れる', !(await page.isVisible('[data-scalp-single="shape"] [data-value="ダブルトップ"]')));
check('ロングで逆三尊は出る', await page.isVisible('[data-scalp-single="shape"] [data-value="逆三尊"]'));

// 3. 入力して保存
await page.selectOption('#sPair', 'USDJPY');
await page.click('[data-scalp-multi="rci"] [data-value="長期"]');
await page.click('[data-scalp-multi="rci"] [data-value="短期"]');
check('RCIボタンがactive表示', await page.$eval('[data-scalp-multi="rci"] [data-value="長期"]', el => el.classList.contains('active')));
await page.selectOption('#sMacd', '▲');
await page.click('[data-scalp-single="shape"] [data-value="逆三尊"]');
await page.click('[data-scalp-single="damashi"] [data-value="●"]');
await page.click('[data-scalp-single="pullback"] [data-value="✖"]');
await page.click('#scalpSubmitBtn');
let ts = await trades();
check('1件保存された', ts.length === 1);
const r = ts[0] || {};
check('kind=scalp', r.kind === 'scalp');
check('RCIは短期→長期の順', JSON.stringify(r.scalp && r.scalp.rci) === '["短期","長期"]');
check('MACD▲', r.scalp && r.scalp.macd === '▲');
check('形状・ダマシ・MA反応', r.scalp && r.scalp.shape === '逆三尊' && r.scalp.damashi === '●' && r.scalp.pullback === '✖');
check('方向ロング・ペア', r.direction === 'long' && r.pair === 'USDJPY');
check('保存後フォームがリセット', !(await page.$eval('[data-scalp-multi="rci"] [data-value="長期"]', el => el.classList.contains('active'))));
check('一覧に懸念が出る', (await page.textContent('#scalpList')).includes('RCI長期▲'));
check('サマリー件数', (await page.textContent('#scalpSummary')).includes('懸念あり 1'));

// 4. 振り返り・CSVから除外
check('📚履歴には出ない', await page.evaluate(() => mainTrades().length === 0));
await page.click('.tab-btn[data-tab="review"]');
check('📚履歴は空表示', (await page.textContent('#recordTotal')).includes('0'));

// 5. 懸念なしで2件目、方向切替で形状が消える
await page.click('.tab-btn[data-tab="scalp"]');
await page.click('[data-scalp-single="shape"] [data-value="ダブルトップ"]');
await page.click('[data-scalp-single="direction"] [data-value="long"]');
await page.click('#scalpSubmitBtn');
ts = await trades();
const r2 = ts.find(t => t.id !== r.id);
check('方向と合わない形状は自動解除', r2 && r2.scalp.shape === '');
check('懸念なし表示', (await page.textContent('#scalpList')).includes('懸念なし'));

// 6. 編集
await page.click(`[data-scalp-edit="${r.id}"]`);
check('編集で値が復元', await page.$eval('[data-scalp-multi="rci"] [data-value="長期"]', el => el.classList.contains('active')));
await page.selectOption('#sMacd', '');
await page.click('#scalpSubmitBtn');
ts = await trades();
check('編集で件数は増えない', ts.length === 2);
check('編集内容が反映', ts.find(t => t.id === r.id).scalp.macd === '');

// 7. 削除（墓標つき）
await page.click(`[data-scalp-delete="${r.id}"]`);
await page.click('#deleteConfirm');
ts = await trades();
check('削除された', ts.length === 1 && !ts.find(t => t.id === r.id));
check('墓標が立つ', await page.evaluate(id => JSON.stringify(localStorage.getItem('mochipoyo_tombstones_v1') || '').includes(id), r.id));

// 8. 横スクロールなし
check('375pxで横スクロールなし', await page.evaluate(() => document.documentElement.scrollWidth <= 375));

check('コンソールエラーなし', errors.length === 0);
if (errors.length) console.log(errors);

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
