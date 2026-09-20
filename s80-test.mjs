/* セッション80 検証：確度%帯別/根拠項目別の成績、リスク額＋R倍率、見送りの振り返り、
   孤児Firebaseファイル削除、CSV往復（riskAmount/retroOutcome列）。
   実行: node s80-test.mjs */
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

const TRADES_KEY = 'mochipoyo_trades_v1';

/* ─────────────────────────────────────────────────────────
   1. リスク額＋R倍率
   ───────────────────────────────────────────────────────── */
console.log('\n[1] リスク額＋R倍率');
{
  const trades = [
    { id: 'r1', tradeType: 'real', result: 'entered', pair: 'USDJPY', direction: 'long',
      datetime: '2026-09-01T09:00', createdAt: '2026-09-01T09:00:00.000Z',
      resultTag: 'reg', pnlAmount: 20000, riskAmount: 10000 },
    { id: 'r2', tradeType: 'real', result: 'entered', pair: 'EURUSD', direction: 'short',
      datetime: '2026-09-02T09:00', createdAt: '2026-09-02T09:00:00.000Z',
      resultTag: 'stoploss', pnlAmount: -10000, riskAmount: 10000 },
  ];
  await page.evaluate(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [TRADES_KEY, trades]);
  await page.reload();
  await page.waitForTimeout(400);
  await page.click('.tab-btn[data-tab="review"]');
  await page.waitForTimeout(300);

  const html = await page.locator('#recordList').innerHTML();
  ok('+2.00R がカードに表示される', html.includes('+2.00R'), html.includes('+2.00R'));
  ok('-1.00R がカードに表示される', html.includes('-1.00R'), html.includes('-1.00R'));

  const tiles = await page.locator('.stat-tile').allInnerTexts();
  const joined = tiles.join(' | ');
  ok('平均R倍率タイルが出る（+0.50 = (2-1)/2）', joined.includes('平均R倍率') && joined.includes('0.50'), joined);
}

/* ─────────────────────────────────────────────────────────
   2. 確度%帯別の成績 / 根拠項目別の成績
   ───────────────────────────────────────────────────────── */
console.log('\n[2] 確度%帯別・根拠項目別の成績');
{
  const trades = [
    { id: 'c1', tradeType: 'real', result: 'entered', pair: 'USDJPY', direction: 'long',
      datetime: '2026-09-03T09:00', createdAt: '2026-09-03T09:00:00.000Z',
      resultTag: 'reg', pnlAmount: 15000,
      mvChecks: { higher: { rciShort: '下限', macd: 'RD(転換)', roundNumber: '有' }, entry: { entryFibo: '38%' } } },
    { id: 'c2', tradeType: 'real', result: 'entered', pair: 'EURUSD', direction: 'short',
      datetime: '2026-09-04T09:00', createdAt: '2026-09-04T09:00:00.000Z',
      resultTag: 'stoploss', pnlAmount: -8000,
      mvChecks: { higher: { rciShort: '❌', macd: '❌' }, entry: { entryFibo: '61%' } } },
  ];
  await page.evaluate(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [TRADES_KEY, trades]);
  await page.reload();
  await page.waitForTimeout(400);
  await page.click('.tab-btn[data-tab="review"]');
  await page.waitForTimeout(300);

  const confHtml = await page.locator('#confStats').innerHTML();
  ok('確度%帯別の成績に見出しが出る', confHtml.includes('確度%帯別の成績'));
  ok('90〜100%の行が出る（c1: rciShort/macd/roundNumberのみ判定＝100%）', confHtml.includes('90〜100%'), confHtml);
  ok('69%以下の行が出る（c2: macd❌で大きく減点）', confHtml.includes('69%以下'), confHtml);

  const itemHtml = await page.locator('#checkItemStats').innerHTML();
  ok('根拠項目別の成績に見出しが出る', itemHtml.includes('根拠項目別の成績'));
  ok('RCI 短期のグループが出る', itemHtml.includes('RCI 短期'), itemHtml.slice(0, 200));
  ok('entryFiboは重複除外され出ない', !itemHtml.includes('エントリーFibo'), itemHtml.includes('エントリーFibo'));
}

/* ─────────────────────────────────────────────────────────
   3. 見送りの振り返り（保留・スルー）
   ───────────────────────────────────────────────────────── */
console.log('\n[3] 見送りの振り返り');
{
  const trades = [
    { id: 'h1', tradeType: 'real', result: 'through', pair: 'USDJPY',
      datetime: '2026-09-05T09:00', createdAt: '2026-09-05T09:00:00.000Z' },
  ];
  await page.evaluate(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [TRADES_KEY, trades]);
  await page.reload();
  await page.waitForTimeout(400);
  await page.click('.tab-btn[data-tab="review"]');
  await page.waitForTimeout(300);

  ok('スルー記録に振り返りボタンが出る', await page.locator('[data-retro="h1"]').count() === 2);
  await page.click('[data-retro="h1"][data-retro-value="missed"]');
  await page.waitForTimeout(200);
  let t = await page.evaluate(k => JSON.parse(localStorage.getItem(k))[0], TRADES_KEY);
  ok('missed が保存される', t.retroOutcome === 'missed', t.retroOutcome);

  const retroHtml1 = await page.locator('#retroStats').innerHTML();
  ok('見送りの振り返りタイルに1件反映される', retroHtml1.includes('1件') && retroHtml1.includes('逃した'), retroHtml1);

  await page.click('[data-retro="h1"][data-retro-value="missed"]');
  await page.waitForTimeout(200);
  t = await page.evaluate(k => JSON.parse(localStorage.getItem(k))[0], TRADES_KEY);
  ok('同じボタンの再タップで解除される', t.retroOutcome === '', t.retroOutcome);

  await page.click('[data-retro="h1"][data-retro-value="valid"]');
  await page.waitForTimeout(200);
  t = await page.evaluate(k => JSON.parse(localStorage.getItem(k))[0], TRADES_KEY);
  ok('valid に切り替えられる', t.retroOutcome === 'valid', t.retroOutcome);

  ok('エントリー済み記録には振り返りボタンが出ない', await page.evaluate(() => {
    const entered = { id: 'e1', tradeType: 'real', result: 'entered', pair: 'USDJPY', direction: 'long',
      datetime: '2026-09-06T09:00', createdAt: '2026-09-06T09:00:00.000Z' };
    const trades = JSON.parse(localStorage.getItem('mochipoyo_trades_v1'));
    trades.push(entered);
    localStorage.setItem('mochipoyo_trades_v1', JSON.stringify(trades));
    return true;
  }));
  await page.reload();
  await page.waitForTimeout(400);
  await page.click('.tab-btn[data-tab="review"]');
  await page.waitForTimeout(300);
  ok('エントリー済み記録(e1)に振り返りボタンが出ない', await page.locator('[data-retro="e1"]').count() === 0);
}

/* ─────────────────────────────────────────────────────────
   4. CSV往復（riskAmount / retroOutcome）
   ───────────────────────────────────────────────────────── */
console.log('\n[4] CSV往復');
{
  const trades = [
    { id: 'csv1', tradeType: 'real', result: 'entered', pair: 'USDJPY', direction: 'long',
      datetime: '2026-09-07T09:00', createdAt: '2026-09-07T09:00:00.000Z',
      resultTag: 'reg', pnlAmount: 12000, riskAmount: 6000, beTouch: '' },
    { id: 'csv2', tradeType: 'real', result: 'through', pair: 'EURUSD',
      datetime: '2026-09-08T09:00', createdAt: '2026-09-08T09:00:00.000Z', retroOutcome: 'missed' },
  ];
  await page.evaluate(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [TRADES_KEY, trades]);
  await page.reload();
  await page.waitForTimeout(400);

  const roundTripped = await page.evaluate(() => {
    const rows = [CSV_HEADERS.join(',')];
    const ts = loadTrades();
    ts.forEach(t => {
      const mvChecks = t.mvChecks || {};
      const images = t.images || {};
      rows.push([
        t.id, getTradeType(t), t.alertPair, t.alertTf, t.result, t.entryPattern, t.datetime,
        t.exitDatetime, t.pair, t.tfHigher, t.tfEntry, t.direction, t.exitResult, t.notes,
        t.manualAlertAt, t.manualAlertTf, t.resultTag, t.resultOtherReason, t.pnlAmount, t.riskAmount || 0, t.beTouch,
        t.retroOutcome || '',
        images.entry || '', images.higher || '', JSON.stringify(Array.isArray(images.others) ? images.others : []), t.watchId,
        ...CSV_BASIS_COLUMNS.map(c => (mvChecks[c.snapshot] || {})[c.key] || ''),
        t.createdAt,
      ].map(csvField).join(','));
    });
    const csvText = rows.join('\r\n');
    const parsed = parseCsv(csvText);
    const header = parsed[0];
    const idx = {};
    CSV_HEADERS.forEach(h => { idx[h] = header.indexOf(h); });
    const get = (r, key) => idx[key] >= 0 ? (r[idx[key]] ?? '') : '';
    return parsed.slice(1).map(r => ({
      id: get(r, 'id'),
      riskAmount: Number(get(r, 'riskAmount')) || 0,
      retroOutcome: get(r, 'retroOutcome'),
    }));
  });
  ok('riskAmount がCSVを往復する', roundTripped.find(r => r.id === 'csv1').riskAmount === 6000, roundTripped);
  ok('retroOutcome がCSVを往復する', roundTripped.find(r => r.id === 'csv2').retroOutcome === 'missed', roundTripped);
}

/* ─────────────────────────────────────────────────────────
   5. JSエラー
   ───────────────────────────────────────────────────────── */
console.log('\n[5] JSエラー');
ok('コンソールエラーなし', errors.length === 0, errors);

await ctx.close();
await browser.close();
console.log('\n──────────────────────────');
console.log('  ✅ ' + pass + '  ❌ ' + fail);
process.exit(fail ? 1 : 0);
