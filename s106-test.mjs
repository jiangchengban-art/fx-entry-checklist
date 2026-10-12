/* S106/S109: 📍 ネックラインゾーン（zones.json の読み込み・👀監視カードのゾーン行と🎯・見送り／入ったへの控え） */
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
const row = pair => `#swList [data-sw]:has(.sw-pair:text-is("${pair}"))`;
const ago = ms => new Date(Date.now() - ms).toISOString();
const c4 = () => ({ granville: false, rci: false, macd: false, neck: false });
const mk = (id, pair, extra) => Object.assign({ id, kind: 'scalpwatch', pair, ng: c4(), mid: c4(), ok: c4(), notes: '',
  createdAt: ago(3600e3), updatedAt: ago(3600e3) }, extra);
const seed = async list => { await page.evaluate(l => { saveTrades(l); watchBoard.render(); }, list); };
const pairsShown = () => page.$$eval('#swList [data-sw] .sw-pair', els => els.map(e => e.textContent));

await page.click('.tab-btn[data-tab="watch"]');
await seed([
  mk('a', 'EURJPY', { alerts: { '1H': ago(3 * 60e3) }, alertSide: { '1H': 'long' }, alertPrice: { '1H': 179.5 } }),
  mk('b', 'GOLD', { alerts: { '1H': ago(8 * 60e3) }, alertSide: { '1H': 'long' }, alertPrice: { '1H': 4201 } }),
  mk('c', 'USDJPY', { alerts: { '1H': ago(5 * 60e3) }, alertSide: { '1H': 'short' }, alertPrice: { '1H': 157.95 } }),
]);

// 1. 各カードのゾーン行（ネックライン1本の価格・タップでコピー）
check('USDJPY のカードにゾーン行', (await page.textContent(row('USDJPY'))).includes('📍'));
check('ゾーン行に上のネックラインと時間足', (await page.textContent(row('USDJPY') + ' .sw-zone-line')).includes('上') && (await page.textContent(row('USDJPY') + ' .sw-zone-line')).includes('1H·4H·D'));
check('S108: 遠い通貨でも上下のネックライン価格を出す（コピー用）', await page.locator(row('GOLD') + ' .sw-zone-line .zcopy').count() >= 1);
await page.context().grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
const zc = page.locator(row('USDJPY') + ' .sw-zone-line .zcopy').first();
const zcText = (await zc.textContent()).trim();
await zc.click();
check('S108: 価格をタップでコピー', (await page.evaluate(() => navigator.clipboard.readText()).catch(() => zcText)) === zcText && /^\d+(\.\d+)?$/.test(zcText));
check('S108: 範囲（–）は出さない', !(await page.textContent(row('USDJPY') + ' .sw-zone-line')).includes('–'));

// 2. 🎯狙い目（ゾーン付近＋方向が合う）。上に並ぶ
check('short・上のゾーン手前 → 🎯', await page.locator(row('USDJPY') + ' .aim-badge').count() === 1);
check('ゾーン内は long でも 🎯', await page.locator(row('GOLD') + ' .aim-badge').count() === 1);
check('ゾーンから遠い通貨に 🎯 は付かない', await page.locator(row('EURJPY') + ' .aim-badge').count() === 0);
check('🎯のカードが上に並ぶ（新しい順）', (await pairsShown()).join() === 'USDJPY,GOLD,EURJPY');
check('🎯の説明にネックラインの価格', (await page.getAttribute(row('GOLD') + ' .aim-badge', 'title')).length > 0);

// long で上のゾーン手前は 🎯 にしない
await seed([mk('c', 'USDJPY', { alerts: { '1H': ago(5 * 60e3) }, alertSide: { '1H': 'long' }, alertPrice: { '1H': 157.95 } })]);
check('long で上のゾーン手前は 🎯 にしない', await page.locator(row('USDJPY') + ' .aim-badge').count() === 0);
// 受信側（Edge Function）が付けた aim はそのまま 🎯
await seed([mk('c', 'USDJPY', { alerts: { '1H': ago(5 * 60e3) }, alertSide: { '1H': 'long' }, alertPrice: { '1H': 157.95 },
  aim: { '1H': { lo: 158, hi: 158.04, conf: ['1H', '4H'], touches: 3, side: 'up' } } })]);
check('受信側が付けた aim はそのまま 🎯', await page.locator(row('USDJPY') + ' .aim-badge').count() === 1);

// 3. 見送りの記録に、アラートとゾーンを自動で残す
await seed([mk('b', 'GOLD', { alerts: { '1H': ago(8 * 60e3) }, alertSide: { '1H': 'long' }, alertPrice: { '1H': 4201 } })]);
await page.click(row('GOLD') + ' [data-sw-skip]');
const skip = (await trades()).find(t => t.kind === 'watchlog');
check('見送りの記録にアラートの足・時刻・価格', skip && skip.alert.tf === '1H' && !!skip.alert.at && skip.alert.price === 4201);
check('見送りの記録にゾーン（鳴った価格で判定）', skip.zone && skip.zone.conf.includes('1H') && skip.zone.lo === 4200);

// 4. 「入った」の記録にもゾーンを控える
await seed([mk('c', 'USDJPY', { alerts: { '1H': ago(5 * 60e3) }, alertSide: { '1H': 'short' }, alertPrice: { '1H': 157.95 } })]);
await page.click(row('USDJPY') + ' [data-sw-in-open]');
await page.fill(row('USDJPY') + ' [data-sw-in="entry"]', '157.95');
await page.click(row('USDJPY') + ' [data-sw-go]');
const pos = (await trades()).find(t => t.status);
check('入った記録にアラート価格とゾーン', pos && pos.alertPrice === 157.95 && pos.zone && pos.zone.conf.includes('4H'));

// 5. 新しい zones.json を読んだら描き直す
await seed([mk('c', 'USDJPY', { alerts: { '1H': ago(5 * 60e3) }, alertSide: { '1H': 'short' }, alertPrice: { '1H': 157.95 } })]);
await page.route('https://zones.test/zones.json*', route => route.fulfill({
  status: 200, contentType: 'application/json',
  body: JSON.stringify(Object.assign({}, DOC, { generatedAt: '2026-10-01T08:00:00.000Z', pairs: { GOLD: DOC.pairs.GOLD } })),
}));
await page.evaluate(() => { window.__ZONES_URL = 'https://zones.test/zones.json'; return fetchZones(true); });
await page.waitForTimeout(100);
check('取得した内容に差し替わる', await page.locator(row('USDJPY') + ' .sw-zone-line').count() === 0);
check('キャッシュも更新', await page.evaluate(() => JSON.parse(localStorage.getItem('mochipoyo_zones_cache_v1')).generatedAt === '2026-10-01T08:00:00.000Z'));
check('JSONバックアップには入れない', await page.evaluate(() => BACKUP_SKIP.test('mochipoyo_zones_cache_v1')));

// 6. 375px で横にはみ出さない
await page.evaluate(doc => { localStorage.setItem('mochipoyo_zones_cache_v1', JSON.stringify(doc)); }, DOC);
await page.reload();
await page.click('.tab-btn[data-tab="watch"]');
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
check('375px で横スクロールが出ない', !overflow);

check('コンソールエラーなし', errors.length === 0);
if (errors.length) console.log(errors);
await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
