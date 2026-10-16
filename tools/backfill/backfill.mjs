/* S109: 記録の「価格からの突き合わせ」。副作用なしの純関数＋ CLI。
 *
 * 「入った」「結果」を押すのはリアルタイムではないので、押した時刻は使わない。入力された価格（約定価格・損切り・2:1/3:1/4:1）を
 * TradingView のローソク足（エントリー足）と突き合わせて、あとから次を埋める：
 *   1. エントリー時刻       … アラート後〜「入った」を押すまでの間に、約定価格に最初に触れた足
 *   2. 3:1・4:1に届いたか   … エントリー後の足を順に見て、損切り／2:1／3:1／4:1 のどれに先に触れたか（2:1の後の損切りは建値）
 *   3. 最大含み益・最大含み損 … エントリーから決着まで（R倍とATR倍、pips）
 *   4. 見送りの「もし入っていたら」… 固定ルールのシミュレーション（損切り＝エントリー足ATR×1.5、利確＝損切り幅の2倍）
 *
 * ⚠️ 同じ足の中で両方に触れた場合は、足の中の順序が分からないので「悪い方（損切り・建値）が先」とし ambiguous を立てる。
 * bars は { t: unix秒(UTC), o, h, l, c } の配列（TradingView MCP の get-ohlcv の rows と同じ）。 */

export const ENTRY_TF = {
  '1分足':  { interval: '1m',  sec: 60 },
  '5分足':  { interval: '5m',  sec: 300 },
  '15分足': { interval: '15m', sec: 900 },
  '1時間足': { interval: '1h', sec: 3600 },
  '4時間足': { interval: '4h', sec: 14400 },
};
export const SIM = { atrLen: 14, stopAtr: 1.5, rr: 2, horizonH: { scalp: 4, day: 24, swing: 72 } };

const sign = dir => (dir === 'long' ? 1 : -1);
const lvlHit = (bar, dir, price) => (dir === 'long' ? bar.h >= price : bar.l <= price);   // 有利な方向のレベルに触れたか
const adverseHit = (bar, dir, price) => (dir === 'long' ? bar.l <= price : bar.h >= price); // 不利な方向のレベルに触れたか
const iso = sec => new Date(sec * 1000).toISOString();

/* 1. エントリー時刻。bars は昇順。window は [fromMs, toMs]（アラート〜「入った」を押すまで）。
   足の開始時刻 t が窓の中にあり、その足の安値〜高値が約定価格を含む最初の足。複数あれば candidates に件数 */
export function findEntry(bars, price, fromMs, toMs, tfSec) {
  const hits = bars.filter(b => b.t * 1000 + tfSec * 1000 > fromMs && b.t * 1000 <= toMs && b.l <= price && price <= b.h);
  if (!hits.length) return { at: '', index: -1, candidates: 0 };
  return { at: iso(hits[0].t), index: bars.indexOf(hits[0]), candidates: hits.length };
}

/* 2・3. エントリー後の足を順に見る。levels = { entry, stop, tp2, tp3, tp4 }。
   startIndex はエントリーした足の次から数える（エントリー足の中の順序は分からないため） */
export function walkTrade(bars, startIndex, dir, lv, tfSec) {
  const R = Math.abs(lv.entry - lv.stop);
  let stage = 0;                       // 0: 損切りあり／1: 2:1後（損切りは建値）
  let maxFav = 0, maxAdv = 0;
  const out = { outcome: 'open', tp2At: '', tp3At: '', tp4At: '', exitAt: '', ambiguous: false, mfeR: 0, maeR: 0, mfePrice: lv.entry, maePrice: lv.entry };
  const s = sign(dir);
  const track = b => {
    const fav = dir === 'long' ? b.h - lv.entry : lv.entry - b.l;
    const adv = dir === 'long' ? lv.entry - b.l : b.h - lv.entry;
    if (fav > maxFav) { maxFav = fav; out.mfePrice = dir === 'long' ? b.h : b.l; }
    if (adv > maxAdv) { maxAdv = adv; out.maePrice = dir === 'long' ? b.l : b.h; }
  };
  for (let i = startIndex + 1; i < bars.length; i++) {
    const b = bars[i];
    const end = iso(b.t + tfSec);
    if (stage === 0) {
      const stopHit = adverseHit(b, dir, lv.stop);
      const tp2Hit = lvlHit(b, dir, lv.tp2);
      if (stopHit) {
        if (tp2Hit) out.ambiguous = true;
        track(b); out.outcome = 'stoploss'; out.exitAt = end; break;
      }
      if (tp2Hit) {
        out.tp2At = iso(b.t); stage = 1; out.outcome = 'reg';
        if (lvlHit(b, dir, lv.tp3)) { out.tp3At = iso(b.t); out.outcome = 'big'; }
        if (lvlHit(b, dir, lv.tp4)) { out.tp4At = iso(b.t); out.outcome = 'max'; out.exitAt = end; track(b); break; }
      }
      track(b);
    } else {
      /* 2:1の後：損切りは建値。建値に戻るのと 3:1/4:1 が同じ足なら、悪い方（建値）が先 */
      const beHit = adverseHit(b, dir, lv.entry);
      const t3 = !out.tp3At && lvlHit(b, dir, lv.tp3);
      const t4 = lvlHit(b, dir, lv.tp4);
      if (beHit) {
        if (t3 || t4) out.ambiguous = true;
        track(b); out.exitAt = end; break;
      }
      if (t3) { out.tp3At = iso(b.t); out.outcome = 'big'; }
      if (t4) { if (!out.tp3At) out.tp3At = iso(b.t); out.tp4At = iso(b.t); out.outcome = 'max'; out.exitAt = end; track(b); break; }
      track(b);
    }
  }
  out.mfeR = R > 0 ? Number((maxFav / R).toFixed(2)) : 0;
  out.maeR = R > 0 ? Number((maxAdv / R).toFixed(2)) : 0;
  return out;
}

/* 1つの記録（status:'closed' か 'open' で価格が揃っているもの）を突き合わせる。bars はエントリー足 */
export function backfillTrade(t, bars) {
  const tf = ENTRY_TF[t.tfEntry];
  if (!tf || !bars || !bars.length) return { error: 'no bars' };
  if (t.entryPrice == null || t.stopPrice == null || t.tp2Price == null) return { error: 'no levels' };
  const dir = t.direction;
  const toMs = Date.parse(t.createdAt || '') || Date.now();           // 「入った」を押した時刻（これより前に約定している）
  const fromMs = Date.parse(t.alertAt || '') || toMs - 6 * 3600000;    // アラートが鳴った時刻（これより前には入っていない）
  /* S115: 後から記録して日時を手で入れた記録は、その時刻を含む足をエントリーとする（価格での突き合わせはしない） */
  const manualMs = t.entryAtManual ? Date.parse(t.entryAtIso || '') : NaN;
  if (Number.isFinite(manualMs)) {
    let idx = -1;
    for (let k = 0; k < bars.length; k++) { if (bars[k].t * 1000 <= manualMs) idx = k; else break; }
    if (idx < 0) return { error: 'entry before bars', entryAt: '' };
    const wm = walkTrade(bars, idx, dir, { entry: t.entryPrice, stop: t.stopPrice, tp2: t.tp2Price, tp3: t.tp3Price, tp4: t.tp4Price }, tf.sec);
    return Object.assign({ entryAt: new Date(manualMs).toISOString(), entryCandidates: 1, entryAtSource: 'manual' }, wm);
  }
  const e = findEntry(bars, t.entryPrice, fromMs, toMs, tf.sec);
  if (e.index < 0) return { error: 'entry not found', entryAt: '' };
  const w = walkTrade(bars, e.index, dir, { entry: t.entryPrice, stop: t.stopPrice, tp2: t.tp2Price, tp3: t.tp3Price, tp4: t.tp4Price }, tf.sec);
  return Object.assign({ entryAt: e.at, entryCandidates: e.candidates }, w);
}

/* ATR（単純平均）。見送りシミュレーションの損切り幅に使う */
export function atrOf(bars, upto, len = SIM.atrLen) {
  const from = Math.max(1, upto - len + 1);
  let sum = 0, n = 0;
  for (let i = from; i <= upto; i++) {
    const b = bars[i], pc = bars[i - 1].c;
    sum += Math.max(b.h - b.l, Math.abs(b.h - pc), Math.abs(b.l - pc)); n++;
  }
  return n ? sum / n : 0;
}

/* 4. 見送りの「もし入っていたら」。ルールを先に固定して機械的に判定する（結果を見てから決めない）。
   入る価格＝見送りを押した時刻の足の終値、損切り＝ATR×stopAtr、利確＝損切り幅×rr。期間はスキャ4h・デイ24h・スイング72h。
   同じ足で両方に触れたら負け（甘く見ない）。期間内にどちらにも届かなければ undecided */
export function simulateSkip(log, bars, tfSec, cls) {
  const dir = log.alert && log.alert.side;
  if (!dir || !bars || bars.length < SIM.atrLen + 2) return { error: 'no data' };
  const atMs = Date.parse(log.datetime || '');
  let i = -1;
  for (let k = 0; k < bars.length; k++) { if (bars[k].t * 1000 <= atMs) i = k; else break; }
  if (i < SIM.atrLen) return { error: 'no data' };
  const entry = bars[i].c;
  const risk = atrOf(bars, i) * SIM.stopAtr;
  if (!(risk > 0)) return { error: 'no atr' };
  const s = sign(dir);
  const stop = entry - s * risk, tp = entry + s * risk * SIM.rr;
  const endMs = atMs + (SIM.horizonH[cls] || 24) * 3600000;
  for (let k = i + 1; k < bars.length && bars[k].t * 1000 <= endMs; k++) {
    const b = bars[k];
    const sh = adverseHit(b, dir, stop), th = lvlHit(b, dir, tp);
    if (sh) return { result: 'loss', at: iso(b.t), entry, stop, tp, ambiguous: th };
    if (th) return { result: 'win', at: iso(b.t), entry, stop, tp, ambiguous: false };
  }
  return { result: 'undecided', entry, stop, tp };
}

/* ---- CLI ----
 * node tools/backfill/backfill.mjs <trades.json> <ohlcv ディレクトリ…> [--out result.json]
 *   trades.json … 記録の配列（status:'closed'/'open' の記録と、kind:'watchlog' outcome:'skip' の見送りを突き合わせる）
 *   ohlcv ディレクトリ … get-ohlcv の結果ファイル（symbol / interval から自動で振り分け）
 * 結果は { trades: { <id>: {...} }, skips: { <id>: {...} } }。アプリのデータへの反映は Routine の手順（tools/backfill/ROUTINE.md）で行う。 */
async function main(argv) {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { SYMBOLS } = await import('../zones/zones.mjs');
  const files = []; let out = 'backfill.json';
  for (let i = 0; i < argv.length; i++) { if (argv[i] === '--out') out = argv[++i]; else files.push(argv[i]); }
  const tradesFile = files.shift();
  const all = JSON.parse(fs.readFileSync(tradesFile, 'utf8'));
  const symToPair = Object.fromEntries(Object.entries(SYMBOLS).map(([p, s]) => [s, p]));
  const byKey = {};
  for (const d of files) {
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d)) {
      if (!/ohlcv/.test(f)) continue;
      let j; try { j = JSON.parse(fs.readFileSync(path.join(d, f), 'utf8')); } catch { continue; }
      const pair = symToPair[j.symbol];
      if (!pair || !Array.isArray(j.bars)) continue;
      const key = pair + '|' + String(j.interval).toLowerCase();
      if (!byKey[key] || byKey[key].length < j.bars.length) byKey[key] = j.bars.slice().sort((a, b) => a.t - b.t);
    }
  }
  const res = { trades: {}, skips: {} };
  for (const t of all) {
    if (!t || t.kind || !t.status || !ENTRY_TF[t.tfEntry]) continue;
    const bars = byKey[t.pair + '|' + ENTRY_TF[t.tfEntry].interval];
    if (!bars) { res.trades[t.id] = { error: 'no bars' }; continue; }
    res.trades[t.id] = backfillTrade(t, bars);
  }
  for (const l of all) {
    if (!l || l.kind !== 'watchlog' || l.outcome !== 'skip' || l.autoFill === 'done') continue;
    const tfName = { scalp: '5分足', day: '15分足', swing: '1時間足' }[l.cls] || '15分足';   // 見送りの検証は粗めの足で十分
    const bars = byKey[l.pair + '|' + ENTRY_TF[tfName].interval];
    res.skips[l.id] = bars ? simulateSkip(l, bars, ENTRY_TF[tfName].sec, l.cls) : { error: 'no bars' };
  }
  fs.writeFileSync(out, JSON.stringify(res, null, 1));
  console.log('backfill:', Object.keys(res.trades).length, 'trades,', Object.keys(res.skips).length, 'skips →', out);
}
const isMain = async () => { try { const u = await import('node:url'); return import.meta.url === u.pathToFileURL(process.argv[1]).href; } catch { return false; } };
if (await isMain()) main(process.argv.slice(2));
