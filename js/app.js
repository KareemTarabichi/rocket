
/* ================= dialogs ================= */
const dlg = () => $('#dlg');
const closeBtn = () => `<button type="button" class="btn btn-ghost sm icon-btn" data-act="close" aria-label="Close">${ic('x')}</button>`;
const dHead = (title, sub, pills = '') => `<div class="dlg-head"><div style="flex:1;min-width:0">${pills ? `<div class="chiprow" style="margin-bottom:6px">${pills}</div>` : ''}<h2>${esc(title)}</h2>${sub ? `<div class="sub">${sub}</div>` : ''}</div>${closeBtn()}</div>`;
function openDialog(html, cls = '') {
  const d = dlg(); d.className = 'dlg ' + cls; d.innerHTML = html;
  if (!d.open) d.showModal();
  d.scrollTop = 0;
  const first = d.querySelector('.dlg-body input:not([type=checkbox]):not([type=radio]), .dlg-body textarea, .dlg-body select');
  if (first && !isM()) first.focus();
}
function closeDialog() { const d = dlg(); if (d.open) d.close(); draft = null; }
const field = (label, input, id) => `<div class="field"><label ${id ? `for="${id}"` : ''}>${label}</label>${input}</div>`;
const inp = (name, val, attrs = '') => `<input class="input" id="f-${name}" name="${name}" value="${esc(val ?? '')}" ${attrs}>`;
const txt = (name, val, rows = 3, attrs = '') => `<textarea class="input" id="f-${name}" name="${name}" rows="${rows}" ${attrs}>${esc(val ?? '')}</textarea>`;
const foot = (primary, extra = '') => `<div class="dlg-foot">${extra}<span class="spacer"></span><button type="button" class="btn btn-ghost" data-act="close">Cancel</button>${primary}</div>`;

/* ---------- meeting ---------- */
function openMeeting(id) {
  const m = id ? state.meetings.find(x => x.id === id) : null;
  if (id && !m) return;
  if (m && !visibleMeetings().includes(m)) { toast('You’re not invited to that meeting', '', true); return; }
  if (!ea()) {
    if (!m) { toast('Only the Executive Assistant can schedule meetings', '', true); return; }
    const r = recipients(m);
    openDialog(`${dHead(m.title, `${fmtDate(m.date, {weekday:'long', day:'numeric', month:'long', year:'numeric'})} · ${fmtTime(m.start)}–${fmtTime(m.end)}`)}
      <div class="dlg-body">${readonlyNote('Read-only. Only the Executive Assistant can edit or cancel this meeting.')}
        <dl class="kv"><dt>Location</dt><dd>${esc(m.location)}</dd><dt>Invited</dt><dd>${esc(audienceText(m))}</dd></dl>
        <div class="sect"><span class="eyebrow">Agenda</span><p class="prose" style="white-space:pre-wrap">${esc(m.agenda)}</p></div>
        <div class="sect"><span class="eyebrow">Attendees · ${r.length}</span><div class="chiprow">${r.map(x => `<span class="cm">${esc(member(x).name)}</span>`).join('')}</div></div></div>
      ${foot('')}`);
    return;
  }
  const v = m || {title:'', date:today(), start:'16:00', end:'17:00', location:'', agenda:'', mode:'custom', teamIds:[], attendees:[]};
  openDialog(`<form data-form="meeting" data-id="${m ? m.id : ''}" novalidate>
    ${dHead(m ? 'Edit meeting' : 'Schedule meeting', 'Executive Assistant only. Invitations are simulated.')}
    <div class="dlg-body">
      ${field('Title', inp('title', v.title, 'required'), 'f-title')}
      <div class="grid3">${field('Date', inp('date', v.date, 'type="date" required'), 'f-date')}${field('Starts', inp('start', v.start, 'type="time" required'), 'f-start')}${field('Ends', inp('end', v.end, 'type="time" required'), 'f-end')}</div>
      ${field('Location or link', inp('location', v.location, 'required placeholder="Room, or a meeting link"'), 'f-location')}
      ${field('Agenda', txt('agenda', v.agenda, 3, 'required'), 'f-agenda')}
      <fieldset class="fieldset"><legend>Invite</legend>
        <label class="cbox"><input type="checkbox" name="all" ${v.mode === 'all' ? 'checked' : ''}>All members</label>
        <div class="field"><span class="lbl">Teams</span><div class="checks">${TEAMS.map(t => `<label class="cbox"><input type="checkbox" name="team" value="${t.id}" ${v.teamIds.includes(t.id) ? 'checked' : ''}>${esc(t.name)} <span class="faint">(${teamMembers(t.id).length})</span></label>`).join('')}</div></div>
        <div class="field"><span class="lbl">Individuals</span><div class="checks">${state.members.map(x => `<label class="cbox"><input type="checkbox" name="att" value="${x.id}" ${v.attendees.includes(x.id) || (v.teamIds.includes(x.team) && x.active !== false) ? 'checked' : ''}>${esc(x.name.split(' ')[0])} <span class="faint">${esc(roleLabel(x.role))}</span></label>`).join('')}</div></div>
        <span class="count-line" id="rcount"></span>
      </fieldset>
      <span class="err" id="merr" role="alert"></span>
    </div>
    ${foot(`<button class="btn btn-primary">${m ? 'Save & notify' : 'Schedule & invite'}</button>`, m ? `<button type="button" class="btn btn-del" data-act="del-meeting" data-id="${m.id}">${ic('trash')}Delete meeting</button>` : '')}
  </form>`);
  updateRecipientCount();
}
function formAudience(form) { const fd = new FormData(form); return {mode: fd.get('all') ? 'all' : 'custom', teamIds: fd.getAll('team'), attendees: fd.getAll('att')}; }
// Ticking a team ticks its members; a team stays ticked only while all its members are.
function syncMeetingTeams(form, changed) {
  const atts = [...form.querySelectorAll('input[name=att]')];
  if (changed?.name === 'team') { const ids = teamMembers(changed.value); atts.forEach(i => { if (ids.includes(i.value)) i.checked = changed.checked; }); }
  form.querySelectorAll('input[name=team]').forEach(t => { const boxes = atts.filter(i => teamMembers(t.value).includes(i.value)); t.checked = boxes.length > 0 && boxes.every(i => i.checked); });
}
function updateRecipientCount() {
  const form = $('form[data-form="meeting"]'); if (!form) return;
  const a = formAudience(form), n = recipients(a).length, el = $('#rcount');
  form.querySelectorAll('input[name=team], input[name=att]').forEach(i => i.disabled = a.mode === 'all');
  el.textContent = n ? `${n} unique ${n === 1 ? 'attendee' : 'attendees'}` : 'Pick at least one person or team';
  el.classList.toggle('zero', !n);
}

/* ---------- event ---------- */
function openEvent(id) {
  const ev = id ? eventById(id) : null;
  if (id && !ev) return;
  if (!ev || canEvent(ev)) {
    draft = ev ? JSON.parse(JSON.stringify(ev)) : {id:uid('ev'), name:'', description:'', date:addDays(today(), 21), location:'', team:me().team, assigned:[me().id], createdBy:me().id, tasks:[], _new:true};
    return renderEventForm();
  }
  const mine = ev.tasks.filter(t => t.owner === me().id).length, designs = state.designs.filter(d => d.event === ev.id);
  openDialog(`${dHead(ev.name, `${fmtDate(ev.date, {weekday:'long', day:'numeric', month:'long', year:'numeric'})} · ${esc(ev.location)}`)}
    <div class="dlg-body">
      ${readonlyNote(mine ? 'You can complete and reschedule your own requirements. The event team manages everything else.' : 'View only. The responsible team, its creator and leadership manage this event.')}
      ${ev.description ? `<p class="prose">${esc(ev.description)}</p>` : ''}
      <dl class="kv"><dt>Team</dt><dd>${esc(teamName(ev.team))}</dd><dt>Assigned</dt><dd>${ev.assigned.map(a => esc(member(a)?.name)).join(', ') || '—'}</dd><dt>Created by</dt><dd>${esc(member(ev.createdBy)?.name)}</dd></dl>
      ${progressBlock(ev)}
      <div class="sect"><span class="eyebrow">Checklist</span>${ev.tasks.map(t => { const own = t.owner === me().id;
        return `<div class="req-view ${t.done ? 'done' : ''}"><input type="checkbox" data-change="req-done" data-ev="${ev.id}" data-id="${t.id}" ${t.done ? 'checked' : ''} ${own ? '' : 'disabled'} aria-label="Complete ${esc(t.title)}"><span class="t">${esc(t.title)}</span><span class="own team-lbl">${esc(member(t.owner)?.name)}</span>
          <span class="due-ctl">${own ? `<input class="input" type="date" value="${t.due}" data-change="req-due" data-ev="${ev.id}" data-id="${t.id}" aria-label="Due date">` : `<span class="dd num faint" style="font-size:12.5px">${fmtDate(t.due)}</span>`}</span></div>`; }).join('') || '<span class="faint">No requirements yet.</span>'}</div>
      ${designs.length ? `<div class="sect"><span class="eyebrow">Design work</span>${designs.map(d => `<div class="req-view"><span></span><span class="t">${esc(d.title)}</span><span class="own team-lbl">${esc(member(d.owner)?.name)}</span>${canDesignStatus(d) ? `<button type="button" class="btn sm" data-act="open-design" data-id="${d.id}">${designBadge(d.status)}</button>` : designBadge(d.status)}</div>`).join('')}</div>` : ''}
    </div>${foot('')}`);
}
function renderEventForm() {
  const v = draft, isNew = !!v._new, designs = state.designs.filter(d => d.event === v.id);
  const html = `<form data-form="event" novalidate>
    ${dHead(isNew ? 'New event' : 'Edit event', isNew ? 'You’ll be recorded as the creator.' : `Created by ${esc(member(v.createdBy)?.name)}`)}
    <div class="dlg-body">
      ${field('Event name', `<input class="input" id="f-name" data-d="name" value="${esc(v.name)}" required>`, 'f-name')}
      ${field('Description', `<textarea class="input" id="f-desc" data-d="description" rows="2">${esc(v.description)}</textarea>`, 'f-desc')}
      <div class="grid3">${field('Date', `<input class="input" id="f-date" type="date" data-d="date" value="${v.date}" required>`, 'f-date')}${field('Location', `<input class="input" id="f-loc" data-d="location" value="${esc(v.location)}">`, 'f-loc')}${field('Responsible team', `<select class="input" id="f-team" data-d="team">${teamOpts(v.team)}</select>`, 'f-team')}</div>
      <div class="field"><span class="lbl">Assigned members</span><div class="picker">${state.members.map(m => `<button type="button" class="pick" data-act="ev-assign" data-id="${m.id}" aria-pressed="${v.assigned.includes(m.id)}">${avatar(m.id)}${esc(m.name.split(' ')[0])}</button>`).join('')}</div></div>
      <div class="sect"><span class="eyebrow">Checklist · ${v.tasks.filter(t => t.done).length}/${v.tasks.length} · ${pct(v.tasks.filter(t => t.done).length, v.tasks.length)}%</span>
        ${v.tasks.map(t => `<div class="req-edit"><input type="checkbox" data-rq="${t.id}" data-f="done" ${t.done ? 'checked' : ''} aria-label="Done" style="accent-color:var(--success);width:18px;height:18px">
          <input class="input" data-rq="${t.id}" data-f="title" value="${esc(t.title)}" placeholder="Requirement" aria-label="Requirement">
          <select class="input o" data-rq="${t.id}" data-f="owner" aria-label="Owner">${state.members.map(m => opt(m.id, m.name, t.owner)).join('')}</select>
          <input class="input du" type="date" data-rq="${t.id}" data-f="due" value="${t.due}" aria-label="Due date">
          <button type="button" class="btn btn-ghost sm icon-btn" data-act="req-del" data-id="${t.id}" aria-label="Remove requirement">${ic('x')}</button></div>`).join('')}
        <div><button type="button" class="btn sm" data-act="req-add">${ic('plus')}Add requirement</button></div></div>
      ${designs.length ? `<div class="sect"><span class="eyebrow">Design work for this event</span>${designs.map(d => `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><span>${esc(d.title)} <span class="faint">· ${esc(member(d.owner)?.name)}</span></span>${designBadge(d.status)}</div>`).join('')}</div>` : ''}
      <span class="err" id="eerr" role="alert"></span>
    </div>${foot(`<button class="btn btn-primary">${isNew ? 'Create event' : 'Save event'}</button>`)}
  </form>`;
  const keep = dlg().open ? dlg().scrollTop : 0;
  openDialog(html); dlg().scrollTop = keep;
}

/* ---------- idea ---------- */
function openIdea(id) {
  const i = id ? state.ideas.find(x => x.id === id) : null;
  if (id && !i) return;
  if (i && !canIdea(i)) {
    openDialog(`${dHead(i.title, `${esc(teamName(i.team))} team · owner ${esc(member(i.owner)?.name)}`, ideaBadge(i.stage))}
      <div class="dlg-body">${readonlyNote('Read-only. The owner, collaborators and leadership can edit this idea.')}
        ${i.description ? `<p class="prose">${esc(i.description)}</p>` : ''}
        <dl class="kv"><dt>Collaborators</dt><dd>${i.assigned.map(a => esc(member(a)?.name)).join(', ') || '—'}</dd><dt>Next step</dt><dd>${esc(i.next || '—')}</dd><dt>Target date</dt><dd>${fmtDateY(i.due)}</dd><dt>Notes</dt><dd style="white-space:pre-wrap">${esc(i.notes || '—')}</dd></dl></div>${foot('')}`);
    return;
  }
  const v = i || {title:'', description:'', team:me().team, owner:me().id, assigned:[], stage:'submitted', notes:'', next:'', due:addDays(today(), 14)};
  openDialog(`<form data-form="idea" data-id="${i ? i.id : ''}" novalidate>
    ${dHead(i ? 'Edit idea' : 'Submit an idea', i ? 'Owners, collaborators and leadership can edit.' : 'Anyone can submit. The next step becomes a deadline.')}
    <div class="dlg-body">
      ${field('Title', inp('title', v.title, 'required'), 'f-title')}
      ${field('Description', txt('description', v.description, 2), 'f-description')}
      <div class="grid3">${field('Stage', `<select class="input" id="f-stage" name="stage">${IDEA_STAGES.map(s => opt(s, IDEA_LABEL[s], v.stage)).join('')}</select>`, 'f-stage')}${field('Team', `<select class="input" id="f-team" name="team">${teamOpts(v.team)}</select>`, 'f-team')}${field('Owner', `<select class="input" id="f-owner" name="owner">${state.members.map(m => opt(m.id, m.name, v.owner)).join('')}</select>`, 'f-owner')}</div>
      <div class="field"><span class="lbl">Collaborators</span><div class="checks">${state.members.map(m => `<label class="cbox"><input type="checkbox" name="assigned" value="${m.id}" ${v.assigned.includes(m.id) ? 'checked' : ''}>${esc(m.name.split(' ')[0])}</label>`).join('')}</div></div>
      <div class="grid2">${field('Next step', inp('next', v.next, 'placeholder="e.g. Draft a one-page format"'), 'f-next')}${field('Target date', inp('due', v.due, 'type="date"'), 'f-due')}</div>
      ${field('Notes', txt('notes', v.notes, 2), 'f-notes')}
      <span class="err" id="ierr" role="alert"></span>
    </div>
    ${foot(`<button class="btn btn-primary">${i ? 'Save idea' : 'Submit idea'}</button>`, i ? `<button type="button" class="btn btn-del" data-act="del-idea" data-id="${i.id}">${ic('trash')}Delete idea</button>` : '')}
  </form>`);
}

/* ---------- follow-up task ---------- */
function openTask() {
  openDialog(`<form data-form="task" novalidate>${dHead('Add a follow-up', oversight() ? 'Assign it to anyone.' : 'Follow-ups you add are assigned to you.')}
    <div class="dlg-body">
      ${field('What needs doing?', inp('title', '', 'required placeholder="e.g. Send thank-you notes to Rise speakers"'), 'f-title')}
      <div class="grid2">${field('Due', inp('due', addDays(today(), 3), 'type="date" required'), 'f-due')}${field('Related to', inp('related', '', 'placeholder="Event, project or topic" list="rel-list"') + `<datalist id="rel-list">${state.events.map(e => `<option value="${esc(e.name)}">`).join('')}</datalist>`, 'f-related')}</div>
      ${field('Owner', `<select class="input" id="f-owner" name="owner" ${oversight() ? '' : 'disabled'}>${memberOpts(me().id)}</select>`, 'f-owner')}
    </div>${foot('<button class="btn btn-primary">Add follow-up</button>')}</form>`, 'narrow');
}

/* ---------- design ---------- */
function openDesign(id) {
  const d = id ? state.designs.find(x => x.id === id) : null;
  if (id && !d) return;
  if (!access('design')) {
    if (!d) { toast('Your role doesn’t include the Design section', '', true); return; }
    const own = d.owner === me().id;
    openDialog(`${dHead(d.title, `${esc(d.event ? eventById(d.event)?.name : d.campaign)} · due ${fmtDateY(d.due)}`, designBadge(d.status))}
      <div class="dlg-body">${readonlyNote(own ? 'You’re assigned to this. You can update its status; PR and leadership edit the brief.' : 'View only.')}
        <div class="sect"><span class="eyebrow">Brief</span><p class="prose">${esc(d.brief)}</p></div>
        <dl class="kv"><dt>Deliverables</dt><dd>${esc(d.deliverables)}</dd><dt>Assigned to</dt><dd>${esc(member(d.owner)?.name)}</dd></dl>
        ${own ? field('Status', `<select class="input" id="f-dstat" data-change="design-status" data-id="${d.id}">${DESIGN_STATUS.map(s => opt(s, DESIGN_LABEL[s], d.status)).join('')}</select>`, 'f-dstat') : ''}
      </div>${foot('')}`, 'narrow');
    return;
  }
  const v = d || {title:'', event:'', campaign:'', brief:'', deliverables:'', owner:(state.members.find(m => m.role === 'design') || me()).id, due:addDays(today(), 10), status:'requested'};
  openDialog(`<form data-form="design" data-id="${d ? d.id : ''}" novalidate>${dHead(d ? 'Edit design request' : 'New design request')}
    <div class="dlg-body">
      ${field('Title', inp('title', v.title, 'required'), 'f-title')}
      <div class="grid2">${field('Event', `<select class="input" id="f-event" name="event">${eventOpts(v.event, 'No event — campaign only')}</select>`, 'f-event')}${field('Campaign', inp('campaign', v.campaign, 'placeholder="If there’s no event"'), 'f-campaign')}</div>
      ${field('Brief', txt('brief', v.brief, 3, 'required'), 'f-brief')}
      ${field('Deliverables', inp('deliverables', v.deliverables, 'placeholder="e.g. A3 poster, IG story"'), 'f-deliverables')}
      <div class="grid3">${field('Assigned to', `<select class="input" id="f-owner" name="owner">${memberOpts(v.owner)}</select>`, 'f-owner')}${field('Due', inp('due', v.due, 'type="date" required'), 'f-due')}${field('Status', `<select class="input" id="f-status" name="status">${DESIGN_STATUS.map(s => opt(s, DESIGN_LABEL[s], v.status)).join('')}</select>`, 'f-status')}</div>
      <span class="err" id="derr" role="alert"></span>
    </div>${foot(`<button class="btn btn-primary">${d ? 'Save request' : 'Create request'}</button>`)}</form>`);
}

/* ---------- startup ---------- */
function openStartup(id) {
  if (!access('startups')) return;
  const s = id ? state.startups.find(x => x.id === id) : null;
  draft = s ? JSON.parse(JSON.stringify(s)) : {id:uid('s'), name:'', sector:'', contacts:[], notes:'', attendance:[], rating:null, _new:true};
  if (!draft.contacts.length) draft.contacts.push({id:uid('c'), name:'', email:'', phone:'', primary:true});
  renderStartupForm();
}
function renderStartupForm() {
  const v = draft, one = v.contacts.length === 1, del = v.deletion, approver = canApproveStartupDeletion();
  const keep = dlg().open ? dlg().scrollTop : 0;
  const delBanner = del ? `<div class="del-pending"><div><b>Deletion requested</b> by ${esc(member(del.by)?.name || 'a member')} · ${fmtStamp(del.at)}${del.reason ? `<br><span class="muted">“${esc(del.reason)}”</span>` : ''}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">${approver ? `<button type="button" class="btn sm btn-danger-solid" data-act="startup-approve" data-id="${v.id}">Approve & delete</button><button type="button" class="btn sm" data-act="startup-keep" data-id="${v.id}">Keep startup</button>`
        : del.by === me().id ? `<button type="button" class="btn sm" data-act="startup-keep" data-id="${v.id}">Cancel my request</button><span class="faint" style="font-size:12.5px;align-self:center">Waiting for an admin or the President</span>` : '<span class="faint" style="font-size:12.5px">Waiting for an admin or the President to decide.</span>'}</div></div>` : '';
  const delBtn = v._new || del ? '' : `<button type="button" class="btn btn-del" data-act="startup-delete" data-id="${v.id}">${ic('trash')}${approver ? 'Delete startup' : 'Request deletion'}</button>`;
  openDialog(`<form data-form="startup">${dHead(v._new ? 'Add startup' : v.name || 'Startup', v._new ? '' : (missingContact(v) ? '<span class="review">Missing contact details</span>' : 'Contact details complete'))}
    <div class="dlg-body">${delBanner}
      <div class="grid2">${field('Company', `<input class="input" id="f-sname" data-d="name" value="${esc(v.name)}" required>`, 'f-sname')}${field('Sector', `<input class="input" id="f-sector" data-d="sector" value="${esc(v.sector)}">`, 'f-sector')}</div>
      <div class="sect"><span class="eyebrow">Contacts · exactly one primary</span>
        ${v.contacts.map(c => `<div class="contact-edit">
          ${field('Name', `<input class="input" data-ct="${c.id}" data-f="name" value="${esc(c.name)}">`)}${field('Email', `<input class="input" type="email" data-ct="${c.id}" data-f="email" value="${esc(c.email)}">`)}${field('Phone', `<input class="input" type="tel" data-ct="${c.id}" data-f="phone" value="${esc(c.phone)}">`)}
          <div class="row2"><label class="cbox"><input type="radio" name="primary" value="${c.id}" data-change="ct-primary" ${c.primary ? 'checked' : ''}>Primary contact</label>
            <button type="button" class="btn btn-ghost sm" data-act="ct-del" data-id="${c.id}" ${one ? 'disabled title="A startup keeps at least one contact"' : ''}>Remove</button></div></div>`).join('')}
        <div><button type="button" class="btn sm" data-act="ct-add">${ic('plus')}Add contact</button></div>
        <span class="muted-note">You can save incomplete details and follow up later.</span></div>
      <div class="field"><span class="lbl">Previous events attended</span><div class="checks">${PAST_EVENTS.map(e => `<label class="cbox"><input type="checkbox" data-att="${esc(e)}" ${v.attendance.includes(e) ? 'checked' : ''}>${esc(e)}</label>`).join('')}</div></div>
      ${field('Notes', `<textarea class="input" id="f-snotes" data-d="notes" rows="4">${esc(v.notes)}</textarea>`, 'f-snotes')}
      ${v.rating != null ? `<span class="muted-note">Overall rating from the sheet: ${v.rating}/10</span>` : ''}
    </div>${foot(`<button class="btn btn-primary">${v._new ? 'Add startup' : 'Save startup'}</button>`, delBtn)}</form>`);
  dlg().scrollTop = keep;
}
// Non-approvers ask for deletion; an admin or the President approves or keeps it.
function openDeletionRequest(id) {
  const s = state.startups.find(x => x.id === id); if (!s) return;
  pendingDeletion = null;
  const c = $('#confirm');
  c.innerHTML = `<div class="dlg-head"><div style="flex:1"><h2>Ask to delete “${esc(s.name)}”?</h2><div class="sub">An admin or the President has to approve it. Nothing is deleted until then.</div></div></div>
    <div class="dlg-body">${field('Why should it go?', '<textarea class="input" id="del-reason" rows="3" placeholder="e.g. Duplicate of another record, or the company has closed"></textarea>', 'del-reason')}</div>
    <div class="dlg-foot"><span class="spacer"></span><button type="button" class="btn" data-act="del-cancel">Cancel</button><button type="button" class="btn btn-primary" data-act="startup-request-send" data-id="${s.id}">Send for approval</button></div>`;
  c.showModal();
}
function setStartupDeletion(id, value) {
  const s = state.startups.find(x => x.id === id); if (!s) return null;
  s.deletion = value;
  if (draft && draft.id === id) { draft.deletion = value; if (dlg().open && $('form[data-form="startup"]')) renderStartupForm(); }
  save(); render();
  if (dlg().open && dlg().classList.contains('notif-pop')) openNotifications();
  return s;
}

/* ---------- budget ---------- */
function receiptField(val) {
  return field('Receipt', `<div style="display:flex;gap:8px;flex-wrap:wrap"><input class="input" id="f-receipt" name="receipt" value="${esc(val || '')}" placeholder="filename.pdf" style="flex:1;min-width:160px"><label class="btn sm" style="cursor:pointer">Choose file<input type="file" data-change="receipt-file" style="display:none"></label></div><span class="muted-note">Only the filename is saved. The file itself isn’t read, uploaded or kept.</span>`, 'f-receipt');
}
function openAlloc() {
  const b = state.budget;
  openDialog(`<form data-form="alloc" novalidate>${dHead('Budget allocations', 'Event allocations can’t add up to more than the overall budget.')}
    <div class="dlg-body">${field('Overall club budget (AED)', `<input class="input num" id="f-overall" name="overall" type="number" min="0" step="100" value="${b.overall}" required>`, 'f-overall')}
      ${state.events.map(e => field(`${esc(e.name)} <span class="faint">· ${fmtDate(e.date, {day:'numeric', month:'short'})}</span>`, `<input class="input num" name="al_${e.id}" type="number" min="0" step="100" value="${b.allocations[e.id] ?? 0}" data-change="alloc-sum">`)).join('')}
      <span class="count-line" id="alsum"></span></div>${foot('<button class="btn btn-primary">Save allocations</button>')}</form>`, 'narrow');
  allocSum();
}
function allocSum() { const f = $('form[data-form="alloc"]'); if (!f) return; const fd = new FormData(f); let s = 0; state.events.forEach(e => s += +fd.get('al_' + e.id) || 0);
  const over = s > (+fd.get('overall') || 0); const el = $('#alsum'); el.textContent = `Allocated ${aed(s)} of ${aed(+fd.get('overall') || 0)}${over ? ' — over the overall budget' : ''}`; el.classList.toggle('zero', over); return {s, over}; }
function openExpense(id) {
  const e = id ? state.budget.expenses.find(x => x.id === id) : null, v = e || {name:'', event:state.events[0]?.id, planned:0, actual:0, receipt:''};
  openDialog(`<form data-form="expense" data-id="${e ? e.id : ''}" novalidate>${dHead(e ? 'Edit expense' : 'Add expense')}
    <div class="dlg-body">${field('Expense', inp('name', v.name, 'required'), 'f-name')}${field('Event', `<select class="input" id="f-event" name="event">${eventOpts(v.event)}</select>`, 'f-event')}
      <div class="grid2">${field('Planned (AED)', inp('planned', v.planned, 'type="number" min="0" step="10"'), 'f-planned')}${field('Actual (AED)', inp('actual', v.actual, 'type="number" min="0" step="10"'), 'f-actual')}</div>${receiptField(v.receipt)}</div>
    ${foot(`<button class="btn btn-primary">${e ? 'Save expense' : 'Add expense'}</button>`)}</form>`, 'narrow');
}
function openReimb(id) {
  const r = id ? state.budget.reimbursements.find(x => x.id === id) : null, v = r || {name:'', member:me().id, event:state.events[0]?.id, amount:0, status:'Requested', receipt:''};
  openDialog(`<form data-form="reimb" data-id="${r ? r.id : ''}" novalidate>${dHead(r ? 'Edit reimbursement' : 'Add reimbursement', 'Kept separate from expenses so a cost is never counted twice.')}
    <div class="dlg-body">${field('What was bought', inp('name', v.name, 'required'), 'f-name')}
      <div class="grid2">${field('Member', `<select class="input" id="f-member" name="member">${memberOpts(v.member)}</select>`, 'f-member')}${field('Event', `<select class="input" id="f-event" name="event">${eventOpts(v.event)}</select>`, 'f-event')}</div>
      <div class="grid2">${field('Amount (AED)', inp('amount', v.amount, 'type="number" min="0" step="10" required'), 'f-amount')}${field('Status', `<select class="input" id="f-status" name="status">${REIMB_STATUS.map(s => opt(s, s, v.status)).join('')}</select>`, 'f-status')}</div>${receiptField(v.receipt)}</div>
    ${foot(`<button class="btn btn-primary">${r ? 'Save' : 'Add reimbursement'}</button>`)}</form>`, 'narrow');
}

/* ---------- member, kb ---------- */
function openMember(id) {
  const m = member(id);
  openDialog(`<form data-form="member" data-id="${m.id}">${dHead(m.name, `${esc(roleLabel(m.role))} · ${esc(teamName(m.team))} team · <span class="mono">${esc(m.email)}</span>`)}
    <div class="dlg-body"><div style="display:flex;gap:8px;flex-wrap:wrap">${waBtn('person', m.id, 'Message on WhatsApp')}${waBtn('team', m.team, teamName(m.team) + ' group')}</div>
      ${field('Responsibility', txt('responsibility', m.responsibility, 3, oversight() ? '' : 'disabled'), 'f-responsibility')}
      <span class="muted-note">${isAdmin() ? 'Change their role, team or login from the Admin section.' : 'Admins change roles, teams and logins.'}</span></div>
    ${foot(oversight() ? '<button class="btn btn-primary">Save responsibility</button>' : '')}</form>`, 'narrow');
}
function openKB(id) {
  const a = state.kb.find(x => x.id === id); if (!a) return;
  const by = member(a.updatedBy)?.name;
  openDialog(`${dHead(a.title, esc(a.summary), `<span class="tag">${esc(a.category)}</span>${a.roles.includes(state.role) ? '<span class="tag for-you">For your role</span>' : ''}`)}
    <div class="dlg-body"><div class="md">${mdToHtml(a.body)}</div>
      <span class="kb-meta">${a.updatedAt ? `Last updated ${fmtStamp(a.updatedAt)}${by ? ` by ${esc(by)}` : ''} · ` : ''}Club guidance, not official university policy.</span></div>
    ${isAdmin() ? foot(`<button type="button" class="btn btn-primary" data-act="kb-edit" data-id="${a.id}">${ic('edit')}Edit article</button>`, `<button type="button" class="btn btn-del" data-act="kb-delete" data-id="${a.id}">${ic('trash')}Delete</button>`) : foot('')}`);
}
function openKBEditor(id) {
  if (!isAdmin()) return toast('Only admins can edit the knowledge base', '', true);
  const a = id ? state.kb.find(x => x.id === id) : null;
  draft = a ? {...a, roles:[...a.roles], _preview:false} : {id:uid('kb'), title:'', category:'', roles:[], summary:'', body:'## What this covers\n\nWrite the steps below.\n\n1. First step\n2. Second step', _new:true, _preview:false};
  renderKBEditor();
}
function renderKBEditor() {
  const v = draft, cats = [...new Set(state.kb.map(a => a.category).filter(Boolean))].sort();
  const keep = dlg().open ? dlg().scrollTop : 0;
  openDialog(`<form data-form="kb" novalidate>${dHead(v._new ? 'New article' : 'Edit article', 'Formatting uses Markdown. The toolbar inserts it for you.')}
    <div class="dlg-body">
      ${field('Title', `<input class="input" id="f-kbtitle" data-d="title" value="${esc(v.title)}" required>`, 'f-kbtitle')}
      <div class="grid2">${field('Category', `<input class="input" id="f-kbcat" data-d="category" value="${esc(v.category)}" list="kb-cats" placeholder="e.g. Event planning"><datalist id="kb-cats">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist>`, 'f-kbcat')}
        ${field('One-line summary', `<input class="input" id="f-kbsum" data-d="summary" value="${esc(v.summary)}" placeholder="Shown on the article card">`, 'f-kbsum')}</div>
      <div class="field"><span class="lbl">Show first for these roles <span class="faint">(everyone can read every article)</span></span><div class="checks">${ROLES.map(r => `<label class="cbox"><input type="checkbox" data-kbrole="${r.id}" ${v.roles.includes(r.id) ? 'checked' : ''}>${esc(r.label)}</label>`).join('')}</div></div>
      <div class="field"><div style="display:flex;justify-content:space-between;align-items:end;gap:8px"><span class="lbl">Article</span>${seg('kb-tab', v._preview ? 'preview' : 'write', [['write','Write'], ['preview','Preview']])}</div>
        <div>${v._preview ? `<div class="md-preview md">${mdToHtml(v.body) || '<span class="faint">Nothing to preview yet.</span>'}</div>` : `
          <div class="md-toolbar" role="toolbar" aria-label="Formatting">
            <button type="button" data-act="md" data-md="bold" title="Bold"><b>B</b></button><button type="button" data-act="md" data-md="italic" title="Italic"><i>I</i></button>
            <button type="button" data-act="md" data-md="h2" title="Heading">H</button><span class="sep"></span>
            <button type="button" data-act="md" data-md="ul" title="Bulleted list">• List</button><button type="button" data-act="md" data-md="ol" title="Numbered steps">1. Steps</button>
            <button type="button" data-act="md" data-md="quote" title="Callout">❝ Note</button><button type="button" data-act="md" data-md="hr" title="Divider">—</button><span class="sep"></span>
            <button type="button" data-act="md" data-md="link" title="Link">${ic('link')}Link</button>
            <button type="button" data-act="md" data-md="image" title="Image from a web address">${ic('image')}Image link</button>
            <label title="Upload an image">${ic('plus')}Upload image<input type="file" accept="image/png,image/jpeg,image/gif,image/webp" data-change="kb-image" style="display:none"></label>
          </div>
          <textarea class="input md-editor" id="kb-body" data-d="body" rows="14" aria-label="Article text">${esc(v.body)}</textarea>`}</div>
        <span class="muted-note">**bold** · *italic* · ## heading · - list · 1. steps · > note · [text](https://link) · ![caption](https://image)</span></div>
      <span class="err" id="kberr" role="alert"></span>
    </div>${foot(`<button class="btn btn-primary">${v._new ? 'Publish article' : 'Save article'}</button>`)}</form>`);
  dlg().scrollTop = keep;
}
// Wraps or prefixes the selected text in the editor with Markdown.
function mdInsert(kind, text) {
  const ta = $('#kb-body'); if (!ta) return;
  const s = ta.selectionStart, e = ta.selectionEnd, sel = ta.value.slice(s, e);
  const lead = s > 0 && ta.value[s - 1] !== '\n' ? '\n' : '';
  const lines = (pre, ph) => lead + (sel || ph).split('\n').map((l, i) => (typeof pre === 'function' ? pre(i) : pre) + l).join('\n');
  let ins, from, to;
  if (kind === 'bold' || kind === 'italic') { const m = kind === 'bold' ? '**' : '*', t = sel || (kind === 'bold' ? 'bold text' : 'italic text'); ins = m + t + m; from = m.length; to = from + t.length; }
  else if (kind === 'link') { const t = sel || 'link text'; ins = `[${t}](https://)`; from = t.length + 3; to = from + 8; }
  else if (kind === 'image') { ins = `${lead}![${sel || 'Image description'}](https://)\n`; from = ins.length - 9; to = ins.length - 2; }
  else if (kind === 'upload') { ins = `${lead}![${text.alt}](${text.url})\n`; from = to = ins.length; }
  else if (kind === 'hr') { ins = `${lead}\n---\n`; from = to = ins.length; }
  else { ins = kind === 'h2' ? lines('## ', 'Heading') : kind === 'ul' ? lines('- ', 'List item') : kind === 'ol' ? lines(i => `${i + 1}. `, 'Step') : lines('> ', 'Note'); from = lead.length; to = ins.length; }
  ta.setRangeText(ins, s, e, 'end'); ta.focus(); ta.setSelectionRange(s + from, s + to);
  if (draft) draft.body = ta.value;
}
async function insertKBImage(file) {
  if (!file) return;
  if (!/^image\/(png|jpe?g|gif|webp)$/.test(file.type)) return toast('Use a PNG, JPG, GIF or WebP image', '', true);
  try {
    let url;
    if (LIVE) { if (file.size > 5e6) return toast('Images must be under 5 MB', '', true); toast('Uploading image…'); url = await uploadKbImage(file); }
    else {
      if (file.size > 7e5) return toast('The demo can only keep images under 700 KB — paste an image link instead', '', true);
      url = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
    }
    mdInsert('upload', {alt:file.name.replace(/\.[^.]+$/, '').replace(/[[\]]/g, ''), url});
  } catch (e) { toast('Couldn’t add the image: ' + e.message, '', true); }
}

/* ---------- notifications ---------- */
function openNotifications() {
  const items = attentionItems(), ups = updatesForMe().slice(0, 20), seen = lastSeen();
  const row = it => it.kind === 'startup-deletion'
    ? `<div class="nitem"><span class="dot over"></span><div><div class="lbl">${esc(it.label)}</div><div class="ttl">${esc(it.title)}</div><div class="sb">${esc(it.sub)}</div></div><span></span>
        <div class="acts"><button type="button" class="btn sm btn-danger-solid" data-act="startup-approve" data-id="${it.id}">Approve deletion</button><button type="button" class="btn sm" data-act="startup-keep" data-id="${it.id}">Keep startup</button></div></div>`
    : `<div class="nitem click" data-act="notif-open" data-a="${it.act}" data-id="${esc(it.id || '')}" tabindex="0"><span class="dot ${it.tone}"></span><div><div class="lbl">${esc(it.label)}</div><div class="ttl">${esc(it.title)}</div><div class="sb">${esc(it.sub)}</div></div><span class="faint" aria-hidden="true">›</span></div>`;
  openDialog(`<div class="dlg-head"><div style="flex:1"><h2>Notifications</h2><div class="sub">${items.length ? `${items.length} ${items.length === 1 ? 'thing needs' : 'things need'} your attention` : 'Nothing needs you right now'}</div></div>${closeBtn()}</div>
    <div style="padding-bottom:8px">${items.length ? `<div class="notif-sec">Needs your attention</div>${items.map(row).join('')}` : '<div class="empty">You’re all caught up.</div>'}
      ${ups.length ? `<div class="notif-sec">Meeting updates</div>${ups.map(n => `<div class="nitem"><span class="dot ${new Date(n.at) > seen ? (n.kind === 'cancel' ? 'over' : '') : 'read'}"></span><div><div class="ttl">${esc(n.title)}</div><div class="sb">${esc(n.details)}</div></div><time>${fmtStamp(n.at)}</time></div>`).join('')}` : ''}</div>`, 'notif-pop');
  markSeen(); render();
}

/* ================= deletion ================= */
const deletionRecord = (kind, id) => ({meeting:state.meetings, idea:state.ideas, startup:state.startups, kb:state.kb}[kind] || adminData.members || state.members).find(x => x.id === id);
const DENY = {meeting:'Only the Executive Assistant can delete meetings', member:'You can’t remove yourself or the last admin', startup:'Deleting a startup needs an admin or the President', kb:'Only admins can delete articles', idea:'Only the owner, collaborators or leadership can delete this idea'};
function requestDeletion(kind, id) {
  const rec = deletionRecord(kind, id);
  if (!deletable(kind, rec)) { toast(DENY[kind], '', true); return; }
  pendingDeletion = {kind, id};
  const name = kind === 'member' || kind === 'startup' ? rec.name : rec.title;
  const consequence = kind === 'meeting'
    ? `A cancellation notice goes to its ${recipients(rec).length} current attendees${state.calendar.connected ? ' and the calendar entry is cancelled (simulated)' : ''}. Past notifications stay in the log.`
    : kind === 'startup' ? `Its contacts, notes and attendance history are deleted for everyone.${rec.deletion ? ` Requested by ${member(rec.deletion.by)?.name || 'a member'}${rec.deletion.reason ? `: “${rec.deletion.reason}”` : ''}.` : ''}`
    : kind === 'kb' ? 'The article disappears for everyone. Any images uploaded for it stay in storage.'
    : kind === 'member' ? `${rec.name} (${rec.email}) loses access straight away. Anything they owned becomes unassigned, and they’re taken off meeting invites, event assignments and idea collaborators. To keep their history instead, disable their login.`
    : `Its next step${rec.next ? ` (“${rec.next}”)` : ''} disappears from Deadlines too. Separate follow-up tasks aren’t affected.`;
  const c = $('#confirm');
  c.innerHTML = `<div class="dlg-head"><div style="flex:1"><h2>Delete “${esc(name)}”?</h2></div></div>
    <div class="dlg-body"><p class="prose" style="margin:0">${esc(consequence)}</p><p class="prose" style="margin:0;color:var(--ember)">This is permanent. There’s no trash or undo in this demo.</p></div>
    <div class="dlg-foot"><span class="spacer"></span><button type="button" class="btn" data-act="del-cancel" autofocus>Keep item</button><button type="button" class="btn btn-danger-solid" data-act="del-confirm">Delete permanently</button></div>`;
  c.showModal();
}
function cancelDeletion() { pendingDeletion = null; const c = $('#confirm'); if (c.open) c.close(); }
function confirmDeletion() {
  const p = pendingDeletion; if (!p) return cancelDeletion();
  const rec = deletionRecord(p.kind, p.id);
  if (!deletable(p.kind, rec)) { cancelDeletion(); toast('That can’t be deleted with your current role', '', true); return; }
  if (p.kind === 'member') { cancelDeletion(); return runAdmin('remove', {id:rec.id}, `Removed ${rec.name}`, rec.email); }
  if (p.kind === 'startup') { state.startups = state.startups.filter(x => x.id !== rec.id); cancelDeletion(); return finish(`Deleted ${rec.name}`, 'removed from the directory'); }
  if (p.kind === 'kb') { state.kb = state.kb.filter(x => x.id !== rec.id); cancelDeletion(); return finish(`Deleted “${rec.title}”`); }
  if (p.kind === 'meeting') {
    notify('cancel', `Meeting cancelled: ${rec.title}`, `${fmtDate(rec.date)} · ${fmtTime(rec.start)}–${fmtTime(rec.end)} · ${rec.location}`, recipients(rec));
    state.meetings = state.meetings.filter(x => x.id !== rec.id);
  } else state.ideas = state.ideas.filter(x => x.id !== rec.id);
  cancelDeletion();
  finish(p.kind === 'meeting' ? `Deleted “${rec.title}”` : `Deleted idea “${rec.title}”`, p.kind === 'meeting' ? `cancellation sent to ${recipients(rec).length} (simulated)` : 'next step removed from Deadlines');
}

/* ================= toasts ================= */
function toast(msg, sub, warn) {
  const t = document.createElement('div'); t.className = 'toast' + (warn ? ' warn' : '');
  t.innerHTML = `<span>${esc(msg)}</span>${sub ? `<span class="mono">${esc(sub)}</span>` : ''}`;
  $('#toasts').appendChild(t); setTimeout(() => t.remove(), 3800);
}

/* ================= navigation & render ================= */
const VIEWS = {overview:vOverview, meetings:vMeetings, events:vEvents, ideas:vIdeas, deadlines:vDeadlines, startups:vStartups, budget:vBudget, design:vDesign, members:vMembers, kb:vKB, admin:vAdmin};
function go(v) {
  if (!access(v)) { toast(`${roleLabel(state.role)} doesn’t include ${sectionLabel(v)}`, '', true); return; }
  view = v; closeDialog(); render(); window.scrollTo(0, 0);
}
function render() {
  if (!state) return;
  if (!access(view)) view = 'overview';
  renderShell();
  $('#main').innerHTML = (storageOk ? '' : `<div class="banner warn-store" style="max-width:1240px;margin:0 auto 16px">${ic('info')}This browser isn’t saving changes. They’ll last until you close the page.</div>`) + VIEWS[view]();
}
function switchRole(role) {   // demo only — in live mode your role comes from your account
  if (LIVE || !ROLES.some(r => r.id === role)) return;
  cancelDeletion(); closeDialog();
  state.role = role; state.meId = state.members.find(m => m.role === role && m.active !== false)?.id || state.members.find(m => m.role === role).id; save(); view = 'overview'; render(); window.scrollTo(0, 0);
  toast(`Now viewing as ${roleLabel(role)}`, me().name);
}

/* ================= actions ================= */
const ACT = {
  go: el => go(el.dataset.v),
  close: () => closeDialog(),
  more: () => moreSheet(),
  reset: () => { if (LIVE) return; cancelDeletion(); closeDialog(); const r = state.role; state = seed(); state.role = r; state.meId = state.members.find(m => m.role === r).id; save(); render(); toast('Demo data reset'); },
  'sign-out': () => { if (LIVE) { closeDialog(); signOut(); } },
  'admin-refresh': () => { adminData.members = null; adminData.error = ''; render(); },
  'admin-invite': () => openAdminInvite(),
  'admin-edit': el => openAdminEdit(el.dataset.id),
  'admin-disable': el => runAdmin('disable', {id:el.dataset.id}, 'Login disabled', 'they can’t sign in or see any data'),
  'admin-enable': el => runAdmin('enable', {id:el.dataset.id}, 'Login re-enabled'),
  'admin-resend': el => runAdmin('resend', {id:el.dataset.id}, 'Sign-in link sent', LIVE ? '' : 'simulated in the demo'),
  'admin-remove': el => requestDeletion('member', el.dataset.id),
  notif: () => openNotifications(),
  'notif-open': el => { const a = el.dataset.a, id = el.dataset.id;
    if (a === 'go') return go(id);
    if (a === 'notif-ideas') { filters.ideas = {team:'all', owner:'all', stage:'submitted', scope:'all'}; filters.ideaStageM = 'submitted'; return go('ideas'); }
    if (a === 'notif-budget') return go('budget');
    ACT[a]?.({dataset:{id}}); },
  'drive-missing': () => { if (isAdmin()) { go('admin'); toast('Add the Design Drive link under Links'); } else toast('No Design Drive link yet — ask an admin to add it', '', true); },
  'startup-delete': el => canApproveStartupDeletion() ? requestDeletion('startup', el.dataset.id) : openDeletionRequest(el.dataset.id),
  'startup-approve': el => requestDeletion('startup', el.dataset.id),
  'startup-request-send': el => { const reason = ($('#del-reason')?.value || '').trim();
    if (!access('startups')) return;
    cancelDeletion(); setStartupDeletion(el.dataset.id, {by:me().id, at:new Date().toISOString(), reason});
    toast('Deletion requested', 'an admin or the President needs to approve it'); },
  'startup-keep': el => { const s = state.startups.find(x => x.id === el.dataset.id); if (!s?.deletion) return;
    const mine = s.deletion.by === me().id;
    if (!canApproveStartupDeletion() && !mine) return toast('Only an admin or the President can decide', '', true);
    setStartupDeletion(s.id, null); toast(canApproveStartupDeletion() && !mine ? `Kept ${s.name}` : 'Request cancelled', canApproveStartupDeletion() && !mine ? 'deletion request declined' : ''); },
  'kb-new': () => openKBEditor(null),
  'kb-edit': el => openKBEditor(el.dataset.id),
  'kb-delete': el => requestDeletion('kb', el.dataset.id),
  'kb-tab': el => { if (!draft) return; const ta = $('#kb-body'); if (ta) draft.body = ta.value; draft._preview = el.dataset.v === 'preview'; renderKBEditor(); },
  md: el => mdInsert(el.dataset.md),
  'sum-meetings': () => { filters.meetings = 'upcoming'; go('meetings'); },
  'sum-events': () => { filters.events = 'mine'; go('events'); },
  'sum-tasks': () => { filters.deadlines = 'pending'; go('deadlines'); },
  'sum-ideas': () => { filters.ideas = {team:'all', owner:'all', stage:'active', scope:'mine'}; if (isM()) filters.ideaStageM = 'progress'; go('ideas'); },
  'meet-f': el => { filters.meetings = el.dataset.v; render(); },
  'ev-f': el => { filters.events = el.dataset.v; render(); },
  'dl-f': el => { filters.deadlines = el.dataset.v; render(); },
  'design-f': el => { filters.design = el.dataset.v; render(); },
  'idea-tab': el => { filters.ideaStageM = el.dataset.v; render(); },
  'idea-clear': () => { filters.ideas = {team:'all', owner:'all', stage:'all', scope:'all'}; render(); },
  'st-view': el => { filters.startups.view = el.dataset.v; render(); },
  'st-card': el => { const v = el.dataset.v; Object.assign(filters.startups, {q:'', sector:'all', att: v === 'any' || v === 'never' ? v : 'all', missing: v === 'missing'}); render(); },
  'st-clear': () => { Object.assign(filters.startups, {q:'', sector:'all', att:'all', missing:false}); render(); },
  'new-meeting': () => openMeeting(null), 'open-meeting': el => openMeeting(el.dataset.id), 'del-meeting': el => requestDeletion('meeting', el.dataset.id),
  'new-event': () => openEvent(null), 'open-event': el => openEvent(el.dataset.id),
  'new-idea': () => openIdea(null), 'open-idea': el => openIdea(el.dataset.id), 'del-idea': el => requestDeletion('idea', el.dataset.id),
  'new-task': () => openTask(),
  'new-design': () => openDesign(null), 'open-design': el => openDesign(el.dataset.id),
  'new-startup': () => openStartup(null), 'open-startup': el => openStartup(el.dataset.id),
  'edit-alloc': () => openAlloc(), 'new-expense': () => { if (access('budget')) openExpense(null); }, 'edit-expense': el => openExpense(el.dataset.id), 'new-reimb': () => openReimb(null), 'edit-reimb': el => openReimb(el.dataset.id),
  'edit-member': el => openMember(el.dataset.id), 'open-kb': el => openKB(el.dataset.id),
  'del-cancel': () => cancelDeletion(), 'del-confirm': () => confirmDeletion(),
  'cal-disconnect': () => { if (!ea()) return; state.calendar = {connected:false, email:''}; finish('Google Calendar disconnected', 'simulated'); },
  'ev-assign': el => { const a = draft.assigned, id = el.dataset.id; draft.assigned = a.includes(id) ? a.filter(x => x !== id) : [...a, id]; el.setAttribute('aria-pressed', draft.assigned.includes(id)); },
  'req-add': () => { draft.tasks.push({id:uid('r'), title:'', owner:me().id, due:draft.date < today() ? today() : addDays(today(), 7), done:false}); renderEventForm(); },
  'req-del': el => { draft.tasks = draft.tasks.filter(t => t.id !== el.dataset.id); renderEventForm(); },
  'ct-add': () => { draft.contacts.push({id:uid('c'), name:'', email:'', phone:'', primary:false}); renderStartupForm(); },
  'ct-del': el => { if (draft.contacts.length <= 1) return; const wasP = draft.contacts.find(c => c.id === el.dataset.id)?.primary; draft.contacts = draft.contacts.filter(c => c.id !== el.dataset.id); if (wasP) draft.contacts[0].primary = true; renderStartupForm(); },
  wa: el => { const isTeam = el.dataset.kind === 'team', t = isTeam ? TEAMS.find(x => x.id === el.dataset.id) : member(el.dataset.id);
    toast(isTeam ? `Opening the ${t.name} WhatsApp group` : `Opening WhatsApp chat with ${t.name.split(' ')[0]}`, isTeam ? t.wa + ' (demo)' : 'wa.me link (demo)'); },
};
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el || el.disabled) return;
  const ctl = e.target.closest('select, input, textarea, label');
  if (ctl && ctl !== el && el.contains(ctl)) return; // interacting with a control inside a clickable card
  if (el.tagName === 'A') e.preventDefault();
  ACT[el.dataset.act]?.(el, e);
});
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('.mt-row, .idea-card, tbody tr, .nitem.click')) e.target.click(); });

const CHANGE = {
  role: el => switchRole(el.value),
  complete: el => { if (completeItem(el.dataset.key, el.checked)) { render(); toast(el.checked ? 'Marked done' : 'Reopened', findItem(el.dataset.key)?.title); } else render(); },
  'idea-stage': el => { const i = state.ideas.find(x => x.id === el.dataset.id); if (!canIdea(i)) { toast('You can’t change this idea', '', true); return render(); }
    if (el.value === 'completed' && i.stage !== 'completed') i.previousStage = i.stage; i.stage = el.value; save(); render(); toast(`${i.title} → ${IDEA_LABEL[i.stage]}`); },
  'idea-team': el => { filters.ideas.team = el.value; render(); }, 'idea-owner': el => { filters.ideas.owner = el.value; render(); },
  'idea-stage-f': el => { filters.ideas.stage = el.value; render(); }, 'idea-scope': el => { filters.ideas.scope = el.value; render(); },
  'st-sector': el => { filters.startups.sector = el.value; render(); }, 'st-att': el => { filters.startups.att = el.value; render(); }, 'st-missing': el => { filters.startups.missing = el.checked; render(); },
  'req-done': el => { const ev = eventById(el.dataset.ev), t = ev.tasks.find(x => x.id === el.dataset.id); if (t.owner !== me().id && !canEvent(ev)) return;
    t.done = el.checked; save(); render(); openEvent(ev.id); toast(t.done ? 'Requirement done' : 'Requirement reopened', `${ev.name} · ${pct(ev.tasks.filter(x => x.done).length, ev.tasks.length)}%`); },
  'req-due': el => { const ev = eventById(el.dataset.ev), t = ev.tasks.find(x => x.id === el.dataset.id); if (t.owner !== me().id && !canEvent(ev)) return; if (!el.value) return;
    t.due = el.value; save(); render(); toast('Due date updated', fmtDate(t.due)); },
  'design-status': el => { const d = state.designs.find(x => x.id === el.dataset.id); if (!canDesignStatus(d)) return;
    if (el.value === 'completed' && d.status !== 'completed') d.previousStatus = d.status; d.status = el.value; save(); render(); toast(`${d.title} → ${DESIGN_LABEL[d.status]}`); },
  'ct-primary': el => { draft.contacts.forEach(c => c.primary = c.id === el.value); },
  'receipt-file': el => { const f = el.files[0]; if (f) $('#f-receipt').value = f.name; },
  'alloc-sum': () => allocSum(),
  'kb-image': el => { insertKBImage(el.files[0]); el.value = ''; },
};
document.addEventListener('change', e => {
  const el = e.target;
  const mform = el.closest('form[data-form="meeting"]');
  if (mform) { if (el.name === 'team' || el.name === 'att') syncMeetingTeams(mform, el); updateRecipientCount(); }
  if (el.name === 'overall') allocSum();
  if (el.dataset.change) return CHANGE[el.dataset.change]?.(el);
  syncDraft(el);
});
function syncDraft(el) {
  if (!draft) return;
  if (el.dataset.d) draft[el.dataset.d] = el.value;
  if (el.dataset.rq) { const t = draft.tasks.find(x => x.id === el.dataset.rq); if (t) t[el.dataset.f] = el.type === 'checkbox' ? el.checked : el.value; }
  if (el.dataset.ct) { const c = draft.contacts.find(x => x.id === el.dataset.ct); if (c) c[el.dataset.f] = el.value; }
  if (el.dataset.kbrole) { const r = el.dataset.kbrole; draft.roles = el.checked ? [...new Set([...draft.roles, r])] : draft.roles.filter(x => x !== r); }
  if (el.dataset.att) { const a = el.dataset.att; draft.attendance = el.checked ? [...new Set([...draft.attendance, a])] : draft.attendance.filter(x => x !== a); }
}
document.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.input === 'st-q') { filters.startups.q = el.value; $('#st-results').innerHTML = startupResults(); const c = $('#st-count'); if (c) c.textContent = filteredStartups().length + ' shown'; return; }
  if (el.dataset.input === 'kb-q') { filters.kb = el.value; $('#kb-results').innerHTML = kbResults(); return; }
  if (el.name === 'overall' || el.name?.startsWith('al_')) allocSum();
  if (el.type !== 'checkbox' && el.type !== 'radio') syncDraft(el);
});

/* ================= form submission ================= */
const FORMS = {
  meeting(f, fd) {
    if (!ea()) { toast('Only the Executive Assistant can schedule meetings', '', true); return closeDialog(); }
    const id = f.dataset.id, prev = id ? state.meetings.find(x => x.id === id) : null, err = $('#merr');
    const rec = {id:id || uid('mt'), title:fd.get('title').trim(), date:fd.get('date'), start:fd.get('start'), end:fd.get('end'), location:fd.get('location').trim(), agenda:fd.get('agenda').trim(), ...formAudience(f)};
    if (rec.mode === 'all') { rec.teamIds = []; rec.attendees = []; }
    if (!rec.title || !rec.date || !rec.start || !rec.end || !rec.location || !rec.agenda) { err.textContent = 'Fill in the title, date, times, location and agenda.'; return; }
    if (rec.end <= rec.start) { err.textContent = 'The meeting has to end after it starts, on the same day.'; return; }
    const now = recipients(rec); if (!now.length) { err.textContent = 'Invite at least one person or team.'; return; }
    const when = `${fmtDate(rec.date)} · ${fmtTime(rec.start)}–${fmtTime(rec.end)} · ${rec.location}`;
    if (prev) { const union = [...new Set([...recipients(prev), ...now])]; notify('update', `Meeting updated: ${rec.title}`, when, union); upsert(state.meetings, rec); finish('Meeting updated', `${union.length} notified (simulated)`); }
    else { notify('invite', `Meeting invitation: ${rec.title}`, when, now); upsert(state.meetings, rec); finish('Meeting scheduled', `${now.length} invited (simulated)${state.calendar.connected ? ' · calendar' : ''}`); }
  },
  calendar(f, fd) { if (!ea()) return; state.calendar = {connected:true, email:fd.get('email').trim()}; finish('Google Calendar connected', 'simulated — no OAuth'); },
  event(f) {
    const v = draft, err = $('#eerr'), existing = v._new ? null : eventById(v.id);
    if (existing && !canEvent(existing)) { toast('You can’t edit this event anymore', '', true); return closeDialog(); }
    if (!v.name.trim() || !v.date) { err.textContent = 'Give the event a name and a date.'; return; }
    if (v.tasks.some(t => !t.title.trim() || !t.due)) { err.textContent = 'Every requirement needs a title and a due date — or remove the empty ones.'; return; }
    const rec = {...v, name:v.name.trim()}; delete rec._new;
    upsert(state.events, rec); finish(v._new ? `Created ${rec.name}` : `Saved ${rec.name}`, `${pct(rec.tasks.filter(t => t.done).length, rec.tasks.length)}% ready`);
  },
  idea(f, fd) {
    const id = f.dataset.id, prev = id ? state.ideas.find(x => x.id === id) : null, err = $('#ierr');
    if (prev && !canIdea(prev)) { toast('You can’t edit this idea', '', true); return closeDialog(); }
    const rec = {...(prev || {}), id:id || uid('i'), title:fd.get('title').trim(), description:fd.get('description').trim(), team:fd.get('team'), owner:fd.get('owner'), assigned:fd.getAll('assigned').filter(a => a !== fd.get('owner')), stage:fd.get('stage'), notes:fd.get('notes').trim(), next:fd.get('next').trim(), due:fd.get('due')};
    if (!rec.title) { err.textContent = 'Give the idea a title.'; return; }
    if (rec.next && !rec.due) { err.textContent = 'Add a target date so the next step shows up in Deadlines.'; return; }
    if (prev && rec.stage === 'completed' && prev.stage !== 'completed') rec.previousStage = prev.stage;
    upsert(state.ideas, rec); finish(prev ? 'Idea saved' : 'Idea submitted', rec.next ? 'next step added to Deadlines' : '');
  },
  task(f, fd) {
    const owner = oversight() ? fd.get('owner') : me().id, title = fd.get('title').trim(), due = fd.get('due');
    if (!title || !due) return toast('Add what needs doing and when', '', true);
    state.tasks.push({id:uid('t'), title, owner, due, done:false, related:fd.get('related').trim() || 'Follow-up'});
    finish('Follow-up added', `${member(owner).name} · ${fmtDate(due)}`);
  },
  design(f, fd) {
    if (!access('design')) return closeDialog();
    const id = f.dataset.id, prev = id ? state.designs.find(x => x.id === id) : null, err = $('#derr');
    const rec = {...(prev || {}), id:id || uid('ds'), title:fd.get('title').trim(), event:fd.get('event'), campaign:fd.get('campaign').trim(), brief:fd.get('brief').trim(), deliverables:fd.get('deliverables').trim(), owner:fd.get('owner'), due:fd.get('due'), status:fd.get('status')};
    if (!rec.title || !rec.brief || !rec.due) { err.textContent = 'Add a title, a brief and a deadline.'; return; }
    if (!rec.event && !rec.campaign) { err.textContent = 'Pick an event or name the campaign.'; return; }
    if (prev && rec.status === 'completed' && prev.status !== 'completed') rec.previousStatus = prev.status;
    upsert(state.designs, rec); finish(prev ? 'Request saved' : 'Request created', `assigned to ${member(rec.owner).name}`);
  },
  startup(f) {
    if (!access('startups')) return closeDialog();
    if (!f.reportValidity()) return;
    const v = draft; if (!v.name.trim()) return toast('Give the startup a name', '', true);
    if (!v.contacts.some(c => c.primary)) v.contacts[0].primary = true;
    const rec = {...v, name:v.name.trim()}; delete rec._new;
    upsert(state.startups, rec); finish(v._new ? 'Startup added' : 'Startup saved', missingContact(rec) ? 'contact details still missing' : '');
  },
  alloc(f, fd) {
    const {over} = allocSum(); if (over) return toast('Allocations add up to more than the overall budget', '', true);
    state.budget.overall = +fd.get('overall') || 0; state.events.forEach(e => state.budget.allocations[e.id] = +fd.get('al_' + e.id) || 0);
    finish('Allocations saved');
  },
  expense(f, fd) {
    const id = f.dataset.id, rec = {id:id || uid('e'), name:fd.get('name').trim(), event:fd.get('event'), planned:+fd.get('planned') || 0, actual:+fd.get('actual') || 0, receipt:fd.get('receipt').trim()};
    if (!rec.name) return toast('Name the expense', '', true);
    upsert(state.budget.expenses, rec); finish(id ? 'Expense saved' : 'Expense added', aed(rec.actual || rec.planned));
  },
  reimb(f, fd) {
    const id = f.dataset.id, rec = {id:id || uid('rb'), name:fd.get('name').trim(), member:fd.get('member'), event:fd.get('event'), amount:+fd.get('amount') || 0, status:fd.get('status'), receipt:fd.get('receipt').trim()};
    if (!rec.name || !rec.amount) return toast('Add what was bought and the amount', '', true);
    upsert(state.budget.reimbursements, rec); finish(id ? 'Reimbursement saved' : 'Reimbursement added', rec.status);
  },
  member(f, fd) { if (!oversight()) return closeDialog(); member(f.dataset.id).responsibility = fd.get('responsibility').trim(); finish('Responsibility updated'); },
  login(f, fd) { if (LIVE) sendLoginLink(String(fd.get('email') || '')); },
  kb() {
    if (!isAdmin()) return closeDialog();
    const ta = $('#kb-body'); if (typeof ta?.value === 'string') draft.body = ta.value;
    const v = draft, err = $('#kberr');
    if (!v.title.trim()) { err.textContent = 'Give the article a title.'; return; }
    if (!v.body.trim()) { err.textContent = 'The article is empty.'; return; }
    const rec = {id:v.id, title:v.title.trim(), category:v.category.trim() || 'General', roles:v.roles, summary:v.summary.trim(), body:v.body, updatedBy:me().id, updatedAt:new Date().toISOString()};
    upsert(state.kb, rec); finish(v._new ? 'Article published' : 'Article saved'); openKB(rec.id);
  },
  settings(f, fd) {
    if (!isAdmin()) return;
    const url = String(fd.get('designDriveUrl') || '').trim();
    if (url && !/^https:\/\/\S+$/i.test(url)) return toast('Paste the full https:// link to the Drive folder', '', true);
    state.settings.designDriveUrl = url; save(); render(); toast(url ? 'Design Drive link saved' : 'Design Drive link removed');
  },
  'admin-invite'(f, fd) {
    if (!isAdmin()) return closeDialog();
    const p = {name:String(fd.get('name')).trim(), email:String(fd.get('email')).trim(), role:fd.get('role'), team:fd.get('team'), is_admin:!!fd.get('is_admin')};
    if (!p.name) { $('#aerr').textContent = 'Add their name.'; return; }
    if (!/^[^@\s]+@aus\.edu$/i.test(p.email)) { $('#aerr').textContent = 'Use an @aus.edu email address.'; return; }
    runAdmin('invite', p, `Invited ${p.name}`, LIVE ? `sign-in link sent to ${p.email}` : 'simulated — no email sent');
  },
  'admin-edit'(f, fd) {
    if (!isAdmin()) return closeDialog();
    const list = adminData.members || state.members, t = list.find(x => x.id === f.dataset.id);
    const p = {id:f.dataset.id, name:String(fd.get('name')).trim(), role:fd.get('role'), team:fd.get('team'), is_admin: f.querySelector('[name=is_admin]').disabled ? true : !!fd.get('is_admin')};
    if (!p.name) { $('#aerr').textContent = 'Add their name.'; return; }
    runAdmin('update', p, `Saved ${p.name}`, t && t.role !== p.role ? `${roleLabel(t.role)} → ${roleLabel(p.role)}` : '');
  },
};
document.addEventListener('submit', e => {
  const f = e.target, k = f.dataset.form; if (!k || !FORMS[k]) return;
  e.preventDefault(); FORMS[k](f, new FormData(f));
});

/* dialog lifecycle */
dlg().addEventListener('close', () => { draft = null; });
$('#confirm').addEventListener('cancel', e => { e.preventDefault(); cancelDeletion(); });
$('#confirm').addEventListener('close', () => { pendingDeletion = null; });
(mq.addEventListener ? mq.addEventListener('change', render) : mq.addListener(render));
if (LIVE) liveBoot();
else {
  initDemoState();
  try { localStorage.setItem(KEY + '-probe', '1'); localStorage.removeItem(KEY + '-probe'); } catch (e) { storageOk = false; }
  save();
  render();
}
