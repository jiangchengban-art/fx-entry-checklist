import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

// S78: ログインなし・1記録1行（trades_checklist）の端末間同期。Supabase は in-memory でモックし、2端末（2コンテキスト）で往復させる
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const filePath = 'file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/');

let browser;
try { browser = await chromium.launch(); }
catch { browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }); }

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log('OK  ', name); } else { fail++; console.log('FAIL', name); } };

const table = new Map();          // id -> { id, data, updated_at }
const log = { get: [], post: [], otherTable: 0 };

async function device() {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.addInitScript(() => { window.__SYNC_ALLOW_FILE = true; });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  /* S80: index.html の SUPABASE_URL が d6ac473（プロジェクトIDの修正）で inqvrsfzskjusmbwlimx に
     変わって以降、このモックのURLが古いままだったため実際には何もインターセプトしておらず、
     __SYNC_ALLOW_FILE=true と合わさって本番の共用テーブルへ生の fetch が飛んでいた（発見・修正）。 */
  await page.route('https://inqvrsfzskjusmbwlimx.supabase.co/**', async route => {
    const req = route.request();
    const url = new URL(req.url());
    if (!url.pathname.endsWith('/rest/v1/trades_checklist')) { log.otherTable++; return route.fulfill({ status: 404, body: '' }); }
    const h = req.headers();
    if (h.apikey == null || !/^Bearer /.test(h.authorization || '')) return route.fulfill({ status: 401, body: 'noauth' });
    if (req.method() === 'GET') {
      const f = url.searchParams.get('updated_at');
      let rows = [...table.values()];
      if (f) { const since = Date.parse(f.replace(/^gt\./, '')); rows = rows.filter(r => Date.parse(r.updated_at) > since); }
      log.get.push({ filtered: !!f, n: rows.length });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) });
    }
    if (req.method() === 'POST') {
      const body = JSON.parse(req.postData());
      log.post.push({ prefer: h.prefer, ids: body.map(r => r.id) });
      body.forEach(r => table.set(r.id, r));
      return route.fulfill({ status: 201, body: '' });
    }
    route.fulfill({ status: 405, body: '' });
  });
  await page.goto(filePath);
  await page.waitForTimeout(500);
  return { page, errors };
}
const sync = (p, full) => p.evaluate(f => runSync(f ? { full: true } : undefined), full);
const pairOf = (p, name) => p.evaluate(n => loadMarket().pairs.find(x => x.pair === n), name);

const A = await device();
const B = await device();

check('設定タブにログイン/接続先の入力欄が無い', await A.page.evaluate(() =>
  !document.getElementById('syncEmail') && !document.getElementById('syncUrl') && !!document.getElementById('syncNow')));
check('起動時に全件 GET している', log.get.some(g => !g.filtered));

// ① A が USDJPY 日足、B が（Aを取り込む前に）USDJPY 4H を記録
await A.page.evaluate(() => { const w = loadMarket().pairs.find(p => p.pair === 'USDJPY'); mvWriteTrend(w.id, 'd', { state: 'up' }); });
await B.page.evaluate(() => { const w = loadMarket().pairs.find(p => p.pair === 'USDJPY'); mvWriteTrend(w.id, 'h4', { state: 'down' }); });
await sync(A.page);
check('A の送信で p:USDJPY 行ができる', table.has('p:USDJPY'));
check('送信の Prefer が merge-duplicates', log.post.every(p => /resolution=merge-duplicates/.test(p.prefer)));
check('送信する行に id（端末採番）を含めない', !('id' in table.get('p:USDJPY').data));
await sync(B.page);
const bU = await pairOf(B.page, 'USDJPY');
check('B：自分の4Hと A の日足が両方残る', bU.trend.h4.state === 'down' && bU.trend.d.state === 'up');
await sync(A.page);
const aU = await pairOf(A.page, 'USDJPY');
check('A：B の4Hが届き日足も残る', aU.trend.h4.state === 'down' && aU.trend.d.state === 'up');

// ② 差分送信：何も変えずに同期しても送信行 0
const before = log.post.length;
await sync(A.page);
check('変更なしの同期では POST しない', log.post.length === before);
check('2回目以降の GET は差分（updated_at フィルタ付き）', log.get[log.get.length - 1].filtered);

// ③ トレードの伝播と削除（墓標）
await A.page.evaluate(() => {
  const ts = new Date().toISOString();
  saveTrades(loadTrades().concat([{ id: 'tr1', tradeType: 'real', datetime: ts, createdAt: ts, updatedAt: ts, pair: 'USDJPY', notes: 'hello' }]));
});
await sync(A.page);
check('トレードが t:tr1 行で送られる', table.has('t:tr1'));
await sync(B.page);
check('B にトレードが届く', await B.page.evaluate(() => loadTrades().some(t => t.id === 'tr1')));
await A.page.evaluate(() => { markDeleted('trades', 'tr1'); saveTrades(loadTrades().filter(t => t.id !== 'tr1')); });
await sync(A.page);
check('墓標行 tomb が送られる', !!(table.get('tomb') && table.get('tomb').data.trades.tr1));
await sync(B.page);
check('B でも削除され、復活しない', await B.page.evaluate(() => !loadTrades().some(t => t.id === 'tr1')));
await sync(A.page);
check('A でも復活しない', await A.page.evaluate(() => !loadTrades().some(t => t.id === 'tr1')));

// ④ 安全弁
const g = log.get.length;
await A.page.evaluate(() => { STORAGE_FAILED.market = true; return runSync(); });
check('STORAGE_FAILED 中は通信しない', log.get.length === g);
await A.page.evaluate(() => { STORAGE_FAILED.market = false; });

check('fx-trade-tracker の trades 表に一切アクセスしない', log.otherTable === 0);
check('コンソールエラー無し', A.errors.length === 0 && B.errors.length === 0);
if (A.errors.length || B.errors.length) console.log(A.errors, B.errors);

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
