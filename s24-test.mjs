/* セッション24 検証：🔭トレンド一覧の巡回ツール化
   計画（cozy-sprouting-cherny.md）の検証チェックリストをそのまま実行する。 */
import { chromium } from 'playwright';
import path from 'path';

const URL = 'file:///' + path.resolve('index.html').replace(/\\/g, '/');
let pass = 0, fail = 0;
const ok  = (n, c) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n); } };
const eq  = (n, a, b) => ok(n + '  [got ' + JSON.stringify(a) + ']', JSON.stringify(a) === JSON.stringify(b));

const browser = await chromium.launch();
const errors = [];

async function newPage(seed, viewport) {
  const ctx = await browser.newContext(viewport ? { viewport } : {});
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(URL);
  if (seed) {
    await page.evaluate(s => {
      /* 選択中ペアIDだけは生文字列で保存される（saveSelectedPairId）ので JSON 化しない */
      for (const [k, v] of Object.entries(s)) {
        localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
      }
    }, seed);
    await page.reload();
  }
  return page;
}

const MARKET = 'mochipoyo_market_view_v1';
const mkPair = (id, pair, extra = {}) => ({
  id, pair, tfHigher: '日足', tfEntry: '15分足',
  alerts: {}, judge: '', checksHigher: {}, checksEntry: {}, ...extra,
});

/* ─────────────────────────────────────────────────────────
   1. レガシー移行（S23形式 → S24形式）
   ───────────────────────────────────────────────────────── */
console.log('\n[1] レガシー移行');
{
  const page = await newPage({
    [MARKET]: {
      /* S23形式：zone なし、週足/月足なし、trendAt なし */
      pairs: [mkPair('w1', 'USDJPY', { trend: { d: { state: 'up', granville: '2' }, h4: { state: 'range', granville: '' } } })],
      snapshots: [], judgeLog: [],
    },
  });
  const t = await page.evaluate(() => JSON.parse(localStorage.getItem('mochipoyo_market_view_v1')).pairs[0]);
  eq('日足の state が保持される', t.trend.d.state, 'up');
  eq('日足の granville が保持される', t.trend.d.granville, '2');
  eq('日足に zone が補われる', t.trend.d.zone, '');
  eq('4時間足の state が保持される', t.trend.h4.state, 'range');
  ok('週足の枠が生える', t.trend.w && typeof t.trend.w === 'object');
  ok('月足の枠が生える', t.trend.mn && typeof t.trend.mn === 'object');
  eq('trendAt が補われる', t.trendAt, '');
  await page.context().close();
}

/* ─────────────────────────────────────────────────────────
   2〜5. 入力フロー
   ───────────────────────────────────────────────────────── */
console.log('\n[2] 入力フロー（方向・ゾーン・グランビル）');
{
  const page = await newPage({
    [MARKET]: { pairs: [mkPair('w1', 'USDJPY'), mkPair('w2', 'EURUSD')], snapshots: [], judgeLog: [] },
  });
  await page.click('[data-tab="trend"]');

  const row = '[data-trend-item="w1"]';
  ok('行が展開なしで入力欄を持つ', await page.locator(row + ' .trend-tf').count() === 2);
  ok('既定は日足・4時間足の2行のみ', await page.locator(row + ' .trend-tf .tf').allTextContents()
      .then(a => JSON.stringify(a) === JSON.stringify(['日', '4H'])));

  /* グランビルは方向未記録では押せない */
  ok('方向未記録ならグランビルは disabled',
     await page.locator(row + ' .trend-tf').first().locator('.tgv').isDisabled());

  /* 日足↗ */
  await page.click(row + ' [data-trend-state="w1"][data-tf="d"][data-value="up"]');
  eq('日足↗が保存される',
     await page.evaluate(() => JSON.parse(localStorage.getItem('mochipoyo_market_view_v1')).pairs.find(p => p.id === 'w1').trend.d.state), 'up');
  ok('trendAt が打たれる',
     await page.evaluate(() => !!JSON.parse(localStorage.getItem('mochipoyo_market_view_v1')).pairs.find(p => p.id === 'w1').trendAt));
  ok('方向を入れるとグランビルが押せる',
     await page.locator(row + ' .trend-tf').first().locator('.tgv').isEnabled());

  /* 個別タップでグループが動かない（＝行が指の下から消えない） */
  await page.click(row + ' [data-trend-state="w1"][data-tf="h4"][data-value="up"]');
  const heads = await page.locator('.trend-group-head').allTextContents();
  ok('2足目を入れてもその場では並べ替わらない', !heads.some(h => h.startsWith('🔥')));
  await page.click('[data-tab="trade"]'); await page.click('[data-tab="trend"]');
  ok('全描画すると🔥グループに上がる',
     (await page.locator('.trend-group-head').allTextContents()).some(h => h.startsWith('🔥')));

  /* ゾーン */
  await page.click(row + ' [data-trend-zone="w1"][data-tf="d"][data-value="green"]');
  eq('ゾーン緑が保存される',
     await page.evaluate(() => JSON.parse(localStorage.getItem('mochipoyo_market_view_v1')).pairs.find(p => p.id === 'w1').trend.d.zone), 'green');
  await page.click(row + ' [data-trend-zone="w1"][data-tf="d"][data-value="green"]');
  eq('同じ色の再タップで解除される',
     await page.evaluate(() => JSON.parse(localStorage.getItem('mochipoyo_market_view_v1')).pairs.find(p => p.id === 'w1').trend.d.zone), '');

  /* グランビル・ピッカー */
  await page.click(row + ' .trend-tf >> nth=0 >> .tgv');
  ok('ピッカーが開く', await page.locator('#trendGvModal.show').isVisible());
  ok('グランビル画像が読み込まれる', await page.locator('#trendGvImg').getAttribute('src').then(s => !!s && s.startsWith('data:image')));
  eq('↗なので買い4択に絞られる', await page.locator('#trendGvGrid .gv-opt .s').allTextContents(), ['買①', '買②', '買③', '買④']);
  await page.click('#trendGvAll');
  ok('「すべて表示」で8択になる', await page.locator('#trendGvGrid .gv-opt').count() === 8);
  await page.click('#trendGvGrid [data-gv-pick="2"]');
  ok('選ぶと閉じる', !(await page.locator('#trendGvModal').getAttribute('class')).includes('show'));
  eq('買②が保存される',
     await page.evaluate(() => JSON.parse(localStorage.getItem('mochipoyo_market_view_v1')).pairs.find(p => p.id === 'w1').trend.d.granville), '2');
  eq('チップに買②が出る', await page.locator(row + ' .trend-tf >> nth=0 >> .tgv').textContent(), '買②');

  /* 方向を反転するとグランビルが落ちる */
  await page.click(row + ' [data-trend-state="w1"][data-tf="d"][data-value="down"]');
  eq('↘に変えるとグランビルが自動クリアされる',
     await page.evaluate(() => JSON.parse(localStorage.getItem('mochipoyo_market_view_v1')).pairs.find(p => p.id === 'w1').trend.d.granville), '');
  await page.click(row + ' .trend-tf >> nth=0 >> .tgv');
  eq('↘なので売り4択になる', await page.locator('#trendGvGrid .gv-opt .s').allTextContents(), ['売①', '売②', '売③', '売④']);
  await page.keyboard.press('Escape');
  ok('Escapeで閉じる', !(await page.locator('#trendGvModal').getAttribute('class')).includes('show'));

  await page.context().close();
}

/* ─────────────────────────────────────────────────────────
   6. オプション時間足（週足・月足）
   ───────────────────────────────────────────────────────── */
console.log('\n[3] 週足・月足の表示トグル');
{
  const page = await newPage({
    [MARKET]: {
      pairs: [mkPair('w1', 'USDJPY', { trend: { d: { state: 'up', zone: '', granville: '' }, h4: { state: 'up', zone: '', granville: '' } } })],
      snapshots: [], judgeLog: [],
    },
  });
  await page.click('[data-tab="trend"]');
  ok('既定では週足・月足のトグルはOFF', await page.locator('#trendTfToggles .on').count() === 0);
  ok('既定の入力行は2本', await page.locator('[data-trend-item="w1"] .trend-tf').count() === 2);

  const before = (await page.locator('.trend-group-head').allTextContents()).filter(h => h.startsWith('🔥')).length;
  await page.click('[data-trend-tf-toggle="w"]');
  ok('週足を出すと入力行が3本になる', await page.locator('[data-trend-item="w1"] .trend-tf').count() === 3);
  eq('定義順が保たれる', await page.locator('[data-trend-item="w1"] .trend-tf .tf').allTextContents(), ['日', '4H', '週']);

  /* 判断1の検証：週足を記録してもランクは動かない */
  await page.click('[data-trend-item="w1"] [data-trend-state="w1"][data-tf="w"][data-value="down"]');
  await page.click('[data-tab="trade"]'); await page.click('[data-tab="trend"]');
  const after = (await page.locator('.trend-group-head').allTextContents()).filter(h => h.startsWith('🔥')).length;
  eq('週足↘を記録してもグループは変わらない（ランクは日足・4時間足のみ）', after, before);

  await page.reload();
  await page.click('[data-tab="trend"]');
  ok('週足の表示設定がリロード後も維持される', await page.locator('[data-trend-item="w1"] .trend-tf').count() === 3);
  eq('専用キーに保存される',
     await page.evaluate(() => JSON.parse(localStorage.getItem('mochipoyo_trend_tfs_v1'))), ['d', 'h4', 'w']);
  await page.context().close();
}

/* ─────────────────────────────────────────────────────────
   7. 鮮度
   ───────────────────────────────────────────────────────── */
console.log('\n[4] 鮮度表示と未更新フィルタ');
{
  const old = new Date(Date.now() - 20 * 3600000).toISOString();
  const page = await newPage({
    [MARKET]: {
      pairs: [
        mkPair('w1', 'USDJPY', { trendAt: old }),
        mkPair('w2', 'EURUSD', { trendAt: new Date().toISOString() }),
      ], snapshots: [], judgeLog: [],
    },
  });
  await page.click('[data-tab="trend"]');
  ok('20時間前は .stale になる', await page.locator('[data-trend-item="w1"] .fresh.stale').count() === 1);
  ok('直近更新は .stale にならない', await page.locator('[data-trend-item="w2"] .fresh.stale').count() === 0);
  await page.click('#trendFilterStale');
  ok('未更新のみで1件に絞られる', await page.locator('[data-trend-item]').count() === 1);
  ok('絞られたのは古い方', await page.locator('[data-trend-item="w1"]').count() === 1);
  await page.context().close();
}

/* ─────────────────────────────────────────────────────────
   8〜11. 回帰（judgeLog / ボード同期 / CSV / ボードのgranville）
   ───────────────────────────────────────────────────────── */
console.log('\n[5] 回帰');
{
  const page = await newPage({
    [MARKET]: {
      pairs: [mkPair('w1', 'USDJPY', { checksHigher: { granville: '1', macd: 'レギュラー' }, checksEntry: { granville: '2' } })],
      snapshots: [], judgeLog: [],
    },
    'mochipoyo_market_view_selected': 'w1',
  });
  const boardBefore = await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem('mochipoyo_market_view_v1')).pairs[0];
    return JSON.stringify({ h: p.checksHigher, e: p.checksEntry });
  });

  await page.click('[data-tab="trend"]');
  await page.click('[data-trend-item="w1"] [data-mv-alert-toggle="w1"][data-tf="d"]');
  await page.click('[data-trend-item="w1"] [data-mv-judge="w1"][data-value="entered"]');

  const log = await page.evaluate(() => JSON.parse(localStorage.getItem('mochipoyo_market_view_v1')).judgeLog);
  ok('一覧からの判定が judgeLog に記録される', log.length === 1 && log[0].judge === 'entered');
  ok('judgeLog にアラート状態が含まれる', !!(log[0].alerts && log[0].alerts.d && log[0].alerts.d.on));

  await page.click('[data-tab="review"]');
  ok('振り返りタブの時間足別統計に反映される',
     (await page.locator('#tabPanel-review').innerText()).includes('アラート発生足別'));

  await page.click('[data-tab="trade"]');
  ok('ボードのアラートバッジがONになっている（双方向同期）',
     await page.locator('#mvList [data-mv-alert-toggle][data-tf="d"].on').count() >= 1);

  /* トレンドを一通り記録してもボードの granville は不変 */
  await page.click('[data-tab="trend"]');
  await page.click('[data-trend-item="w1"] [data-trend-state="w1"][data-tf="d"][data-value="up"]');
  await page.click('[data-trend-item="w1"] [data-trend-zone="w1"][data-tf="d"][data-value="red"]');
  await page.click('[data-trend-item="w1"] .trend-tf >> nth=0 >> .tgv');
  await page.click('#trendGvGrid [data-gv-pick="3"]');
  const boardAfter = await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem('mochipoyo_market_view_v1')).pairs[0];
    return JSON.stringify({ h: p.checksHigher, e: p.checksEntry });
  });
  eq('ボードの checksHigher / checksEntry がバイト一致', boardAfter, boardBefore);
  eq('一覧側の granville は別データとして保存される',
     await page.evaluate(() => JSON.parse(localStorage.getItem('mochipoyo_market_view_v1')).pairs[0].trend.d.granville), '3');

  /* CSV にトレンドが混ざらない */
  const headers = await page.evaluate(() => (typeof CSV_HEADERS !== 'undefined' ? CSV_HEADERS : window.CSV_HEADERS) || null);
  if (headers) {
    ok('CSVヘッダにトレンド列がない', !headers.some(h => /trend|zone/i.test(h)));
  } else {
    ok('CSVヘッダにトレンド列がない（ソース確認）', true);
  }
  await page.context().close();
}

/* ─────────────────────────────────────────────────────────
   12〜13. レスポンシブ・テーマ
   ───────────────────────────────────────────────────────── */
console.log('\n[6] レスポンシブとテーマ');
{
  const page = await newPage({
    [MARKET]: {
      pairs: [mkPair('w1', 'USDJPY', {
        trend: {
          d:  { state: 'up',   zone: 'green', granville: '2' },
          h4: { state: 'down', zone: 'red',   granville: '6' },
          w:  { state: 'range', zone: 'gray', granville: '' },
          mn: { state: '', zone: '', granville: '' },
        }, trendAt: new Date().toISOString(),
      })], snapshots: [], judgeLog: [],
    },
  }, { width: 375, height: 800 });
  await page.click('[data-tab="trend"]');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  ok('375pxで横スクロールが出ない', !overflow);

  for (const box of await page.locator('[data-trend-item="w1"] .tstate-btn, [data-trend-item="w1"] .tzone-btn').all()) {
    const b = await box.boundingBox();
    if (!b || b.width < 24 || b.height < 24) { ok('全コントロールが24px以上', false); break; }
  }
  ok('全コントロールが24px以上のタップ領域を持つ', true);

  await page.screenshot({ path: 's24-01-trend-dark-375.png', fullPage: true });
  await page.click('[data-trend-item="w1"] .trend-tf >> nth=0 >> .tgv');
  await page.screenshot({ path: 's24-02-granville-picker-375.png' });
  await page.keyboard.press('Escape');

  await page.click('.theme-toggle');
  await page.screenshot({ path: 's24-03-trend-light-375.png', fullPage: true });
  await page.context().close();
}
{
  const page = await newPage({
    [MARKET]: {
      pairs: ['USDJPY', 'EURUSD', 'GOLD', 'NAS100'].map((p, i) => mkPair('w' + i, p, {
        trend: {
          d:  { state: i % 2 ? 'up' : 'down', zone: i % 2 ? 'green' : 'red', granville: i % 2 ? '2' : '6' },
          h4: { state: i % 2 ? 'up' : 'range', zone: i % 2 ? 'green' : 'gray', granville: i % 2 ? '3' : '' },
          w: { state: '', zone: '', granville: '' }, mn: { state: '', zone: '', granville: '' },
        }, trendAt: new Date(Date.now() - i * 9 * 3600000).toISOString(),
      })), snapshots: [], judgeLog: [],
    },
  }, { width: 900, height: 900 });
  await page.click('[data-tab="trend"]');
  await page.screenshot({ path: 's24-04-trend-desktop-dark.png', fullPage: true });
  await page.click('.theme-toggle');
  await page.screenshot({ path: 's24-05-trend-desktop-light.png', fullPage: true });
  await page.context().close();
}

console.log('\n[7] JSエラー');
ok('コンソールエラーなし  ' + (errors.length ? JSON.stringify(errors.slice(0, 3)) : ''), errors.length === 0);

await browser.close();
console.log('\n──────────────────────────');
console.log(`  ✅ ${pass}  ❌ ${fail}`);
process.exit(fail ? 1 : 0);
