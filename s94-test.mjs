/* S94: 🔭一覧の根拠パネルに記録欄を入れ、モーダルを開かずに💾で記録する */
import { chromium } from 'playwright';
import path from 'path';

const URL = 'file:///' + path.resolve('index.html').replace(/\\/g, '/');
let pass = 0, fail = 0;
const check = (n, c) => { if (c) { pass++; console.log('OK  ', n); } else { fail++; console.log('FAIL', n); } };

const browser = await chromium.launch().catch(() =>
  chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }));
const errors = [];
const MARKET = 'mochipoyo_market_view_v1';
const alertAt = '2026-09-28T09:30';
const pair = (id, name, extra = {}) => ({
  id, pair: name, tfHigher: '4時間足', tfEntry: '5分足', judge: '', alerts: {},
  checksHigher: {}, checksEntry: {}, ...extra,
});

const ctx = await browser.newContext({ viewport: { width: 375, height: 900 } });
const page = await ctx.newPage();
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e)));
await page.goto(URL);
await page.evaluate(([K, a]) => {
  localStorage.clear();
  localStorage.setItem(K, JSON.stringify({ pairs: [
    { id: 'w1', pair: 'USDJPY', tfHigher: '4時間足', tfEntry: '5分足', judge: '', checksHigher: {}, checksEntry: {},
      alerts: { h1: { on: true, at: '2026-09-28T08:00', chAt: '' }, h4: { on: true, at: a, chAt: '' } } },
    { id: 'w2', pair: 'EURUSD', tfHigher: '4時間足', tfEntry: '5分足', judge: '', alerts: {}, checksHigher: {}, checksEntry: {} },
  ], snapshots: [], judgeLog: [] }));
}, [MARKET, alertAt]);
await page.reload();
const trades = () => page.evaluate(() => JSON.parse(localStorage.getItem('mochipoyo_trades_v1') || '[]'));
const W1 = '[data-trend-item="w1"] ';
const d = (key, v) => page.click(`[data-tr-draft="w1"][data-key="${key}"][data-value="${v}"]`);

// 1. →で開く・記録欄
await page.click(W1 + '[data-trend-goto-board="w1"]');
check('→で根拠パネルが開く', await page.locator(W1 + '.trend-panel').count() === 1);
check('モーダルは開かない', !(await page.locator('#tradeModal').evaluate(el => el.classList.contains('show'))));
check('区分の行がある', await page.locator(W1 + '[data-key="tradeType"]').count() === 2);
check('判定前は結果欄が無い', await page.locator(W1 + '[data-key="resultTag"]').count() === 0);
check('判定前は💾が押せない', await page.locator(W1 + '.tr-save[disabled]').count() === 1);

// 2. ✅エントリーでエントリー時刻を控える
const before = Date.now();
await page.click(W1 + '.mv-judge-btn.entered');
const enteredAt = await page.evaluate(() => JSON.parse(localStorage.getItem('mochipoyo_trend_drafts_v1')).w1.enteredAt);
check('✅エントリーのタップ時刻を控える', Date.parse(enteredAt) >= before - 1000);
check('控えた時刻を表示', (await page.textContent(W1 + '.tr-entered-at')).includes('⏱'));
check('結果欄が出る', await page.locator(W1 + '[data-key="resultTag"]').count() === RESULT_COUNT());
function RESULT_COUNT() { return 7; }

// 3. 入力
await d('tradeType', 'real');
await d('direction', 'short');
await d('resultTag', 'other');
check('その他で理由プルダウンが出る', await page.locator(W1 + '[data-tr-select="w1"]').count() === 1);
await page.selectOption(W1 + '[data-tr-select="w1"]', '経済指標にて撤退');
await page.click(W1 + '[data-tr-sign="w1"]');
check('符号が－に', (await page.textContent(W1 + '[data-tr-sign="w1"]')) === '－');
await page.fill(W1 + '[data-tr-input="w1"][data-key="pnl"]', '8,000');
await page.fill(W1 + '[data-tr-input="w1"][data-key="risk"]', '10000');
await d('beTouch', 'touched');
await page.click(W1 + '[data-tr-act="note"]');
await page.fill(W1 + '[data-tr-input="w1"][data-key="notes"]', '指標前に撤退');

// 4. 入力中に同期で描き直されても消えない
await page.click(W1 + '[data-tr-input="w1"][data-key="notes"]');
await page.evaluate(() => renderAll());
check('入力中は描き直さない', await page.evaluate(() => document.activeElement && document.activeElement.matches('[data-tr-input]')));

// 5. 再読み込みしても控えが残る
await page.reload();
await page.click(W1 + '[data-trend-goto-board="w1"]');
check('再読み込み後も損益が残る', (await page.inputValue(W1 + '[data-tr-input="w1"][data-key="pnl"]')) === '8,000');
check('再読み込み後も結果が残る', await page.locator(W1 + '[data-key="resultTag"][data-value="other"].on').count() === 1);
check('💾までは記録に入らない', (await trades()).length === 0);

// 6. 💾
await page.click(W1 + '[data-tr-act="save"]');
const t = (await trades())[0];
check('記録が1件', (await trades()).length === 1);
check('ペア・判定・時間足', t.pair === 'USDJPY' && t.result === 'entered' && t.tfHigher === '4時間足' && t.tfEntry === '5分足');
check('区分・方向', t.tradeType === 'real' && t.direction === 'short');
check('結果・理由', t.resultTag === 'other' && t.resultOtherReason === '経済指標にて撤退');
check('損益は符号つき・カンマ除去', t.pnlAmount === -8000);
check('リスク額', t.riskAmount === 10000);
check('建値タッチ・メモ', t.beTouch === 'touched' && t.notes === '指標前に撤退');
check('エントリー日時＝✅をタップした時刻', t.datetime === await page.evaluate(iso => toDatetimeLocalValue(new Date(iso)), enteredAt));
check('結果入りなので決済日時が入る', /^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(t.exitDatetime));
check('アラート発生は最新のON（4H）', t.manualAlertAt === alertAt && t.manualAlertTf === '4時間足');
check('根拠スナップショットが入る', t.mvChecks && 'higher' in t.mvChecks && 'entry' in t.mvChecks);
check('保存後パネルが閉じる', await page.locator(W1 + '.trend-panel').count() === 0);
check('控えが消える', await page.evaluate(() => !('w1' in JSON.parse(localStorage.getItem('mochipoyo_trend_drafts_v1') || '{}'))));
await page.click('[data-tab="review"]');
check('📚振り返りに載る', (await page.textContent('#recordList')).includes('USDJPY'));
await page.click('[data-tab="trend"]');

// 7. 必須チェック・保留の記録
const W2 = '[data-trend-item="w2"] ';
await page.click(W2 + '[data-trend-goto-board="w2"]');
await page.click(W2 + '.mv-judge-btn.entered');
await page.click(W2 + '[data-tr-act="save"]');
check('区分なしは保存しない', (await trades()).length === 1);
await page.click('[data-tr-draft="w2"][data-key="tradeType"][data-value="demo"]');
await page.click(W2 + '[data-tr-act="save"]');
check('エントリーで方向なしは保存しない', (await trades()).length === 1);
await page.click(W2 + '.mv-judge-btn.hold');
check('保留にすると控えのエントリー時刻が消える', await page.evaluate(() => !JSON.parse(localStorage.getItem('mochipoyo_trend_drafts_v1')).w2.enteredAt));
check('保留では結果欄が出ない', await page.locator(W2 + '[data-key="resultTag"]').count() === 0);
await page.click(W2 + '[data-tr-act="save"]');
const h = (await trades()).find(x => x.pair === 'EURUSD');
check('保留も💾で記録', h && h.result === 'hold' && h.tradeType === 'demo' && h.pnlAmount === 0 && h.exitDatetime === '');

// 8. 🧹で控えを空に
await page.click(W2 + '[data-trend-goto-board="w2"]');
await page.click('[data-tr-draft="w2"][data-key="tradeType"][data-value="real"]');
await page.click(W2 + '[data-tr-act="clear"]');
check('🧹で控えが空になる', await page.locator(W2 + '[data-key="tradeType"].on').count() === 0);

// 9. 375pxで横スクロールなし
check('375pxで横スクロールなし', await page.evaluate(() => document.documentElement.scrollWidth <= 375));

check('コンソールエラーなし', errors.length === 0);
if (errors.length) console.log(errors);
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
