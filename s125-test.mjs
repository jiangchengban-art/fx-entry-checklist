/* S125: 🧭目線タブ（週足・日足・8H(・4H) の目線 → 入った（きっかけ・損切りの根拠・ATR倍率）→ 結果 → 🔬分析） */
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

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('OK  ', name); }
  else { fail++; console.log('FAIL', name); }
}
const toast = () => page.textContent('#toast').catch(() => '');
const trades = () => page.evaluate(() => loadTrades());
const bias = async () => (await trades()).filter(t => t.kind === 'bias');
const ago = ms => new Date(Date.now() - ms).toISOString();
const c4 = () => ({ granville: false, rci: false, macd: false, neck: false });

await page.goto(filePath);
await page.evaluate(([w1, w2, w3, zones]) => {
  localStorage.clear();
  localStorage.setItem('mochipoyo_trades_v1', JSON.stringify([w1, w2, w3]));
  localStorage.setItem('mochipoyo_zones_cache_v1', JSON.stringify(zones));
  localStorage.setItem('mochipoyo_active_tab', 'bias');
}, [
  { id: 'w1', kind: 'trendwatch', cls: 'day', tf: '4H', pair: 'EURUSD', ng: c4(), mid: c4(), ok: c4(), notes: '',
    alerts: { '4H': ago(20 * 60e3) }, alertSide: { '4H': 'long' }, alertPrice: { '4H': 1.0912 }, createdAt: ago(3600e3), updatedAt: ago(3600e3) },
  { id: 'w2', kind: 'scalpwatch', tf: '1H', pair: 'USDJPY', ng: c4(), mid: c4(), ok: c4(), notes: '',
    alerts: { '1H': ago(5 * 60e3) }, alertSide: { '1H': 'short' }, createdAt: ago(3600e3), updatedAt: ago(3600e3) },
  /* 日足のアラートは🧭の候補に出さない */
  { id: 'w3', kind: 'trendwatch', cls: 'swing', tf: 'D', pair: 'GBPUSD', ng: c4(), mid: c4(), ok: c4(), notes: '',
    alerts: { D: ago(5 * 60e3) }, alertSide: { D: 'short' }, createdAt: ago(3600e3), updatedAt: ago(3600e3) },
  { generatedAt: new Date().toISOString(), pairs: { EURUSD: { price: 1.0912, nearUnit: 0.0010, tfs: {} } } },
]);
await page.reload();
await page.waitForSelector('#tabBar');

/* ---- タブ ---- */
check('🧭目線タブがある・開いている', await page.isVisible('#tabPanel-bias.active'));
check('下部タブは5つ', (await page.$$('#tabBar .tab-btn')).length === 5);
check('375pxで横にはみ出さない', await page.evaluate(() => document.documentElement.scrollWidth <= 375));

/* ---- 鳴っているアラートから検討カード ---- */
const rows = await page.$$eval('#bsAlerts .bs-arow', els => els.map(e => e.textContent));
check('4H・1Hのアラートだけ候補に出る', rows.length === 2 && rows.some(r => r.includes('EURUSD')) && rows.some(r => r.includes('USDJPY')) && !rows.some(r => r.includes('GBPUSD')));
await page.click('#bsAlerts .bs-arow:has-text("EURUSD") [data-bs-from]');
let b = await bias();
check('＋検討でカードができる（方向・時間足・アラート時刻）', b.length === 1 && b[0].pair === 'EURUSD' && b[0].tf === '4H' && b[0].side === 'long' && b[0].status === 'watch' && !!b[0].alertAt);
check('作ったアラートは候補から消える', (await page.$$('#bsAlerts .bs-arow')).length === 1);
const card = '#bsWatch [data-bs]';
check('4Hアラートのカードは 週足・日足・8H の3行', (await page.$$(card + ' .bs-row')).length === 3);

/* ---- 目線 ---- */
await page.click(card + ' [data-bs-tf="W"] [data-bs-dir="up"]');
await page.click(card + ' [data-bs-tf="W"] [data-bs-ev="line"]');
await page.click(card + ' [data-bs-tf="D"] [data-bs-dir="up"]');
await page.click(card + ' [data-bs-tf="D"] [data-bs-ev="hidden"]');
b = await bias();
check('足ごとの向きと根拠が保存される', b[0].bias.W.dir === 'up' && b[0].bias.W.ev.includes('line') && b[0].bias.D.ev.includes('hidden'));
check('すべて順なら ✅そろい', (await page.textContent(card + ' .bs-sum')).includes('そろい'));
await page.click(card + ' [data-bs-tf="8H"] [data-bs-dir="down"]');
await page.click(card + ' [data-bs-tf="8H"] [data-bs-ev="div"]');
const sum = await page.textContent(card + ' .bs-sum');
check('食い違うと ⚠ばらつき と重み（▲5：▼1.5）', sum.includes('ばらつき') && sum.includes('▲5') && sum.includes('▼1.5'));
check('逆向きの行に印', await page.isVisible(card + ' .bs-row.opp[data-bs-tf="8H"]'));
await page.click(card + ' [data-bs-follow="W"]');
b = await bias();
check('従う足が保存される', b[0].follow === 'W');
check('目線のそろい方＝上位足に従った', await page.evaluate(id => biasAlign(loadTrades().find(t => t.id === id)), b[0].id) === 'ばらつき・上位足に従った');
await page.click(card + ' [data-bs-tf="W"] [data-bs-dir="up"]');   // 解除
b = await bias();
check('もう一度で向きを解除', !b[0].bias.W.dir);
await page.click(card + ' [data-bs-tf="W"] [data-bs-dir="up"]');
await page.click(card + ' [data-bs-room="clear"]');
await page.click(card + ' [data-bs-ccy="ok"]');
b = await bias();
check('2:1まで・通貨の強弱', b[0].room === 'clear' && b[0].ccy === 'ok');
check('目線の表を入れても375pxではみ出さない', await page.evaluate(() => document.documentElement.scrollWidth <= 375));

/* ---- 入った ---- */
await page.click(card + ' [data-bs-in-open]');
check('入った欄が開く（方向はアラートから）', await page.isVisible(card + ' .bs-entry') && await page.isVisible(card + ' [data-bs-pick-dir="long"].on'));
await page.fill(card + ' [data-bs-in="entry"]', '1.0912');
await page.fill(card + ' [data-bs-in="stop"]', '1.0905');
const pv = await page.textContent(card + ' [data-bs-preview]');
check('損切り幅を1H ATR倍率で出し、浅いと⚠', pv.includes('ATR×0.7') && pv.includes('浅いかも') && pv.includes('2:1 1.0926'));
await page.click(card + ' [data-bs-go]');
check('きっかけが無いとエラー', (await toast()).includes('きっかけ'));
await page.click(card + ' [data-bs-pick-trigger="a15"]');
await page.click(card + ' [data-bs-pick-basis="1H高安"]');
await page.fill(card + ' [data-bs-in="stop"]', '1.0922');
await page.click(card + ' [data-bs-go]');
check('損切りが方向と逆ならエラー', (await toast()).includes('方向'));
await page.fill(card + ' [data-bs-in="stop"]', '1.0897');
await page.click(card + ' [data-bs-go]');
b = await bias();
check('入った → 保有中（価格・きっかけ・根拠・ATR倍率）', b[0].status === 'open' && b[0].entryPrice === 1.0912 && b[0].stopPrice === 1.0897 &&
  b[0].tp2Price === 1.0942 && b[0].tp4Price === 1.0972 && b[0].trigger === 'a15' && b[0].stopBasis === '1H高安' && b[0].stopAtr === 1.5 && b[0].direction === 'long');
check('保有中の画面に切り替わる', await page.isVisible('#bsPaneOpen') && (await page.$$('#bsOpen [data-bs]')).length === 1);
check('📚・CSV（mainTrades）には混ざらない', await page.evaluate(() => !mainTrades().some(t => t.kind === 'bias')));
check('📒の保有中にも出ない', (await page.$$('#posOpen [data-pos]')).length === 0);
check('タブに保有中の件数', (await page.textContent('.tab-btn[data-tab="bias"] .tab-badge')) === '1');

/* ---- 前回の目線の引き継ぎ ---- */
await page.click('[data-bs-pane="watch"]');
await page.selectOption('#bsAddTf', '1H');
await page.selectOption('#bsAdd', 'EURUSD');
b = await bias();
const n2 = b.find(t => t.status === 'watch');
check('手で追加（1H）', !!n2 && n2.tf === '1H' && n2.side === '');
check('週足・日足は前回から引き継ぐ（8Hは引き継がない）', n2.bias.W && n2.bias.W.dir === 'up' && n2.bias.W.prev && n2.bias.D.dir === 'up' && !n2.bias['8H']);
check('1Hアラートのカードは4H行も出る', (await page.$$(card + ' .bs-row')).length === 4 && (await page.isVisible(card + ' .bs-prev')));
await page.click(card + ' [data-bs-skip]');
b = await bias();
check('見送り → 済み', b.find(t => t.id === n2.id).status === 'skip');

/* ---- 結果 ---- */
await page.click('[data-bs-pane="open"]');
await page.click('#bsOpen [data-bs-res="stop"]');
b = await bias();
const done = b.find(t => t.status === 'closed');
check('✖損切 → 決済済み・−1R', !!done && done.resultTag === 'stoploss' && await page.evaluate(id => tradeR(loadTrades().find(t => t.id === id)), done.id) === -1);
await page.click('[data-bs-pane="done"]');
check('済みに 決済1・見送り1', (await page.$$('#bsDone [data-bs]')).length === 2);
await page.click('#bsDone [data-bs-loss="上位足と逆"]');
b = await bias();
check('負けた理由', b.find(t => t.id === done.id).lossReason === '上位足と逆');
await page.click('#bsDoneTabs [data-bs-df="skip"]');
check('見送りで絞り込み', (await page.$$('#bsDone [data-bs]')).length === 1);
await page.click('#bsDone [data-bs-reopen]');
b = await bias();
check('見送りを↩で検討中に戻す', b.find(t => t.id === n2.id).status === 'watch');

/* ---- 🔬分析 ---- */
await page.click('[data-bs-pane="stats"]');
const st = await page.textContent('#bsStats');
check('分析に全体・目線のそろい方・根拠ごと', st.includes('全体') && st.includes('目線のそろい方') && st.includes('根拠ごと') && st.includes('週足：ライン反発'));
check('足ごとの向き（8Hが逆）', st.includes('8Hが逆'));

/* ---- 同期で他端末から来ても描ける・削除 ---- */
await page.click('[data-bs-pane="watch"]');
await page.click(card + ' [data-bs-del]');
b = await bias();
check('検討中の🗑は確認なしで消える（墓標つき）', !b.some(t => t.id === n2.id) && await page.evaluate(id => JSON.stringify(JSON.parse(localStorage.getItem('mochipoyo_tombstones_v1') || '{}')).includes(id), n2.id));

check('ページエラーなし', errors.length === 0);
if (errors.length) console.log(errors);
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
