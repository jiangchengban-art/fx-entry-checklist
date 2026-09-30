/* S102: 👀監視リストの振り分けタブ（すべて／✅エントリー／⏳待ち） */
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
const P = '#tabPanel-trend';
const row = pair => `#trendWatch [data-sw]:has(.sw-pair:text-is("${pair}"))`;
const tap = (pair, k, n = 1) => (async () => { for (let i = 0; i < n; i++) await page.click(`${row(pair)} [data-sw-ng="${k}"]`); })();
const shownPairs = () => page.$$eval('#trendWatch [data-sw] .sw-pair', els => els.map(e => e.textContent));
const tabText = g => page.textContent(`${P} [data-sw-group="${g}"]`);
const selectGroup = g => page.click(`${P} [data-sw-group="${g}"]`);

await page.click('.tab-btn[data-tab="trend"]');
await page.click(`${P} [data-sc-pane="watch"]`);
check('見出しの下に3つのタブ', await page.locator(`${P} .sw-tabs [data-sw-group]`).count() === 3);
check('タブは見出しの直後', await page.$eval(`${P} .sw-tabs`, el => el.previousElementSibling.tagName === 'H2'));
check('既定は「すべて」', await page.$eval(`${P} [data-sw-group="all"]`, el => el.classList.contains('active')));

for (const p of ['USDJPY', 'EURUSD', 'GOLD']) await page.selectOption('#trendWatchAdd', p);
// USDJPY：3つとも✅ → エントリー／EURUSD：MACD✖ → 待ち／GOLD：グランビルだけ✅ → どちらでもない
await tap('USDJPY', 'granville'); await tap('USDJPY', 'rci'); await tap('USDJPY', 'macd');
await tap('EURUSD', 'granville'); await tap('EURUSD', 'macd', 2);
await tap('GOLD', 'granville');
check('件数：すべて3', (await tabText('all')).includes('3'));
check('件数：エントリー1', (await tabText('entry')).endsWith('1'));
check('件数：待ち1', (await tabText('wait')).endsWith('1'));

await selectGroup('entry');
check('エントリーは3つとも✅の通貨だけ', (await shownPairs()).join() === 'USDJPY');
await selectGroup('wait');
check('待ちは✖が付いた通貨だけ', (await shownPairs()).join() === 'EURUSD');
await selectGroup('all');
check('すべては全件', (await shownPairs()).join() === 'USDJPY,EURUSD,GOLD');

// 絞り込み中にタップしても指の下から消えない・件数は即時に変わる
await selectGroup('entry');
await tap('USDJPY', 'macd');
check('タップ直後は行が残る', (await shownPairs()).join() === 'USDJPY');
check('件数は即時に更新（エントリー0・待ち2）', (await tabText('entry')).endsWith('0') && (await tabText('wait')).endsWith('2'));
await selectGroup('entry');
check('該当なしの表示', (await page.textContent('#trendWatch')).includes('3つとも ✅ の通貨はまだありません'));

// 選んだタブは再読み込み後も残る
await selectGroup('wait');
await page.reload();
await page.click('.tab-btn[data-tab="trend"]');
check('再読み込み後も待ちのまま', await page.$eval(`${P} [data-sw-group="wait"]`, el => el.classList.contains('active')));
check('再読み込み後も待ちの通貨だけ', (await shownPairs()).join() === 'USDJPY,EURUSD');

// 追加したら「すべて」に戻って新しい通貨が見える
await page.selectOption('#trendWatchAdd', 'GBPJPY');
check('追加で「すべて」に戻る', await page.$eval(`${P} [data-sw-group="all"]`, el => el.classList.contains('active')));
check('追加した通貨が見える', (await shownPairs()).includes('GBPJPY'));

// ⚡タブも同じ・別々に記憶
await page.click('.tab-btn[data-tab="scalp"]');
await page.click('#tabPanel-scalp [data-sc-pane="watch"]');
check('⚡にもタブ', await page.locator('#tabPanel-scalp .sw-tabs [data-sw-group]').count() === 3);
check('⚡は🔭と別に「すべて」', await page.$eval('#tabPanel-scalp [data-sw-group="all"]', el => el.classList.contains('active')));

check('375pxで横スクロールしない', await page.evaluate(() => document.documentElement.scrollWidth <= 375));
check('コンソールエラーなし', errors.length === 0);
if (errors.length) console.log(errors);
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
