import { chromium } from 'playwright';
import path from 'path';

const FILE = 'file://' + path.resolve('C:/Users/owner/fx-entry-checklist/index.html');
let pass = 0, fail = 0;
const ok = (n, c) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n); };

const browser = await chromium.launch().catch(() => chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }));
const page = await browser.newPage();
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

const seed = {
  pairs: [
    { id: 'w1', pair: 'USDJPY', tfHigher: '1時間足', tfEntry: '5分足',
      trend: { h1: { state: 'up', granville: '2', wpos: '39,68' } },
      checksHigher: { h1: { rciShort: '60up', rciMid: '', rciLong: '', macd: '', roundNumber: '' } },
      alerts: {} },
    { id: 'w2', pair: 'EURUSD', tfHigher: '4時間足', tfEntry: '5分足',
      trend: { h4: { state: 'up', granville: '2', wpos: '39,68' } },
      checksHigher: {},
      alerts: {} },
  ],
  judgeLog: [], snapshots: [],
};
await page.addInitScript(s => {
  localStorage.setItem('mochipoyo_market_view_v1', JSON.stringify(s));
}, seed);
await page.goto(FILE);
await page.waitForTimeout(600);

// w1: h1 has a recorded check -> should show %
const w1h1 = page.locator('[data-trend-item="w1"] .trend-tf').first().locator('.tent');
const w1Text = await w1h1.innerText();
ok('記録済みの足は%が出る（w1 h1）: ' + w1Text.replace(/\s/g, ''), /\d+%/.test(w1Text));

// w2: h4 has no checksHigher entries -> should NOT show confidence %
const w2Row = page.locator('[data-trend-item="w2"] .trend-tf').filter({ hasText: '4H' }).first();
const w2Chip = w2Row.locator('.tent');
const w2Text = await w2Chip.innerText();
const w2Title = await w2Chip.getAttribute('title');
// distance % (d) may appear, but confidence % specifically should be absent -> check conf span class
const confSpanCount = await w2Chip.locator('.d.conf').count();
ok('未記録の足には確度%スパンが存在しない（w2 h4）', confSpanCount === 0);
ok('未記録の足のtitleに「確度」が含まれない: ' + w2Title, !w2Title.includes('確度'));

// open panel for w2 h4, check .tp-conf shows 未記録
await w2Chip.click();
await page.waitForTimeout(300);
const panelConf = page.locator('[data-trend-item="w2"] .tp-conf');
const panelText = await panelConf.innerText();
ok('パネル内も未記録表示になる: ' + panelText, panelText.includes('未記録'));
ok('パネルにmutedクラスが付く', (await panelConf.getAttribute('class')).includes('muted'));

// open panel for w1 h1, check .tp-conf shows %
await page.locator('[data-trend-item="w1"] .trend-tf').first().locator('.tent').click();
await page.waitForTimeout(300);
const panelConf1 = page.locator('[data-trend-item="w1"] .tp-conf');
const panelText1 = await panelConf1.innerText();
ok('記録済みはパネルに%が出る: ' + panelText1, /\d+%/.test(panelText1));

ok('コンソールエラーなし: ' + errs.join(' | '), errs.length === 0);

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
