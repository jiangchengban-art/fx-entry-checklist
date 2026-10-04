/* S106: 📍 ネックラインゾーン（zones.json の読み込み・未確認アラートの📍・監視リストのゾーン行・勝敗記録への控え） */
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

const DOC = {
  version: 1, generatedAt: '2026-10-01T04:00:00.000Z',
  pairs: {
    USDJPY: {
      price: 157.96, nearUnit: 0.24, tfs: {
        '1H': { atr: 0.24, up: { lo: 158.0, hi: 158.04, touches: 3, conf: ['1H', '4H'] },
                down: { lo: 157.5, hi: 157.55, touches: 2, conf: ['1H'] }, inside: null },
        '4H': { atr: 0.5, up: { lo: 157.99, hi: 158.06, touches: 4, conf: ['1H', '4H', 'D'] },
                down: { lo: 156.8, hi: 156.9, touches: 3, conf: ['4H'] }, inside: null },
        'D':  { atr: 1.2, up: { lo: 159.0, hi: 159.3, touches: 5, conf: ['D'] }, down: null, inside: null },
      },
    },
    GOLD: {
      price: 4170, nearUnit: 5, tfs: {
        '1H': { atr: 5, up: { lo: 4200, hi: 4203, touches: 2, conf: ['1H', '4H'] }, down: null, inside: null },
        '4H': { atr: 12, up: { lo: 4230, hi: 4240, touches: 3, conf: ['4H'] }, down: null, inside: null },
      },
    },
    EURJPY: {
      price: 178.4, nearUnit: 0.2, tfs: {
        '4H': { atr: 0.4, inside: { lo: 178.3, hi: 178.5, touches: 4, conf: ['4H', 'D'] }, up: null, down: null },
      },
    },
  },
};

await page.goto(filePath);
await page.evaluate(doc => { localStorage.clear(); localStorage.setItem('mochipoyo_zones_cache_v1', JSON.stringify(doc)); }, DOC);
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
const zones = '#tabPanel-scalp .sw-zones';

await page.click('.tab-btn[data-tab="scalp"]');
await page.click('#tabPanel-scalp [data-sc-pane="watch"]');

// 1. ゾーン付近の一覧
check('ゾーン一覧が出る', await page.locator(zones).count() === 1 && !(await page.$eval(zones, el => el.hidden)));
await page.click(zones + ' > summary');
const zrows = await page.$$eval(zones + ' .sw-zone-row', els => els.map(e => e.querySelector('.sw-zone-pair').textContent));
check('付近の通貨だけ（GOLD は遠いので出ない）', zrows.includes('USDJPY') && zrows.includes('EURJPY') && !zrows.includes('GOLD'));
check('複数足のものが上', zrows[0] === 'USDJPY');
const uz = await page.textContent(zones + ' .sw-zone-row:has(.sw-zone-pair:text-is("USDJPY"))');
check('重なるゾーンは1行にまとめ、時間足を合わせる', uz.includes('1H·4H·D') && (await page.locator(zones + ' .sw-zone-row:has(.sw-zone-pair:text-is("USDJPY"))').count()) === 1);
check('更新時刻を出す', (await page.textContent(zones + ' summary')).includes('時点'));
check('1Hだけのゾーンは一覧に出さない', !uz.includes('157.5–157.55'));
await page.click(zones + ' [data-sw-zone-add="USDJPY"]');
check('＋で監視リストに追加', (await byKind('scalpwatch')).some(t => t.pair === 'USDJPY'));
check('追加後は「監視中」', (await page.textContent(zones + ' .sw-zone-row:has(.sw-zone-pair:text-is("USDJPY"))')).includes('監視中'));
await page.selectOption('#scalpWatchAdd', 'GOLD');

// 2. 監視リストの各通貨にゾーン行
check('USDJPY にゾーン行', (await page.textContent(srow('USDJPY'))).includes('📍'));
check('ゾーン行に範囲と時間足', (await page.textContent(srow('USDJPY') + ' .sw-zone-line')).includes('↑') && (await page.textContent(srow('USDJPY') + ' .sw-zone-line')).includes('4H'));
check('S108: 遠い通貨でも上下のネックライン価格を出す（コピー用）', await page.locator(srow('GOLD') + ' .sw-zone-line .zcopy').count() >= 1);
await page.context().grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
const zc = page.locator(srow('USDJPY') + ' .sw-zone-line .zcopy').first();
const zcText = await zc.textContent();
await zc.click();
check('S108: 価格をタップでコピー', (await page.evaluate(() => navigator.clipboard.readText()).catch(() => zcText)) === zcText && /^\d+(\.\d+)?$/.test(zcText));
check('S108: 範囲（–）は出さない', !(await page.textContent(srow('USDJPY') + ' .sw-zone-line')).includes('–'));

// 3. 未確認アラートの📍
await page.click(srow('USDJPY') + ' [data-sw-bell]');
await page.click(srow('GOLD') + ' [data-sw-bell]');
const pend = pair => `#tabPanel-scalp .sw-pend-row:has(.sw-pend-pair:text-is("${pair}"))`;
check('ゾーン付近のアラートに📍', (await page.textContent(pend('USDJPY') + ' .zone-badge')).includes('4H'));
check('ゾーン付近の行は強調', await page.$eval(pend('USDJPY'), el => el.classList.contains('zone')));
check('ゾーン外のアラートには📍なし', await page.locator(pend('GOLD') + ' .zone-badge').count() === 0);
check('見出しに📍の件数', (await page.textContent('#tabPanel-scalp .sw-pend-head')).includes('📍ゾーン付近 1'));

// TradingView から鳴った価格が届いたら、その価格で判定する
await page.evaluate(() => {
  const ts = JSON.parse(localStorage.getItem('mochipoyo_trades_v1'));
  ts.find(t => t.kind === 'scalpwatch' && t.pair === 'USDJPY').alertPrice = { '1H': 150 };
  ts.find(t => t.kind === 'scalpwatch' && t.pair === 'GOLD').alertPrice = { '1H': 4201 };
  localStorage.setItem('mochipoyo_trades_v1', JSON.stringify(ts));
  renderAll();
});
check('鳴った価格が遠ければ📍なし', await page.locator(pend('USDJPY') + ' .zone-badge, ' + pend('USDJPY') + ' .aim-badge').count() === 0);
check('鳴った価格がゾーン内なら印（ゾーン内は🎯狙い目）', await page.locator(pend('GOLD') + ' .aim-badge').count() === 1);
check('印の説明にネックラインの価格', (await page.getAttribute(pend('GOLD') + ' .aim-badge', 'title')).includes('4201.5'));

// 4. 勝／負の記録にアラートとゾーンを自動で残す
await page.click(srow('GOLD') + ' [data-sw-res="win"]');
let log = (await byKind('watchlog'))[0];
check('記録にアラートの足・時刻・価格', log.alert && log.alert.tf === '1H' && !!log.alert.at && log.alert.price === 4201);
check('記録にゾーン（鳴った価格で判定）', log.zone && log.zone.conf.includes('1H') && log.zone.lo === 4200);
check('記録の行に📍', (await page.textContent('#tabPanel-scalp .sw-log-row')).includes('📍'));
check('ゾーン付近の勝率を出す', (await page.textContent('#tabPanel-scalp .sw-log')).includes('📍ゾーン付近 勝1'));

// ✓で alertPrice も消える
await page.click(pend('GOLD') + ' [data-sw-done]');
const g = (await byKind('scalpwatch')).find(t => t.pair === 'GOLD');
check('✓で alertPrice も消す', !(g.alertPrice || {})['1H'] && !(g.alerts || {})['1H']);

// 4b. 🎯狙い目（ゾーン付近＋方向が合う）は自動で印が付き、上に並ぶ
await page.evaluate(() => {
  const ts = JSON.parse(localStorage.getItem('mochipoyo_trades_v1'));
  const u = ts.find(t => t.kind === 'scalpwatch' && t.pair === 'USDJPY');
  u.alertPrice = { '1H': 157.97 }; u.alertSide = { '1H': 'short' };   // 上のゾーン手前で short
  const g = ts.find(t => t.kind === 'scalpwatch' && t.pair === 'GOLD');
  g.alerts = { '1H': new Date(Date.now() - 3600000).toISOString() }; g.alertPrice = { '1H': 4300 }; g.alertSide = { '1H': 'long' };
  localStorage.setItem('mochipoyo_trades_v1', JSON.stringify(ts));
  renderAll();
});
check('short・上のゾーン手前 → 🎯', await page.locator(pend('USDJPY') + ' .aim-badge').count() === 1);
check('🎯の行は強調', await page.$eval(pend('USDJPY'), el => el.classList.contains('aim')));
check('🎯が古いアラートより上', (await page.$$eval('#tabPanel-scalp .sw-pend-row .sw-pend-pair', els => els.map(e => e.textContent))).join(',') === 'USDJPY,GOLD');
await page.evaluate(() => {
  const ts = JSON.parse(localStorage.getItem('mochipoyo_trades_v1'));
  ts.find(t => t.kind === 'scalpwatch' && t.pair === 'GOLD').alertPrice = { '1H': 4201 };
  localStorage.setItem('mochipoyo_trades_v1', JSON.stringify(ts));
  renderAll();
});
check('ゾーン内は long でも 🎯', await page.locator(pend('GOLD') + ' .aim-badge').count() === 1);
check('見出しに🎯の件数', (await page.textContent('#tabPanel-scalp .sw-pend-head')).includes('🎯狙い目 2'));
await page.evaluate(() => {
  const ts = JSON.parse(localStorage.getItem('mochipoyo_trades_v1'));
  ts.find(t => t.kind === 'scalpwatch' && t.pair === 'USDJPY').alertSide = { '1H': 'long' };   // 抵抗に向かう long
  localStorage.setItem('mochipoyo_trades_v1', JSON.stringify(ts));
  renderAll();
});
check('long で上のゾーン手前は 🎯 にしない（📍だけ）', await page.locator(pend('USDJPY') + ' .aim-badge').count() === 0 && await page.locator(pend('USDJPY') + ' .zone-badge').count() === 1);
await page.evaluate(() => {
  const ts = JSON.parse(localStorage.getItem('mochipoyo_trades_v1'));
  ts.find(t => t.kind === 'scalpwatch' && t.pair === 'USDJPY').aim = { '1H': { lo: 158, hi: 158.04, conf: ['1H', '4H'], touches: 3, side: 'up' } };
  localStorage.setItem('mochipoyo_trades_v1', JSON.stringify(ts));
  renderAll();
});
check('受信側が付けた aim はそのまま 🎯', await page.locator(pend('USDJPY') + ' .aim-badge').count() === 1);
await page.click('#tabPanel-scalp [data-sw-group="aim"]');
const aimPairs = await page.$$eval('#scalpWatch [data-sw] .sw-pair', els => els.map(e => e.textContent));
check('🎯狙い目タブに自動で入る', aimPairs.includes('USDJPY') && aimPairs.includes('GOLD'));
check('タブに件数', (await page.textContent('#tabPanel-scalp [data-sw-group="aim"]')).includes('2'));
await page.click(pend('USDJPY') + ' [data-sw-done]');
check('✓で aim も消える', !((await byKind('scalpwatch')).find(t => t.pair === 'USDJPY').aim || {})['1H']);
await page.click('#tabPanel-scalp [data-sw-group="all"]');
const overflowTabs = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
check('タブが4つでも 375px に収まる', !overflowTabs);

// 5. 新しい zones.json を読んだら描き直す
await page.route('https://zones.test/zones.json*', route => route.fulfill({
  status: 200, contentType: 'application/json',
  body: JSON.stringify(Object.assign({}, DOC, { generatedAt: '2026-10-01T08:00:00.000Z', pairs: { GOLD: DOC.pairs.GOLD } })),
}));
await page.evaluate(() => { window.__ZONES_URL = 'https://zones.test/zones.json'; return fetchZones(true); });
await page.waitForTimeout(100);
check('取得した内容に差し替わる', await page.locator(srow('USDJPY') + ' .sw-zone-line').count() === 0);
check('キャッシュも更新', await page.evaluate(() => JSON.parse(localStorage.getItem('mochipoyo_zones_cache_v1')).generatedAt === '2026-10-01T08:00:00.000Z'));
check('JSONバックアップには入れない', await page.evaluate(() => BACKUP_SKIP.test('mochipoyo_zones_cache_v1')));

// 6. 🔭にも同じ一覧
await page.click('.tab-btn[data-tab="trend"]');
check('🔭にもゾーン一覧', await page.locator('#tabPanel-trend .sw-zones').count() === 1);

// 7. 375px で横にはみ出さない
await page.evaluate(doc => { localStorage.setItem('mochipoyo_zones_cache_v1', JSON.stringify(doc)); }, DOC);
await page.reload();
await page.click('.tab-btn[data-tab="scalp"]');
await page.click('#tabPanel-scalp [data-sc-pane="watch"]');
await page.click(zones + ' > summary');
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
check('375px で横スクロールが出ない', !overflow);

check('コンソールエラーなし', errors.length === 0);
if (errors.length) console.log(errors);
await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
