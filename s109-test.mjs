/* S109: 👀監視 → 入った → 📒記録（スキャ／デイ／スイングの種類分け・価格から損切り/3:1/4:1を計算） */
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
const toast = () => page.textContent('#toast').catch(() => '');
const trades = () => page.evaluate(() => loadTrades());

/* ---- 計算（純関数） ---- */
const rr = o => page.evaluate(o => rrCalc(o), o);
let c = await rr({ entry: '1.0912', stop: '1.0902' });
check('買い：損切りから 2:1/3:1/4:1', c.dir === 'long' && c.tp2 === 1.0932 && c.tp3 === 1.0942 && c.tp4 === 1.0952 && c.stop === 1.0902);
c = await rr({ entry: '2650.5', tp2: '2640.5' });
check('売り：2:1の価格から損切り/3:1/4:1', c.dir === 'short' && c.stop === 2655.5 && c.tp3 === 2635.5 && c.tp4 === 2630.5);
c = await rr({ entry: '157.250', tp2: '157.650' });
check('小数桁は入力に合わせる（買い・円）', c.dir === 'long' && c.stop === 157.05 && c.tp3 === 157.85 && c.tp4 === 158.05 && c.dec === 3);
c = await rr({ entry: '1.0912', stop: '1.0902', tp2: '1.0800' });
check('2:1が損切りと反対側ならエラー', !!c.error);
c = await rr({ entry: '1.0912', stop: '1.0902', tp2: '1.0950' });
check('2:1が損切り幅の2倍と合わないとエラー', !!c.error);
c = await rr({ entry: '1.0912', stop: '1.0902', tp2: '1.0933' });
check('2:1が損切り幅の2倍に近ければ損切り基準で計算', !c.error && c.tp2 === 1.0932);
c = await rr({ entry: '1.0912' });
check('損切りも2:1も無ければエラー', !!c.error);

/* ---- 種類分け ---- */
const ago = ms => new Date(Date.now() - ms).toISOString();
const c4 = (o = {}) => Object.assign({ granville: false, rci: false, macd: false, neck: false }, o);
const mk = (id, kind, pair, extra) => Object.assign({
  id, kind, pair, ng: c4(), mid: c4(), ok: c4(), notes: '', createdAt: ago(3600e3), updatedAt: ago(3600e3),
}, extra);
await page.evaluate(([a, b, c, d, e]) => {
  saveTrades([a, b, c, d, e]);
}, [
  mk('w1', 'scalpwatch', 'EURUSD', { alerts: { '1H': ago(10 * 60e3) }, alertSide: { '1H': 'long' }, alertPrice: { '1H': 1.0912 } }),
  mk('w2', 'trendwatch', 'USDJPY', { cls: 'day', alerts: { '4H': ago(30 * 60e3) }, alertSide: { '4H': 'short' } }),
  mk('w3', 'trendwatch', 'GOLD', { alerts: { D: ago(2 * 3600e3) }, alertSide: { D: 'short' } }),
  mk('w4', 'scalpwatch', 'GBPUSD', { alerts: { '1H': ago(5 * 3600e3) } }),                    // 期限切れ（4時間）→ 消える
  mk('w5', 'scalpwatch', 'NZDUSD', { alerts: { '1H': ago(5 * 3600e3) }, notes: '残す' }),       // 期限切れでもメモ有り → 残る
]);
await page.reload();
await page.waitForSelector('#tabBar');
check('下部タブは4つ（監視/記録/振り返り/設定）', await page.locator('#tabBar .tab-btn').count() === 4
  && await page.locator('#tabBar .tab-btn[data-tab="watch"]').count() === 1 && await page.locator('#tabBar .tab-btn[data-tab="record"]').count() === 1);
check('既定は👀監視', await page.$eval('#tabPanel-watch', el => el.classList.contains('active')));
const pairs = () => page.$$eval('#swList [data-sw] .sw-pair', els => els.map(e => e.textContent));
check('期限切れ（メモ無し）は自動で消え、メモ有りは残る', (await pairs()).sort().join() === 'EURUSD,GOLD,NZDUSD,USDJPY');
const clsOf = pair => page.textContent(`#swList [data-sw]:has(.sw-pair:text-is("${pair}")) .sw-cls`);
check('1H＝スキャ', (await clsOf('EURUSD')).includes('スキャ'));
check('4H＝デイ', (await clsOf('USDJPY')).includes('デイ'));
check('日足（cls無しの旧データ）＝スイング', (await clsOf('GOLD')).includes('スイング'));
check('並びはアラートの新しい順', (await pairs())[0] === 'EURUSD');
check('種類タブ：すべて4／スキャ2／デイ1／スイング1',
  (await page.textContent('#swTabs')).replace(/\s/g, '') === 'すべて4⚡スキャ2☀️デイ1🌙スイング1');
await page.click('#swTabs [data-sw-cls="swing"]');
check('スイングで絞り込み', (await pairs()).join() === 'GOLD');
await page.click('#swTabs [data-sw-cls="all"]');
check('👀タブのバッジに件数', (await page.textContent('.tab-btn[data-tab="watch"] .tab-badge')) === '4');

/* ---- 条件のタップ ---- */
const row = pair => `#swList [data-sw]:has(.sw-pair:text-is("${pair}"))`;
await page.click(`${row('EURUSD')} [data-sw-ng="granville"]`);
check('条件タップで ✅', (await page.textContent(`${row('EURUSD')} [data-sw-ng="granville"]`)).includes('✅'));

/* ---- 見送り ---- */
await page.click(`${row('USDJPY')} [data-sw-skip]`);
check('見送りでカードが消える', !(await pairs()).includes('USDJPY'));
let ts = await trades();
const skip = ts.find(t => t.kind === 'watchlog' && t.outcome === 'skip');
check('見送りの記録（種類・アラート・条件つき）', !!skip && skip.cls === 'day' && skip.alert.tf === '4H' && skip.alert.side === 'short' && skip.cond.granville === '');
check('見送りは📚の対象外（mainTrades）', await page.evaluate(() => mainTrades().every(t => t.kind !== 'watchlog')));

/* ---- 入った（スキャ・損切り価格あり） ---- */
await page.click(`${row('EURUSD')} [data-sw-in-open]`);
check('入ったでパネルが開く', await page.locator(`${row('EURUSD')} .sw-entry`).count() === 1);
const tfBtns = await page.$$eval(`${row('EURUSD')} [data-sw-pick="tf"]`, els => els.map(e => e.textContent));
check('スキャのエントリー足は 1分足・5分足', tfBtns.join() === '1分足,5分足');
check('方向はアラートから自動（▲買）', await page.$eval(`${row('EURUSD')} [data-sw-pick="dir"][data-v="long"]`, el => el.classList.contains('on')));
await page.click(`${row('EURUSD')} [data-sw-go]`);
check('価格が無いと記録できない', (await trades()).every(t => t.status == null));
await page.click(`${row('EURUSD')} [data-sw-pick="tf"][data-v="5分足"]`);
await page.fill(`${row('EURUSD')} [data-sw-in="entry"]`, '1.0912');
await page.fill(`${row('EURUSD')} [data-sw-in="stop"]`, '1.0902');
await page.click(`${row('EURUSD')} [data-sw-pick="order"][data-v="指値"]`);
await page.click(`${row('EURUSD')} [data-sw-pick="fibo"][data-v="61%"]`);
await page.click(`${row('EURUSD')} [data-sw-go]`);
ts = await trades();
const p1 = ts.find(t => t.pair === 'EURUSD' && t.status);
check('記録が作られ、カードは消える', !!p1 && !(await pairs()).includes('EURUSD'));
check('種類=スキャ・エントリー足=5分足・上位足=1時間足', p1.cls === 'scalp' && p1.tfEntry === '5分足' && p1.tfHigher === '1時間足' && p1.entryPattern === '5分足×1時間足');
check('価格：入1.0912 損切1.0902 2:1=1.0932 3:1=1.0942 4:1=1.0952', p1.entryPrice === 1.0912 && p1.stopPrice === 1.0902 && p1.tp2Price === 1.0932 && p1.tp3Price === 1.0942 && p1.tp4Price === 1.0952);
check('指値・Fibo61%・方向long・区分は既定（検証）', p1.mvChecks.entry.entryOrderType === '指値' && p1.mvChecks.entry.entryFibo === '61%' && p1.direction === 'long' && p1.tradeType === 'demo');
check('アラート情報と条件を控える', p1.alertSide === 'long' && p1.alertPrice === 1.0912 && p1.cond.granville === 'ok' && !!p1.alertAt);
check('📒タブのバッジ=1', (await page.textContent('.tab-btn[data-tab="record"] .tab-badge')) === '1');

/* ---- 入った（スイング・損切りなし→結果で2:1の価格） ---- */
await page.click(`${row('GOLD')} [data-sw-in-open]`);
const tfG = await page.$$eval(`${row('GOLD')} [data-sw-pick="tf"]`, els => els.map(e => e.textContent));
check('スイングのエントリー足は 15分足・1時間足', tfG.join() === '15分足,1時間足');
await page.fill(`${row('GOLD')} [data-sw-in="entry"]`, '2650.5');
await page.click(`${row('GOLD')} [data-sw-go]`);
ts = await trades();
const p2 = ts.find(t => t.pair === 'GOLD' && t.status);
check('スイング記録（損切り無し）', !!p2 && p2.cls === 'swing' && p2.tfHigher === '日足' && p2.stopPrice == null && p2.direction === 'short');

await page.click('.tab-btn[data-tab="record"]');
check('保有中は2件', await page.locator('#posOpen [data-pos]').count() === 2);
const gold = `#posOpen [data-pos]:has(.sw-pair:text-is("GOLD"))`;
check('損切り無しは2:1の価格欄が出る', await page.locator(`${gold} [data-pos-tp2]`).count() === 1);
// 方向と合わない価格 → エラー
await page.fill(`${gold} [data-pos-tp2]`, '2660.5');
await page.click(`${gold} [data-pos-res="tp2"]`);
check('売りなのに2:1が上ならエラー（記録は開いたまま）', (await toast()).includes('方向') && await page.locator(gold).count() === 1);
await page.fill(`${gold} [data-pos-tp2]`, '2640.5');
await page.click(`${gold} [data-pos-res="tp2"]`);
ts = await trades();
const g2 = ts.find(t => t.id === p2.id);
check('2:1利確：損切り2655.5・3:1=2635.5・4:1=2630.5', g2.status === 'closed' && g2.resultTag === 'reg' && g2.stopPrice === 2655.5 && g2.tp2Price === 2640.5 && g2.tp3Price === 2635.5 && g2.tp4Price === 2630.5);
check('自動判定待ち（autoFill=pending）', g2.autoFill === 'pending');
check('保有中は1件・決済済みに入る', await page.locator('#posOpen [data-pos]').count() === 1 && await page.locator('#posClosed [data-pos]').count() === 1);
const closedGold = `#posClosed [data-pos]:has(.sw-pair:text-is("GOLD"))`;
check('決済済みに価格（3:1/4:1）が出る', (await page.textContent(closedGold)).includes('2635.5') && (await page.textContent(closedGold)).includes('2630.5'));
await page.click(`${closedGold} [data-pos-tag="big"]`);
check('REG→BIGに手で直せる', (await trades()).find(t => t.id === p2.id).resultTag === 'big');
await page.click(`${closedGold} [data-pos-reopen]`);
check('↩で保有中に戻る', (await trades()).find(t => t.id === p2.id).status === 'open' && await page.locator('#posOpen [data-pos]').count() === 2);

// 損切りが入っているスキャ記録は価格欄なしで2:1利確
const eur = `#posOpen [data-pos]:has(.sw-pair:text-is("EURUSD"))`;
check('損切り有りは2:1の価格欄が出ない', await page.locator(`${eur} [data-pos-tp2]`).count() === 0);
await page.click(`${eur} [data-pos-res="tp2"]`);
check('損切り有りは押すだけで2:1利確', (await trades()).find(t => t.id === p1.id).resultTag === 'reg');

// 損切・建値
await page.click(`${gold} [data-pos-res="stop"]`);
check('損切の記録', (await trades()).find(t => t.id === p2.id).resultTag === 'stoploss');

/* ---- 📚 ---- */
await page.click('.tab-btn[data-tab="review"]');
check('📚の履歴に新しい記録が出る（種類バッジ・価格）', (await page.textContent('#recordList')).includes('スキャ') && (await page.textContent('#recordList')).includes('1.0952'));
await page.click('#reviewClsFilter [data-cls="swing"]');
check('📚を種類で絞れる（スイング）', await page.locator('#recordList .record-card').count() === 1 && (await page.textContent('#recordList')).includes('GOLD'));
await page.click('#reviewClsFilter [data-cls="all"]');
check('📚の区分フィルタ（検証/リアル）は健在', await page.$eval('#reviewTypeFilter [data-type="all"]', el => el.classList.contains('active')));

/* ---- 編集しても新しい項目が消えない ---- */
await page.evaluate(id => loadTradeIntoForm(loadTrades().find(t => t.id === id)), p1.id);
await page.click('#formSubmitBtn');
const p1b = (await trades()).find(t => t.id === p1.id);
check('✎編集で保存しても cls・価格が残る', p1b.cls === 'scalp' && p1b.tp4Price === 1.0952 && p1b.stopPrice === 1.0902 && p1b.status === 'closed');

/* ---- 設定：既定の区分 ---- */
await page.click('.tab-btn[data-tab="settings"]');
await page.click('#defTypeSel [data-deftype="real"]');
check('既定の区分をリアルに', await page.evaluate(() => defaultTradeType()) === 'real');

/* ---- CSV ---- */
check('CSV列に 種類・価格 が入っている', await page.evaluate(() => ['cls', 'entryPrice', 'stopPrice', 'tp2Price', 'tp3Price', 'tp4Price'].every(h => CSV_HEADERS.includes(h))));

check('JSエラーなし', errors.length === 0);
if (errors.length) console.log(errors.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
