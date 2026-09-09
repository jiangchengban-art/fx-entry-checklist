/* セッション62 検証：エントリー足の根拠を3ステップ確認フローに置き換える
     - エントリー足は上位足とは別の項目セット（❶反転形／❷MA抜け／❸重なり／❸Fibo）
     - 上位足からは entryFibo が外れ、グランビル等7項目が残る
     - パネルは「上位足セクション → エントリー足セクション」の縦2段（旧 .tp-head の3列は無い）
     - ❶❷の選択肢は上位足の方向で絞られる（↗なら買い側だけ、方向未記録なら両方）
     - 方向を反転／レンジ化すると、向きの合わない記録が自動で消える
     - CSV列が hi_*（7項目）／en_*（新4項目）に入れ替わる
     - 確度スコアの分母が区分ごとに分かれる（上位足7・エントリー足4）
   s40/s42/s43/s44/s59-test.mjs と同じ file:// ＋ localStorage 直注入の型。 */
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
const now = new Date().toISOString();

/* 日足を ↗上昇・買②・タップ済み（＝圏内）にして、日足の行に🎯根拠ボタンが出る状態を作る。
   ⚠️ 一覧の行は必ず [data-trend-item="<id>"] で絞る（プリセット28銘柄が自動生成されるため）。 */
function seedPair(state) {
  return {
    id: 'p1', pair: 'USDJPY', tfHigher: '', tfEntry: '', alerts: {}, judge: '',
    checksHigher: {}, checksEntry: {}, trendAt: now,
    trend: {
      h1: { state: '', zone: '', granville: '', wpos: '', at: '' },
      h4: { state: '', zone: '', granville: '', wpos: '', at: '' },
      d:  { state, zone: 'green', granville: state === 'down' ? '6' : '2',
            wpos: state === 'down' ? '78,22' : '36,62', at: now },
    },
  };
}
/* 日足の🎯根拠ボタンを押してパネルを開く */
async function openPanel(page, id = 'p1') {
  await page.click('[data-tab="trend"]');
  await page.click('[data-trend-item="' + id + '"] [data-trend-panel-open][data-tf="d"]');
  await page.waitForSelector('[data-trend-item="' + id + '"] .trend-panel');
}

console.log('\n[①] 項目定義：上位足とエントリー足が別物になっている');
{
  const page = await newPage(null);
  const defs = await page.evaluate(() => ({
    higher: MV_TF_CHECKS.map(c => c.k),
    entry: MV_ENTRY_CHECKS.map(c => c.k),
    snapshotChecks: MV_CHECK_SNAPSHOTS.map(s => s.checks.length),
  }));
  eq('上位足は5項目（granville・rollReversal・entryFibo が外れた）', defs.higher,
    ['rciShort', 'rciMid', 'rciLong', 'macd', 'roundNumber']);
  eq('エントリー足は❶❷❸の4項目', defs.entry,
    ['necklineForm', 'maBreak', 'rollReversal', 'entryFibo']);
  ok('上位足に entryFibo は無い', !defs.higher.includes('entryFibo'));
  ok('エントリー足にグランビルは無い', !defs.entry.includes('granville'));
  ok('entryFibo のキー名は据え置き（統計・CSVが見ている）', defs.entry.includes('entryFibo'));
  eq('スナップショット区分が各々の定義を持つ', defs.snapshotChecks, [5, 4]);
  await page.close();
}

console.log('\n[②] 選択肢の中身が実運用の3ステップになっている');
{
  const page = await newPage(null);
  const opts = await page.evaluate(() =>
    Object.fromEntries(MV_ENTRY_CHECKS.map(c => [c.k, c.opts.map(o => o.v)])));
  ok('❶ に買い側の形（ダブルボトム・逆三尊）がある',
    opts.necklineForm.includes('ダブルボトム') && opts.necklineForm.includes('逆三尊'));
  ok('❶ に売り側の形（ダブルトップ・三尊）がある',
    opts.necklineForm.includes('ダブルトップ') && opts.necklineForm.includes('三尊'));
  eq('❷ はMAの上抜け／下抜け', opts.maBreak, ['上抜け', '下抜け', '❌']);
  eq('❸ はロールリバーサル確認', opts.rollReversal, ['確認', '❌']);
  eq('❸ Fibo は5水準', opts.entryFibo, ['23%', '38%', '50%', '61%', '78%', '❌']);
  await page.close();
}

console.log('\n[③] パネルは縦2セクション（旧・横並び3列ではない）');
{
  const page = await newPage({ [MARKET]: { pairs: [seedPair('up')] } }, { width: 375, height: 1200 });
  await openPanel(page);
  const panel = page.locator('[data-trend-item="p1"] .trend-panel');
  eq('セクション見出しは2つ（上位足／エントリー足）', await panel.locator('.tp-sec').count(), 2);
  const names = await panel.locator('.tp-sec-name').allTextContents();
  eq('見出しの並びは上位足→エントリー足', names, ['上位足', 'エントリー足']);
  ok('旧 .tp-head（3列ヘッダ）は無い', await panel.locator('.tp-head').count() === 0);
  eq('行数は 上位足5 + エントリー足4 = 9', await panel.locator('.tp-row').count(), 9);
  /* 1行あたりのセルが「ラベル＋選択肢」の2つになっている（旧は3つ） */
  const cells = await panel.locator('.tp-row').first().evaluate(el => el.children.length);
  eq('1行は ラベル＋選択肢 の2要素', cells, 2);
  eq('エントリー足の選択は1つだけ', await panel.locator('[data-trend-tfentry]').count(), 1);
  ok('エントリー足の select は見出し行にある',
    await panel.locator('.tp-sec [data-trend-tfentry]').count() === 1);
  await page.close();
}

console.log('\n[④] ❶❷の選択肢が上位足の方向で絞られる');
{
  const page = await newPage({ [MARKET]: { pairs: [seedPair('up')] } }, { width: 1000, height: 1200 });
  await openPanel(page);
  const panel = page.locator('[data-trend-item="p1"] .trend-panel');
  const vals = k => panel.locator('[data-trend-check-btn][data-field="tfEntry"][data-key="' + k + '"]')
    .evaluateAll(els => els.map(e => e.dataset.value));
  eq('↗ なら❶は買い側の形だけ', await vals('necklineForm'),
    ['ダブルボトム', '逆三尊', '❌']);
  eq('↗ なら❷は上抜けだけ', await vals('maBreak'), ['上抜け', '❌']);
  eq('❸ ロールリバーサルは向きに関係なく全部出る', await vals('rollReversal'),
    ['確認', '❌']);
  ok('目線バッジが買いを示す',
    (await panel.locator('.tp-side').textContent()).includes('買い'));
  await page.close();
}
{
  const page = await newPage({ [MARKET]: { pairs: [seedPair('down')] } }, { width: 1000, height: 1200 });
  await openPanel(page);
  const panel = page.locator('[data-trend-item="p1"] .trend-panel');
  const vals = k => panel.locator('[data-trend-check-btn][data-field="tfEntry"][data-key="' + k + '"]')
    .evaluateAll(els => els.map(e => e.dataset.value));
  eq('↘ なら❶は売り側の形だけ', await vals('necklineForm'),
    ['ダブルトップ', '三尊', '❌']);
  eq('↘ なら❷は下抜けだけ', await vals('maBreak'), ['下抜け', '❌']);
  ok('目線バッジが売りを示す',
    (await panel.locator('.tp-side').textContent()).includes('売り'));
  await page.close();
}
{
  /* 方向未記録（レンジ）では両サイド出す ── 選べる手が無くなる方が事故 */
  const p = seedPair('up');
  p.trend.d.state = 'range';
  const page = await newPage({ [MARKET]: { pairs: [p] } }, { width: 1000, height: 1200 });
  await openPanel(page);
  const panel = page.locator('[data-trend-item="p1"] .trend-panel');
  const vals = await panel
    .locator('[data-trend-check-btn][data-field="tfEntry"][data-key="necklineForm"]')
    .evaluateAll(els => els.map(e => e.dataset.value));
  eq('レンジなら❶は両サイド出る', vals,
    ['ダブルボトム', '逆三尊', 'ダブルトップ', '三尊', '❌']);  // '⏳待ち' は S63 で撤去
  ok('目線バッジは未記録の警告色', await panel.locator('.tp-side.none').count() === 1);
  await page.close();
}

console.log('\n[⑤] 記録できる・方向反転で向きの合わない記録だけ消える');
{
  const page = await newPage({ [MARKET]: { pairs: [seedPair('up')] } }, { width: 1000, height: 1200 });
  await openPanel(page);
  const item = '[data-trend-item="p1"] ';
  const btn = (k, v) => item + '[data-trend-check-btn][data-field="tfEntry"][data-key="' +
    k + '"][data-value="' + v + '"]';
  await page.click(btn('necklineForm', 'ダブルボトム'));
  await page.click(btn('maBreak', '上抜け'));
  await page.click(btn('rollReversal', '確認'));
  await page.click(btn('entryFibo', '38%'));
  const saved = () => page.evaluate(() =>
    JSON.parse(localStorage.getItem('mochipoyo_market_view_v1')).pairs.find(p => p.id === 'p1').checksEntry);
  eq('4項目とも保存される', await saved(),
    { necklineForm: 'ダブルボトム', maBreak: '上抜け', rollReversal: '確認', entryFibo: '38%' });
  ok('押したボタンに .on が付く',
    await page.locator(btn('necklineForm', 'ダブルボトム')).evaluate(e => e.classList.contains('on')));

  /* 日足の方向を ↘ に反転させる（行の方向トグル） */
  await page.click(item + '[data-trend-state][data-tf="d"][data-value="down"]');
  const after = await saved();
  eq('向きに紐づく❶❷は消える', [after.necklineForm, after.maBreak], ['', '']);
  eq('向きを持たない❸は残る', [after.rollReversal, after.entryFibo], ['確認', '38%']);
  await page.close();
}

console.log('\n[⑥] 確度スコアの分母が区分ごとに分かれる');
{
  const page = await newPage({ [MARKET]: { pairs: [seedPair('up')] } });
  const conf = await page.evaluate(() => ({
    /* 上位足：weight合計90（RCI各15+MACD35+ラウンド10）。
       MACD(weight:35)が❌の場合：(90-35)/90 ≈ 61% */
    higher: checkConfidence({ macd: '❌' }, MV_TF_CHECKS),
    /* エントリー足は4項目（weight無し）：❌1つで 3/4 = 75% */
    entry: checkConfidence({ maBreak: '❌' }, MV_ENTRY_CHECKS),
    /* ⏳待ちはS63で撤去済み */
    full: checkConfidence({}, MV_ENTRY_CHECKS),
  }));
  eq('上位足は5項目が分母（weight 90）', conf.higher, 61);
  eq('エントリー足は4項目が分母', conf.entry, 75);
  eq('未選択だけなら減点なし', conf.full, 100);
  await page.close();
}

console.log('\n[⑦] CSV列が入れ替わっている');
{
  const page = await newPage(null);
  const cols = await page.evaluate(() => CSV_HEADERS.filter(h => /^(hi|en)_/.test(h)));
  eq('hi_* は上位足5項目', cols.filter(c => c.startsWith('hi_')),
    ['hi_rciShort', 'hi_rciMid', 'hi_rciLong', 'hi_macd', 'hi_roundNumber']);
  eq('en_* はエントリー足の4項目', cols.filter(c => c.startsWith('en_')),
    ['en_necklineForm', 'en_maBreak', 'en_rollReversal', 'en_entryFibo']);
  ok('hi_granville は消えた（S63）', !cols.includes('hi_granville'));
  ok('hi_rollReversal は消えた（S65）', !cols.includes('hi_rollReversal'));
  ok('en_entryFibo は残る（Fibo別成績が見ている）', cols.includes('en_entryFibo'));
  /* 旧CSV（hi_granville 等）を読んでも新項目は空のまま＝壊れない */
  const restored = await page.evaluate(() => {
    const r = { hi_granville: '買②', en_entryFibo: '50%' };
    return parseBasisCsv(r, (row, col) => row[col] || '');
  });
  eq('旧 hi_granville は未知列として無視される', restored.higher, {});
  eq('en_entryFibo は復元される', restored.entry, { entryFibo: '50%' });
  await page.close();
}

console.log('\n[⑧] 履歴サマリーが区分ごとの項目名で出る');
{
  const page = await newPage(null);
  const html = await page.evaluate(() => basisSummaryHtml({
    higher: { macd: 'RD(転換)', roundNumber: '有' },
    entry: { necklineForm: 'ダブルボトム', entryFibo: '38%' },
  }));
  ok('上位足の項目名が出る（MACD）', html.includes('MACD RD(転換)'));
  ok('上位足の項目名が出る（ラウンドナンバー）', html.includes('ラウンドナンバー 有'));
  ok('エントリー足の項目名が出る', html.includes('ネックライン反転形 ダブルボトム'));
  ok('Fibo も出る', html.includes('エントリーFibo 38%'));
  /* エントリー足に上位足の項目が混ざらない（定義が分かれている確認） */
  const stray = await page.evaluate(() => basisSummaryHtml({
    higher: {}, entry: { macd: 'RD(転換)' },
  }));
  ok('エントリー足に上位足の MACD は表示されない', !stray.includes('RD'));
  await page.close();
}

console.log('\n[⑨] 記録フォームまで通る');
{
  const page = await newPage({ [MARKET]: { pairs: [seedPair('up')] } }, { width: 1000, height: 1200 });
  await openPanel(page);
  const item = '[data-trend-item="p1"] ';
  await page.selectOption(item + '[data-trend-tfentry]', '5分足');
  await page.click(item + '[data-trend-check-btn][data-field="tfEntry"][data-key="necklineForm"][data-value="逆三尊"]');
  await page.click(item + '[data-mv-judge][data-value="entered"]');
  await page.waitForSelector(item + '.tp-goto:not([disabled])');
  await page.click(item + '.tp-goto');
  await page.waitForSelector('#tradeModal.show');
  const summary = await page.locator('#formMarketSummary').textContent();
  ok('フォームに上位足×エントリー足が引き継がれる', summary.includes('日足') && summary.includes('5分足'));
  ok('フォームの根拠に❶の記録が出る', summary.includes('逆三尊'));
  await page.close();
}

console.log('\n──────────────────────────────');
if (errors.length) {
  console.log('コンソールエラー ' + errors.length + '件:');
  errors.slice(0, 10).forEach(e => console.log('   ' + e));
}
console.log('結果: ' + pass + ' 通過 / ' + fail + ' 失敗');
await browser.close();
process.exit(fail ? 1 : 0);
