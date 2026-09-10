/* セッション75 検証：上位足RCI選択肢が方向で絞られる
     - 上昇トレンド（↗）なら RCI は 60↓／下限／❌ の3択だけ
     - 下降トレンド（↘）なら RCI は 上限／60↑／❌ の3択だけ
     - 方向未記録・レンジでは5択とも出る
     - 方向を反転すると、逆サイドで選んでいたRCI値が自動でクリアされる
   s62-test.mjs と同じ file:// ＋ localStorage 直注入の型。 */
import { chromium } from 'playwright';
import path from 'path';

const URL = 'file:///' + path.resolve('index.html').replace(/\\/g, '/');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n); } };
const eq = (n, a, b) => ok(n + '  [got ' + JSON.stringify(a) + ']', JSON.stringify(a) === JSON.stringify(b));

const browser = await chromium.launch().catch(() =>
  chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }));
const errors = [];

async function newPage(seed) {
  const ctx = await browser.newContext();
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
async function openPanel(page, id = 'p1') {
  await page.click('[data-tab="trend"]');
  await page.click('[data-trend-item="' + id + '"] [data-trend-panel-open][data-tf="d"]');
  await page.waitForSelector('[data-trend-item="' + id + '"] .trend-panel');
}
function rciOpts(page, key = 'rciShort') {
  return page.$$eval(
    '[data-field="tfHigher"][data-key="' + key + '"]',
    els => els.map(e => e.textContent.trim())
  );
}

console.log('\n[①] 上昇トレンドではRCIが下限側3択に絞られる');
{
  const page = await newPage({ [MARKET]: { pairs: [seedPair('up')] } });
  await openPanel(page);
  eq('RCI短期は60↓/下限/❌だけ', await rciOpts(page, 'rciShort'), ['60↓', '下限', '❌']);
  eq('RCI中期も同様', await rciOpts(page, 'rciMid'), ['60↓', '下限', '❌']);
  eq('RCI長期も同様', await rciOpts(page, 'rciLong'), ['60↓', '下限', '❌']);
  await page.close();
}

console.log('\n[②] 下降トレンドではRCIが上限側3択に絞られる');
{
  const page = await newPage({ [MARKET]: { pairs: [seedPair('down')] } });
  await openPanel(page);
  eq('RCI短期は上限/60↑/❌だけ', await rciOpts(page, 'rciShort'), ['上限', '60↑', '❌']);
  await page.close();
}

console.log('\n[③] 方向未記録・レンジでは5択とも出る');
{
  const page = await newPage({ [MARKET]: { pairs: [seedPair('')] } });
  await openPanel(page);
  eq('未記録なら5択', await rciOpts(page, 'rciShort'), ['上限', '60↑', '60↓', '下限', '❌']);
  await page.close();
}
{
  const page = await newPage({ [MARKET]: { pairs: [seedPair('range')] } });
  await openPanel(page);
  eq('レンジなら5択', await rciOpts(page, 'rciShort'), ['上限', '60↑', '60↓', '下限', '❌']);
  await page.close();
}

console.log('\n[④] 方向反転で逆サイドのRCI記録が自動クリアされる');
{
  const seed = seedPair('up');
  seed.checksHigher = { d: { rciShort: '下限', rciMid: '60↓' } };
  const page = await newPage({ [MARKET]: { pairs: [seed] } });
  await openPanel(page); // tfHigher を「日足」に確定させる（実運用と同じ経路）
  // 方向を↘へ反転
  await page.click('[data-trend-item="p1"] [data-trend-state][data-tf="d"][data-value="down"]');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('mochipoyo_market_view_v1')).pairs);
  const w = stored.find(x => x.id === 'p1');
  eq('反転後にrciShort/rciMidは消える', [w.checksHigher.d.rciShort, w.checksHigher.d.rciMid], ['', '']);
  await page.close();
}

console.log('\n[JSエラー]');
ok('コンソールエラーなし  [got ' + JSON.stringify(errors) + ']', errors.length === 0);

console.log('\n──────────────────────────');
console.log('  ✅ ' + pass + '  ❌ ' + fail);
await browser.close();
process.exit(fail > 0 ? 1 : 0);
