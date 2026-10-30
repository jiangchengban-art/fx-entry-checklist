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
  mk('w4', 'scalpwatch', 'GBPUSD', { alerts: { '1H': ago(7 * 3600e3) } }),                    // 期限切れ（6時間）→ 消える
  mk('w5', 'scalpwatch', 'NZDUSD', { alerts: { '1H': ago(7 * 3600e3) }, notes: '残す' }),       // 期限切れでもメモ有り → 残る
]);
await page.reload();
await page.waitForSelector('#tabBar');
check('下部タブは5つ（監視/目線/記録/振り返り/設定。S125で🧭目線を追加）', await page.locator('#tabBar .tab-btn').count() === 5
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
check('見送りで欄が開く（まだ消えない）', (await pairs()).includes('USDJPY') && await page.locator(`${row('USDJPY')} [data-sw-skip-go="plain"]`).count() === 1);
await page.click(`${row('USDJPY')} [data-sw-skip-go="plain"]`);
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

/* ---- S110: ⏳形成待ち・🗑削除 ---- */
await page.click('.tab-btn[data-tab="watch"]');
await page.evaluate(([a, b, c]) => { saveTrades(loadTrades().concat([a, b, c])); watchBoard.render(); }, [
  mk('x1', 'trendwatch', 'AUDJPY', { cls: 'swing', alerts: { W: ago(100 * 3600e3) }, alertSide: { W: 'long' }, wait: true }),   // 72時間を過ぎても待ちなら残る
  mk('x2', 'trendwatch', 'CADJPY', { cls: 'swing', alerts: { W: ago(10 * 3600e3) }, alertSide: { W: 'long' } }),
  mk('x3', 'scalpwatch', 'CHFJPY', { alerts: { '1H': ago(10 * 60e3) }, alertSide: { '1H': 'short' } }),
]);
check('⏳形成待ちのカードは期限を過ぎても消えない', (await pairs()).includes('AUDJPY'));
check('形成待ちの印が出る', await page.locator(row('AUDJPY') + ' .sw-wait-badge').count() === 1);
check('週足のエントリー足は 1時間足・4時間足', await (async () => { await page.click(`${row('CADJPY')} [data-sw-in-open]`);
  const v = await page.$$eval(`${row('CADJPY')} [data-sw-pick="tf"]`, els => els.map(e => e.textContent)); await page.click(`${row('CADJPY')} [data-sw-cancel]`); return v.join() === '1時間足,4時間足'; })());
await page.click(`${row('CADJPY')} [data-sw-wait]`);
check('⏳待ちをタップで wait=true・印が付く', (await trades()).find(t => t.id === 'x2').wait === true && await page.locator(row('CADJPY') + ' .sw-wait-badge').count() === 1);
await page.click(`${row('CADJPY')} [data-sw-wait]`);
check('もう一度で解除', (await trades()).find(t => t.id === 'x2').wait === false && await page.locator(row('CADJPY') + ' .sw-wait-badge').count() === 0);
const logsBefore = (await trades()).filter(t => t.kind === 'watchlog' && t.outcome === 'skip').length;
await page.click(`${row('CHFJPY')} [data-sw-del]`);
check('🗑でカードが消える', !(await pairs()).includes('CHFJPY') && !(await trades()).some(t => t.id === 'x3'));
check('🗑は見送りの記録を作らない（S121: 台帳用の deleted だけ残る）', (await trades()).filter(t => t.kind === 'watchlog' && t.outcome === 'skip').length === logsBefore &&
  (await trades()).filter(t => t.kind === 'watchlog' && t.outcome === 'deleted').length <= 1);
check('🗑は墓標を残す（他端末から復活しない）', await page.evaluate(() => !!(JSON.parse(localStorage.getItem('mochipoyo_tombstones_v1') || '{}').trades || {}).x3));
check('ボタンを足しても 375px で横にはみ出さない', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth &&
  [...document.querySelectorAll('#swList .trend-tf')].every(r => r.scrollWidth <= r.clientWidth + 1)));

/* ---- S111: 📌ピン止め ---- */
await page.evaluate(([a, b]) => { saveTrades(loadTrades().filter(t => !['x1', 'x2'].includes(t.id)).concat([a, b])); watchBoard.render(); }, [
  mk('p1', 'scalpwatch', 'EURGBP', { alerts: { '1H': ago(3 * 3600e3) }, ng: c4({ macd: true }) }),     // ✖あり＝ふつうは一番下
  mk('p2', 'scalpwatch', 'EURAUD', { alerts: { '1H': ago(10 * 3600e3) }, pin: true }),                 // 4時間を過ぎてもピンなら残る
]);
check('📌のカードは期限を過ぎても消えない', (await pairs()).includes('EURAUD'));
check('📌のカードが一番上', (await pairs())[0] === 'EURAUD');
await page.click(`${row('EURGBP')} [data-sw-pin]`);
check('📌をタップで pin=true・上に移る（✖ありでも）', (await trades()).find(t => t.id === 'p1').pin === true && (await pairs()).slice(0, 2).sort().join() === 'EURAUD,EURGBP');
await page.click(`${row('EURGBP')} [data-sw-pin]`);
check('もう一度で解除・元の並びに戻る', (await trades()).find(t => t.id === 'p1').pin === false && (await pairs())[0] === 'EURAUD' && (await pairs()).indexOf('EURGBP') > 0);
check('📌を足しても 375px で横にはみ出さない', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth &&
  [...document.querySelectorAll('#swList .trend-tf')].every(r => r.scrollWidth <= r.clientWidth + 1)));

/* ---- S112: 🎯のラインの価格（タップでコピー） ---- */
const aimNow = Date.now();
await page.evaluate(at => { const c = { granville: false, rci: false, macd: false, neck: false };
  saveTrades(loadTrades().filter(t => t.id !== 'p2').concat([{ id: 'aim1', kind: 'scalpwatch', pair: 'GBPAUD', ng: c, mid: c, ok: c, notes: '',
    alerts: { '1H': at }, alertSide: { '1H': 'long' }, alertPrice: { '1H': 2.01 }, aim: { '1H': { lo: 2.0, hi: 2.04, conf: ['1H', '4H'], touches: 3, side: 'down' } },
    createdAt: at, updatedAt: at }])); watchBoard.render(); }, new Date(aimNow - 12 * 60e3).toISOString());
check('🎯のラインの価格は📍の行に出る（範囲の中央）', (await page.textContent(row('GBPAUD') + ' .sw-zone-line')).includes('2.02'));
check('🎯の価格はタップでコピーできる（📍の行の価格と同じ部品）', await page.locator(row('GBPAUD') + ' .sw-zone-line .zam ~ .zcopy').count() === 1);
check('ヘッダの🎯は印だけ（価格は出さない）', !(await page.textContent(row('GBPAUD') + ' .aim-badge')).includes('2.02'));
await page.evaluate(() => { const z = (lo, hi, conf) => ({ lo, hi, line: lo, touches: 3, conf });
  localStorage.setItem('mochipoyo_zones_cache_v1', JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), pairs: { GBPAUD: { price: 2.01, nearUnit: 0.05,
    tfs: { '4H': { atr: 0.1, ladder: [z(2.02, 2.04, ['1H', '4H']), z(1.96, 1.98, ['4H'])] } } } } })); location.reload(); });
await page.waitForSelector('#tabBar');
check('🎯が上のラインと同じ価格なら重複させず、そのラインに🎯を付ける', await page.locator(row('GBPAUD') + ' .sw-zone-line .zcopy').count() === 2 && await page.locator(row('GBPAUD') + ' .sw-zone-line .zam').count() === 1);
check('📍の行は価格の高い順（上→下）', await page.$$eval(row('GBPAUD') + ' .sw-zone-line .zcopy', els => els.map(e => Number(e.textContent))).then(a => a[0] > a[1]));

/* ---- S114: 時間足ごとに別カード・他の足のアラート・逆向きの警告 ---- */
await page.evaluate(at => { const c = { granville: false, rci: false, macd: false, neck: false };
  const mk = (id, kind, extra) => Object.assign({ id, kind, pair: 'AUDJPY', ng: c, mid: c, ok: c, notes: '', createdAt: at.d, updatedAt: at.d }, extra);
  saveTrades([
    mk('tW', 'trendwatch', { cls: 'swing', tf: 'W', alerts: { W: at.w }, alertSide: { W: 'long' } }),
    mk('tD', 'trendwatch', { cls: 'swing', tf: 'D', alerts: { D: at.d }, alertSide: { D: 'short' } }),
    mk('t1', 'scalpwatch', { alerts: { '1H': at.h }, alertSide: { '1H': 'long' } }),
  ]); watchBoard.render(); }, { w: new Date(Date.now() - 5 * 3600e3).toISOString(), d: new Date(Date.now() - 2 * 3600e3).toISOString(), h: new Date(Date.now() - 20 * 60e3).toISOString() });
const card = id => `#swList [data-sw="${id}"]`;
check('同じ通貨の週足・日足・1時間足は別々のカード', await page.locator('#swList [data-sw]').count() === 3);
check('ヘッダの時間足は自分の足だけ', (await page.$$eval(card('tW') + ' .sw-tfchip', els => els.map(e => e.textContent))).join() === 'W');
check('週足のカードに「他の足」：1H▲買・D▼売', /1H▲買/.test(await page.textContent(card('tW') + ' .sw-other')) && /D▼売/.test(await page.textContent(card('tW') + ' .sw-other')));
check('週足（買い）は日足（売り）と逆向き → ⚠逆向き・赤い行', await page.locator(card('tW') + ' .sw-conflict').count() === 1 && await page.locator(card('tW') + ' .sw-other.conflict').count() === 1);
check('逆向きの足のチップに印', await page.locator(card('tW') + ' .sw-ochip.opp').count() === 1);
check('日足（売り）から見て週足・1時間足（買い）は逆向き', await page.locator(card('tD') + ' .sw-ochip.opp').count() === 2);
await page.evaluate(() => { const ts = loadTrades(); ts.find(t => t.id === 'tD').alertSide = { D: 'long' }; saveTrades(ts); watchBoard.render(); });
check('全部同じ向きなら⚠は出ず「🔗 他の足」だけ', await page.locator('#swList .sw-conflict').count() === 0 && (await page.textContent(card('tW') + ' .sw-other')).includes('他の足'));
await page.evaluate(() => { saveTrades(loadTrades().filter(t => t.id === 't1')); watchBoard.render(); });
check('他の足が無ければ行は出ない', await page.locator(card('t1') + ' .sw-other').count() === 0);
await page.selectOption('#swAddCls', 'W');
await page.selectOption('#swAdd', 'AUDJPY');
const addW = (await trades()).find(t => t.pair === 'AUDJPY' && t.tf === 'W');
check('手で追加は時間足を選ぶ（週足 → スイング・tf=W）', !!addW && addW.kind === 'trendwatch' && addW.cls === 'swing');
check('手で足した週足のカードにも1時間足のアラートが「他の足」で出る', /1H/.test(await page.textContent(card(addW.id) + ' .sw-other')));

/* ---- S115: 後から記録するときはエントリー日時を手で入れる ---- */
await page.evaluate(at => { const c = { granville: false, rci: false, macd: false, neck: false };
  saveTrades(loadTrades().concat([{ id: 'late1', kind: 'scalpwatch', pair: 'NZDJPY', tf: '1H', ng: c, mid: c, ok: c, notes: '', alerts: { '1H': at }, alertSide: { '1H': 'short' }, createdAt: at, updatedAt: at }]));
  watchBoard.render(); }, new Date(Date.now() - 2 * 3600e3).toISOString());
await page.click('.tab-btn[data-tab="watch"]');
await page.click(`${card('late1')} [data-sw-in-open]`);
check('入ったの欄にエントリー日時の入力がある', await page.locator(`${card('late1')} input[type="datetime-local"][data-sw-in="at"]`).count() === 1);
await page.fill(`${card('late1')} [data-sw-in="entry"]`, '88.123');
const future = await page.evaluate(() => toDatetimeLocalValue(new Date(Date.now() + 3 * 3600e3)));
await page.fill(`${card('late1')} [data-sw-in="at"]`, future);
await page.click(`${card('late1')} [data-sw-go]`);
check('未来の日時は記録できない', (await toast()).includes('未来') && !(await trades()).some(t => t.pair === 'NZDJPY' && t.status));
const past = await page.evaluate(() => toDatetimeLocalValue(new Date(Date.now() - 90 * 60e3)));
await page.fill(`${card('late1')} [data-sw-in="at"]`, past);
await page.click(`${card('late1')} [data-sw-go]`);
const late = (await trades()).find(t => t.pair === 'NZDJPY' && t.status);
check('入れた日時がエントリー日時になる（手入力の印つき）', !!late && late.datetime === past && late.entryAtManual === true && !!late.entryAtIso && late.entryPrice === 88.123);
const nowRec = await page.evaluate(() => buildPosition({ id: 'x', kind: 'scalpwatch', pair: 'USDJPY', tf: '1H', alerts: {} }, { tf: '5分足', dir: 'long', entry: '150.1', stop: '', at: '' }));
check('日時を入れなければ従来どおり（押した時刻・手入力の印なし）', nowRec.entryAtManual === false && nowRec.entryAtIso === '' && Math.abs(Date.parse(nowRec.datetime) - Date.now()) < 120000);
await page.click('.tab-btn[data-tab="record"]');
const lateCard = `#posOpen [data-pos="${late.id}"]`;
await page.click(`${lateCard} [data-pos-fix]`);
check('「価格」の欄でエントリー日時も直せる', await page.locator(`${lateCard} [data-pos-fix-in="at"]`).inputValue() === past);
const past2 = await page.evaluate(() => toDatetimeLocalValue(new Date(Date.now() - 3 * 3600e3)));
await page.fill(`${lateCard} [data-pos-fix-in="at"]`, past2);
await page.click(`${lateCard} [data-pos-fix-save]`);
check('直した日時が保存される', (await trades()).find(t => t.id === late.id).datetime === past2);

/* ---- S116: ⭐ 惜しい（入らなかったが入ってもよかったかも） ---- */
await page.evaluate(at => { const c = { granville: false, rci: false, macd: false, neck: false };
  saveTrades(loadTrades().concat([{ id: 'st1', kind: 'trendwatch', cls: 'day', tf: '4H', pair: 'CADJPY', ng: c, mid: c, ok: Object.assign({}, c, { granville: true }), notes: '',
    alerts: { '4H': at }, alertSide: { '4H': 'long' }, createdAt: at, updatedAt: at }]));
  watchBoard.render(); }, new Date(Date.now() - 3600e3).toISOString());
await page.click('.tab-btn[data-tab="watch"]');
await page.click(`${card('st1')} [data-sw-skip]`);
await page.click(`${card('st1')} [data-sw-star]`);
check('⭐を押すとメモ・約定価格・2:1の価格・約定日時の欄が出る', await page.locator(`${card('st1')} [data-sw-sk]`).count() === 4);
await page.fill(`${card('st1')} [data-sw-sk="note"]`, 'RCIがまだ下限');
await page.fill(`${card('st1')} [data-sw-sk="entry"]`, '108.50');
await page.fill(`${card('st1')} [data-sw-sk="tp2"]`, '109.10');
check('入力すると損切り・3:1・4:1 がその場で出る（買い・R=0.30）', /損切 108\.2.*3:1 109\.4.*4:1 109\.7/.test(await page.textContent(`${card('st1')} .sw-plan-preview`)));
await page.fill(`${card('st1')} [data-sw-sk="tp2"]`, '');
await page.click(`${card('st1')} [data-sw-skip-go="star"]`);
check('約定価格だけで2:1が無いと記録できない', (await toast()).includes('2:1') && await page.locator(card('st1')).count() === 1);
await page.fill(`${card('st1')} [data-sw-sk="tp2"]`, '109.10');
const starAt = await page.evaluate(() => toDatetimeLocalValue(new Date(Date.now() - 30 * 60e3)));
await page.fill(`${card('st1')} [data-sw-sk="at"]`, starAt);
await page.click(`${card('st1')} [data-sw-skip-go="star"]`);
const starLog = (await trades()).find(t => t.kind === 'watchlog' && t.pair === 'CADJPY');
check('⭐として記録（consider・メモ・条件・アラートつき）・カードは消える', !!starLog && starLog.consider === true && starLog.considerNote === 'RCIがまだ下限' &&
  starLog.cond.granville === 'ok' && starLog.alert.tf === '4H' && await page.locator(card('st1')).count() === 0);
check('入るならこの価格：損切108.2・2:1=109.1・3:1=109.4・4:1=109.7・方向は買い・日時つき', starLog.plan && starLog.plan.dir === 'long' && starLog.plan.stopPrice === 108.2 &&
  starLog.plan.tp2Price === 109.1 && starLog.plan.tp3Price === 109.4 && starLog.plan.tp4Price === 109.7 && starLog.plan.entryAt === starAt && !!starLog.plan.entryAtIso);
check('見送りは📚の統計（mainTrades）には入らない', await page.evaluate(() => mainTrades().every(t => t.kind !== 'watchlog')));
await page.evaluate(at => { const c = { granville: false, rci: false, macd: false, neck: false };
  saveTrades(loadTrades().concat([{ id: 'pl1', kind: 'scalpwatch', tf: '1H', pair: 'USDJPY', ng: c, mid: c, ok: c, notes: '', alerts: { '1H': at }, alertSide: { '1H': 'short' }, createdAt: at, updatedAt: at }]));
  watchBoard.render(); }, new Date(Date.now() - 1800e3).toISOString());
await page.click(`${card('pl1')} [data-sw-skip]`);
await page.click(`${card('pl1')} [data-sw-skip-go="plain"]`);

await page.click('.tab-btn[data-tab="record"]');
const skRow = id => `#skList [data-sk="${id}"]`;
check('📒の「見送った記録」に出る（⭐・メモ・価格）', (await page.textContent(skRow(starLog.id))).includes('RCIがまだ下限') && (await page.textContent(skRow(starLog.id))).includes('109.7') &&
  await page.locator(skRow(starLog.id) + ' .sk-star.on').count() === 1);
check('判定待ちの表示', (await page.textContent(skRow(starLog.id))).includes('判定待ち'));
const plainLog = (await trades()).find(t => t.kind === 'watchlog' && !t.consider);
check('ふつうの見送りも一覧に出る', !!plainLog && await page.locator(skRow(plainLog.id)).count() === 1);
await page.click('#skTabs [data-sk-filter="star"]');
check('⭐で絞り込める', await page.locator('#skList [data-sk]').count() === 1);
await page.click('#skTabs [data-sk-filter="all"]');
// 後から⭐を付けて、✎で価格を入れる（売り）
await page.click(skRow(plainLog.id) + ' [data-sk-star]');
check('後から⭐を付けられる', (await trades()).find(t => t.id === plainLog.id).consider === true);
await page.click(skRow(plainLog.id) + ' [data-sk-star]');
check('もう一度で外せる', (await trades()).find(t => t.id === plainLog.id).consider === false);
await page.click(skRow(plainLog.id) + ' [data-sk-edit]');
await page.fill(skRow(plainLog.id) + ' [data-sk-in="note"]', '後から見たら入れた');
await page.fill(skRow(plainLog.id) + ' [data-sk-in="entry"]', '157.40');
await page.fill(skRow(plainLog.id) + ' [data-sk-in="tp2"]', '156.80');
check('✎でも損切り・3:1・4:1 がその場で出る（売り）', /▼売.*損切 157\.7.*3:1 156\.5.*4:1 156\.2/.test(await page.textContent(skRow(plainLog.id) + ' .sw-plan-preview')));
await page.click(skRow(plainLog.id) + ' [data-sk-save]');
const edited = (await trades()).find(t => t.id === plainLog.id);
check('✎で保存すると⭐が付き、メモと価格が入る', edited.consider === true && edited.considerNote === '後から見たら入れた' && edited.plan.dir === 'short' && edited.plan.stopPrice === 157.7 && edited.plan.tp4Price === 156.2);
await page.click('.tab-btn[data-tab="review"]');
check('📚に⭐惜しい／ふつうの見送りの件数', /⭐ 惜しい\s*2件/.test(await page.textContent('#skipStats')) && (await page.textContent('#skipStats')).includes('判定待ち'));
await page.evaluate(id => { const ts = loadTrades(); ts.find(t => t.id === id).sim = { result: 'win' }; saveTrades(ts); renderAll(); }, starLog.id);
check('判定が入ると勝率が出る', (await page.textContent('#skipStats')).includes('勝1・負0（100%）'));
await page.click('.tab-btn[data-tab="record"]');
check('一覧に「入っていたら：勝ち」', (await page.textContent(skRow(starLog.id))).includes('入っていたら：勝ち'));
await page.click(skRow(starLog.id) + ' [data-sk-del]');
check('🗑で見送りの記録を消せる', !(await trades()).some(t => t.id === starLog.id));

/* ---- S117: 手で足したカードは、買いか売りかを自分で選ぶ ---- */
await page.click('.tab-btn[data-tab="watch"]');
await page.evaluate(at => { const c = { granville: false, rci: false, macd: false, neck: false };
  saveTrades([
    { id: 'hand1', kind: 'trendwatch', cls: 'swing', tf: 'D', pair: 'EURGBP', ng: c, mid: c, ok: c, notes: '', createdAt: at, updatedAt: at },
    { id: 'hand2', kind: 'scalpwatch', tf: '1H', pair: 'EURGBP', ng: c, mid: c, ok: c, notes: '', alerts: { '1H': at }, alertSide: { '1H': 'short' }, createdAt: at, updatedAt: at },
  ]); watchBoard.render(); }, new Date(Date.now() - 600e3).toISOString());
check('手で足したカード（方向なし）に ▲買／▼売 のボタンが出る', await page.locator(`${card('hand1')} [data-sw-side]`).count() === 2);
check('アラートの方向があるカードにはボタンは出ない（印が出る）', await page.locator(`${card('hand2')} [data-sw-side]`).count() === 0 && await page.locator(`${card('hand2')} .sw-dir.down`).count() === 1);
await page.click(`${card('hand1')} [data-sw-side="long"]`);
check('▲買を選ぶと保存され、ボタンが点灯する', (await trades()).find(t => t.id === 'hand1').side === 'long' && await page.locator(`${card('hand1')} .sw-dir-btn.up.on`).count() === 1);
check('売り（1H）のアラートと逆向きになるので ⚠逆向き が出る', await page.locator(`${card('hand1')} .sw-conflict`).count() === 1);
await page.click(`${card('hand1')} [data-sw-side="short"]`);
check('▼売に変えると逆向きの警告は消える（1Hも売り）', (await trades()).find(t => t.id === 'hand1').side === 'short' && await page.locator(`${card('hand1')} .sw-conflict`).count() === 0);
await page.click(`${card('hand1')} [data-sw-side="short"]`);
check('もう一度で解除', (await trades()).find(t => t.id === 'hand1').side === '');
await page.click(`${card('hand1')} [data-sw-side="long"]`);
await page.click(`${card('hand1')} [data-sw-in-open]`);
check('入ったの方向に、選んだ ▲買 が入っている', await page.locator(`${card('hand1')} [data-sw-pick="dir"][data-v="long"].on`).count() === 1);
await page.click(`${card('hand1')} [data-sw-cancel]`);
await page.click(`${card('hand1')} [data-sw-skip]`);
await page.click(`${card('hand1')} [data-sw-star]`);
await page.click(`${card('hand1')} [data-sw-skip-go="star"]`);
const handLog = (await trades()).find(t => t.kind === 'watchlog' && t.pair === 'EURGBP');
check('⭐で価格を入れなくても、選んだ方向が見送りの記録に残る', !!handLog && handLog.side === 'long' && handLog.consider === true);
await page.click('.tab-btn[data-tab="record"]');
check('見送った記録に ▲買 が出る', await page.locator(`#skList [data-sk="${handLog.id}"] .sw-dir.up`).count() === 1);

/* ---- S118: 長いメモは長押しで全部表示 ---- */
await page.click('.tab-btn[data-tab="watch"]');
const longNote = 'これはとても長いメモです。4時間足のネックラインで反発を待っていて、RCIの短期がまだ下限に来ていないので様子見。日足の向きとも合わせて確認する。';
await page.evaluate(([at, note]) => { const c = { granville: false, rci: false, macd: false, neck: false };
  saveTrades([{ id: 'memo1', kind: 'scalpwatch', tf: '1H', pair: 'GBPUSD', ng: c, mid: c, ok: c, notes: note, alerts: { '1H': at }, alertSide: { '1H': 'long' }, createdAt: at, updatedAt: at }]);
  watchBoard.render(); }, [new Date(Date.now() - 600e3).toISOString(), longNote]);
const noteEl = `${card('memo1')} .sw-note-text`;
const isClipped = () => page.$eval(noteEl, el => el.scrollWidth > el.clientWidth + 1);
check('長いメモは1行で省略されている', await isClipped());
const longPress = async () => { const bx = await page.locator(noteEl).boundingBox();
  await page.mouse.move(bx.x + 20, bx.y + bx.height / 2); await page.mouse.down(); await page.waitForTimeout(650); await page.mouse.up(); };
await longPress();
check('長押しで全部表示される（編集欄は開かない）', await page.locator(`${card('memo1')} .sw-note-text.full`).count() === 1 && !(await isClipped()) &&
  await page.locator(`${card('memo1')} [data-sw-note]`).count() === 0);
await longPress();
check('もう一度長押しで1行に戻る', await page.locator(`${card('memo1')} .sw-note-text.full`).count() === 0 && await isClipped());
await page.waitForTimeout(500);
await page.click(noteEl);
check('タップは今までどおり編集が開く', await page.locator(`${card('memo1')} [data-sw-note]`).count() === 1);

/* ---- S119: 📋 候補（週末の分析などで、アラートが鳴る前に書いておく） ---- */
await page.evaluate(() => { saveTrades([]); renderAll(); });
await page.click('.tab-btn[data-tab="watch"]');
check('👀監視に「🔔 アラート｜📋 候補」の切り替え', await page.locator('#swSeg [data-sw-pane]').count() === 2);
await page.click('#swSeg [data-sw-pane="cand"]');
check('📋 候補に切り替えるとアラートの一覧は隠れる', await page.$eval('#swPaneAlert', el => el.hidden) && !(await page.$eval('#swPaneCand', el => el.hidden)));
await page.selectOption('#cdAdd', 'GBPJPY');
const cd = () => page.evaluate(() => loadTrades().find(t => t.kind === 'candidate'));
const cdSel = id => `#cdList [data-cd="${id}"]`;
let c1 = await cd();
check('通貨を選ぶと候補ができ、メモの欄が開く', !!c1 && c1.pair === 'GBPJPY' && await page.locator(cdSel(c1.id) + ' textarea[data-cd-in="notes"]').count() === 1);
const memo = '週足のネックライン付近。\n4Hで逆三尊ができたら買い。日足のRCIも下限から反転待ち。もう少し様子を見る。';
await page.fill(cdSel(c1.id) + ' [data-cd-in="notes"]', memo);
await page.fill(cdSel(c1.id) + ' [data-cd-in="target"]', '208.50');
await page.click(cdSel(c1.id) + ' [data-cd-save]');
c1 = await cd();
check('メモ（複数行）と狙う価格が保存される', c1.notes === memo && c1.target === '208.50');
check('候補は📚・CSV（mainTrades）に入らない', await page.evaluate(() => mainTrades().every(t => t.kind !== 'candidate')));
await page.click(cdSel(c1.id) + ' [data-cd-side="long"]');
await page.click(cdSel(c1.id) + ' [data-cd-tf="W"]');
c1 = await cd();
check('方向と時間足を選べる', c1.side === 'long' && c1.tf === 'W');
check('メモは2行で省略・タップで全部表示', await page.$eval(cdSel(c1.id) + ' .cd-note', el => el.scrollHeight > el.clientHeight + 1));
await page.click(cdSel(c1.id) + ' .cd-note');
check('タップ後は全部見える', await page.$eval(cdSel(c1.id) + ' .cd-note', el => el.classList.contains('full') && el.scrollHeight <= el.clientHeight + 1));
check('候補はアラートの一覧（監視カード）には入らない', await page.evaluate(() => loadTrades().filter(t => t.kind === 'scalpwatch' || t.kind === 'trendwatch').length === 0) &&
  (await page.textContent('#swSegAlertN')) === '' && (await page.textContent('#swSegCandN')) === '1');
// 候補の通貨にアラートが鳴ると、そのアラートのカードに候補のメモが出る
await page.evaluate(at => { const c = { granville: false, rci: false, macd: false, neck: false };
  saveTrades(loadTrades().concat([{ id: 'al1', kind: 'trendwatch', cls: 'day', tf: '4H', pair: 'GBPJPY', ng: c, mid: c, ok: c, notes: '', alerts: { '4H': at }, alertSide: { '4H': 'long' }, createdAt: at, updatedAt: at }]));
  renderAll(); }, new Date(Date.now() - 600e3).toISOString());
await page.click('#swSeg [data-sw-pane="alert"]');
check('アラートのカードに「📋 候補」とメモ・狙う価格が出る', (await page.textContent(`${card('al1')} .sw-cand`)).includes('週足のネックライン付近') && (await page.textContent(`${card('al1')} .sw-cand`)).includes('208.50'));
await page.click(`${card('al1')} .sw-cand b`);
check('タップで候補のメモを全部表示', await page.locator(`${card('al1')} .sw-cand.full`).count() === 1);
// → 監視へ
await page.click('#swSeg [data-sw-pane="cand"]');
await page.click(cdSel(c1.id) + ' [data-cd-tf="W"]');
await page.click(cdSel(c1.id) + ' [data-cd-go]');
check('時間足が無いと監視へ送れない', (await toast()).includes('時間足'));
await page.click(cdSel(c1.id) + ' [data-cd-tf="W"]');
await page.click(cdSel(c1.id) + ' [data-cd-go]');
const ws = await page.evaluate(() => loadTrades().filter(t => t.kind === 'trendwatch' && t.tf === 'W'));
check('→ 監視へで週足の監視カードができる（方向・メモを引き継ぐ）', ws.length === 1 && ws[0].pair === 'GBPJPY' && ws[0].side === 'long' && ws[0].notes === memo && ws[0].cls === 'swing');
check('アラートの画面に切り替わる', !(await page.$eval('#swPaneAlert', el => el.hidden)));
check('候補から作ったカードには「📋 候補」の行を重ねて出さない', await page.locator(`${card(ws[0].id)} .sw-cand`).count() === 0);
await page.click('#swSeg [data-sw-pane="cand"]');
check('候補は残り「👀 監視中」の印が付く', (await page.textContent(cdSel(c1.id))).includes('監視中') && (await cd()).watchId === ws[0].id);
await page.click(cdSel(c1.id) + ' [data-cd-goto]');
check('「監視中を見る」でアラートの画面へ', !(await page.$eval('#swPaneAlert', el => el.hidden)));
await page.click(`${card(ws[0].id)} [data-sw-del]`);
await page.click('#swSeg [data-sw-pane="cand"]');
check('監視カードを消すと、候補は「→ 監視へ」に戻る', await page.locator(cdSel(c1.id) + ' [data-cd-go]').count() === 1);
await page.click(cdSel(c1.id) + ' [data-cd-pin]');
check('📌で固定できる', (await cd()).pin === true);
await page.click(cdSel(c1.id) + ' [data-cd-del]');
check('🗑で候補を消せる', !(await cd()));
check('候補の画面も 375px で横にはみ出さない', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
await page.click('#swSeg [data-sw-pane="alert"]');

/* ---- S120: 候補にもグランビル／RCI／MACD／ネック ---- */
await page.evaluate(() => { saveTrades([]); renderAll(); });
await page.click('#swSeg [data-sw-pane="cand"]');
await page.selectOption('#cdAdd', 'AUDUSD');
let c2 = await cd();
await page.click(cdSel(c2.id) + ' [data-cd-save]');
check('候補カードに4つの条件ボタン', await page.locator(cdSel(c2.id) + ' [data-cd-ng]').count() === 4);
await page.click(cdSel(c2.id) + ' [data-cd-ng="granville"]');
await page.click(cdSel(c2.id) + ' [data-cd-ng="rci"]'); await page.click(cdSel(c2.id) + ' [data-cd-ng="rci"]');
await page.click(cdSel(c2.id) + ' [data-cd-ng="macd"]'); await page.click(cdSel(c2.id) + ' [data-cd-ng="macd"]'); await page.click(cdSel(c2.id) + ' [data-cd-ng="macd"]');
c2 = await cd();
const st = (t, k) => t.ng[k] ? 'ng' : t.mid[k] ? 'mid' : t.ok[k] ? 'ok' : '';
check('タップで ✅→▲→✖ と回る（グランビル✅・RCI▲・MACD✖・ネック未選択）', st(c2, 'granville') === 'ok' && st(c2, 'rci') === 'mid' && st(c2, 'macd') === 'ng' && st(c2, 'neck') === '');
check('ボタンに印が出る', (await page.textContent(cdSel(c2.id) + ' [data-cd-ng="granville"]')).includes('✅') && (await page.textContent(cdSel(c2.id) + ' [data-cd-ng="macd"]')).includes('✖'));
await page.click(cdSel(c2.id) + ' [data-cd-ng="granville"]'); await page.click(cdSel(c2.id) + ' [data-cd-ng="granville"]'); await page.click(cdSel(c2.id) + ' [data-cd-ng="granville"]');
check('4回目で解除', st(await cd(), 'granville') === '');
await page.click(cdSel(c2.id) + ' [data-cd-ng="granville"]');
// アラートのカードの「📋 候補」の行に条件が出る
await page.evaluate(at => { const c = { granville: false, rci: false, macd: false, neck: false };
  saveTrades(loadTrades().concat([{ id: 'al2', kind: 'scalpwatch', tf: '1H', pair: 'AUDUSD', ng: c, mid: c, ok: c, notes: '', alerts: { '1H': at }, alertSide: { '1H': 'short' }, createdAt: at, updatedAt: at }]));
  renderAll(); }, new Date(Date.now() - 600e3).toISOString());
await page.click('#swSeg [data-sw-pane="alert"]');
check('アラートのカードの「📋 候補」に候補の条件が出る', (await page.textContent(`${card('al2')} .sw-cand`)).includes('グランビル✅') && (await page.textContent(`${card('al2')} .sw-cand`)).includes('MACD✖'));
// → 監視へで条件を引き継ぐ
await page.click('#swSeg [data-sw-pane="cand"]');
await page.click(cdSel(c2.id) + ' [data-cd-tf="4H"]');
await page.click(cdSel(c2.id) + ' [data-cd-go]');
const w4 = await page.evaluate(() => loadTrades().find(t => t.kind === 'trendwatch' && t.pair === 'AUDUSD'));
check('→ 監視へで条件を引き継ぐ', !!w4 && st(w4, 'granville') === 'ok' && st(w4, 'rci') === 'mid' && st(w4, 'macd') === 'ng' && st(w4, 'neck') === '');
check('引き継いだ監視カードのボタンにも印が出る', (await page.textContent(`${card(w4.id)} [data-sw-ng="rci"]`)).includes('▲'));
check('候補画面も 375px に収まる', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
await page.click('#swSeg [data-sw-pane="alert"]');

/* ---- S121: 📅 アラート台帳 ---- */
await page.evaluate(() => { saveTrades([]); renderAll(); });
await page.click('.tab-btn[data-tab="watch"]');
await page.click('#swSeg [data-sw-pane="alert"]');
await page.evaluate(([at, old]) => {
  const C = (ok, mid, ng) => ({ granville: false, rci: false, macd: false, neck: false, ...ok });
  const mk = (id, pair, tf, side, at2, st) => {
    const ng = {}, mid = {}, ok = {};
    ['granville', 'rci', 'macd', 'neck'].forEach(k => { ng[k] = st[k] === 'ng'; mid[k] = st[k] === 'mid'; ok[k] = st[k] === 'ok'; });
    return { id, kind: tf === '1H' ? 'scalpwatch' : 'trendwatch', cls: tf === '1H' ? undefined : 'day', tf, pair, ng, mid, ok, notes: '', alerts: { [tf]: at2 }, alertSide: { [tf]: side }, createdAt: at2, updatedAt: at2 };
  };
  saveTrades([
    mk('lg1', 'EURUSD', '1H', 'long', at, { granville: 'ok', rci: 'ng', macd: 'ok', neck: 'ok' }),
    mk('lg2', 'GBPUSD', '1H', 'short', old, { granville: 'ok', rci: 'mid', macd: 'ok', neck: 'ok' }),   // 期限切れで消える
  ]);
  watchBoard.render();
}, [new Date(Date.now() - 600e3).toISOString(), new Date(Date.now() - 7 * 3600e3).toISOString()]);
let ls = await trades();
const ex = ls.find(t => t.kind === 'watchlog' && t.outcome === 'expired');
check('期限切れで消えたカードも、条件つきで記録が残る', !!ex && ex.pair === 'GBPUSD' && ex.cond.rci === 'mid' && !ls.some(t => t.id === 'lg2'));
check('期限切れの記録の id はカードとアラート時刻から決まる（端末が違っても1件）', ex.id.startsWith('wlx_lg2_'));
await page.click(`${card('lg1')} [data-sw-del]`);
ls = await trades();
const dl = ls.find(t => t.kind === 'watchlog' && t.outcome === 'deleted');
check('🗑で消したカードも、条件つきで記録が残る', !!dl && dl.pair === 'EURUSD' && dl.cond.rci === 'ng' && dl.alert.side === 'long' && !ls.some(t => t.id === 'lg1'));
check('🗑・期限切れの記録は「見送った記録」には出ない', await page.evaluate(() => loadTrades().filter(isSkipLog).length === 0));
check('🗑・期限切れの記録は📚の統計・CSV（mainTrades）に入らない', await page.evaluate(() => mainTrades().length === 0));
// 判定結果（vsim）を書き込んだ想定で台帳を見る
await page.evaluate(() => {
  const at = new Date(Date.now() - 3 * 3600e3).toISOString();
  const L = (id, cond, how, res, side) => ({ id, kind: 'watchlog', outcome: how, pair: 'AUDUSD', cls: 'scalp', tf: '1H', cond, alert: { tf: '1H', at, side: side || 'long', price: 0 }, datetime: at, createdAt: at, updatedAt: at, vsim: res ? { result: res } : undefined });
  const all = { granville: 'ok', rci: 'ok', macd: 'ok', neck: 'ok' };
  const t = loadTrades().map(x => x.kind === 'watchlog' ? Object.assign(x, { vsim: { result: x.outcome === 'deleted' ? 'loss' : 'win' } }) : x);
  saveTrades(t.concat([
    L('v1', all, 'skip', 'win'),
    L('v2', { ...all, macd: 'mid' }, 'skip', 'loss'),
    L('v3', { ...all, rci: '' }, 'skip', 'win'),
    L('v4', { ...all, macd: 'ng' }, 'deleted', 'win'),
    L('v5', all, 'skip', ''),
  ]));
  renderAll();
});
await page.click('.tab-btn[data-tab="review"]');
const lg = () => page.textContent('#alertLedger');
const lrow = name => page.$$eval('#alertLedger .row', (rs, n) => { const r = rs.find(x => x.querySelector('.name').textContent === n); return r ? r.textContent : ''; }, name);
check('📚に📅アラート台帳が出る', (await lg()).includes('アラート台帳'));
check('⭕だけ：2件（判定済み1件・勝1）', (await lrow('⭕だけ')).includes('2件') && (await lrow('⭕だけ')).includes('勝1・負0') && (await lrow('⭕だけ')).includes('+2R'));
check('⭕＋▲：4件（▲は v2 と期限切れの GBPUSD）', (await lrow('⭕＋▲')).includes('4件') && (await lrow('⭕＋▲')).includes('勝2・負1'));
check('⭕＋▲＋未判定：5件', (await lrow('⭕＋▲＋未判定')).includes('5件'));
check('全部（✖でも入る）：7件・勝4負2で +6R', (await lrow('全部（✖でも入る）')).includes('7件') && (await lrow('全部（✖でも入る）')).includes('勝4・負2') && (await lrow('全部（✖でも入る）')).includes('+6R'));
check('未判定は別枠', (await lrow('未判定（未選択が残る）')).includes('1件'));
check('「RCI だけ✖」「MACD だけ✖」が分かれる', (await lrow('RCI だけ✖')).includes('1件') && (await lrow('MACD だけ✖')).includes('1件') && (await lrow('MACD だけ✖')).includes('勝1'));
check('日ごとの見出しに件数と⭕▲✖', await page.locator('#alertLedger .ld-day').count() >= 1 && (await page.textContent('#alertLedger .ld-day-head')).includes('件'));
check('行に条件の印・どうしたか・もし入っていたら', (await page.textContent('#alertLedger [data-ld="v4"]')).includes('🗑') && (await page.textContent('#alertLedger [data-ld="v4"]')).includes('勝 +2R') &&
  (await page.textContent('#alertLedger [data-ld="v5"]')).includes('判定待ち'));
// 入った記録も台帳に載る
await page.evaluate(() => {
  const at = new Date(Date.now() - 5 * 3600e3).toISOString();
  saveTrades(loadTrades().concat([{ id: 'en1', pair: 'NZDUSD', cls: 'day', status: 'closed', resultTag: 'reg', alertAt: at, alertTf: '4時間足', alertSide: 'short', direction: 'short',
    cond: { granville: 'ok', rci: 'ok', macd: 'ok', neck: 'ok' }, datetime: at, createdAt: at, updatedAt: at }]));
  renderAll();
});
check('入った記録も台帳に載る（4H・▼・入った（勝））', (await page.textContent('#alertLedger [data-ld="en1"]')).includes('4H') && (await page.textContent('#alertLedger [data-ld="en1"]')).includes('入った（勝）'));
await page.click('#reviewClsFilter [data-cls="day"]');
check('📚の種類フィルタで台帳も絞れる（☀デイだけ＝入った1件）', (await lrow('全部（✖でも入る）')).includes('1件'));
await page.click('#reviewClsFilter [data-cls="all"]');
check('台帳も 375px で横にはみ出さない', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));

/* ---- S122: R・負けた理由・🔬 勝ち負けの分析 ---- */
check('R の数え方：損切 −1／建値 0／REG +0.67／BIG +1.67／MAX +3・手直しが優先', await page.evaluate(() =>
  tradeR({ resultTag: 'stoploss' }) === -1 && tradeR({ resultTag: 'breakeven' }) === 0 && tradeR({ resultTag: 'reg' }) === 0.67 &&
  tradeR({ resultTag: 'big' }) === 1.67 && tradeR({ resultTag: 'max' }) === 3 && tradeR({ resultTag: 'small_profit' }) === null && tradeR({ resultTag: 'reg', rManual: 0.4 }) === 0.4));
// 入った時点の局面（ctx）が残る
await page.evaluate(() => { saveTrades([]); renderAll(); });
await page.click('.tab-btn[data-tab="watch"]');
await page.evaluate(at => { const c = { granville: false, rci: false, macd: false, neck: false };
  saveTrades([
    { id: 'cx1', kind: 'scalpwatch', tf: '1H', pair: 'EURJPY', ng: c, mid: c, ok: { ...c, granville: true }, notes: '', alerts: { '1H': at }, alertSide: { '1H': 'long' }, wait: true, createdAt: at, updatedAt: at },
    { id: 'cx2', kind: 'trendwatch', cls: 'day', tf: '4H', pair: 'EURJPY', ng: c, mid: c, ok: c, notes: '', alerts: { '4H': at }, alertSide: { '4H': 'short' }, createdAt: at, updatedAt: at },
    { id: 'cdx', kind: 'candidate', pair: 'EURJPY', side: '', tf: '', notes: 'x', target: '', pin: false, watchId: '', createdAt: at, updatedAt: at },
  ]); renderAll(); }, new Date(Date.now() - 600e3).toISOString());
await page.click('#swSeg [data-sw-pane="alert"]');
await page.click(`${card('cx1')} [data-sw-in-open]`);
await page.click(`${card('cx1')} [data-sw-pick="tf"]`);
await page.fill(`${card('cx1')} [data-sw-in="entry"]`, '160.50');
await page.click(`${card('cx1')} [data-sw-go]`);
let pos = (await trades()).find(t => !t.kind && t.pair === 'EURJPY');
check('「入った」で局面が残る（他の足の逆向き・⏳待ち・📋候補）', !!pos && pos.ctx && pos.ctx.conflict === true && pos.ctx.wait === true && pos.ctx.cand === true && pos.ctx.aim === false);
await page.click(`${card('cx2')} [data-sw-del]`);
const dlog = (await trades()).find(t => t.kind === 'watchlog' && t.pair === 'EURJPY');
check('🗑・見送りの記録にも局面が残る', !!dlog && dlog.ctx && dlog.ctx.others === 0);
// 📒：損切 → 負けた理由・R
await page.click('.tab-btn[data-tab="record"]');
await page.click(`#posOpen [data-pos="${pos.id}"] [data-pos-res="stop"]`);
const pc = `#posClosed [data-pos="${pos.id}"]`;
check('損切りの記録に R（−1R）と負けた理由のボタン', (await page.textContent(`${pc} [data-pos-r]`)).includes('−1R') && await page.locator(`${pc} [data-pos-loss]`).count() === 6);
await page.click(`${pc} [data-pos-loss="ダマシ"]`);
check('負けた理由をタップで付ける', (await trades()).find(t => t.id === pos.id).lossReason === 'ダマシ' && await page.locator(`${pc} [data-pos-loss="ダマシ"].on`).count() === 1);
await page.click(`${pc} [data-pos-loss="ダマシ"]`);
check('もう一度で外す', (await trades()).find(t => t.id === pos.id).lossReason === '');
await page.click(`${pc} [data-pos-loss="早すぎた"]`);
await page.click(`${pc} [data-pos-r]`);
await page.fill(`${pc} [data-pos-r-in]`, '-0.5');
await page.click(`${pc} [data-pos-r-save]`);
check('R を手で直せる（−0.5R）', (await trades()).find(t => t.id === pos.id).rManual === -0.5 && (await page.textContent(`${pc} [data-pos-r]`)).includes('−0.5R'));
await page.click(`${pc} [data-pos-r]`);
await page.fill(`${pc} [data-pos-r-in]`, '');
await page.click(`${pc} [data-pos-r-save]`);
check('空にすると自動の R に戻る', !('rManual' in (await trades()).find(t => t.id === pos.id)));
// 🔬 分析（実際のエントリー）
await page.evaluate(() => {
  const C = st => ({ granville: 'ok', rci: 'ok', macd: 'ok', neck: 'ok', ...st });
  const mk = (i, tag, cond, ctx, hour, extra) => { const d = new Date(); d.setDate(d.getDate() - 1 - i); d.setHours(hour, 0, 0, 0); const at = d.toISOString();
    return Object.assign({ id: 'w' + i, pair: 'GBPJPY', cls: 'day', status: 'closed', resultTag: tag, direction: 'long', alertAt: at, alertTfKey: '4H', entryAtIso: at, datetime: at.slice(0, 16),
      cond: C(cond), ctx, createdAt: at, updatedAt: at, mvChecks: { higher: {}, entry: { entryOrderType: '指値', entryFibo: '61%' } } }, extra || {}); };
  const bad = { conflict: true, others: 1, aim: false, wait: false, pin: false, cand: false };
  const good = { conflict: false, others: 0, aim: true, wait: false, pin: false, cand: false };
  const list = [];
  for (let i = 0; i < 6; i++) list.push(mk(i, 'stoploss', { rci: 'mid' }, bad, 17, { lossReason: i < 4 ? 'ダマシ' : '', fill: { mfeR: i < 3 ? 0.1 : 1.4 } }));
  for (let i = 6; i < 12; i++) list.push(mk(i, i < 11 ? 'big' : 'stoploss', {}, good, 10, i < 11 ? { fill: { outcome: 'big', tp3At: 'x' } } : {}));
  saveTrades(list); renderAll();
});
await page.click('.tab-btn[data-tab="review"]');
await page.click('#winLoss [data-wl-src="real"]');
const wl = () => page.textContent('#winLoss');
check('📚に🔬勝ち負けの分析が出る（全体 12件）', (await wl()).includes('勝ち負けの分析') && (await page.textContent('#winLoss .wl-all')).includes('12件'));
const worstTxt = await page.$$eval('#winLoss .ld-sub', subs => { const s = subs.find(x => x.textContent.includes('負けやすい')); let t = '', n = s.nextElementSibling; while (n && !n.classList.contains('ld-sub')) { t += n.textContent + '\n'; n = n.nextElementSibling; } return t; });
check('負けやすい局面に「逆向きあり」や「RCI ▲」「ロンドン」の局面が出る', /逆向きあり|RCI：▲|ロンドン/.test(worstTxt) && worstTxt.includes('6件'));
const bestTxt = await page.$$eval('#winLoss .ld-sub', subs => { const s = subs.find(x => x.textContent.includes('勝ちやすい')); let t = '', n = s.nextElementSibling; while (n && !n.classList.contains('ld-sub')) { t += n.textContent + '\n'; n = n.nextElementSibling; } return t; });
check('勝ちやすい局面に「🎯あり」や「東京」が出る', /🎯あり|東京|⭕4つとも✅/.test(bestTxt));
check('負け方：すぐ逆行 3件・+1R以上乗ってから 3件', /すぐ逆行[^件]*3件/.test(await wl()) && /\+1R 以上乗ってから損切り[^件]*3件/.test(await wl()));
check('負けた理由の集計（ダマシ 4件）', /ダマシ4件/.test((await wl()).replace(/\s/g, '')));
check('2:1 の後：3:1 まで届いた 5件', /3:1 まで届いた5件/.test((await wl()).replace(/ (?=\d+件)/g, '')));
check('局面ごとの表（他の足・時間帯…）', await page.locator('#winLoss .wl-factor').count() >= 8);
await page.click('#winLoss [data-wl-src="sim"]');
check('「もし入っていたら（台帳）」に切り替えられる', (await wl()).includes('ATR×1.5') && await page.locator('#winLoss [data-wl-src="sim"].active').count() === 1);
await page.click('#winLoss [data-wl-src="real"]');
check('分析も 375px で横にはみ出さない', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));

check('JSエラーなし', errors.length === 0);
if (errors.length) console.log(errors.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
