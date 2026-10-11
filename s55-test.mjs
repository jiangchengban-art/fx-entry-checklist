/* S55 スモークテスト：記録フォームのモーダル（S109: 新規記録は👀監視の「入った」、モーダルは✎編集用） */
import { chromium } from 'playwright';
import path from 'path';

const URL = 'file:///' + path.resolve('index.html').replace(/\\/g, '/');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n); } };
const eq = (n, a, b) => ok(n + '  [got ' + JSON.stringify(a) + ']', JSON.stringify(a) === JSON.stringify(b));

const browser = await chromium.launch().catch(() =>
  chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }));
const errors = [];

async function newPage() {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(URL);
  return page;
}

/* 👀監視の「入った」まで済ませる（S109）。4時間足のアラートが鳴った監視カードを作り、エントリー足（既定）と約定価格だけで記録 */
async function recordViaCard(page, pair, dir) {
  await page.evaluate(([pair, dir]) => {
    const now = new Date().toISOString();
    const c4 = () => ({ granville: false, rci: false, macd: false, neck: false });
    saveTrades([{ id: 'w_' + pair, kind: 'trendwatch', pair, cls: 'day', ng: c4(), mid: c4(), ok: c4(), notes: '',
                  alerts: { '4H': now }, alertSide: { '4H': dir }, createdAt: now, updatedAt: now }]);
    watchBoard.render();
  }, [pair, dir]);
  await page.click('.tab-btn[data-tab="watch"]');
  await page.click('#swList [data-sw] [data-sw-in-open]');
  await page.fill('#swList [data-sw-in="entry"]', '150.12');
  await page.click('#swList [data-sw-go]');
}

console.log('\n[①] 🎯タブが存在しない・既定タブは監視');
{
  const page = await newPage();
  eq('タブは4つ（監視/記録/振り返り/設定）', await page.locator('.tab-btn').count(), 4);
  eq('🎯タブが無い', await page.locator('[data-tab="trade"]').count(), 0);
  ok('既定で監視タブがアクティブ', await page.locator('[data-tab="watch"]').evaluate(el => el.classList.contains('active')));
  await page.context().close();
}

console.log('\n[②] 「入った」でモーダルを開かずに記録できる（S109）');
{
  const page = await newPage();
  await recordViaCard(page, 'USDJPY', 'long');
  ok('モーダルは開かない', !(await page.locator('#tradeModal').evaluate(el => el.classList.contains('show'))));
  ok('監視タブはアクティブのまま', await page.locator('[data-tab="watch"]').evaluate(el => el.classList.contains('active')));
  await page.click('[data-tab="review"]');
  ok('振り返りタブの履歴にUSDJPYが載る', (await page.textContent('#recordList')).includes('USDJPY'));
  await page.context().close();
}

console.log('\n[③] 編集ボタンでモーダルが開き、結果を後から入れられる');
{
  const page = await newPage();
  await recordViaCard(page, 'GBPUSD', 'short');
  await page.click('[data-tab="review"]');
  await page.click('[data-edit]');
  ok('編集で再びモーダルが開く', await page.locator('#tradeModal').evaluate(el => el.classList.contains('show')));
  eq('編集バッジが出る', await page.locator('#editModeBadge').evaluate(el => el.classList.contains('hidden')), false);
  ok('記録時の内容に上位足×エントリー足が出る', (await page.textContent('#formMarketSummary')).includes('4時間足'));
  await page.click('#resultTagToggle [data-value="reg"]');
  await page.fill('#fPnl', '12000');
  await page.click('#formSubmitBtn');
  const t = await page.evaluate(() => JSON.parse(localStorage.getItem('mochipoyo_trades_v1'))[0]);
  ok('結果と損益が後から入る', t.resultTag === 'reg' && t.pnlAmount === 12000 && t.pair === 'GBPUSD' && t.tfHigher === '4時間足');
  await page.context().close();
}

console.log('\n[④] 背景クリック・Escapeで閉じる');
{
  const page = await newPage();
  await recordViaCard(page, 'AUDUSD', 'long');
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
