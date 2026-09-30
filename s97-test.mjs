/* S97: 🔭一覧タブを⚡タブと同じ作り（👀監視リスト｜🔭記録カード）に。巡回一覧は撤去 */
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
const trades = () => page.evaluate(() => JSON.parse(localStorage.getItem('mochipoyo_trades_v1') || '[]'));
const card = i => `#trendSlots [data-slot="${i}"] `;
const P = '#tabPanel-trend ';

// 1. 画面の作り
check('既定で🔭タブ', await page.isVisible('#tabPanel-trend'));
check('巡回一覧は無い', await page.locator('#trendList, #trendMapOpen, [data-trend-item]').count() === 0);
check('巡回用のモーダルは無い', await page.locator('#trendGvModal, #trendMapModal, #alertTimeModal, #mvDeleteModal').count() === 0);
check('切替ボタンが2つ', await page.locator(P + '.sc-seg [data-sc-pane]').count() === 2);
check('初回は👀監視リスト', await page.isVisible('#trendWatch') && !(await page.isVisible('#trendSlots')));

// 2. 監視リスト
await page.selectOption('#trendWatchAdd', 'EURUSD');
check('監視リストに追加', await page.locator('#trendWatch [data-sw]').count() === 1);
check('切替ボタンに件数', (await page.textContent('#trendSegWatchN')) === '1');
await page.click('#trendWatch [data-sw-ng="macd"]');
await page.click('#trendWatch [data-sw-ng="macd"]');
const tw = (await trades()).find(t => t.kind === 'trendwatch');
check('kind:trendwatch で trades に入る', tw && tw.pair === 'EURUSD' && tw.ng.macd === true);
check('⚡の監視リストには出ない', await page.evaluate(() => document.querySelectorAll('#scalpWatch [data-sw]').length) === 0);
await page.click('[data-tab="review"]');
check('📚の履歴に監視リストは混ざらない', !(await page.textContent('#recordList')).includes('EURUSD'));
await page.click('[data-tab="trend"]');

// →カード
await page.click('#trendWatch [data-sw-card]');
check('→カードで記録画面へ', await page.isVisible('#trendSlots'));
check('通貨とMACD懸念がカードへ', await page.$eval(card(0) + '[data-sc-pair]', el => el.value) === 'EURUSD' &&
  await page.$eval(card(0) + '[data-sc="ng"][data-v="macd"]', el => el.classList.contains('on')));

// 3. カード
check('カードは5枚', await page.locator('#trendSlots [data-slot]').count() === 5);
check('上位足の選択肢は1時間足以上', JSON.stringify(await page.$$eval(card(0) + '[data-sc-sel="tfHigher"] option', os => os.map(o => o.value).filter(Boolean))) === JSON.stringify(['1時間足', '4時間足', '日足', '週足']));
check('指値を選ぶまでFiboは出ない', await page.locator(card(0) + '[data-sc="fibo"]').count() === 0);
await page.click(card(0) + '[data-sc="order"][data-v="指値"]');
check('指値でFiboが出る', await page.locator(card(0) + '[data-sc="fibo"]').count() === 5);
await page.click(card(0) + '[data-sc="fibo"][data-v="38%"]');
await page.click(card(0) + '[data-sc="order"][data-v="逆指値"]');
check('逆指値にするとFiboが消える', await page.locator(card(0) + '[data-sc="fibo"]').count() === 0 &&
  (await page.evaluate(() => trendDeck.slots[0].fibo)) === '');
await page.click(card(0) + '[data-sc="order"][data-v="指値"]');
await page.click(card(0) + '[data-sc="fibo"][data-v="38%"]');

// 必須チェック
await page.click(card(0) + '[data-sc-act="save"]');
check('足が未選択なら保存しない', (await trades()).filter(t => !t.kind).length === 0);
await page.selectOption(card(0) + '[data-sc-sel="tfHigher"]', '日足');
await page.selectOption(card(0) + '[data-sc-sel="tfEntry"]', '15分足');
await page.click(card(0) + '[data-sc-act="save"]');
check('区分が未選択なら保存しない', (await trades()).filter(t => !t.kind).length === 0);
await page.click(card(0) + '[data-sc="tradeType"][data-v="real"]');
await page.click(card(0) + '[data-sc-act="save"]');
check('方向が未選択なら保存しない', (await trades()).filter(t => !t.kind).length === 0);

await page.click(card(0) + '[data-sc="direction"][data-v="short"]');
check('方向に合う形だけ出る', JSON.stringify(await page.$$eval(card(0) + '[data-sc="shape"]', bs => bs.map(b => b.dataset.v))) === JSON.stringify(['ダブルトップ', '三尊']));
await page.click(card(0) + '[data-sc="shape"][data-v="三尊"]');
await page.click(card(0) + '[data-sc="ng"][data-v="rciShort"]');
await page.click(card(0) + '[data-sc="alert"][data-v="●"]');
await page.click(card(0) + '[data-sc="granville"][data-v="ダマシ"]');
await page.click(card(0) + '[data-sc-act="alert"]');
await page.click(card(0) + '[data-sc-act="save"]');
const t = (await trades()).find(x => !x.kind);
check('💾で1件記録', !!t);
check('区分・通貨・方向・判定', t.tradeType === 'real' && t.pair === 'EURUSD' && t.direction === 'short' && t.result === 'entered');
check('時間足とパターン', t.tfHigher === '日足' && t.tfEntry === '15分足' && t.entryPattern === '15分足×日足');
check('上位足の懸念は❌で焼き込む', t.mvChecks.higher.rciShort === '❌' && t.mvChecks.higher.macd === '❌' && t.mvChecks.higher.rciMid === '');
check('エントリー足の根拠', JSON.stringify(t.mvChecks.entry) === JSON.stringify({ necklineForm: '三尊', maBreak: '●', rollReversal: 'ダマシ', entryOrderType: '指値', entryFibo: '38%' }));
check('結果は空（後で📚から）', t.resultTag === '' && t.pnlAmount === 0);
check('アラート時刻とその足', /^\d{4}-\d\d-\d\dT\d\d:00$/.test(t.manualAlertAt) && t.manualAlertTf === '日足');
check('エントリー日時は💾の時刻', /^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(t.datetime));
const s0 = await page.evaluate(() => trendDeck.slots[0]);
check('保存後も通貨・区分・足は残る', s0.pair === 'EURUSD' && s0.tradeType === 'real' && s0.tfHigher === '日足' && s0.tfEntry === '15分足');
check('保存後は他の項目が空', !s0.direction && !s0.ng.length && !s0.shape && !s0.order && !s0.alertAt);

// 4. 📚に載り、統計にも入る
await page.click('[data-tab="review"]');
check('📚の履歴に載る', (await page.textContent('#recordList')).includes('EURUSD'));
await page.click('[data-tab="trend"]');

// 5. 入力中のみ・再読み込みで保持
await page.click('#trendActiveOnly');
check('入力中のみで空カードは隠れる', await page.locator('#trendSlots [data-slot]').count() === 0);
await page.click('#trendActiveOnly');
await page.click(card(1) + '[data-sc="direction"][data-v="long"]');
await page.reload();
check('再読み込み後もカードの内容が残る', (await page.evaluate(() => trendDeck.slots[1].direction)) === 'long');
check('再読み込み後も記録カード画面', await page.isVisible('#trendSlots'));

// 6. ⚡のカードとは別
check('⚡のカードは空のまま', await page.evaluate(() => scalpDeck.slots.every(scalpSlotIsBlank)));

check('375pxで横スクロールなし', await page.evaluate(() => document.documentElement.scrollWidth <= 375));
if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
check('コンソールエラーなし', errors.length === 0);
if (errors.length) console.log(errors);
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
