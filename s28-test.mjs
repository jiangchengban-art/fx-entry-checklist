/* S28 段階0〜1 検証：破損検知キルスイッチ / 縮小ガード / 全データJSONバックアップ
   実行: node s28-test.mjs  （http://localhost:8000 で index.html を配信しておく） */
import { chromium } from 'playwright';

const URL = 'http://localhost:8000/index.html';
const MARKET_KEY = 'mochipoyo_market_view_v1';
const TRADES_KEY = 'mochipoyo_trades_v1';

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? '  → ' + JSON.stringify(extra) : '')); }
};

/* 環境に置かれている Chromium が package.json の playwright と別ビルドのことがあるので、
   既定の探索に失敗したら実行ファイルを直接指す。 */
const browser = await chromium.launch().catch(() =>
  chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }));

async function newPage() {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.dismiss().catch(() => {}));
  return { ctx, page, errors };
}

/* ---------- 1. 正常系：既存データが読み込め、書き込みが従来どおり動く ---------- */
{
  console.log('\n[1] 正常系');
  const { ctx, page, errors } = await newPage();
  await page.goto(URL);
  await page.waitForTimeout(400);

  const before = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), MARKET_KEY);
  ok('初回起動でプリセット28銘柄が生成される', before && before.pairs.length === 28, before && before.pairs.length);
  ok('破損バナーは出ていない', !(await page.locator('#fatalBanner.show').count()));

  // 一覧タブでトレンドを1つ記録する（実際の書き込み経路を通す）
  await page.click('.tab-btn[data-tab="trend"]');
  await page.waitForTimeout(300);
  const btn = page.locator('.tstate-btn').first();
  await btn.click();
  await page.waitForTimeout(200);
  const after = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), MARKET_KEY);
  const recorded = after.pairs.some(p => Object.values(p.trend || {}).some(t => t.state));
  ok('トレンド記録が localStorage に保存される', recorded);
  ok('trendAt が入る', after.pairs.some(p => p.trendAt));
  ok('JSエラーなし', errors.length === 0, errors);
  await ctx.close();
}

/* ---------- 2. 破損検知：壊れたJSON → 上書きされない ---------- */
{
  console.log('\n[2] 破損検知（parse 失敗）');
  const { ctx, page, errors } = await newPage();
  await page.goto(URL);
  await page.waitForTimeout(400);
  // 本物のデータを作ってから壊す
  await page.evaluate(k => localStorage.setItem(k, '{"pairs":[{"id":"w1","pair":"USDJPY"}'), MARKET_KEY);
  await page.reload();
  await page.waitForTimeout(500);

  ok('破損バナーが表示される', await page.locator('#fatalBanner.show').count() === 1);
  const corrupt = await page.evaluate(() =>
    Object.keys(localStorage).filter(k => /__corrupt_\d+$/.test(k)));
  ok('原文が __corrupt_* に退避される', corrupt.length === 1, corrupt);

  // 全書き込み経路を叩いても上書きされないこと
  await page.click('.tab-btn[data-tab="trend"]');
  await page.waitForTimeout(300);
  for (const sel of ['.tstate-btn', '.tzone-btn', '.mv-alert-badge', '.mv-judge-btn']) {
    const el = page.locator(sel).first();
    if (await el.count()) { await el.click().catch(() => {}); await page.waitForTimeout(80); }
  }
  await page.click('.tab-btn[data-tab="trade"]');
  await page.waitForTimeout(200);
  await page.selectOption('#mvPairSelect', 'USDJPY').catch(() => {});
  await page.waitForTimeout(300);

  const raw = await page.evaluate(k => localStorage.getItem(k), MARKET_KEY);
  ok('壊れた原文が1バイトも書き換わっていない', raw === '{"pairs":[{"id":"w1","pair":"USDJPY"}', raw);
  ok('JSエラーなし', errors.length === 0, errors);
  await ctx.close();
}

/* ---------- 3. 破損検知：型不一致（pairs が配列でない） ---------- */
{
  console.log('\n[3] 破損検知（型不一致）');
  const { ctx, page } = await newPage();
  await page.goto(URL);
  await page.waitForTimeout(300);
  await page.evaluate(k => localStorage.setItem(k, '{"pairs":"こわれた","judgeLog":[]}'), MARKET_KEY);
  await page.reload();
  await page.waitForTimeout(500);
  ok('破損バナーが表示される', await page.locator('#fatalBanner.show').count() === 1);
  const raw = await page.evaluate(k => localStorage.getItem(k), MARKET_KEY);
  ok('上書きされない', raw === '{"pairs":"こわれた","judgeLog":[]}', raw);
  await ctx.close();
}

/* ---------- 4. 真の初回（空）は従来どおりプリセット生成する ---------- */
{
  console.log('\n[4] 真の初回は従来どおり');
  const { ctx, page } = await newPage();
  await page.goto(URL);
  await page.waitForTimeout(300);
  await page.evaluate(k => localStorage.removeItem(k), MARKET_KEY);
  await page.reload();
  await page.waitForTimeout(500);
  ok('バナーは出ない', await page.locator('#fatalBanner.show').count() === 0);
  const d = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), MARKET_KEY);
  ok('プリセット28銘柄が生成される', d && d.pairs.length === 28, d && d.pairs.length);
  await ctx.close();
}

/* ---------- 5. trades 側の破損検知 ---------- */
{
  console.log('\n[5] trades の破損検知');
  const { ctx, page } = await newPage();
  await page.goto(URL);
  await page.waitForTimeout(300);
  await page.evaluate(k => localStorage.setItem(k, '[{"id":"t1"'), TRADES_KEY);
  await page.reload();
  await page.waitForTimeout(500);
  ok('破損バナーが表示される', await page.locator('#fatalBanner.show').count() === 1);
  const raw = await page.evaluate(k => localStorage.getItem(k), TRADES_KEY);
  ok('上書きされない', raw === '[{"id":"t1"', raw);
  await ctx.close();
}

/* ---------- 6. 縮小ガード：件数が減る保存で __bak が残る ---------- */
{
  console.log('\n[6] 縮小ガード');
  const { ctx, page } = await newPage();
  await page.goto(URL);
  await page.waitForTimeout(400);
  const shrunk = await page.evaluate(k => {
    const cur = JSON.parse(localStorage.getItem(k));
    const next = { pairs: cur.pairs.slice(0, 5), snapshots: cur.snapshots, judgeLog: cur.judgeLog };
    saveMarket(next);
    return { bak: !!localStorage.getItem(k + '__bak'), now: JSON.parse(localStorage.getItem(k)).pairs.length };
  }, MARKET_KEY);
  ok('__bak に旧内容が退避される', shrunk.bak);
  ok('保存自体はブロックされない（正当な削除を邪魔しない）', shrunk.now === 5, shrunk);

  // 復元ボタン
  await page.click('.tab-btn[data-tab="settings"]');
  await page.waitForTimeout(200);
  page.removeAllListeners('dialog');
  page.on('dialog', d => d.accept().catch(() => {}));
  await page.click('#restoreBak');
  await page.waitForTimeout(600);
  const restored = await page.evaluate(k => JSON.parse(localStorage.getItem(k)).pairs.length, MARKET_KEY);
  ok('直前バックアップから復元できる', restored === 28, restored);
  await ctx.close();
}

/* ---------- 7. 全データ JSON エクスポート／インポート往復 ---------- */
{
  console.log('\n[7] 全データJSON往復');
  const { ctx, page, errors } = await newPage();
  await page.goto(URL);
  await page.waitForTimeout(400);

  // 記録を作る
  await page.click('.tab-btn[data-tab="trend"]');
  await page.waitForTimeout(300);
  await page.locator('.tstate-btn').first().click();
  await page.waitForTimeout(200);

  const snapshot = await page.evaluate(() => {
    const out = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('mochipoyo_')) out[k] = localStorage.getItem(k);
    }
    return out;
  });

  // エクスポート内容を組み立てる（ダウンロードは経由せずロジックを直接検証）
  const payload = await page.evaluate(() => {
    const data = {};
    backupKeys().forEach(k => { data[k] = localStorage.getItem(k); });
    return { app: 'fx-entry-checklist', schema: 1, exportedAt: new Date().toISOString(), data };
  });
  ok('環境認識ボードのデータが含まれる', !!payload.data[MARKET_KEY]);
  ok('退避キーは含まれない', !Object.keys(payload.data).some(k => /__bak$|__corrupt_|__preimport_/.test(k)));

  // データを壊してからインポートで戻す
  await page.evaluate(() => {
    Object.keys(localStorage).forEach(k => { if (k.startsWith('mochipoyo_')) localStorage.removeItem(k); });
  });
  page.removeAllListeners('dialog');
  page.on('dialog', d => d.accept().catch(() => {}));
  await page.click('.tab-btn[data-tab="settings"]');
  await page.waitForTimeout(200);
  await page.setInputFiles('#importJsonFile', {
    name: 'backup.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(payload)),
  });
  await page.waitForTimeout(1200);

  const after = await page.evaluate(() => {
    const out = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('mochipoyo_') && !/__bak$|__corrupt_|__preimport_/.test(k)) out[k] = localStorage.getItem(k);
    }
    return out;
  });
  const same = Object.keys(payload.data).every(k => after[k] === payload.data[k]);
  ok('インポートで全キーがバイト一致で戻る', same,
     Object.keys(payload.data).filter(k => after[k] !== payload.data[k]));
  ok('JSエラーなし', errors.length === 0, errors);
  await ctx.close();
}

/* ---------- 8. 他アプリのJSONは拒否する ---------- */
{
  console.log('\n[8] 不正ファイルの拒否');
  const { ctx, page } = await newPage();
  await page.goto(URL);
  await page.waitForTimeout(400);
  const before = await page.evaluate(k => localStorage.getItem(k), MARKET_KEY);
  await page.click('.tab-btn[data-tab="settings"]');
  await page.waitForTimeout(200);
  await page.setInputFiles('#importJsonFile', {
    name: 'other.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ app: 'something-else', data: {} })),
  });
  await page.waitForTimeout(600);
  const after = await page.evaluate(k => localStorage.getItem(k), MARKET_KEY);
  ok('データが変更されない', before === after);
  await ctx.close();
}

/* ---------- 9. PWA：manifest / SW / オフライン起動 ---------- */
{
  console.log('\n[9] PWA');
  const { ctx, page, errors } = await newPage();
  await page.goto(URL);
  await page.waitForTimeout(400);

  ok('manifest が相対パスで参照される',
     await page.getAttribute('link[rel="manifest"]', 'href') === './manifest.webmanifest');
  const mf = await page.evaluate(async () => (await fetch('./manifest.webmanifest')).json());
  ok('manifest の start_url / scope が相対', mf.start_url === './' && mf.scope === './');
  ok('manifest に 192/512 アイコンがある',
     mf.icons.some(i => i.sizes === '192x192') && mf.icons.some(i => i.sizes === '512x512'));
  ok('maskable アイコンがある', mf.icons.some(i => i.purpose === 'maskable'));
  for (const p of ['./assets/icon-192.png', './assets/icon-512.png', './assets/apple-touch-icon.png']) {
    const st = await page.evaluate(u => fetch(u).then(r => r.status), p);
    ok('アイコンが配信されている ' + p, st === 200, st);
  }

  // SW 登録とオフライン起動
  const reg = await page.evaluate(() =>
    navigator.serviceWorker.ready.then(r => !!r.active).catch(() => false));
  ok('Service Worker が有効になる', reg);
  await page.waitForTimeout(1200);   // precache 完了待ち

  await ctx.setOffline(true);
  const resp = await page.goto(URL).catch(() => null);
  ok('オフラインでも起動できる', !!resp && await page.locator('header h1').count() === 1);
  await ctx.setOffline(false);

  ok('JSエラーなし', errors.length === 0, errors);
  await ctx.close();
}

/* ---------- 10. 設定タブのホーム画面追加ガイドが出る ---------- */
{
  console.log('\n[10] ホーム画面追加ガイド');
  const { ctx, page } = await newPage();
  await page.goto(URL);
  await page.waitForTimeout(400);
  await page.click('.tab-btn[data-tab="settings"]');
  await page.waitForTimeout(300);
  const txt = await page.locator('#pwaStatus').innerText();
  ok('未インストール時に案内が出る', txt.includes('ブラウザのタブ'), txt.slice(0, 40));
  const info = await page.locator('#storageInfo').innerText();
  ok('ストレージ情報が出る', info.includes('使用量'), info);
  await ctx.close();
}

/* ---------- 11. タイムスタンプ地ならし（段階2） ---------- */
{
  console.log('\n[11] タイムスタンプ');
  const { ctx, page, errors } = await newPage();
  await page.goto(URL);
  await page.waitForTimeout(400);

  // トレンド：時間足単位の at
  await page.click('.tab-btn[data-tab="trend"]');
  await page.waitForTimeout(300);
  await page.locator('.tstate-btn').first().click();
  await page.waitForTimeout(250);
  let d = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), MARKET_KEY);
  const touched = d.pairs.find(p => Object.values(p.trend).some(t => t.at));
  ok('trend[tf].at が入る', !!touched);
  const stamped = Object.entries(touched.trend).filter(([, t]) => t.at);
  ok('記録した足だけに at が付く（他の足は空のまま）', stamped.length === 1, stamped.map(x => x[0]));
  ok('trendAt = その足の at', touched.trendAt === stamped[0][1].at);

  // アラート：chAt が ON/OFF どちらでも入る
  await page.locator('.mv-alert-badge').first().click();
  await page.waitForTimeout(250);
  d = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), MARKET_KEY);
  let withAlert = d.pairs.find(p => Object.values(p.alerts || {}).some(a => a.chAt));
  ok('alerts[tf].chAt が入る（ON）', !!withAlert);
  const onAt = Object.values(withAlert.alerts).find(a => a.chAt).chAt;
  await page.waitForTimeout(1100);
  await page.locator('.mv-alert-badge').first().click();
  await page.waitForTimeout(250);
  d = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), MARKET_KEY);
  withAlert = d.pairs.find(p => Object.values(p.alerts || {}).some(a => a.chAt));
  const offEntry = Object.values(withAlert.alerts).find(a => a.chAt);
  ok('OFF にしても chAt が更新される（消した新しさが残る）',
     offEntry.on === false && offEntry.at === '' && offEntry.chAt > onAt,
     offEntry);

  // 判定：judgeAt
  await page.locator('.mv-judge-btn').first().click();
  await page.waitForTimeout(250);
  d = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), MARKET_KEY);
  ok('judgeAt が入る', d.pairs.some(p => p.judgeAt));
  ok('judgeLog に記録される（統計が壊れていない）', d.judgeLog.length === 1, d.judgeLog.length);

  // 根拠チェック：checksAt（項目単位）
  await page.click('.tab-btn[data-tab="trade"]');
  await page.waitForTimeout(200);
  await page.selectOption('#mvPairSelect', 'USDJPY');
  await page.waitForTimeout(400);
  await page.locator('.mv-tfcheck-btn').first().click();
  await page.waitForTimeout(250);
  d = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), MARKET_KEY);
  const wc = d.pairs.find(p => p.checksAt && Object.keys(p.checksAt).length);
  ok('checksAt が項目単位で入る', !!wc && Object.keys(wc.checksAt)[0].includes('.'),
     wc && Object.keys(wc.checksAt));
  ok('checksHigher の形は変わっていない（CSV スナップショット互換）',
     wc && typeof wc.checksHigher === 'object' && !Array.isArray(wc.checksHigher));

  // 上位足プルダウン：tfAt
  await page.selectOption('[data-mv-tf-select="tfHigher"]', { index: 1 });
  await page.waitForTimeout(250);
  d = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), MARKET_KEY);
  ok('tfAt が入る', d.pairs.some(p => p.tfAt));

  ok('JSエラーなし', errors.length === 0, errors);
  await ctx.close();
}

/* ---------- 12. 既存データの統計が動かない（レガシー保護） ---------- */
{
  console.log('\n[12] 既存記録の統計不変');
  const { ctx, page } = await newPage();
  await page.goto(URL);
  await page.waitForTimeout(300);

  // S22 形式（updatedAt なし）の記録を流し込む
  const legacy = [
    { id: 't1', tradeType: 'real', result: 'entered', pair: 'USDJPY', direction: 'long',
      datetime: '2026-08-01T09:00', entryPrice: '150.00', slPrice: '149.00', slBasis: 'swing',
      splitCount: 3, createdAt: '2026-08-01T09:00:00.000Z',
      exits: [ { slot: 1, actual: true, basis: 'target', price: '152.00' },
               { slot: 2, actual: true, basis: 'target', price: '153.00' },
               { slot: 3, actual: true, basis: 'target', price: '154.00' } ] },
    { id: 't2', tradeType: 'real', result: 'through', pair: 'EURUSD',
      datetime: '2026-08-02T09:00', createdAt: '2026-08-02T09:00:00.000Z', exits: [] },
  ];
  await page.evaluate(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [TRADES_KEY, legacy]);
  await page.reload();
  await page.waitForTimeout(500);
  await page.click('.tab-btn[data-tab="review"]');
  await page.waitForTimeout(400);

  const tiles = await page.locator('.stat-tile, .stat').allInnerTexts().catch(() => []);
  ok('統計タイルが描画される', tiles.length > 0, tiles.length);
  const joined = tiles.join(' | ');
  ok('合成RR が計算される（+3.00 = (2+3+4)/3）', joined.includes('3.00'), joined.slice(0, 300));

  const stored = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), TRADES_KEY);
  ok('読み込むだけでは updatedAt が生えない（既存記録を書き換えない）',
     stored.every(t => !('updatedAt' in t)), stored.map(t => t.updatedAt));
  await ctx.close();
}

/* ---------- 13. 削除のトゥームストーン ---------- */
{
  console.log('\n[13] トゥームストーン');
  const { ctx, page } = await newPage();
  await page.goto(URL);
  await page.waitForTimeout(300);
  await page.evaluate(([k, v]) => localStorage.setItem(k, JSON.stringify(v)),
    [TRADES_KEY, [{ id: 'tX', tradeType: 'real', result: 'through', pair: 'USDJPY',
                    datetime: '2026-08-01T09:00', createdAt: '2026-08-01T09:00:00.000Z', exits: [] }]]);
  await page.reload();
  await page.waitForTimeout(500);
  await page.click('.tab-btn[data-tab="review"]');
  await page.waitForTimeout(400);
  const del = page.locator('[data-del], .record-del, button:has-text("削除")').first();
  if (await del.count()) {
    await del.click();
    await page.waitForTimeout(300);
    await page.click('#deleteConfirm');
    await page.waitForTimeout(400);
  }
  const tomb = await page.evaluate(() => JSON.parse(localStorage.getItem('mochipoyo_tombstones_v1') || '{}'));
  ok('削除した記録の墓標が残る', tomb.trades && !!tomb.trades.tX, tomb);
  const left = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), TRADES_KEY);
  ok('記録自体は消えている', Array.isArray(left) && left.length === 0, left);
  await ctx.close();
}

/* ---------- 14. マージ規則（同期の中核。ここが壊れると記録が消える） ---------- */
{
  console.log('\n[14] マージ規則');
  const { ctx, page, errors } = await newPage();
  await page.goto(URL);
  await page.waitForTimeout(400);

  const T0 = '2026-08-20T00:00:00.000Z';
  const T1 = '2026-08-21T00:00:00.000Z';
  const T2 = '2026-08-22T00:00:00.000Z';

  const r = await page.evaluate(([T0, T1, T2]) => {
    const empty = { trades: {}, pairs: {} };
    const out = {};

    /* (a) 別々の時間足を別端末で記録 → 両方残る（最重要） */
    const A = { id: 'a', pair: 'USDJPY', alerts: {}, checksAt: {},
      trend: { d: { state: 'up', zone: 'green', granville: '', at: T1 },
               h4: { state: '', zone: '', granville: '', at: '' } } };
    const B = { id: 'b', pair: 'USDJPY', alerts: {}, checksAt: {},
      trend: { d: { state: '', zone: '', granville: '', at: '' },
               h4: { state: 'down', zone: 'red', granville: '', at: T1 } } };
    const m = mergePair(A, B);
    out.bothTf = { d: m.trend.d.state, h4: m.trend.h4.state, id: m.id, trendAt: m.trendAt };

    /* (b) 同じ足を両端末で記録 → 新しい方が勝つ */
    const C = { id: 'c', pair: 'X', alerts: {}, checksAt: {},
      trend: { d: { state: 'up', zone: '', granville: '', at: T1 } } };
    const D = { id: 'd', pair: 'X', alerts: {}, checksAt: {},
      trend: { d: { state: 'down', zone: '', granville: '', at: T2 } } };
    out.newerWins = mergePair(C, D).trend.d.state;
    out.olderLoses = mergePair(D, C).trend.d.state;

    /* (c) アラートを他端末で OFF にした → OFF が伝わる */
    const E = { id: 'e', pair: 'Y', checksAt: {}, alerts: { h1: { on: true, at: T1, chAt: T1 } } };
    const F = { id: 'f', pair: 'Y', checksAt: {}, alerts: { h1: { on: false, at: '', chAt: T2 } } };
    out.alertOff = mergePair(E, F).alerts.h1.on;

    /* (d) 根拠チェックは項目単位で両方残る */
    const G = { id: 'g', pair: 'Z', alerts: {},
      checksHigher: { granville: '1' }, checksEntry: {},
      checksAt: { 'checksHigher.granville': T1 } };
    const H = { id: 'h', pair: 'Z', alerts: {},
      checksHigher: { macd: 'レギュラーダイバージェンス' }, checksEntry: {},
      checksAt: { 'checksHigher.macd': T1 } };
    const mh = mergePair(G, H);
    out.checksBoth = [mh.checksHigher.granville, mh.checksHigher.macd];

    /* (e) トレード：id 突き合わせ + updatedAt で新しい方 */
    out.trades = mergeTrades(
      [{ id: 't1', notes: 'local', updatedAt: T2 }, { id: 't2', notes: 'onlyLocal', updatedAt: T1 }],
      [{ id: 't1', notes: 'remote', updatedAt: T1 }, { id: 't3', notes: 'onlyRemote', updatedAt: T1 }],
      empty
    ).map(t => t.id + ':' + t.notes).sort();

    /* (f) 削除は復活しない／削除後の編集は残る */
    out.tombWins = mergeTrades([], [{ id: 'tx', updatedAt: T0 }],
      { trades: { tx: T1 }, pairs: {} }).length;
    out.editAfterDelete = mergeTrades([], [{ id: 'tx', updatedAt: T2 }],
      { trades: { tx: T1 }, pairs: {} }).length;

    /* (g) judgeLog は集合和・時刻順 */
    out.log = mergeLog(
      [{ id: 'j1', at: T1 }, { id: 'j2', at: T2 }],
      [{ id: 'j1', at: T1 }, { id: 'j3', at: T0 }]
    ).map(x => x.id);

    /* (h) ペアの突き合わせはペア名（id は端末ごとに違う） */
    const lp = [{ id: 'local1', pair: 'USDJPY', alerts: {}, checksAt: {}, trend: {} }];
    const rp = [{ id: 'remote9', pair: 'USDJPY', alerts: {}, checksAt: {}, trend: {} },
                { id: 'remote8', pair: 'GOLD',   alerts: {}, checksAt: {}, trend: {} }];
    const mp = mergePairs(lp, rp, empty);
    out.pairMerge = { n: mp.length, keptId: mp[0].id, names: mp.map(p => p.pair).sort() };

    return out;
  }, [T0, T1, T2]);

  ok('別端末で別の足を記録しても両方残る（最重要）',
     r.bothTf.d === 'up' && r.bothTf.h4 === 'down', r.bothTf);
  ok('マージ後もローカルの id を保つ', r.bothTf.id === 'a', r.bothTf.id);
  ok('trendAt が最新の足から作り直される', r.bothTf.trendAt === T1, r.bothTf.trendAt);
  ok('同じ足なら新しい記録が勝つ', r.newerWins === 'down', r.newerWins);
  ok('順序を入れ替えても結果は同じ', r.olderLoses === 'down', r.olderLoses);
  ok('他端末でOFFにしたアラートがOFFのまま伝わる', r.alertOff === false, r.alertOff);
  ok('根拠チェックは項目単位で両方残る',
     r.checksBoth[0] === '1' && r.checksBoth[1] === 'レギュラーダイバージェンス', r.checksBoth);
  ok('トレードは3件になり、競合は新しい方が残る',
     r.trades.join(',') === 't1:local,t2:onlyLocal,t3:onlyRemote', r.trades);
  ok('削除した記録は他端末から復活しない', r.tombWins === 0, r.tombWins);
  ok('削除後に他端末で編集された記録は残る', r.editAfterDelete === 1, r.editAfterDelete);
  ok('判定ログは重複せず時刻順に並ぶ', r.log.join(',') === 'j3,j1,j2', r.log);
  ok('ペアはペア名で突き合わせ、重複しない', r.pairMerge.n === 2, r.pairMerge);
  ok('既存ペアのローカルidが維持される', r.pairMerge.keptId === 'local1', r.pairMerge);
  ok('他端末にしかないペアは取り込まれる',
     r.pairMerge.names.join(',') === 'GOLD,USDJPY', r.pairMerge.names);
  ok('JSエラーなし', errors.length === 0, errors);
  await ctx.close();
}

/* ---------- 15. 同期UIと安全弁 ---------- */
{
  console.log('\n[15] 同期UI・安全弁');
  const { ctx, page } = await newPage();
  await page.goto(URL);
  await page.waitForTimeout(400);

  ok('未設定チップが出る', (await page.locator('#syncChip').innerText()).includes('未設定'));
  await page.click('.tab-btn[data-tab="settings"]');
  await page.waitForTimeout(300);
  ok('接続先の入力欄が出る', await page.locator('#syncSetup:not(.hidden)').count() === 1);
  ok('ログイン欄はまだ出ない', await page.locator('#syncLogin.hidden').count() === 1);

  await page.fill('#syncUrl', 'https://example.supabase.co');
  await page.fill('#syncKey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy.dummy');
  await page.click('#syncSaveConfig');
  await page.waitForTimeout(400);
  ok('保存するとログイン欄に切り替わる', await page.locator('#syncLogin:not(.hidden)').count() === 1);
  ok('チップが未ログインになる', (await page.locator('#syncChip').innerText()).includes('未ログイン'));

  // 安全弁：破損中は同期しない
  await page.evaluate(k => localStorage.setItem(k, '{broken'), MARKET_KEY);
  await page.reload();
  await page.waitForTimeout(600);
  ok('破損中はチップが停止中になる', (await page.locator('#syncChip').innerText()).includes('停止中'));
  const blocked = await page.evaluate(async () => {
    let called = false;
    const orig = window.fetch;
    window.fetch = (...a) => { called = true; return orig(...a); };
    localStorage.setItem('mochipoyo_sync_auth_v1', JSON.stringify({
      access_token: 'x', refresh_token: 'y', expires_at: Date.now() + 999999,
      email: 'a@b.c', user_id: 'u1' }));
    await runSync();
    window.fetch = orig;
    return called;
  });
  ok('破損中は同期通信そのものを行わない（クラウドを潰さない）', blocked === false);
  await ctx.close();
}

/* ---------- 16. バックアップにログイン情報を含めない ---------- */
{
  console.log('\n[16] バックアップの安全性');
  const { ctx, page } = await newPage();
  await page.goto(URL);
  await page.waitForTimeout(400);
  const keys = await page.evaluate(() => {
    localStorage.setItem('mochipoyo_sync_auth_v1', JSON.stringify({ access_token: 'secret' }));
    localStorage.setItem('mochipoyo_sync_lastpush_v1', JSON.stringify({ big: 1 }));
    return backupKeys();
  });
  ok('ログイン情報はバックアップに含まれない', !keys.includes('mochipoyo_sync_auth_v1'), keys);
  ok('巻き戻し用スナップショットも含まれない', !keys.includes('mochipoyo_sync_lastpush_v1'));
  await ctx.close();
}

/* ---------- 17. 2端末の通し同期（Supabase を模したサーバー相手に実際の fetch を通す） ---------- */
{
  console.log('\n[17] 2端末の通し同期');

  /* クラウド側の1行を node 側に持ち、両端末のリクエストを実際に捌く */
  const cloud = { row: null };
  let conflictOnce = false;

  const install = async (ctx) => {
    await ctx.route('https://mock.supabase.co/**', async (route) => {
      const req = route.request();
      /* ファイル冒頭の定数 URL が globalThis.URL を隠すため、明示的に取る */
      const url = new globalThis.URL(req.url());
      const json = (status, body) => route.fulfill({
        status, contentType: 'application/json', body: JSON.stringify(body),
        headers: { 'access-control-allow-origin': '*' },
      });
      if (req.method() === 'OPTIONS') {
        return route.fulfill({ status: 204, headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': '*',
          'access-control-allow-methods': '*' } });
      }
      if (url.pathname === '/rest/v1/app_state') {
        if (req.method() === 'GET') return json(200, cloud.row ? [cloud.row] : []);
        if (req.method() === 'POST') {
          cloud.row = { doc: JSON.parse(req.postData()).doc, rev: 1 };
          return json(201, []);
        }
        if (req.method() === 'PATCH') {
          const wantRev = Number((url.searchParams.get('rev') || '').replace('eq.', ''));
          /* 1回だけ他端末が割り込んだ状況を作り、楽観ロックの再試行を検証する */
          if (!conflictOnce) { conflictOnce = true; return json(200, []); }
          if (!cloud.row || cloud.row.rev !== wantRev) return json(200, []);
          const b = JSON.parse(req.postData());
          cloud.row = { doc: b.doc, rev: b.rev };
          return json(200, [cloud.row]);
        }
      }
      return json(404, {});
    });
  };

  const setup = async (page) => {
    await page.evaluate(() => {
      localStorage.setItem('mochipoyo_sync_config_v1',
        JSON.stringify({ url: 'https://mock.supabase.co', key: 'anon-key-anon-key-anon-key' }));
      localStorage.setItem('mochipoyo_sync_auth_v1', JSON.stringify({
        access_token: 'tok', refresh_token: 'r',
        expires_at: Date.now() + 3600000, email: 'me@example.com', user_id: 'u1' }));
    });
  };

  // --- 端末A：日足を記録して同期 ---
  const A = await newPage(); await install(A.ctx);
  await A.page.goto(URL); await A.page.waitForTimeout(400);
  await setup(A.page); await A.page.reload(); await A.page.waitForTimeout(600);

  await A.page.click('.tab-btn[data-tab="trend"]');
  await A.page.waitForTimeout(400);
  await A.page.locator('.tstate-btn').first().click();
  await A.page.waitForTimeout(300);
  const aPair = await A.page.evaluate(k => {
    const d = JSON.parse(localStorage.getItem(k));
    const w = d.pairs.find(p => Object.values(p.trend).some(t => t.state));
    const tf = Object.entries(w.trend).find(([, t]) => t.state);
    return { pair: w.pair, tf: tf[0], state: tf[1].state };
  }, MARKET_KEY);
  await A.page.evaluate(() => runSync());
  await A.page.waitForTimeout(1500);
  ok('端末Aの記録がクラウドに上がる', !!cloud.row && cloud.row.doc.market.pairs.length > 0,
     cloud.row && cloud.row.rev);
  ok('楽観ロックの衝突から自動で復帰する', conflictOnce && !!cloud.row);

  // --- 端末B：まっさらな状態で同期 → Aの記録が降りてくる ---
  const B = await newPage(); await install(B.ctx);
  await B.page.goto(URL); await B.page.waitForTimeout(400);
  await setup(B.page); await B.page.reload(); await B.page.waitForTimeout(1800);
  const gotOnB = await B.page.evaluate(([k, p, tf]) => {
    const d = JSON.parse(localStorage.getItem(k));
    const w = d.pairs.find(x => x.pair === p);
    return w && w.trend[tf] && w.trend[tf].state;
  }, [MARKET_KEY, aPair.pair, aPair.tf]);
  ok('端末Bに端末Aの記録が届く', gotOnB === aPair.state, { gotOnB, expect: aPair.state });

  // --- 端末Bで別の足を記録 → 同期 → 端末Aで両方見える ---
  const otherTf = aPair.tf === 'd' ? 'h4' : 'd';
  await B.page.evaluate(([p, tf]) => {
    const d = loadMarket();
    const w = d.pairs.find(x => x.pair === p);
    mvWriteTrend(w.id, tf, { state: 'down', zone: 'red' });
  }, [aPair.pair, otherTf]);
  await B.page.evaluate(() => runSync());
  await B.page.waitForTimeout(1500);

  await A.page.evaluate(() => runSync());
  await A.page.waitForTimeout(1500);
  const onA = await A.page.evaluate(([k, p, t1, t2]) => {
    const d = JSON.parse(localStorage.getItem(k));
    const w = d.pairs.find(x => x.pair === p);
    return { own: w.trend[t1].state, other: w.trend[t2].state,
             pairs: d.pairs.length, dupes: d.pairs.length - new Set(d.pairs.map(x => x.pair)).size };
  }, [MARKET_KEY, aPair.pair, aPair.tf, otherTf]);
  ok('端末Aに自分の記録が残っている', onA.own === aPair.state, onA);
  ok('端末Aに端末Bの別の足が届く（どちらも消えない）', onA.other === 'down', onA);
  ok('ペアが重複しない', onA.dupes === 0 && onA.pairs === 28, onA);
  ok('JSエラーなし（A/B とも）', A.errors.length === 0 && B.errors.length === 0,
     [A.errors, B.errors]);

  const chip = await A.page.locator('#syncChip').innerText();
  ok('同期成功がチップに出る', chip.startsWith('✔'), chip);

  await A.ctx.close(); await B.ctx.close();
}

await browser.close();
console.log('\n=== ' + pass + ' passed / ' + fail + ' failed ===');
process.exit(fail ? 1 : 0);
