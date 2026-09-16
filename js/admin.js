
/* ================= Admin: members, roles, teams and logins =================
   Admin is a platform permission layered on a club role (e.g. Tech + Admin).
   It never changes club permissions — only the Executive Assistant manages meetings.
   Live mode calls the admin-users Edge Function; demo mode simulates the same rules locally. */

const adminData = {members:null, log:[], loading:false, error:''};

const memberStatus = m => m.active === false ? 'disabled' : !m.last_sign_in_at ? 'invited' : 'active';
const STATUS_PILL = {active:['s-done','Active'], invited:['s-not_started','Invited — not signed in yet'], disabled:['s-blocked','Login disabled']};
const activeAdmins = list => list.filter(m => m.is_admin && m.active !== false).length;

async function loadAdmin(force) {
  if (!LIVE) { adminData.members = state.members; adminData.log = state.adminLog; return; }
  if (adminData.loading || (adminData.members && !force)) return;
  adminData.loading = true; adminData.error = '';
  try { const r = await adminApi('list'); adminData.members = r.members; adminData.log = r.log; }
  catch (e) { adminData.error = e.message; }
  adminData.loading = false;
  if (view === 'admin') render();
}

let adminTab = 'members';
const adminTabs = () => `<div class="tabs" role="tablist">${[['members', 'Members'], ['links', 'Links'], ['permissions', 'Permissions']].map(([v, l]) => `<button role="tab" data-act="admin-tab" data-v="${v}" aria-selected="${adminTab === v}">${l}</button>`).join('')}</div>`;
function vAdmin() {
  if (!isAdmin()) return '<div class="page"><div class="panel empty">Only admins can open this section.</div></div>';
  if (adminTab === 'links') return vAdminLinks();
  if (adminTab === 'permissions') return vAdminPermissions();
  if (!LIVE) loadAdmin();
  else if (!adminData.members && !adminData.loading && !adminData.error) loadAdmin();
  const list = adminData.members;
  const head = heading('Admin', 'Manage who can sign in to Rocket, their club role, team and admin rights. Admin doesn’t change club permissions — only the Executive Assistant runs meetings.',
    `${LIVE ? `<button class="btn" data-act="admin-refresh">Refresh</button>` : ''}<button class="btn btn-primary" data-act="admin-invite">${ic('plus')}Invite member</button>`);
  if (adminData.error) return `<div class="page">${head}<div class="banner">${ic('info')}${esc(adminData.error)}</div><div><button class="btn" data-act="admin-refresh">Try again</button></div></div>`;
  if (!list) return `<div class="page">${head}<div class="panel empty">Loading members…</div></div>`;
  const counts = {active:0, invited:0, disabled:0}; list.forEach(m => counts[memberStatus(m)]++);
  const actor = id => (list.find(m => m.id === id) || member(id))?.name || 'Someone';
  const rows = [...list].sort((a, b) => ({invited:0, disabled:1, active:2}[memberStatus(a)] - {invited:0, disabled:1, active:2}[memberStatus(b)]) || a.name.localeCompare(b.name));
  const lastSeen = m => m.last_sign_in_at ? fmtStamp(m.last_sign_in_at) : m.invited_at ? `Invited ${fmtStamp(m.invited_at)}` : '—';
  return `<div class="page">
    ${head}${adminTabs()}
    ${LIVE ? '' : readonlyNote('Demo: admin actions are simulated here. In the live app they go through a server-side admin API; no emails are sent from this demo.')}
    <div class="sum-cards">
      <div class="sum-card" style="cursor:default"><span class="v">${list.length}</span><span class="l">Members</span></div>
      <div class="sum-card" style="cursor:default"><span class="v">${counts.active}</span><span class="l">Active</span></div>
      <div class="sum-card ${counts.invited ? 'alert' : ''}" style="cursor:default"><span class="v" style="${counts.invited ? 'color:var(--amber)' : ''}">${counts.invited}</span><span class="l">Invited, not signed in</span></div>
      <div class="sum-card" style="cursor:default"><span class="v">${activeAdmins(list)}</span><span class="l">Admins</span><span class="s">${counts.disabled} disabled login${counts.disabled === 1 ? '' : 's'}</span></div>
    </div>
    ${isM() ? `<ul class="m-rows">${rows.map(m => { const [c, l] = STATUS_PILL[memberStatus(m)]; return `<li data-act="admin-edit" data-id="${m.id}"><div class="top"><span class="who">${avatar(m.id)}<b>${esc(m.name)}</b></span><span class="pill ${c}">${esc(l.split(' —')[0])}</span></div>
        <div class="sub"><span>${esc(roleLabel(m.role))}</span><span class="faint">·</span><span>${esc(teamName(m.team))}</span>${m.is_admin ? '<span class="tag for-you">Admin</span>' : ''}</div><div class="sub mono" style="font-size:12px">${esc(m.email)}</div></li>`; }).join('')}</ul>`
    : `<div class="table-wrap"><table><thead><tr><th>Member</th><th>Club role</th><th>Team</th><th>Access</th><th>Login</th><th>Last sign-in</th></tr></thead><tbody>${rows.map(m => { const [c, l] = STATUS_PILL[memberStatus(m)];
      return `<tr data-act="admin-edit" data-id="${m.id}"><td><div class="who">${avatar(m.id)}<span><span class="name">${esc(m.name)}</span>${m.id === me().id ? ' <span class="faint">(you)</span>' : ''}</span></div><div class="mono faint" style="font-size:12px;margin-top:2px">${esc(m.email)}</div></td>
        <td style="white-space:nowrap">${esc(roleLabel(m.role))}</td><td>${esc(teamName(m.team))}</td><td>${m.is_admin ? '<span class="tag for-you">Admin</span>' : '<span class="faint">Member</span>'}</td>
        <td><span class="pill ${c}">${esc(l)}</span></td><td class="num muted" style="font-size:12.5px;white-space:nowrap">${lastSeen(m)}</td></tr>`; }).join('')}</tbody></table></div>`}
    <section class="panel"><div class="panel-head"><h2>Admin activity</h2><span class="faint" style="font-size:12.5px">Latest ${Math.min(adminData.log.length, 50)}</span></div>
      <div>${adminData.log.slice(0, 50).map(l => `<div class="notif ${l.action === 'remove' || l.action === 'disable' ? 'cancel' : ''}"><span class="k">${esc(actor(l.actor))} · ${esc(ADMIN_ACTION[l.action] || l.action)} ${esc(l.target_email)}</span><time>${fmtStamp(l.created_at)}</time>${l.details ? `<span class="d">${esc(l.details)}</span>` : ''}</div>`).join('') || '<div class="empty">No admin actions yet.</div>'}</div></section>
  </div>`;
}
const ADMIN_ACTION = {invite:'invited', update:'updated', disable:'disabled the login of', enable:'re-enabled the login of', resend:'sent a sign-in code to', 'reset-password':'reset the password of', remove:'removed'};

function openAdminInvite() {
  if (!isAdmin()) return;
  openDialog(`<form data-form="admin-invite" novalidate>${dHead('Invite a member', 'Rocket creates their account with a temporary password for you to send them. They choose their own at first sign-in. Only @aus.edu addresses.')}
    <div class="dlg-body">
      ${field('Full name', inp('name', '', 'required autocomplete="off"'), 'f-name')}
      ${field('AUS email', inp('email', '', 'type="email" required placeholder="g000xxxxx@aus.edu" autocomplete="off"'), 'f-email')}
      <div class="grid2">${field('Club role', `<select class="input" id="f-role" name="role">${ROLES.map(r => opt(r.id, r.label, 'innovation')).join('')}</select>`, 'f-role')}${field('Team', `<select class="input" id="f-team" name="team">${teamOpts('innovation')}</select>`, 'f-team')}</div>
      <label class="cbox"><input type="checkbox" name="is_admin">Also make them an admin <span class="faint">— can add, edit and remove members</span></label>
      <span class="err" id="aerr" role="alert"></span>
    </div>${foot('<button class="btn btn-primary">Send invite</button>')}</form>`, 'narrow');
}
function openAdminEdit(id) {
  const list = adminData.members || state.members, m = list.find(x => x.id === id);
  if (!m || !isAdmin()) return;
  const st = memberStatus(m), self = m.id === me().id, lastAdmin = m.is_admin && m.active !== false && activeAdmins(list) <= 1;
  openDialog(`<form data-form="admin-edit" data-id="${m.id}" novalidate>${dHead(m.name, `<span class="mono">${esc(m.email)}</span>`, `<span class="pill ${STATUS_PILL[st][0]}">${STATUS_PILL[st][1]}</span>${m.is_admin ? '<span class="tag for-you">Admin</span>' : ''}`)}
    <div class="dlg-body">
      <div class="grid2">${field('Full name', inp('name', m.name, 'required'), 'f-name')}${field('WhatsApp number', inp('whatsapp', m.whatsapp || '', 'type="tel" inputmode="tel" placeholder="+971 50 123 4567"'), 'f-whatsapp')}</div>
      <div class="grid2">${field('Club role', `<select class="input" id="f-role" name="role">${ROLES.map(r => opt(r.id, r.label, m.role)).join('')}</select>`, 'f-role')}${field('Team', `<select class="input" id="f-team" name="team">${teamOpts(m.team)}</select>`, 'f-team')}</div>
      <label class="cbox"><input type="checkbox" name="is_admin" ${m.is_admin ? 'checked' : ''} ${lastAdmin ? 'disabled' : ''}>Admin</label>
      ${lastAdmin ? '<span class="muted-note">This is the only admin, so admin rights can’t be removed. Make someone else an admin first.</span>' : ''}
      <div class="sect"><span class="eyebrow">Login</span>
        <dl class="kv"><dt>Last sign-in</dt><dd class="num">${m.last_sign_in_at ? fmtStamp(m.last_sign_in_at) : 'Never'}</dd>${m.invited_at ? `<dt>Invited</dt><dd class="num">${fmtStamp(m.invited_at)}</dd>` : ''}</dl>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${st === 'disabled' ? `<button type="button" class="btn sm" data-act="admin-enable" data-id="${m.id}">Enable login</button>`
            : `<button type="button" class="btn sm" data-act="admin-disable" data-id="${m.id}" ${self || lastAdmin ? `disabled title="${self ? 'You can’t disable your own login' : 'Rocket needs at least one active admin'}"` : ''}>Disable login</button>`}
          ${st !== 'disabled' ? `<button type="button" class="btn sm" data-act="admin-reset" data-id="${m.id}" ${self ? 'disabled title="Use Change password for your own account"' : ''}>Reset password</button>` : ''}
        </div>
        <span class="muted-note">Disabling blocks sign-in and all data access straight away; their records stay. New members sign in with the temporary password you send them, then choose their own. If someone forgets theirs, reset it and send them the new temporary one.</span></div>
      <span class="err" id="aerr" role="alert"></span>
    </div>
    ${foot('<button class="btn btn-primary">Save changes</button>', `<button type="button" class="btn btn-del" data-act="admin-remove" data-id="${m.id}" ${self || lastAdmin ? 'disabled' : ''}>${ic('trash')}Remove member</button>`)}</form>`, 'narrow');
}

/* ---- demo-mode implementations of the admin API ---- */
function demoAdmin(action, p) {
  const list = state.members, t = p.id ? list.find(m => m.id === p.id) : null, logIt = (a, email, details = '') => state.adminLog.unshift({id:Date.now(), actor:me().id, action:a, target_email:email, details, created_at:new Date().toISOString()});
  if (p.id && !t) throw new Error('That member no longer exists.');
  switch (action) {
    case 'invite': {
      const email = String(p.email).trim().toLowerCase();
      if (!/^[^@\s]+@aus\.edu$/.test(email)) throw new Error('Use an @aus.edu email address.');
      if (!p.name.trim()) throw new Error('Add the member’s name.');
      if (list.some(m => m.email.toLowerCase() === email)) throw new Error('Someone with that email is already on Rocket.');
      list.push({id:uid('m'), name:p.name.trim(), email, role:p.role, team:p.team, responsibility:'', is_admin:!!p.is_admin, active:true, last_sign_in_at:null, invited_at:new Date().toISOString()});
      logIt('invite', email, `${p.role} · ${p.team}${p.is_admin ? ' · admin' : ''}`); save(); return {ok:true, tempPassword:demoTempPassword()};
    }
    case 'reset-password':
      if (t.id === me().id) throw new Error('Use “Change password” for your own account.');
      logIt('reset-password', t.email); save(); return {ok:true, tempPassword:demoTempPassword()};
    case 'update': {
      if (t.is_admin && !p.is_admin && t.active !== false && activeAdmins(list) <= 1) throw new Error('Rocket needs at least one admin. Make someone else an admin first.');
      const changes = ['name', 'role', 'team', 'is_admin'].filter(k => p[k] !== t[k]).map(k => `${k}: ${t[k]} → ${p[k]}`).join(', ');
      Object.assign(t, {name:p.name.trim() || t.name, role:p.role, team:p.team, is_admin:!!p.is_admin});   // WhatsApp number is saved separately
      if (t.id === state.meId) state.role = t.role;
      logIt('update', t.email, changes || 'no changes'); break;
    }
    case 'disable':
      if (t.id === me().id) throw new Error('You can’t disable your own login.');
      if (t.is_admin && activeAdmins(list) <= 1) throw new Error('Rocket needs at least one active admin.');
      t.active = false; logIt('disable', t.email); break;
    case 'enable': t.active = true; logIt('enable', t.email); break;
    case 'resend': logIt('resend', t.email); break;
    case 'remove': {
      if (t.id === me().id) throw new Error('You can’t remove yourself.');
      if (t.is_admin && t.active !== false && activeAdmins(list) <= 1) throw new Error('Rocket needs at least one admin.');
      const id = t.id, clear = v => v === id ? null : v, drop = a => a.filter(x => x !== id);
      state.meetings.forEach(m => m.attendees = drop(m.attendees));
      state.events.forEach(e => { e.assigned = drop(e.assigned); e.createdBy = clear(e.createdBy); e.tasks.forEach(r => r.owner = clear(r.owner)); });
      state.ideas.forEach(i => { i.assigned = drop(i.assigned); i.owner = clear(i.owner); });
      state.tasks.forEach(x => x.owner = clear(x.owner)); state.designs.forEach(d => d.owner = clear(d.owner));
      state.budget.reimbursements.forEach(r => r.member = clear(r.member)); state.notifications.forEach(n => n.recipients = drop(n.recipients));
      state.members = list.filter(m => m.id !== id); adminData.members = state.members;
      logIt('remove', t.email, `${t.name} · ${t.role}`); break;
    }
  }
  save();
  return {ok:true};
}
async function runAdmin(action, payload, okMsg, sub) {
  try {
    let res;
    if (LIVE) { res = await adminApi(action, payload); await Promise.all([loadAdmin(true), reloadLive()]); }
    else res = demoAdmin(action, payload);
    render();
    if (res?.tempPassword) { const m = (adminData.members || state.members).find(x => x.id === payload.id || x.email === String(payload.email || '').toLowerCase());
      showCredentials(m?.name || payload.name, m?.email || payload.email, res.tempPassword, action === 'invite'); }
    else closeDialog();
    toast(okMsg, sub); return true;
  } catch (e) {
    const err = $('#aerr'); if (err && dlg().open) err.textContent = e.message; else toast(e.message, '', true);
    return false;
  }
}

// Temporary passwords: shown once to the admin, with an easy way to send them.
function demoTempPassword() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789', b = crypto.getRandomValues(new Uint8Array(12));
  const c = [...b].map(x => abc[x % abc.length]).join(''); return `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8)}`;
}
function showCredentials(name, email, temp, isNew) {
  const first = String(name || '').split(' ')[0] || 'there', site = location.origin.startsWith('http') && !location.origin.includes('claude') ? location.origin : 'https://userocket.vercel.app';
  const msg = `Hi ${first}! ${isNew ? 'You’re on Rocket, the AUS Launchpad ops app.' : 'Your Rocket password was reset.'}\n\nSign in at ${site}\nEmail: ${email}\nTemporary password: ${temp}\n\nYou’ll choose your own password right after signing in. On your phone, add Rocket to your home screen (Safari → Share → Add to Home Screen) and sign in there.`;
  openDialog(`${dHead(isNew ? `${name} is on Rocket` : `New temporary password for ${name}`, 'Send them these details. The password is shown only once — Rocket doesn’t store it.')}
    <div class="dlg-body">
      <dl class="kv"><dt>Email</dt><dd class="mono">${esc(email)}</dd><dt>Temporary password</dt><dd><span class="mono" style="font-size:20px;letter-spacing:.06em;color:var(--amber)">${esc(temp)}</span>
        <button type="button" class="btn sm btn-ghost" data-act="copy-text" data-v="${esc(temp)}" style="margin-left:6px">Copy</button></dd></dl>
      <div class="field"><label for="cred-msg">Message to send</label><textarea class="input" id="cred-msg" rows="7" readonly>${esc(msg)}</textarea></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn btn-primary" data-act="copy-text" data-v="${esc(msg)}">Copy message</button>
        <a class="btn btn-wa" href="https://wa.me/?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener noreferrer">${ic('wa')}Send on WhatsApp</a></div>
      <span class="muted-note">They must change it at first sign-in, so it only works once in practice. Send it privately.</span>
    </div>${foot('<button type="button" class="btn btn-primary" data-act="close">Done</button>')}`, 'narrow');
}

/* ---- Admin → Links: every outside link Rocket uses, in one place ---- */
async function loadCalendarStatus() {
  if (!LIVE) { adminData.calendar = {configured:true, connected:state.calendar.connected, email:state.calendar.email}; return; }
  adminData.calendar = {loading:true};
  try { adminData.calendar = await calendarApi('status'); }
  catch (e) { adminData.calendar = {error:e.message, notDeployed:/NOT_DEPLOYED|Failed to send|not found/i.test(e.message)}; }
  if (view === 'admin' && adminTab === 'links') render();
}
function calendarCard() {
  const c = adminData.calendar;
  if (!c) { loadCalendarStatus(); return '<div class="faint">Checking…</div>'; }
  if (c.loading) return '<div class="faint">Checking…</div>';
  const cmd = s => `<pre class="cmd">${esc(s)}</pre>`, redirect = (CFG.supabaseUrl || '') + '/functions/v1/google-calendar';
  if (c.notDeployed) return `<div class="del-pending" style="border-color:rgba(245,185,66,.45);background:var(--amber-soft)"><div><b style="color:var(--amber)">Not set up yet.</b> The calendar function isn’t deployed.</div></div>
    <ol class="setup">
      <li>In <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer">Google Cloud Console</a>, signed in as the <b>club’s</b> Google account: create a project, enable <b>Google Calendar API</b>, set up the <b>OAuth consent screen</b> (External, scope <code>calendar.events</code>) and <b>publish</b> it.</li>
      <li>Create an <b>OAuth client ID</b> (Web application) with this redirect URI: <span class="mono" style="overflow-wrap:anywhere">${esc(redirect)}</span> <button type="button" class="btn sm btn-ghost" data-act="copy-text" data-v="${esc(redirect)}">Copy</button></li>
      <li>In Terminal, in the Rocket folder:${cmd('supabase secrets set GOOGLE_CLIENT_ID=… GOOGLE_CLIENT_SECRET=…')}${cmd('supabase functions deploy google-calendar --use-api --no-verify-jwt')}</li>
      <li>Come back here and press <b>Check again</b>, then <b>Connect</b>.</li></ol>
    <div><button type="button" class="btn sm" data-act="cal-status">Check again</button></div>`;
  if (c.error) return `<div class="err">${esc(c.error)}</div><div><button type="button" class="btn sm" data-act="cal-status">Check again</button></div>`;
  if (!c.configured) return `<div class="del-pending" style="border-color:rgba(245,185,66,.45);background:var(--amber-soft)"><div><b style="color:var(--amber)">Almost there.</b> The function is deployed but has no Google client details.</div></div>
    ${cmd('supabase secrets set GOOGLE_CLIENT_ID=… GOOGLE_CLIENT_SECRET=…')}<span class="muted-note">Redirect URI for the Google OAuth client: <span class="mono">${esc(redirect)}</span></span>
    <div><button type="button" class="btn sm" data-act="cal-status">Check again</button></div>`;
  const missing = upcomingMeetings().filter(m => !m.onCalendar).length;
  if (c.connected) return `<div style="display:flex;align-items:center;gap:10px"><span class="pill s-done">Connected</span><span class="mono" style="font-size:13px">${esc(c.email)}</span></div>
    <span class="muted-note">Meetings the Executive Assistant schedules become events on this account’s calendar, with Google invites to each attendee.</span>
    <div style="display:flex;gap:8px;flex-wrap:wrap">${missing ? `<button type="button" class="btn sm btn-primary" data-act="cal-sync-all">Add ${missing} upcoming meeting${missing === 1 ? '' : 's'}</button>` : ''}<button type="button" class="btn sm" data-act="cal-disconnect">Disconnect</button></div>`;
  return `<div style="display:flex;align-items:center;gap:10px"><span class="pill s-not_started">Not connected</span></div>
    <span class="muted-note">Sign in with the club’s shared Google account (not a personal one) so it survives handovers.</span>
    <div>${LIVE ? `<button type="button" class="btn sm btn-primary" data-act="cal-connect">${ic('cal')}Connect Google Calendar</button>` : `<button type="button" class="btn sm btn-primary" data-act="cal-demo-connect">${ic('cal')}Connect (simulated)</button>`}</div>`;
}
const customRow = (c = {}) => `<div class="link-row custom-row"><input class="input" data-cl value="${esc(c.label || '')}" placeholder="Label, e.g. Instagram" aria-label="Link label">
  <input class="input" data-cu type="url" value="${esc(c.url || '')}" placeholder="https://…" aria-label="Link address"><button type="button" class="btn btn-ghost sm icon-btn" data-act="link-row-del" aria-label="Remove link">${ic('x')}</button></div>`;
function vAdminLinks() {
  const l = links(), people = [...(adminData.members || state.members)].filter(m => m.active !== false).sort((a, b) => a.name.localeCompare(b.name));
  const linkField = (name, label, value, ph, hint) => `<div class="link-row"><label for="lk-${name}">${label}${hint ? `<span class="faint">${hint}</span>` : ''}</label><input class="input" id="lk-${name}" name="${name}" type="url" value="${esc(value || '')}" placeholder="${ph}"></div>`;
  return `<div class="page">
    ${heading('Admin', 'Every outside link Rocket uses, in one place. Changes show up for members straight away.')}${adminTabs()}
    <section class="panel"><div class="panel-head"><h2>Google Calendar</h2><span class="faint" style="font-size:12.5px">Real invites for meetings</span></div>
      <div class="links-body">${calendarCard()}</div></section>
    <form data-form="links" novalidate class="stackcol">
      <section class="panel"><div class="panel-head"><h2>WhatsApp groups</h2><span class="faint" style="font-size:12.5px">Group invite links (WhatsApp → group → Invite via link)</span></div>
        <div class="links-body">${linkField('wa_all', 'All members', l.whatsapp.all, 'https://chat.whatsapp.com/…', ' · shown to everyone')}
          ${TEAMS.map(tm => linkField('wa_' + tm.id, `${esc(tm.name)} team`, l.whatsapp[tm.id], 'https://chat.whatsapp.com/…', ` · ${teamMembers(tm.id).length} ${teamMembers(tm.id).length === 1 ? 'person' : 'people'}`)).join('')}</div></section>
      <section class="panel"><div class="panel-head"><h2>Members’ WhatsApp numbers</h2><span class="faint" style="font-size:12.5px">For “Message on WhatsApp” · visible to signed-in members</span></div>
        <div class="links-body">${people.map(m => `<div class="link-row"><label for="num-${m.id}"><span class="who">${avatar(m.id)}<span>${esc(m.name)}</span></span><span class="faint">${esc(roleLabel(m.role))}</span></label><input class="input" id="num-${m.id}" name="num_${m.id}" type="tel" inputmode="tel" value="${esc(m.whatsapp || '')}" placeholder="+971 50 123 4567"></div>`).join('')}</div></section>
      <section class="panel"><div class="panel-head"><h2>Club resources</h2></div>
        <div class="links-body">${linkField('drive_url', 'Design Drive', state.settings.designDriveUrl, 'https://drive.google.com/drive/folders/…', ' · shown to PR, Media, Graphic Design and leadership')}
          ${linkField('cal_url', 'Club calendar (view link)', l.calendarUrl, 'https://calendar.google.com/calendar/…', ' · optional, for members to open or subscribe')}</div></section>
      <section class="panel"><div class="panel-head"><h2>Other links</h2><span class="faint" style="font-size:12.5px">Shown to everyone under “Club links” on the Overview</span></div>
        <div class="links-body"><div id="custom-links">${l.custom.map(customRow).join('')}${l.custom.length ? '' : customRow()}</div>
          <div><button type="button" class="btn sm" data-act="link-row-add">${ic('plus')}Add a link</button></div></div></section>
      <div class="links-save"><span class="err" id="lkerr" role="alert"></span><button class="btn btn-primary">Save links</button></div>
    </form>
  </div>`;
}

/* ---- Admin → Permissions: who can open which section, and the fixed rules ---- */
let permDraft = null;   // unsaved grid edits
const SECTION_NOTE = {calendar:'Everything with a date', meetings:'Invites decide which meetings you see', events:'', ideas:'', deadlines:'Your own items (leadership sees all)', notes:'Only notes shared with you',
  kb:'Guides', schedules:'Class timetables — everyone reads, you edit your own', programmes:'The Venture Hour: mentors, students, surveys', startups:'Founder contacts', budget:'Money', design:'Creative requests', members:'Everyone’s details'};
const permPeople = (a, s) => state.members.filter(m => m.active !== false && (a[s].roles.includes(m.role) || a[s].teams.includes(m.team)));
function vAdminPermissions() {
  const saved = sectionAccess(), a = permDraft || saved;
  const changed = (s, kind, id) => (a[s][kind].includes(id)) !== (saved[s][kind].includes(id));
  const dirty = PERM_SECTIONS.some(s => ['roles', 'teams'].some(k => JSON.stringify([...a[s][k]].sort()) !== JSON.stringify([...saved[s][k]].sort())));
  const cnt = (field, v) => state.members.filter(m => m.active !== false && m[field] === v).length;
  const head = PERM_SECTIONS.map(s => { const [, l, i] = SECTIONS.find(x => x[0] === s);
    return `<th class="pm-col" title="${esc(SECTION_NOTE[s] || l)}"><span class="pm-colhead">${ic(i)}<span>${esc(l)}</span>${ENFORCED_SECTIONS.includes(s) ? `<span class="pm-lock" title="Enforced by the database">${ic('shield')}</span>` : ''}</span></th>`; }).join('');
  const row = (kind, id, label, sub) => `<tr><th class="pm-row"><span class="pm-rowname">${esc(label)}</span><span class="faint">${sub}</span></th>${PERM_SECTIONS.map(s => `<td class="pm-cell ${changed(s, kind, id) ? 'changed' : ''}">
      <input type="checkbox" data-change="perm" data-s="${s}" data-k="${kind}" data-id="${id}" ${a[s][kind].includes(id) ? 'checked' : ''} aria-label="${esc(label)} can open ${esc(sectionLabel(s))}"></td>`).join('')}</tr>`;
  return `<div class="page">
    ${heading('Admin', 'Choose which club roles and teams can open each section. A member gets a section if their role or their team is ticked.')}${adminTabs()}
    <div class="pm-notes">
      <span class="pm-chip">${ic('home')}<b>Overview</b> is always on for everyone</span>
      <span class="pm-chip">${ic('shield')}<b>Admin</b> is for people with admin rights (set per person in Members)</span>
      <span class="pm-chip">${ic('shield')}<b>Programmes, Startups, Budget, Design, Members & teams</b> are enforced by the database — untick and the data is locked, not just hidden</span>
      <span class="pm-chip faint-chip">The other sections only hide the tab and search results</span>
    </div>
    <div class="table-wrap pm-wrap"><table class="pm-table">
      <thead><tr><th class="pm-corner">Who</th>${head}</tr></thead>
      <tbody>
        <tr class="pm-group"><th colspan="${PERM_SECTIONS.length + 1}">Club roles</th></tr>
        ${ROLES.map(r => row('roles', r.id, r.label, `${cnt('role', r.id)} ${cnt('role', r.id) === 1 ? 'person' : 'people'}${OVERSIGHT.includes(r.id) ? ' · leadership' : ''}`)).join('')}
        <tr class="pm-group"><th colspan="${PERM_SECTIONS.length + 1}">Teams <span class="faint" style="font-weight:400;text-transform:none;letter-spacing:0">— give a whole team access on top of their roles</span></th></tr>
        ${TEAMS.map(tm => row('teams', tm.id, tm.name, `${cnt('team', tm.id)} ${cnt('team', tm.id) === 1 ? 'person' : 'people'}`)).join('')}
      </tbody>
      <tfoot><tr><th class="pm-row"><span class="pm-rowname">Can open it</span><span class="faint">active members</span></th>${PERM_SECTIONS.map(s => { const n = permPeople(a, s).length; return `<td class="pm-count ${n === 0 ? 'zero' : ''}" title="${esc(permPeople(a, s).map(m => m.name).join(', ') || 'Nobody')}">${n}</td>`; }).join('')}</tr></tfoot>
    </table></div>
    <div class="links-save"><span class="faint" style="font-size:13px;margin-right:auto">${dirty ? 'You have unsaved changes (highlighted).' : 'Saved. Members see changes the next time Rocket refreshes.'}</span>
      <button type="button" class="btn btn-ghost" data-act="perm-defaults">Reset to defaults</button>
      ${dirty ? '<button type="button" class="btn" data-act="perm-discard">Discard</button>' : ''}
      <button type="button" class="btn btn-primary" data-act="perm-save" ${dirty ? '' : 'disabled'}>Save permissions</button></div>
    <section class="panel"><div class="panel-head"><h2>How permissions work</h2><span class="faint" style="font-size:12.5px">Fixed rules, on top of the grid above</span></div>
      <div class="pm-rules">${PERM_RULES.map(([area, rules]) => `<div class="pm-rule-group"><h3>${esc(area)}</h3><dl>${rules.map(([what, who]) => `<dt>${esc(what)}</dt><dd>${who}</dd>`).join('')}</dl></div>`).join('')}</div>
      <div class="muted-note" style="padding:0 16px 14px"><b>Leadership</b> means the President, Vice President, Advisor and Executive Assistant. <b>Admin</b> is a separate switch per person and never grants club powers by itself.</div></section>
  </div>`;
}
const PERM_RULES = [
  ['Meetings', [['Schedule, edit, cancel, invite', 'Executive Assistant only'], ['See a meeting', 'Leadership sees all; everyone else sees meetings they or their team are invited to'], ['Connect Google Calendar', 'Admins or the Executive Assistant']]],
  ['Events', [['Create an event', 'Everyone'], ['Edit an event and its checklist', 'Leadership, the person who created it, and its responsible team'], ['Tick off or move a checklist item', 'Its owner, plus the people who can edit the event'], ['Delete an event', 'The Executive Assistant or an admin — it also deletes its checklist, design requests, expenses and reimbursements']]],
  ['Ideas', [['Submit an idea', 'Everyone — you become its owner (locked)'], ['Edit an idea', 'Its owner, collaborators, leadership and admins'], ['Add contributions', 'Its owner and collaborators'], ['Delete an idea', 'Its owner or an admin']]],
  ['Deadlines', [['See items', 'Leadership sees everyone’s; others see their own and ideas they collaborate on'], ['Tick an item off', 'Its owner (and leadership)'], ['Assign a follow-up to someone else', 'Leadership']]],
  ['Startups & money', [['Add or edit a startup', 'Anyone with the Startup Directory section'], ['Delete a startup', 'Admins or the President (others can request it)'], ['Edit budget, expenses, reimbursements', 'Anyone with the Budget section']]],
  ['Schedules', [['See everyone’s class timetable', 'Anyone with the Schedules section'], ['Add or edit a timetable', 'Its owner — plus the Executive Assistant, who can fill one in for someone'],
    ['Effect on meetings', 'None — schedules are for planning only and never block or change a meeting']]],
  ['Programmes', [['Run The Venture Hour: mentors, slots, sign-ups, surveys, settings', 'Anyone with the Programmes section'], ['Book a student into a slot', 'Rocket does it, first come first served — from the Google Form or “Add a sign-up”'],
    ['Book again after a session', 'Only once the student has filled the post-meeting survey'], ['Fill a post-meeting survey', 'The student, from their private link']]],
  ['Design', [['Create or edit a request', 'Anyone with the Design section'], ['Update the status of your own work', 'The person it’s assigned to']]],
  ['Notes', [['See a note', 'Its owner and anyone it’s shared with (or the whole club, if opened up)'], ['Change who a note is shared with', 'Its owner'], ['Delete a note', 'Its owner or an admin']]],
  ['People & settings', [['Edit responsibilities', 'Leadership'], ['Invite, remove, change roles, reset passwords', 'Admins'], ['Knowledge base, links, permissions', 'Admins']]],
];
