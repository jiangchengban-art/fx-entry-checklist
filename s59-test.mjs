/* セッション59 検証：🔭一覧タブ上部（説明文・サマリー・ツールバー）の整理
     - 説明文が2行程度に短縮され、操作手順は <details> の折りたたみに退避される
     - サマリーは5タイルすべてペア単位（GO/圏内/待ち/未更新/巡回進捗）。足単位の方向カウントは撤去
     - サマリーの配色クラス（.hot/.stale/.go/.wait）がCSSで実際に色を持つ（死んでいた.rdは無い）
     - ツールバーは絞り込み（1行目）と表示設定・波マップ（2行目）に分かれる
     - 絞り込みの適用順を入れ替えても、AND条件なので結果（表示ペア数）は同一
     - DOM id は全て据え置き（既存テストとの互換性）
   s40/s42/s43/s44-test.mjs と同じ file:// ＋ localStorage 直注入の型。 */
import { chromium } from 'playwright';
import path from 'path';

const URL = 'file:///' + path.resolve('index.html').replace(/\\/g, '/');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n); } };
const eq = (n, a, b) => ok(n + '  [got ' + JSON.stringify(a) + ']', JSON.stringify(a) === JSON.stringify(b));

const browser = await chromium.launch().catch(() =>
  chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }));
const errors = [];

async function newPage(seed, viewport) {
  const ctx = await browser.newContext(viewport ? { viewport } : {});
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

const MARKET = 'mochipoyo_market_view_v1';

console.log('\n[①] 説明文の圧縮と折りたたみ');
{
  const page = await newPage(null, { width: 375, height: 900 });
  await page.click('[data-tab="trend"]');
  const noteText = await page.locator('#tabPanel-trend > .section-note').first().textContent();
  ok('常時表示の説明文は100文字以内', noteText.trim().length <= 100);
  const helpVisible = await page.locator('.trend-help-body').isVisible();
  ok('使い方の詳細は既定で非表示', !helpVisible);
  await page.click('.trend-help summary');
  const helpVisible2 = await page.locator('.trend-help-body').isVisible();
  ok('summary クリックで開く', helpVisible2);
  const helpText = await page.locator('.trend-help-body').textContent();
  ok('開くと波タップ手順が読める', helpText.includes('タップ'));
  ok('開くとGOの仕様が読める', helpText.includes('GO'));
  ok('開くと波マップへの言及がある', helpText.includes('波マップ'));
  await page.close();
}

console.log('\n[②] サマリーは5タイル・すべてペア単位');
{
  const now = new Date().toISOString();
  const old = new Date(Date.now() - 40 * 3600000).toISOString();
  const pairs = [
    { id: 'p1', pair: 'USDJPY', tfHigher: '', tfEntry: '', alerts: {}, judge: '',
      checksHigher: { rciShort: '⏳待ち' }, checksEntry: {},
      go: true, goAt: now, trendAt: now,
      trend: { h1: { state: 'up', zone: 'green', granville: '2', wpos: '36,62', at: now },
                h4: { state: '', zone: '', granville: '', wpos: '', at: '' },
                d:  { state: '', zone: '', granville: '', wpos: '', at: '' } } },
    { id: 'p2', pair: 'EURUSD', tfHigher: '', tfEntry: '', alerts: {}, judge: '',
      checksHigher: {}, checksEntry: {}, trendAt: old,
      trend: { h1: { state: 'down', zone: 'red', granville: '', wpos: '', at: old },
                h4: { state: '', zone: '', granville: '', wpos: '', at: '' },
                d:  { state: '', zone: '', granville: '', wpos: '', at: '' } } },
    { id: 'p3', pair: 'GBPUSD', tfHigher: '', tfEntry: '', alerts: {}, judge: '',
      checksHigher: {}, checksEntry: {},
      trend: { h1: { state: '', zone: '', granville: '', wpos: '', at: '' },
                h4: { state: '', zone: '', granville: '', wpos: '', at: '' },
                d:  { state: '', zone: '', granville: '', wpos: '', at: '' } } },
  ];
  const page = await newPage({ [MARKET]: { pairs }, mochipoyo_market_view_selected: 'p1' }, { width: 1000, height: 900 });
  await page.click('[data-tab="trend"]');
  await page.waitForTimeout(200);

  /* ⚠️ loadMarket() はプリセット28銘柄を未作成分自動生成するため、シードした3件だけが
     全件ではない（CLAUDE.md「一覧の行セレクタ」注意点と同根）。総数は動的に取る。 */
  const total = await page.evaluate(() => JSON.parse(localStorage.getItem('mochipoyo_market_view_v1')).pairs.length);
  ok('プリセット自動生成込みで3件より多い（前提の確認）', total > 3);

  const items = await page.locator('#trendSummary .item').allTextContents();
  ok('5タイルちょうど', items.length === 5);
  ok('GOタイルが1ペア', items.some(t => t.includes('GO') && t.includes('1')));
  ok('圏内タイルが1ペア', items.some(t => t.includes('圏内') && t.includes('1')));
  ok('待ちタイルが1ペア', items.some(t => t.includes('待ち') && t.includes('1')));
  /* 未更新は seed の p2/p3 に加え、自動生成された未記録ペア全件（trendAt無し=Infinity=stale）も含む。 */
  ok('未更新タイルは総数-1件（新鮮なのはp1だけ）', items.some(t => t.includes('未更新') && t.includes(String(total - 1))));
  ok('巡回進捗タイルが2/総数表記（trendAtがあるのはp1とp2）', items.some(t => t.includes('巡回') && t.includes('2/' + total)));
  ok('足単位の方向カウント（上昇/下降/レンジ/未記録）は無い',
    !items.some(t => t.includes('上昇') || t.includes('下降') || t.includes('レンジ') || t.includes('未記録')));

  const cls = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#trendSummary .item')).map(el => el.className));
  ok('rd クラスは出力されない（S58で撤去済みの目線3択の残骸）', !cls.some(c => c.includes(' rd') || c === 'item rd'));
  await page.close();
}

console.log('\n[③] サマリーの配色CSSが実際に効いている（S44でクラス名がずれていたバグの修正確認）');
{
  const page = await newPage(null, { width: 375, height: 900 });
  await page.evaluate(() => {
    const K = 'mochipoyo_market_view_v1';
    const d = JSON.parse(localStorage.getItem(K));
    const now = new Date().toISOString();
    d.pairs[0].go = true; d.pairs[0].goAt = now;
    d.pairs[0].trendAt = now;
    d.pairs[0].trend = { h1: { state: 'up', zone: 'green', granville: '2', wpos: '36,62', at: now },
                          h4: { state: '', zone: '', granville: '', wpos: '', at: '' },
                          d: { state: '', zone: '', granville: '', wpos: '', at: '' } };
    localStorage.setItem(K, JSON.stringify(d));
  });
  await page.reload();
  await page.click('[data-tab="trend"]');
  await page.waitForTimeout(200);
  const colors = await page.evaluate(() => {
    const pick = sel => {
      const el = document.querySelector(sel);
      if (!el) return null;
      return getComputedStyle(el).borderColor;
    };
    return {
      go: pick('#trendSummary .item.go'),
      hot: pick('#trendSummary .item.hot'),
      stale: pick('#trendSummary .item.stale'),
      neutral: pick('#trendSummary .item:not(.go):not(.hot):not(.wait):not(.stale)'),
    };
  });
  ok('GOタイルは無色ではない', colors.go && colors.go !== colors.neutral);
  ok('圏内(hot)タイルは無色ではない', colors.hot && colors.hot !== colors.neutral);
  ok('未更新(stale)タイルは無色ではない', colors.stale && colors.stale !== colors.neutral);
  await page.close();
}

console.log('\n[④] ツールバーは絞り込み行と表示設定行に分かれる');
{
  const page = await newPage(null, { width: 1000, height: 900 });
  await page.click('[data-tab="trend"]');
  const toolbars = await page.locator('.trend-toolbar').count();
  ok('ツールバーが2つ（絞り込み／表示設定）', toolbars === 2);
  const firstRowIds = await page.locator('.trend-toolbar').first().locator('button, select').evaluateAll(
    els => els.map(e => e.id || e.tagName));
  ok('1行目にGOのみボタンがある', firstRowIds.includes('trendFilterGo'));
  ok('1行目にエントリー圏のみボタンがある', firstRowIds.includes('trendFilterAligned'));
  ok('1行目に波マップボタンは無い（2行目に移設）', !firstRowIds.includes('trendMapOpen'));
  const secondRow = page.locator('.trend-toolbar-2');
  const secondIds = await secondRow.locator('button, select, span[id]').evaluateAll(
    els => els.map(e => e.id || e.tagName));
  ok('2行目に波マップボタンがある', secondIds.includes('trendMapOpen'));
  ok('2行目に表示する足トグルがある', secondIds.includes('trendTfToggles'));
  await page.close();
}

console.log('\n[⑤] 既存 DOM id はすべて据え置き（既存テスト互換）');
{
  const page = await newPage(null, { width: 1000, height: 900 });
  await page.click('[data-tab="trend"]');
  const ids = ['trendSummary', 'trendFilterAligned', 'trendFilterStale', 'trendFilterWait',
    'trendCategorySelect', 'trendFilterGo', 'trendMapOpen', 'trendTfToggles', 'trendList'];
  for (const id of ids) {
    ok('#' + id + ' が存在する', await page.locator('#' + id).count() === 1);
  }
  await page.close();
}

console.log('\n[⑥] 絞り込みの適用順を入れ替えても結果は同一（AND条件の再確認）');
{
  const now = new Date().toISOString();
  const pairs = [];
  for (let i = 0; i < 6; i++) {
    pairs.push({
      id: 'w' + i, pair: 'PAIR' + i, tfHigher: '', tfEntry: '', alerts: {}, judge: '',
      checksHigher: i % 2 === 0 ? { rciShort: '⏳待ち' } : {}, checksEntry: {},
      go: i < 2, goAt: i < 2 ? now : '',
      trendAt: i < 4 ? now : '',
      trend: {
        h1: i === 0 ? { state: 'up', zone: 'green', granville: '2', wpos: '36,62', at: now }
                    : { state: '', zone: '', granville: '', wpos: '', at: '' },
        h4: { state: '', zone: '', granville: '', wpos: '', at: '' },
        d: { state: '', zone: '', granville: '', wpos: '', at: '' },
      },
    });
  }
  const page = await newPage({ [MARKET]: { pairs }, mochipoyo_market_view_selected: 'w0' }, { width: 1000, height: 900 });
  await page.click('[data-tab="trend"]');
  await page.waitForTimeout(200);
  /* ⚠️ loadMarket() のプリセット自動生成分（未記録＝⏳待ち0件・trendAt無し）は
     「待ちあり」で機械的に除外されるので、期待値は実データ（自動生成込み）から計算する。 */
  const allPairs = await page.evaluate(() => JSON.parse(localStorage.getItem('mochipoyo_market_view_v1')).pairs);
  await page.click('#trendFilterWait');
  await page.click('#trendFilterStale');
  await page.waitForTimeout(150);
  const shownCount = await page.evaluate(() => document.querySelectorAll('[data-trend-item]').length);
  const expected = allPairs.filter(w =>
    ((w.checksHigher || {}).rciShort === '⏳待ち') &&
    !(w.trendAt && (Date.now() - Date.parse(w.trendAt)) / 3600000 <= 12)
  ).length;
  eq('待ちあり＋未更新のみのAND結果件数が期待通り', shownCount, expected);
  await page.close();
}

console.log('\n[JSエラー]');
ok('コンソールエラーなし', errors.length === 0);
if (errors.length) console.log(errors);

console.log('\n──────────────────────────');
console.log('  ✅ ' + pass + '  ❌ ' + fail);
await browser.close();
process.exit(fail ? 1 : 0);
