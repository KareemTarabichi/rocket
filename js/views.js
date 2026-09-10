
/* ================= shared render helpers ================= */
const avatar = (id, lg) => { const m = member(id); if (!m) return `<span class="av ${lg ? 'av-lg' : ''}" style="background:var(--border);color:var(--text-muted)">–</span>`;
  const hue = HUES[[...m.id].reduce((s, c) => s + c.charCodeAt(0), 0) % HUES.length]; return `<span class="av ${lg ? 'av-lg' : ''}" style="background:${hue}" title="${esc(m.name)}">${m.name.split(' ').map(w => w[0]).slice(0, 2).join('')}</span>`; };
const who = id => { const m = member(id); return m ? `<span class="who">${avatar(id)}<span>${esc(m.name)}</span></span>` : '<span class="faint">Unassigned</span>'; };
const bellBtn = (cls = '') => { const n = unreadCount();
  return `<button type="button" class="btn bell ${cls}" data-act="notif" aria-label="Notifications${n ? `, ${n} need attention` : ''}" title="Notifications">${ic('bell')}${n ? `<span class="bell-badge">${n > 99 ? '99+' : n}</span>` : ''}</button>`; };
// Design Drive: the club's Google Drive folder with guidelines and assets. Admins set the link in Admin → Links.
const canSeeDrive = () => access('design') || ['design', 'media', 'pr'].includes(state.role);
const driveBtn = (cls = '') => state.settings?.designDriveUrl
  ? `<a class="btn ${cls}" href="${esc(state.settings.designDriveUrl)}" target="_blank" rel="noopener noreferrer">${ic('folder')}Design Drive${ic('ext')}</a>`
  : `<button type="button" class="btn ${cls}" data-act="drive-missing">${ic('folder')}Design Drive</button>`;
const heading = (title, sub, actions = '') => `<div class="page-head"><div><h1>${esc(title)}</h1>${sub ? `<p>${sub}</p>` : ''}</div><div class="toolbar">${bellBtn('page-bell')}${actions}</div></div>`;
const badge = (cls, label) => `<span class="pill ${cls}">${esc(label)}</span>`;
const ideaBadge = s => badge('st-' + s, IDEA_LABEL[s]);
const designBadge = s => badge('ds-' + s, DESIGN_LABEL[s]);
const dueChip = (s, done) => { if (done) return '<span class="due done">Done</span>'; const n = daysFrom(s); return `<span class="due ${n < 0 ? 'over' : n <= 7 ? 'soon' : 'later'}">${relDue(s)}</span>`; };
const opt = (v, l, sel) => `<option value="${esc(v)}" ${v === sel ? 'selected' : ''}>${esc(l)}</option>`;
const memberOpts = sel => state.members.map(m => opt(m.id, `${m.name} · ${roleLabel(m.role)}`, sel)).join('');
const teamOpts = sel => TEAMS.map(t => opt(t.id, t.name, sel)).join('');
const eventOpts = (sel, blank) => (blank ? opt('', blank, sel) : '') + state.events.map(e => opt(e.id, e.name, sel)).join('');
const seg = (act, cur, items) => `<div class="seg" role="group">${items.map(([v, l]) => `<button type="button" data-act="${act}" data-v="${v}" aria-pressed="${cur === v}">${esc(l)}</button>`).join('')}</div>`;
const readonlyNote = t => `<div class="readonly-note">${ic('lock')}<span>${esc(t)}</span></div>`;
const progressBlock = ev => { const d = ev.tasks.filter(t => t.done).length, n = ev.tasks.length, p = pct(d, n);
  return `<div style="display:flex;flex-direction:column;gap:6px"><div style="display:flex;justify-content:space-between"><span class="faint" style="font-size:12.5px">${d} of ${n} requirements</span><span class="pct">${p}%</span></div><div class="pbar" role="progressbar" aria-valuenow="${p}" aria-valuemin="0" aria-valuemax="100"><i style="width:${p}%"></i></div></div>`; };
const LOGO = `<svg class="brand-mark" viewBox="0 0 28 28" aria-hidden="true"><rect width="28" height="28" rx="7" fill="#1D1B26"/><path d="M14 5 21 21 14 17.5 7 21Z" fill="none" stroke="#4DD9E8" stroke-width="1.8" stroke-linejoin="round"/><path d="M14 17.5V23" stroke="#F5B942" stroke-width="1.8" stroke-linecap="round"/></svg>`;
const BRAND = `<div class="brand">${LOGO}<span class="brand-text"><span class="brand-name">Rocket</span><span class="brand-org">AUS Launchpad</span></span></div>`;
const roleSelect = id => `<select class="input" id="${id}" data-change="role" aria-label="Demo role">${ROLES.map(r => opt(r.id, `${r.label} — ${state.members.find(m => m.role === r.id).name}`, state.role)).join('')}</select>`;

/* ================= shell ================= */
const TABS = ['overview', 'meetings', 'events', 'deadlines'];
const FAB = {meetings:() => ea() && ['new-meeting','Schedule'], events:() => ['new-event','New event'], ideas:() => ['new-idea','Submit idea'], deadlines:() => ['new-task','Follow-up'],
  startups:() => ['new-startup','Add startup'], design:() => ['new-design','New request'], budget:() => ['new-expense','Add expense']};
function renderShell() {
  const overdue = pending().filter(x => daysFrom(x.due) < 0).length;
  const navItem = ([k, l, i]) => `<a href="#" data-act="go" data-v="${k}" ${view === k ? 'aria-current="page"' : ''}>${ic(i)}${l}${k === 'deadlines' && overdue ? `<span class="count">${overdue}</span>` : ''}</a>`;
  $('#side').innerHTML = `${BRAND}
    <nav class="nav" aria-label="Sections"><div class="eyebrow nav-label">${esc(roleLabel(state.role))} workspace</div>${SECTIONS.filter(s => access(s[0])).map(navItem).join('')}</nav>
    <div class="side-foot">${LIVE ? `
      <div class="whoami" style="flex-direction:row;align-items:center;gap:10px">${avatar(me().id)}<div style="min-width:0;flex:1"><div style="font-weight:500;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(me().name)}</div><div class="faint" style="font-size:11.5px">${esc(roleLabel(state.role))}${isAdmin() ? ' · Admin' : ''}</div></div>
        <button class="btn btn-ghost sm icon-btn" data-act="sign-out" aria-label="Sign out" title="Sign out">${ic('logout')}</button></div>
      <div style="display:flex;flex-direction:column;gap:6px;padding:0 4px"><button class="linkbtn" data-act="change-password">Change password</button>
      ${isStandalone() ? '' : `<button class="linkbtn" data-act="welcome-install">${ic('plus')} Install Rocket on this device</button>`}</div>` : `
      <div class="whoami role-sw"><label for="role-d">Demo role switcher</label>${roleSelect('role-d')}<span class="faint" style="font-size:11.5px">No sign-in in this demo. Pick a role to see its view. Tech is also the platform admin.</span></div>
      <div style="display:flex;gap:14px;padding:0 4px"><button class="linkbtn" data-act="reset">Reset demo data</button></div>`}
    </div>`;
  $('#topbar').innerHTML = `${BRAND}${bellBtn()}<button class="me-btn" data-act="more" aria-label="Switch role and more sections">${avatar(me().id)}${esc(roleLabel(state.role))}</button>`;
  $('#tabbar').innerHTML = TABS.map(k => { const [, l, i] = SECTIONS.find(s => s[0] === k);
    return `<a href="#" data-act="go" data-v="${k}" ${view === k ? 'aria-current="page"' : ''}>${ic(i)}${k === 'overview' ? 'Home' : l}${k === 'deadlines' && overdue ? `<span class="badge">${overdue}</span>` : ''}</a>`; }).join('')
    + `<button data-act="more" ${TABS.includes(view) ? '' : 'aria-current="page"'}>${ic('more')}More</button>`;
  const f = FAB[view]?.();
  $('#fab').innerHTML = f ? `<button class="fab" data-act="${f[0]}">${ic('plus')}${f[1]}</button>` : '';
}
function moreSheet() {
  const extra = SECTIONS.filter(s => access(s[0]) && !TABS.includes(s[0]));
  openDialog(`<div class="dlg-head"><div style="flex:1;display:flex;gap:12px;align-items:center">${avatar(me().id, true)}<div><h2 style="font-size:18px">${esc(me().name)}</h2><div class="sub">${esc(roleLabel(state.role))} · ${esc(teamName(me().team))}</div></div></div>${closeBtn()}</div>
    <div class="dlg-body">
      <div class="more-grid">${extra.map(([k, l, i]) => `<a href="#" data-act="go" data-v="${k}" ${view === k ? 'aria-current="page"' : ''}>${ic(i)}${l}</a>`).join('')}</div>
      ${LIVE ? `<p class="muted-note" style="margin:0">Signed in as <span class="mono">${esc(me().email)}</span>${isAdmin() ? ' · Admin' : ''}</p>
      ${isStandalone() ? '' : `<button class="btn" data-act="welcome-install" style="justify-content:center">${ic('plus')}Add Rocket to your home screen</button>`}
      <button class="btn" data-act="change-password" style="justify-content:center">Change password</button>
      <button class="btn" data-act="sign-out" style="justify-content:center">${ic('logout')}Sign out</button>` : `
      <div class="field role-sw"><label for="role-m">Demo role switcher</label>${roleSelect('role-m')}</div>
      <p class="muted-note" style="margin:0">One sample member per role. Switching updates sections, records and permissions straight away. Tech is also the platform admin.</p>
      <button class="btn" data-act="reset" style="justify-content:center">Reset demo data</button>`}
    </div>`, 'narrow');
}

/* ================= overview ================= */
function vOverview() {
  const m = me(), um = upcomingMeetings(), ue = upcomingEvents(true), pend = pending(), ideas = state.ideas.filter(i => i.stage !== 'completed' && relevantIdea(i));
  const overdue = pend.filter(x => daysFrom(x.due) < 0).length, next = ue[0];
  const now = new Date(), dow = now.toLocaleDateString('en-GB', {weekday:'short'}).toUpperCase(), mon = now.toLocaleDateString('en-GB', {month:'short'}).toUpperCase();
  const card = (act, v, l, s, alert) => `<button class="sum-card ${alert ? 'alert' : ''}" data-act="${act}"><span class="v">${v}</span><span class="l">${l}</span><span class="s">${s}</span></button>`;
  return `<div class="page">
    <section class="hero" style="min-height:0">
      <div class="thermal"></div><div class="grain"></div>
      <div><div class="hero-date">${dow}.${pad(now.getDate())}.${mon}</div><h1>Hi ${esc(m.name.split(' ')[0])} — here’s your ${esc(roleLabel(m.role))} view.</h1></div>
      <div class="hero-summary">${overdue ? `<span class="hero-chip over"><b>${overdue}</b> overdue</span>` : ''}${um[0] ? `<span class="hero-chip">Next meeting: ${esc(um[0].title)} <b>${fmtDate(um[0].date, {day:'numeric', month:'short'})} ${fmtTime(um[0].start)}</b></span>` : ''}${bellBtn('page-bell')}</div>
    </section>
    <div class="sum-cards">
      ${card('sum-meetings', um.length, 'Upcoming meetings', oversight() ? 'All club meetings' : 'Meetings you’re invited to')}
      ${card('sum-events', ue.length, 'Upcoming events', 'Where you have a part to play')}
      ${card('sum-tasks', pend.length, 'Pending tasks', overdue ? `${overdue} overdue` : 'Nothing overdue', overdue)}
      ${card('sum-ideas', ideas.length, 'Active ideas', 'Yours, shared with you, or your team’s')}
    </div>
    <div class="split">
      <div class="stackcol">
        <section class="panel"><div class="panel-head"><h2>Upcoming meetings</h2><a href="#" data-act="go" data-v="meetings">All meetings</a></div>
          <div>${um.slice(0, 4).map(meetingRow).join('') || '<div class="empty">No upcoming meetings.</div>'}</div></section>
        <section class="panel"><div class="panel-head"><h2>Pending next steps</h2><a href="#" data-act="sum-tasks">Deadlines</a></div>
          <div class="dl-list" style="border:0">${pend.slice(0, 5).map(deadlineRow).join('') || '<div class="empty">You’re all caught up.</div>'}</div></section>
      </div>
      <div class="stackcol">
        <section class="panel"><div class="panel-head"><h2>Next event</h2><a href="#" data-act="go" data-v="events">Events</a></div>
          ${next ? `<div style="padding:16px;display:flex;flex-direction:column;gap:12px;cursor:pointer" data-act="open-event" data-id="${next.id}">
            <div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline"><h3 style="font-size:22px">${esc(next.name)}</h3><span class="num muted">${fmtDate(next.date)} · in ${daysFrom(next.date)}d</span></div>
            <span class="why">${esc(relevantEvent(next).join(' · '))}</span>${progressBlock(next)}</div>` : '<div class="empty">No upcoming events involve you.</div>'}</section>
        <section class="panel"><div class="panel-head"><h2>Active ideas</h2><a href="#" data-act="sum-ideas">Board</a></div>
          <ul class="rows">${ideas.slice(0, 4).map(i => `<li class="row" data-act="open-idea" data-id="${i.id}"><div class="row-main"><div class="row-title">${esc(i.title)}</div><div class="row-sub">${esc(i.next || 'No next step yet')}</div></div>${ideaBadge(i.stage)}</li>`).join('') || '<li class="empty">No active ideas involve you.</li>'}</ul></section>
        <section class="panel"><div class="panel-head"><h2>Quick actions</h2></div><div class="quick">
          ${ea() ? `<button class="btn btn-primary" data-act="new-meeting">${ic('cal')}Schedule meeting</button>` : ''}
          <button class="btn" data-act="new-idea">${ic('bulb')}Submit idea</button><button class="btn" data-act="new-task">${ic('flag')}Add follow-up</button><button class="btn" data-act="go" data-v="kb">${ic('book')}${esc(roleLabel(state.role))} guidance</button>${canSeeDrive() ? driveBtn() : ''}</div></section>
      </div>
    </div>
  </div>`;
}

/* ================= meetings ================= */
function meetingRow(m) {
  const n = recipients(m).length, ended = meetingEnded(m);
  return `<div class="mt-row ${ended ? 'past' : ''}" data-act="open-meeting" data-id="${m.id}" tabindex="0">
    <div class="datebox"><div class="m">${fmtDate(m.date, {month:'short'})}</div><div class="d">${parseD(m.date).getDate()}</div></div>
    <div style="min-width:0"><div class="row-title">${esc(m.title)}</div><div class="row-sub">${fmtTime(m.start)}–${fmtTime(m.end)} · ${esc(m.location)}</div><div class="aud">${esc(audienceText(m))} · ${n} ${n === 1 ? 'person' : 'people'}${m.onCalendar ? ' · <span style="color:var(--cyan)">on Google Calendar</span>' : ''}</div></div>
    ${meetingLive(m) ? '<span class="pill live">Now</span>' : ended ? '<span class="pill e-done">Ended</span>' : daysFrom(m.date) === 0 ? '<span class="pill e-logistics">Today</span>' : `<span class="num faint" style="font-size:12px">${relDue(m.date)}</span>`}
  </div>`;
}
function calendarPanel(cal, list) {
  if (!LIVE) return `${cal.connected ? `<div style="font-size:13.5px">Invites are mirrored to <span class="mono">${esc(cal.email)}</span>.</div>` : '<div class="muted" style="font-size:13.5px">When connected, invitations and cancellations are also marked as sent to Google Calendar.</div>'}
    ${ea() ? (cal.connected ? `<div><button class="btn sm" data-act="cal-disconnect">Disconnect</button></div>`
      : `<form data-form="calendar" style="display:flex;gap:8px;flex-wrap:wrap"><input class="input" type="email" name="email" required placeholder="launchpad.club@gmail.com" aria-label="Calendar email" style="flex:1;min-width:180px"><button class="btn sm">Connect</button></form>`)
      : '<span class="faint" style="font-size:12.5px">Managed by the Executive Assistant.</span>'}
    <span class="muted-note">Demo — the live app connects to Google for real.</span>`;
  const missing = upcomingMeetings().filter(m => !m.onCalendar).length;
  if (cal.connected) return `<div style="font-size:13.5px">Meetings are created on <span class="mono">${esc(cal.email)}</span>’s calendar, and Google emails each attendee an invite. Changes and cancellations update it too.</div>
    ${ea() ? `<div style="display:flex;gap:8px;flex-wrap:wrap">${missing ? `<button class="btn sm btn-primary" data-act="cal-sync-all">Add ${missing} upcoming meeting${missing === 1 ? '' : 's'} to the calendar</button>` : ''}<button class="btn sm" data-act="cal-disconnect">Disconnect</button></div>` : ''}`;
  return ea() ? `<div class="muted" style="font-size:13.5px">Connect the club’s Google account. Every meeting you schedule then becomes a calendar event with real invites to the attendees’ AUS email.</div>
      <div><button class="btn btn-primary sm" data-act="cal-connect">${ic('cal')}Connect Google Calendar</button></div>
      <span class="muted-note">Use a shared Launchpad account rather than your personal one, so it survives handovers.</span>`
    : '<span class="faint" style="font-size:12.5px">Not connected yet. The Executive Assistant connects it.</span>';
}
function vMeetings() {
  const list = filters.meetings === 'upcoming' ? upcomingMeetings() : visibleMeetings(), notes = visibleNotifications();
  const cal = state.calendar;
  return `<div class="page">
    ${heading('Meetings', oversight() ? 'Every club meeting. Only the Executive Assistant schedules, edits, invites and cancels.' : 'Meetings you’ve been invited to, directly or through your team.', ea() ? `<button class="btn btn-primary" data-act="new-meeting">${ic('plus')}Schedule meeting</button>` : '')}
    ${ea() ? '' : readonlyNote('Only the Executive Assistant can schedule, edit or cancel meetings and send invitations.')}
    <div class="toolbar">${seg('meet-f', filters.meetings, [['upcoming','Upcoming'], ['all', oversight() ? 'All meetings' : 'All my meetings']])}<span class="faint" style="font-size:13px">${list.length} shown</span></div>
    <div class="split">
      <section class="panel">${list.map(meetingRow).join('') || '<div class="empty">No meetings to show.</div>'}</section>
      <div class="stackcol">
        <section class="panel"><div class="panel-head"><h2>Google Calendar</h2><span class="pill ${cal.connected ? 's-done' : 's-not_started'}">${cal.connected ? (LIVE ? 'Connected' : 'Connected (simulated)') : 'Not connected'}</span></div>
          <div style="padding:14px 16px;display:flex;flex-direction:column;gap:10px">${calendarPanel(cal, list)}</div></section>
        <section class="panel"><div class="panel-head"><h2>Notification log</h2><span class="num faint" style="font-size:12px">${notes.length}</span></div>
          <div style="max-height:420px;overflow:auto">${notes.slice(0, 30).map(n => `<div class="notif ${n.kind === 'cancel' ? 'cancel' : ''}"><span class="k">${esc(n.title)}</span><time>${fmtStamp(n.at)}</time><span class="d">${esc(n.details)} · to ${n.recipients.length} ${n.recipients.length === 1 ? 'person' : 'people'}${n.calendar ? ' · calendar' : ''}</span></div>`).join('') || '<div class="empty">No notifications for you yet.</div>'}</div>
          <div class="muted-note" style="padding:10px 16px;border-top:1px solid var(--border)">${LIVE ? 'Sent as phone notifications to members who turned them on, and as Google Calendar invites when the calendar is connected. Keeps the latest 100.' : 'Simulated — nothing is emailed. Keeps the latest 100.'}</div></section>
      </div>
    </div>
  </div>`;
}

/* ================= events ================= */
function vEvents() {
  const mine = filters.events === 'mine', list = mine ? upcomingEvents(true) : [...state.events].sort((a, b) => a.date.localeCompare(b.date));
  const myDesign = state.designs.filter(d => d.owner === me().id && d.status !== 'completed');
  return `<div class="page">
    ${heading('Events', 'Club events with their checklist. Everyone can create an event; the responsible team, its creator and leadership manage it.', `<button class="btn btn-primary" data-act="new-event">${ic('plus')}New event</button>`)}
    <div class="toolbar">${seg('ev-f', filters.events, [['mine','My upcoming'], ['all','All events']])}</div>
    ${myDesign.length ? `<section class="panel"><div class="panel-head"><h2>Your design work</h2>${driveBtn('sm')}</div><ul class="rows">${myDesign.map(d => `<li class="row" data-act="open-design" data-id="${d.id}"><div class="row-main"><div class="row-title">${esc(d.title)}</div><div class="row-sub">${esc(d.event ? eventById(d.event)?.name : d.campaign)} · ${esc(d.deliverables)}</div></div>${designBadge(d.status)}${dueChip(d.due)}</li>`).join('')}</ul></section>` : ''}
    ${list.length ? `<div class="ev-grid">${list.map(e => { const why = relevantEvent(e), past = daysFrom(e.date) < 0;
      return `<button class="ev-card" data-act="open-event" data-id="${e.id}" style="${past ? 'opacity:.6' : ''}">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start"><h3>${esc(e.name)}</h3><span class="num faint" style="font-size:12px;white-space:nowrap">${past ? 'Past' : 'in ' + daysFrom(e.date) + 'd'}</span></div>
        <div class="ev-meta"><span>${fmtDate(e.date, {weekday:'long', day:'numeric', month:'long'})}</span><span>${esc(e.location)} · ${esc(teamName(e.team))} team</span></div>
        ${why.length ? `<span class="why">${esc(why.join(' · '))}</span>` : ''}
        ${progressBlock(e)}
      </button>`; }).join('')}</div>` : `<div class="panel empty">${mine ? 'No upcoming events involve you. Switch to “All events” to see the club calendar.' : 'No events yet.'}</div>`}
  </div>`;
}

/* ================= ideas ================= */
function filteredIdeas() {
  const f = filters.ideas;
  return state.ideas.filter(i => (f.team === 'all' || i.team === f.team) && (f.owner === 'all' || i.owner === f.owner) &&
    (f.stage === 'all' || (f.stage === 'active' ? i.stage !== 'completed' : i.stage === f.stage)) && (f.scope === 'all' || relevantIdea(i)));
}
function ideaCard(i) {
  const ok = canIdea(i);
  return `<article class="idea-card" data-act="open-idea" data-id="${i.id}" tabindex="0">
    <h3>${esc(i.title)}</h3>
    <div class="next">↳ ${esc(i.next || 'No next step')}${i.due ? ` · ${fmtDate(i.due, {day:'numeric', month:'short'})}` : ''}</div>
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><span class="who">${avatar(i.owner)}<span class="team-lbl">${esc(teamName(i.team))}</span></span>${i.assigned.length ? `<span class="stack">${i.assigned.map(a => avatar(a)).join('')}</span>` : ''}</div>
    ${ok ? `<select class="input" data-change="idea-stage" data-id="${i.id}" aria-label="Stage for ${esc(i.title)}">${IDEA_STAGES.map(s => opt(s, IDEA_LABEL[s], i.stage)).join('')}</select>` : ''}
  </article>`;
}
function vIdeas() {
  const f = filters.ideas, list = filteredIdeas(), any = f.team !== 'all' || f.owner !== 'all' || f.stage !== 'all' || f.scope !== 'all';
  const filterBar = `
    <select class="input" data-change="idea-team" aria-label="Team"><option value="all">All teams</option>${teamOpts(f.team)}</select>
    <select class="input" data-change="idea-owner" aria-label="Owner"><option value="all">Any owner</option>${state.members.map(m => opt(m.id, m.name, f.owner)).join('')}</select>
    <select class="input" data-change="idea-stage-f" aria-label="Stage">${opt('all', 'All stages', f.stage)}${opt('active', 'Active stages', f.stage)}${IDEA_STAGES.map(s => opt(s, IDEA_LABEL[s], f.stage)).join('')}</select>
    <select class="input" data-change="idea-scope" aria-label="Scope">${opt('all', 'Whole club', f.scope)}${opt('mine', 'Involving me', f.scope)}</select>
    ${any ? '<button class="btn btn-ghost sm" data-act="idea-clear">Clear filters</button>' : ''}`;
  let body;
  if (isM()) {
    const st = filters.ideaStageM, col = list.filter(i => i.stage === st);
    body = `<div class="scroller stage-tabs">${IDEA_STAGES.map(s => `<button class="fchip" data-act="idea-tab" data-v="${s}" aria-pressed="${st === s}">${IDEA_LABEL[s]}<span class="num">${list.filter(i => i.stage === s).length}</span></button>`).join('')}</div>
      <div class="m-list">${col.map(ideaCard).join('') || `<div class="panel empty">No ideas in ${IDEA_LABEL[st]}${any ? ' with these filters' : ''}.</div>`}</div>`;
  } else {
    body = `<div class="board">${IDEA_STAGES.map(s => { const col = list.filter(i => i.stage === s);
      return `<section class="col"><div class="col-head"><div class="top">${ideaBadge(s)}<span class="num faint">${col.length}</span></div></div><div class="col-body">${col.map(ideaCard).join('') || '<div class="empty" style="padding:18px 6px">Nothing here</div>'}</div></section>`; }).join('')}</div>`;
  }
  return `<div class="page">
    ${heading('Ideas', 'Anyone can submit an idea. Owners, collaborators and leadership move it through the stages.', `<button class="btn btn-primary" data-act="new-idea">${ic('plus')}Submit idea</button>`)}
    <div class="${isM() ? 'scroller' : 'toolbar'}">${filterBar}</div>
    ${body}
  </div>`;
}

/* ================= deadlines ================= */
function deadlineRow(x) {
  const n = daysFrom(x.due), ok = canTask(x), status = x.done ? 'Completed' : n < 0 ? 'Overdue' : n === 0 ? 'Due today' : 'Upcoming';
  const openAct = x.src === 'req' ? `data-act="open-event" data-id="${x.eventId}"` : x.src === 'idea' ? `data-act="open-idea" data-id="${x.id}"` : x.src === 'design' ? `data-act="open-design" data-id="${x.id}"` : '';
  return `<div class="dli ${x.done ? 'done' : n < 0 ? 'is-over' : n === 0 ? 'is-today' : ''}">
    <span class="c"><input type="checkbox" data-change="complete" data-key="${esc(x.key)}" ${x.done ? 'checked' : ''} ${ok ? '' : 'disabled'} aria-label="Mark ${esc(x.title)} ${x.done ? 'not done' : 'done'}" title="${ok ? '' : 'Only the owner or leadership can complete this'}"></span>
    <div class="tt" style="min-width:0"><div class="t" ${openAct} style="${openAct ? 'cursor:pointer' : ''}">${esc(x.title)}</div><div class="rel"><span class="src">${x.srcLabel}</span>${esc(x.related)}</div></div>
    <div class="ow">${who(x.owner)}</div>
    <span class="team-lbl">${esc(teamName(x.team))}</span>
    <span class="dd">${fmtDate(x.due)}</span>
    <span class="du">${x.done ? '<span class="due done">Completed</span>' : `<span class="due ${n < 0 ? 'over' : n === 0 ? 'soon' : 'later'}">${n < 0 || n === 0 ? status : relDue(x.due)}</span>`}</span>
  </div>`;
}
function vDeadlines() {
  const all = deadlineItems(), showDone = filters.deadlines === 'all';
  const g = {Overdue:[], 'Due Today':[], Upcoming:[], Completed:[]};
  all.forEach(x => { if (x.done) g.Completed.push(x); else { const n = daysFrom(x.due); (n < 0 ? g.Overdue : n === 0 ? g['Due Today'] : g.Upcoming).push(x); } });
  g.Completed.reverse();
  const grp = (t, arr) => arr.length ? `<section class="dl-group"><h2>${t} <span class="num">${arr.length}</span></h2><div class="dl-list">${arr.map(deadlineRow).join('')}</div></section>` : '';
  return `<div class="page">
    ${heading('Deadlines', 'One list built from follow-up tasks, event requirements, idea next steps and design work. Ticking an item updates the original record.', `<button class="btn btn-primary" data-act="new-task">${ic('plus')}Add follow-up</button>`)}
    <div class="toolbar">${seg('dl-f', filters.deadlines, [['pending','Pending only'], ['all','All statuses']])}<span class="faint" style="font-size:13px">${oversight() ? 'Leadership view — every club item' : 'Items you own, plus idea next steps you collaborate on'}</span></div>
    ${grp('Overdue', g.Overdue)}${grp('Due Today', g['Due Today'])}${grp('Upcoming', g.Upcoming)}${showDone ? grp('Completed', g.Completed) : ''}
    ${all.filter(x => showDone || !x.done).length ? '' : '<div class="panel empty">Nothing here. Add a follow-up if something needs tracking.</div>'}
  </div>`;
}
