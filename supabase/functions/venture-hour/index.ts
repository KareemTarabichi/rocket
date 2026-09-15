// Rocket → Programmes → The Venture Hour.
// Two kinds of callers:
//  • The Google Apps Script attached to the sign-up Google Form (header x-venture-secret):
//      'intake'       — once per new form response; books the student (or waitlists / blocks them)
//      'due-surveys'  — hourly; returns the post-meeting survey emails to send
//    The script sends the emails this function writes, from the club's Google account.
//  • Members with the Programmes section (their Supabase session): booking changes that also touch
//    Google Calendar — add a sign-up by hand, swap a mentor, cancel, re-send an invite.
// Calendar invites go out from the club Google account the Executive Assistant already connected for
// meetings (the same google_tokens row as the google-calendar function) — mentor and student are both
// invited as guests, with the student's topic and survey link in the invite.
//
// Deploy with --no-verify-jwt: the Apps Script has no Supabase login. Members' sessions are checked here,
// and every booking rule runs inside the database functions (vh_*) under the caller's own permissions.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const VENTURE_SECRET = Deno.env.get('VENTURE_SECRET') ?? '';
const CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') ?? '';
const CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '';
const SITE_URL = (Deno.env.get('SITE_URL') ?? 'https://userocket.vercel.app').replace(/\/$/, '');
const TIME_ZONE = Deno.env.get('CALENDAR_TIMEZONE') ?? 'Asia/Dubai';
const CALENDAR_ID = encodeURIComponent(Deno.env.get('GOOGLE_CALENDAR_ID') ?? 'primary');
const API = `https://www.googleapis.com/calendar/v3/calendars/${CALENDAR_ID}/events`;

const cors = {
  'Access-Control-Allow-Origin': SITE_URL,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

// ── Google tokens (same logic as google-calendar/index.ts — keep the two in step) ──
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
  if (!t) throw new Error('Google Calendar isn’t connected (Admin → Links).');
  if (t.access_token && t.expires_at && new Date(t.expires_at).getTime() > Date.now() + 60_000) return t.access_token;
  try {
    const r = await tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh_token });
    await db.from('google_tokens').update({ access_token: r.access_token, expires_at: new Date(Date.now() + r.expires_in * 1000).toISOString() }).eq('id', 1);
    return r.access_token;
  } catch (e) {
    if (/invalid_grant|revoked|expired/i.test(String(e))) {
      await db.from('google_tokens').delete().eq('id', 1);
      await db.from('calendar_settings').update({ connected: false, email: '' }).eq('id', 1);
      throw new Error('Google access was revoked. Connect Google Calendar again (Admin → Links).');
    }
    throw e;
  }
}
async function google(method: string, url: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 204) return { status: 204, data: null };
  return { status: res.status, data: await res.json().catch(() => null) };
}

// ── Formatting ───────────────────────────────────────────────
const TYPE: Record<string, string> = { vc: 'VC', alumni: 'Alumni founder', professor: 'Professor' };
const when = (iso: string) => new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso));
const surveyLink = (token: string) => `${SITE_URL}/survey.html?t=${token}`;
const first = (name: string) => (name || '').trim().split(/\s+/)[0] || 'there';
const SIGN_OFF = '\n\n— AUS Launchpad';

// ── Calendar invites for a booking ───────────────────────────
type Booking = { id: string; status: string; topic_note: string; survey_token: string; calendar_event_id: string | null;
  student: { name: string; aus_email: string; major: string; year: string };
  slot: { starts_at: string; ends_at: string; location: string; mentor: { name: string; email: string; org_title: string; type: string } } | null };

async function booking(id: string): Promise<Booking | null> {
  const { data } = await db.from('signups')
    .select('id, status, topic_note, survey_token, calendar_event_id, student:students(name, aus_email, major, year), slot:weekly_slots(starts_at, ends_at, location, mentor:mentors(name, email, org_title, type))')
    .eq('id', id).maybeSingle();
  return data as unknown as Booking | null;
}

// Creates (or updates) the Google Calendar event for a booking: mentor + student invited, Google emails both.
async function syncBooking(id: string): Promise<string> {
  const b = await booking(id);
  if (!b || b.status !== 'assigned' || !b.slot) throw new Error('That booking no longer exists.');
  const m = b.slot.mentor, st = b.student, about = [st.major, st.year].filter(Boolean).join(', ');
  const event = {
    summary: `The Venture Hour: ${st.name || st.aus_email} × ${m.name}`,
    description: [
      'AUS Launchpad · The Venture Hour — a one-to-one mentor session.',
      '',
      `Mentor: ${m.name}${m.org_title ? `, ${m.org_title}` : ''} (${TYPE[m.type] ?? m.type})`,
      `Student: ${st.name || st.aus_email}${about ? ` · ${about}` : ''}`,
      ...(b.topic_note ? ['', 'What the student wants to discuss:', b.topic_note] : []),
      '',
      `Student: after the meeting, fill the 1-minute survey — you’ll need it before booking your next Venture Hour: ${surveyLink(b.survey_token)}`,
    ].join('\n'),
    location: b.slot.location,
    start: { dateTime: b.slot.starts_at, timeZone: TIME_ZONE },
    end: { dateTime: b.slot.ends_at, timeZone: TIME_ZONE },
    attendees: [{ email: m.email, displayName: m.name }, { email: st.aus_email, displayName: st.name }],
    guestsCanModify: false, guestsCanInviteOthers: false, guestsCanSeeOtherGuests: true,
    reminders: { useDefault: true },
  };
  try {
    let eventId = b.calendar_event_id;
    if (eventId) {
      const r = await google('PATCH', `${API}/${encodeURIComponent(eventId)}?sendUpdates=all`, event);
      if (r.status === 404 || r.status === 410) eventId = null;
      else if (r.status >= 300) throw new Error(r.data?.error?.message || `Google returned ${r.status}`);
    }
    if (!eventId) {
      const r = await google('POST', `${API}?sendUpdates=all`, event);
      if (r.status >= 300) throw new Error(r.data?.error?.message || `Google returned ${r.status}`);
      eventId = r.data.id as string;
    }
    await db.from('signups').update({ calendar_event_id: eventId, calendar_error: '' }).eq('id', id);
    return eventId;
  } catch (e) {
    await db.from('signups').update({ calendar_error: String((e as Error).message ?? e).slice(0, 300) }).eq('id', id);
    throw e;
  }
}
// Calendar trouble never undoes a booking change; it comes back as a warning to show.
const trySync = (id: string) => syncBooking(id).then(() => '').catch((e) => `Google Calendar: ${(e as Error).message}`);
async function cancelEvent(eventId: string | null, signupId?: string): Promise<string> {
  if (!eventId) return '';
  try {
    const r = await google('DELETE', `${API}/${encodeURIComponent(eventId)}?sendUpdates=all`);
    if (r.status >= 300 && r.status !== 404 && r.status !== 410) throw new Error(r.data?.error?.message || `Google returned ${r.status}`);
    if (signupId) await db.from('signups').update({ calendar_event_id: null }).eq('id', signupId);
    return '';
  } catch (e) { return `Google Calendar: ${(e as Error).message} — remove the invite by hand.`; }
}

// ── The reply email the Apps Script sends the student ────────
type Result = { status: string; reason: string; signup_id: string; student?: { name: string; email: string }; mentor?: { name: string; org_title: string; type: string } | null;
  starts_at?: string; location?: string; survey_token?: string; owed_mentor?: string; upcoming?: { mentor: string; starts_at: string } | null };

function replyEmail(r: Result, formUrl: string) {
  const hi = `Hi ${first(r.student?.name ?? '')},\n\n`;
  const again = formUrl ? `\n\nSign up again here: ${formUrl}` : '';
  switch (r.status) {
    case 'assigned': {
      const m = r.mentor!;
      return { subject: `You’re booked: The Venture Hour with ${m.name}`,
        body: `${hi}You’re booked for The Venture Hour with ${m.name}${m.org_title ? ` (${m.org_title})` : ''} on ${when(r.starts_at!)}${r.location ? ` at ${r.location}` : ''}.\n\nA Google Calendar invite is on its way — accept it so it’s in your calendar. If you can’t make it, reply to this email so we can give the slot to someone else.\n\nAfter the meeting you’ll get a 1-minute survey. You need to fill it before you can book your next Venture Hour.${SIGN_OFF}` };
    }
    case 'waitlisted':
      return { subject: 'You’re on the Venture Hour waitlist',
        body: `${hi}All of this week’s Venture Hour slots are taken, so you’re on the waitlist in the order you signed up. If a slot frees up you’ll get a calendar invite straight away.\n\nNew mentors are picked every Monday — if nothing frees up, sign up again then.${again}${SIGN_OFF}` };
    case 'blocked':
      return { subject: 'One step before your next Venture Hour',
        body: `${hi}Before you can book another Venture Hour, please fill the short survey from your last session${r.owed_mentor ? ` with ${r.owed_mentor}` : ''} — it takes a minute:\n${surveyLink(r.survey_token!)}\n\nThen submit the sign-up form again.${again}${SIGN_OFF}` };
    case 'duplicate':
      return { subject: 'You already have a Venture Hour booked',
        body: `${hi}You already have a Venture Hour booked${r.upcoming ? ` with ${r.upcoming.mentor} on ${when(r.upcoming.starts_at)}` : ''}. You can book the next one once that meeting (and its survey) is done.${SIGN_OFF}` };
    case 'invalid':
      return { subject: 'Use your AUS email for The Venture Hour',
        body: `Hi,\n\nThe Venture Hour is for AUS students, so we need your @aus.edu email address. Please sign up again with it.${again}${SIGN_OFF}` };
  }
  return null;
}

// ── Request handling ─────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body */ }
  const str = (k: string) => String(body[k] ?? '').trim();

  try {
    // The Google Form's Apps Script
    const secret = req.headers.get('x-venture-secret');
    if (secret !== null) {
      if (!VENTURE_SECRET || secret !== VENTURE_SECRET) return json({ error: 'Wrong or missing VENTURE_SECRET.' }, 401);
      const { data: settings } = await db.from('venture_settings').select('form_url').eq('id', 1).maybeSingle();
      if (body.action === 'intake') {
        const submitted = str('submitted_at');
        const { data, error } = await db.rpc('vh_intake', {
          p_name: str('name'), p_email: str('email'), p_major: str('major'), p_year: str('year'), p_topic: str('topic').slice(0, 1000),
          p_submitted_at: submitted && !isNaN(Date.parse(submitted)) ? submitted : null, p_response_id: str('response_id') || null, p_source: 'form' });
        if (error) throw error;
        const r = data as Result;
        const warning = r.status === 'assigned' ? await trySync(r.signup_id) : '';
        return json({ ok: true, status: r.status, warning, email: replyEmail(r, settings?.form_url ?? '') });
      }
      if (body.action === 'due-surveys') {
        const { data, error } = await db.rpc('vh_due_surveys');
        if (error) throw error;
        const emails = (data ?? []).map((d: { student_name: string; student_email: string; mentor_name: string; survey_token: string }) => ({
          to: d.student_email,
          subject: `How was your Venture Hour with ${d.mentor_name}?`,
          body: `Hi ${first(d.student_name)},\n\nThanks for joining The Venture Hour with ${d.mentor_name}. Please fill this 1-minute survey — you’ll need it before you can book your next session:\n${surveyLink(d.survey_token)}${SIGN_OFF}`,
        }));
        return json({ ok: true, emails });
      }
      if (body.action === 'ping') return json({ ok: true });
      return json({ error: 'Unknown action.' }, 400);
    }

    // Members of the club, with their own permissions
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: auth } = await db.auth.getUser(jwt);
    if (!auth?.user) return json({ error: 'Your session has expired. Sign in again.' }, 401);
    const as = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false, autoRefreshToken: false } });
    const rpc = async (fn: string, args: Record<string, unknown>) => { const { data, error } = await as.rpc(fn, args); if (error) throw new Error(error.message); return data; };
    const { data: canSee } = await as.from('venture_settings').select('id').eq('id', 1).maybeSingle();
    if (!canSee) return json({ error: 'You need the Programmes section to do that.' }, 403);

    switch (body.action) {
      case 'status': {
        const { data: c } = await db.from('calendar_settings').select('connected, email').eq('id', 1).maybeSingle();
        return json({ ok: true, webhook: !!VENTURE_SECRET, calendar: !!c?.connected, calendarEmail: c?.email ?? '', google: !!(CLIENT_ID && CLIENT_SECRET) });
      }
      case 'add-signup': {
        const r = await rpc('vh_intake', { p_name: str('name'), p_email: str('email'), p_major: str('major'), p_year: str('year'), p_topic: str('topic').slice(0, 1000), p_source: 'manual' }) as Result;
        return json({ ok: true, result: r, warning: r.status === 'assigned' ? await trySync(r.signup_id) : '' });
      }
      case 'swap': {
        const r = await rpc('vh_swap_mentor', { p_slot: str('slot_id'), p_mentor: str('mentor_id') || null }) as { signup_id: string | null; to: string };
        return json({ ok: true, result: r, warning: r.signup_id ? await trySync(r.signup_id) : '' });
      }
      case 'cancel-signup': {
        const r = await rpc('vh_cancel_signup', { p_signup: str('signup_id'), p_reason: str('reason') }) as { cancelled: string; calendar_event_id: string | null; promoted: string | null };
        const warnings = [await cancelEvent(r.calendar_event_id, r.cancelled), r.promoted ? await trySync(r.promoted) : ''].filter(Boolean);
        return json({ ok: true, result: r, warning: warnings.join(' ') });
      }
      case 'cancel-slot': {
        const r = await rpc('vh_cancel_slot', { p_slot: str('slot_id') }) as { signup_id: string | null; calendar_event_id: string | null };
        return json({ ok: true, result: r, warning: await cancelEvent(r.calendar_event_id, r.signup_id ?? undefined) });
      }
      case 'sync': {   // re-send / update the invite (after a time change, or when it failed before)
        const { data: s } = await as.from('signups').select('id').eq('id', str('signup_id')).maybeSingle();
        if (!s) return json({ error: 'That booking no longer exists.' }, 404);
        return json({ ok: true, eventId: await syncBooking(s.id) });
      }
      default:
        return json({ error: 'Unknown action.' }, 400);
    }
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 400);
  }
});
