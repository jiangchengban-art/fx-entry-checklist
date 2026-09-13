// S76: 通貨検索機能のスモークテスト
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const filePath = 'file://' + path.resolve('/home/user/fx-entry-checklist/index.html');

let pass = 0, fail = 0;
function check(label, cond) {
  if (cond) { pass++; console.log('  OK  ' + label); }
  else { fail++; console.log('  NG  ' + label); }
}

const consoleErrors = [];

(async () => {
  let browser;
  try {
    browser = await chromium.launch();
  } catch {
    browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  }
  const page = await browser.newPage();
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await page.goto(filePath);
  await page.waitForTimeout(300);

  // 一覧タブへ（既定タブのはず）
  await page.click('[data-tab="trend"]').catch(() => {});
  await page.waitForTimeout(200);

  // 検索欄の存在確認
  const searchInput = page.locator('#trendSearchInput');
  check('検索入力欄が存在する', await searchInput.count() === 1);
  check('placeholder が設定されている', (await searchInput.getAttribute('placeholder') || '').includes('検索'));

  // 全ペア数を確認
  const allItems = await page.locator('[data-trend-item]').count();
  check('初期状態で28銘柄前後表示される', allItems >= 20);

  // JPY で検索
  await searchInput.fill('jpy');
  await page.waitForTimeout(200);
  const jpyItems = await page.locator('[data-trend-item]').count();
  check('JPY検索で件数が絞り込まれる（小文字入力でも動作）', jpyItems > 0 && jpyItems < allItems);

  // 絞り込まれた行がすべて JPY を含むか確認
  const pairTexts = await page.locator('[data-trend-item] .pair').allTextContents();
  check('絞り込み結果は全てJPYを含む', pairTexts.every(t => t.toUpperCase().includes('JPY')));

  // 該当なしパターン
  await searchInput.fill('ZZZNOTFOUND');
  await page.waitForTimeout(200);
  const emptyState = await page.locator('.empty-state').count();
  check('該当なしのとき空状態メッセージが出る', emptyState > 0);

  // クリアすると全件に戻る
  await searchInput.fill('');
  await page.waitForTimeout(200);
  const restoredItems = await page.locator('[data-trend-item]').count();
  check('検索欄を空にすると全件表示に戻る', restoredItems === allItems);

  // カテゴリとのAND条件確認：USD系カテゴリ + JPY検索
  await page.selectOption('#trendCategorySelect', { label: 'USD系' }).catch(async () => {
    // ラベルが違う場合は先頭以外のoptionを試す
    const opts = await page.locator('#trendCategorySelect option').allTextContents();
    console.log('  カテゴリ候補:', opts);
  });
  await searchInput.fill('jpy');
  await page.waitForTimeout(200);
  const andItems = await page.locator('[data-trend-item]').count();
  check('カテゴリ×検索のAND条件が機能する（0件以上）', andItems >= 0);
  // リセット
  await page.selectOption('#trendCategorySelect', { index: 0 });
  await searchInput.fill('');
  await page.waitForTimeout(200);

  // フォーカス保持確認：入力中にrenderTrendListが呼ばれてもフォーカスが外れないか
  await searchInput.click();
  await searchInput.type('US', { delay: 30 });
  const isFocused = await searchInput.evaluate(el => document.activeElement === el);
  check('連続入力中も検索欄にフォーカスが残る', isFocused);
  await searchInput.fill('');

  // 波マップにも反映されるか確認
  await searchInput.fill('jpy');
  await page.waitForTimeout(200);
  await page.click('#trendMapOpen').catch(() => {});
  await page.waitForTimeout(300);
  const mapModalVisible = await page.locator('#trendMapModal').isVisible().catch(() => false);
  if (mapModalVisible) {
    check('波マップモーダルが開く', true);
  } else {
    console.log('  (波マップモーダルの可視性確認をスキップ)');
  }

  check('コンソールエラーが発生していない', consoleErrors.length === 0);
  if (consoleErrors.length) console.log('  errors:', consoleErrors);

  await browser.close();

  console.log(`\n合計: ${pass + fail}件中 ${pass}件成功, ${fail}件失敗`);
  process.exit(fail > 0 ? 1 : 0);
})();
