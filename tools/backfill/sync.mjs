/* S121: 突き合わせの結果をアプリのデータ（Supabase の trades_checklist）に書き戻す。Routine が使う（手順は tools/backfill/ROUTINE.md）。
 *
 *   node tools/backfill/sync.mjs pull <trades.json>
 *     … 記録を全部取ってきて（削除済みは除く）trades.json に置き、判定に要るローソク足の取得指示（銘柄・足・本数）を表示する
 *   node tools/backfill/sync.mjs push <backfill.json>
 *     … backfill.mjs の結果を、その記録の行に書き込む（vsim / sim / fill）。書く直前に行を取り直し、updatedAt を今にする
 *
 * ⚠️ 表 trades は fx-trade-tracker 用なので触らない（trades_checklist だけ）。
 * アプリ側は updatedAt の新しい方が勝つ（mergeTrades）。書いた直後に端末側でその記録を編集すると結果が落ちることがあるが、
 * 結果の無い記録は次回また判定するので自然に埋まる。 */
import fs from 'node:fs';
import { SYMBOLS } from '../zones/zones.mjs';
import { ENTRY_TF, SIM, SIM_TF, ledgerRows } from './backfill.mjs';

export const SUPABASE_URL = 'https://inqvrsfzskjusmbwlimx.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlucXZyc2Z6c2tqdXNtYndsaW14Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc4MjE5MDcsImV4cCI6MjEwMzM5NzkwN30.fFjiCh1_t6JPV_SeJmiQ3xZntV1SI1t98Wae7xXtQVI';
const TABLE = 'trades_checklist';
const H = { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' };

async function sb(path, opts = {}) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, Object.assign({}, opts, { headers: Object.assign({}, H, opts.headers) }));
  if (!res.ok) throw new Error(res.status + ' ' + (await res.text().catch(() => '')));
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

/* 墓標（削除）より新しくない記録を落とす。アプリの mergeTrades と同じ考え方 */
export function liveTrades(rows) {
  const tomb = ((rows.find(r => r.id === 'tomb') || {}).data || {}).trades || {};
  return rows.filter(r => r.id.startsWith('t:') && r.data).map(r => r.data).filter(t => {
    const d = tomb[t.id];
    return !d || Date.parse(t.updatedAt || t.createdAt || 0) > Date.parse(d);
  });
}

/* 判定に要るローソク足：通貨×足ごとに、一番古い対象から今までが入る本数（+ATR用の余裕）。上限 5000 */
export function barJobs(all, nowMs = Date.now()) {
  const need = {};
  const add = (pair, tfName, fromMs) => {
    const tf = ENTRY_TF[tfName];
    if (!tf || !SYMBOLS[pair] || !Number.isFinite(fromMs)) return;
    const k = pair + '|' + tf.interval;
    need[k] = Math.min(need[k] || Infinity, fromMs);
  };
  for (const r of ledgerRows(all)) {
    if (r.done || !r.side || nowMs < Date.parse(r.at) + (SIM.horizonH[r.cls] || 24) * 3600000) continue;
    add(r.pair, SIM_TF[r.cls] || '15分足', Date.parse(r.at));
  }
  for (const l of all) {
    if (l && l.kind === 'watchlog' && l.outcome === 'skip' && !l.sim && (l.alert || l.plan || l.side)) {
      add(l.pair, SIM_TF[l.cls] || '15分足', Math.min(Date.parse(l.datetime || ''), Date.parse((l.alert && l.alert.at) || '') || Infinity));
    }
    if (l && !l.kind && l.status === 'closed' && !l.fill && ENTRY_TF[l.tfEntry]) add(l.pair, l.tfEntry, Date.parse(l.alertAt || l.datetime || ''));
  }
  return Object.entries(need).map(([k, from]) => {
    const [pair, interval] = k.split('|');
    const sec = Object.values(ENTRY_TF).find(x => x.interval === interval).sec;
    const count = Math.min(5000, Math.ceil((nowMs - from) / 1000 / sec) + SIM.atrLen + 20);
    return { pair, symbol: SYMBOLS[pair], interval, count };
  });
}

/* backfill.json の結果を、記録に書き込む形にする（純関数） */
export function applyResult(t, kind, r, nowIso) {
  const u = Object.assign({}, t);
  if (kind === 'vsims') u.vsim = Object.assign({ at: nowIso }, r);
  if (kind === 'skips') { u.sim = Object.assign({ at: nowIso }, r); u.autoFill = 'done'; }
  if (kind === 'trades') { u.fill = Object.assign({ at: nowIso }, r); u.autoFill = 'done'; }
  u.updatedAt = nowIso;
  return u;
}

async function pullAll() {
  const rows = [];
  for (let off = 0; ; off += 1000) {
    const page = await sb(TABLE + '?select=id,data&order=id&limit=1000&offset=' + off);
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows;
}

async function main(argv) {
  const [cmd, file] = argv;
  if (cmd === 'pull') {
    const all = liveTrades(await pullAll());
    fs.writeFileSync(file, JSON.stringify(all));
    const jobs = barJobs(all);
    console.log('記録 ' + all.length + ' 件 → ' + file);
    console.log('取得するローソク足 ' + jobs.length + ' 本（mcp-tv-get-ohlcv の symbol / interval / count）:');
    jobs.forEach(j => console.log(j.symbol + ' ' + j.interval + ' ' + j.count));
    return;
  }
  if (cmd === 'push') {
    const res = JSON.parse(fs.readFileSync(file, 'utf8'));
    const nowIso = new Date().toISOString();
    const todo = [];
    for (const kind of ['vsims', 'skips', 'trades']) for (const [id, r] of Object.entries(res[kind] || {})) if (!r.error) todo.push({ kind, id, r });
    const byId = {};
    todo.forEach(x => { (byId[x.id] ||= []).push(x); });
    const ids = Object.keys(byId);
    const out = [];
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      const rows = await sb(TABLE + '?select=id,data&id=in.(' + chunk.map(id => '"t:' + id + '"').join(',') + ')');
      for (const row of rows) {
        let t = row.data;
        for (const x of byId[row.id.slice(2)]) t = applyResult(t, x.kind, x.r, nowIso);
        out.push({ id: row.id, data: t, updated_at: nowIso });
      }
    }
    for (let i = 0; i < out.length; i += 200) {
      await sb(TABLE, { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(out.slice(i, i + 200)) });
    }
    const n = k => Object.values(res[k] || {}).filter(r => !r.error).length;
    const w = Object.values(res.vsims || {}).filter(r => r.result === 'win').length;
    const l = Object.values(res.vsims || {}).filter(r => r.result === 'loss').length;
    console.log('書き戻し ' + out.length + ' 件（台帳 ' + n('vsims') + '・見送り ' + n('skips') + '・入った ' + n('trades') + '）');
    console.log('---');
    console.log('📅 突き合わせ：アラート' + n('vsims') + '件を判定（もし入っていたら 勝' + w + '・負' + l + '）。📚の「アラート台帳」で見られます');
    return;
  }
  console.log('使い方: node tools/backfill/sync.mjs pull <trades.json> | push <backfill.json>');
}
const isMain = async () => { try { const u = await import('node:url'); return import.meta.url === u.pathToFileURL(process.argv[1]).href; } catch { return false; } };
if (await isMain()) main(process.argv.slice(2)).catch(e => { console.error('失敗:', e.message); process.exit(1); });
