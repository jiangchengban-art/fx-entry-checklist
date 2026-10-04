/* S106: ネックラインゾーンの計算（tools/zones/zones.mjs の純関数）。ブラウザ不要 */
import { analyzeTf, analyzePair, buildZones, hotList, summaryText, decimalsOf, pivots } from './tools/zones/zones.mjs';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('OK  ', name); }
  else { fail++; console.log('FAIL', name); }
}

/* 100 と 110 の間を何度も往復するレンジ（＝100 と 110 が「何度も反発している水平線」）。
   最後は 105 付近で終わる。step で1本あたりの値動き、noise で高値・安値のひげ */
function rangeBars(n, { lo = 100, hi = 110, step = 1, end = 105, t0 = 1e9, dt = 3600 } = {}) {
  const bars = [];
  let p = (lo + hi) / 2, dir = 1;
  for (let i = 0; i < n; i++) {
    const o = p;
    p += dir * step;
    if (p >= hi) { p = hi; dir = -1; }
    if (p <= lo) { p = lo; dir = 1; }
    bars.push({ t: t0 + i * dt, o, h: Math.max(o, p) + 0.1, l: Math.min(o, p) - 0.1, c: p });
  }
  /* 終値を end に寄せる */
  for (let k = 0; k < 5; k++) {
    const o = bars[bars.length - 1].c;
    const c = o + (end - o) / (5 - k);
    bars.push({ t: t0 + (n + k) * dt, o, h: Math.max(o, c) + 0.1, l: Math.min(o, c) - 0.1, c });
  }
  return bars;
}

// 1. スイング
const bars = rangeBars(300);
const pv = pivots(bars, 3);
check('天井と底でスイングを拾う', pv.some(p => p.type === 'H' && p.p > 109) && pv.some(p => p.type === 'L' && p.p < 101));

// 2. 1つの足
const r = analyzeTf(bars, '1H');
check('上のゾーンは 110 付近', r.up && r.up.lo <= 110.2 && r.up.hi >= 109.8);
check('下のゾーンは 100 付近', r.down && r.down.lo <= 100.2 && r.down.hi >= 99.8);
check('何度も反発している（反発回数が多い）', r.up.touches >= 5 && r.down.touches >= 5);
check('ゾーンの幅は ATR の範囲に収まる（狭すぎ・広すぎない）', (r.up.hi - r.up.lo) >= r.atr * 0.15 - 1e-9 && (r.up.hi - r.up.lo) <= r.atr * 0.3 + 1e-9);
check('上下とも weak ではない', !r.up.weak && !r.down.weak);

// 3. 3つの足が同じ水準 → 重なり（confluence）
const one = analyzePair('USDJPY', { '1H': rangeBars(300), '4H': rangeBars(300, { dt: 14400 }), 'D': rangeBars(300, { dt: 86400 }) });
check('1H の上のゾーンが 4H・D と重なる', one.tfs['1H'].up.conf.join(',') === '1H,4H,D');
check('現在値は 1H の終値', Math.abs(one.price - 105) < 0.01);
check('105 は 100/110 から遠いので「付近」に出ない', one.hot.length === 0);

// 4. ゾーンのすぐ下で終わる → 付近に出る
const near = analyzePair('USDJPY', {
  '1H': rangeBars(300, { end: 109.5 }), '4H': rangeBars(300, { dt: 14400, end: 109.5 }), 'D': rangeBars(300, { dt: 86400, end: 109.5 }),
});
check('上のゾーンに接近 → hot', near.hot.length >= 1 && near.hot[0].side === 'up');
check('hot は複数足', near.hot[0].conf.length === 3);

// 5. 1H だけの足では通知に載せない
const only1h = analyzePair('USDJPY', { '1H': rangeBars(300, { end: 109.5 }) });
check('1H だけのゾーンは hot に入れない', only1h.hot.length === 0);

// 6. 片側に反発が無い（高値更新中）→ weak で代用
const up = [];
for (let i = 0; i < 200; i++) { const c = 100 + i * 0.5 + (i % 6 < 3 ? 0 : -1.5); up.push({ t: i, o: c - 0.2, h: c + 0.3, l: c - 0.5, c }); }
const ru = analyzeTf(up, '1H');
check('上に反発が無いときは up が無いか weak', !ru.up || ru.up.weak);

// 7. 桁数
check('USDJPY は3桁', decimalsOf([{ c: 157.9 }]) === 3);
check('EURUSD は5桁', decimalsOf([{ c: 1.13 }]) === 5);
check('UK100 は1桁', decimalsOf([{ c: 10559.4 }]) === 1);

// 8. 全体と通知文
const doc = buildZones({ USDJPY: near.tfs ? { '1H': rangeBars(300, { end: 109.5 }), '4H': rangeBars(300, { dt: 14400, end: 109.5 }), 'D': rangeBars(300, { dt: 86400, end: 109.5 }) } : {},
                         GBPJPY: { '1H': rangeBars(300), '4H': rangeBars(300, { dt: 14400 }) } }, '2026-10-01T00:00:00Z');
check('通貨ごとに出力', !!doc.pairs.USDJPY && !!doc.pairs.GBPJPY && doc.generatedAt === '2026-10-01T00:00:00Z');
check('通知はゾーン付近の通貨だけ', hotList(doc).every(h => h.pair === 'USDJPY'));
check('通知文に★と時間足', /★USDJPY .*1H・4H・D/.test(summaryText(doc)));
check('付近が無ければその旨', summaryText({ pairs: {} }) === 'ゾーン付近の通貨はありません');

// 9. S107: ladder（上下に複数残す）
const lad = near.tfs['4H'].ladder;
check('ladder は距離順の配列', Array.isArray(lad) && lad.length >= 1 && lad.every((z, i) => i === 0 || lad[i - 1].dist <= z.dist));
check('ladder に複数足の重なり(conf)が付く', lad.some(z => z.conf.length === 3));
check('ladder は上下 ladderN 個＋内側まで', lad.length <= 2 * 4 + 1);


console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
