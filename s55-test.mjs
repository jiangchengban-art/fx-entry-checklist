/* S55 スモークテスト：🎯タブ廃止・🔭一覧からモーダルで記録フォームを開く */
import { chromium } from 'playwright';
import path from 'path';

const URL = 'file:///' + path.resolve('c:/Users/owner/fx-entry-checklist/index.html').replace(/\\/g, '/');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n); } };
const eq = (n, a, b) => ok(n + '  [got ' + JSON.stringify(a) + ']', JSON.stringify(a) === JSON.stringify(b));

const browser = await chromium.launch().catch(() =>
  chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }));
const errors = [];

const MARKET = 'mochipoyo_market_view_v1';
const SELECTED = 'mochipoyo_market_view_selected';
const mkPair = (id, pair, extra = {}) => ({
  id, pair, tfHigher: '週足', tfEntry: '15分足', judge: 'entered', alerts: {},
  checksHigher: {}, checksEntry: {}, ...extra,
});

async function newPage(seed) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(URL);
  if (seed) {
    await page.evaluate(s => {
      for (const [k, v] of Object.entries(s)) {
        localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
      }
    }, seed);
    await page.reload();
  }
  return page;
}

console.log('\n[①] 🎯タブが存在しない・既定タブは一覧');
{
  const page = await newPage();
  eq('タブは3つ', await page.locator('.tab-btn').count(), 3);
  eq('🎯タブが無い', await page.locator('[data-tab="trade"]').count(), 0);
  ok('既定で一覧タブがアクティブ', await page.locator('[data-tab="trend"]').evaluate(el => el.classList.contains('active')));
  await page.context().close();
}

console.log('\n[②] 根拠パネル→「📝 記録フォームへ」でモーダルが開く');
{
  const page = await newPage({
    [MARKET]: { pairs: [mkPair('w1', 'USDJPY')], snapshots: [], judgeLog: [] },
    [SELECTED]: 'w1',
  });
  await page.click('[data-tab="trend"]');
  await page.click('[data-trend-panel-open="w1"]');
  await page.click('[data-trend-goto-form="w1"]');
  ok('モーダルが表示される', await page.locator('#tradeModal').evaluate(el => el.classList.contains('show')));
  ok('一覧タブはアクティブのまま', await page.locator('[data-tab="trend"]').evaluate(el => el.classList.contains('active')));
  ok('通貨ペアがUSDJPYで表示される', (await page.textContent('#formMarketSummary')).includes('USDJPY'));

  /* 新規保存 */
  await page.click('#tradeTypeToggle [data-value="demo"]');
  const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  await page.fill('#fDatetime', now.toISOString().slice(0, 16));
  await page.selectOption('#fDirection', 'long');
  await page.click('#resultTagToggle [data-value="reg"]');
  await page.fill('#fPnl', '12000');
  await page.click('#beTouchToggle [data-value="none"]');
  await page.click('#formSubmitBtn');
  ok('保存後モーダルが閉じる', !(await page.locator('#tradeModal').evaluate(el => el.classList.contains('show'))));

  await page.click('[data-tab="review"]');
  const list = await page.textContent('#recordList');
  ok('振り返りタブの履歴にUSDJPYが載る', list.includes('USDJPY'));
  await page.context().close();
}

console.log('\n[③] ヘッダの「→」ボタンでもモーダルが開く');
{
  const page = await newPage({
    [MARKET]: { pairs: [mkPair('w1', 'EURUSD')], snapshots: [], judgeLog: [] },
    [SELECTED]: 'w1',
  });
  await page.click('[data-tab="trend"]');
  await page.click('[data-trend-goto-board="w1"]');
  ok('モーダルが表示される', await page.locator('#tradeModal').evaluate(el => el.classList.contains('show')));
  await page.click('#tradeModalClose');
  ok('✕ボタンでモーダルが閉じる', !(await page.locator('#tradeModal').evaluate(el => el.classList.contains('show'))));
  await page.context().close();
}

console.log('\n[④] 編集ボタンでモーダルが開く');
{
  const page = await newPage({
    [MARKET]: { pairs: [mkPair('w1', 'GBPUSD')], snapshots: [], judgeLog: [] },
    [SELECTED]: 'w1',
  });
  await page.click('[data-tab="trend"]');
  await page.click('[data-trend-panel-open="w1"]');
  await page.click('[data-trend-goto-form="w1"]');
  await page.click('#tradeTypeToggle [data-value="demo"]');
  const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  await page.fill('#fDatetime', now.toISOString().slice(0, 16));
  await page.selectOption('#fDirection', 'short');
  await page.click('#resultTagToggle [data-value="max"]');
  await page.fill('#fPnl', '5000');
  await page.click('#beTouchToggle [data-value="touched"]');
  await page.click('#formSubmitBtn');

  await page.click('[data-tab="review"]');
  await page.click('[data-edit]');
  ok('編集で再びモーダルが開く', await page.locator('#tradeModal').evaluate(el => el.classList.contains('show')));
  eq('編集バッジが出る', await page.locator('#editModeBadge').evaluate(el => el.classList.contains('hidden')), false);
  await page.context().close();
}

console.log('\n[⑤] 背景クリック・Escapeで閉じる');
{
  const page = await newPage({
    [MARKET]: { pairs: [mkPair('w1', 'AUDUSD')], snapshots: [], judgeLog: [] },
    [SELECTED]: 'w1',
  });
  await page.click('[data-tab="trend"]');
  await page.click('[data-trend-goto-board="w1"]');
  await page.locator('#tradeModal').click({ position: { x: 5, y: 5 } });
  ok('背景クリックで閉じる', !(await page.locator('#tradeModal').evaluate(el => el.classList.contains('show'))));

  await page.click('[data-trend-goto-board="w1"]');
  await page.keyboard.press('Escape');
  ok('Escapeで閉じる', !(await page.locator('#tradeModal').evaluate(el => el.classList.contains('show'))));
  await page.context().close();
}

console.log('\n[JSエラー]');
ok('コンソールエラーなし  ' + JSON.stringify(errors), errors.length === 0);

console.log('\n──────────────────────────');
console.log('  ✅ ' + pass + '  ❌ ' + fail);
await browser.close();
process.exit(fail ? 1 : 0);
