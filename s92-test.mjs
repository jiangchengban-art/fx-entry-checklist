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
check('初回は👀監視リストの画面', await page.isVisible('#scalpWatch') && !(await page.isVisible('#scalpSlots')));
check('切替ボタンが2つ', await page.locator('#scalpSeg [data-sc-pane]').count() === 2);
await page.click('#tabPanel-scalp [data-sc-pane="cards"]');
check('⚡記録に切り替わる', await page.isVisible('#scalpSlots') && !(await page.isVisible('#scalpWatch')));
check('切替ボタンのactive', await page.$eval('#tabPanel-scalp [data-sc-pane="cards"]', el => el.classList.contains('active')));
// 横スワイプ（右へ＝前の画面へ）
const swipe = (x0, x1, y0 = 400, y1 = 400) => page.evaluate(([x0, x1, y0, y1]) => {
  const el = document.querySelector('#tabPanel-scalp .sc-pane.active .card');
  const mk = (x, y) => new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
  el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [mk(x0, y0)], changedTouches: [mk(x0, y0)] }));
  el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [], changedTouches: [mk(x1, y1)] }));
}, [x0, x1, y0, y1]);
await swipe(80, 300);
check('右スワイプで👀監視リストへ', await page.isVisible('#scalpWatch'));
await swipe(300, 80);
check('左スワイプで⚡記録へ', await page.isVisible('#scalpSlots'));
await swipe(300, 240, 400, 700);
check('縦スクロール気味の動きでは切り替わらない', await page.isVisible('#scalpSlots'));
await page.reload();
await page.click('.tab-btn[data-tab="scalp"]');
check('最後に見ていた画面を覚えている', await page.isVisible('#scalpSlots'));
await page.click('#tabPanel-scalp [data-sc-pane="watch"]');
check('空状態の表示', (await page.textContent('#scalpWatch')).includes('まだありません'));
await page.selectOption('#scalpWatchAdd', 'USDJPY');
await page.selectOption('#scalpWatchAdd', 'GOLD');
let w = await watch();
check('2通貨追加', w.length === 2 && w.map(t => t.pair).join() === 'USDJPY,GOLD');
check('追加済みの通貨は候補から消える', await page.locator('#scalpWatchAdd option[value="USDJPY"]').count() === 0);
check('追加直後は揃いにならない（未選択）', await page.locator(`${row('USDJPY')} .sw-ok`).count() === 0);

// 2. ✅成立 → ✖不成立 → 未選択
const tap = k => page.click(`${row('USDJPY')} [data-sw-ng="${k}"]`);
await tap('granville'); await tap('rci'); await tap('macd');
let u = (await watch()).find(t => t.pair === 'USDJPY');
check('1タップで✅成立として保存', u.ok.granville && u.ok.rci && u.ok.macd && !u.ng.rci);
check('ボタンに✅が付く', (await page.textContent(`${row('USDJPY')} [data-sw-ng="rci"]`)) === 'RCI✅');
check('3つとも✅で揃い', await page.locator(`${row('USDJPY')} .sw-ok`).count() === 1);
check('件数表示（揃い 1）', (await page.textContent('#scalpWatchCount')).includes('2 通貨（揃い 1）'));
await tap('rci'); await tap('macd');
u = (await watch()).find(t => t.pair === 'USDJPY');
check('2タップ目で✖不成立', u.ng.rci === true && u.ng.macd === true && !u.ok.rci && u.ng.granville === false);
check('ボタンに✖が付く', (await page.textContent(`${row('USDJPY')} [data-sw-ng="rci"]`)) === 'RCI✖');
check('不成立があると揃いが消える', await page.locator(`${row('USDJPY')} .sw-ok`).count() === 0);
check('件数表示（揃い 0）', (await page.textContent('#scalpWatchCount')).includes('2 通貨（揃い 0）'));
await tap('rci');
u = (await watch()).find(t => t.pair === 'USDJPY');
check('3タップ目で未選択に戻る', u.ng.rci === false && !u.ok.rci);
check('未選択は記号なし', (await page.textContent(`${row('USDJPY')} [data-sw-ng="rci"]`)) === 'RCI');

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
check('→カードで⚡記録の画面に切り替わる', await page.isVisible('#scalpSlots'));
check('切替ボタンに監視数', (await page.textContent('#scalpSegWatchN')) === '2');
await page.click('#tabPanel-scalp [data-sc-pane="watch"]');

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
await page.click('#tabPanel-scalp [data-sc-pane="watch"]');
check('再読み込み後も残る', await page.locator('#scalpWatch [data-sw]').count() === 1);
check('375pxで横スクロールなし', await page.evaluate(() => document.documentElement.scrollWidth <= 375));
await page.click(`${row('USDJPY')} [data-sw-ng="rci"]`);
await page.click(`${row('USDJPY')} [data-sw-ng="macd"]`);
await page.click(`${row('USDJPY')} [data-sw-ng="macd"]`);
check('3つとも✅で揃い表示', await page.locator(`${row('USDJPY')} .sw-ok`).count() === 1);
check('1行目（通貨＋3条件）が1行に収まる', await page.$$eval('#scalpWatch [data-sw] .trend-head > :not(.spacer)',
  els => { const c = els.map(e => { const r = e.getBoundingClientRect(); return (r.top + r.bottom) / 2; }); return Math.max(...c) - Math.min(...c) < 8; }));

check('コンソールエラーなし', errors.length === 0);
if (errors.length) console.log(errors);

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
