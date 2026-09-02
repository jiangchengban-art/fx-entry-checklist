/* セッション43 検証：🗺 波マップの「エントリー圏」可視化
     - 買②③ / 売②③（SETUP_GO_WAVES）のアンカー ± GV_ENTRY_RADIUS を圏として描く
     - 図の上でタップして記録した位置が圏内なら .hot で強調
     - 概算（ボタン選択のみ＝wpos 空）は位置を測っていないので圏内に数えない
   s42-test.mjs と同じ file:// ＋ localStorage 直注入の型。 */
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
const dTrend = (granville, wpos) => ({
  trend: { d: { state: 'up', zone: 'green', granville, wpos, at: new Date().toISOString() } },
  trendAt: new Date().toISOString(),
});

/* ⚠️ アンカー座標はテストに直書きしない。図を差し替えるたびに落ちる（S41 の再演）。
      アプリ側の定数を引いて、そこからの相対でタップ位置を組み立てる。 */
console.log('\n[0] 定数をアプリ側から引く');
const consts = await (async () => {
  const page = await newPage();
  const c = await page.evaluate(() => ({
    anchors: MV_GRANVILLE_ANCHORS, radius: GV_ENTRY_RADIUS,
    goWaves: SETUP_GO_WAVES,
    /* 距離関数がスナップと同じ素の % 距離であること */
    dAtAnchor2: gvEntryDistance(MV_GRANVILLE_ANCHORS['2'][0], MV_GRANVILLE_ANCHORS['2'][1]),
  }));
  await page.context().close();
  return c;
})();
ok('GV_ENTRY_RADIUS が引ける  [' + consts.radius + ']', typeof consts.radius === 'number');
eq('圏の波は SETUP_GO_WAVES と同一（買②③/売②③）', consts.goWaves, ['2', '3', '6', '7']);
eq('エントリーアンカー上での距離は 0', consts.dAtAnchor2, 0);

const A2 = consts.anchors['2'];
const R  = consts.radius;
const inPos  = (A2[0] + R * 0.3).toFixed(1) + ',' + A2[1].toFixed(1);              // 圏内
const outPos = (A2[0] - R * 1.6).toFixed(1) + ',' + (A2[1] + R * 0.8).toFixed(1);  // 圏外

const SEED = {
  [MARKET]: {
    pairs: [
      mkPair('w1', 'USDJPY', dTrend('2', inPos)),   // 圏内（タップ記録）
      mkPair('w2', 'EURUSD', dTrend('2', outPos)),  // 同じ波だが圏外
      mkPair('w3', 'GBPUSD', dTrend('2', '')),      // 概算（ボタン選択のみ）
    ],
    snapshots: [], judgeLog: [],
  },
};

async function openMap(viewport) {
  const page = await newPage(SEED, viewport);
  await page.click('[data-tab="trend"]');
  await page.click('#trendMapOpen');
  return page;
}

/* ═════════════════════════════════════════════════════════
   ① 圏の描画
   ═════════════════════════════════════════════════════════ */
console.log('\n[①] エントリー圏が図の上に敷かれる');
{
  const page = await openMap();
  eq('圏は SETUP_GO_WAVES の数だけ描かれる',
     await page.locator('#trendMapZones .gv-ezone').count(), consts.goWaves.length);

  /* ⚠️ 幅と高さは同じ「%」＝画面上は横長の楕円になるのが正しい
        （gvEntryDistance が測るのは % 空間の距離なので、画面上の正円だと判定とズレる）。 */
  const style = await page.locator('#trendMapZones .gv-ezone').first().getAttribute('style');
  ok('幅と高さが同じ % で指定される  [' + style + ']',
     style.includes('width:' + (R * 2) + '%') && style.includes('height:' + (R * 2) + '%'));

  const left = await page.locator('#trendMapZones .gv-ezone').first().evaluate(el => el.style.left);
  eq('圏の中心がアンカー座標に一致する', left, consts.anchors['2'][0] + '%');
  await page.context().close();
}

/* ═════════════════════════════════════════════════════════
   ② 圏内判定
   ═════════════════════════════════════════════════════════ */
console.log('\n[②] 圏内のドットだけが強調される');
{
  const page = await openMap();
  const dotOf = (pair) => page.locator('#trendMapDots .gv-dot', { hasText: pair }).first();

  eq('3件とも図に載る', await page.locator('#trendMapDots .gv-dot').count(), 3);
  ok('圏内のタップ記録は .hot',
     await dotOf('USDJPY').evaluate(el => el.classList.contains('hot')));
  ok('同じ波でも圏外なら .hot にならない',
     await dotOf('EURUSD').evaluate(el => !el.classList.contains('hot')));
  ok('概算（ボタン選択のみ）は波が買②でも .hot にならない',
     await dotOf('GBPUSD').evaluate(el => !el.classList.contains('hot')));
  ok('概算は従来どおり .approx のまま',
     await dotOf('GBPUSD').evaluate(el => el.classList.contains('approx')));
  eq('.hot は1件だけ', await page.locator('#trendMapDots .gv-dot.hot').count(), 1);

  eq('メタに圏内の件数が出る',
     (await page.locator('#trendMapMeta').textContent()).includes('🎯 1件'), true);
  ok('概算を数えない旨が注記に出る',
     (await page.locator('#trendMapNote').textContent()).includes('概算'));
  await page.context().close();
}

/* ═════════════════════════════════════════════════════════
   ③ 凡例
   ═════════════════════════════════════════════════════════ */
console.log('\n[③] 凡例の先頭に 🎯 圏内グループ');
{
  const page = await openMap();
  const first = page.locator('#trendMapLegend .grp').first();
  ok('先頭が 🎯 圏内グループ  [' + await first.locator('.gname').textContent() + ']',
     (await first.locator('.gname').textContent()).includes('🎯'));
  eq('件数が見出しに入る', (await first.locator('.gname').textContent()).includes('（1）'), true);
  eq('圏内のペアだけが並ぶ', await first.locator('.plist button').allTextContents(),
     ['USDJPY 買② 3%']);

  /* ⚠️ 押しても何も起きないボタンを出さない規約（S42-③ の再演を防ぐ）。 */
  const id = await first.locator('.plist button').first().getAttribute('data-map-goto');
  eq('data-map-goto にペアIDが入る', id, 'w1');
  await first.locator('.plist button').first().click();
  ok('押すと波マップが閉じて一覧へ戻る',
     !(await page.locator('#trendMapModal').evaluate(el => el.classList.contains('show'))));

  /* 波番号別のグループは従来どおり全件（圏内も圏外も）読める */
  await page.click('#trendMapOpen');
  const buy2 = page.locator('#trendMapLegend .grp').filter({ hasText: '買②' }).last();
  eq('買②グループには3件とも残る', await buy2.locator('.plist button').count(), 3);
  await page.context().close();
}

/* ═════════════════════════════════════════════════════════
   ④ 「🎯 エントリー圏のみ」トグル
   ═════════════════════════════════════════════════════════ */
console.log('\n[④] 圏内のみに絞り込める');
{
  const page = await openMap();
  eq('既定は OFF', await page.locator('#trendMapEntryOnly.on').count(), 0);

  await page.click('#trendMapEntryOnly');
  eq('ON で圏内だけになる', await page.locator('#trendMapDots .gv-dot').count(), 1);
  eq('ボタンに .on が付く', await page.locator('#trendMapEntryOnly.on').count(), 1);
  ok('絞り込み中である旨の注記が出る',
     (await page.locator('#trendMapNote').textContent()).includes('圏内の記録だけ'));

  await page.click('#trendMapEntryOnly');
  eq('OFF で戻る', await page.locator('#trendMapDots .gv-dot').count(), 3);

  /* ⚠️ 一覧タブのフィルタ（trendApplyFilters）を汚していないこと */
  await page.click('#trendMapEntryOnly');
  const before = await page.locator('#trendList .trend-item').count();
  await page.click('#trendMapClose');
  eq('一覧の件数が変わらない', await page.locator('#trendList .trend-item').count(), before);

  await page.click('#trendMapOpen');
  eq('開き直すと OFF に戻る', await page.locator('#trendMapEntryOnly.on').count(), 0);
  await page.context().close();
}

/* ═════════════════════════════════════════════════════════
   ⑤ 既存機能への非干渉（S42 の軌跡・単一銘柄モード）
   ═════════════════════════════════════════════════════════ */
console.log('\n[⑤] S42 の挙動を壊していない');
{
  const yesterday = (() => {
    const t = new Date(Date.now() - 86400000);
    return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' +
           String(t.getDate()).padStart(2, '0');
  })();
  const movedFrom = (A2[0] - 6).toFixed(1) + ',' + (A2[1] + 6).toFixed(1);
  const page = await newPage({
    [MARKET]: {
      pairs: [mkPair('w1', 'USDJPY', dTrend('2', inPos)), mkPair('w2', 'EURUSD', dTrend('2', outPos))],
      snapshots: [{
        id: 'wm_x', at: yesterday + 'T12:00:00.000Z', day: yesterday, kind: 'wavemap',
        items: [{ p: 'USDJPY', t: 'd', g: '2', w: movedFrom, s: 'go' }],
      }],
      judgeLog: [],
    },
  });
  await page.click('[data-tab="trend"]');
  await page.click('#trendMapOpen');
  eq('前日レイヤーが出る', await page.locator('#trendMapDots .gv-dot.prev').count(), 1);
  eq('動いたものに軌跡線が引かれる', await page.locator('#trendMapTrail line').count(), 1);
  /* ⚠️ 前日レイヤーまで光ると「今どこが圏内か」が読めなくなる */
  eq('前日レイヤーは .hot にならない',
     await page.locator('#trendMapDots .gv-dot.prev.hot').count(), 0);

  await page.selectOption('#trendMapPairSelect', 'USDJPY');
  eq('単一銘柄モードでも圏は残る', await page.locator('#trendMapZones .gv-ezone').count(), 4);
  ok('単一銘柄モードでも圏内判定は効く',
     await page.locator('#trendMapDots .gv-dot.hot').count() >= 1);
  await page.context().close();
}

/* ═════════════════════════════════════════════════════════
   ⑥ スマホ幅
   ═════════════════════════════════════════════════════════ */
console.log('\n[⑥] 375px で崩れない');
{
  const page = await openMap({ width: 375, height: 800 });
  const bar = await page.locator('.gv-mapbar').boundingBox();
  ok('ツールバーが横にはみ出さない  [' + Math.round(bar.width) + 'px]', bar.width <= 375);
  const btn = await page.locator('#trendMapEntryOnly').boundingBox();
  ok('🎯 ボタンが押せる大きさで表示される', btn && btn.width > 40 && btn.height > 20);
  await page.context().close();
}

console.log('\n[JSエラー]');
ok('コンソールエラーなし  ' + errors.slice(0, 3).join(' / '), errors.length === 0);

console.log('\n──────────────────────────');
console.log('  ✅ ' + pass + '  ❌ ' + fail);
await browser.close();
process.exit(fail ? 1 : 0);
