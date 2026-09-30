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

export function parseMessage(text) {
  const m = /^([\s\S]*?)\|\s*(\S+)\s+(\S+)\s+(\S+)\s*$/.exec(String(text || '').trim());
  if (!m) return null;
  const head = m[1];
  const side = /long/i.test(head) ? 'long' : /short/i.test(head) ? 'short' : '';
  return {
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

export function planUpdate({ rows, tomb, target, parsed, now }) {
  const live = pickLive(rows, tomb);
  const at = parsed.at || now;
  const item = live ? JSON.parse(JSON.stringify(live)) : {
    id: target.prefix + '_tv_' + target.pair, kind: target.kind, pair: target.pair,
    ng: { granville: false, rci: false, macd: false }, ok: { granville: false, rci: false, macd: false },
    notes: '', alerts: {}, createdAt: now, updatedAt: now,
  };
  item.alerts = Object.assign({}, item.alerts, { [target.tf]: at });
  if (parsed.side) item.alertSide = Object.assign({}, item.alertSide, { [target.tf]: parsed.side });
  item.updatedAt = now;
  return { created: !live, item, row: { id: 't:' + item.id, data: item, updated_at: now } };
}
