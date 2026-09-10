// Rocket ↔ Google Calendar.
// The Executive Assistant connects the club's Google account once (OAuth). After that, every meeting
// scheduled in Rocket becomes an event on that account's calendar, and Google emails each attendee a
// real invite; edits and cancellations update it. Tokens never leave the server.
//
// Deploy with --no-verify-jwt: Google's redirect back (GET ?code=…) carries no Supabase login.
// Every POST action verifies the caller's Supabase session itself and requires the Executive Assistant.
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') ?? '';
const CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '';
const SITE_URL = (Deno.env.get('SITE_URL') ?? 'https://userocket.vercel.app').replace(/\/$/, '');
const TIME_ZONE = Deno.env.get('CALENDAR_TIMEZONE') ?? 'Asia/Dubai';
const CALENDAR_ID = encodeURIComponent(Deno.env.get('GOOGLE_CALENDAR_ID') ?? 'primary');
const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/google-calendar`;
const SCOPES = 'openid email https://www.googleapis.com/auth/calendar.events';
const API = `https://www.googleapis.com/calendar/v3/calendars/${CALENDAR_ID}/events`;

const cors = {
  'Access-Control-Allow-Origin': SITE_URL,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const back = (params: string) => Response.redirect(`${SITE_URL}/?${params}`, 302);
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

// ── Google tokens ────────────────────────────────────────────
async function tokenRequest(params: Record<string, string>) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, ...params }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error_description || body.error || 'Google token request failed');
  return body;
}
async function accessToken(): Promise<string> {
  const { data: t } = await db.from('google_tokens').select('*').eq('id', 1).maybeSingle();
  if (!t) throw new Error('Google Calendar isn’t connected.');
  if (t.access_token && t.expires_at && new Date(t.expires_at).getTime() > Date.now() + 60_000) return t.access_token;
  try {
    const r = await tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh_token });
    await db.from('google_tokens').update({ access_token: r.access_token, expires_at: new Date(Date.now() + r.expires_in * 1000).toISOString() }).eq('id', 1);
    return r.access_token;
  } catch (e) {
    if (/invalid_grant|revoked|expired/i.test(String(e))) {   // access was revoked in Google: show it as disconnected
      await db.from('google_tokens').delete().eq('id', 1);
      await db.from('calendar_settings').update({ connected: false, email: '' }).eq('id', 1);
      throw new Error('Google access was revoked. Connect Google Calendar again.');
    }
    throw e;
  }
}
async function google(method: string, url: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 204) return { status: 204, data: null };
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

// ── Meetings → events ────────────────────────────────────────
async function attendeeEmails(m: { mode: string; team_ids: string[]; attendee_ids: string[] }) {
  const { data: people } = await db.from('profiles').select('id, email, team').eq('active', true);
  const list = (people ?? []).filter((p) => m.mode === 'all' || m.team_ids.includes(p.team) || m.attendee_ids.includes(p.id));
  return [...new Set(list.map((p) => p.email))];
}
async function syncMeeting(id: string) {
  const { data: m } = await db.from('meetings').select('*').eq('id', id).maybeSingle();
  if (!m) throw new Error('That meeting no longer exists.');
  const event = {
    summary: m.title,
    description: `${m.agenda}\n\nScheduled in Rocket · ${SITE_URL}`,
    location: m.location,
    start: { dateTime: `${m.date}T${String(m.start_time).slice(0, 8)}`, timeZone: TIME_ZONE },
    end: { dateTime: `${m.date}T${String(m.end_time).slice(0, 8)}`, timeZone: TIME_ZONE },
    attendees: (await attendeeEmails(m)).map((email) => ({ email })),
    guestsCanModify: false,
    reminders: { useDefault: true },
  };
  if (m.google_event_id) {
    const r = await google('PATCH', `${API}/${encodeURIComponent(m.google_event_id)}?sendUpdates=all`, event);
    if (r.status < 300) return m.google_event_id;
    if (r.status !== 404 && r.status !== 410) throw new Error(r.data?.error?.message || `Google returned ${r.status}`);
  }
  const r = await google('POST', `${API}?sendUpdates=all`, event);
  if (r.status >= 300) throw new Error(r.data?.error?.message || `Google returned ${r.status}`);
  await db.from('meetings').update({ google_event_id: r.data.id }).eq('id', id);
  return r.data.id;
}

// ── Request handling ─────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const url = new URL(req.url);

  // Google redirects back here after the Executive Assistant approves access.
  if (req.method === 'GET') {
    const state = url.searchParams.get('state') ?? '', code = url.searchParams.get('code');
    if (url.searchParams.get('error')) return back(`calendar=error&reason=${encodeURIComponent(url.searchParams.get('error')!)}`);
    const { data: s } = await db.from('oauth_states').select('*').eq('state', state).maybeSingle();
    await db.from('oauth_states').delete().eq('state', state);
    if (!s || !code || new Date(s.expires_at) < new Date()) return back('calendar=error&reason=link+expired,+try+again');
    try {
      const t = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI });
      if (!t.refresh_token) return back('calendar=error&reason=Google+gave+no+offline+access,+remove+Rocket+from+your+Google+account+permissions+and+try+again');
      const claims = JSON.parse(atob(t.id_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      await db.from('google_tokens').upsert({ id: 1, email: claims.email ?? '', refresh_token: t.refresh_token, access_token: t.access_token, expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString() });
      await db.from('calendar_settings').update({ connected: true, email: claims.email ?? '', connected_at: new Date().toISOString(), connected_by: s.user_id }).eq('id', 1);
      return back('calendar=connected');
    } catch (e) {
      return back(`calendar=error&reason=${encodeURIComponent(String((e as Error).message ?? e))}`);
    }
  }

  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  if (!CLIENT_ID || !CLIENT_SECRET) return json({ error: 'Google Calendar isn’t set up on the server yet (missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).' }, 500);

  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: auth } = await db.auth.getUser(jwt);
  if (!auth?.user) return json({ error: 'Your session has expired. Sign in again.' }, 401);
  const { data: me } = await db.from('profiles').select('id, role, active').eq('id', auth.user.id).single();
  if (!me?.active || me.role !== 'ea') return json({ error: 'Only the Executive Assistant manages the club calendar.' }, 403);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body */ }

  try {
    switch (body.action) {
      case 'auth-url': {
        const state = crypto.randomUUID() + crypto.randomUUID();
        await db.from('oauth_states').delete().lt('expires_at', new Date().toISOString());
        await db.from('oauth_states').insert({ state, user_id: me.id, expires_at: new Date(Date.now() + 10 * 60_000).toISOString() });
        const q = new URLSearchParams({ client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, response_type: 'code', scope: SCOPES,
          access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state });
        return json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${q}` });
      }
      case 'disconnect': {
        const { data: t } = await db.from('google_tokens').select('refresh_token').eq('id', 1).maybeSingle();
        if (t) await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(t.refresh_token)}`, { method: 'POST' }).catch(() => {});
        await db.from('google_tokens').delete().eq('id', 1);
        await db.from('calendar_settings').update({ connected: false, email: '', connected_at: null, connected_by: null }).eq('id', 1);
        return json({ ok: true });
      }
      case 'sync':
        return json({ ok: true, eventId: await syncMeeting(String(body.id)) });
      case 'sync-all': {
        const today = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(new Date());
        const { data: upcoming } = await db.from('meetings').select('id').is('google_event_id', null).gte('date', today);
        let synced = 0, failed = 0;
        for (const m of upcoming ?? []) { try { await syncMeeting(m.id); synced++; } catch { failed++; } }
        return json({ ok: true, synced, failed });
      }
      case 'cancel': {
        const { data: m } = await db.from('meetings').select('google_event_id').eq('id', String(body.id)).maybeSingle();
        if (m?.google_event_id) {
          const r = await google('DELETE', `${API}/${encodeURIComponent(m.google_event_id)}?sendUpdates=all`);
          if (r.status >= 300 && r.status !== 404 && r.status !== 410) throw new Error(r.data?.error?.message || `Google returned ${r.status}`);
          await db.from('meetings').update({ google_event_id: null }).eq('id', String(body.id));
        }
        return json({ ok: true });
      }
      default:
        return json({ error: 'Unknown action.' }, 400);
    }
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 400);
  }
});
