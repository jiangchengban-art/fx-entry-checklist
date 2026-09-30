/* TradingView Webhook の受け口。POST の本文（アラートメッセージ）を読んで trades_checklist の監視アイテム行を更新する。
   ?key=<TV_WEBHOOK_KEY> で認証（TradingView は Authorization ヘッダを付けないので verify_jwt=false）。
   TradingView は 4xx/5xx を受けると再送や停止をするので、拒否するのは key 不一致だけ。読めない本文は 200 で無視してログに残す。 */
import { parseMessage, planUpdate, resolveTarget } from './core.mjs';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const WEBHOOK_KEY = Deno.env.get('TV_WEBHOOK_KEY') ?? '';
const TABLE = 'trades_checklist';

function sameKey(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sb(path: string, init: RequestInit = {}) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    ...init,
    headers: {
      apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY, 'Content-Type': 'application/json',
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) throw new Error('supabase ' + res.status + ' ' + (await res.text().catch(() => '')).slice(0, 200));
  const text = await res.text().catch(() => '');
  return text ? JSON.parse(text) : null;
}

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return reply({ error: 'method not allowed' }, 405);
  const key = new URL(req.url).searchParams.get('key') ?? '';
  if (!sameKey(key, WEBHOOK_KEY)) return reply({ error: 'forbidden' }, 403);

  const body = await req.text();
  const parsed = parseMessage(body);
  if (!parsed) { console.warn('[tv] unparsed:', body.slice(0, 200)); return reply({ ignored: 'unparsed' }); }
  if (parsed.kind !== 'entry') return reply({ ignored: 'exit' });
  const target = resolveTarget(parsed);
  if ('error' in target) { console.warn('[tv]', target.error, body.slice(0, 200)); return reply({ ignored: target.error }); }

  const filter = encodeURIComponent('data->>kind') + '=eq.' + target.kind +
    '&' + encodeURIComponent('data->>pair') + '=eq.' + encodeURIComponent(target.pair);
  const [rows, tombRows] = await Promise.all([
    sb(TABLE + '?select=id,data&' + filter),
    sb(TABLE + '?select=data&id=eq.tomb'),
  ]);
  const tomb = (tombRows && tombRows[0] && tombRows[0].data) || {};
  const plan = planUpdate({ rows, tomb, target, parsed, now: new Date().toISOString() });
  await sb(TABLE, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([plan.row]),
  });
  console.log('[tv]', target.pair, target.tf, parsed.side, plan.created ? 'created' : 'updated', plan.item.id);
  return reply({ ok: true, pair: target.pair, tf: target.tf, side: parsed.side, id: plan.item.id, created: plan.created });
});
