/* セッション40 検証：グランビル図のタップで波の位置を記録 ＋ 🗺 波マップ
   計画（4-dazzling-crayon.md）の検証チェックリストをそのまま実行する。 */
import { chromium } from 'playwright';
import path from 'path';

const URL = 'file:///' + path.resolve('index.html').replace(/\\/g, '/');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n); } };
const eq = (n, a, b) => ok(n + '  [got ' + JSON.stringify(a) + ']', JSON.stringify(a) === JSON.stringify(b));

/* 環境に置かれている Chromium が package.json の playwright と別ビルドのことがあるので、
   既定の探索に失敗したら実行ファイルを直接指す。 */
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
const trendOf = (page, id, tf) => page.evaluate(([i, t]) => {
  const p = JSON.parse(localStorage.getItem('mochipoyo_market_view_v1')).pairs.find(x => x.id === i);
  return p.trend[t];
}, [id, tf]);

/* 図の上の指定 %（画像座標）をクリックする。実機のタップと同じ経路を通す。 */
async function tapFig(page, sel, xPct, yPct) {
  const box = await page.locator(sel).boundingBox();
  await page.mouse.click(box.x + box.width * xPct / 100, box.y + box.height * yPct / 100);
}

const seedOne = (trend) => ({
  [MARKET]: { pairs: [mkPair('w1', 'USDJPY', trend ? { trend } : {})], snapshots: [], judgeLog: [] },
});

/* ─────────────────────────────────────────────────────────
   1. 移行：wpos を持たない旧データを読んでも壊れない
   ───────────────────────────────────────────────────────── */
console.log('\n[1] 移行（wpos なしの旧データ）');
{
  const page = await newPage(seedOne({
    d:  { state: 'up', zone: 'green', granville: '2' },   /* S39 以前の形（wpos なし） */
    h4: { state: 'range', zone: '', granville: '' },
  }));
  const d = await trendOf(page, 'w1', 'd');
  eq('既存の記録が保たれる', [d.state, d.zone, d.granville], ['up', 'green', '2']);
  eq('wpos が空文字で生える', d.wpos, '');
  const mn = await trendOf(page, 'w1', 'mn');
  eq('未定義の足にも wpos が生える', mn.wpos, '');
  await page.context().close();
}

/* ─────────────────────────────────────────────────────────
   2. 図のタップで波が決まる（375px）
   ───────────────────────────────────────────────────────── */
console.log('\n[2] 図のタップ（375px）');
{
  const page = await newPage(seedOne({ d: { state: 'up', zone: 'green', granville: '' } }),
                             { width: 375, height: 800 });
  await page.click('[data-tab="trend"]');
  await page.click('[data-trend-granville-open][data-tf="d"]');
  ok('ピッカーが開く', await page.locator('#trendGvModal.show').isVisible());
  ok('図がタップ面になっている', await page.locator('#trendGvFig.tappable').isVisible());
  eq('アンカーの目印が8つ出る', await page.locator('#trendGvAnchors .gv-anchor').count(), 8);
  ok('タップ前はマーカーが出ない', await page.locator('#trendGvMarker').isHidden());

  /* 買②のアンカー（37.9, 71.8）の少し手前をタップする */
  await tapFig(page, '#trendGvFig', 36, 70);
  const d = await trendOf(page, 'w1', 'd');
  eq('最寄りの買②が確定する', d.granville, '2');
  /* 実クリックはピクセル丸めで 1% 未満ずれる。位置が「タップしたところ」であることを見る。 */
  const p = d.wpos.split(',').map(Number);
  ok('タップ位置が wpos に残る  [' + d.wpos + ']',
     Math.abs(p[0] - 36) < 1 && Math.abs(p[1] - 70) < 1);
  ok('マーカーが出る', await page.locator('#trendGvMarker').isVisible());
  ok('スナップ結果が言語化される', (await page.textContent('#trendGvReadout')).includes('買②'));
  ok('タップしてもモーダルは閉じない（押し直せる）',
     await page.locator('#trendGvModal.show').isVisible());

  /* 押し直すと位置だけが動く */
  await tapFig(page, '#trendGvFig', 46, 39);
  const d2 = await trendOf(page, 'w1', 'd');
  eq('押し直すと買③へ移る', d2.granville, '3');
  ok('wpos も更新される', d2.wpos !== d.wpos);
  await page.context().close();
}

/* ─────────────────────────────────────────────────────────
   3. 方向と逆側をタップしても保存が消えない（自動クリアの回帰）
   ───────────────────────────────────────────────────────── */
console.log('\n[3] 逆側タップ（mvWriteTrend の自動クリア回避）');
{
  const page = await newPage(seedOne({ d: { state: 'up', zone: 'green', granville: '' } }),
                             { width: 375, height: 800 });
  await page.click('[data-tab="trend"]');
  await page.click('[data-trend-granville-open][data-tf="d"]');
  eq('既定の候補は買い4つだけ', await page.locator('#trendGvGrid .gv-opt').count(), 4);
  /* 売②のアンカー（74.2, 24.5）の上をタップする＝買いの候補しかないので買③あたりへ落ちる */
  await tapFig(page, '#trendGvFig', 74, 24);
  const d = await trendOf(page, 'w1', 'd');
  ok('買いの波にスナップする  [' + d.granville + ']', ['1', '2', '3', '4'].includes(d.granville));
  ok('保存直後に消えない', d.granville !== '' && d.wpos !== '');

  /* S42: 「売買8つすべて表示」はグリッドの見た目だけ。書き込み経路は方向側に絞ったまま */
  await page.click('#trendGvAll');
  eq('8択になる', await page.locator('#trendGvGrid .gv-opt').count(), 8);
  eq('逆側の4つは参考表示（.opp）', await page.locator('#trendGvGrid .gv-opt.opp').count(), 4);
  await tapFig(page, '#trendGvFig', 74, 24);
  const d2 = await trendOf(page, 'w1', 'd');
  ok('8択表示でもタップは買いの波にスナップする  [' + d2.granville + ']',
     ['1', '2', '3', '4'].includes(d2.granville));
  ok('保存直後に消えない（無反応領域がゼロ）', d2.granville !== '' && d2.wpos !== '');

  /* 逆側のボタンは書き込まずに理由を出す（押しても点かないボタンを残さない） */
  await page.click('#trendGvGrid .gv-opt.opp');
  const d3 = await trendOf(page, 'w1', 'd');
  eq('逆側ボタンを押しても波は変わらない', d3.granville, d2.granville);
  ok('代わりに理由が出る', await page.locator('#toast.show').count() === 1);
  await page.context().close();
}

/* ─────────────────────────────────────────────────────────
   4. 8ボタンは概算（wpos を空にする）
   ───────────────────────────────────────────────────────── */
console.log('\n[4] 8ボタンとの併用');
{
  const page = await newPage(seedOne({ d: { state: 'up', zone: 'green', granville: '' } }),
                             { width: 375, height: 800 });
  await page.click('[data-tab="trend"]');
  await page.click('[data-trend-granville-open][data-tf="d"]');
  await tapFig(page, '#trendGvFig', 36, 70);
  ok('タップで wpos が入る', (await trendOf(page, 'w1', 'd')).wpos !== '');
  await page.click('[data-gv-pick="3"]');
  const d = await trendOf(page, 'w1', 'd');
  eq('ボタンで波が変わる', d.granville, '3');
  eq('ボタン選択は概算なので wpos が消える', d.wpos, '');
  ok('ボタンでもモーダルは閉じない', await page.locator('#trendGvModal.show').isVisible());
  ok('マーカーはアンカー位置へ移る', await page.locator('#trendGvMarker').isVisible());

  /* クリアは両方落として閉じる */
  await page.click('#trendGvClear');
  const d2 = await trendOf(page, 'w1', 'd');
  eq('クリアで波が消える', d2.granville, '');
  eq('クリアで wpos も消える', d2.wpos, '');
  ok('クリアでモーダルが閉じる', await page.locator('#trendGvModal.show').isHidden());
  await page.context().close();
}

/* ─────────────────────────────────────────────────────────
   5. 行の表示（ミニ波形）と閉じたときの差し替え
   ───────────────────────────────────────────────────────── */
console.log('\n[5] 一覧行への反映');
{
  const page = await newPage(seedOne({ d: { state: 'up', zone: 'green', granville: '' } }),
                             { width: 900, height: 900 });
  await page.click('[data-tab="trend"]');
  const chip = '[data-trend-granville-open][data-tf="d"]';
  eq('記録前は「波?」', (await page.textContent(chip)).trim(), '波?');
  await page.click(chip);
  await tapFig(page, '#trendGvFig', 36, 70);
  await page.click('#trendGvCancel');
  ok('閉じると行のチップが更新される', (await page.textContent(chip)).includes('買②'));
  eq('タップ記録の行にはミニ波形が出る', await page.locator(chip + ' .gv-mini').count(), 1);

  /* ボタン選択に切り替えるとミニ波形が消える */
  await page.click(chip);
  await page.click('[data-gv-pick="3"]');
  await page.click('#trendGvCancel');
  eq('概算の行にはミニ波形を出さない', await page.locator(chip + ' .gv-mini').count(), 0);
  ok('文字ラベルは残る', (await page.textContent(chip)).includes('買③'));
  await page.context().close();
}

/* ─────────────────────────────────────────────────────────
   6. 方向の反転で波と位置がまとめて落ちる
   ───────────────────────────────────────────────────────── */
console.log('\n[6] 方向の反転');
{
  const page = await newPage(seedOne({ d: { state: 'up', zone: 'green', granville: '2', wpos: '36.0,70.0' } }),
                             { width: 900, height: 900 });
  await page.click('[data-tab="trend"]');
  await page.click('[data-trend-state="w1"][data-tf="d"][data-value="down"]');
  const d = await trendOf(page, 'w1', 'd');
  eq('反転で波が落ちる', d.granville, '');
  eq('反転で wpos も落ちる', d.wpos, '');
  await page.context().close();
}

/* ─────────────────────────────────────────────────────────
   7. 🗺 波マップ
   ───────────────────────────────────────────────────────── */
console.log('\n[7] 🗺 波マップ');
{
  const page = await newPage({
    [MARKET]: {
      pairs: [
        /* タップ記録あり＝実線 */
        mkPair('w1', 'USDJPY', { trend: { d: { state: 'up', zone: 'green', granville: '2', wpos: '36.0,70.0' } } }),
        /* ボタン選択のみ＝中空（アンカー位置に出る） */
        mkPair('w2', 'EURUSD', { trend: { d: { state: 'up', zone: 'green', granville: '3' } } }),
        /* 波が未記録＝載せない */
        mkPair('w3', 'GBPUSD', { trend: { d: { state: 'up', zone: 'green', granville: '' } } }),
      ],
      snapshots: [], judgeLog: [],
    },
  }, { width: 900, height: 900 });
  await page.click('[data-tab="trend"]');
  await page.click('#trendMapOpen');
  ok('マップが開く', await page.locator('#trendMapModal.show').isVisible());
  eq('記録のある2件だけ載る', await page.locator('#trendMapDots .gv-dot').count(), 2);
  eq('タップ記録は実線', await page.locator('#trendMapDots .gv-dot:not(.approx)').count(), 1);
  eq('ボタン選択は中空', await page.locator('#trendMapDots .gv-dot.approx').count(), 1);

  const approx = await page.locator('#trendMapDots .gv-dot.approx').getAttribute('style');
  /* アンカー座標は図を差し替えるたびに測り直すので、値を直書きせずアプリ側から引く */
  const anchor3 = await page.evaluate(() => MV_GRANVILLE_ANCHORS['3'][0]);
  ok('概算はアンカー座標に置かれる  [' + approx + ' / anchor ' + anchor3 + ']',
     approx.includes('left:' + anchor3 + '%'));

  eq('凡例に2件出る', await page.locator('#trendMapLegend [data-map-goto]').count(), 2);
  ok('未記録のペアは凡例にも出ない',
     await page.locator('#trendMapLegend [data-map-goto="w3"]').count() === 0);
  /* 時間足タブ：4時間足には記録が無いので0件になる */
  await page.click('[data-map-tf="h4"]');
  eq('足を切り替えると0件', await page.locator('#trendMapDots .gv-dot').count(), 0);
  await page.click('[data-map-tf="d"]');

  /* 凡例から一覧の行へ戻る */
  await page.click('#trendMapLegend [data-map-goto="w2"]');
  ok('マップが閉じる', await page.locator('#trendMapModal.show').isHidden());
  await page.waitForTimeout(200);
  ok('該当行がハイライトされる',
     await page.locator('[data-trend-item="w2"].trend-highlight').count() === 1);
  await page.context().close();
}

/* ─────────────────────────────────────────────────────────
   8. マップは一覧の絞り込みに従う
   ───────────────────────────────────────────────────────── */
console.log('\n[8] マップと絞り込みの連動');
{
  const page = await newPage({
    [MARKET]: {
      pairs: [
        /* 買② + 緑 + ↗ = GO */
        mkPair('w1', 'USDJPY', { trend: { d: { state: 'up', zone: 'green', granville: '2', wpos: '36.0,70.0' } } }),
        /* 買① は SETUP_GO_WAVES 外なので WAIT */
        mkPair('w2', 'EURUSD', { trend: { d: { state: 'up', zone: 'green', granville: '1', wpos: '20.0,85.0' } } }),
      ],
      snapshots: [], judgeLog: [],
    },
  }, { width: 900, height: 900 });
  await page.click('[data-tab="trend"]');
  await page.click('#trendMapOpen');
  eq('絞り込みなしでは2件', await page.locator('#trendMapDots .gv-dot').count(), 2);
  await page.click('#trendMapClose');
  await page.click('#trendFilterAligned');            /* 🟢 GO のみ */
  await page.click('#trendMapOpen');
  eq('GO のみで1件に絞られる', await page.locator('#trendMapDots .gv-dot').count(), 1);
  ok('残るのは GO のペア', await page.locator('#trendMapDots .gv-dot.go').count() === 1);
  await page.context().close();
}

/* ─────────────────────────────────────────────────────────
   8b. 同じ位置に重なったドットは散らす
   ───────────────────────────────────────────────────────── */
console.log('\n[8b] 重なりの解消');
{
  const page = await newPage({
    [MARKET]: {
      pairs: ['USDJPY', 'EURUSD', 'GBPJPY'].map((p, i) => mkPair('w' + i, p, {
        /* 3件とも同一座標。散らさないと1件しか見えない。 */
        trend: { d: { state: 'up', zone: 'green', granville: '2', wpos: '36.0,70.0' } },
      })),
      snapshots: [], judgeLog: [],
    },
  }, { width: 900, height: 900 });
  await page.click('[data-tab="trend"]');
  await page.click('#trendMapOpen');
  const styles = await page.locator('#trendMapDots .gv-dot').evaluateAll(
    els => els.map(el => el.getAttribute('style')));
  eq('3件とも描かれる', styles.length, 3);
  eq('座標が重ならない  ' + JSON.stringify(styles), new Set(styles).size, 3);
  eq('凡例には3件とも出る', await page.locator('#trendMapLegend [data-map-goto]').count(), 3);
  await page.context().close();
}

/* ─────────────────────────────────────────────────────────
   9. 375px のレイアウト（入力行が折り返さない）
   ───────────────────────────────────────────────────────── */
console.log('\n[9] 375px のレイアウト');
{
  const page = await newPage({
    [MARKET]: {
      pairs: ['USDJPY', 'EURUSD', 'GBPJPY'].map((p, i) => mkPair('w' + i, p, {
        trend: { d: { state: 'up', zone: 'green', granville: '2', wpos: '36.0,70.0' },
                 h4: { state: 'up', zone: 'green', granville: '3', wpos: '46.0,39.0' } },
        trendAt: new Date().toISOString(),
      })),
      snapshots: [], judgeLog: [],
    },
  }, { width: 375, height: 800 });
  await page.click('[data-tab="trend"]');
  const h = await page.locator('.trend-tf').first().evaluate(el => el.getBoundingClientRect().height);
  ok('入力行が1段のまま  [' + Math.round(h) + 'px]', h < 46);
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth);
  ok('横スクロールが出ない', !overflow);
  /* 巡回はスマホでするので、ミニ波形は 375px でも残っていること。 */
  ok('375px でもミニ波形が見える',
     await page.locator('[data-trend-granville-open][data-tf="d"] .gv-mini').first().isVisible());
  const row = await page.locator('.trend-tf').first().evaluate(el => {
    const p = el.parentElement.getBoundingClientRect();
    return { inner: p.width, need: el.scrollWidth, has: el.clientWidth };
  });
  ok('行がはみ出さない  ' + JSON.stringify(row), row.need <= row.has + 1);
  await page.screenshot({ path: 's40-01-trend-375.png', fullPage: true });

  await page.click('[data-trend-granville-open][data-tf="d"]');
  await page.screenshot({ path: 's40-02-picker-375.png' });
  await page.click('#trendGvCancel');
  await page.click('#trendMapOpen');
  await page.screenshot({ path: 's40-03-map-375.png' });
  await page.context().close();
}

/* ─────────────────────────────────────────────────────────
   10. デスクトップ・ライト／ダークのスクリーンショット
   ───────────────────────────────────────────────────────── */
console.log('\n[10] スクリーンショット（デスクトップ）');
{
  /* 実運用に近い散らばり方にする（タップ記録・概算・未記録が混ざる）。 */
  const spread = [
    { state: 'up',   zone: 'green', granville: '2', wpos: '35.2,69.4' },
    { state: 'up',   zone: 'green', granville: '2', wpos: '40.1,66.0' },
    { state: 'down', zone: 'red',   granville: '6', wpos: '72.8,27.6' },
    { state: 'down', zone: 'red',   granville: '7', wpos: '' },          /* 概算 */
    { state: 'up',   zone: 'green', granville: '3', wpos: '47.9,35.1' },
    { state: 'down', zone: 'red',   granville: '7', wpos: '' },          /* 概算・同じ波に重なる */
  ];
  const page = await newPage({
    [MARKET]: {
      pairs: ['USDJPY', 'EURUSD', 'GBPJPY', 'AUDUSD', 'BTCUSD', 'XAUUSD'].map((p, i) => mkPair('w' + i, p, {
        trend: { d: spread[i], h4: { state: 'up', zone: 'green', granville: '3' } },
        trendAt: new Date().toISOString(),
      })),
      snapshots: [], judgeLog: [],
    },
  }, { width: 900, height: 950 });
  await page.click('[data-tab="trend"]');
  await page.click('#trendMapOpen');
  await page.screenshot({ path: 's40-04-map-desktop-dark.png' });
  await page.click('#trendMapClose');
  await page.click('.theme-toggle');
  await page.click('#trendMapOpen');
  await page.screenshot({ path: 's40-05-map-desktop-light.png' });
  await page.context().close();
}

/* ─────────────────────────────────────────────────────────
   11. 端末間マージ（S28 の仕組みに wpos がそのまま乗ること）
   ───────────────────────────────────────────────────────── */
console.log('\n[11] 端末間マージ');
{
  const page = await newPage();
  const r = await page.evaluate(() => {
    const mk = (wpos, at, gv) => ({
      id: 'x', pair: 'USDJPY', alerts: {}, checksHigher: {}, checksEntry: {},
      trend: { d: { state: 'up', zone: 'green', granville: gv, wpos, at } }, trendAt: at,
    });
    return {
      /* リモートの方が新しい → リモート側の記録が採用される */
      newer: mergePair(mk('10.0,10.0', '2026-01-01T00:00:00Z', '2'),
                       mk('80.0,20.0', '2026-02-01T00:00:00Z', '6')),
      /* ローカルの方が新しい → 古いリモートで上書きされない */
      older: mergePair(mk('10.0,10.0', '2026-03-01T00:00:00Z', '2'),
                       mk('80.0,20.0', '2026-02-01T00:00:00Z', '6')),
      /* S39以前の端末（wpos を持たない）とマージしても壊れない */
      legacy: mergePair(mk('10.0,10.0', '2026-01-01T00:00:00Z', '2'), {
        id: 'x', pair: 'USDJPY', alerts: {}, checksHigher: {}, checksEntry: {},
        trend: { d: { state: 'up', zone: 'green', granville: '3', at: '2026-02-01T00:00:00Z' } },
        trendAt: '2026-02-01T00:00:00Z',
      }),
    };
  });
  eq('新しい側の wpos が採用される', r.newer.trend.d.wpos, '80.0,20.0');
  eq('波番号も同じ側から来る', r.newer.trend.d.granville, '6');
  eq('古い側で上書きされない', r.older.trend.d.wpos, '10.0,10.0');
  eq('旧端末とマージしても波番号は運ばれる', r.legacy.trend.d.granville, '3');
  ok('旧端末に wpos が無くても壊れない  [' + JSON.stringify(r.legacy.trend.d.wpos) + ']',
     !r.legacy.trend.d.wpos);
  eq('trendAt が再計算される', r.newer.trendAt, '2026-02-01T00:00:00Z');
  await page.context().close();
}

console.log('\n[12] JSエラー');
ok('コンソールエラーなし  ' + (errors.length ? JSON.stringify(errors.slice(0, 3)) : ''), errors.length === 0);

await browser.close();
console.log('\n──────────────────────────');
console.log(`  ✅ ${pass}  ❌ ${fail}`);
process.exit(fail ? 1 : 0);
