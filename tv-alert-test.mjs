/* S104: TradingView アラート → 監視リスト行更新（Edge Function の純関数部分） */
import { parseMessage, resolveTarget, pickLive, planUpdate } from './supabase/functions/tradingview-alert/core.mjs';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('OK  ', name); }
  else { fail++; console.log('FAIL', name); }
}
const NOW = '2026-09-30T11:00:05.000Z';

// 1. メッセージの解析
let p = parseMessage('❶ short sign 188.337 | CHFJPY 60 2026-09-30T11:00:00Z');
check('ticker/interval/時刻', p && p.ticker === 'CHFJPY' && p.interval === '60' && p.at === '2026-09-30T11:00:00.000Z');
check('short を読む', p.side === 'short' && p.kind === 'entry');
p = parseMessage('④ long sign 30317.5 | NAS100 240 2026-09-29T09:00:00Z');
check('long を読む', p.side === 'long');
p = parseMessage('Ⓓ LONG EXIT | USDJPY 1D 2026-09-29T21:00:00Z');
check('EXIT は kind=exit', p.kind === 'exit' && p.side === 'long');
p = parseMessage('週足⬆️long sign 1.3250 | GBPUSD 1W 2026-09-29T00:00:00Z');
check('週足の文面（改行なし・絵文字入り）', p && p.interval === '1W' && p.side === 'long');
p = parseMessage('❶ short sign 188.337 | CHFJPY 60 {{timenow}}');
check('時刻が置換されていないときは null（受信時刻を使う）', p && p.at === null);
check('| が無い本文は null', parseMessage('❶short sign 188.337') === null);
check('空の本文は null', parseMessage('') === null);
check('前後の空白・改行を許す', parseMessage('  ❶ long sign 1 | EURUSD 60 2026-09-30T11:00:00Z\n') !== null);

// 2. 対応表
let t = resolveTarget({ ticker: 'CHFJPY', interval: '60' });
check('60 → ⚡ scalpwatch 1H', t.kind === 'scalpwatch' && t.tf === '1H' && t.prefix === 'sw' && t.pair === 'CHFJPY');
t = resolveTarget({ ticker: 'WTICOUSD', interval: '240' });
check('WTICOUSD → OIL、240 → 🔭 4H', t.pair === 'OIL' && t.kind === 'trendwatch' && t.tf === '4H');
check('1D → D', resolveTarget({ ticker: 'GOLD', interval: '1D' }).tf === 'D');
check('1W → W', resolveTarget({ ticker: 'GOLD', interval: '1W' }).tf === 'W');
check('EXCHANGE:TICKER でも通貨名になる', resolveTarget({ ticker: 'FX:USDJPY', interval: '60' }).pair === 'USDJPY');
check('知らない足は error', 'error' in resolveTarget({ ticker: 'USDJPY', interval: '15' }));

// 3. 生きている行の選択（墓標）
const item = (id, pair, updatedAt, extra) => ({ data: Object.assign({ id, kind: 'trendwatch', pair, ng: { granville: false, rci: true, macd: false },
  ok: { granville: true, rci: false, macd: false }, notes: 'メモ', alerts: { '1H': '2026-09-28T18:00:00.000Z' },
  createdAt: '2026-09-01T00:00:00.000Z', updatedAt }, extra) });
const rows = [item('tw_a', 'USDJPY', '2026-09-20T00:00:00.000Z'), item('tw_b', 'USDJPY', '2026-09-25T00:00:00.000Z')];
check('複数あれば updatedAt の新しい方', pickLive(rows, {}).id === 'tw_b');
check('墓標が新しい行は除外', pickLive(rows, { trades: { tw_b: '2026-09-26T00:00:00.000Z' } }).id === 'tw_a');
check('墓標が古ければ生きている', pickLive(rows, { trades: { tw_b: '2026-09-24T00:00:00.000Z' } }).id === 'tw_b');
check('全部消えていれば null', pickLive(rows, { trades: { tw_a: '2026-09-29T00:00:00.000Z', tw_b: '2026-09-29T00:00:00.000Z' } }) === null);
check('行なしは null', pickLive([], {}) === null);

// 4. 更新の計画
const parsed = parseMessage('④ long sign 157.0 | USDJPY 240 2026-09-30T11:00:00Z');
const target = resolveTarget(parsed);
let plan = planUpdate({ rows, tomb: {}, target, parsed, now: NOW });
check('既存アイテムを更新（created=false・id 維持）', !plan.created && plan.item.id === 'tw_b' && plan.row.id === 't:tw_b');
check('alerts[4H] に発火時刻', plan.item.alerts['4H'] === '2026-09-30T11:00:00.000Z');
check('他の足のアラートは残る', plan.item.alerts['1H'] === '2026-09-28T18:00:00.000Z');
check('alertSide[4H]=long', plan.item.alertSide['4H'] === 'long');
check('✅✖・メモは触らない', plan.item.ng.rci === true && plan.item.ok.granville === true && plan.item.notes === 'メモ');
check('updatedAt は受信時刻・updated_at も同じ', plan.item.updatedAt === NOW && plan.row.updated_at === NOW);
check('元の行オブジェクトを書き換えない', rows[1].data.alerts['4H'] === undefined && rows[1].data.updatedAt === '2026-09-25T00:00:00.000Z');

plan = planUpdate({ rows: [], tomb: {}, target, parsed, now: NOW });
check('無ければ新規作成（決まった id）', plan.created && plan.item.id === 'tw_tv_USDJPY' && plan.row.id === 't:tw_tv_USDJPY');
check('新規の中身', plan.item.kind === 'trendwatch' && plan.item.pair === 'USDJPY' && plan.item.notes === '' &&
  plan.item.ng.granville === false && plan.item.ok.macd === false && plan.item.createdAt === NOW);
check('新規にもアラートと向き', plan.item.alerts['4H'] === '2026-09-30T11:00:00.000Z' && plan.item.alertSide['4H'] === 'long');

const dead = [item('tw_tv_USDJPY', 'USDJPY', '2026-09-20T00:00:00.000Z')];
plan = planUpdate({ rows: dead, tomb: { trades: { tw_tv_USDJPY: '2026-09-21T00:00:00.000Z' } }, target, parsed, now: NOW });
check('削除済みの自動追加アイテムは同じ id で作り直す（墓標より新しいので復活する）', plan.created && plan.item.id === 'tw_tv_USDJPY' &&
  plan.item.notes === '' && plan.item.alerts['1H'] === undefined);

const scalp = resolveTarget(parseMessage('❶ short sign 1 | USDJPY 60 2026-09-30T11:00:00Z'));
plan = planUpdate({ rows: [], tomb: {}, target: scalp, parsed: parseMessage('❶ short sign 1 | USDJPY 60 2026-09-30T11:00:00Z'), now: NOW });
check('1H は ⚡ scalpwatch に sw_tv_ で作る', plan.item.kind === 'scalpwatch' && plan.item.id === 'sw_tv_USDJPY' && plan.item.alerts['1H'] && plan.item.alertSide['1H'] === 'short');

const noTime = parseMessage('❶ short sign 1 | USDJPY 60 {{timenow}}');
plan = planUpdate({ rows: [], tomb: {}, target: scalp, parsed: noTime, now: NOW });
check('時刻が無ければ受信時刻', plan.item.alerts['1H'] === NOW);

const p1 = planUpdate({ rows, tomb: {}, target, parsed, now: NOW });
const p2 = planUpdate({ rows: [{ data: p1.item }], tomb: {}, target, parsed, now: '2026-09-30T11:00:09.000Z' });
const strip = o => { const c = Object.assign({}, o); delete c.updatedAt; return JSON.stringify(c); };
check('同じ発火の再送は updatedAt 以外同じ（冪等）', strip(p1.item) === strip(p2.item));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
