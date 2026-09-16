
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
      ${historyBox('event', ev.id)}
    </div>${foot('', canDeleteEvent() ? `<button type="button" class="btn btn-del" data-act="del-event" data-id="${ev.id}">${ic('trash')}Delete event</button>` : '')}`);
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
      ${isNew ? '' : historyBox('event', v.id)}
    </div>${foot(`<button class="btn btn-primary">${isNew ? 'Create event' : 'Save event'}</button>`, !isNew && canDeleteEvent() ? `<button type="button" class="btn btn-del" data-act="del-event" data-id="${v.id}">${ic('trash')}Delete event</button>` : '')}
  </form>`;
  const keep = dlg().open ? dlg().scrollTop : 0;
  openDialog(html); dlg().scrollTop = keep;
}

/* ---------- idea ---------- */
function openIdea(id) {
  const i = id ? state.ideas.find(x => x.id === id) : null;
  if (id && !i) return;
  const ownerLine = o => o ? `${avatar(o)} <span>${esc(member(o)?.name || 'Former member')}</span> <span class="faint" title="The owner can’t be changed">${ic('lock')}</span>` : '<span class="faint">No owner — the owner left Rocket</span>';
  if (i && !canIdea(i)) {
    openDialog(`${dHead(i.title, `${esc(teamName(i.team))} team · owner ${esc(member(i.owner)?.name || '—')}`, ideaBadge(i.stage))}
      <div class="dlg-body">${readonlyNote(canCommentIdea(i) ? 'You can add contributions below.' : 'Read-only. The owner, collaborators and leadership can edit this idea.')}
        ${i.description ? `<p class="prose">${esc(i.description)}</p>` : ''}
        <dl class="kv"><dt>Collaborators</dt><dd>${i.assigned.map(a => esc(member(a)?.name)).join(', ') || '—'}</dd><dt>Next step</dt><dd>${esc(i.next || '—')}</dd><dt>Target date</dt><dd>${fmtDateY(i.due)}</dd><dt>Notes</dt><dd style="white-space:pre-wrap">${esc(i.notes || '—')}</dd></dl>
        ${ideaThread(i)}${historyBox('idea', i.id)}</div>${foot('')}`);
    return;
  }
  const v = i || {title:'', description:'', team:me().team, owner:me().id, assigned:[], stage:'submitted', notes:'', next:'', due:addDays(today(), 14)};
  const orphan = i && !i.owner && isAdmin();   // only case where an owner can be (re)assigned
  openDialog(`<form data-form="idea" data-id="${i ? i.id : ''}" novalidate>
    ${dHead(i ? 'Edit idea' : 'Submit an idea', i ? 'The owner, collaborators and leadership can edit. Only the owner or an admin can delete.' : 'You’ll be the owner. The next step becomes a deadline.')}
    <div class="dlg-body">
      ${field('Title', inp('title', v.title, 'required'), 'f-title')}
      ${field('Description', txt('description', v.description, 2), 'f-description')}
      <div class="grid3">${field('Stage', `<select class="input" id="f-stage" name="stage">${IDEA_STAGES.map(s => opt(s, IDEA_LABEL[s], v.stage)).join('')}</select>`, 'f-stage')}${field('Team', `<select class="input" id="f-team" name="team">${teamOpts(v.team)}</select>`, 'f-team')}
        ${orphan ? field('Owner', `<select class="input" id="f-owner" name="owner"><option value="">Pick a new owner</option>${state.members.filter(m => m.active !== false).map(m => opt(m.id, m.name, '')).join('')}</select>`, 'f-owner')
          : `<div class="field"><span class="lbl">Owner</span><div class="who owner-locked">${ownerLine(v.owner)}</div></div>`}</div>
      <div class="field"><span class="lbl">Collaborators <span class="faint">— they can edit and add contributions</span></span><div class="checks">${state.members.filter(m => m.id !== v.owner && m.active !== false).map(m => `<label class="cbox"><input type="checkbox" name="assigned" value="${m.id}" ${v.assigned.includes(m.id) ? 'checked' : ''}>${esc(m.name.split(' ')[0])}</label>`).join('')}</div></div>
      <div class="grid2">${field('Next step', inp('next', v.next, 'placeholder="e.g. Draft a one-page format"'), 'f-next')}${field('Target date', inp('due', v.due, 'type="date"'), 'f-due')}</div>
      ${field('Notes', txt('notes', v.notes, 2), 'f-notes')}
      <span class="err" id="ierr" role="alert"></span>
      ${i ? ideaThread(i) + historyBox('idea', i.id) : ''}
    </div>
    ${foot(`<button class="btn btn-primary">${i ? 'Save idea' : 'Submit idea'}</button>`, i && canDeleteIdea(i) ? `<button type="button" class="btn btn-del" data-act="del-idea" data-id="${i.id}">${ic('trash')}Delete idea</button>` : '')}
  </form>`);
}
// Contributions: a thread of mini sub-ideas from the owner and collaborators. Lives inside the idea
// dialog but posts on its own (not through the idea form), so unsaved edits above are kept.
function ideaThread(i) {
  return `<div class="sect idea-thread" id="idea-thread" data-idea="${i.id}">${ideaThreadInner(i)}</div>`;
}
function ideaThreadInner(i) {
  const list = commentsFor(i.id), can = canCommentIdea(i);
  return `<span class="eyebrow">Contributions · ${list.length}</span>
    ${list.map(c => `<article class="contrib">
      <div class="contrib-head"><span class="who">${avatar(c.author)}<span>${esc(member(c.author)?.name || 'Former member')}</span></span>${c.author === i.owner ? '<span class="tag">Owner</span>' : ''}<time>${fmtStamp(c.at)}</time>
        ${canDeleteComment(c) ? `<button type="button" class="btn btn-ghost sm icon-btn" data-act="idea-comment-del" data-id="${c.id}" aria-label="Delete contribution" title="Delete">${ic('trash')}</button>` : ''}</div>
      ${c.title ? `<div class="contrib-title">${esc(c.title)}</div>` : ''}<p>${esc(c.body)}</p></article>`).join('') || `<span class="faint" style="font-size:13px">${can ? 'No contributions yet. Add the first one below.' : 'No contributions yet.'}</span>`}
    ${can ? `<div class="contrib-new">
      <input class="input" id="ic-title" maxlength="120" placeholder="Headline (optional) — e.g. Guest list, Budget, Risks" aria-label="Contribution headline">
      <textarea class="input" id="ic-body" rows="3" maxlength="4000" placeholder="Add your part of the idea…" aria-label="Contribution"></textarea>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><span class="muted-note">The owner and collaborators get notified.</span><button type="button" class="btn sm btn-primary" data-act="idea-comment" data-id="${i.id}">Add contribution</button></div></div>`
    : `<span class="muted-note">Only the owner and invited collaborators can add contributions.</span>`}`;
}
function refreshIdeaThread(ideaId) {
  const el = document.getElementById('idea-thread'), i = state.ideas.find(x => x.id === ideaId);
  if (el && i && el.dataset.idea === ideaId) el.innerHTML = ideaThreadInner(i);
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
      ${v._new ? '' : historyBox('startup', v.id)}
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
  recordChange('startup', id, 'updated', s.name, {deletion_requested_at:[s.deletion?.at || null, value?.at || null]});
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
      ${ups.length ? `<div class="notif-sec">Meeting updates</div>${ups.map(n => `<div class="nitem"><span class="dot ${new Date(n.at) > seen ? (n.kind === 'cancel' ? 'over' : '') : 'read'}"></span><div><div class="ttl">${esc(n.title)}</div><div class="sb">${esc(n.details)}</div></div><time>${fmtStamp(n.at)}</time></div>`).join('')}` : ''}<div id="push-row"></div></div>`, 'notif-pop');
  markSeen(); render(); renderPushRow();
}

/* ================= deletion ================= */
const deletionRecord = (kind, id) => ({meeting:state.meetings, idea:state.ideas, startup:state.startups, kb:state.kb, comment:state.ideaComments, note:state.notes}[kind] || adminData.members || state.members).find(x => x.id === id);
const DENY = {meeting:'Only the Executive Assistant can delete meetings', event:'Only the Executive Assistant or an admin can delete an event', member:'You can’t remove yourself or the last admin', startup:'Deleting a startup needs an admin or the President', kb:'Only admins can delete articles', idea:'Only the idea’s owner or an admin can delete it', comment:'Only its author, the idea owner or an admin can delete this', note:'Only the note’s owner or an admin can delete it'};
function requestDeletion(kind, id) {
  const rec = deletionRecord(kind, id);
  if (!deletable(kind, rec)) { toast(DENY[kind], '', true); return; }
  pendingDeletion = {kind, id};
  const name = kind === 'member' || kind === 'startup' ? rec.name : kind === 'comment' ? (rec.title || 'this contribution') : kind === 'note' ? noteTitle(rec) : rec.title;
  const consequence = kind === 'meeting'
    ? `A cancellation notice goes to its ${recipients(rec).length} current attendees${state.calendar.connected ? ' and the calendar entry is cancelled (simulated)' : ''}. Past notifications stay in the log.`
    : kind === 'startup' ? `Its contacts, notes and attendance history are deleted for everyone.${rec.deletion ? ` Requested by ${member(rec.deletion.by)?.name || 'a member'}${rec.deletion.reason ? `: “${rec.deletion.reason}”` : ''}.` : ''}`
    : kind === 'kb' ? 'The article disappears for everyone. Any images uploaded for it stay in storage.'
    : kind === 'comment' ? `${member(rec.author)?.name || 'This'} contribution is removed from the idea for everyone.`
    : kind === 'note' ? `The note is deleted for you${rec.editors.length || rec.viewers.length || rec.club_access !== 'none' ? ' and everyone it’s shared with' : ''}.`
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
  if (p.kind === 'event') return deleteEventNow(p.id);
  const rec = deletionRecord(p.kind, p.id);
  if (!deletable(p.kind, rec)) { cancelDeletion(); toast('That can’t be deleted with your current role', '', true); return; }
  if (p.kind === 'member') { cancelDeletion(); return runAdmin('remove', {id:rec.id}, `Removed ${rec.name}`, rec.email); }
  if (p.kind === 'startup') { state.startups = state.startups.filter(x => x.id !== rec.id); cancelDeletion(); return finish(`Deleted ${rec.name}`, 'removed from the directory'); }
  if (p.kind === 'kb') { state.kb = state.kb.filter(x => x.id !== rec.id); cancelDeletion(); return finish(`Deleted “${rec.title}”`); }
  if (p.kind === 'note') { cancelDeletion(); return deleteNoteNow(rec); }
  if (p.kind === 'comment') { state.ideaComments = state.ideaComments.filter(x => x.id !== rec.id); cancelDeletion(); save(); refreshIdeaThread(rec.ideaId); render(); return toast('Contribution deleted'); }
  if (p.kind === 'meeting' && LIVE && rec.onCalendar && !p.calendarDone) {
    p.calendarDone = true;
    const btn = $('#confirm [data-act="del-confirm"]'); if (btn) { btn.disabled = true; btn.textContent = 'Cancelling invite…'; }
    return calendarApi('cancel', {id:rec.id}).catch(e => toast('Google Calendar didn’t cancel the event: ' + e.message, 'the meeting is still deleted here', true)).finally(() => confirmDeletion());
  }
  let cancelId = null;
  if (p.kind === 'meeting') {
    cancelId = notify('cancel', `Meeting cancelled: ${rec.title}`, `${fmtDate(rec.date)} · ${fmtTime(rec.start)}–${fmtTime(rec.end)} · ${rec.location}`, recipients(rec));
    state.meetings = state.meetings.filter(x => x.id !== rec.id);
  } else { state.ideas = state.ideas.filter(x => x.id !== rec.id); state.ideaComments = state.ideaComments.filter(c => c.ideaId !== rec.id); }
  cancelDeletion();
  finish(p.kind === 'meeting' ? `Deleted “${rec.title}”` : `Deleted idea “${rec.title}”`,
    p.kind === 'meeting' ? `cancellation sent to ${recipients(rec).length}${LIVE ? (rec.onCalendar ? ' · calendar event cancelled' : '') : ' (simulated)'}` : 'next step removed from Deadlines');
  if (cancelId) afterSync(() => fnApi('push', 'notification', {id:cancelId}).catch(() => {}));
}

/* ---------- deleting an event: it takes everything filed against it ---------- */
const eventDeletionItems = ev => ({
  name:ev.name,
  requirements:ev.tasks.length,
  designs:state.designs.filter(d => d.event === ev.id).map(d => ({title:d.title, status:d.status})),
  expenses:state.budget.expenses.filter(x => x.event === ev.id).map(x => ({name:x.name, planned:+x.planned || 0, actual:+x.actual || 0})),
  reimbursements:state.budget.reimbursements.filter(r => r.event === ev.id).map(r => ({name:r.name, amount:+r.amount || 0, status:r.status, member:r.member})),
  allocation:+state.budget.allocations[ev.id] || 0,
});
async function openEventDeletion(id) {
  const ev = eventById(id);
  if (!ev) return;
  if (!canDeleteEvent()) return toast(DENY.event, '', true);
  let d = eventDeletionItems(ev);
  // In live mode ask the server what's attached right now, in case someone added an expense since your last refresh.
  if (LIVE) { try { const {data} = await sb.rpc('event_deletion_preview', {p_event:id}); if (data) d = data; } catch (e) {} }
  const money = d.expenses.reduce((s, x) => s + Math.max(+x.actual || 0, +x.planned || 0), 0) + d.reimbursements.filter(r => r.status !== 'Rejected').reduce((s, r) => s + (+r.amount || 0), 0);
  const list = (title, items, row) => items.length ? `<div class="sect"><span class="eyebrow">${title} · ${items.length}</span><ul class="del-list">${items.map(row).join('')}</ul></div>` : '';
  const c = $('#confirm');
  pendingDeletion = {kind:'event', id};
  c.innerHTML = `<div class="dlg-head"><div style="flex:1"><h2>Delete “${esc(d.name)}”?</h2><div class="sub">Everything below is deleted for everyone, permanently.</div></div></div>
    <div class="dlg-body">
      <div class="del-sum"><span><b>${d.requirements}</b> checklist item${d.requirements === 1 ? '' : 's'}</span><span><b>${d.designs.length}</b> design request${d.designs.length === 1 ? '' : 's'}</span>
        <span><b>${d.expenses.length}</b> expense${d.expenses.length === 1 ? '' : 's'}</span><span><b>${d.reimbursements.length}</b> reimbursement${d.reimbursements.length === 1 ? '' : 's'}</span></div>
      ${list('Design requests', d.designs, x => `<li><span>${esc(x.title)}</span><span class="faint">${esc(DESIGN_LABEL[x.status] || x.status)}</span></li>`)}
      ${list('Expenses', d.expenses, x => `<li><span>${esc(x.name)}</span><span class="num">${aed(+x.actual || +x.planned)}${+x.actual ? '' : ' planned'}</span></li>`)}
      ${list('Reimbursements', d.reimbursements, x => `<li><span>${esc(x.name)}${x.member && member(x.member) ? ` <span class="faint">· ${esc(member(x.member).name.split(' ')[0])}</span>` : ''}</span><span class="num">${aed(x.amount)} · ${esc(x.status)}</span></li>`)}
      ${money || d.allocation ? `<p class="prose" style="margin:0;color:var(--ember)">${money ? `${aed(money)} of spending disappears from the Budget` : ''}${money && d.allocation ? ', and its ' : d.allocation ? 'Its ' : ''}${d.allocation ? `${aed(d.allocation)} allocation is freed up` : ''}.</p>` : ''}
      <p class="prose" style="margin:0">The change history keeps a record that it was deleted, and by whom.</p>
    </div>
    <div class="dlg-foot"><span class="spacer"></span><button type="button" class="btn" data-act="del-cancel" autofocus>Keep event</button>
      <button type="button" class="btn btn-danger-solid" data-act="del-confirm">Delete event and everything listed</button></div>`;
  c.showModal();
}
async function deleteEventNow(id) {
  const ev = eventById(id); if (!ev || !canDeleteEvent()) return cancelDeletion();
  const d = eventDeletionItems(ev), btn = $('#confirm [data-act="del-confirm"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Deleting…'; }
  if (LIVE) {
    const {error} = await sb.rpc('delete_event', {p_event:id});
    cancelDeletion();
    if (error) return toast('Couldn’t delete it: ' + error.message, '', true);
    await reloadLive();
  } else {
    recordChange('event', ev.id, 'deleted', ev.name);
    state.events = state.events.filter(x => x.id !== ev.id);
    state.designs = state.designs.filter(x => x.event !== ev.id);
    state.budget.expenses = state.budget.expenses.filter(x => x.event !== ev.id);
    state.budget.reimbursements = state.budget.reimbursements.filter(x => x.event !== ev.id);
    delete state.budget.allocations[ev.id];
    cancelDeletion(); save();
  }
  closeDialog(); render();
  const gone = [d.requirements && `${d.requirements} checklist item${d.requirements === 1 ? '' : 's'}`, d.designs.length && `${d.designs.length} design request${d.designs.length === 1 ? '' : 's'}`,
    d.expenses.length + d.reimbursements.length && `${d.expenses.length + d.reimbursements.length} budget record${d.expenses.length + d.reimbursements.length === 1 ? '' : 's'}`].filter(Boolean).join(' · ');
  toast(`Deleted ${d.name}`, gone);
}

/* ================= toasts ================= */
function toast(msg, sub, warn) {
  const t = document.createElement('div'); t.className = 'toast' + (warn ? ' warn' : '');
  t.innerHTML = `<span>${esc(msg)}</span>${sub ? `<span class="mono">${esc(sub)}</span>` : ''}`;
  $('#toasts').appendChild(t); setTimeout(() => t.remove(), 3800);
}

/* ================= change history panel ================= */
const historyBox = (type, id) => `<div class="sect hist" id="hist-box" data-type="${type}" data-id="${esc(id)}"><button type="button" class="btn sm btn-ghost" data-act="load-history" data-type="${type}" data-id="${esc(id)}">${ic('clock')}Show history</button></div>`;
async function loadHistory(type, id) {
  const box = document.getElementById('hist-box'); if (!box) return;
  box.innerHTML = '<span class="eyebrow">History</span><span class="faint" style="font-size:13px">Loading…</span>';
  let rows = [];
  try {
    if (LIVE) { const {data, error} = await sb.from('change_log').select('*').eq('entity_type', type).eq('entity_id', id).order('created_at', {ascending:false}).limit(60); if (error) throw error; rows = data; }
    else rows = (state.changeLog || []).filter(e => e.entity_type === type && e.entity_id === id);
  } catch (e) { box.innerHTML = `<span class="eyebrow">History</span><span class="err">Couldn’t load the history: ${esc(e.message)}</span>`; return; }
  if (box.dataset.id !== id) return;
  box.innerHTML = `<span class="eyebrow">History · ${rows.length}${rows.length === 60 ? '+' : ''}</span>${rows.length ? `<ol class="hist-list">${rows.map(e => `<li>${avatar(e.actor)}<div><div><b>${esc(member(e.actor)?.name || (e.actor ? 'Former member' : 'Rocket'))}</b> ${describeChange(e)}</div><time>${fmtStamp(e.created_at)}</time></div></li>`).join('')}</ol>` : '<span class="faint" style="font-size:13px">No changes recorded yet. History starts from when it was switched on.</span>'}`;
}
const LONG_FIELDS = ['description', 'notes', 'brief', 'contacts', 'agenda', 'body'];
const HIDDEN_FIELDS = ['id', 'previous_stage', 'previousStage', 'created_by', 'createdBy', 'deletion_requested_by', 'deletion_reason', 'event_id', 'idea_id', 'position'];
const FIELD_LABEL = {title:'the title', name:'the name', description:'the description', notes:'the notes', next:'the next step', next_step:'the next step', due:'the target date', stage:'the stage',
  team:'the team', owner:'the owner', assigned:'the people involved', date:'the date', location:'the location', sector:'the sector', attendance:'events attended', contacts:'the contacts', rating:'the rating'};
function histVal(k, v) {
  if (v === null || v === undefined || v === '') return '—';
  if (k === 'stage') return IDEA_LABEL[v] || v;
  if (k === 'team') return teamName(v);
  if (k === 'owner') return member(v)?.name || 'a former member';
  if (k === 'due' || k === 'date') return fmtDateY(String(v).slice(0, 10));
  return String(v);
}
function describeChange(e) {
  const s = e.subject ? `“${esc(e.subject)}”` : '', ch = e.changes || {};
  switch (e.action) {
    case 'created': return 'created it';
    case 'deleted': return 'deleted it';
    case 'contribution created': return `added a contribution${s ? ` ${s}` : ''}`;
    case 'contribution deleted': return 'removed a contribution';
    case 'requirement created': return `added the checklist item ${s}`;
    case 'requirement deleted': return `removed the checklist item ${s}`;
    case 'requirement updated': {
      if (ch.done) return `${ch.done[1] ? 'ticked off' : 'reopened'} ${s}`;
      const bits = [];
      if (ch.owner) bits.push(`assigned ${s} to ${esc(histVal('owner', ch.owner[1]))}`);
      if (ch.due) bits.push(`moved ${s} to ${esc(histVal('due', ch.due[1]))}`);
      if (ch.title) bits.push(`renamed “${esc(ch.title[0])}” to “${esc(ch.title[1])}”`);
      return bits.join(', ') || `edited ${s}`;
    }
  }
  const bits = [];
  for (const [k, [a, b]] of Object.entries(ch)) {
    if (k === 'deletion_requested_at') { bits.push(b ? 'asked to delete it' : 'cleared the deletion request'); continue; }
    if (HIDDEN_FIELDS.includes(k)) continue;
    const label = FIELD_LABEL[k] || k.replace(/_/g, ' ');
    if (Array.isArray(a) || Array.isArray(b)) {
      const A = a || [], B = b || [], plus = B.filter(x => !A.includes(x)), minus = A.filter(x => !B.includes(x));
      const nm = x => k === 'assigned' ? (member(x)?.name?.split(' ')[0] || 'someone') : x;
      if (k === 'contacts') { bits.push('edited the contacts'); continue; }
      if (plus.length) bits.push(`added ${esc(plus.map(nm).join(', '))} to ${label}`);
      if (minus.length) bits.push(`removed ${esc(minus.map(nm).join(', '))} from ${label}`);
      continue;
    }
    if (LONG_FIELDS.includes(k)) { bits.push(`edited ${label}`); continue; }
    bits.push(`changed ${label} from <span class="hist-v">${esc(histVal(k, a))}</span> to <span class="hist-v">${esc(histVal(k, b))}</span>`);
  }
  return bits.join('; ') || 'made a change';
}

/* ================= search (⌘K / Ctrl K / "/") ================= */
let searchSel = 0;
function openSearch() {
  if (!state) return;
  openDialog(`<div class="search-head">${ic('search')}<input class="input" id="search-q" data-input="search-q" type="search" autocomplete="off" placeholder="Search ideas, events, meetings, startups, people, guides…" aria-label="Search Rocket"><button type="button" class="kbd search-esc" data-act="close" aria-label="Close search">esc</button><button type="button" class="btn btn-ghost sm search-cancel" data-act="close">Cancel</button></div><div id="search-results" class="search-results" role="listbox"></div>`, 'search-pop');
  renderSearch('');
  setTimeout(() => $('#search-q')?.focus());
}
function searchIndex() {
  const out = [], add = (type, a, id, title, sub, text, v) => out.push({type, a, id, v, title, sub, text:`${title} ${sub} ${text || ''}`.toLowerCase()});
  SECTIONS.filter(s => access(s[0])).forEach(([k, l]) => add('Go to', 'go', k, l, 'Section', '', k));
  state.ideas.forEach(i => add('Idea', 'open-idea', i.id, i.title, `${IDEA_LABEL[i.stage]} · ${teamName(i.team)} · ${member(i.owner)?.name || ''}`, [i.description, i.notes, i.next, ...commentsFor(i.id).map(c => `${c.title} ${c.body}`)].join(' ')));
  state.events.forEach(e => add('Event', 'open-event', e.id, e.name, `${fmtDate(e.date)} · ${e.location || 'TBC'}`, [e.description, ...e.tasks.map(t => t.title)].join(' ')));
  visibleMeetings().forEach(m => add('Meeting', 'open-meeting', m.id, m.title, `${fmtDate(m.date)} · ${fmtTime(m.start)} · ${m.location}`, m.agenda));
  deadlineItems().filter(x => x.src === 'task').forEach(x => add('Follow-up', 'go', x.id, x.title, `${x.related} · ${member(x.owner)?.name || ''} · ${x.done ? 'done' : relDue(x.due)}`, '', 'deadlines'));
  if (access('startups')) state.startups.forEach(s => add('Startup', 'open-startup', s.id, s.name, s.sector || '', [s.notes, ...s.contacts.flatMap(c => [c.name, c.email, c.phone])].join(' ')));
  state.designs.filter(d => access('design') || d.owner === me().id).forEach(d => add('Design', 'open-design', d.id, d.title, `${DESIGN_LABEL[d.status]} · ${member(d.owner)?.name || ''}`, [d.brief, d.deliverables, d.campaign].join(' ')));
  state.members.filter(m => m.active !== false).forEach(m => add('Person', 'edit-member', m.id, m.name, `${roleLabel(m.role)} · ${teamName(m.team)}`, m.email));
  if (access('programmes') && vhReady()) V().mentors.forEach(m => add('Mentor', 'vh-edit-mentor', m.id, m.name, `${VH_TYPE[m.type]} · ${m.org_title || 'The Venture Hour'}${m.active ? '' : ' · inactive'}`, `${m.email} ${m.focus_area}`));
  (state.kb || []).forEach(a => add('Guide', 'open-kb', a.id, a.title, a.category, `${a.summary} ${a.body}`));
  (state.notes || []).filter(canViewNote).forEach(n => add('Note', 'note-open', n.id, noteTitle(n), `${n.owner === me().id ? 'Your note' : `${member(n.owner)?.name || 'Someone'}’s note`} · edited ${fmtStamp(n.updated_at)}`, noteText(n.body)));
  if (access('budget')) { state.budget.expenses.forEach(x => add('Expense', 'edit-expense', x.id, x.name, `${aed(x.actual || x.planned)} · ${eventById(x.event)?.name || ''}`, x.receipt));
    state.budget.reimbursements.forEach(x => add('Reimbursement', 'edit-reimb', x.id, x.name, `${aed(x.amount)} · ${x.status} · ${member(x.member)?.name || ''}`, x.receipt)); }
  return out;
}
function renderSearch(q) {
  const box = $('#search-results'); if (!box) return;
  const words = q.toLowerCase().trim().split(/\s+/).filter(Boolean);
  let hits;
  if (!words.length) hits = searchIndex().filter(h => h.type === 'Go to');
  else hits = searchIndex().filter(h => words.every(w => h.text.includes(w))).map(h => {
      const t = h.title.toLowerCase(); return {...h, score:(t.startsWith(words[0]) ? 0 : words.every(w => t.includes(w)) ? 1 : 2) + (h.type === 'Go to' ? 0.5 : 0)}; })
    .sort((a, b) => a.score - b.score || a.title.localeCompare(b.title)).slice(0, 40);
  const mark = s => { let h = esc(s); words.forEach(w => { const re = new RegExp(`(${esc(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig'); h = h.replace(re, '<mark>$1</mark>'); }); return h; };
  searchSel = 0;
  box.innerHTML = hits.length ? hits.map((h, k) => `<button type="button" class="sr-item ${k === 0 ? 'active' : ''}" role="option" data-act="search-go" data-a="${h.a}" data-id="${esc(h.id)}" data-v="${esc(h.v || h.id)}">
      <span class="sr-type">${esc(h.type)}</span><span class="sr-text"><span class="sr-title">${mark(h.title)}</span><span class="sr-sub">${esc(h.sub)}</span></span></button>`).join('')
    : `<div class="empty">Nothing matches “${esc(q)}”.</div>`;
  if (!words.length) box.insertAdjacentHTML('afterbegin', '<div class="notif-sec">Jump to</div>');
}
function searchKey(key) {
  const items = [...document.querySelectorAll('#search-results .sr-item')]; if (!items.length) return;
  if (key === 'Enter') return items[searchSel]?.click();
  items[searchSel]?.classList.remove('active');
  searchSel = (searchSel + (key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
  items[searchSel].classList.add('active'); items[searchSel].scrollIntoView({block:'nearest'});
}

/* ================= launch parameters =================
   ?view=meetings opens a section (used by notification taps); ?calendar=connected|error comes back from Google. */
function handleLaunchParams() {
  const q = new URLSearchParams(location.search); if (![...q.keys()].length) return;
  const v = q.get('view'); if (v && VIEWS[v] && access(v)) { view = v; render(); }
  const c = q.get('calendar');
  if (c === 'connected') { toast('Google Calendar connected', 'new meetings now send real invites'); if (ea()) { view = 'meetings'; render(); } }
  if (c === 'error') toast('Google Calendar didn’t connect: ' + (q.get('reason') || 'unknown error'), '', true);
  history.replaceState(null, '', location.pathname);
}

/* ================= navigation & render ================= */
const VIEWS = {overview:vOverview, calendar:vCalendar, notes:vNotes, schedules:vSchedules, programmes:vProgrammes, meetings:vMeetings, events:vEvents, ideas:vIdeas, deadlines:vDeadlines, startups:vStartups, budget:vBudget, design:vDesign, members:vMembers, kb:vKB, admin:vAdmin};
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
  // Clears any cached copy of Rocket and loads the latest version from the server.
  'hard-reload': async () => {
    toast('Loading the latest Rocket…');
    try { if (window.caches) for (const k of await caches.keys()) await caches.delete(k); } catch (e) {}
    try { const regs = await navigator.serviceWorker?.getRegistrations(); await Promise.all((regs || []).map(r => r.update())); } catch (e) {}
    location.replace(location.pathname + '?fresh=' + Date.now());
  },
  'login-code': () => sendLoginCode(loginEmail()),
  'login-resend': el => sendLoginCode(el.dataset.email).then(() => { const m = $('#l-msg'); if (m && !m.innerHTML) m.innerHTML = '<span class="faint">New code sent. Use the latest email.</span>'; }),
  'login-back': () => showLogin(),
  'change-password': () => { if (!LIVE) return;
    openDialog(`<form data-form="change-password" novalidate>${dHead('Change your password', `For <span class="mono">${esc(me().email)}</span>`)}
      <div class="dlg-body"><input type="email" name="username" value="${esc(me().email)}" autocomplete="username" hidden>
        ${field('New password', '<input class="input" id="cp-new" name="password" type="password" autocomplete="new-password" minlength="8" required>', 'cp-new')}
        ${field('Type it again', '<input class="input" id="cp-again" name="again" type="password" autocomplete="new-password" minlength="8" required>', 'cp-again')}
        <span class="muted-note">At least 8 characters. Other devices stay signed in.</span><div id="cp-msg" role="status"></div></div>
      ${foot('<button class="btn btn-primary">Change password</button>')}</form>`, 'narrow'); },
  'admin-refresh': () => { adminData.members = null; adminData.error = ''; render(); },
  'admin-invite': () => openAdminInvite(),
  'admin-edit': el => openAdminEdit(el.dataset.id),
  'admin-disable': el => runAdmin('disable', {id:el.dataset.id}, 'Login disabled', 'they can’t sign in or see any data'),
  'admin-enable': el => runAdmin('enable', {id:el.dataset.id}, 'Login re-enabled'),
  'admin-resend': el => runAdmin('resend', {id:el.dataset.id}, 'Sign-in code sent', LIVE ? 'they enter it on the sign-in screen' : 'simulated in the demo'),
  'admin-reset': el => runAdmin('reset-password', {id:el.dataset.id}, 'Password reset', 'their old password no longer works'),
  'copy-text': el => { try { navigator.clipboard.writeText(el.dataset.v).then(() => toast('Copied')).catch(() => { $('#cred-msg')?.select(); toast('Select the text and copy it', '', true); }); } catch (e) { toast('Select the text and copy it', '', true); } },
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
    afterSync(() => fnApi('push', 'deletion-request', {id:el.dataset.id}).catch(() => {}));
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
  'new-event': () => openEvent(null), 'open-event': el => openEvent(el.dataset.id), 'del-event': el => openEventDeletion(el.dataset.id),
  'new-idea': () => openIdea(null), 'open-idea': el => openIdea(el.dataset.id), 'del-idea': el => requestDeletion('idea', el.dataset.id),
  'new-task': () => openTask(),
  'new-design': () => openDesign(null), 'open-design': el => openDesign(el.dataset.id),
  'new-startup': () => openStartup(null), 'open-startup': el => openStartup(el.dataset.id),
  'edit-alloc': () => openAlloc(), 'new-expense': () => { if (access('budget')) openExpense(null); }, 'edit-expense': el => openExpense(el.dataset.id), 'new-reimb': () => openReimb(null), 'edit-reimb': el => openReimb(el.dataset.id),
  'edit-member': el => openMember(el.dataset.id), 'open-kb': el => openKB(el.dataset.id),
  'del-cancel': () => cancelDeletion(), 'del-confirm': () => confirmDeletion(),
  'cal-disconnect': async () => { if (!ea() && !isAdmin()) return;
    if (!LIVE) { state.calendar = {connected:false, email:''}; adminData.calendar = null; return finish('Google Calendar disconnected', 'simulated'); }
    try { await calendarApi('disconnect'); adminData.calendar = null; await reloadLive(); toast('Google Calendar disconnected', 'new meetings won’t send invites'); } catch (e) { toast(e.message, '', true); } },
  'cal-demo-connect': () => { if (LIVE || !isAdmin()) return; state.calendar = {connected:true, email:'launchpad.club@gmail.com'}; adminData.calendar = null; finish('Google Calendar connected', 'simulated in the demo'); },
  'cal-status': () => { adminData.calendar = null; render(); },
  'cal-connect': async el => { if ((!ea() && !isAdmin()) || !LIVE) return; el.disabled = true; el.textContent = 'Opening Google…';
    try { const {url} = await calendarApi('auth-url'); location.href = url; } catch (e) { el.disabled = false; el.textContent = 'Connect Google Calendar'; toast('Couldn’t start the Google sign-in: ' + e.message, '', true); } },
  'cal-sync-all': async el => { if ((!ea() && !isAdmin()) || !LIVE) return; el.disabled = true; el.textContent = 'Adding…';
    try { const r = await calendarApi('sync-all'); await reloadLive(); toast(`Added ${r.synced} upcoming meeting${r.synced === 1 ? '' : 's'} to Google Calendar`, r.failed ? `${r.failed} failed` : 'invites sent'); } catch (e) { toast(e.message, '', true); el.disabled = false; } },
  'idea-comment': el => {
    const i = state.ideas.find(x => x.id === el.dataset.id); if (!canCommentIdea(i)) return toast('Only the owner and collaborators can add contributions', '', true);
    const title = ($('#ic-title')?.value || '').trim(), body = ($('#ic-body')?.value || '').trim();
    if (!body) { $('#ic-body')?.focus(); return toast('Write your contribution first', '', true); }
    const c = {id:uid('ic'), ideaId:i.id, author:me().id, title:title.slice(0, 120), body:body.slice(0, 4000), at:new Date().toISOString()};
    state.ideaComments.push(c); recordChange('idea', i.id, 'contribution created', c.title || c.body.slice(0, 60)); save(); refreshIdeaThread(i.id); render(); toast('Contribution added', i.title);
    afterSync(() => fnApi('push', 'idea-comment', {id:c.id}).catch(() => {}));
  },
  'idea-comment-del': el => requestDeletion('comment', el.dataset.id),
  ...NOTE_ACTS,
  ...VH_ACTS,
  ...SCH_ACTS,
  'cal-month': el => { const d = parseD(filters.cal.cursor || calMonthStart(today())); d.setMonth(d.getMonth() + (+el.dataset.v)); filters.cal.cursor = ymd(d);
    filters.cal.sel = filters.cal.cursor.slice(0, 7) === today().slice(0, 7) ? today() : filters.cal.cursor; render(); },
  'cal-today': () => { filters.cal.sel = today(); filters.cal.cursor = calMonthStart(today()); render(); },
  'cal-sel': el => { filters.cal.sel = el.dataset.v; if (el.dataset.v.slice(0, 7) !== (filters.cal.cursor || '').slice(0, 7)) filters.cal.cursor = calMonthStart(el.dataset.v); render(); },
  'cal-type': el => { const t = filters.cal.types; t[el.dataset.v] = !t[el.dataset.v]; render(); },
  'cal-mine': () => { filters.cal.mine = !filters.cal.mine; render(); },
  search: () => openSearch(),
  'search-go': el => { const a = el.dataset.a; closeDialog(); if (a === 'go') return go(el.dataset.v); ACT[a]?.({dataset:{id:el.dataset.id, v:el.dataset.v}}); },
  'load-history': el => loadHistory(el.dataset.type, el.dataset.id),
  'perm-save': () => { if (!isAdmin() || !permDraft) return; state.settings.sectionAccess = permDraft; permDraft = null; save(); render(); toast('Permissions saved', 'members see them the next time Rocket refreshes'); },
  'perm-discard': () => { permDraft = null; render(); },
  'perm-defaults': () => { permDraft = defaultSectionAccess(); render(); toast('Defaults loaded', 'press Save permissions to apply'); },
  'admin-tab': el => { adminTab = el.dataset.v; if (adminTab === 'links') adminData.calendar = null; render(); },
  'admin-links': () => { adminTab = 'links'; adminData.calendar = null; go('admin'); },
  'link-row-add': () => { $('#custom-links').insertAdjacentHTML('beforeend', customRow()); $('#custom-links .custom-row:last-child [data-cl]').focus(); },
  'link-row-del': el => { el.closest('.custom-row').remove(); },
  'wa-missing': el => { const team = el.dataset.kind !== 'person', who = team ? (el.dataset.kind === 'all' ? 'the all-members group' : `the ${teamName(el.dataset.id)} group`) : member(el.dataset.id)?.name.split(' ')[0];
    if (isAdmin()) { adminTab = 'links'; adminData.calendar = null; go('admin'); toast(`Add ${team ? `a WhatsApp link for ${who}` : `${who}’s WhatsApp number`} here`); }
    else toast(`No WhatsApp ${team ? 'link' : 'number'} for ${who} yet — ask an admin to add it`, '', true); },
  'push-on': async () => { await enablePush(); renderPushRow(); if (welcome) renderWelcomePush(); },
  'push-off': async () => { await disablePush(); renderPushRow(); },
  'push-test': () => fnApi('push', 'test').then(r => toast(r.sent ? 'Test notification sent' : 'No devices to send to', r.sent ? 'check this device' : '')).catch(e => toast(e.message, '', true)),
  'welcome-next': () => { const steps = WELCOME_STEPS.filter(s => s !== 'install' || !isStandalone()); welcome.step = steps[Math.min(steps.indexOf(welcome.step) + 1, steps.length - 1)]; renderWelcome(); },
  'welcome-back': () => { const steps = WELCOME_STEPS.filter(s => s !== 'install' || !isStandalone()); welcome.step = steps[Math.max(steps.indexOf(welcome.step) - 1, 0)]; renderWelcome(); },
  'welcome-skip': () => closeWelcome(true),
  'welcome-done': () => closeWelcome(true),
  'welcome-platform': el => { welcome.platform = el.dataset.v; renderWelcome(); },
  'welcome-install': () => { closeDialog(); showWelcome('install'); },
  'pwa-install': () => installNow(),
  'ev-assign': el => { const a = draft.assigned, id = el.dataset.id; draft.assigned = a.includes(id) ? a.filter(x => x !== id) : [...a, id]; el.setAttribute('aria-pressed', draft.assigned.includes(id)); },
  'req-add': () => { draft.tasks.push({id:uid('r'), title:'', owner:me().id, due:draft.date < today() ? today() : addDays(today(), 7), done:false}); renderEventForm(); },
  'req-del': el => { draft.tasks = draft.tasks.filter(t => t.id !== el.dataset.id); renderEventForm(); },
  'ct-add': () => { draft.contacts.push({id:uid('c'), name:'', email:'', phone:'', primary:false}); renderStartupForm(); },
  'ct-del': el => { if (draft.contacts.length <= 1) return; const wasP = draft.contacts.find(c => c.id === el.dataset.id)?.primary; draft.contacts = draft.contacts.filter(c => c.id !== el.dataset.id); if (wasP) draft.contacts[0].primary = true; renderStartupForm(); },
  wa: el => { const isTeam = el.dataset.kind === 'team', t = isTeam ? TEAMS.find(x => x.id === el.dataset.id) : member(el.dataset.id);
    toast(isTeam ? `Opening the ${t.name} WhatsApp group` : `Opening WhatsApp chat with ${t.name.split(' ')[0]}`, isTeam ? t.wa + ' (demo)' : 'wa.me link (demo)'); },
};
document.addEventListener('click', e => {
  const link = e.target.closest('a[href]'); if (link && !link.dataset.act && link.getAttribute('href') !== '#') return; // real links just open
  const el = e.target.closest('[data-act]'); if (!el || el.disabled) return;
  const ctl = e.target.closest('select, input, textarea, label');
  if (ctl && ctl !== el && el.contains(ctl)) return; // interacting with a control inside a clickable card
  if (el.tagName === 'A') e.preventDefault();
  ACT[el.dataset.act]?.(el, e);
});
document.addEventListener('keydown', e => {
  const typing = e.target.closest?.('input, textarea, select, [contenteditable="true"]');
  if (state && !document.body.classList.contains('is-login') && (((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') || (e.key === '/' && !typing && !dlg().open))) { e.preventDefault(); openSearch(); return; }
  if (e.target.id === 'search-q' && ['ArrowDown', 'ArrowUp', 'Enter'].includes(e.key)) { e.preventDefault(); searchKey(e.key); return; }
  if (e.key === 'Enter' && e.target.matches('.mt-row, .idea-card, tbody tr, .nitem.click')) e.target.click();
  if (e.key === 'Enter' && e.target.id === 'ic-title') { e.preventDefault(); $('#ic-body')?.focus(); }   // don't submit the idea form
});

const CHANGE = {
  ...VH_CHANGE,
  ...SCH_CHANGE,
  // Admin → Permissions grid: edits stay in a draft until "Save permissions"
  perm: el => { if (!isAdmin()) return; permDraft ||= JSON.parse(JSON.stringify(sectionAccess()));
    const list = permDraft[el.dataset.s][el.dataset.k], id = el.dataset.id;
    permDraft[el.dataset.s][el.dataset.k] = el.checked ? [...new Set([...list, id])] : list.filter(x => x !== id);
    const y = window.scrollY, x = document.querySelector('.pm-wrap')?.scrollLeft || 0; render(); window.scrollTo(0, y); const w = document.querySelector('.pm-wrap'); if (w) w.scrollLeft = x; },
  role: el => switchRole(el.value),
  complete: el => { if (completeItem(el.dataset.key, el.checked)) { render(); toast(el.checked ? 'Marked done' : 'Reopened', findItem(el.dataset.key)?.title); } else render(); },
  'idea-stage': el => { const i = state.ideas.find(x => x.id === el.dataset.id); if (!canIdea(i)) { toast('You can’t change this idea', '', true); return render(); }
    if (el.value === 'completed' && i.stage !== 'completed') i.previousStage = i.stage; recordChange('idea', i.id, 'updated', i.title, {stage:[i.stage, el.value]}); i.stage = el.value; save(); render(); toast(`${i.title} → ${IDEA_LABEL[i.stage]}`); },
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
  if (vhInput(el)) return;
  if (el.dataset.input === 'st-q') { filters.startups.q = el.value; $('#st-results').innerHTML = startupResults(); const c = $('#st-count'); if (c) c.textContent = filteredStartups().length + ' shown'; return; }
  if (el.dataset.input === 'search-q') { renderSearch(el.value); return; }
  if (el.dataset.input === 'kb-q') { filters.kb = el.value; $('#kb-results').innerHTML = kbResults(); return; }
  if (el.name === 'overall' || el.name?.startsWith('al_')) allocSum();
  if (el.type !== 'checkbox' && el.type !== 'radio') syncDraft(el);
});

/* ================= form submission ================= */
const FORMS = {
  ...VH_FORMS,
  ...SCH_FORMS,
  meeting(f, fd) {
    if (!ea()) { toast('Only the Executive Assistant can schedule meetings', '', true); return closeDialog(); }
    const id = f.dataset.id, prev = id ? state.meetings.find(x => x.id === id) : null, err = $('#merr');
    const rec = {id:id || uid('mt'), title:fd.get('title').trim(), date:fd.get('date'), start:fd.get('start'), end:fd.get('end'), location:fd.get('location').trim(), agenda:fd.get('agenda').trim(), ...formAudience(f)};
    if (rec.mode === 'all') { rec.teamIds = []; rec.attendees = []; }
    if (!rec.title || !rec.date || !rec.start || !rec.end || !rec.location || !rec.agenda) { err.textContent = 'Fill in the title, date, times, location and agenda.'; return; }
    if (rec.end <= rec.start) { err.textContent = 'The meeting has to end after it starts, on the same day.'; return; }
    const now = recipients(rec); if (!now.length) { err.textContent = 'Invite at least one person or team.'; return; }
    const when = `${fmtDate(rec.date)} · ${fmtTime(rec.start)}–${fmtTime(rec.end)} · ${rec.location}`;
    const liveNote = n => LIVE ? `${n} notified${state.calendar.connected ? ' · Google Calendar invite sent' : ''}` : `${n} notified (simulated)`;
    let nid;
    if (prev) { const union = [...new Set([...recipients(prev), ...now])]; nid = notify('update', `Meeting updated: ${rec.title}`, when, union); upsert(state.meetings, {...rec, onCalendar:prev.onCalendar}); finish('Meeting updated', liveNote(union.length)); }
    else { nid = notify('invite', `Meeting invitation: ${rec.title}`, when, now); upsert(state.meetings, rec); finish('Meeting scheduled', liveNote(now.length)); }
    afterSync(async () => {
      if (state.calendar.connected) await calendarApi('sync', {id:rec.id}).then(() => { const m = state.meetings.find(x => x.id === rec.id); if (m) { m.onCalendar = true; render(); } })
        .catch(e => toast('Saved, but the Google Calendar invite failed: ' + e.message, '', true));
      await fnApi('push', 'notification', {id:nid}).catch(() => {});
    });
  },
  calendar(f, fd) { if (!ea() || LIVE) return; state.calendar = {connected:true, email:fd.get('email').trim()}; finish('Google Calendar connected', 'simulated — no OAuth'); },
  event(f) {
    const v = draft, err = $('#eerr'), existing = v._new ? null : eventById(v.id);
    if (existing && !canEvent(existing)) { toast('You can’t edit this event anymore', '', true); return closeDialog(); }
    if (!v.name.trim() || !v.date) { err.textContent = 'Give the event a name and a date.'; return; }
    if (v.tasks.some(t => !t.title.trim() || !t.due)) { err.textContent = 'Every requirement needs a title and a due date — or remove the empty ones.'; return; }
    const rec = {...v, name:v.name.trim()}; delete rec._new;
    const people = e => new Set([...(e?.assigned || []), ...(e?.tasks || []).map(t => t.owner)].filter(Boolean));
    const before = people(existing), added = [...people(rec)].filter(u => !before.has(u) && u !== me().id);
    recordChange('event', rec.id, existing ? 'updated' : 'created', rec.name, existing ? diffFields(existing, rec, ['name', 'description', 'date', 'location', 'team', 'assigned']) : {});
    if (existing) { const old = new Map(existing.tasks.map(r => [r.id, r]));
      rec.tasks.forEach(r => { const o = old.get(r.id); if (!o) recordChange('event', rec.id, 'requirement created', r.title); else { const d = diffFields(o, r, ['title', 'owner', 'due', 'done']); if (Object.keys(d).length) recordChange('event', rec.id, 'requirement updated', r.title, d); } old.delete(r.id); });
      old.forEach(r => recordChange('event', rec.id, 'requirement deleted', r.title)); }
    upsert(state.events, rec); finish(v._new ? `Created ${rec.name}` : `Saved ${rec.name}`, `${pct(rec.tasks.filter(t => t.done).length, rec.tasks.length)}% ready`);
    if (added.length) afterSync(() => fnApi('push', 'event', {id:rec.id, added}).catch(() => {}));
  },
  idea(f, fd) {
    const id = f.dataset.id, prev = id ? state.ideas.find(x => x.id === id) : null, err = $('#ierr');
    if (prev && !canIdea(prev)) { toast('You can’t edit this idea', '', true); return closeDialog(); }
    const owner = prev ? (prev.owner || (isAdmin() && fd.get('owner')) || null) : me().id;   // locked
    const rec = {...(prev || {}), id:id || uid('i'), title:fd.get('title').trim(), description:fd.get('description').trim(), team:fd.get('team'), owner, assigned:fd.getAll('assigned').filter(a => a !== owner), stage:fd.get('stage'), notes:fd.get('notes').trim(), next:fd.get('next').trim(), due:fd.get('due')};
    if (!rec.title) { err.textContent = 'Give the idea a title.'; return; }
    if (rec.next && !rec.due) { err.textContent = 'Add a target date so the next step shows up in Deadlines.'; return; }
    if (prev && rec.stage === 'completed' && prev.stage !== 'completed') rec.previousStage = prev.stage;
    const before = new Set(prev ? [prev.owner, ...prev.assigned] : []), added = [rec.owner, ...rec.assigned].filter(u => u && !before.has(u) && u !== me().id);
    recordChange('idea', rec.id, prev ? 'updated' : 'created', rec.title, prev ? diffFields(prev, rec, ['title', 'description', 'team', 'owner', 'assigned', 'stage', 'notes', 'next', 'due']) : {});
    upsert(state.ideas, rec); finish(prev ? 'Idea saved' : 'Idea submitted', rec.next ? 'next step added to Deadlines' : '');
    if (added.length) afterSync(() => fnApi('push', 'idea', {id:rec.id, added}).catch(() => {}));
  },
  task(f, fd) {
    const owner = oversight() ? fd.get('owner') : me().id, title = fd.get('title').trim(), due = fd.get('due');
    if (!title || !due) return toast('Add what needs doing and when', '', true);
    const tid = uid('t'); state.tasks.push({id:tid, title, owner, due, done:false, related:fd.get('related').trim() || 'Follow-up'});
    if (owner !== me().id) afterSync(() => fnApi('push', 'task', {id:tid}).catch(() => {}));
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
    if (rec.owner !== me().id && (!prev || prev.owner !== rec.owner)) afterSync(() => fnApi('push', 'design', {id:rec.id}).catch(() => {}));
  },
  startup(f) {
    if (!access('startups')) return closeDialog();
    if (!f.reportValidity()) return;
    const v = draft; if (!v.name.trim()) return toast('Give the startup a name', '', true);
    if (!v.contacts.some(c => c.primary)) v.contacts[0].primary = true;
    const rec = {...v, name:v.name.trim()}; delete rec._new;
    const prevS = state.startups.find(x => x.id === rec.id);
    recordChange('startup', rec.id, prevS ? 'updated' : 'created', rec.name, prevS ? diffFields(prevS, rec, ['name', 'sector', 'notes', 'attendance', 'contacts']) : {});
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
  'note-share'(f, fd) { saveNoteShare(f, fd); },
  member(f, fd) { if (!oversight()) return closeDialog(); member(f.dataset.id).responsibility = fd.get('responsibility').trim(); finish('Responsibility updated'); },
  login(f, fd) { if (LIVE) passwordSignIn(String(fd.get('email') || ''), String(fd.get('password') || '')); },
  'login-code'(f, fd) { if (LIVE) verifyLoginCode(f.dataset.email, String(fd.get('code') || '')); },
  async 'set-password'(f, fd) {
    const btn = f.querySelector('.btn-primary'); btn.disabled = true;
    const ok = await savePassword(String(fd.get('password') || ''), String(fd.get('again') || ''), $('#p-msg'));
    btn.disabled = false;
    if (ok) { openApp(); toast('Password saved', 'use it to sign in on any device, including the home-screen app'); }
  },
  async 'change-password'(f, fd) {
    const ok = await savePassword(String(fd.get('password') || ''), String(fd.get('again') || ''), $('#cp-msg'));
    if (ok) { closeDialog(); toast('Password changed'); }
  },
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
    runAdmin('invite', p, `Invited ${p.name}`, 'account created — send them the temporary password');
  },
  'admin-edit'(f, fd) {
    if (!isAdmin()) return closeDialog();
    const list = adminData.members || state.members, t = list.find(x => x.id === f.dataset.id);
    const p = {id:f.dataset.id, name:String(fd.get('name')).trim(), role:fd.get('role'), team:fd.get('team'), is_admin: f.querySelector('[name=is_admin]').disabled ? true : !!fd.get('is_admin')};
    if (!p.name) { $('#aerr').textContent = 'Add their name.'; return; }
    const wa = String(fd.get('whatsapp') || '').trim();
    if (wa && !/^\+?[0-9 ()-]{7,24}$/.test(wa)) { $('#aerr').textContent = 'Use a phone number like +971 50 123 4567.'; return; }
    const m = member(p.id); if (m && (m.whatsapp || '') !== wa) { m.whatsapp = wa; if (t) t.whatsapp = wa; save(); }
    (LIVE ? syncChain : Promise.resolve()).then(() => runAdmin('update', p, `Saved ${p.name}`, t && t.role !== p.role ? `${roleLabel(t.role)} → ${roleLabel(p.role)}` : ''));
  },
  links(f, fd) {
    if (!isAdmin()) return;
    const err = $('#lkerr'), bad = [], url = (v, label) => { v = String(v || '').trim(); if (v && !/^https:\/\/\S+$/i.test(v)) bad.push(label); return v; };
    const wa = {all:url(fd.get('wa_all'), 'All-members WhatsApp')};
    TEAMS.forEach(tm => { const v = url(fd.get('wa_' + tm.id), `${tm.name} WhatsApp`); if (v) wa[tm.id] = v; });
    if (!wa.all) delete wa.all;
    const drive = url(fd.get('drive_url'), 'Design Drive'), cal = url(fd.get('cal_url'), 'Club calendar');
    const custom = [...f.querySelectorAll('.custom-row')].map(r => ({label:r.querySelector('[data-cl]').value.trim(), url:url(r.querySelector('[data-cu]').value, r.querySelector('[data-cl]').value.trim() || 'Other link')}))
      .filter(c => c.url).map((c, i) => ({id:'l' + i, label:c.label || c.url.replace(/^https:\/\//, '').split('/')[0], url:c.url}));
    const numbers = [], badNums = [];
    (adminData.members || state.members).forEach(m => { const v = fd.get('num_' + m.id); if (v === null) return; const n = String(v).trim();
      if (n && !/^\+?[0-9 ()-]{7,24}$/.test(n)) badNums.push(m.name); else numbers.push([m.id, n]); });
    if (bad.length || badNums.length) { err.textContent = [bad.length ? `Use a full https:// link for: ${bad.join(', ')}.` : '', badNums.length ? `Check the WhatsApp number for: ${badNums.join(', ')}.` : ''].join(' '); return; }
    state.settings.designDriveUrl = drive;
    state.settings.links = {whatsapp:wa, calendarUrl:cal, custom};
    numbers.forEach(([id, n]) => { const m = member(id); if (m) m.whatsapp = n; const a = adminData.members?.find(x => x.id === id); if (a) a.whatsapp = n; });
    save(); render(); toast('Links saved', 'members see them straight away');
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
setInterval(rotateTagline, 12000);   // Overview headline
if (LIVE) liveBoot();
else {
  initDemoState();
  registerSW();
  try { localStorage.setItem(KEY + '-probe', '1'); localStorage.removeItem(KEY + '-probe'); } catch (e) { storageOk = false; }
  save();
  render();
  handleLaunchParams();
  maybeShowWelcome();
}
