// Rocket phone notifications (Web Push).
// Messages are always built on the server from database records, so a member can't push
// arbitrary text to others. Deploy with --no-verify-jwt: the daily reminder is called by
// pg_cron with a shared secret; every other action verifies the caller's Supabase session.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const db = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
const SITE_URL = (Deno.env.get('SITE_URL') ?? 'https://userocket.vercel.app').replace(/\/$/, '');
const TIME_ZONE = Deno.env.get('CALENDAR_TIMEZONE') ?? 'Asia/Dubai';
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? '';
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY') ?? '', VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
if (VAPID_PUBLIC && VAPID_PRIVATE) webpush.setVapidDetails(SITE_URL, VAPID_PUBLIC, VAPID_PRIVATE);

const cors = {
  'Access-Control-Allow-Origin': SITE_URL,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const OVERSIGHT = ['president', 'vp', 'advisor', 'ea'];
type Payload = { title: string; body: string; url: string; tag?: string };

// Sends to every device of the given members; forgets devices the push service says are gone.
async function sendTo(userIds: string[], payload: Payload) {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (!ids.length) return 0;
  const { data: subs } = await db.from('push_subscriptions').select('*').in('user_id', ids);
  let sent = 0;
  await Promise.all((subs ?? []).map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 60 * 60 * 12 });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await db.from('push_subscriptions').delete().eq('id', s.id);
    }
  }));
  return sent;
}
const fmtDay = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtTime = (t: string) => { const [h, m] = t.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };

// Daily summary: overdue / due-today work and today's meetings, per member with a device.
async function digest() {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(new Date());
  const { data: subs } = await db.from('push_subscriptions').select('user_id');
  const ids = [...new Set((subs ?? []).map((s) => s.user_id))];
  if (!ids.length) return 0;
  const [{ data: people }, { data: tasks }, { data: reqs }, { data: ideas }, { data: designs }, { data: meetings }] = await Promise.all([
    db.from('profiles').select('id, team, active').in('id', ids),
    db.from('tasks').select('title, owner, due').eq('done', false).lte('due', today).in('owner', ids),
    db.from('event_requirements').select('title, owner, due').eq('done', false).lte('due', today).in('owner', ids),
    db.from('ideas').select('next_step, owner, assigned, due').neq('stage', 'completed').neq('next_step', '').lte('due', today),
    db.from('designs').select('title, owner, due').neq('status', 'completed').lte('due', today).in('owner', ids),
    db.from('meetings').select('title, start_time, mode, team_ids, attendee_ids').eq('date', today).order('start_time'),
  ]);
  let sent = 0;
  for (const p of people ?? []) {
    if (!p.active) continue;
    const mine = [
      ...(tasks ?? []).filter((x) => x.owner === p.id).map((x) => ({ t: x.title, due: x.due })),
      ...(reqs ?? []).filter((x) => x.owner === p.id).map((x) => ({ t: x.title, due: x.due })),
      ...(ideas ?? []).filter((x) => x.owner === p.id || (x.assigned ?? []).includes(p.id)).map((x) => ({ t: x.next_step, due: x.due })),
      ...(designs ?? []).filter((x) => x.owner === p.id).map((x) => ({ t: x.title, due: x.due })),
    ];
    const mtgs = (meetings ?? []).filter((m) => m.mode === 'all' || (m.team_ids ?? []).includes(p.team) || (m.attendee_ids ?? []).includes(p.id));
    if (!mine.length && !mtgs.length) continue;
    const overdue = mine.filter((x) => x.due < today).length, dueToday = mine.length - overdue;
    const parts = [overdue && `${overdue} overdue`, dueToday && `${dueToday} due today`, mtgs.length && `${mtgs.length} meeting${mtgs.length === 1 ? '' : 's'}`].filter(Boolean);
    const lines = [...mine.slice(0, 2).map((x) => x.t), ...mtgs.slice(0, 1).map((m) => `${fmtTime(String(m.start_time))} ${m.title}`)];
    sent += await sendTo([p.id], { title: `Today in Rocket: ${parts.join(', ')}`, body: lines.join(' · '), url: `${SITE_URL}/?view=${mine.length ? 'deadlines' : 'meetings'}`, tag: `digest-${today}` });
  }
  return sent;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return json({ error: 'Push notifications aren’t set up on the server yet (missing VAPID keys).' }, 500);
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty */ }

  if (body.action === 'digest') {
    if (!CRON_SECRET || req.headers.get('x-cron-secret') !== CRON_SECRET) return json({ error: 'Forbidden' }, 403);
    return json({ ok: true, sent: await digest() });
  }

  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: auth } = await db.auth.getUser(jwt);
  if (!auth?.user) return json({ error: 'Your session has expired. Sign in again.' }, 401);
  const { data: me } = await db.from('profiles').select('id, name, role, team, is_admin, active').eq('id', auth.user.id).single();
  if (!me?.active) return json({ error: 'Your access is turned off.' }, 403);
  const id = String(body.id ?? '');

  switch (body.action) {
    case 'test':
      return json({ ok: true, sent: await sendTo([me.id], { title: 'Notifications are on', body: 'Rocket will let you know when something needs you.', url: `${SITE_URL}/`, tag: 'test' }) });

    case 'notification': {   // meeting invitation / update / cancellation — only the Executive Assistant creates these
      if (me.role !== 'ea') return json({ error: 'Only the Executive Assistant sends meeting notifications.' }, 403);
      const { data: n } = await db.from('notifications').select('*').eq('id', id).maybeSingle();
      if (!n) return json({ error: 'Notification not found.' }, 404);
      const sent = await sendTo((n.recipient_ids ?? []).filter((r: string) => r !== me.id), { title: n.title, body: n.details, url: `${SITE_URL}/?view=meetings`, tag: `meeting-${n.id}` });
      return json({ ok: true, sent });
    }
    case 'design': {   // new or reassigned design request → the assignee
      if (!(OVERSIGHT.includes(me.role) || me.role === 'pr')) return json({ error: 'Only PR and leadership assign design work.' }, 403);
      const { data: d } = await db.from('designs').select('*').eq('id', id).maybeSingle();
      if (!d || d.owner === me.id) return json({ ok: true, sent: 0 });
      return json({ ok: true, sent: await sendTo([d.owner], { title: `New design request: ${d.title}`, body: `Due ${fmtDay(d.due)}${d.deliverables ? ` · ${d.deliverables}` : ''} · from ${me.name}`, url: `${SITE_URL}/?view=events`, tag: `design-${d.id}` }) });
    }
    case 'task': {   // a follow-up someone has just been given
      const { data: t } = await db.from('tasks').select('*').eq('id', id).maybeSingle();
      if (!t) return json({ error: 'Follow-up not found.' }, 404);
      if (!OVERSIGHT.includes(me.role) && t.created_by !== me.id) return json({ error: 'You can only notify people about follow-ups you assign.' }, 403);
      if (t.owner === me.id) return json({ ok: true, sent: 0 });
      return json({ ok: true, sent: await sendTo([t.owner], { title: `New follow-up: ${t.title}`, body: `Due ${fmtDay(t.due)} · from ${me.name}`, url: `${SITE_URL}/?view=deadlines`, tag: `task-${t.id}` }) });
    }
    case 'idea': {   // people newly made owner or collaborator on an idea
      const { data: i } = await db.from('ideas').select('title, owner, assigned, next_step').eq('id', id).maybeSingle();
      if (!i) return json({ error: 'Idea not found.' }, 404);
      const involved = [i.owner, ...(i.assigned ?? [])].filter(Boolean);
      if (!OVERSIGHT.includes(me.role) && !involved.includes(me.id)) return json({ error: 'You can’t notify people about this idea.' }, 403);
      const added = (Array.isArray(body.added) ? body.added : []).map(String).filter((u) => involved.includes(u) && u !== me.id);
      const sent = await sendTo(added, { title: `${me.name} added you to an idea`, body: `${i.title}${i.next_step ? ` · next: ${i.next_step}` : ''}`, url: `${SITE_URL}/?view=ideas`, tag: `idea-${id}` });
      return json({ ok: true, sent });
    }
    case 'idea-comment': {   // a contribution on an idea → its owner and collaborators
      const { data: c } = await db.from('idea_comments').select('idea_id, author, title, body').eq('id', id).maybeSingle();
      if (!c || c.author !== me.id) return json({ error: 'Only the author can send this.' }, 403);
      const { data: i } = await db.from('ideas').select('title, owner, assigned').eq('id', c.idea_id).maybeSingle();
      if (!i) return json({ error: 'Idea not found.' }, 404);
      const text = c.title ? `${c.title} — ${c.body}` : c.body;
      const sent = await sendTo([i.owner, ...(i.assigned ?? [])].filter((u) => u && u !== me.id),
        { title: `${me.name} added to “${i.title}”`, body: text.length > 140 ? `${text.slice(0, 137)}…` : text, url: `${SITE_URL}/?view=ideas`, tag: `idea-comment-${c.idea_id}` });
      return json({ ok: true, sent });
    }
    case 'event': {   // people newly assigned to an event or to one of its checklist items
      const [{ data: e }, { data: reqs }] = await Promise.all([
        db.from('events').select('name, date, team, assigned, created_by').eq('id', id).maybeSingle(),
        db.from('event_requirements').select('title, owner, due').eq('event_id', id),
      ]);
      if (!e) return json({ error: 'Event not found.' }, 404);
      if (!OVERSIGHT.includes(me.role) && e.created_by !== me.id && e.team !== me.team) return json({ error: 'You can’t notify people about this event.' }, 403);
      const involved = new Set([...(e.assigned ?? []), ...(reqs ?? []).map((r) => r.owner)].filter(Boolean));
      const added = [...new Set((Array.isArray(body.added) ? body.added : []).map(String))].filter((u) => involved.has(u) && u !== me.id);
      let sent = 0;
      for (const u of added) {   // each person hears about their own checklist items
        const mine = (reqs ?? []).filter((r) => r.owner === u);
        sent += await sendTo([u], { title: `${me.name} added you to ${e.name}`,
          body: mine.length ? `${mine.length === 1 ? mine[0].title : `${mine.length} checklist items`} · first due ${fmtDay(mine.map((r) => r.due).sort()[0])}` : `Event on ${fmtDay(e.date)}`,
          url: `${SITE_URL}/?view=events`, tag: `event-${id}-${u}` });
      }
      return json({ ok: true, sent });
    }
    case 'note-share': {   // people newly given access to a note → them
      const { data: n } = await db.from('notes').select('title, owner, editors, viewers').eq('id', id).maybeSingle();
      if (!n || n.owner !== me.id) return json({ error: 'Only the note’s owner can send this.' }, 403);
      const shared = new Set([...(n.editors ?? []), ...(n.viewers ?? [])]);
      const added = (Array.isArray(body.added) ? body.added : []).map(String).filter((u) => shared.has(u) && u !== me.id);
      const sent = await sendTo(added, { title: `${me.name} shared a note with you`, body: n.title || 'Untitled note', url: `${SITE_URL}/?view=notes`, tag: `note-${id}` });
      return json({ ok: true, sent });
    }
    case 'deletion-request': {   // someone asked to delete a startup → admins and the President
      const { data: s } = await db.from('startups').select('name, deletion_requested_by, deletion_reason').eq('id', id).maybeSingle();
      if (!s || s.deletion_requested_by !== me.id) return json({ error: 'Only the person who asked can send this.' }, 403);
      const { data: approvers } = await db.from('profiles').select('id').eq('active', true).or('is_admin.eq.true,role.eq.president');
      const sent = await sendTo((approvers ?? []).map((a) => a.id).filter((a) => a !== me.id),
        { title: `Approve deleting ${s.name}?`, body: `${me.name} asked${s.deletion_reason ? `: “${s.deletion_reason}”` : ''}`, url: `${SITE_URL}/`, tag: `startup-${id}` });
      return json({ ok: true, sent });
    }
    default:
      return json({ error: 'Unknown action.' }, 400);
  }
});
