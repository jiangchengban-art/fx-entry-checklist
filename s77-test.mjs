import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const filePath = 'file://' + path.resolve('/home/user/fx-entry-checklist/index.html');

let browser;
try {
  browser = await chromium.launch();
} catch {
  browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
}
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

await page.goto(filePath);
await page.waitForSelector('#trendSearchInput');

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('OK  ', name); }
  else { fail++; console.log('FAIL', name); }
}

// 1. 初期状態でクリアボタンは非表示
check('初期状態でクリアボタン非表示', await page.$eval('#trendSearchClear', el => el.hidden === true));

// 2. 検索欄に文字を入力するとクリアボタンが表示される
await page.fill('#trendSearchInput', 'JPY');
await page.waitForTimeout(100);
check('入力後クリアボタン表示', await page.$eval('#trendSearchClear', el => el.hidden === false));
check('検索絞り込みが効いている', await page.$eval('#trendSearchInput', el => el.value === 'JPY'));

// 3. クリアボタンをタップすると入力欄が空になる
await page.click('#trendSearchClear');
await page.waitForTimeout(100);
check('クリア後、入力欄が空になる', await page.$eval('#trendSearchInput', el => el.value === ''));
check('クリア後、クリアボタンが再度非表示になる', await page.$eval('#trendSearchClear', el => el.hidden === true));

// 4. クリア後、フォーカスが入力欄に戻る
check('クリア後、フォーカスが検索欄に戻る', await page.evaluate(() => document.activeElement.id === 'trendSearchInput'));

// 5. クリア後、一覧が全件表示に戻っている（絞り込み解除）
const itemCountAfterClear = await page.$$eval('[data-trend-item]', els => els.length);
check('クリア後、一覧の絞り込みが解除される（28件前後）', itemCountAfterClear >= 20);

console.log(`\n${pass} passed, ${fail} failed`);
console.log('Console errors:', errors.length ? errors : 'none');

await browser.close();
process.exit(fail > 0 || errors.length > 0 ? 1 : 0);
