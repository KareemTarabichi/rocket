
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

function vAdmin() {
  if (!isAdmin()) return '<div class="page"><div class="panel empty">Only admins can open this section.</div></div>';
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
    ${head}
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
    <section class="panel"><div class="panel-head"><h2>Links</h2><span class="faint" style="font-size:12.5px">Shown to PR, Media, Graphic Design and leadership</span></div>
      <form data-form="settings" style="padding:14px 16px;display:flex;flex-direction:column;gap:8px" novalidate>
        <label for="f-drive" style="font-size:12.5px;color:var(--text-muted);font-weight:500">Design Drive — the Google Drive folder with guidelines and assets</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><input class="input" id="f-drive" name="designDriveUrl" type="url" value="${esc(state.settings?.designDriveUrl || '')}" placeholder="https://drive.google.com/drive/folders/…" style="flex:1;min-width:220px"><button class="btn">Save link</button></div>
        <span class="muted-note">Make sure the folder is shared with the club’s AUS accounts in Google Drive — Rocket only stores the link.</span>
      </form></section>
    <section class="panel"><div class="panel-head"><h2>Admin activity</h2><span class="faint" style="font-size:12.5px">Latest ${Math.min(adminData.log.length, 50)}</span></div>
      <div>${adminData.log.slice(0, 50).map(l => `<div class="notif ${l.action === 'remove' || l.action === 'disable' ? 'cancel' : ''}"><span class="k">${esc(actor(l.actor))} · ${esc(ADMIN_ACTION[l.action] || l.action)} ${esc(l.target_email)}</span><time>${fmtStamp(l.created_at)}</time>${l.details ? `<span class="d">${esc(l.details)}</span>` : ''}</div>`).join('') || '<div class="empty">No admin actions yet.</div>'}</div></section>
  </div>`;
}
const ADMIN_ACTION = {invite:'invited', update:'updated', disable:'disabled the login of', enable:'re-enabled the login of', resend:'sent a sign-in code to', remove:'removed'};

function openAdminInvite() {
  if (!isAdmin()) return;
  openDialog(`<form data-form="admin-invite" novalidate>${dHead('Invite a member', 'They get an invitation email, then sign in with a code and set a password. Only @aus.edu addresses can join.')}
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
      ${field('Full name', inp('name', m.name, 'required'), 'f-name')}
      <div class="grid2">${field('Club role', `<select class="input" id="f-role" name="role">${ROLES.map(r => opt(r.id, r.label, m.role)).join('')}</select>`, 'f-role')}${field('Team', `<select class="input" id="f-team" name="team">${teamOpts(m.team)}</select>`, 'f-team')}</div>
      <label class="cbox"><input type="checkbox" name="is_admin" ${m.is_admin ? 'checked' : ''} ${lastAdmin ? 'disabled' : ''}>Admin</label>
      ${lastAdmin ? '<span class="muted-note">This is the only admin, so admin rights can’t be removed. Make someone else an admin first.</span>' : ''}
      <div class="sect"><span class="eyebrow">Login</span>
        <dl class="kv"><dt>Last sign-in</dt><dd class="num">${m.last_sign_in_at ? fmtStamp(m.last_sign_in_at) : 'Never'}</dd>${m.invited_at ? `<dt>Invited</dt><dd class="num">${fmtStamp(m.invited_at)}</dd>` : ''}</dl>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${st === 'disabled' ? `<button type="button" class="btn sm" data-act="admin-enable" data-id="${m.id}">Enable login</button>`
            : `<button type="button" class="btn sm" data-act="admin-disable" data-id="${m.id}" ${self || lastAdmin ? `disabled title="${self ? 'You can’t disable your own login' : 'Rocket needs at least one active admin'}"` : ''}>Disable login</button>`}
          ${st !== 'disabled' ? `<button type="button" class="btn sm" data-act="admin-resend" data-id="${m.id}">Send sign-in code</button>` : ''}
        </div>
        <span class="muted-note">Disabling blocks sign-in and all data access straight away; their records stay. Members sign in the first time with an emailed code, then set their own password. If someone forgets it, send them a sign-in code and they’ll be asked to set a new one.</span></div>
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
      logIt('invite', email, `${p.role} · ${p.team}${p.is_admin ? ' · admin' : ''}`); break;
    }
    case 'update': {
      if (t.is_admin && !p.is_admin && t.active !== false && activeAdmins(list) <= 1) throw new Error('Rocket needs at least one admin. Make someone else an admin first.');
      const changes = ['name', 'role', 'team', 'is_admin'].filter(k => p[k] !== t[k]).map(k => `${k}: ${t[k]} → ${p[k]}`).join(', ');
      Object.assign(t, {name:p.name.trim() || t.name, role:p.role, team:p.team, is_admin:!!p.is_admin});
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
    if (LIVE) { await adminApi(action, payload); await Promise.all([loadAdmin(true), reloadLive()]); }
    else demoAdmin(action, payload);
    closeDialog(); render(); toast(okMsg, sub); return true;
  } catch (e) {
    const err = $('#aerr'); if (err && dlg().open) err.textContent = e.message; else toast(e.message, '', true);
    return false;
  }
}
