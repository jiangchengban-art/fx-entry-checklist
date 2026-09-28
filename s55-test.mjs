/* S55 スモークテスト：🎯タブ廃止・記録フォームのモーダル（S94から🔭一覧はモーダルを使わず根拠パネルの💾で記録） */
import { chromium } from 'playwright';
import path from 'path';

const URL = 'file:///' + path.resolve('index.html').replace(/\\/g, '/');
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
  eq('タブは4つ（S88で⚡1分足を追加）', await page.locator('.tab-btn').count(), 4);
  eq('🎯タブが無い', await page.locator('[data-tab="trade"]').count(), 0);
  ok('既定で一覧タブがアクティブ', await page.locator('[data-tab="trend"]').evaluate(el => el.classList.contains('active')));
  await page.context().close();
}

/* 根拠パネルの記録欄で💾まで済ませる（S94）。ペアは judge='entered' で seed 済み */
async function recordViaPanel(page, id, dir, tag, pnl) {
  await page.click('[data-trend-goto-board="' + id + '"]');
  await page.click('[data-tr-draft="' + id + '"][data-key="tradeType"][data-value="demo"]');
  await page.click('[data-tr-draft="' + id + '"][data-key="direction"][data-value="' + dir + '"]');
  await page.click('[data-tr-draft="' + id + '"][data-key="resultTag"][data-value="' + tag + '"]');
  await page.fill('[data-tr-input="' + id + '"][data-key="pnl"]', pnl);
  await page.click('[data-tr-act="save"][data-id="' + id + '"]');
}

console.log('\n[②] 根拠パネルの💾でモーダルを開かずに記録できる（S94）');
{
  const page = await newPage({
    [MARKET]: { pairs: [mkPair('w1', 'USDJPY')], snapshots: [], judgeLog: [] },
    [SELECTED]: 'w1',
  });
  await page.click('[data-tab="trend"]');
  await page.click('[data-trend-panel-open="w1"]');
  eq('📝記録フォームへボタンは無い', await page.locator('[data-trend-goto-form]').count(), 0);
  await page.click('[data-trend-panel-open="w1"]');
  await recordViaPanel(page, 'w1', 'long', 'reg', '12000');
  ok('モーダルは開かない', !(await page.locator('#tradeModal').evaluate(el => el.classList.contains('show'))));
  ok('一覧タブはアクティブのまま', await page.locator('[data-tab="trend"]').evaluate(el => el.classList.contains('active')));

  await page.click('[data-tab="review"]');
  const list = await page.textContent('#recordList');
  ok('振り返りタブの履歴にUSDJPYが載る', list.includes('USDJPY'));
  await page.context().close();
}

console.log('\n[③] ヘッダの「→」ボタンは根拠パネル（記録欄つき）を開く（S94）');
{
  const page = await newPage({
    [MARKET]: { pairs: [mkPair('w1', 'EURUSD')], snapshots: [], judgeLog: [] },
    [SELECTED]: 'w1',
  });
  await page.click('[data-tab="trend"]');
  await page.click('[data-trend-goto-board="w1"]');
  ok('モーダルは開かない', !(await page.locator('#tradeModal').evaluate(el => el.classList.contains('show'))));
  eq('パネルが開く', await page.locator('[data-trend-item="w1"] .trend-panel').count(), 1);
  await page.click('[data-trend-goto-board="w1"]');
  eq('もう一度で閉じる', await page.locator('[data-trend-item="w1"] .trend-panel').count(), 0);
  await page.context().close();
}

console.log('\n[④] 編集ボタンでモーダルが開く');
{
  const page = await newPage({
    [MARKET]: { pairs: [mkPair('w1', 'GBPUSD')], snapshots: [], judgeLog: [] },
    [SELECTED]: 'w1',
  });
  await page.click('[data-tab="trend"]');
  await recordViaPanel(page, 'w1', 'short', 'max', '5000');

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
  await recordViaPanel(page, 'w1', 'long', 'reg', '1000');
  await page.click('[data-tab="review"]');
  await page.click('[data-edit]');
  await page.locator('#tradeModal').click({ position: { x: 5, y: 5 } });
  ok('背景クリックで閉じる', !(await page.locator('#tradeModal').evaluate(el => el.classList.contains('show'))));

  await page.click('[data-edit]');
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
