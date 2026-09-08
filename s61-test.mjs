/* セッション61 検証：根拠チェックの選択肢整理と上位足の重み付き確度
     - 上位足の列から エントリーFibo が消え、エントリー足の列には残る
     - RCI の「⏳待ち」／MACD の「⏳RD待ち・⏳HD待ち」／ラウンド「無」／ロール「未確認」が撤去される
     - 上位足の確度が wHi の重み付け（グランビル10 / RCI35 / MACD35 / ラウンド10 / ロール10 = 100）になる
     - エントリー足の確度・合算の表示が撤去される
     - 既存データの ⏳（S46）は isUnmetCheck / pairWaitCount が従来どおり拾う
   s59-test.mjs と同じ file:// ＋ localStorage 直注入の型。 */
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
const NOW = new Date().toISOString();

/* 根拠パネルを開ける1ペア。S48 以降「根拠」ボタンは圏外でも常時出るので波の記録は最小で足りる。 */
function seedPair(checksHigher, checksEntry) {
  return { [MARKET]: {
    pairs: [{
      id: 'p1', pair: 'USDJPY', tfHigher: '', tfEntry: '', alerts: {}, judge: '',
      checksHigher: checksHigher || {}, checksEntry: checksEntry || {}, trendAt: NOW,
      trend: {
        h1: { state: 'up', zone: 'green', granville: '2', wpos: '36,62', at: NOW },
        h4: { state: '', zone: '', granville: '', wpos: '', at: '' },
        d:  { state: '', zone: '', granville: '', wpos: '', at: '' },
      },
    }],
  } };
}
const W1 = '[data-trend-item="p1"] ';

/* p1 の日足の行から根拠パネルを開く（押した足＝上位足になる）。 */
async function openPanel(page) {
  await page.click('[data-tab="trend"]');
  await page.click(W1 + '[data-trend-panel-open][data-tf="d"]');
  await page.waitForSelector(W1 + '.trend-panel');
}

console.log('\n[①] 選択肢の整理（MV_TF_CHECKS の定義）');
{
  const page = await newPage(null);
  const opts = await page.evaluate(() =>
    Object.fromEntries(MV_TF_CHECKS.map(c => [c.k, c.opts])));

  eq('RCI 短期は 上限/60↑/60↓/下限/❌ の5択', opts.rciShort, ['上限', '60↑', '60↓', '下限', '❌']);
  eq('RCI 中期も同じ5択', opts.rciMid, ['上限', '60↑', '60↓', '下限', '❌']);
  eq('RCI 長期も同じ5択', opts.rciLong, ['上限', '60↑', '60↓', '下限', '❌']);
  eq('MACD は RD/HD/❌ の3択', opts.macd, ['RD(転換)', 'HD(継続)', '❌']);
  eq('ラウンドナンバーは 有/❌ の2択', opts.roundNumber, ['有', '❌']);
  eq('ロールリバーサルは 確認/❌ の2択', opts.rollReversal, ['確認', '❌']);

  const all = Object.values(opts).flat();
  ok('どの項目にも「⏳」の選択肢が残っていない', !all.some(o => o.indexOf('⏳') === 0));
  ok('ラウンドナンバーに「無」が無い', !opts.roundNumber.includes('無'));
  ok('ロールリバーサルに「未確認」が無い', !opts.rollReversal.includes('未確認'));
  ok('エントリーFibo の選択肢は従来どおり', opts.entryFibo.length === 6 && opts.entryFibo[0] === '23%');
  await page.close();
}

console.log('\n[②] 上位足の重み配分（合計100）');
{
  const page = await newPage(null);
  const w = await page.evaluate(() =>
    Object.fromEntries(MV_TF_CHECKS.map(c => [c.k, c.wHi === undefined ? null : c.wHi])));

  eq('グランビルは10', w.granville, 10);
  eq('MACD は35', w.macd, 35);
  eq('ラウンドナンバーは10', w.roundNumber, 10);
  eq('ロールリバーサルは10', w.rollReversal, 10);
  ok('RCI 3本の合計は35', Math.abs(w.rciShort + w.rciMid + w.rciLong - 35) < 1e-9);
  ok('RCI 3本は等分', w.rciShort === w.rciMid && w.rciMid === w.rciLong);
  eq('entryFibo は上位足の重みを持たない', w.entryFibo, null);

  const sum = await page.evaluate(() => MV_HIGHER_CHECKS.reduce((n, c) => n + c.wHi, 0));
  ok('MV_HIGHER_CHECKS の重み合計は100', Math.abs(sum - 100) < 1e-9);
  eq('MV_HIGHER_CHECKS は entryFibo を含まない7項目',
    await page.evaluate(() => MV_HIGHER_CHECKS.map(c => c.k)),
    ['granville', 'rciShort', 'rciMid', 'rciLong', 'macd', 'roundNumber', 'rollReversal']);
  ok('RCI・MACD の比率がラウンド・ロールより大きい', w.macd > w.roundNumber && w.rciShort > w.roundNumber / 3);
  await page.close();
}

console.log('\n[③] higherConfidence の計算');
{
  const page = await newPage(null);
  const conf = c => page.evaluate(x => higherConfidence(x), c);

  eq('全て未選択なら100%（まだ見ていないだけで崩れていない）', await conf({}), 100);
  eq('MACD が ❌ で 65%', await conf({ macd: '❌' }), 65);
  eq('RCI 短期が ❌ で 88%（100 - 35/3 の四捨五入）', await conf({ rciShort: '❌' }), 88);
  eq('RCI 3本が ❌ で 65%', await conf({ rciShort: '❌', rciMid: '❌', rciLong: '❌' }), 65);
  eq('ラウンドナンバーが ❌ で 90%', await conf({ roundNumber: '❌' }), 90);
  eq('ロールリバーサルが ❌ で 90%', await conf({ rollReversal: '❌' }), 90);
  eq('グランビルが ❌ で 90%', await conf({ granville: '❌' }), 90);
  eq('ラウンド＋ロールが ❌ でも80%（補助項目は軽い）',
    await conf({ roundNumber: '❌', rollReversal: '❌' }), 80);
  eq('RCI3本＋MACD が ❌ なら30%（主軸が崩れると大きく落ちる）',
    await conf({ rciShort: '❌', rciMid: '❌', rciLong: '❌', macd: '❌' }), 30);
  eq('全項目 ❌ で0%', await conf({
    granville: '❌', rciShort: '❌', rciMid: '❌', rciLong: '❌',
    macd: '❌', roundNumber: '❌', rollReversal: '❌' }), 0);
  eq('達成を選んだ項目は減点されない', await conf({ macd: 'RD(転換)', roundNumber: '有' }), 100);
  eq('エントリーFibo が ❌ でも上位足の確度は下がらない', await conf({ entryFibo: '❌' }), 100);
  /* S46 の ⏳ は選択肢から消えたが、既存データが残っている端末があるので減点は続ける。 */
  eq('既存データの ⏳待ち は ❌ と同じく減点される', await conf({ macd: '⏳RD待ち' }), 65);
  await page.close();
}

console.log('\n[④] パネル表示：上位足の列から Fibo が消える');
{
  const page = await newPage(seedPair(), { width: 375, height: 900 });
  await openPanel(page);

  const rows = await page.locator(W1 + '.trend-panel .tp-grid .tp-row').count();
  eq('行数はヘッダ＋8項目', rows, 9);

  const fiboRow = page.locator(W1 + '.trend-panel .tp-row', { hasText: 'Fibo' });
  ok('エントリーFibo の行自体は残る', await fiboRow.count() === 1);
  ok('Fibo 行の上位足セルはプレースホルダ', await fiboRow.locator('.tp-na').count() === 1);
  eq('Fibo 行で選べるのはエントリー足の1セルだけ',
    await fiboRow.locator('[data-trend-check-btn]').evaluateAll(
      els => [...new Set(els.map(e => e.dataset.field))]),
    ['tfEntry']);

  const macdRow = page.locator(W1 + '.trend-panel .tp-row', { hasText: 'MACD' });
  eq('MACD 行は上位足・エントリー足の両方が選べる',
    await macdRow.locator('[data-trend-check-btn]').evaluateAll(
      els => [...new Set(els.map(e => e.dataset.field))]),
    ['tfHigher', 'tfEntry']);

  ok('上位足の列に Fibo の選択肢ボタンが1つも無い',
    await page.locator(W1 + '[data-trend-check-btn][data-field="tfHigher"][data-key="entryFibo"]').count() === 0);
  ok('エントリー足の列には Fibo の選択肢ボタンが出る',
    await page.locator(W1 + '[data-trend-check-btn][data-field="tfEntry"][data-key="entryFibo"]').count() > 0);
  await page.close();
}

console.log('\n[⑤] パネル表示：確度は上位足だけ');
{
  const page = await newPage(seedPair({ macd: '❌' }, { rciShort: '❌', rciMid: '❌', rciLong: '❌' }));
  await openPanel(page);
  const conf = (await page.textContent(W1 + '.tp-conf')).replace(/\s+/g, ' ').trim();

  ok('上位足の確度が出る', conf.includes('上位足の確度'));
  ok('上位足の確度の値は重み付けの結果（65%）', conf.includes('65%'));
  ok('エントリー足の確度は出ない', !conf.includes('エントリー足'));
  ok('合算は出ない', !conf.includes('合算'));
  ok('確度の表示は1箇所だけ', await page.locator(W1 + '.tp-conf').count() === 1);
  await page.close();
}

console.log('\n[⑥] 撤去した選択肢がパネルに出ない');
{
  const page = await newPage(seedPair());
  await openPanel(page);
  const labels = await page.locator(W1 + '.trend-panel [data-trend-check-btn]')
    .evaluateAll(els => els.map(e => e.textContent));

  ok('「⏳待ち」ボタンが無い', !labels.includes('⏳待ち'));
  ok('「⏳RD待ち」ボタンが無い', !labels.includes('⏳RD待ち'));
  ok('「⏳HD待ち」ボタンが無い', !labels.includes('⏳HD待ち'));
  ok('ラウンドナンバーの「無」ボタンが無い',
    await page.locator(W1 + '[data-trend-check-btn][data-key="roundNumber"][data-value="無"]').count() === 0);
  ok('ロールリバーサルの「未確認」ボタンが無い',
    await page.locator(W1 + '[data-trend-check-btn][data-key="rollReversal"][data-value="未確認"]').count() === 0);
  ok('ラウンドナンバーの「有」は残る',
    await page.locator(W1 + '[data-trend-check-btn][data-field="tfHigher"][data-key="roundNumber"][data-value="有"]').count() === 1);
  ok('ロールリバーサルの「確認」は残る',
    await page.locator(W1 + '[data-trend-check-btn][data-field="tfHigher"][data-key="rollReversal"][data-value="確認"]').count() === 1);
  await page.close();
}

console.log('\n[⑦] 記録は従来どおり保存される（書き込み経路は無変更）');
{
  const page = await newPage(seedPair());
  await openPanel(page);
  await page.click(W1 + '[data-trend-check-btn][data-field="tfHigher"][data-key="macd"][data-value="RD(転換)"]');
  await page.click(W1 + '[data-trend-check-btn][data-field="tfHigher"][data-key="roundNumber"][data-value="有"]');
  await page.waitForTimeout(120);

  const saved = await page.evaluate(() =>
    (loadMarket().pairs.find(p => p.id === 'p1') || {}).checksHigher);
  eq('MACD が保存される', saved.macd, 'RD(転換)');
  eq('ラウンドナンバーが保存される', saved.roundNumber, '有');
  eq('保存後の確度は100%のまま（達成は減点しない）',
    await page.evaluate(() => higherConfidence(loadMarket().pairs.find(p => p.id === 'p1').checksHigher)), 100);
  await page.close();
}

console.log('\n[⑧] 既存データの ⏳ は引き続き拾える（S46 の表示を壊さない）');
{
  const page = await newPage(seedPair({ rciShort: '⏳待ち' }, { macd: '⏳HD待ち' }));
  await page.click('[data-tab="trend"]');
  eq('pairWaitCount は既存データの ⏳ を2件数える',
    await page.evaluate(() => pairWaitCount(loadMarket().pairs.find(p => p.id === 'p1'))), 2);
  ok('行ヘッダに ⏳ バッジが出る', await page.locator(W1 + '.twait').count() === 1);
  ok('待ちタイルにも反映される',
    (await page.textContent('.trend-summary [data-trend-summary-filter="wait"]')).includes('1'));
  await page.close();
}

console.log('\n[JSエラー]');
ok('コンソールエラーなし  ' + JSON.stringify(errors), errors.length === 0);

await browser.close();
console.log('\n──────────────────────────');
console.log('  ✅ ' + pass + '  ❌ ' + fail);
process.exit(fail ? 1 : 0);
