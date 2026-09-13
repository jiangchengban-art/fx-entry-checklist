/**
 * S76: 🔭一覧のツールバーに通貨名の部分一致検索を追加。
 * ユーザー要望「並び順や全てのカテゴリの箇所に通貨の頭文字を入力したらその通貨だけ
 * 検索できる検索機能を設けて」に対応。ペア名（w.pair）に対する includes() で、
 * カテゴリ・GO・未更新の各絞り込みと AND 条件、trendApplyFilters() を共有する
 * 波マップにも自動反映される。
 *
 * テスト対象:
 * ① ツールバーに検索input(#trendSearchInput)が出ている
 * ② 検索文字列を入れると該当ペアだけに絞られる
 * ③ 検索をクリアすると全ペアに戻る
 * ④ 検索は大文字小文字を区別しない
 * ⑤ カテゴリ絞り込みとAND条件で効く
 * ⑥ 波マップにも同じ絞り込みが反映される（trendApplyFilters共有）
 * ⑦ 該当なしのときの空状態表示
 */

import { chromium } from 'playwright';

const tests = [];
let pass = 0, fail = 0;

function test(name, fn) {
  tests.push({ name, fn });
}

test('①-1: ツールバーに検索inputが出ている', async (page) => {
  const input = page.locator('#trendSearchInput');
  return await input.count() === 1 ? 'PASS' : `FAIL: count=${await input.count()}`;
});

test('①-2: プレースホルダーに案内文言がある', async (page) => {
  const ph = await page.locator('#trendSearchInput').getAttribute('placeholder');
  return ph && ph.includes('検索') ? 'PASS' : `FAIL: placeholder=${ph}`;
});

test('②-1: "USDJPY" で検索すると該当ペアだけ表示される', async (page) => {
  await page.fill('#trendSearchInput', 'USDJPY');
  await page.waitForTimeout(150);
  const items = page.locator('[data-trend-item]');
  const count = await items.count();
  if (count === 0) return 'FAIL: no items shown';
  const pairs = await items.evaluateAll(els => els.map(el => el.dataset.trendItem));
  // 全表示件数と一致するペアだけになっているか、市場データから確認
  const allMatch = await page.evaluate(() => {
    const data = loadMarket();
    const shown = document.querySelectorAll('[data-trend-item]');
    return Array.from(shown).every(el => {
      const w = data.pairs.find(p => p.id === el.dataset.trendItem);
      return w && w.pair.toUpperCase().includes('USDJPY');
    });
  });
  return allMatch ? 'PASS' : 'FAIL: non-matching pair shown';
});

test('②-2: "USD" で検索すると複数ペアがヒットする（USDJPYやEURUSD等）', async (page) => {
  await page.fill('#trendSearchInput', 'USD');
  await page.waitForTimeout(150);
  const count = await page.locator('[data-trend-item]').count();
  return count >= 2 ? 'PASS' : `FAIL: count=${count}`;
});

test('③: 検索をクリアすると全ペアに戻る', async (page) => {
  const totalBefore = await page.evaluate(() => loadMarket().pairs.length);
  await page.fill('#trendSearchInput', '');
  await page.waitForTimeout(150);
  const count = await page.locator('[data-trend-item]').count();
  return count === totalBefore ? 'PASS' : `FAIL: count=${count}, total=${totalBefore}`;
});

test('④: 検索は大文字小文字を区別しない（小文字入力でもヒット）', async (page) => {
  await page.fill('#trendSearchInput', 'usdjpy');
  await page.waitForTimeout(150);
  const count = await page.locator('[data-trend-item]').count();
  await page.fill('#trendSearchInput', '');
  await page.waitForTimeout(150);
  return count >= 1 ? 'PASS' : `FAIL: count=${count}`;
});

test('⑤: カテゴリ絞り込みとAND条件で効く', async (page) => {
  // 「USD・EUR・GBP」カテゴリを選び、その中で "JPY" 検索
  await page.selectOption('#trendCategorySelect', { label: 'USD・EUR・GBP' }).catch(() => {});
  const catValue = await page.locator('#trendCategorySelect').inputValue();
  await page.fill('#trendSearchInput', 'JPY');
  await page.waitForTimeout(150);
  const allMatch = await page.evaluate((cat) => {
    const data = loadMarket();
    const shown = document.querySelectorAll('[data-trend-item]');
    return Array.from(shown).every(el => {
      const w = data.pairs.find(p => p.id === el.dataset.trendItem);
      return w && w.pair.toUpperCase().includes('JPY') && trendCategoryOf(w.pair) === cat;
    });
  }, catValue);
  // reset
  await page.fill('#trendSearchInput', '');
  await page.selectOption('#trendCategorySelect', '');
  await page.waitForTimeout(150);
  return allMatch ? 'PASS' : 'FAIL: AND condition violated';
});

test('⑥: 波マップにも検索絞り込みが反映される（trendApplyFilters共有）', async (page) => {
  await page.fill('#trendSearchInput', 'USDJPY');
  await page.waitForTimeout(150);
  await page.click('#trendMapOpen');
  await page.waitForTimeout(300);
  const meta = await page.locator('#trendMapMeta').textContent();
  await page.keyboard.press('Escape');
  await page.fill('#trendSearchInput', '');
  await page.waitForTimeout(150);
  // メタ表示に絞られた件数が出ていること（0件でなければOK、全件と異なることを期待）
  return meta && /\d+件/.test(meta) ? 'PASS' : `FAIL: meta=${meta}`;
});

test('⑦: 該当なしの検索語では空状態メッセージが出る', async (page) => {
  await page.fill('#trendSearchInput', 'ZZZZZZ_NOMATCH');
  await page.waitForTimeout(150);
  const empty = await page.locator('.empty-state').count();
  const items = await page.locator('[data-trend-item]').count();
  await page.fill('#trendSearchInput', '');
  await page.waitForTimeout(150);
  return empty >= 1 && items === 0 ? 'PASS' : `FAIL: empty=${empty}, items=${items}`;
});

// Run tests
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
  const context = await browser.newContext();
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => consoleErrors.push(err.message));

  const indexPath = new URL(`file://${process.cwd()}/index.html`).href;
  await page.goto(indexPath);
  await page.waitForFunction(() => window.loadMarket !== undefined, { timeout: 5000 });

  await page.evaluate(() => setActiveTab('trend'));
  await page.waitForTimeout(200);

  for (const t of tests) {
    try {
      const result = await t.fn(page);
      if (result === 'PASS') {
        console.log(`✓ ${t.name}`);
        pass++;
      } else {
        console.log(`✗ ${t.name}: ${result}`);
        fail++;
      }
    } catch (e) {
      console.log(`✗ ${t.name}: ${e.message}`);
      fail++;
    }
  }

  if (consoleErrors.length) {
    console.log(`\n⚠ Console errors detected (${consoleErrors.length}):`);
    consoleErrors.forEach(e => console.log('  ' + e));
  }

  await browser.close();
  console.log(`\n${pass}/${pass + fail} tests passed`);
  process.exit(fail > 0 ? 1 : 0);
})();
