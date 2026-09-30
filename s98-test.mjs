/* S98: 👀監視リストの🔔未確認アラート（条件待ちで後回しにしたアラートの確認漏れ防止） */
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const filePath = 'file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/');

let browser;
try {
  browser = await chromium.launch();
} catch {
  browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
}
const page = await browser.newPage({ viewport: { width: 375, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

await page.goto(filePath);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForSelector('#tabBar');

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('OK  ', name); }
  else { fail++; console.log('FAIL', name); }
}
const trades = () => page.evaluate(() => JSON.parse(localStorage.getItem('mochipoyo_trades_v1') || '[]'));
const byKind = async k => (await trades()).filter(t => t.kind === k);
const srow = pair => `#scalpWatch [data-sw]:has(.sw-pair:text-is("${pair}"))`;
const trow = pair => `#trendWatch [data-sw]:has(.sw-pair:text-is("${pair}"))`;
const badge = tab => page.textContent(`.tab-btn[data-tab="${tab}"] .tab-badge`);

// ⚡ 1時間足だけ：🔔は1タップで控える
await page.click('.tab-btn[data-tab="scalp"]');
await page.click('#tabPanel-scalp [data-sc-pane="watch"]');
await page.selectOption('#scalpWatchAdd', 'USDJPY');
await page.selectOption('#scalpWatchAdd', 'GOLD');
check('未確認が無いときは欄が出ない', !(await page.isVisible('#tabPanel-scalp .sw-pend-head')));
check('未確認が無いときはタブバッジが空', (await badge('scalp')) === '');
await page.click(srow('USDJPY') + ' [data-sw-ng="macd"]');
await page.click(srow('USDJPY') + ' [data-sw-bell]');
let w = (await byKind('scalpwatch')).find(t => t.pair === 'USDJPY');
check('🔔で1Hの時刻が記録される', !!(w.alerts && w.alerts['1H']));
check('🔔ボタンが点灯', await page.$eval(srow('USDJPY') + ' [data-sw-bell]', el => el.classList.contains('on')));
check('未確認欄に1行', await page.locator('#tabPanel-scalp .sw-pend-row').count() === 1);
const rowText = await page.textContent('#tabPanel-scalp .sw-pend-row');
check('通貨・時間足・経過・懸念を表示', rowText.includes('USDJPY') && rowText.includes('1H') && rowText.includes('⏰0分') && rowText.includes('MACD✖'));
check('成立している条件は出さない', !rowText.includes('RCI') && !rowText.includes('グランビル'));
check('タブバッジに件数', (await badge('scalp')) === '1');

// 古い順に並ぶ・経過時間
await page.evaluate(() => {
  const ts = JSON.parse(localStorage.getItem('mochipoyo_trades_v1'));
  const g = ts.find(t => t.kind === 'scalpwatch' && t.pair === 'GOLD');
  g.alerts = { '1H': new Date(Date.now() - (3 * 60 + 15) * 60000).toISOString() };
  localStorage.setItem('mochipoyo_trades_v1', JSON.stringify(ts));
  renderAll();
});
const pairs = await page.$$eval('#tabPanel-scalp .sw-pend-row .sw-pend-pair', els => els.map(e => e.textContent));
check('古いアラートが上', pairs.join(',') === 'GOLD,USDJPY');
check('経過時間の表記', (await page.textContent('#tabPanel-scalp .sw-pend-row')).includes('⏰3時間15分'));
check('見出しに件数', (await page.textContent('#tabPanel-scalp .sw-pend-head')).includes('（2）'));

// ✓で確認済み
await page.click('#tabPanel-scalp .sw-pend-row[data-tf="1H"]:has(.sw-pend-pair:text-is("GOLD")) [data-sw-done]');
w = (await byKind('scalpwatch')).find(t => t.pair === 'GOLD');
check('✓で未確認から外れる', !w.alerts['1H']);
check('✓後は1行', await page.locator('#tabPanel-scalp .sw-pend-row').count() === 1);
check('監視リスト自体は残る', await page.locator(srow('GOLD')).count() === 1);
check('updatedAt が進む（同期で伝わる）', !!w.updatedAt);
// 🔔の再タップで外れる
await page.click(srow('USDJPY') + ' [data-sw-bell]');
check('🔔再タップで外れる', !(await page.isVisible('#tabPanel-scalp .sw-pend-head')));

// 🔭 複数時間足：🔔で足を選ぶ
await page.click('.tab-btn[data-tab="trend"]');
await page.click('#tabPanel-trend [data-sc-pane="watch"]');
await page.selectOption('#trendWatchAdd', 'EURUSD');
await page.click(trow('EURUSD') + ' [data-sw-bell]');
check('🔭は🔔で時間足の選択が開く', await page.locator(trow('EURUSD') + ' [data-sw-alert]').count() === 4);
await page.click(trow('EURUSD') + ' [data-sw-alert="4H"]');
check('選ぶと選択が閉じる', await page.locator(trow('EURUSD') + ' [data-sw-alert]').count() === 0);
await page.click(trow('EURUSD') + ' [data-sw-bell]');
await page.click(trow('EURUSD') + ' [data-sw-alert="D"]');
w = (await byKind('trendwatch')).find(t => t.pair === 'EURUSD');
check('4HとDが両方控えられる', !!w.alerts['4H'] && !!w.alerts['D']);
check('時間足ごとに1行', await page.locator('#tabPanel-trend .sw-pend-row').count() === 2);
check('🔔ボタンに足名', (await page.textContent(trow('EURUSD') + ' [data-sw-bell]')).includes('4H·D'));
check('🔭タブのバッジ', (await badge('trend')) === '2');
check('⚡タブのバッジは別', (await badge('scalp')) === '');
// 通貨名タップで該当行へ
await page.click('#tabPanel-trend .sw-pend-row >> nth=0 >> [data-sw-goto]');
check('通貨名で該当行が光る', await page.$eval(trow('EURUSD'), el => el.classList.contains('sw-flash')));

// 同期：他端末の未確認が届く・🗑で消える
await page.evaluate(() => {
  const ts = JSON.parse(localStorage.getItem('mochipoyo_trades_v1'));
  const now = new Date().toISOString();
  ts.push({ id: 'tw_remote', kind: 'trendwatch', pair: 'GBPJPY', ng: { granville: true, rci: false, macd: false },
            alerts: { W: now }, notes: '', createdAt: now, updatedAt: now });
  localStorage.setItem('mochipoyo_trades_v1', JSON.stringify(ts));
  renderAll();
});
check('他端末の未確認も出る', (await page.textContent('#tabPanel-trend .sw-pend')).includes('GBPJPY'));
check('懸念グランビル✖', (await page.textContent('#tabPanel-trend .sw-pend')).includes('グランビル✖'));
await page.click(trow('GBPJPY') + ' [data-sw-del]');
check('🗑で未確認からも消える', !(await page.textContent('#tabPanel-trend .sw-pend')).includes('GBPJPY'));

// 統計・履歴に混ざらない
check('mainTrades に入らない', await page.evaluate(() => mainTrades().length === 0));

// 375pxではみ出さない
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
check('375pxで横スクロールしない', !overflow);

check('コンソールエラーなし', errors.length === 0);
if (errors.length) console.log(errors);
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
