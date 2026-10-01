/* TradingView アラート → 👀監視リストの行更新。副作用なしの純関数（Deno の index.ts と Node のテストの両方から読む）。
   メッセージの形（MCP で一括設定）:  ❶ short sign 188.337 | {{ticker}} {{interval}} {{timenow}}
   → 受信時:                            ❶ short sign 188.337 | CHFJPY 60 2026-09-30T11:00:00Z */

export const PAIR_MAP = { WTICOUSD: 'OIL' };

/* 1H はスキャル用（⚡）、4H/D/W は 🔭 */
export const TF_MAP = {
  '60':  { kind: 'scalpwatch', tf: '1H', prefix: 'sw' },
  '240': { kind: 'trendwatch', tf: '4H', prefix: 'tw' },
  '1D':  { kind: 'trendwatch', tf: 'D',  prefix: 'tw' },
  '1W':  { kind: 'trendwatch', tf: 'W',  prefix: 'tw' },
};

const ts = v => { const n = Date.parse(v || ''); return Number.isFinite(n) ? n : 0; };

/* S106: 通知で時間足が分かる形（iPhone の通知の先頭に出る）。右側の「| ticker interval timenow」を付けなくても読める
     【1時間足】USDJPY 🟢買い long 157.824
   時刻は受信時刻を使う（TradingView の送信は発火から数秒以内）。 */
const LABEL_TO_INTERVAL = { '1時間足': '60', '4時間足': '240', '日足': '1D', '週足': '1W' };

export function parseMessage(text) {
  const raw = String(text || '').trim();
  const lm = /^【(1時間足|4時間足|日足|週足)】\s*([A-Za-z0-9!._:]+)\s*([\s\S]*)$/.exec(raw);
  if (lm && !/\|/.test(raw)) {
    const head = lm[3];
    const pm = /(-?\d+(?:\.\d+)?)\s*$/.exec(head.trim());
    const price = pm ? Number(pm[1]) : null;
    return {
      price: Number.isFinite(price) && price > 0 ? price : null,
      ticker: lm[2].toUpperCase(),
      interval: LABEL_TO_INTERVAL[lm[1]],
      at: null,
      side: /long|買い/i.test(head) ? 'long' : /short|売り/i.test(head) ? 'short' : '',
      kind: /exit|決済/i.test(head) ? 'exit' : 'entry',
    };
  }
  const m = /^([\s\S]*?)\|\s*(\S+)\s+(\S+)\s+(\S+)\s*$/.exec(raw);
  if (!m) return null;
  const head = m[1];
  const side = /long/i.test(head) ? 'long' : /short/i.test(head) ? 'short' : '';
  /* S106: 左側の {{close}}（鳴った価格）。アプリがネックラインゾーンとの距離を測るのに使う */
  const pm = /(-?\d+(?:\.\d+)?)\s*$/.exec(head.trim());
  const price = pm ? Number(pm[1]) : null;
  return {
    price: Number.isFinite(price) && price > 0 ? price : null,
    ticker: m[2].toUpperCase(),
    interval: m[3].toUpperCase(),
    at: ts(m[4]) ? new Date(ts(m[4])).toISOString() : null,
    side,
    kind: /exit/i.test(head) ? 'exit' : 'entry',
  };
}

export function resolveTarget(parsed) {
  const t = TF_MAP[parsed.interval];
  if (!t) return { error: 'unknown interval ' + parsed.interval };
  const raw = parsed.ticker.replace(/^[A-Z]+:/, '');
  return Object.assign({ pair: PAIR_MAP[raw] || raw }, t);
}

/* クラウドの t: 行は削除されても残る（削除は tomb 行の時刻）。墓標より新しい行だけが生きている。 */
export function pickLive(rows, tomb) {
  const dead = (tomb && tomb.trades) || {};
  let best = null;
  (rows || []).forEach(r => {
    const t = r && r.data;
    if (!t || !t.id) return;
    const stamp = ts(t.updatedAt) || ts(t.createdAt);
    if (ts(dead[t.id]) >= stamp) return;
    if (!best || stamp > (ts(best.updatedAt) || ts(best.createdAt))) best = t;
  });
  return best;
}

/* S106: 🎯狙い目の判定。鳴った価格がネックラインゾーン（zones.json）の付近で、方向も合っているか。
   付近＝1時間足の ATR（nearUnit）以内。方向：long はゾーンが下か内側（支え）、short は上か内側（抵抗）。
   アプリの zoneHits() と同じ考え方（ゾーンは各足の上・下・内側の weak でないもの、重なるものは1つにまとめる）。 */
export function zoneMatch(doc, pair, price, side) {
  const r = doc && doc.pairs && doc.pairs[pair];
  if (!r || !(price > 0)) return null;
  const unit = r.nearUnit || 0;
  const hits = [];
  for (const tf of Object.keys(r.tfs || {})) {
    for (const k of ['inside', 'up', 'down']) {
      const z = r.tfs[tf][k];
      if (!z || z.weak) continue;
      const dist = z.lo > price ? z.lo - price : z.hi < price ? price - z.hi : 0;
      if (dist > unit) continue;
      const same = hits.find(h => h.lo <= z.hi && z.lo <= h.hi);
      if (same) {
        (z.conf || [tf]).forEach(c => { if (!same.conf.includes(c)) same.conf.push(c); });
        same.touches = Math.max(same.touches, z.touches || 0);
        continue;
      }
      hits.push({ lo: z.lo, hi: z.hi, conf: (z.conf || [tf]).slice(), touches: z.touches || 0 });
    }
  }
  const order = { '1H': 0, '4H': 1, 'D': 2 };
  const ok = hits.map(h => Object.assign(h, {
    conf: h.conf.sort((a, b) => order[a] - order[b]),
    side: h.lo > price ? 'up' : h.hi < price ? 'down' : 'inside',
  })).filter(h => h.side === 'inside' || (side === 'long' ? h.side === 'down' : side === 'short' ? h.side === 'up' : true));
  if (!ok.length) return null;
  ok.sort((a, b) => b.conf.length - a.conf.length || b.touches - a.touches);
  return Object.assign(ok[0], { zonesAt: doc.generatedAt || '' });
}

/* 通知の文面（iPhone のロック画面で読める短さに） */
export function aimMessage(target, parsed, hit) {
  const sideJa = parsed.side === 'long' ? '🟢買い' : parsed.side === 'short' ? '🔴売り' : '';
  const where = { inside: 'ゾーン内', up: '上のゾーン手前', down: '下のゾーン手前' }[hit.side];
  return {
    title: '🎯 ' + target.pair + ' ' + target.tf + ' ' + sideJa,
    body: (parsed.price || '') + ' ／ ' + where + ' ' + hit.lo + '–' + hit.hi + '（' + hit.conf.join('・') + ' 反発' + hit.touches + '回）',
  };
}

export function planUpdate({ rows, tomb, target, parsed, now, zone }) {
  const live = pickLive(rows, tomb);
  const at = parsed.at || now;
  const item = live ? JSON.parse(JSON.stringify(live)) : {
    id: target.prefix + '_tv_' + target.pair, kind: target.kind, pair: target.pair,
    ng: { granville: false, rci: false, macd: false }, ok: { granville: false, rci: false, macd: false },
    notes: '', alerts: {}, createdAt: now, updatedAt: now,
  };
  item.alerts = Object.assign({}, item.alerts, { [target.tf]: at });
  if (parsed.side) item.alertSide = Object.assign({}, item.alertSide, { [target.tf]: parsed.side });
  if (parsed.price) item.alertPrice = Object.assign({}, item.alertPrice, { [target.tf]: parsed.price });
  /* 🎯狙い目：その足のアラートに印を付ける（✓で外すときにアプリが一緒に消す）。条件が揃わなければ古い印を消す */
  item.aim = Object.assign({}, item.aim);
  if (zone) item.aim[target.tf] = { lo: zone.lo, hi: zone.hi, conf: zone.conf, touches: zone.touches, side: zone.side, zonesAt: zone.zonesAt };
  else delete item.aim[target.tf];
  item.updatedAt = now;
  return { created: !live, item, row: { id: 't:' + item.id, data: item, updated_at: now } };
}
