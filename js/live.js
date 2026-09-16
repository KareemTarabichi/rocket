
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
  {key:'profiles', table:'profiles', mode:'update', get:() => state.members, to:m => ({id:m.id, responsibility:m.responsibility, whatsapp:m.whatsapp || ''})},
  {key:'budget', table:'budget_settings', single:true, to:() => ({id:1, overall:+state.budget.overall || 0, allocations:state.budget.allocations})},
  {key:'meetings', table:'meetings', get:() => state.meetings, to:m => ({id:m.id, title:m.title, date:m.date, start_time:m.start, end_time:m.end, location:m.location, agenda:m.agenda, mode:m.mode, team_ids:m.teamIds, attendee_ids:m.attendees})},
  {key:'notifications', table:'notifications', mode:'insert', get:() => state.notifications, to:n => ({id:n.id, kind:n.kind, title:n.title, details:n.details, recipient_ids:n.recipients, calendar:!!n.calendar})},
  {key:'events', table:'events', mode:'upsert-no-delete', get:() => state.events, to:e => ({id:e.id, name:e.name, description:e.description, date:e.date, location:e.location, team:e.team, assigned:e.assigned, created_by:e.createdBy || null})},
  {key:'requirements', table:'event_requirements', get:() => state.events.flatMap(e => e.tasks.map((r, i) => ({...r, eventId:e.id, position:i}))), to:r => ({id:r.id, event_id:r.eventId, title:r.title, owner:r.owner || null, due:r.due, done:!!r.done, position:r.position})},
  {key:'tasks', table:'tasks', mode:'upsert-no-delete', get:() => state.tasks, to:t => ({id:t.id, title:t.title, owner:t.owner || null, due:t.due, done:!!t.done, related:t.related || '', created_by:t.createdBy || null})},
  {key:'ideas', table:'ideas', get:() => state.ideas, to:i => ({id:i.id, title:i.title, description:i.description || '', team:i.team, owner:i.owner || null, assigned:i.assigned, stage:i.stage, notes:i.notes || '', next_step:i.next || '', due:i.due || null, previous_stage:i.previousStage || null})},
  {key:'ideaComments', table:'idea_comments', get:() => state.ideaComments, to:c => ({id:c.id, idea_id:c.ideaId, author:c.author || null, title:c.title || '', body:c.body})},
  {key:'designs', table:'designs', mode:'upsert-no-delete', get:() => state.designs, to:d => ({id:d.id, title:d.title, event_id:d.event || null, campaign:d.campaign || '', brief:d.brief, deliverables:d.deliverables || '', owner:d.owner || null, due:d.due, status:d.status, previous_status:d.previousStatus || null})},
  {key:'startups', table:'startups', get:() => state.startups, to:s => ({id:s.id, name:s.name, sector:s.sector || '', website:s.website || '', notes:s.notes || '', attendance:s.attendance, contacts:s.contacts, rating:s.rating ?? null,
    deletion_requested_by:s.deletion?.by || null, deletion_requested_at:s.deletion?.at || null, deletion_reason:s.deletion?.reason || ''})},
  {key:'schedules', table:'class_schedules', get:() => state.schedules || [], to:r => ({id:r.id, member:r.member, title:r.title, day_of_week:r.day_of_week, start_time:r.start_time, end_time:r.end_time,
    location:r.location || '', term_start:r.term_start || null, term_end:r.term_end || null, created_by:r.created_by || null})},
  {key:'settings', table:'app_settings', single:true, to:() => ({id:1, design_drive_url:state.settings.designDriveUrl || '', links:state.settings.links || {}, section_access:state.settings.sectionAccess || null})},
  {key:'kb', table:'kb_articles', get:() => state.kb, to:a => ({id:a.id, title:a.title, category:a.category, roles:a.roles, summary:a.summary || '', body:a.body, updated_by:a.updatedBy || null, updated_at:a.updatedAt})},
  {key:'expenses', table:'expenses', mode:'upsert-no-delete', get:() => state.budget.expenses, to:e => ({id:e.id, name:e.name, event_id:e.event || null, planned:+e.planned || 0, actual:+e.actual || 0, receipt:e.receipt || ''})},
  {key:'reimbursements', table:'reimbursements', mode:'upsert-no-delete', get:() => state.budget.reimbursements, to:r => ({id:r.id, name:r.name, member:r.member || null, event_id:r.event || null, amount:+r.amount || 0, status:r.status, receipt:r.receipt || ''})},
];

function takeSnapshot() {
  snap = {};
  for (const c of COLLECTIONS) snap[c.key] = c.single ? JSON.stringify(c.to()) : new Map(c.get().map(r => { const row = c.to(r); return [row.id, JSON.stringify(row)]; }));
}

async function buildState(userId) {
  const q = t => sb.from(t).select('*');
  const ventureP = loadVenture().catch(e => ({error:e.message}));   // loads separately: a missing programme never blocks Rocket
  const schedP = sb.from('class_schedules').select('*').then(r => r.error ? [] : r.data.map(x => ({...x, start_time:t5(x.start_time), end_time:t5(x.end_time)}))).catch(() => []);
  const res = await Promise.all([
    q('profiles').order('name'), q('meetings'), sb.from('notifications').select('*').order('created_at', {ascending:false}).limit(100),
    q('calendar_settings').eq('id', 1).maybeSingle(), q('events').order('date'), q('event_requirements').order('position'), q('tasks'), q('ideas').order('created_at'),
    q('designs'), q('startups').order('name'), q('budget_settings').eq('id', 1).maybeSingle(), q('expenses'), q('reimbursements'),
    q('kb_articles').order('title'), q('app_settings').eq('id', 1).maybeSingle(), q('idea_comments').order('created_at'), q('notes').order('updated_at', {ascending:false})]);
  const bad = res.find(r => r.error); if (bad) throw bad.error;
  const [p, m, n, cal, ev, rq, t, i, d, s, bs, ex, rb, kb, st, ic, nt] = res.map(r => r.data);
  const members = p.map(x => ({id:x.id, name:x.name, role:x.role, team:x.team, email:x.email, responsibility:x.responsibility, is_admin:x.is_admin, active:x.active, whatsapp:x.whatsapp || ''}));
  const mine = members.find(x => x.id === userId);
  if (!mine || !mine.active) return null;
  return {
    version:2, role:mine.role, meId:mine.id, members,
    meetings:m.map(x => ({id:x.id, title:x.title, date:x.date, start:t5(x.start_time), end:t5(x.end_time), location:x.location, agenda:x.agenda, mode:x.mode, teamIds:x.team_ids || [], attendees:x.attendee_ids || [], onCalendar:!!x.google_event_id})),
    notifications:n.map(x => ({id:x.id, kind:x.kind, title:x.title, details:x.details, recipients:x.recipient_ids || [], at:x.created_at, calendar:x.calendar})),
    calendar:{connected:!!cal?.connected, email:cal?.email || '', connectedAt:cal?.connected_at || null},
    events:ev.map(x => ({id:x.id, name:x.name, description:x.description, date:x.date, location:x.location, team:x.team, assigned:x.assigned || [], createdBy:x.created_by,
      tasks:rq.filter(r => r.event_id === x.id).map(r => ({id:r.id, title:r.title, owner:r.owner, due:r.due, done:r.done}))})),
    tasks:t.map(x => ({id:x.id, title:x.title, owner:x.owner, due:x.due, done:x.done, related:x.related, createdBy:x.created_by})),
    ideas:i.map(x => ({id:x.id, title:x.title, description:x.description, team:x.team, owner:x.owner, assigned:x.assigned || [], stage:x.stage, notes:x.notes, next:x.next_step, due:x.due || '', ...(x.previous_stage ? {previousStage:x.previous_stage} : {})})),
    designs:d.map(x => ({id:x.id, title:x.title, event:x.event_id || '', campaign:x.campaign, brief:x.brief, deliverables:x.deliverables, owner:x.owner, due:x.due, status:x.status, ...(x.previous_status ? {previousStatus:x.previous_status} : {})})),
    startups:s.map(x => ({id:x.id, name:x.name, sector:x.sector, website:x.website || '', notes:x.notes, attendance:x.attendance || [], contacts:x.contacts || [], rating:x.rating == null ? null : +x.rating,
      deletion:x.deletion_requested_at ? {by:x.deletion_requested_by, at:x.deletion_requested_at, reason:x.deletion_reason || ''} : null})),
    kb:kb.map(x => ({id:x.id, title:x.title, category:x.category, roles:x.roles || [], summary:x.summary, body:x.body, updatedBy:x.updated_by, updatedAt:x.updated_at})),
    settings:{designDriveUrl:st?.design_drive_url || '', links:st?.links || {}, sectionAccess:st?.section_access || null},
    notes:(nt || []).map(normNote),
    schedules:await schedP,
    ideaComments:(ic || []).map(x => ({id:x.id, ideaId:x.idea_id, author:x.author, title:x.title, body:x.body, at:x.created_at})),
    budget:{overall:+(bs?.overall || 0), allocations:bs?.allocations || {},
      expenses:ex.map(x => ({id:x.id, name:x.name, event:x.event_id || '', planned:+x.planned, actual:+x.actual, receipt:x.receipt})),
      reimbursements:rb.map(x => ({id:x.id, name:x.name, member:x.member, event:x.event_id || '', amount:+x.amount, status:x.status, receipt:x.receipt}))},
    adminLog:[],
    venture:await ventureP,
  };
}

async function reloadLive() {
  if (typeof noteUI !== 'undefined' && noteUI.dirty) await saveNote();   // save the open note first
  const {data:{session}} = await sb.auth.getSession();
  if (!session) return showLogin();
  const next = await buildState(session.user.id);
  if (!next) return lockedOut();
  state = next; ensureLinks(); takeSnapshot();
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
// Sign-in: email + password everywhere. First-timers, and anyone who forgot their password, get a
// one-time 6-digit code by email instead of a link: email security scanners (e.g. Microsoft 365's
// Safe Links at AUS) open links to check them, which uses up a one-time link before the member taps it.
// A code also works inside the home-screen app, which can't receive links.
function showLogin(msg = '', email = '') {
  state = null; document.body.classList.add('is-login');
  if (dlg().open) dlg().close();
  $('#login').innerHTML = `<div class="login"><div class="thermal"></div><div class="grain"></div>
    <form class="login-card" data-form="login" novalidate>
      ${BRAND}
      <div><h1>Sign in to Rocket</h1><p style="margin-top:6px">The ops hub for AUS Launchpad.</p></div>
      <div class="field"><label for="l-email">AUS email</label><input class="input" id="l-email" name="email" type="email" autocomplete="username" inputmode="email" placeholder="g000xxxxx@aus.edu" value="${esc(email)}" required></div>
      <div class="field"><label for="l-pass">Password</label><input class="input" id="l-pass" name="password" type="password" autocomplete="current-password" required></div>
      <div id="l-msg" role="status">${msg}</div>
      <button class="btn btn-primary" style="justify-content:center">Sign in</button>
      <div class="login-alt">
        <span>First time here, or forgot your password?</span>
        ${CFG.emailCodes ? `<button type="button" class="btn" data-act="login-code" style="justify-content:center">Email me a sign-in code</button>
        <span class="faint" style="font-size:12px">We’ll email you a 6-digit code. Enter it here, then set a password.</span>`
        : '<span class="faint" style="font-size:12.5px;line-height:1.5">Ask a Rocket admin for a temporary password. You’ll choose your own as soon as you sign in.</span>'}
      </div>
    </form></div>`;
}
function lockedOut() {
  sb.auth.signOut();
  showLogin('<span class="err">Your Rocket access is turned off. Ask an admin if you think that’s a mistake.</span>');
}
const loginEmail = () => ($('#l-email')?.value || '').trim().toLowerCase();
async function passwordSignIn(email, password) {
  const out = $('#l-msg');
  email = email.trim().toLowerCase();
  if (!/^[^@\s]+@aus\.edu$/.test(email)) { out.innerHTML = '<span class="err">Use your @aus.edu address.</span>'; return; }
  if (!password) { out.innerHTML = `<span class="err">Enter your password${CFG.emailCodes ? ' — or tap “Email me a sign-in code” if you haven’t set one yet' : ''}.</span>`; return; }
  out.innerHTML = '<span class="faint">Signing in…</span>';
  const {error} = await sb.auth.signInWithPassword({email, password});
  if (error) out.innerHTML = `<span class="err">${/invalid|credentials/i.test(error.message) ? (CFG.emailCodes ? 'Wrong email or password. If you haven’t set a password yet, tap “Email me a sign-in code”.' : 'Wrong email or password. First time, or forgot it? Ask a Rocket admin for a temporary password.') : esc(error.message)}</span>`;
  // success is picked up by onAuthStateChange → enterApp
}
async function sendLoginCode(email) {
  const out = $('#l-msg');
  email = (email || '').trim().toLowerCase();
  if (!/^[^@\s]+@aus\.edu$/.test(email)) { out.innerHTML = '<span class="err">Type your @aus.edu address above first.</span>'; $('#l-email')?.focus(); return; }
  out.innerHTML = '<span class="faint">Sending…</span>';
  const {error} = await sb.auth.signInWithOtp({email, options:{shouldCreateUser:false, emailRedirectTo:location.origin + '/'}});
  if (error) { out.innerHTML = `<span class="err">${/signup|not allowed|not found/i.test(error.message) ? 'That email isn’t on Rocket yet. Ask an admin to invite you.' : /rate limit|seconds/i.test(error.message) ? 'A code was sent very recently. Wait a minute, then try again.' : esc(error.message)}</span>`; return; }
  showCodeEntry(email);
}
function showCodeEntry(email, msg = '') {
  document.body.classList.add('is-login');
  $('#login').innerHTML = `<div class="login"><div class="thermal"></div><div class="grain"></div>
    <form class="login-card" data-form="login-code" data-email="${esc(email)}" novalidate>
      ${BRAND}
      <div><h1>Check your email</h1><p style="margin-top:6px">We sent a sign-in code to <b>${esc(email)}</b>. It can take a minute to arrive — check Junk too.</p></div>
      <div class="field"><label for="l-code">Sign-in code</label><input class="input mono" id="l-code" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]*" maxlength="10" placeholder="123456" style="font-size:22px;letter-spacing:.2em;height:52px;text-align:center" required></div>
      <div id="l-msg" role="status">${msg}</div>
      <button class="btn btn-primary" style="justify-content:center">Sign in</button>
      <div class="login-alt" style="flex-direction:row;justify-content:space-between;align-items:center">
        <button type="button" class="linkbtn" data-act="login-back">← Use a password instead</button>
        <button type="button" class="linkbtn" data-act="login-resend" data-email="${esc(email)}">Send a new code</button>
      </div>
    </form></div>`;
  setTimeout(() => $('#l-code')?.focus());
}
async function verifyLoginCode(email, code) {
  const out = $('#l-msg');
  code = (code || '').replace(/\D/g, '');
  if (code.length < 6) { out.innerHTML = '<span class="err">Enter the code from the email.</span>'; return; }
  out.innerHTML = '<span class="faint">Checking…</span>';
  const {error} = await sb.auth.verifyOtp({email, token:code, type:'email'});
  if (error) out.innerHTML = `<span class="err">${/expired|invalid/i.test(error.message) ? 'That code is wrong or has expired. Check the latest email, or send a new code.' : esc(error.message)}</span>`;
  // success → onAuthStateChange → enterApp → set a password
}
// A link that fails (already used, expired) comes back with the reason in the address; say so instead of silently showing the login page.
function linkErrorFromUrl() {
  const h = new URLSearchParams(location.hash.slice(1)), q = new URLSearchParams(location.search);
  const code = h.get('error_code') || q.get('error_code'), desc = h.get('error_description') || q.get('error_description');
  if (!code && !desc) return '';
  history.replaceState(null, '', location.pathname);
  return /expired|invalid|otp/i.test(`${code} ${desc}`)
    ? '<span class="err">That sign-in link had already been used or expired — AUS email opens links to scan them. Sign in with your password, or ask a Rocket admin for a temporary one.</span>'
    : `<span class="err">Sign-in didn’t work: ${esc((desc || code).replace(/\+/g, ' '))}</span>`;
}

// Shown after a code (or link) sign-in until the member has a password.
function showSetPassword(msg = '') {
  document.body.classList.add('is-login');
  $('#login').innerHTML = `<div class="login"><div class="thermal"></div><div class="grain"></div>
    <form class="login-card" data-form="set-password" novalidate>
      ${BRAND}
      <div><h1>Set your password</h1><p style="margin-top:6px">You’re signed in as <b>${esc(me().email)}</b>. Choose your own password — the temporary one stops working. Use it to sign in from now on, including in the Rocket app on your phone’s home screen.</p></div>
      <input type="email" name="username" value="${esc(me().email)}" autocomplete="username" hidden>
      <div class="field"><label for="p-new">New password</label><input class="input" id="p-new" name="password" type="password" autocomplete="new-password" minlength="8" required></div>
      <div class="field"><label for="p-again">Type it again</label><input class="input" id="p-again" name="again" type="password" autocomplete="new-password" minlength="8" required></div>
      <span class="faint" style="font-size:12px">At least 8 characters. Your browser or password manager can suggest a strong one.</span>
      <div id="p-msg" role="status">${msg}</div>
      <button class="btn btn-primary" style="justify-content:center">Save password and continue</button>
    </form></div>`;
  setTimeout(() => $('#p-new')?.focus());
}
async function savePassword(password, again, out) {
  if (password.length < 8) { out.innerHTML = '<span class="err">Use at least 8 characters.</span>'; return false; }
  if (password !== again) { out.innerHTML = '<span class="err">The two passwords don’t match.</span>'; return false; }
  out.innerHTML = '<span class="faint">Saving…</span>';
  const {error} = await sb.auth.updateUser({password, data:{password_set:true}});
  if (error) { out.innerHTML = `<span class="err">${/different/i.test(error.message) ? 'That’s your current password — pick a new one.'
    : /weak|short|characters/i.test(error.message) ? 'That password is too weak. Try a longer one.'
    : /reauth|recent/i.test(error.message) ? 'For security, sign out and sign back in, then change your password.'
    : esc(error.message)}</span>`; return false; }
  return true;
}
function openApp() {
  document.body.classList.remove('is-login'); $('#login').innerHTML = '';
  view = 'overview'; render();
  handleLaunchParams(); maybeShowWelcome(); startNotesRealtime();
}
async function enterApp(session) {
  try {
    const next = await buildState(session.user.id);
    if (!next) return lockedOut();
    state = next; ensureLinks(); takeSnapshot();
    if (!session.user.user_metadata?.password_set) return showSetPassword();
    openApp();
  } catch (e) { showLogin(`<span class="err">Couldn’t load Rocket: ${esc(e.message)}</span>`); }
}
async function signOut() { flushNote(); try { sb.removeAllChannels(); } catch (e) {} noteUI.listChan = noteUI.chan = null; noteUI.open = null; await disablePush(true); await sb.auth.signOut(); closeWelcome(false); adminData.members = null; showLogin('<span class="faint">You’re signed out.</span>'); }

// Knowledge-base images go to the public "kb-images" storage bucket; only admins can upload.
async function uploadKbImage(file) {
  const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '');
  const path = `${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${ext}`;
  const {error} = await sb.storage.from('kb-images').upload(path, file, {contentType:file.type, upsert:false});
  if (error) throw error;
  return sb.storage.from('kb-images').getPublicUrl(path).data.publicUrl;
}
// Calls one of Rocket's Edge Functions as the signed-in member and surfaces its error message.
async function fnApi(fn, action, payload = {}) {
  const {data, error} = await sb.functions.invoke(fn, {body:{action, ...payload, redirectTo:location.origin + location.pathname}});
  if (error) { let msg = error.message, body = null; try { body = await error.context.json(); msg = body.error || msg; } catch (e) {}
    if (error.context?.status === 404 && !body?.error) msg = 'NOT_DEPLOYED: this server function isn’t deployed yet';
    throw new Error(msg); }
  return data;
}
const adminApi = (action, payload) => fnApi('admin-users', action, payload);
const calendarApi = (action, payload) => fnApi('google-calendar', action, payload);
// Runs fn once the pending database writes have finished (live mode only).
function afterSync(fn) { if (!LIVE) return; syncChain = syncChain.then(fn).catch(e => console.warn(e)); }

async function liveBoot() {
  if (!window.supabase) { document.body.innerHTML = '<p style="padding:24px;color:#F5F4F7;background:#0A0A0C">Couldn’t load the Supabase library. Check your connection and reload.</p>'; return; }
  sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey);
  let entered = false;
  sb.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') { entered = false; if (state) showLogin('<span class="faint">Your session ended. Sign in again.</span>'); return; }
    if (session && !entered && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) { entered = true; setTimeout(() => enterApp(session)); }
    if (!session && event === 'INITIAL_SESSION') showLogin(linkErrorFromUrl());
  });
  registerSW();
  // Pick up other members' changes when you come back to the tab.
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && state && !dlg().open && !noteUI.dirty) reloadLive().catch(() => {}); });
}
