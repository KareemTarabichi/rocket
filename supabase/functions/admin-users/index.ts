// Rocket admin API. Runs on Supabase Edge Functions with the service role key,
// which never reaches the browser. Only signed-in, active admins can call it.
import { createClient } from 'npm:@supabase/supabase-js@2';

const ROLES = ['president', 'vp', 'advisor', 'ea', 'treasurer', 'startup', 'pr', 'tech', 'media', 'design', 'innovation'];
const TEAMS = ['leadership', 'finance', 'startups', 'creative', 'tech', 'innovation'];

const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('SITE_URL') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
// Readable one-time password, e.g. "Kp7m-X3qa-9Rtz" (no 0/O/1/l/I). Members replace it at first sign-in.
function tempPassword() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const chars = [...bytes].map((b) => abc[b % abc.length]).join('');
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // Who is calling?
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ error: 'Sign in first.' }, 401);
  const { data: auth, error: authErr } = await admin.auth.getUser(jwt);
  if (authErr || !auth?.user) return json({ error: 'Your session has expired. Sign in again.' }, 401);
  const { data: me } = await admin.from('profiles').select('id, email, is_admin, active').eq('id', auth.user.id).single();
  if (!me?.is_admin || !me.active) return json({ error: 'Only admins can manage members.' }, 403);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: 'The request body isn’t valid JSON.' }, 400); }

  const log = (action: string, target_email: string, details = '') =>
    admin.from('admin_log').insert({ actor: me.id, action, target_email, details });
  const activeAdminCount = async () =>
    (await admin.from('profiles').select('id', { count: 'exact', head: true }).eq('is_admin', true).eq('active', true)).count ?? 0;
  const getTarget = async () => {
    const { data } = await admin.from('profiles').select('*').eq('id', String(body.id ?? '')).single();
    return data;
  };
  const redirectTo = typeof body.redirectTo === 'string' ? body.redirectTo : undefined;

  switch (body.action) {
    case 'list': {
      const [{ data: profiles, error: pErr }, { data: users, error: uErr }, { data: logRows }] = await Promise.all([
        admin.from('profiles').select('*').order('name'),
        admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
        admin.from('admin_log').select('*').order('created_at', { ascending: false }).limit(50),
      ]);
      if (pErr || uErr) return json({ error: (pErr ?? uErr)!.message }, 500);
      const byId = new Map(users.users.map((u) => [u.id, u]));
      const members = (profiles ?? []).map((p) => {
        const u = byId.get(p.id);
        return {
          ...p,
          last_sign_in_at: u?.last_sign_in_at ?? null,
          invited_at: u?.invited_at ?? null,
          confirmed: !!u?.email_confirmed_at,
        };
      });
      return json({ members, log: logRows ?? [] });
    }

    case 'invite': {
      const email = String(body.email ?? '').trim().toLowerCase();
      const name = String(body.name ?? '').trim();
      if (!/^[^@\s]+@aus\.edu$/.test(email)) return json({ error: 'Use an @aus.edu email address.' }, 400);
      if (!name) return json({ error: 'Add the member’s name.' }, 400);
      if (!ROLES.includes(String(body.role))) return json({ error: 'Pick a club role.' }, 400);
      if (!TEAMS.includes(String(body.team))) return json({ error: 'Pick a team.' }, 400);
      // No email is sent (AUS email scanners use up one-time links). The admin shares a temporary
      // password; Rocket makes the member choose their own at first sign-in (password_set: false).
      const temp = tempPassword();
      const { error } = await admin.auth.admin.createUser({
        email, password: temp, email_confirm: true,
        user_metadata: { name, role: body.role, team: body.team, is_admin: !!body.is_admin, password_set: false },
      });
      if (error) {
        const exists = /already|registered|exists/i.test(error.message);
        return json({ error: exists ? 'Someone with that email is already on Rocket.' : error.message }, 400);
      }
      await log('invite', email, `${body.role} · ${body.team}${body.is_admin ? ' · admin' : ''}`);
      return json({ ok: true, tempPassword: temp });
    }

    case 'reset-password': {
      const t = await getTarget();
      if (!t) return json({ error: 'That member no longer exists.' }, 404);
      if (t.id === me.id) return json({ error: 'Use “Change password” for your own account.' }, 400);
      if (!t.active) return json({ error: 'Enable their login first.' }, 400);
      const { data: u, error: gErr } = await admin.auth.admin.getUserById(t.id);
      if (gErr) return json({ error: gErr.message }, 400);
      const temp = tempPassword();
      const { error } = await admin.auth.admin.updateUserById(t.id, {
        password: temp, email_confirm: true, user_metadata: { ...(u.user?.user_metadata ?? {}), password_set: false },
      });
      if (error) return json({ error: error.message }, 400);
      await log('reset-password', t.email);
      return json({ ok: true, tempPassword: temp });
    }

    case 'update': {
      const t = await getTarget();
      if (!t) return json({ error: 'That member no longer exists.' }, 404);
      const patch = {
        name: String(body.name ?? t.name).trim() || t.name,
        role: ROLES.includes(String(body.role)) ? body.role : t.role,
        team: TEAMS.includes(String(body.team)) ? body.team : t.team,
        is_admin: typeof body.is_admin === 'boolean' ? body.is_admin : t.is_admin,
      };
      if (t.is_admin && !patch.is_admin && t.active && (await activeAdminCount()) <= 1)
        return json({ error: 'Rocket needs at least one admin. Make someone else an admin first.' }, 400);
      const { error } = await admin.from('profiles').update(patch).eq('id', t.id);
      if (error) return json({ error: error.message }, 400);
      const changes = (['name', 'role', 'team', 'is_admin'] as const)
        .filter((k) => patch[k] !== t[k]).map((k) => `${k}: ${t[k]} → ${patch[k]}`).join(', ');
      await log('update', t.email, changes || 'no changes');
      return json({ ok: true });
    }

    case 'disable':
    case 'enable': {
      const t = await getTarget();
      if (!t) return json({ error: 'That member no longer exists.' }, 404);
      const disabling = body.action === 'disable';
      if (disabling && t.id === me.id) return json({ error: 'You can’t disable your own login.' }, 400);
      if (disabling && t.is_admin && (await activeAdminCount()) <= 1)
        return json({ error: 'Rocket needs at least one active admin.' }, 400);
      const { error } = await admin.auth.admin.updateUserById(t.id, { ban_duration: disabling ? '876000h' : 'none' });
      if (error) return json({ error: error.message }, 400);
      await admin.from('profiles').update({ active: !disabling }).eq('id', t.id);
      await log(body.action as string, t.email);
      return json({ ok: true });
    }

    case 'resend': {
      const t = await getTarget();
      if (!t) return json({ error: 'That member no longer exists.' }, 404);
      if (!t.active) return json({ error: 'Enable their login first.' }, 400);
      const pub = createClient(url, anonKey, { auth: { persistSession: false } });
      const { error } = await pub.auth.signInWithOtp({ email: t.email, options: { shouldCreateUser: false, emailRedirectTo: redirectTo } });
      if (error) return json({ error: error.message }, 400);
      await log('resend', t.email);
      return json({ ok: true });
    }

    case 'remove': {
      const t = await getTarget();
      if (!t) return json({ error: 'That member no longer exists.' }, 404);
      if (t.id === me.id) return json({ error: 'You can’t remove yourself.' }, 400);
      if (t.is_admin && t.active && (await activeAdminCount()) <= 1)
        return json({ error: 'Rocket needs at least one admin.' }, 400);
      const { error: scrubErr } = await admin.rpc('admin_scrub_member', { p: t.id });
      if (scrubErr) return json({ error: scrubErr.message }, 500);
      const { error } = await admin.auth.admin.deleteUser(t.id);   // cascades to profiles
      if (error) return json({ error: error.message }, 400);
      await log('remove', t.email, `${t.name} · ${t.role}`);
      return json({ ok: true });
    }

    default:
      return json({ error: 'Unknown action.' }, 400);
  }
});
