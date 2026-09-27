/* S88/S89: ⚡1分足スキャルタブ（5枚のコンパクトカードでタップ記録） */
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
const card = i => `#scalpSlots [data-slot="${i}"]`;
const tap = (i, sel) => page.click(`${card(i)} ${sel}`);
const isOn = (i, sel) => page.$eval(`${card(i)} ${sel}`, el => el.classList.contains('on'));

// 1. タブとカード5枚
await page.click('.tab-btn[data-tab="scalp"]');
check('⚡タブが表示される', await page.isVisible('#tabPanel-scalp'));
check('カードが5枚', await page.locator('#scalpSlots [data-slot]').count() === 5);
check('空状態の表示', (await page.textContent('#scalpList')).includes('まだ記録がありません'));
check('初期は懸念なし表示', (await page.textContent(card(0))).includes('懸念なし'));

// 2. 通貨未選択では保存できない
await tap(0, '[data-sc-act="save"]');
check('通貨未選択は保存されない', (await trades()).length === 0);

// 3. カード0：USDJPY ロング、RCI長期・短期、MACD▲、逆三尊、🐋●、〽✖
await page.selectOption(`${card(0)} [data-sc-pair]`, 'USDJPY');
await tap(0, '[data-sc="direction"][data-v="long"]');
check('ロングでW天が隠れる', await page.locator(`${card(0)} [data-sc="shape"][data-v="ダブルトップ"]`).count() === 0);
check('ロングで逆三尊は出る', await page.locator(`${card(0)} [data-sc="shape"][data-v="逆三尊"]`).count() === 1);
await tap(0, '[data-sc="rci"][data-v="長期"]');
await tap(0, '[data-sc="rci"][data-v="短期"]');
check('RCIがon表示', await isOn(0, '[data-sc="rci"][data-v="長期"]'));
check('懸念ありで「懸念なし」が消える', !(await page.textContent(card(0))).includes('懸念なし'));
await page.selectOption(`${card(0)} [data-sc-macd]`, '▲');
await tap(0, '[data-sc="shape"][data-v="逆三尊"]');
await tap(0, '[data-sc="damashi"][data-v="●"]');
await tap(0, '[data-sc="pullback"][data-v="✖"]');
await tap(0, '[data-sc-act="note"]');
await page.fill(`${card(0)} [data-sc-note]`, 'テストメモ');

// 4. カード1 を並行して入力（カード0の状態は保たれる）
await page.selectOption(`${card(1)} [data-sc-pair]`, 'GOLD');
await tap(1, '[data-sc="direction"][data-v="short"]');
await tap(1, '[data-sc="shape"][data-v="三尊"]');
check('カード1入力中もカード0の状態が残る', await isOn(0, '[data-sc="shape"][data-v="逆三尊"]'));

// 5. 再読み込みしても入力途中が残る
await page.reload();
await page.click('.tab-btn[data-tab="scalp"]');
check('再読み込み後もカード0が残る', await isOn(0, '[data-sc="damashi"][data-v="●"]'));
check('再読み込み後もメモが残る', (await page.inputValue(`${card(0)} [data-sc-note]`)) === 'テストメモ');

// 6. カード0 を保存
await tap(0, '[data-sc-act="save"]');
let ts = await trades();
check('1件保存された', ts.length === 1);
const r = ts[0] || {};
check('kind=scalp・1H×1M', r.kind === 'scalp' && r.tfHigher === '1時間足' && r.tfEntry === '1分足');
check('RCIは短期→長期の順', JSON.stringify(r.scalp && r.scalp.rci) === '["短期","長期"]');
check('MACD▲', r.scalp && r.scalp.macd === '▲');
check('形状・🐋・〽', r.scalp && r.scalp.shape === '逆三尊' && r.scalp.damashi === '●' && r.scalp.pullback === '✖');
check('方向・ペア・メモ', r.direction === 'long' && r.pair === 'USDJPY' && r.notes === 'テストメモ');
check('日時は保存時刻', Math.abs(Date.parse(r.datetime) - Date.now()) < 60000);
check('保存後カード0は通貨だけ残して空', await page.$eval(`${card(0)} [data-sc-pair]`, el => el.value === 'USDJPY') &&
  !(await isOn(0, '[data-sc="rci"][data-v="長期"]')));
check('保存してもカード1はそのまま', await isOn(1, '[data-sc="shape"][data-v="三尊"]'));
check('一覧に懸念が出る', (await page.textContent('#scalpList')).includes('RCI長期▲'));
check('サマリー件数', (await page.textContent('#scalpSummary')).includes('懸念あり 1'));

// 7. 方向を変えると合わない形状は自動解除
await tap(1, '[data-sc="direction"][data-v="long"]');
check('向きに合わない形状は解除', await page.locator(`${card(1)} [data-sc="shape"].on`).count() === 0);
await tap(1, '[data-sc-act="save"]');
check('カード1も保存', (await trades()).length === 2);

// 8. 振り返りから除外
check('📚履歴・統計には出ない', await page.evaluate(() => mainTrades().length === 0));

// 9. 編集：空きカードに読み込み→更新
await page.click(`[data-scalp-edit="${r.id}"]`);
const editSlot = await page.$eval('#scalpSlots .sc-card.editing', el => el.dataset.slot);
check('編集は空きカード（先頭の空き＝0）に読み込まれる', editSlot === '0');
check('編集で値が復元', await isOn(editSlot, '[data-sc="rci"][data-v="長期"]'));
await page.selectOption(`${card(editSlot)} [data-sc-macd]`, '');
await tap(editSlot, '[data-sc-act="save"]');
ts = await trades();
check('編集で件数は増えない', ts.length === 2);
const r1 = ts.find(t => t.id === r.id);
check('編集内容が反映・日時は据え置き', r1.scalp.macd === '' && r1.datetime === r.datetime);
check('編集後のカードは編集中でない', await page.locator('#scalpSlots .sc-card.editing').count() === 0);

// 10. 🧹でカードを空に
await tap(2, '[data-sc="damashi"][data-v="●"]');
await tap(2, '[data-sc-act="clear"]');
check('🧹で空になる', !(await isOn(2, '[data-sc="damashi"][data-v="●"]')));

// 11. 削除（墓標つき）
await page.click(`[data-scalp-delete="${r.id}"]`);
await page.click('#deleteConfirm');
ts = await trades();
check('削除された', ts.length === 1 && !ts.find(t => t.id === r.id));
check('墓標が立つ', await page.evaluate(id => (localStorage.getItem('mochipoyo_tombstones_v1') || '').includes(id), r.id));

// 12. 375px で収まる
check('375pxで横スクロールなし', await page.evaluate(() => document.documentElement.scrollWidth <= 375));
await tap(3, '[data-sc="direction"][data-v="long"]');
const h = await page.$eval(card(3), el => el.getBoundingClientRect().height);
check('方向選択後のカードは3段でコンパクト（130px以下）: ' + Math.round(h), h <= 130);

check('コンソールエラーなし', errors.length === 0);
if (errors.length) console.log(errors);

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
