/* セッション82 検証：エントリー足❸のFibo選択の前に「指値／逆指値」を選ばせる。
   - entryOrderType（指値/逆指値/❌）を entryFibo の直前に追加
   - entryFibo 行は entryOrderType === '指値' のときだけ出る（それ以外・未選択では隠れる）
   - 逆指値・❌に変える／選び直すと、隠れた entryFibo の値は自動で消える
   - CSV往復（en_entryOrderType 列）
   実行: node s82-test.mjs */
import { chromium } from 'playwright';
import path from 'path';

const URL = 'file:///' + path.resolve('index.html').replace(/\\/g, '/');
let pass = 0, fail = 0;
const ok = (n, c, extra) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); } };
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

function seedPair() {
  return {
    id: 'p1', pair: 'USDJPY', tfHigher: '', tfEntry: '', alerts: {}, judge: '',
    checksHigher: {}, checksEntry: {}, trendAt: now,
    trend: {
      h1: { state: '', zone: '', granville: '', wpos: '', at: '' },
      h4: { state: '', zone: '', granville: '', wpos: '', at: '' },
      d:  { state: 'up', zone: 'green', granville: '2', wpos: '36,62', at: now },
    },
  };
}
async function openPanel(page, id = 'p1') {
  await page.click('[data-tab="trend"]');
  await page.click('[data-trend-item="' + id + '"] [data-trend-panel-open][data-tf="d"]');
  await page.waitForSelector('[data-trend-item="' + id + '"] .trend-panel');
}

console.log('\n[1] 項目定義');
{
  const page = await newPage(null);
  const opts = await page.evaluate(() =>
    Object.fromEntries(MV_ENTRY_CHECKS.map(c => [c.k, c.opts.map(o => o.v)])));
  ok('entryOrderType が entryFibo の直前にある', await page.evaluate(() => {
    const keys = MV_ENTRY_CHECKS.map(c => c.k);
    return keys.indexOf('entryOrderType') === keys.indexOf('entryFibo') - 1;
  }));
  eq('entryOrderType の選択肢は指値/逆指値/❌', opts.entryOrderType, ['指値', '逆指値', '❌']);
  await page.close();
}

console.log('\n[2] Fibo行は指値のときだけ出る');
{
  const page = await newPage({ [MARKET]: { pairs: [seedPair()] } }, { width: 1000, height: 1200 });
  await openPanel(page);
  const item = '[data-trend-item="p1"] ';
  const fiboBtn = item + '[data-trend-check-btn][data-field="tfEntry"][data-key="entryFibo"][data-value="38%"]';
  const orderBtn = v => item + '[data-trend-check-btn][data-field="tfEntry"][data-key="entryOrderType"][data-value="' + v + '"]';

  ok('未選択の既定ではFibo行が無い', await page.locator(fiboBtn).count() === 0);

  await page.click(orderBtn('指値'));
  await page.waitForSelector(fiboBtn);
  ok('指値を選ぶとFibo行が出る', await page.locator(fiboBtn).count() === 1);

  await page.click(fiboBtn);
  const afterFibo = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('mochipoyo_market_view_v1')).pairs.find(p => p.id === 'p1').checksEntry.entryFibo);
  eq('Fiboが保存される', afterFibo, '38%');

  await page.click(orderBtn('逆指値'));
  await page.waitForSelector(fiboBtn, { state: 'detached' });
  ok('逆指値に変えるとFibo行が消える', await page.locator(fiboBtn).count() === 0);
  const afterRev = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('mochipoyo_market_view_v1')).pairs.find(p => p.id === 'p1').checksEntry.entryFibo);
  eq('逆指値に変えると保存済みのFiboも消える', afterRev, '');

  await page.close();
}

console.log('\n[3] ❌・再選択解除でもFiboが消える');
{
  const page = await newPage({ [MARKET]: { pairs: [seedPair()] } }, { width: 1000, height: 1200 });
  await openPanel(page);
  const item = '[data-trend-item="p1"] ';
  const fiboBtn = item + '[data-trend-check-btn][data-field="tfEntry"][data-key="entryFibo"][data-value="61%"]';
  const orderBtn = v => item + '[data-trend-check-btn][data-field="tfEntry"][data-key="entryOrderType"][data-value="' + v + '"]';

  await page.click(orderBtn('指値'));
  await page.waitForSelector(fiboBtn);
  await page.click(fiboBtn);

  /* 同じボタンを再タップして「指値」を解除（未選択に戻す）。 */
  await page.click(orderBtn('指値'));
  await page.waitForSelector(fiboBtn, { state: 'detached' });
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('mochipoyo_market_view_v1')).pairs.find(p => p.id === 'p1').checksEntry);
  eq('注文方法を解除するとFiboも消える', [saved.entryOrderType, saved.entryFibo], ['', '']);
  await page.close();
}

console.log('\n[4] CSV列とラウンドトリップ');
{
  const page = await newPage(null);
  const cols = await page.evaluate(() => CSV_HEADERS.filter(h => h.startsWith('en_')));
  eq('en_entryOrderType が en_entryFibo の直前にある', cols,
    ['en_necklineForm', 'en_maBreak', 'en_rollReversal', 'en_entryOrderType', 'en_entryFibo']);

  const restored = await page.evaluate(() => {
    const r = { en_entryOrderType: '指値', en_entryFibo: '38%' };
    return parseBasisCsv(r, (row, col) => row[col] || '');
  });
  eq('CSVから注文方法とFiboが復元される', restored.entry, { entryOrderType: '指値', entryFibo: '38%' });

  /* 旧CSV（entryOrderType列なし）を読んでも壊れない。 */
  const oldRestored = await page.evaluate(() => {
    const r = { en_entryFibo: '50%' };
    return parseBasisCsv(r, (row, col) => row[col] || '');
  });
  eq('旧CSV（entryOrderType列なし）でもentryFiboだけ復元される', oldRestored.entry, { entryFibo: '50%' });
  await page.close();
}

console.log('\n[5] 確度スコアの分母に含まれる');
{
  const page = await newPage(null);
  const conf = await page.evaluate(() => checkConfidence({}, MV_ENTRY_CHECKS));
  eq('エントリー足は5項目が分母（entryOrderType追加後も未選択は減点なし）', conf, 100);
  await page.close();
}

ok('コンソールエラー無し', errors.length === 0, errors);

console.log('\n──────────────────────────');
console.log('  ✅ ' + pass + '  ❌ ' + fail);
await browser.close();
process.exit(fail ? 1 : 0);
