/* セッション44 検証：GO / WAIT / NO / RD 判定の全廃と、エントリー圏を軸にした 🔭一覧
     - 判定バッジ・グループ見出し・判定タイル・ボードのバッジがどこにも無い
     - 並び順が「エントリー圏に近い順」になる（記録の無いペアは下）
     - 圏内の足にだけ 🎯 と根拠パネルを開くボタンが出る
     - 根拠パネルは押した足がそのまま上位足になる
     - ピッカーから8ボタンと「売買8つすべて表示」が消え、読み取り表示が圏との距離になる
   s40/s42/s43-test.mjs と同じ file:// ＋ localStorage 直注入の型。 */
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
const SELECTED = 'mochipoyo_market_view_selected';
const mkPair = (id, pair, extra = {}) => ({
  id, pair, tfHigher: '', tfEntry: '', alerts: {}, judge: '',
  checksHigher: {}, checksEntry: {}, ...extra,
});
const trendOf = (page, id, tf) => page.evaluate(([i, t]) => {
  const p = JSON.parse(localStorage.getItem('mochipoyo_market_view_v1')).pairs.find(x => x.id === i);
  return p.trend[t];
}, [id, tf]);
const pairOf = (page, id) => page.evaluate(i =>
  JSON.parse(localStorage.getItem('mochipoyo_market_view_v1')).pairs.find(x => x.id === i), id);

/* ⚠️ wmDayKey() と同じくローカル日付で切る（UTC だと JST の朝に1日ずれる）。 */
const YESTERDAY = (() => {
  const t = new Date(Date.now() - 86400000);
  return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' +
         String(t.getDate()).padStart(2, '0');
})();

async function tapFig(page, xPct, yPct) {
  const box = await page.locator('#trendGvFig').boundingBox();
  await page.mouse.click(box.x + box.width * xPct / 100, box.y + box.height * yPct / 100);
}

/* ⚠️ アンカー座標はテストに直書きしない（図を差し替えるたびに落ちる。S41 の再演）。
      アプリ側の定数を引いて、そこからの相対でタップ位置を組み立てる。 */
console.log('\n[0] 定数をアプリ側から引く');
const C = await (async () => {
  const page = await newPage();
  const c = await page.evaluate(() => ({
    anchors: MV_GRANVILLE_ANCHORS, radius: GV_ENTRY_RADIUS, goWaves: SETUP_GO_WAVES,
    /* 判定関数がグローバルから消えていること */
    gone: ['setupVerdict', 'pairStatus', 'pairVerdicts', 'MV_SETUPS', 'SETUP_STATUSES',
           'SETUP_SIDE', 'TREND_GROUPS', 'trendSetupBadgesHtml']
      .filter(n => typeof window[n] !== 'undefined'),
    /* 置き換えた導出関数があること */
    added: ['pairEntryDistance', 'tfEntryDistance', 'pairIsHot', 'trendEntryChipHtml']
      .filter(n => typeof window[n] === 'undefined'),
  }));
  await page.context().close();
  return c;
})();
eq('判定関連の定義がすべて消えている', C.gone, []);
eq('エントリー圏の導出関数が生えている', C.added, []);
eq('圏の波は買②③/売②③のまま', C.goWaves, ['2', '3', '6', '7']);

/* 圏内／圏外のタップ位置を作る。圏内は買②のアンカーそのもの、圏外は買①のアンカー。 */
const IN = C.anchors['2'];      // 買②＝SETUP_GO_WAVES に含まれる
const OUT = C.anchors['1'];     // 買①＝圏外
const pos = (a) => a[0].toFixed(1) + ',' + a[1].toFixed(1);
const upAt = (gv, wpos) => ({
  trend: { d: { state: 'up', zone: 'green', granville: gv, wpos, at: new Date().toISOString() } },
  trendAt: new Date().toISOString(),
});

/* ═════════════════════════════════════════════════════════
   ① 判定の痕跡が UI に残っていない
   ═════════════════════════════════════════════════════════ */
console.log('\n[①] GO / WAIT / NO / RD が UI から消えている');
{
  const page = await newPage({
    [MARKET]: {
      pairs: [
        mkPair('w1', 'USDJPY', upAt('2', pos(IN))),
        mkPair('w2', 'EURUSD', upAt('1', pos(OUT))),
        mkPair('w3', 'GBPUSD', { mode: 'rd' }),
      ],
      snapshots: [], judgeLog: [],
    },
    [SELECTED]: 'w1',
  }, { width: 900, height: 950 });
  await page.click('[data-tab="trend"]');
  eq('判定バッジが1つも無い', await page.locator('.sbadge').count(), 0);
  eq('GO/WAIT/NO のグループ見出しが無い',
     await page.locator('.trend-group-head').filter({ hasText: /GO|WAIT|NO/ }).count(), 0);
  const summary = await page.textContent('#trendSummary');
  ok('サマリーに GO/WAIT/NO タイルが無い  [' + summary.slice(0, 40) + ']',
     !/🟢|🟡|⚪/.test(summary));
  ok('代わりに 🎯 圏内タイルが出る', summary.includes('🎯 圏内'));
  eq('ツールバーの絞り込みが 🎯 エントリー圏のみ になる',
     (await page.textContent('#trendFilterAligned')).trim(), '🎯 エントリー圏のみ');

  /* ボードにもバッジは残っていない */
  await page.click('[data-tab="trade"]');
  eq('ボードにも判定バッジが無い', await page.locator('.mv-card-head .sbadge').count(), 0);
  await page.context().close();
}

/* ═════════════════════════════════════════════════════════
   ② 目線（📈〰🔄）は自動判定に効かない絞り込みタグとして残る
   ═════════════════════════════════════════════════════════ */
console.log('\n[②] 目線は絞り込みタグとして残る');
{
  const page = await newPage({
    [MARKET]: {
      pairs: [
        mkPair('w1', 'USDJPY', { ...upAt('2', pos(IN)), mode: 'range' }),
        mkPair('w2', 'EURUSD', upAt('2', pos(IN))),
      ],
      snapshots: [], judgeLog: [],
    },
  }, { width: 900, height: 950 });
  await page.click('[data-tab="trend"]');
  /* 〰レンジでも記録は生きているので 🎯 は出る（S43 までは NO に落ちて沈んでいた）。
     S48: 🎯 は常時表示なので表示中の全tf行ぶん出る（既定は日足・4時間足の2行） */
  eq('レンジ指定でも 🎯 は出る',
     await page.locator('[data-trend-item="w1"] .tent').count(), 2);
  await page.selectOption('#trendModeSelect', 'range');
  eq('目線で絞り込める', await page.locator('[data-trend-item="w1"]').count(), 1);
  eq('他は消える', await page.locator('[data-trend-item="w2"]').count(), 0);
  await page.context().close();
}

/* ═════════════════════════════════════════════════════════
   ③ 並び順＝エントリー圏に近い順
   ═════════════════════════════════════════════════════════ */
console.log('\n[③] エントリー圏に近い順に並ぶ');
{
  /* 買②のアンカーからそれぞれ 0 / 5 / 圏外 の距離に置く */
  const near = pos(IN);
  const mid = (IN[0] + 5).toFixed(1) + ',' + IN[1].toFixed(1);
  const page = await newPage({
    [MARKET]: {
      pairs: [
        /* 名前順なら ZZZ が最後だが、距離0なので先頭に来なければならない */
        mkPair('w1', 'ZZZTEST', upAt('2', near)),
        mkPair('w2', 'AAATEST', upAt('2', mid)),
        mkPair('w3', 'MMMTEST', upAt('1', pos(OUT))),   /* 圏外 */
      ],
      snapshots: [], judgeLog: [],
    },
  }, { width: 900, height: 950 });
  await page.click('[data-tab="trend"]');
  const order = await page.locator('.trend-item .pair').evaluateAll(
    els => els.map(e => e.textContent).filter(t => t.endsWith('TEST')));
  eq('距離の近い順（名前順ではない）', order, ['ZZZTEST', 'AAATEST', 'MMMTEST']);

  const heads = await page.locator('.trend-group-head').evaluateAll(els => els.map(e => e.textContent));
  ok('🎯 エントリー圏の見出しが先頭に出る  [' + heads[0] + ']', heads[0].includes('🎯 エントリー圏'));
  ok('圏内の件数が見出しに入る', heads[0].includes('2'));
  ok('圏外は「その他」でまとまる', heads.some(h => h.includes('その他')));

  /* 記録の無いプリセット28銘柄は必ず圏内グループより後ろ。
     S48: 🎯 は常時表示になったので「.tent の有無」では判別できない。
     グランビル未記録＝波を一度もタップ/選択していない行で判定する。 */
  const firstNoRecord = await page.locator('.trend-item').evaluateAll(els =>
    els.findIndex(e => !e.querySelector('.tgv.on')));
  ok('記録の無いペアは圏内より後ろ  [index ' + firstNoRecord + ']', firstNoRecord >= 2);

  /* 絞り込み */
  await page.click('#trendFilterAligned');
  eq('🎯 のみで圏内の2件だけになる', await page.locator('.trend-item').count(), 2);
  ok('ボタンに .on が付く', await page.locator('#trendFilterAligned.on').count() === 1);
  await page.click('#trendFilterAligned');
  ok('もう一度押すと戻る', await page.locator('.trend-item').count() > 2);
  await page.context().close();
}

/* ═════════════════════════════════════════════════════════
   ④ 圏内の足にだけ 🎯／根拠ボタンが出る
   ═════════════════════════════════════════════════════════ */
console.log('\n[④] 🎯 と根拠ボタンの出し分け');
{
  const page = await newPage({
    [MARKET]: {
      pairs: [mkPair('w1', 'USDJPY', {
        trend: {
          d:  { state: 'up', zone: 'green', granville: '2', wpos: pos(IN),  at: new Date().toISOString() },
          h4: { state: 'up', zone: 'green', granville: '1', wpos: pos(OUT), at: new Date().toISOString() },
        },
        trendAt: new Date().toISOString(),
      })],
      snapshots: [], judgeLog: [],
    },
  }, { width: 900, height: 950 });
  await page.click('[data-tab="trend"]');
  const W1 = '[data-trend-item="w1"] ';
  /* S48: 🎯 は圏外でも常時表示（あらかじめ根拠を記録できるように）。圏内だけ緑で強調される */
  eq('🎯 は日足・4時間足どちらにも出る', await page.locator(W1 + '.trend-tf .tent').count(), 2);
  eq('圏内の日足は強調（muted でない）',
     await page.locator(W1 + '.tent[data-tf="d"]:not(.muted)').count(), 1);
  eq('圏外の4時間足は中立色（muted）',
     await page.locator(W1 + '.tent[data-tf="h4"].muted').count(), 1);
  eq('根拠ボタンは日足の行にある',
     await page.locator(W1 + '[data-trend-panel-open][data-tf="d"]').count(), 1);
  eq('根拠ボタンは圏外の4時間足の行にもある',
     await page.locator(W1 + '[data-trend-panel-open][data-tf="h4"]').count(), 1);
  ok('距離が title に入る',
     (await page.getAttribute(W1 + '[data-tf="d"][data-trend-panel-open]', 'title')).includes('エントリー水準まで'));

  /* 概算（wpos 空）は圏内に数えない。それでもボタン自体は muted で出る */
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('mochipoyo_market_view_v1'));
    d.pairs.find(p => p.id === 'w1').trend.d.wpos = '';
    localStorage.setItem('mochipoyo_market_view_v1', JSON.stringify(d));
  });
  await page.reload();
  await page.click('[data-tab="trend"]');
  eq('概算（ボタン選択）でも 🎯 は出る（muted）',
     await page.locator(W1 + '.tent[data-tf="d"].muted').count(), 1);
  await page.context().close();
}

/* ═════════════════════════════════════════════════════════
   ⑤ 根拠パネル：押した足がそのまま上位足になる
   ═════════════════════════════════════════════════════════ */
console.log('\n[⑤] 根拠パネルの入口が「足」になる');
{
  const page = await newPage({
    [MARKET]: {
      pairs: [mkPair('w1', 'USDJPY', {
        trend: {
          d:  { state: 'up', zone: 'green', granville: '2', wpos: pos(IN), at: new Date().toISOString() },
          h4: { state: 'up', zone: 'green', granville: '3',
                wpos: pos(C.anchors['3']), at: new Date().toISOString() },
        },
        trendAt: new Date().toISOString(),
      })],
      snapshots: [], judgeLog: [],
    },
  }, { width: 900, height: 950 });
  await page.click('[data-tab="trend"]');
  const W1 = '[data-trend-item="w1"] ';

  await page.click(W1 + '[data-trend-panel-open][data-tf="d"]');
  ok('パネルが開く', await page.locator(W1 + '.trend-panel').count() === 1);
  eq('上位足が日足で確定する', (await pairOf(page, 'w1')).tfHigher, '日足');
  eq('固定表示も日足', (await page.textContent(W1 + '.tp-fixed')).trim(), '日足');
  ok('確度が出る', (await page.textContent(W1 + '.tp-conf')).includes('確度'));
  eq('根拠の行が MV_TF_CHECKS のぶん出る',
     await page.locator(W1 + '.tp-grid .tp-row:not(.tp-head)').count(),
     await page.evaluate(() => MV_TF_CHECKS.length));

  /* 別の足のボタンを押すと上位足が入れ替わる */
  await page.click(W1 + '[data-trend-panel-open][data-tf="h4"]');
  eq('4時間足に切り替わる', (await pairOf(page, 'w1')).tfHigher, '4時間足');
  eq('パネルは1つだけ', await page.locator('.trend-panel').count(), 1);

  /* 同じボタンをもう一度押すと閉じる */
  await page.click(W1 + '[data-trend-panel-open][data-tf="h4"]');
  eq('再タップで閉じる', await page.locator('.trend-panel').count(), 0);

  /* 記録フォームへは tfEntry と judge が揃うまで押せない */
  await page.click(W1 + '[data-trend-panel-open][data-tf="d"]');
  ok('未入力では記録フォームへが押せない',
     await page.locator(W1 + '.tp-goto[disabled]').count() === 1);
  await page.selectOption(W1 + '[data-trend-tfentry]', '15分足');
  await page.click(W1 + '.mv-judge-btn.entered');
  ok('エントリー足と判定が揃うと押せる',
     await page.locator(W1 + '.tp-goto[disabled]').count() === 0);
  const w = await pairOf(page, 'w1');
  eq('判定が保存される', w.judge, 'entered');
  ok('judgeLog に積まれる（統計が壊れない）', await page.evaluate(() =>
    JSON.parse(localStorage.getItem('mochipoyo_market_view_v1')).judgeLog.length > 0));
  await page.context().close();
}

/* ═════════════════════════════════════════════════════════
   ⑥ ピッカー：8ボタン撤去と読み取り表示の置き換え
   ═════════════════════════════════════════════════════════ */
console.log('\n[⑥] グランビル・ピッカー');
{
  const page = await newPage({
    [MARKET]: {
      pairs: [mkPair('w1', 'USDJPY', {
        trend: { d: { state: 'up', zone: 'green', granville: '', wpos: '' } },
      })],
      snapshots: [], judgeLog: [],
    },
  }, { width: 375, height: 800 });
  await page.click('[data-tab="trend"]');
  await page.click('[data-trend-item="w1"] [data-trend-granville-open][data-tf="d"]');
  eq('8ボタンのグリッドが無い', await page.locator('#trendGvGrid, [data-gv-pick]').count(), 0);
  eq('「売買8つすべて表示」が無い', await page.locator('#trendGvAll').count(), 0);
  ok('未タップでは案内が出る', (await page.textContent('#trendGvReadout')).includes('タップ'));

  await tapFig(page, IN[0], IN[1]);
  const inTxt = await page.textContent('#trendGvReadout');
  ok('圏内なら圏内と出る  [' + inTxt.slice(0, 24) + ']', inTxt.includes('エントリー圏内'));
  ok('波番号は出さない', !/買[①②③④]/.test(inTxt));
  eq('波は内部的には保存される', (await trendOf(page, 'w1', 'd')).granville, '2');

  await tapFig(page, OUT[0], OUT[1]);
  const outTxt = await page.textContent('#trendGvReadout');
  ok('圏外なら距離が出る  [' + outTxt.slice(0, 24) + ']',
     outTxt.includes('圏外') && outTxt.includes('エントリー水準まで'));
  await page.context().close();
}

/* ═════════════════════════════════════════════════════════
   ⑦ 波マップ：status に依存しなくなった
   ═════════════════════════════════════════════════════════ */
console.log('\n[⑦] 🗺 波マップ');
{
  const page = await newPage({
    [MARKET]: {
      pairs: [
        mkPair('w1', 'USDJPY', upAt('2', pos(IN))),
        mkPair('w2', 'EURUSD', upAt('1', pos(OUT))),
      ],
      snapshots: [], judgeLog: [],
    },
  }, { width: 900, height: 950 });
  await page.click('[data-tab="trend"]');
  await page.click('#trendMapOpen');
  eq('2件とも載る', await page.locator('#trendMapDots .gv-dot').count(), 2);
  eq('色は中立1色になる', await page.locator('#trendMapDots .gv-dot.plain').count(), 2);
  eq('GO/WAIT/NO の色分けが残っていない',
     await page.locator('#trendMapDots .gv-dot.go, #trendMapDots .gv-dot.wait, ' +
                        '#trendMapDots .gv-dot.rd, #trendMapDots .gv-dot.no').count(), 0);
  eq('圏内だけが強調される', await page.locator('#trendMapDots .gv-dot.hot').count(), 1);
  ok('🎯 圏内グループが先頭に出る',
     (await page.textContent('#trendMapLegend .grp.entry')).includes('🎯 圏内'));
  await page.context().close();
}

/* ═════════════════════════════════════════════════════════
   ⑧ スナップショットの s は空になり、既存レコードも壊さない
   ═════════════════════════════════════════════════════════ */
console.log('\n[⑧] 日次スナップショット（S42 の互換）');
{
  const page = await newPage({
    [MARKET]: {
      pairs: [mkPair('w1', 'USDJPY', upAt('2', pos(IN)))],
      /* S43 以前に保存された「s: 'go'」入りのレコードが残っていても読めること。
         ⚠️ 日付は WM_KEEP_DAYS(30日) 以内にする。古すぎると wmPrune が正しく落とす。 */
      snapshots: [{ id: 'wm_old', at: YESTERDAY + 'T00:00:00Z', day: YESTERDAY, kind: 'wavemap',
                    items: [{ p: 'USDJPY', t: 'd', g: '2', w: pos(IN), s: 'go' }] }],
      judgeLog: [],
    },
  }, { width: 900, height: 950 });
  await page.click('[data-tab="trend"]');
  const snaps = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('mochipoyo_market_view_v1')).snapshots
      .filter(s => s.kind === 'wavemap'));
  const today = snaps.find(s => s.id !== 'wm_old');
  ok('今日の分が保存される', !!today);
  eq('新しい items の s は空', today.items.map(i => i.s), ['']);
  ok('旧レコードは残る', snaps.some(s => s.id === 'wm_old'));

  /* 昨日へ戻して、s: 'go' 入りの旧レコードがそのまま描けることを見る */
  await page.click('#trendMapOpen');
  await page.click('#trendMapPrev');
  eq('旧レコードでもドットが描ける（s を読まない）',
     await page.locator('#trendMapDots .gv-dot:not(.prev)').count(), 1);
  eq('旧レコードも中立色になる',
     await page.locator('#trendMapDots .gv-dot.plain:not(.prev)').count(), 1);
  await page.context().close();
}

/* ═════════════════════════════════════════════════════════
   ⑨ 375px：入力行が1段のまま
   ═════════════════════════════════════════════════════════ */
console.log('\n[⑨] 375px のレイアウト');
{
  const page = await newPage({
    [MARKET]: {
      pairs: ['USDJPY', 'EURUSD', 'GBPJPY'].map((p, i) => mkPair('w' + i, p, {
        trend: {
          d:  { state: 'up', zone: 'green', granville: '2', wpos: pos(IN), at: new Date().toISOString() },
          h4: { state: 'up', zone: 'green', granville: '3',
                wpos: pos(C.anchors['3']), at: new Date().toISOString() },
        },
        trendAt: new Date().toISOString(),
      })),
      snapshots: [], judgeLog: [],
    },
  }, { width: 375, height: 800 });
  await page.click('[data-tab="trend"]');
  const row = await page.locator('[data-trend-item="w0"] .trend-tf').first().evaluate(el => ({
    h: Math.round(el.getBoundingClientRect().height),
    need: el.scrollWidth, has: el.clientWidth,
  }));
  ok('🎯 が付いても入力行は1段  [' + row.h + 'px]', row.h < 46);
  ok('行がはみ出さない  ' + JSON.stringify(row), row.need <= row.has + 1);

  /* ヘッダは判定バッジが消えたぶん縮む（S44 の副次目的） */
  const head = await page.locator('[data-trend-item="w0"] .trend-head')
    .evaluate(el => Math.round(el.getBoundingClientRect().height));
  ok('ヘッダが2段以内に収まる  [' + head + 'px]', head < 80);
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth);
  ok('横スクロールが出ない', !overflow);
  await page.screenshot({ path: 's44-01-trend-375.png', fullPage: true });
  await page.context().close();
}

console.log('\n[JSエラー]');
eq('コンソールエラーなし', errors, []);

console.log('\n──────────────────────────');
console.log('  ✅ ' + pass + '  ❌ ' + fail);
await browser.close();
process.exit(fail ? 1 : 0);
