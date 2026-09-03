/* セッション42 検証：
     ① 波マップの日次記録（自動保存・プルーン・日付比較・軌跡）
     ② 波マップの単一銘柄モード（日足と4Hを同時表示）
     ③ グランビル・ピッカーのタップ不反応の修正
   s40-test.mjs と同じ file:// ＋ localStorage 直注入の型。 */
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
const mkPair = (id, pair, extra = {}) => ({
  id, pair, tfHigher: '日足', tfEntry: '15分足',
  alerts: {}, judge: '', checksHigher: {}, checksEntry: {}, ...extra,
});
const marketOf = (page) => page.evaluate(() =>
  JSON.parse(localStorage.getItem('mochipoyo_market_view_v1')));
const snapsOf = async (page) => (await marketOf(page)).snapshots;
const trendOf = (page, id, tf) => page.evaluate(([i, t]) => {
  const p = JSON.parse(localStorage.getItem('mochipoyo_market_view_v1')).pairs.find(x => x.id === i);
  return p.trend[t];
}, [id, tf]);

async function tapFig(page, sel, xPct, yPct) {
  const box = await page.locator(sel).boundingBox();
  await page.mouse.click(box.x + box.width * xPct / 100, box.y + box.height * yPct / 100);
}
/* ローカル日付（アプリの wmDayKey と同じ切り方） */
const dayKey = (offset = 0) => {
  const t = new Date(Date.now() + offset * 86400000);
  return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' +
         String(t.getDate()).padStart(2, '0');
};

/* ═════════════════════════════════════════════════════════
   ③ タップ不反応の修正
   ═════════════════════════════════════════════════════════ */
console.log('\n[③-1] 図のどこをタップしても必ず記録される');
{
  const page = await newPage({
    [MARKET]: {
      pairs: [mkPair('w1', 'USDJPY', { trend: { d: { state: 'up', zone: 'green', granville: '' } } })],
      snapshots: [], judgeLog: [],
    },
  }, { width: 375, height: 800 });
  await page.click('[data-tab="trend"]');
  await page.click('[data-trend-item="w1"] [data-trend-granville-open][data-tf="d"]');

  /* 売りアンカーの直上をタップしても、方向側（買い）へスナップして消えない */
  await tapFig(page, '#trendGvFig', 78, 22);      // 売②のアンカー直上
  const d = await trendOf(page, 'w1', 'd');
  ok('売②の真上でも買いの波にスナップ  [' + d.granville + ']', ['1', '2', '3', '4'].includes(d.granville));
  ok('wpos が残る（無反応にならない）', d.wpos !== '');

  /* 図の四隅・中央・折れ線上を広くなぞって、1点も落ちないことを確認する */
  const pts = [[3, 3], [50, 3], [97, 3], [3, 50], [50, 50], [97, 50],
               [3, 97], [50, 97], [97, 97], [86, 45], [59, 14], [25, 36]];
  let miss = 0;
  for (const [x, y] of pts) {
    await tapFig(page, '#trendGvFig', x, y);
    const t = await trendOf(page, 'w1', 'd');
    if (!t.granville || !t.wpos) { miss++; console.log('     ↳ 落ちた点: ' + x + ',' + y); }
  }
  eq('12点すべてで位置が記録される（不反応領域ゼロ）', miss, 0);
  await page.context().close();
}

/* S44: 8ボタン（と「売買8つすべて表示」）は撤去した。逆側ボタンという概念そのものが消えたので、
   ここでは「選択UIが残っていないこと」と「図のタップだけで完結すること」を見る。 */
console.log('\n[③-2] 選択ボタンは撤去され、記録経路は図のタップだけ');
{
  const page = await newPage({
    [MARKET]: {
      pairs: [mkPair('w1', 'USDJPY', { trend: { d: { state: 'up', zone: 'green', granville: '2' } } })],
      snapshots: [], judgeLog: [],
    },
  });
  await page.click('[data-tab="trend"]');
  await page.click('[data-trend-item="w1"] [data-trend-granville-open][data-tf="d"]');
  eq('8ボタンのグリッドが無い', await page.locator('#trendGvGrid').count(), 0);
  eq('「売買8つすべて表示」が無い', await page.locator('#trendGvAll').count(), 0);
  eq('波の選択ボタンが1つも無い', await page.locator('[data-gv-pick]').count(), 0);
  /* 図のタップは従来どおり効く（方向側へスナップ） */
  await tapFig(page, '#trendGvFig', 46, 39);
  eq('図のタップで波が変わる', (await trendOf(page, 'w1', 'd')).granville, '3');
  await page.context().close();
}

/* ═════════════════════════════════════════════════════════
   ① 日次記録
   ═════════════════════════════════════════════════════════ */
const seedTwo = (extra = {}) => ({
  [MARKET]: {
    pairs: [
      mkPair('w1', 'USDJPY', { trend: { d: { state: 'up', zone: 'green', granville: '2', wpos: '36.0,62.0' },
                                        h4: { state: 'up', zone: 'green', granville: '3' } } }),
      mkPair('w2', 'EURUSD', { trend: { d: { state: 'down', zone: 'red', granville: '6' } } }),
      mkPair('w3', 'GBPUSD', { trend: { d: { state: 'up', zone: 'green', granville: '' } } }),
    ],
    snapshots: [], judgeLog: [], ...extra,
  },
});

console.log('\n[①-1] 一覧タブを開くと今日の分が記録される');
{
  const page = await newPage(seedTwo());
  await page.click('[data-tab="trend"]');
  const s = await snapsOf(page);
  eq('レコードが1件できる', s.length, 1);
  eq('kind が wavemap', s[0].kind, 'wavemap');
  eq('day がローカル日付', s[0].day, dayKey());
  eq('波のある足だけが入る（USDJPY 日/4H＋EURUSD 日）', s[0].items.length, 3);
  ok('ペアは id ではなく名前で持つ', s[0].items.every(i => typeof i.p === 'string' && i.p.length > 2));
  eq('wpos は整数に丸める', s[0].items.find(i => i.p === 'USDJPY' && i.t === 'd').w, '36,62');
  eq('概算は wpos を持たない', s[0].items.find(i => i.p === 'USDJPY' && i.t === 'h4').w, '');

  /* 同じ日に2回開いても1件のまま（今日は常に上書き） */
  await page.click('[data-tab="trade"]');
  await page.click('[data-tab="trend"]');
  const s2 = await snapsOf(page);
  eq('同じ日に開き直しても1件のまま', s2.filter(x => x.day === dayKey()).length, 1);
  ok('at が更新される', Date.parse(s2[0].at) >= Date.parse(s[0].at));
  await page.context().close();
}

console.log('\n[①-2] 空の状態では今日を確定させない');
{
  const page = await newPage({
    [MARKET]: { pairs: [mkPair('w1', 'USDJPY')], snapshots: [], judgeLog: [] },
  });
  await page.click('[data-tab="trend"]');
  eq('波が1つも無ければ保存しない', (await snapsOf(page)).length, 0);
  await page.context().close();
}

console.log('\n[①-3] wmDayKey / wmPrune の単体');
{
  const page = await newPage(seedTwo());
  const r = await page.evaluate(() => {
    /* JST の朝9時（UTC 0時）をまたいでもローカル日付は変わらない＝UTC 切りではない */
    const morning = new Date(2026, 8, 2, 9, 30);
    const night   = new Date(2026, 8, 2, 23, 30);
    const kept = wmPrune([
      { id: 'a', kind: 'wavemap', day: wmDayKey() },
      { id: 'b', kind: 'wavemap', day: '2020-01-01' },
      { id: 'c', watchId: 'w1', at: '2020-01-01T00:00:00Z' },   /* kind なしの既存レコード */
    ]);
    return {
      morning: wmDayKey(morning), night: wmDayKey(night),
      keptIds: kept.map(x => x.id),
    };
  });
  eq('朝9時と夜で同じ日付になる（UTC 切りではない）', [r.morning, r.night], ['2026-09-02', '2026-09-02']);
  ok('古い wavemap は落ちる', !r.keptIds.includes('b'));
  ok('今日の wavemap は残る', r.keptIds.includes('a'));
  ok('kind なしの既存レコードは絶対に落とさない', r.keptIds.includes('c'));
  await page.context().close();
}

console.log('\n[①-4] プルーンが __bak を焼き潰さない');
{
  const page = await newPage(seedTwo({
    snapshots: [{ id: 'old', kind: 'wavemap', day: '2020-01-01', at: '2020-01-01T00:00:00Z', items: [] }],
  }));
  await page.click('[data-tab="trend"]');   /* 古い1件が落ち、今日の1件が入る＝件数は同じ */
  const bak = await page.evaluate(() => localStorage.getItem('mochipoyo_market_view_v1__bak'));
  ok('日次記録のプルーンでは __bak が作られない', bak === null);
  const s = await snapsOf(page);
  ok('古い wavemap は消えている', !s.some(x => x.day === '2020-01-01'));
  await page.context().close();
}

console.log('\n[①-5] 日付を戻すと前日＋軌跡が出る');
{
  const y = dayKey(-1);
  const page = await newPage(seedTwo({
    snapshots: [{
      id: 'y', kind: 'wavemap', day: y, at: y + 'T03:00:00Z',
      items: [
        /* USDJPY 日足だけが動いた。EURUSD は同じ位置のまま */
        { p: 'USDJPY', t: 'd', g: '1', w: '15,73', s: 'go' },
        { p: 'EURUSD', t: 'd', g: '6', w: '', s: 'wait' },
      ],
    }],
  }));
  await page.click('[data-tab="trend"]');
  await page.click('#trendMapOpen');
  ok('マップが開く', await page.locator('#trendMapModal.show').isVisible());
  eq('当日は2件（USDJPY / EURUSD の日足）', await page.locator('#trendMapDots .gv-dot:not(.prev)').count(), 2);
  eq('前日レイヤーが出る', await page.locator('#trendMapDots .gv-dot.prev').count(), 2);
  eq('動いた1本だけ線が引かれる', await page.locator('#trendMapTrail line').count(), 1);
  ok('注記に前日の日付が出る', (await page.locator('#trendMapNote').textContent()).includes(y));

  await page.click('#trendMapPrev');
  ok('日付ラベルが前日になる', (await page.locator('#trendMapDayLabel').textContent()) === y);
  ok('メタに時点が出る', (await page.locator('#trendMapMeta').textContent()).includes(y));
  ok('過去日では効かない絞り込みを明記する',
     (await page.locator('#trendMapNote').textContent()).includes('未更新のみ'));
  await page.click('#trendMapNext');
  eq('戻ると「今」に復帰', await page.locator('#trendMapDayLabel').textContent(), '今');
  await page.context().close();
}

console.log('\n[①-6] 📸 手動記録');
{
  const page = await newPage(seedTwo());
  await page.click('[data-tab="trend"]');
  await page.click('#trendMapOpen');
  await page.click('#trendMapShot');
  const s = await snapsOf(page);
  eq('今日の分は1件のまま（上書き）', s.filter(x => x.day === dayKey()).length, 1);
  ok('記録した旨が出る', (await page.locator('#toast').textContent()).includes('波マップを記録'));
  await page.context().close();
}

/* ═════════════════════════════════════════════════════════
   ② 単一銘柄モード
   ═════════════════════════════════════════════════════════ */
console.log('\n[②] 単一銘柄で日足と4Hを同時表示');
{
  const page = await newPage(seedTwo());
  await page.click('[data-tab="trend"]');
  const before = await page.locator('#trendList .trend-item').count();
  await page.click('#trendMapOpen');
  eq('全銘柄モードでは日足の2件', await page.locator('#trendMapDots .gv-dot:not(.prev)').count(), 2);

  await page.selectOption('#trendMapPairSelect', 'USDJPY');
  eq('USDJPY の日足と4Hが同時に出る', await page.locator('#trendMapDots .gv-dot:not(.prev)').count(), 2);
  const labels = await page.locator('#trendMapDots .gv-dot .nm').allTextContents();
  eq('ラベルが足名になる', labels.sort(), ['4H', '日']);
  eq('色が足ごとに分かれる（日足）', await page.locator('#trendMapDots .gv-dot.tf-d').count(), 1);
  eq('色が足ごとに分かれる（4H）', await page.locator('#trendMapDots .gv-dot.tf-h4').count(), 1);
  ok('足タブは選択不可になる', await page.locator('#trendMapTfs button[disabled]').count() > 0);
  ok('単一銘柄である旨の注記が出る',
     (await page.locator('#trendMapNote').textContent()).includes('単一銘柄'));
  eq('凡例にも足名が併記される',
     (await page.locator('#trendMapLegend button').allTextContents()).some(t => t.includes('USDJPY')), true);

  /* 一覧タブのフィルタを汚していないこと（trendApplyFilters 非汚染）。
     ⚠️ loadMarket() がプリセット28銘柄を自動生成するので、件数は seed の3件ではない。 */
  await page.click('#trendMapClose');
  eq('一覧の件数が変わらない', await page.locator('#trendList .trend-item').count(), before);

  await page.click('#trendMapOpen');
  eq('開き直すと全銘柄に戻る', await page.locator('#trendMapPairSelect').inputValue(), '');
  await page.context().close();
}

console.log('\n[JSエラー]');
ok('コンソールエラーなし  ' + errors.slice(0, 3).join(' / '), errors.length === 0);

console.log('\n──────────────────────────');
console.log('  ✅ ' + pass + '  ❌ ' + fail);
await browser.close();
process.exit(fail ? 1 : 0);
