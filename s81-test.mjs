/* セッション81 検証：🧹巡回記録クリア・🗑ペア削除が端末間同期で巻き戻る不具合の修正。
   - 🧹 は「空の内容＋現在時刻」を書き、他端末の古い記録に勝つ／他端末へも伝わる
   - 🧹 直後の鮮度は「未記録」（trendAt に現在時刻が入っても巡回済みに見えない）
   - 🗑 はプリセットが作り直されても墓標が効き、削除より古い内容は双方から落ちる
   - 削除より新しい記録（消したあとに録り直したもの）は残る
   実行: node s81-test.mjs */
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const URL = 'file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/');
let pass = 0, fail = 0;
const ok = (n, c, extra) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); } };

const browser = await chromium.launch().catch(() =>
  chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }));
const errors = [];
const ctx = await browser.newContext();
const page = await ctx.newPage();
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e)));
page.on('dialog', d => d.dismiss().catch(() => {}));
await page.goto(URL);
await page.waitForTimeout(400);

const MARKET_KEY = 'mochipoyo_market_view_v1';
const OLD = '2026-09-01T00:00:00.000Z';   /* 他端末に残っている古い記録 */
/* 削除より後に録り直した記録。墓標は実行時の現在時刻で立つので、固定日付ではなく
   実行時刻から先の時刻を使う（固定値だと日付が過ぎた日にだけ落ちるテストになる）。 */
const NEW = new Date(Date.now() + 3600000).toISOString();

/* 巡回記録の入ったペアを手元に用意し、id を返す。 */
async function seed(at) {
  return page.evaluate(([k, at]) => {
    const data = JSON.parse(localStorage.getItem(k) || '{}');
    const w = data.pairs.find(p => p.pair === 'USDJPY');
    w.trend.d  = { state: 'up',   zone: 'green', granville: '2', wpos: '39.4,68.1', at };
    w.trend.h4 = { state: 'down', zone: 'red',   granville: '6', wpos: '',          at };
    w.trendAt = at;
    localStorage.setItem(k, JSON.stringify(data));
    return w.id;
  }, [MARKET_KEY, at]);
}

/* 他端末から届いた体のペア（同名・別id・古い記録つき）。 */
const remotePair = at => ({
  id: 'w_remote', pair: 'USDJPY',
  alerts: { h1: { on: true, at, chAt: at }, h4: {}, d: {}, w: {} },
  judge: 'entered', judgeAt: at,
  go: true, goAt: at,
  tfHigher: '日足', tfEntry: '15分足', tfAt: at,
  checksHigher: { d: { macd: 'rd' } }, checksEntry: { maBreak: 'up' },
  checksAt: { 'checksHigher.d.macd': at, 'checksEntry.maBreak': at },
  trend: {
    d:  { state: 'up',   zone: 'green', granville: '2', wpos: '39.4,68.1', at },
    h4: { state: 'down', zone: 'red',   granville: '6', wpos: '',          at },
    w: {}, mn: {}, h1: {},
  },
  trendAt: at,
});

/* ─────────────────────────────────────────────────────────
   1. 🧹 巡回記録クリアが同期で巻き戻らない
   ───────────────────────────────────────────────────────── */
console.log('\n[1] 🧹 巡回記録クリア');
{
  await page.reload();
  await page.waitForTimeout(400);
  const id = await seed(OLD);

  const cleared = await page.evaluate(id => {
    const w = mvClearTrend(id);
    return { d: w.trend.d, h4: w.trend.h4, trendAt: w.trendAt };
  }, id);

  ok('クリアで方向・ゾーン・波が消える',
    !cleared.d.state && !cleared.d.zone && !cleared.d.granville && !cleared.d.wpos, cleared.d);
  ok('クリアした足に現在時刻が打たれる（同期で勝つため）',
    !!cleared.d.at && Date.parse(cleared.d.at) > Date.parse(OLD), cleared.d.at);
  ok('クリアの時刻は全時間足に打たれる', cleared.h4.at === cleared.d.at, cleared.h4.at);

  /* 他端末の古い記録とマージしても復活しないこと。 */
  const merged = await page.evaluate(([remote]) => {
    const local = loadMarket().pairs.find(p => p.pair === 'USDJPY');
    const out = mergePairs([local], [remote], { trades: {}, pairs: {} })
      .find(p => p.pair === 'USDJPY');
    return { d: out.trend.d, h4: out.trend.h4 };
  }, [remotePair(OLD)]);

  ok('同期しても日足の記録が復活しない', !merged.d.state && !merged.d.granville, merged.d);
  ok('同期しても4時間足の記録が復活しない', !merged.h4.state && !merged.h4.granville, merged.h4);

  /* 逆向き：こちらのクリアが他端末（古い記録を持つ側）にも伝わること。 */
  const atRemote = await page.evaluate(([remote]) => {
    const mine = loadMarket().pairs.find(p => p.pair === 'USDJPY');
    const out = mergePairs([remote], [mine], { trades: {}, pairs: {} })
      .find(p => p.pair === 'USDJPY');
    return out.trend.d;
  }, [remotePair(OLD)]);
  ok('クリアが他端末側にも伝わる（古い記録が消える）',
    !atRemote.state && !atRemote.granville, atRemote);

  /* クリアしたのに「たった今」巡回済みに見えないこと。 */
  const fresh = await page.evaluate(() => {
    const w = loadMarket().pairs.find(p => p.pair === 'USDJPY');
    return { chip: trendFreshChip(w), age: trendAgeHours(w) };
  });
  ok('クリア直後の鮮度は「未記録」', fresh.chip.includes('未記録'), fresh.chip);
  ok('クリア直後は未更新（経過時間が無限大）', fresh.age === null || !isFinite(fresh.age), fresh.age);

  /* 記録し直せば通常どおり新しい記録として残ること。 */
  const rewritten = await page.evaluate(id => {
    const w = mvWriteTrend(id, 'd', { state: 'up', zone: 'green' });
    return { state: w.trend.d.state, chip: trendFreshChip(w) };
  }, id);
  ok('クリア後に記録し直せる', rewritten.state === 'up', rewritten.state);
  ok('記録し直すと鮮度が「たった今」に戻る', rewritten.chip.includes('たった今'), rewritten.chip);
}

/* ─────────────────────────────────────────────────────────
   2. 🗑 ペア削除が同期で巻き戻らない
   ───────────────────────────────────────────────────────── */
console.log('\n[2] 🗑 ペア削除');
{
  await page.reload();
  await page.waitForTimeout(400);
  const id = await seed(OLD);

  /* 🗑 の確認モーダルを通した実際の削除経路をなぞる。 */
  await page.click('.tab-btn[data-tab="trend"]');
  await page.waitForTimeout(300);
  await page.click('[data-trend-item="' + id + '"] [data-trend-del-pair]');
  await page.waitForTimeout(200);
  await page.click('#mvDeleteConfirm');
  await page.waitForTimeout(300);

  const after = await page.evaluate(() => {
    const t = JSON.parse(localStorage.getItem('mochipoyo_tombstones_v1') || '{}');
    const w = loadMarket().pairs.find(p => p.pair === 'USDJPY');
    return { tomb: (t.pairs || {}).USDJPY || '', exists: !!w, state: w && w.trend.d.state };
  });
  ok('削除でペア名の墓標が立つ', !!after.tomb, after.tomb);
  ok('プリセットなので行そのものは作り直される', after.exists === true, after.exists);
  ok('作り直された行は空', !after.state, after.state);

  const merged = await page.evaluate(([remote]) => {
    const local = loadMarket().pairs.find(p => p.pair === 'USDJPY');
    const tomb = JSON.parse(localStorage.getItem('mochipoyo_tombstones_v1') || '{}');
    const out = mergePairs([local], [remote], tomb).find(p => p.pair === 'USDJPY');
    return { trend: out.trend.d, judge: out.judge, go: out.go, tfHigher: out.tfHigher,
             alert: out.alerts.h1, macd: (out.checksHigher.d || {}).macd,
             maBreak: out.checksEntry.maBreak };
  }, [remotePair(OLD)]);

  ok('削除後：巡回記録が他端末から戻らない', !merged.trend.state && !merged.trend.granville, merged.trend);
  ok('削除後：判定が戻らない', !merged.judge, merged.judge);
  ok('削除後：GOフラグが戻らない', !merged.go, merged.go);
  ok('削除後：上位足/エントリー足が戻らない', !merged.tfHigher, merged.tfHigher);
  ok('削除後：アラートが戻らない', !merged.alert.on, merged.alert);
  ok('削除後：上位足の根拠チェックが戻らない', !merged.macd, merged.macd);
  ok('削除後：エントリー足の根拠チェックが戻らない', !merged.maBreak, merged.maBreak);

  /* 逆向き：削除が他端末の手元のデータも消すこと。 */
  const atRemote = await page.evaluate(([remote]) => {
    const mine = loadMarket().pairs.find(p => p.pair === 'USDJPY');
    const tomb = JSON.parse(localStorage.getItem('mochipoyo_tombstones_v1') || '{}');
    const out = mergePairs([remote], [mine], tomb).find(p => p.pair === 'USDJPY');
    return { state: out.trend.d.state, judge: out.judge };
  }, [remotePair(OLD)]);
  ok('削除が他端末側にも伝わる', !atRemote.state && !atRemote.judge, atRemote);

  /* 削除より新しい記録は消さないこと。 */
  const kept = await page.evaluate(([remote]) => {
    const local = loadMarket().pairs.find(p => p.pair === 'USDJPY');
    const tomb = JSON.parse(localStorage.getItem('mochipoyo_tombstones_v1') || '{}');
    const out = mergePairs([local], [remote], tomb).find(p => p.pair === 'USDJPY');
    return { state: out.trend.d.state, judge: out.judge, trendAt: out.trendAt };
  }, [remotePair(NEW)]);
  ok('削除より新しい記録は残る（録り直しが消えない）',
    kept.state === 'up' && kept.judge === 'entered', kept);
  ok('残った記録で trendAt が作り直される', kept.trendAt === NEW, kept.trendAt);
}

/* ─────────────────────────────────────────────────────────
   3. 副作用が無いこと
   ───────────────────────────────────────────────────────── */
console.log('\n[3] 副作用');
{
  await page.reload();
  await page.waitForTimeout(400);
  await seed(OLD);

  /* 墓標が無ければ従来どおり足単位のマージ（別々の足が両方残る）。 */
  const both = await page.evaluate(([remote]) => {
    const local = loadMarket().pairs.find(p => p.pair === 'USDJPY');
    local.trend.h4 = { state: '', zone: '', granville: '', wpos: '', at: '' };
    const out = mergePairs([local], [remote], { trades: {}, pairs: {} })
      .find(p => p.pair === 'USDJPY');
    return { d: out.trend.d.state, h4: out.trend.h4.state };
  }, [remotePair(OLD)]);
  ok('墓標が無ければ足単位マージは従来どおり', both.d === 'up' && both.h4 === 'down', both);

  const chip = await page.evaluate(() => {
    const w = loadMarket().pairs.find(p => p.pair === 'USDJPY');
    return trendFreshChip(w);
  });
  ok('記録があるペアの鮮度は従来どおり出る', !chip.includes('未記録'), chip);
}

ok('コンソールエラー無し', errors.length === 0, errors);

console.log('\n──────────────────────────');
console.log('  ✅ ' + pass + '  ❌ ' + fail);
await browser.close();
process.exit(fail ? 1 : 0);
