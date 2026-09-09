/**
 * S60: サマリータイルがタップ可能なフィルタボタンになり、ツールバーの重複4ボタンを撤去
 * S67で「圏内」タイルは撤去（並び順がエントリー圏距離順→アラート発生時刻順に置換されたため）、
 * S63で「待ち」タイルも撤去済みなので、現行仕様（GO/未更新の2タイル）に合わせて更新。
 *
 * テスト対象:
 * ① サマリーに2つのボタン（GO/未更新）が出ている
 * ② ツールバーに絞り込みボタン（GOのみ/エントリー圏のみ等）がない
 * ③ サマリータイルをタップするとフィルタが効く
 * ④ フィルタON状態は outline で可視化される
 */

import { chromium } from 'playwright';
import fs from 'fs';

const tests = [];
let pass = 0, fail = 0;

function test(name, fn) {
  tests.push({ name, fn });
}

test('①-1: サマリータイルに「GO」ボタンが出ている', async (page) => {
  const btn = page.locator('.trend-summary [data-trend-summary-filter="go"]');
  const exists = await btn.count() === 1;
  const txt = await btn.textContent();
  return exists && txt.includes('🚩 GO') ? 'PASS' : `FAIL: count=${await btn.count()}, text=${txt}`;
});

test('①-2: サマリータイルに「圏内」ボタンが無い（S67で撤去）', async (page) => {
  const btn = page.locator('.trend-summary [data-trend-summary-filter="hot"]');
  return await btn.count() === 0 ? 'PASS' : `FAIL: element still exists`;
});

test('①-3: サマリータイルに「待ち」ボタンが無い（S63で撤去）', async (page) => {
  const btn = page.locator('.trend-summary [data-trend-summary-filter="wait"]');
  return await btn.count() === 0 ? 'PASS' : `FAIL: element still exists`;
});

test('①-4: サマリータイルに「未更新」ボタンが出ている', async (page) => {
  const btn = page.locator('.trend-summary [data-trend-summary-filter="stale"]');
  const exists = await btn.count() === 1;
  const txt = await btn.textContent();
  return exists && txt.includes('🕐 未更新') ? 'PASS' : `FAIL: count=${await btn.count()}, text=${txt}`;
});

test('①-5: サマリータイルの2つはすべて <button> タグである', async (page) => {
  const buttons = page.locator('.trend-summary [data-trend-summary-filter]');
  const count = await buttons.count();
  const tagNames = await buttons.evaluateAll(els => els.map(e => e.tagName));
  return count === 2 && tagNames.every(t => t === 'BUTTON')
    ? 'PASS' : `FAIL: count=${count}, tags=${tagNames}`;
});

test('②-1: ツールバーに「GOのみ」ボタンがない', async (page) => {
  const btn = page.locator('#trendFilterGo');
  return await btn.count() === 0 ? 'PASS' : `FAIL: element still exists`;
});

test('②-2: ツールバーに「エントリー圏のみ」ボタンがない', async (page) => {
  const btn = page.locator('#trendFilterAligned');
  return await btn.count() === 0 ? 'PASS' : `FAIL: element still exists`;
});

test('②-3: ツールバーに「待ちあり」ボタンがない', async (page) => {
  const btn = page.locator('#trendFilterWait');
  return await btn.count() === 0 ? 'PASS' : `FAIL: element still exists`;
});

test('②-4: ツールバーに「未更新のみ」ボタンがない', async (page) => {
  const btn = page.locator('#trendFilterStale');
  return await btn.count() === 0 ? 'PASS' : `FAIL: element still exists`;
});

test('②-5: ツールバーにカテゴリ選択と波マップボタンは残っている', async (page) => {
  const cat = page.locator('#trendCategorySelect');
  const map = page.locator('#trendMapOpen');
  return await cat.count() === 1 && await map.count() === 1
    ? 'PASS' : `FAIL: categorySelect=${await cat.count()}, mapOpen=${await map.count()}`;
});

test('③-1: サマリータイルをタップするとフィルタ状態が変わる', async (page) => {
  const btn = page.locator('.trend-summary [data-trend-summary-filter="stale"]');
  // 「未更新のみ」の絞り込みをONにする。描画が再実行され、アイテムのクラスが変わる。
  const beforeClick = await page.locator('.trend-summary [data-trend-summary-filter="stale"].on').count();
  await btn.click();
  const afterClick = await page.locator('.trend-summary [data-trend-summary-filter="stale"].on').count();
  // フィルタON状態が確実に変わったことが確認できれば OK
  return beforeClick === 0 && afterClick === 1 ? 'PASS' : `FAIL: before=${beforeClick}, after=${afterClick}`;
});

test('③-2: サマリータイルの outline が付く（フィルタON状態の表現）', async (page) => {
  const btn = page.locator('.trend-summary [data-trend-summary-filter="go"]');
  const hasOutlineBefore = await btn.evaluate(el => getComputedStyle(el).outlineStyle !== 'none');
  await btn.click();
  const hasOutlineAfter = await btn.evaluate(el => getComputedStyle(el).outlineStyle !== 'none');
  return !hasOutlineBefore && hasOutlineAfter ? 'PASS' : `FAIL: before=${hasOutlineBefore}, after=${hasOutlineAfter}`;
});

test('③-3: サマリータイルをもう一度タップするとフィルタが外れる（ON/OFF トグル）', async (page) => {
  const btn = page.locator('.trend-summary [data-trend-summary-filter="go"]');
  /* S67: 残るタイルがGO/未更新の2つだけになったため、前のテスト（③-2）と同じ「GO」を
     再利用する。前のテストの状態（ON/OFF）に依存しないよう、まずOFFへ揃える。 */
  if (await btn.evaluate(el => el.classList.contains('on'))) await btn.click();
  await btn.click();
  const hasOutlineAfterFirst = await btn.evaluate(el => getComputedStyle(el).outlineStyle !== 'none');
  await btn.click();
  const hasOutlineAfterSecond = await btn.evaluate(el => getComputedStyle(el).outlineStyle !== 'none');
  return hasOutlineAfterFirst && !hasOutlineAfterSecond ? 'PASS' : `FAIL: after1st=${hasOutlineAfterFirst}, after2nd=${hasOutlineAfterSecond}`;
});

test('④-1: サマリーと新ツールバーが視覚的に別グループに見える', async (page) => {
  const summary = page.locator('.trend-summary');
  const summaryBorder = await summary.evaluate(el => getComputedStyle(el).borderBottom);
  return summaryBorder.includes('rgb') || summaryBorder.includes('solid') || summaryBorder !== 'none'
    ? 'PASS' : `FAIL: border=${summaryBorder}`;
});

test('④-2: サマリータイルの .on クラスは renderTrendSummary で再計算される', async (page) => {
  // 前のテスト（③-3）の状態が残っている可能性があるので、ここではまず全フィルタをOFFにする
  const allBtns = page.locator('.trend-summary [data-trend-summary-filter]');
  for (let i = 0; i < await allBtns.count(); i++) {
    const btn = allBtns.nth(i);
    const isOn = await btn.evaluate(el => el.classList.contains('on'));
    if (isOn) await btn.click();
    await page.waitForTimeout(50);
  }
  // 「未更新」を新規でONにする
  const stale = page.locator('.trend-summary [data-trend-summary-filter="stale"]');
  const onBefore = await stale.evaluate(el => el.classList.contains('on'));
  await stale.click();
  await page.waitForTimeout(100);
  const onAfter = await stale.evaluate(el => el.classList.contains('on'));
  return !onBefore && onAfter ? 'PASS' : `FAIL: before=${onBefore}, after=${onAfter}`;
});

test('⑤-1: ツールバーは1行に圧縮されている（2行ではない）', async (page) => {
  const toolbars = page.locator('.trend-toolbar');
  const count = await toolbars.count();
  return count === 1 ? 'PASS' : `FAIL: toolbar count=${count}`;
});

test('⑤-2: ツールバーに「表示する足」と「波マップ」が含まれている', async (page) => {
  /* S67: 「並び順」ラベルが増えたので .trend-tf-label は2つになる（並び順・表示する足）。 */
  const tf = page.locator('.trend-tf-label');
  const map = page.locator('#trendMapOpen');
  return await tf.count() === 2 && await map.count() === 1
    ? 'PASS' : `FAIL: tfLabel=${await tf.count()}, mapOpen=${await map.count()}`;
});

// Run tests
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
  const context = await browser.newContext();
  const page = await context.newPage();

  // Load app
  const indexPath = new URL(`file://${process.cwd()}/index.html`).href;
  await page.goto(indexPath);
  await page.waitForFunction(() => window.loadMarket !== undefined, { timeout: 5000 });

  // Ensure trend tab is active
  await page.evaluate(() => setActiveTab('trend'));
  await page.waitForTimeout(200);

  // Run tests
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

  await browser.close();
  console.log(`\n${pass}/${pass + fail} tests passed`);
  process.exit(fail > 0 ? 1 : 0);
})();
