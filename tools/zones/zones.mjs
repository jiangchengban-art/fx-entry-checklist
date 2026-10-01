/* ネックラインゾーンの計算（S106）。副作用なしの純関数＋ CLI。
 *
 * 入力：TradingView MCP の get-ohlcv の結果（JSON。大きい結果は Claude Code が tool-results/ にファイルで残す）
 * 出力：zones.json（アプリが raw.githubusercontent.com から読む）
 *
 * 考え方：
 *  - 「何度も反発している水平線」を優先 → 左右 k 本より高い/低い足（スイング）の高値・安値を集め、
 *    近い価格どうしを1つのゾーンにまとめる。まとまった数＝反発回数（touches）
 *  - ゾーンの幅はその足の ATR に比例させる（狭すぎ・広すぎを防ぐ。幅は ATR×MIN_W〜MAX_SPAN）
 *  - 現在値の上・下それぞれ、反発 MIN_TOUCH 回以上のうち一番近いゾーンを1つずつ
 *  - 他の時間足のゾーンと重なっていれば confluence（複数足で意識されている）
 *
 * 調整はすべて PARAMS で行う（あとから「広すぎ／狭すぎ」を直すときはここだけ触る）。 */

export const PARAMS = {
  lookback: { '1H': 500, '4H': 500, 'D': 500 },  // 分析に使う直近の本数（1H≈1か月、4H≈4か月、D≈2年）
  pivotK:   { '1H': 3,   '4H': 3,   'D': 3   },  // スイングの判定：左右この本数より高い/低い
  atrLen: 14,
  mergeTol: 0.2,    // 隣り合うスイング価格の差が ATR×これ以下なら同じゾーン
  maxSpan: 0.3,      // 1ゾーンの幅の上限（ATR 倍）
  minW: 0.15,        // 1ゾーンの幅の下限（ATR 倍）。1本だけの線になるのを防ぐ
  minTouch: 2,      // 「何度も反発」とみなす最小回数
  nearAtr1h: 1.0,   // 価格がゾーンから「1時間足の ATR×これ」以内なら「付近」（どの足のゾーンでも同じ物差し）
  confTol1h: 0.2,   // 複数足の重なり：実際の山・谷の価格どうしが「1時間足の ATR×これ」以内なら同じ水準とみなす
  hotTfs: ['4H', 'D'], // 通知に載せるのは、この足のゾーンを含むものだけ（1時間足だけのゾーンはどこにでもあるので載せない）
  hotMax: 12,       // 通知に載せる最大件数
};

export const TFS = ['1H', '4H', 'D'];
export const INTERVAL_TO_TF = { '1h': '1H', '60': '1H', '4h': '4H', '240': '4H', '1d': 'D', 'd': 'D' };

/* アプリの通貨名 → TradingView の銘柄。インジケーターのアラートと同じ銘柄を使う（価格をそろえるため） */
export const SYMBOLS = {
  SPX500: 'CAPITALCOM:SPX500', NAS100: 'CAPITALCOM:NAS100', US30: 'CAPITALCOM:US30',
  JP225: 'FOREXCOM:JP225', UK100: 'FX:UK100', DAX40: 'GOMARKETS:DAX40',
  BTCUSDT: 'BINANCE:BTCUSDT', ETHUSDT: 'BINANCE:ETHUSDT', XRPUSDT: 'BINANCE:XRPUSDT',
  SOLUSDT: 'BINANCE:SOLUSDT', BNBUSDT: 'BINANCE:BNBUSDT', DOGEUSDT: 'BINANCE:DOGEUSDT',
  GOLD: 'TVC:GOLD', SILVER: 'TVC:SILVER', OIL: 'OANDA:WTICOUSD',
  USDJPY: 'OANDA:USDJPY', EURJPY: 'OANDA:EURJPY', GBPJPY: 'OANDA:GBPJPY', EURUSD: 'OANDA:EURUSD',
  GBPUSD: 'OANDA:GBPUSD', AUDUSD: 'OANDA:AUDUSD', AUDJPY: 'OANDA:AUDJPY', NZDUSD: 'OANDA:NZDUSD',
  NZDJPY: 'OANDA:NZDJPY', USDCHF: 'OANDA:USDCHF', CHFJPY: 'OANDA:CHFJPY', USDCAD: 'OANDA:USDCAD',
  CADJPY: 'OANDA:CADJPY',
};
export const SYMBOL_TO_PAIR = Object.fromEntries(Object.entries(SYMBOLS).map(([p, s]) => [s, p]));

export function atr(bars, len = PARAMS.atrLen) {
  if (bars.length < 2) return 0;
  const tr = [];
  for (let i = 1; i < bars.length; i++) {
    const b = bars[i], pc = bars[i - 1].c;
    tr.push(Math.max(b.h - b.l, Math.abs(b.h - pc), Math.abs(b.l - pc)));
  }
  /* 直近 len 本の単純平均だと1本の急変で幅がぶれるので、直近 len×5 本の中央値と平均の小さい方 */
  const recent = tr.slice(-len);
  const wide = tr.slice(-len * 5).sort((a, b) => a - b);
  const mean = recent.reduce((s, v) => s + v, 0) / recent.length;
  const med = wide[Math.floor(wide.length / 2)];
  return Math.min(mean, med * 1.5);
}

export function pivots(bars, k) {
  const out = [];
  for (let i = k; i < bars.length - k; i++) {
    let hi = true, lo = true;
    for (let j = i - k; j <= i + k; j++) {
      if (j === i) continue;
      if (bars[j].h > bars[i].h) hi = false;
      if (bars[j].l < bars[i].l) lo = false;
    }
    if (hi) out.push({ p: bars[i].h, i, t: bars[i].t, type: 'H' });
    if (lo) out.push({ p: bars[i].l, i, t: bars[i].t, type: 'L' });
  }
  return out;
}

/* スイング価格を近いものどうしでまとめる。ゾーンの幅は ATR で上限を切る */
export function clusterZones(pts, a, P = PARAMS) {
  const sorted = pts.slice().sort((x, y) => x.p - y.p);
  const zones = [];
  let cur = null;
  for (const pt of sorted) {
    if (cur && pt.p - cur.pts[cur.pts.length - 1].p <= a * P.mergeTol && pt.p - cur.lo <= a * P.maxSpan) {
      cur.pts.push(pt); cur.hi = pt.p;
    } else {
      cur = { lo: pt.p, hi: pt.p, pts: [pt] };
      zones.push(cur);
    }
  }
  return zones.map(z => {
    /* 同じ山・谷を高値と安値で二重に数えない：近い足（pivotK 以内）の連続は1回 */
    const idx = z.pts.map(p => p.i).sort((x, y) => x - y);
    let touches = 0, last = -Infinity;
    idx.forEach(i => { if (i - last > 2) touches++; last = i; });
    let lo = z.lo, hi = z.hi;
    const minW = a * P.minW;
    if (hi - lo < minW) { const mid = (lo + hi) / 2; lo = mid - minW / 2; hi = mid + minW / 2; }
    const lastT = Math.max(...z.pts.map(p => p.t));
    const kinds = new Set(z.pts.map(p => p.type));
    return { lo, hi, clo: z.lo, chi: z.hi, touches, lastT, role: kinds.size === 2 ? 'flip' : (kinds.has('H') ? 'res' : 'sup') };
  });
}

/* 表示の桁数は価格の大きさから決める（データの小数をそのまま数えると 10559.407214 のような誤差が出る）
   USDJPY 157 → 3、EURUSD 1.1 → 5、GOLD 4165 → 2、UK100 10559 → 1 */
export function decimalsOf(bars) {
  const p = Math.abs(bars[bars.length - 1].c) || 1;
  return Math.max(0, Math.min(6, 5 - Math.floor(Math.log10(p))));
}

const round = (v, d) => Number(v.toFixed(d));

/* 1つの時間足：上下のゾーン＋候補一覧（他の足との重なり判定用） */
export function analyzeTf(bars, tf, P = PARAMS) {
  const use = bars.slice(-P.lookback[tf]);
  const a = atr(use, P.atrLen);
  const price = use[use.length - 1].c;
  const zones = clusterZones(pivots(use, P.pivotK[tf]), a, P);
  const strong = zones.filter(z => z.touches >= P.minTouch);
  const pickSide = (list) => ({
    up: list.filter(z => z.lo > price).sort((x, y) => x.lo - y.lo)[0] || null,
    down: list.filter(z => z.hi < price).sort((x, y) => y.hi - x.hi)[0] || null,
    inside: list.filter(z => z.lo <= price && price <= z.hi).sort((x, y) => y.touches - x.touches)[0] || null,
  });
  const s = pickSide(strong);
  const w = pickSide(zones);
  /* 上か下に「何度も反発」が無いとき（高値更新中など）は1回だけのスイングで代用し weak を付ける */
  if (!s.up && w.up) s.up = Object.assign({ weak: true }, w.up);
  if (!s.down && w.down) s.down = Object.assign({ weak: true }, w.down);
  return { tf, atr: a, price, lastT: use[use.length - 1].t, ...s, strong };
}

const overlap = (x, y, pad) => x.lo - pad <= y.hi && y.lo - pad <= x.hi;
const TF_ORDER = { '1H': 0, '4H': 1, 'D': 2 };
const RANGE_PRIO = { '4H': 0, 'D': 1, '1H': 2 };

/* 1通貨：3つの足をまとめ、複数足で重なるゾーンに confluence を付ける */
export function analyzePair(pair, barsByTf, P = PARAMS) {
  const tfRes = {};
  let dec = 0;
  TFS.forEach(tf => {
    const bars = barsByTf[tf];
    if (!bars || bars.length < 50) return;
    tfRes[tf] = analyzeTf(bars, tf, P);
    dec = decimalsOf(bars);
  });
  /* 現在値は一番細かい足（1H）の終値 */
  const base = TFS.map(tf => tfRes[tf]).find(Boolean);
  const price = base ? base.price : null, lastT = base ? base.lastT : 0;
  if (price === null) return null;
  const out = { symbol: SYMBOLS[pair] || '', price: round(price, dec), lastT, tfs: {}, hot: [] };
  /* 「付近」の物差しは1時間足の ATR（無ければ一番細かい足）。日足の ATR で測ると1日分の値幅が「付近」になってしまう */
  const nearUnit = base.atr * P.nearAtr1h;
  const confTol = base.atr * P.confTol1h;
  /* 重なりは「各足で選んだ上下（＋現在値を含む）ゾーン」どうしで見る。候補全部と比べると、
     1時間足の細かいゾーンがどこにでもあるので何でも重なってしまう */
  const picked = {};
  for (const tf of Object.keys(tfRes)) {
    picked[tf] = ['up', 'down', 'inside'].map(k => tfRes[tf][k]).filter(z => z && !z.weak);
  }
  for (const tf of Object.keys(tfRes)) {
    const r = tfRes[tf];
    const fmt = z => {
      if (!z) return null;
      const conf = [tf];
      for (const o of Object.keys(tfRes)) {
        if (o === tf) continue;
        /* 表示用の幅（minW で広げた分）で比べると、日足の太いゾーンが何とでも重なってしまう。
           実際に反発した価格の範囲（clo〜chi）どうしで比べる */
        if (!z.weak && picked[o].some(oz => z.clo - confTol <= oz.chi && oz.clo - confTol <= z.chi)) conf.push(o);
      }
      conf.sort((x, y) => TF_ORDER[x] - TF_ORDER[y]);
      const dist = z.lo > price ? z.lo - price : z.hi < price ? price - z.hi : 0;
      const o = { lo: round(z.lo, dec), hi: round(z.hi, dec), touches: z.touches, role: z.role,
                  conf, dist: round(dist, dec), near: dist <= nearUnit };
      if (z.weak) o.weak = true;
      return o;
    };
    out.tfs[tf] = { atr: round(r.atr, dec + 1), up: fmt(r.up), down: fmt(r.down), inside: fmt(r.inside) };
  }
  /* 「今まさにゾーン付近」＝通知に載せるもの。重なっているゾーンは1件にまとめ、複数足のものほど上 */
  const hot = [];
  for (const tf of Object.keys(out.tfs)) {
    for (const side of ['inside', 'up', 'down']) {
      const z = out.tfs[tf][side];
      if (!z || z.weak || !(z.near || side === 'inside')) continue;
      if (!z.conf.some(c => P.hotTfs.includes(c))) continue;
      const same = hot.find(h => overlap(h, z, 0));
      if (same) {
        z.conf.forEach(c => { if (!same.conf.includes(c)) same.conf.push(c); });
        same.conf.sort((x, y) => TF_ORDER[x] - TF_ORDER[y]);
        same.touches = Math.max(same.touches, z.touches);
        /* 表示する範囲は 4H を優先（1H は細すぎ、D は太すぎる）→ D → 1H */
        if (RANGE_PRIO[tf] < RANGE_PRIO[same.tf]) { same.lo = z.lo; same.hi = z.hi; same.tf = tf; }
        same.side = same.lo > out.price ? 'up' : same.hi < out.price ? 'down' : 'inside';
        same.dist = Math.min(same.dist, z.dist);
        continue;
      }
      hot.push({ tf, side, lo: z.lo, hi: z.hi, conf: z.conf.slice(), touches: z.touches, dist: z.dist });
    }
  }
  out.hot = hot.sort((x, y) => y.conf.length - x.conf.length || y.touches - x.touches);
  out.nearUnit = round(nearUnit, dec);
  return out;
}

export function buildZones(barsByPair, now = new Date().toISOString(), P = PARAMS) {
  const pairs = {};
  for (const pair of Object.keys(barsByPair)) {
    const r = analyzePair(pair, barsByPair[pair], P);
    if (r) pairs[pair] = r;
  }
  return { version: 1, generatedAt: now, params: P, pairs };
}

/* 通知文（Routine の最後に出す）。複数足で重なるゾーンを優先し、近い順に hotMax 件まで */
export function hotList(doc, P = doc.params || PARAMS) {
  const rows = [];
  for (const [pair, r] of Object.entries(doc.pairs)) {
    r.hot.forEach(h => rows.push({ pair, ...h, rel: r.nearUnit ? h.dist / r.nearUnit : 0 }));
  }
  rows.sort((x, y) => y.conf.length - x.conf.length || x.rel - y.rel || y.touches - x.touches);
  return rows.slice(0, P.hotMax);
}

export function summaryText(doc) {
  const rows = hotList(doc);
  if (!rows.length) return 'ゾーン付近の通貨はありません';
  const sideJa = { inside: 'ゾーン内', up: '↑上のゾーン接近', down: '↓下のゾーン接近' };
  return rows.map(r => `${r.conf.length >= 2 ? '★' : '・'}${r.pair} ${sideJa[r.side]} ${r.lo}–${r.hi}（${r.conf.join('・')} / 反発${r.touches}回）`).join('\n');
}

/* ---- CLI ----
 * node tools/zones/zones.mjs <tool-results ディレクトリ…> [--out data/zones.json] [--since-min 90]
 * ディレクトリ内の get-ohlcv 結果ファイルを symbol / interval から自動で通貨・足に振り分ける
 * （Routine のモデルがパスを書き写さなくて済むように）。同じ組み合わせが複数あれば新しいファイルを使う。 */
async function main(argv) {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const dirs = []; let out = 'data/zones.json'; let sinceMin = 90;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') out = argv[++i];
    else if (argv[i] === '--since-min') sinceMin = Number(argv[++i]);
    else dirs.push(argv[i]);
  }
  const cutoff = Date.now() - sinceMin * 60000;
  const pick = {};
  for (const d of dirs) {
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d)) {
      if (!/ohlcv/.test(f)) continue;
      const fp = path.join(d, f);
      const st = fs.statSync(fp);
      if (st.mtimeMs < cutoff) continue;
      let j; try { j = JSON.parse(fs.readFileSync(fp, 'utf8')); } catch { continue; }
      const pair = SYMBOL_TO_PAIR[j.symbol];
      const tf = INTERVAL_TO_TF[String(j.interval || '').toLowerCase()];
      if (!pair || !tf || !Array.isArray(j.bars)) continue;
      const key = pair + '|' + tf;
      if (!pick[key] || pick[key].m < st.mtimeMs) pick[key] = { m: st.mtimeMs, bars: j.bars, pair, tf };
    }
  }
  const barsByPair = {};
  Object.values(pick).forEach(({ pair, tf, bars }) => { (barsByPair[pair] ||= {})[tf] = bars; });
  const doc = buildZones(barsByPair);
  const missing = [];
  Object.keys(SYMBOLS).forEach(p => TFS.forEach(tf => { if (!(barsByPair[p] || {})[tf]) missing.push(p + ' ' + tf); }));
  doc.missing = missing;
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(doc));
  console.log(`zones: ${Object.keys(doc.pairs).length} pairs → ${out}` + (missing.length ? `\n未取得: ${missing.join(', ')}` : ''));
  console.log('---\n' + summaryText(doc));
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2));
