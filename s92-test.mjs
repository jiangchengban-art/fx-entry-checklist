/* S92: 👀 監視リスト（⚡1分足タブ最上部。1時間足の不成立チェック・メモ・同期） */
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
const page = await browser.newPage({ viewport: { width: 375, height: 900 } });
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
const watch = async () => (await trades()).filter(t => t.kind === 'scalpwatch');
const row = pair => `#scalpWatch [data-sw]:has(.sw-pair:text-is("${pair}"))`;

// 1. 表示と追加
await page.click('.tab-btn[data-tab="scalp"]');
check('監視リストが⚡タブの最上部にある', await page.evaluate(() =>
  document.querySelector('#tabPanel-scalp > section:first-child #scalpWatch') !== null));
check('空状態の表示', (await page.textContent('#scalpWatch')).includes('まだありません'));
await page.selectOption('#scalpWatchAdd', 'USDJPY');
await page.selectOption('#scalpWatchAdd', 'GOLD');
let w = await watch();
check('2通貨追加', w.length === 2 && w.map(t => t.pair).join() === 'USDJPY,GOLD');
check('追加済みの通貨は候補から消える', await page.locator('#scalpWatchAdd option[value="USDJPY"]').count() === 0);
check('追加直後は✅揃い', await page.locator(`${row('USDJPY')} .sw-ok`).count() === 1);

// 2. 不成立チェック
await page.click(`${row('USDJPY')} [data-sw-ng="rci"]`);
await page.click(`${row('USDJPY')} [data-sw-ng="macd"]`);
w = await watch();
const u = w.find(t => t.pair === 'USDJPY');
check('RCI・MACDが不成立として保存', u.ng.rci === true && u.ng.macd === true && u.ng.granville === false);
check('ボタンに✖が付く', (await page.textContent(`${row('USDJPY')} [data-sw-ng="rci"]`)) === 'RCI✖');
check('不成立があると✅揃いが消える', await page.locator(`${row('USDJPY')} .sw-ok`).count() === 0);
check('件数表示（揃い 1）', (await page.textContent('#scalpWatchCount')).includes('2 通貨（揃い 1）'));
await page.click(`${row('USDJPY')} [data-sw-ng="rci"]`);
check('再タップで解除', (await watch()).find(t => t.pair === 'USDJPY').ng.rci === false);

// 3. メモ（入力が止まってから保存）
await page.fill(`${row('GOLD')} [data-sw-note]`, 'NY時間に注目');
await page.waitForTimeout(800);
check('メモが保存される', (await watch()).find(t => t.pair === 'GOLD').notes === 'NY時間に注目');

// 4. 入力中に再描画が来てもフォーカスと文字が残る
await page.click(`${row('GOLD')} [data-sw-note]`);
await page.keyboard.type('！');
await page.evaluate(() => renderAll());
check('入力中は描き直さない', await page.evaluate(() => document.activeElement && document.activeElement.matches('[data-sw-note]')));
await page.click('#tabPanel-scalp h2');
await page.waitForTimeout(100);
check('離れたら保存', (await watch()).find(t => t.pair === 'GOLD').notes === 'NY時間に注目！');

// 5. →カード
await page.click(`${row('USDJPY')} [data-sw-card]`);
const slot = await page.evaluate(() => scalpSlots.find(s => s.pair === 'USDJPY'));
check('→カードで通貨とMACD懸念が空きカードへ', slot && slot.macd === '✖' && slot.rci.length === 0);

// 6. 振り返り・CSV・スキャル記録一覧には出ない
check('mainTrades から除外', await page.evaluate(() => mainTrades().length === 0));
check('スキャル記録一覧には出ない', (await page.textContent('#scalpList')).includes('まだ記録がありません'));

// 7. 端末間マージ：新しい方が勝つ／墓標で消える
const merged = await page.evaluate(() => {
  const local = localDoc();
  const u = local.trades.find(t => t.pair === 'USDJPY');
  const older = Object.assign({}, u, { ng: { granville: true, rci: true, macd: true }, updatedAt: '2000-01-01T00:00:00Z' });
  const other = { id: 'sw_remote', kind: 'scalpwatch', pair: 'EURUSD', ng: { granville: false, rci: false, macd: true },
                  notes: '他端末', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  const r = mergeDoc(local, { trades: [older, other], market: {} }, { trades: {}, pairs: {} }).merged;
  const mu = r.trades.find(t => t.id === u.id);
  return { localWins: mu.ng.granville === false, remoteAdded: !!r.trades.find(t => t.id === 'sw_remote') };
});
check('同期：手元の新しい方が勝つ', merged.localWins);
check('同期：他端末の追加が入る', merged.remoteAdded);

// 8. 🗑 削除（墓標つき・他端末からの復活を防ぐ）
const gid = (await watch()).find(t => t.pair === 'GOLD').id;
await page.click(`${row('GOLD')} [data-sw-del]`);
check('🗑で即削除', !(await watch()).find(t => t.id === gid));
check('墓標が立つ', await page.evaluate(id => (localStorage.getItem('mochipoyo_tombstones_v1') || '').includes(id), gid));
const revived = await page.evaluate(id => {
  const old = { id, kind: 'scalpwatch', pair: 'GOLD', ng: {}, notes: '', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' };
  return mergeDoc(localDoc(), { trades: [old], market: {} }, loadTombstones()).merged.trades.some(t => t.id === id);
}, gid);
check('削除したものは同期で復活しない', !revived);
check('削除した通貨は候補に戻る', await page.locator('#scalpWatchAdd option[value="GOLD"]').count() === 1);

// 9. 再読み込み後も残る・375pxに収まる
await page.reload();
await page.click('.tab-btn[data-tab="scalp"]');
check('再読み込み後も残る', await page.locator('#scalpWatch [data-sw]').count() === 1);
check('375pxで横スクロールなし', await page.evaluate(() => document.documentElement.scrollWidth <= 375));
check('1行目（通貨＋3条件）が1行に収まる', await page.$$eval('#scalpWatch [data-sw] .trend-head > :not(.spacer)',
  els => { const c = els.map(e => { const r = e.getBoundingClientRect(); return (r.top + r.bottom) / 2; }); return Math.max(...c) - Math.min(...c) < 8; }));

check('コンソールエラーなし', errors.length === 0);
if (errors.length) console.log(errors);

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
