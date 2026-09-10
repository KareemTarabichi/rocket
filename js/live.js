
/* ================= Live mode: Supabase auth + shared database =================
   The UI keeps working on the same in-memory `state` as the demo. After each change,
   save() → queueSync() diffs `state` against the last server snapshot and writes only
   what changed. Row-level security in Postgres re-checks every permission; if the server
   refuses a write, the change is rolled back by reloading. */

let sb = null;          // Supabase client
let snap = {};          // last known server rows, per collection: Map(id → JSON)
let syncChain = Promise.resolve();

const t5 = t => (t || '').slice(0, 5);
const COLLECTIONS = [
  {key:'profiles', table:'profiles', mode:'update', get:() => state.members, to:m => ({id:m.id, responsibility:m.responsibility})},
  {key:'calendar', table:'calendar_settings', single:true, to:() => ({id:1, connected:state.calendar.connected, email:state.calendar.email})},
  {key:'budget', table:'budget_settings', single:true, to:() => ({id:1, overall:+state.budget.overall || 0, allocations:state.budget.allocations})},
  {key:'meetings', table:'meetings', get:() => state.meetings, to:m => ({id:m.id, title:m.title, date:m.date, start_time:m.start, end_time:m.end, location:m.location, agenda:m.agenda, mode:m.mode, team_ids:m.teamIds, attendee_ids:m.attendees})},
  {key:'notifications', table:'notifications', mode:'insert', get:() => state.notifications, to:n => ({id:n.id, kind:n.kind, title:n.title, details:n.details, recipient_ids:n.recipients, calendar:!!n.calendar})},
  {key:'events', table:'events', mode:'upsert-no-delete', get:() => state.events, to:e => ({id:e.id, name:e.name, description:e.description, date:e.date, location:e.location, team:e.team, assigned:e.assigned, created_by:e.createdBy || null})},
  {key:'requirements', table:'event_requirements', get:() => state.events.flatMap(e => e.tasks.map((r, i) => ({...r, eventId:e.id, position:i}))), to:r => ({id:r.id, event_id:r.eventId, title:r.title, owner:r.owner || null, due:r.due, done:!!r.done, position:r.position})},
  {key:'tasks', table:'tasks', mode:'upsert-no-delete', get:() => state.tasks, to:t => ({id:t.id, title:t.title, owner:t.owner || null, due:t.due, done:!!t.done, related:t.related || ''})},
  {key:'ideas', table:'ideas', get:() => state.ideas, to:i => ({id:i.id, title:i.title, description:i.description || '', team:i.team, owner:i.owner || null, assigned:i.assigned, stage:i.stage, notes:i.notes || '', next_step:i.next || '', due:i.due || null, previous_stage:i.previousStage || null})},
  {key:'designs', table:'designs', mode:'upsert-no-delete', get:() => state.designs, to:d => ({id:d.id, title:d.title, event_id:d.event || null, campaign:d.campaign || '', brief:d.brief, deliverables:d.deliverables || '', owner:d.owner || null, due:d.due, status:d.status, previous_status:d.previousStatus || null})},
  {key:'startups', table:'startups', mode:'upsert-no-delete', get:() => state.startups, to:s => ({id:s.id, name:s.name, sector:s.sector || '', notes:s.notes || '', attendance:s.attendance, contacts:s.contacts, rating:s.rating ?? null})},
  {key:'expenses', table:'expenses', mode:'upsert-no-delete', get:() => state.budget.expenses, to:e => ({id:e.id, name:e.name, event_id:e.event || null, planned:+e.planned || 0, actual:+e.actual || 0, receipt:e.receipt || ''})},
  {key:'reimbursements', table:'reimbursements', mode:'upsert-no-delete', get:() => state.budget.reimbursements, to:r => ({id:r.id, name:r.name, member:r.member || null, event_id:r.event || null, amount:+r.amount || 0, status:r.status, receipt:r.receipt || ''})},
];

function takeSnapshot() {
  snap = {};
  for (const c of COLLECTIONS) snap[c.key] = c.single ? JSON.stringify(c.to()) : new Map(c.get().map(r => { const row = c.to(r); return [row.id, JSON.stringify(row)]; }));
}

async function buildState(userId) {
  const q = t => sb.from(t).select('*');
  const res = await Promise.all([
    q('profiles').order('name'), q('meetings'), sb.from('notifications').select('*').order('created_at', {ascending:false}).limit(100),
    q('calendar_settings').eq('id', 1).maybeSingle(), q('events').order('date'), q('event_requirements').order('position'), q('tasks'), q('ideas').order('created_at'),
    q('designs'), q('startups').order('name'), q('budget_settings').eq('id', 1).maybeSingle(), q('expenses'), q('reimbursements')]);
  const bad = res.find(r => r.error); if (bad) throw bad.error;
  const [p, m, n, cal, ev, rq, t, i, d, s, bs, ex, rb] = res.map(r => r.data);
  const members = p.map(x => ({id:x.id, name:x.name, role:x.role, team:x.team, email:x.email, responsibility:x.responsibility, is_admin:x.is_admin, active:x.active}));
  const mine = members.find(x => x.id === userId);
  if (!mine || !mine.active) return null;
  return {
    version:2, role:mine.role, meId:mine.id, members,
    meetings:m.map(x => ({id:x.id, title:x.title, date:x.date, start:t5(x.start_time), end:t5(x.end_time), location:x.location, agenda:x.agenda, mode:x.mode, teamIds:x.team_ids || [], attendees:x.attendee_ids || []})),
    notifications:n.map(x => ({id:x.id, kind:x.kind, title:x.title, details:x.details, recipients:x.recipient_ids || [], at:x.created_at, calendar:x.calendar})),
    calendar:{connected:!!cal?.connected, email:cal?.email || ''},
    events:ev.map(x => ({id:x.id, name:x.name, description:x.description, date:x.date, location:x.location, team:x.team, assigned:x.assigned || [], createdBy:x.created_by,
      tasks:rq.filter(r => r.event_id === x.id).map(r => ({id:r.id, title:r.title, owner:r.owner, due:r.due, done:r.done}))})),
    tasks:t.map(x => ({id:x.id, title:x.title, owner:x.owner, due:x.due, done:x.done, related:x.related})),
    ideas:i.map(x => ({id:x.id, title:x.title, description:x.description, team:x.team, owner:x.owner, assigned:x.assigned || [], stage:x.stage, notes:x.notes, next:x.next_step, due:x.due || '', ...(x.previous_stage ? {previousStage:x.previous_stage} : {})})),
    designs:d.map(x => ({id:x.id, title:x.title, event:x.event_id || '', campaign:x.campaign, brief:x.brief, deliverables:x.deliverables, owner:x.owner, due:x.due, status:x.status, ...(x.previous_status ? {previousStatus:x.previous_status} : {})})),
    startups:s.map(x => ({id:x.id, name:x.name, sector:x.sector, notes:x.notes, attendance:x.attendance || [], contacts:x.contacts || [], rating:x.rating == null ? null : +x.rating})),
    budget:{overall:+(bs?.overall || 0), allocations:bs?.allocations || {},
      expenses:ex.map(x => ({id:x.id, name:x.name, event:x.event_id || '', planned:+x.planned, actual:+x.actual, receipt:x.receipt})),
      reimbursements:rb.map(x => ({id:x.id, name:x.name, member:x.member, event:x.event_id || '', amount:+x.amount, status:x.status, receipt:x.receipt}))},
    adminLog:[],
  };
}

async function reloadLive() {
  const {data:{session}} = await sb.auth.getSession();
  if (!session) return showLogin();
  const next = await buildState(session.user.id);
  if (!next) return lockedOut();
  state = next; takeSnapshot();
  if (!access(view)) view = 'overview';
  render();
}

function queueSync() { syncChain = syncChain.then(liveSync).catch(e => console.error(e)); return syncChain; }
async function liveSync() {
  for (const c of COLLECTIONS) {
    if (c.single) {
      const row = c.to(), j = JSON.stringify(row);
      if (snap[c.key] !== j) { const {id, ...patch} = row; const r = await sb.from(c.table).update(patch).eq('id', id).select('id');
        if (r.error || !r.data.length) return syncFailed(r.error); snap[c.key] = j; }
      continue;
    }
    const prev = snap[c.key], seen = new Set();
    for (const rec of c.get()) {
      const row = c.to(rec), j = JSON.stringify(row); seen.add(row.id);
      if (!prev.has(row.id)) {
        if (c.mode === 'update') continue;
        const r = await sb.from(c.table).insert(row); if (r.error) return syncFailed(r.error);
      } else if (prev.get(row.id) !== j) {
        if (c.mode === 'insert') continue;
        const {id, ...patch} = row; const r = await sb.from(c.table).update(patch).eq('id', id).select('id');
        if (r.error || !r.data.length) return syncFailed(r.error);   // zero rows = row-level security said no
      }
      prev.set(row.id, j);
    }
    if (!c.mode) for (const id of [...prev.keys()]) if (!seen.has(id)) {
      const r = await sb.from(c.table).delete().eq('id', id).select('id');
      if (r.error || !r.data.length) return syncFailed(r.error); prev.delete(id);
    }
  }
}
async function syncFailed(error) {
  const msg = error?.message?.replace(/^new row violates row-level security policy.*$/i, 'you don’t have permission for that') || 'you don’t have permission for that';
  toast(`Couldn’t save — ${msg}`, 'changes undone', true);
  syncChain = Promise.resolve();
  await reloadLive();
}

/* ---- auth ---- */
function showLogin(msg = '') {
  state = null; document.body.classList.add('is-login');
  if (dlg().open) dlg().close();
  $('#login').innerHTML = `<div class="login"><div class="thermal"></div><div class="grain"></div>
    <form class="login-card" data-form="login" novalidate>
      ${BRAND}
      <div><h1>Sign in to Rocket</h1><p style="margin-top:6px">The ops hub for AUS Launchpad. We’ll email you a one-tap sign-in link — no password.</p></div>
      <div class="field"><label for="l-email">AUS email</label><input class="input" id="l-email" name="email" type="email" autocomplete="email" placeholder="g000xxxxx@aus.edu" required></div>
      <div id="l-msg" role="status">${msg}</div>
      <button class="btn btn-primary" style="justify-content:center">Email me a sign-in link</button>
      <span class="faint" style="font-size:12px">Only members an admin has invited can sign in.</span>
    </form></div>`;
}
function lockedOut() {
  sb.auth.signOut();
  showLogin('<span class="err">Your Rocket access is turned off. Ask an admin if you think that’s a mistake.</span>');
}
async function sendLoginLink(email) {
  const out = $('#l-msg');
  email = email.trim().toLowerCase();
  if (!/^[^@\s]+@aus\.edu$/.test(email)) { out.innerHTML = '<span class="err">Use your @aus.edu address.</span>'; return; }
  out.innerHTML = '<span class="faint">Sending…</span>';
  const {error} = await sb.auth.signInWithOtp({email, options:{shouldCreateUser:false, emailRedirectTo:location.origin + location.pathname}});
  if (error) { out.innerHTML = `<span class="err">${/signup|not allowed|not found/i.test(error.message) ? 'That email isn’t on Rocket yet. Ask an admin to invite you.' : esc(error.message)}</span>`; return; }
  out.innerHTML = `<div class="callout cyan">${ic('info')}<div>Check <b>${esc(email)}</b> for your sign-in link. You can close this tab.</div></div>`;
}
async function enterApp(session) {
  try {
    const next = await buildState(session.user.id);
    if (!next) return lockedOut();
    state = next; takeSnapshot();
    document.body.classList.remove('is-login'); $('#login').innerHTML = '';
    view = 'overview'; render();
  } catch (e) { showLogin(`<span class="err">Couldn’t load Rocket: ${esc(e.message)}</span>`); }
}
async function signOut() { await sb.auth.signOut(); adminData.members = null; showLogin('<span class="faint">You’re signed out.</span>'); }

async function adminApi(action, payload = {}) {
  const {data, error} = await sb.functions.invoke('admin-users', {body:{action, ...payload, redirectTo:location.origin + location.pathname}});
  if (error) { let msg = error.message; try { msg = (await error.context.json()).error || msg; } catch (e) {} throw new Error(msg); }
  return data;
}

async function liveBoot() {
  if (!window.supabase) { document.body.innerHTML = '<p style="padding:24px;color:#F5F4F7;background:#0A0A0C">Couldn’t load the Supabase library. Check your connection and reload.</p>'; return; }
  sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey);
  let entered = false;
  sb.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') { entered = false; if (state) showLogin('<span class="faint">Your session ended. Sign in again.</span>'); return; }
    if (session && !entered && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) { entered = true; setTimeout(() => enterApp(session)); }
    if (!session && event === 'INITIAL_SESSION') showLogin();
  });
  // Pick up other members' changes when you come back to the tab.
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && state && !dlg().open) reloadLive().catch(() => {}); });
}
