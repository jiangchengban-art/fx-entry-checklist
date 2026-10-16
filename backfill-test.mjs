/* S109: 価格からの突き合わせ（tools/backfill/backfill.mjs の純関数）。ブラウザ不要 */
import { findEntry, walkTrade, backfillTrade, simulateSkip, atrOf } from './tools/backfill/backfill.mjs';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('OK  ', name); }
  else { fail++; console.log('FAIL', name); }
}

const T0 = Date.parse('2026-10-09T01:00:00Z') / 1000;
const SEC = 300;
/* [h, l] の並びから5分足を作る（終値は高安の中間） */
const mk = hl => hl.map(([h, l], i) => ({ t: T0 + i * SEC, o: (h + l) / 2, h, l, c: (h + l) / 2 }));
const at = i => new Date((T0 + i * SEC) * 1000).toISOString();

/* ---- エントリー時刻 ---- */
const flat = [[101.5, 100.5], [101.2, 100.6], [100.4, 99.6], [100.8, 100.1], [101, 100.2]];   // 100 に触れるのは index 2 と 3(100.1は届かない)→ index 2 だけ
let e = findEntry(mk(flat), 100, T0 * 1000, (T0 + 10 * SEC) * 1000, SEC);
check('約定価格に最初に触れた足がエントリー時刻', e.index === 2 && e.at === at(2) && e.candidates === 1);
const twice = [[100.5, 99.5], [101, 100.2], [100.3, 99.8], [101, 100.5]];
e = findEntry(mk(twice), 100, T0 * 1000, (T0 + 10 * SEC) * 1000, SEC);
check('何度も触れていれば最初の足・候補の件数を返す', e.index === 0 && e.candidates === 2);
e = findEntry(mk(twice), 100, (T0 + 1 * SEC) * 1000, (T0 + 10 * SEC) * 1000, SEC);
check('アラートより前の足は数えない', e.index === 2);
e = findEntry(mk(twice), 100, T0 * 1000, (T0 + 1 * SEC) * 1000, SEC);
check('「入った」を押した時刻より後の足は数えない', e.index === 0 && e.candidates === 1);
e = findEntry(mk([[105, 104], [106, 105]]), 100, T0 * 1000, (T0 + 10 * SEC) * 1000, SEC);
check('触れていなければ見つからない', e.index === -1 && e.at === '');

/* ---- 3:1・4:1に届いたか（買い：入100 損切99 2:1=102 3:1=103 4:1=104） ---- */
const lv = { entry: 100, stop: 99, tp2: 102, tp3: 103, tp4: 104 };
const entryBar = [100.3, 99.8];
let w = walkTrade(mk([entryBar, [101, 100.2], [102.2, 100.8], [102.8, 101.5], [103.4, 102.5], [104.5, 103]]), 0, 'long', lv, SEC);
check('4:1まで届く → max・決着はその足の終わり', w.outcome === 'max' && w.tp2At === at(2) && w.tp3At === at(4) && w.tp4At === at(5) && w.exitAt === at(6));
check('最大含み益 4.5R・含み損なし（エントリー足の中は数えない）', w.mfeR === 4.5 && w.maeR === 0);
w = walkTrade(mk([entryBar, [102.3, 100.5], [102.9, 101.5], [101.8, 99.9]]), 0, 'long', lv, SEC);
check('2:1の後に建値へ戻る → reg（3:1には届かない）', w.outcome === 'reg' && !w.tp3At && w.exitAt === at(4));
w = walkTrade(mk([entryBar, [101, 98.9], [103, 100]]), 0, 'long', lv, SEC);
check('先に損切り → stoploss（損切り後の上昇は数えない）', w.outcome === 'stoploss' && !w.tp2At && w.mfeR === 1 && w.maeR === 1.1);
w = walkTrade(mk([entryBar, [102.5, 98.5]]), 0, 'long', lv, SEC);
check('同じ足で損切りと2:1に触れたら損切り・ambiguous', w.outcome === 'stoploss' && w.ambiguous === true);
w = walkTrade(mk([entryBar, [102.5, 101], [103.5, 99.9]]), 0, 'long', lv, SEC);
check('2:1の後、同じ足で建値と3:1に触れたら建値が先・ambiguous', w.outcome === 'reg' && w.ambiguous === true && !w.tp3At);
w = walkTrade(mk([entryBar, [100.8, 100.1], [101.2, 100.3]]), 0, 'long', lv, SEC);
check('どちらにも届かなければ open', w.outcome === 'open' && w.exitAt === '');
w = walkTrade(mk([entryBar, [103.2, 101.5]]), 0, 'long', lv, SEC);
check('1本で2:1と3:1を越えたら big', w.outcome === 'big' && w.tp2At === at(1) && w.tp3At === at(1));
w = walkTrade(mk([[100.3, 99.8], [100.2, 98.9]]), 0, 'long', lv, SEC);
check('エントリー足の中は数えない（次の足から）', w.outcome === 'stoploss' && w.exitAt === at(2));

// 売り：入100 損切101 2:1=98 3:1=97 4:1=96
const sv = { entry: 100, stop: 101, tp2: 98, tp3: 97, tp4: 96 };
w = walkTrade(mk([[100.2, 99.7], [99.5, 97.8], [98.5, 96.9], [97.5, 95.9]]), 0, 'short', sv, SEC);
check('売り：max', w.outcome === 'max' && w.mfeR === 4.1);
w = walkTrade(mk([[100.2, 99.7], [101.1, 99.5]]), 0, 'short', sv, SEC);
check('売り：損切り', w.outcome === 'stoploss');

/* ---- 1件まとめて ---- */
const trade = { id: 't1', tfEntry: '5分足', direction: 'long', entryPrice: 100, stopPrice: 99, tp2Price: 102, tp3Price: 103, tp4Price: 104,
                alertAt: at(-1), createdAt: at(4) };
let r = backfillTrade(trade, mk([[101, 100.5], [100.4, 99.8], [102.3, 100.8], [103.2, 101.5], [104.2, 102]]));
check('backfillTrade：エントリー時刻＋3:1/4:1', r.entryAt === at(1) && r.outcome === 'max' && r.tp3At === at(3) && r.tp4At === at(4));
check('価格が揃っていなければエラー', !!backfillTrade({ tfEntry: '5分足', entryPrice: 100 }, mk(flat)).error);
check('足が無ければエラー', !!backfillTrade(trade, []).error);

// S115: 日時を手で入れた記録は、その時刻の足からエントリーとして見る（価格で探さない）
r = backfillTrade(Object.assign({}, trade, { entryAtManual: true, entryAtIso: at(3), alertAt: '', createdAt: at(9) }),
  mk([[101, 100.5], [100.4, 99.8], [102.3, 100.8], [103.2, 101.5], [104.2, 102]]));
check('手で入れた日時を使う（その足の次から判定）', r.entryAtSource === 'manual' && r.entryAt === at(3) && r.outcome === 'max' && r.tp4At === at(4));
check('手で入れた日時が足より前ならエラー', !!backfillTrade(Object.assign({}, trade, { entryAtManual: true, entryAtIso: at(-5) }), mk(flat)).error);

/* ---- 見送りの「もし入っていたら」 ---- */
const calm = n => Array.from({ length: n }, () => [100.5, 99.5]);          // 値幅1.0 → ATR 約1.0 → 損切り幅 1.5・利確 3.0
const withTail = tail => mk(calm(20).concat(tail));
const log = { datetime: at(19), alert: { side: 'long' }, cls: 'scalp' };
let sres = simulateSkip(log, withTail([[100.6, 99.6], [103.6, 100.5]]), SEC, 'scalp');
check('見送り：利確に先に届けば win', sres.result === 'win' && Math.abs(sres.tp - (sres.entry + 3)) < 0.2 && sres.stop < sres.entry);
sres = simulateSkip(log, withTail([[100.6, 99.6], [100.5, 98]]), SEC, 'scalp');
check('見送り：損切りに先に届けば loss', sres.result === 'loss');
sres = simulateSkip(log, withTail([[103.6, 98]]), SEC, 'scalp');
check('見送り：同じ足で両方に触れたら loss（甘く見ない）', sres.result === 'loss' && sres.ambiguous === true);
sres = simulateSkip(log, withTail([[100.6, 99.6]]), SEC, 'scalp');
check('見送り：届かなければ undecided', sres.result === 'undecided');
sres = simulateSkip(Object.assign({}, log, { alert: { side: 'short' } }), withTail([[100.4, 96.5]]), SEC, 'scalp');
check('見送り：売りは逆向き', sres.result === 'win' && sres.stop > sres.entry);
sres = simulateSkip(log, withTail(Array.from({ length: 60 }, () => [100.6, 99.6]).concat([[110, 100]])), SEC, 'scalp');
check('見送り：スキャは4時間（48本）を過ぎたら見ない', sres.result === 'undecided');
check('見送り：データ不足はエラー', !!simulateSkip(log, mk(calm(5)), SEC, 'scalp').error && !!simulateSkip({ datetime: at(19) }, withTail([]), SEC, 'scalp').error);
check('ATR', Math.abs(atrOf(mk(calm(20)), 19) - 1) < 1e-9);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
