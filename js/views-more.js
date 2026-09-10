
/* ================= startup directory ================= */
const ratingCell = r => r == null ? '<span class="faint">—</span>' : `<span class="rating ${r >= 8 ? 'hi' : r < 6 ? 'lo' : ''}"><span class="num">${r}</span><span class="bar"><i style="width:${r * 10}%"></i></span></span>`;
const attTags = s => s.attendance.length ? s.attendance.map(a => `<span class="tag rise">${esc(a)}</span>`).join(' ') : '<span class="faint">Never</span>';
const contactFlag = s => s.deletion ? '<span class="due over">Deletion pending</span>' : missingContact(s) ? '<span class="due soon">Missing details</span>' : '<span class="due done">Complete</span>';
function startupResults() {
  const list = filteredStartups(), f = filters.startups;
  if (!list.length) return '<div class="panel empty">No startups match. Clear the filters or search for something else.</div>';
  if (isM()) return `<ul class="s-list">${list.map(s => { const p = primaryContact(s); return `
    <li class="s-item" data-act="open-startup" data-id="${s.id}"><div class="n"><span>${esc(s.name)}</span>${s.attendance.map(a => `<span class="tag rise">${esc(a)}</span>`).join('')}</div><div>${ratingCell(s.rating)}</div>
      <div class="sub"><span>${esc(s.sector || '—')}</span><span class="faint">·</span><span>${p?.name ? esc(p.name) : '<span class="faint">No contact</span>'}</span>${s.deletion ? '<span class="review" style="margin-left:auto;color:var(--ember)">Deletion pending</span>' : missingContact(s) ? '<span class="review" style="margin-left:auto">Missing details</span>' : ''}</div></li>`; }).join('')}</ul>`;
  if (f.view === 'cards') return `<div class="cards">${list.map(s => { const p = primaryContact(s); return `
    <button class="card" data-act="open-startup" data-id="${s.id}"><div style="display:flex;justify-content:space-between;gap:8px"><h3>${esc(s.name)}</h3>${ratingCell(s.rating)}</div>
      <span class="tag" style="align-self:flex-start">${esc(s.sector || '—')}</span>
      <div class="desc">${s.notes ? esc(s.notes) : '<span class="faint">No notes yet.</span>'}</div>
      <div class="card-foot"><span>${p?.name ? esc(p.name) : 'No contact'}</span>${contactFlag(s)}</div></button>`; }).join('')}</div>`;
  return `<div class="table-wrap"><table><thead><tr><th>Startup</th><th>Sector</th><th>Rating</th><th>Primary contact</th><th>Phone</th><th>Email</th><th>Attended</th><th>Contact details</th></tr></thead><tbody>${list.map(s => { const p = primaryContact(s);
    return `<tr data-act="open-startup" data-id="${s.id}"><td><div class="name">${esc(s.name)}</div>${s.notes ? `<div class="desc">${esc(s.notes)}</div>` : ''}</td><td style="white-space:nowrap">${esc(s.sector || '—')}</td><td>${ratingCell(s.rating)}</td>
      <td style="white-space:nowrap">${p?.name ? esc(p.name) : '<span class="faint">—</span>'}${s.contacts.length > 1 ? ` <span class="faint">+${s.contacts.length - 1}</span>` : ''}</td>
      <td class="mono" style="font-size:12.5px;white-space:nowrap">${p?.phone ? esc(p.phone) : '<span class="faint">—</span>'}</td><td class="mono" style="font-size:12.5px">${p?.email ? esc(p.email) : '<span class="faint">—</span>'}</td>
      <td style="white-space:nowrap">${attTags(s)}</td><td>${contactFlag(s)}</td></tr>`; }).join('')}</tbody></table></div>`;
}
function vStartups() {
  const f = filters.startups, all = state.startups, any = all.filter(s => s.attendance.length).length, miss = all.filter(missingContact).length;
  const sectors = [...new Map(all.filter(s => s.sector).map(s => [s.sector.toLowerCase(), s.sector])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const card = (v, n, l) => `<button class="sum-card ${v === 'missing' && n ? 'alert' : ''}" data-act="st-card" data-v="${v}"><span class="v">${n}</span><span class="l">${l}</span></button>`;
  const hasF = f.q || f.sector !== 'all' || f.att !== 'all' || f.missing;
  return `<div class="page">
    ${heading('Startup Directory', 'Every startup the club has worked with, imported from the Launchpad Startups DB sheet. A startup counts once however many events it attended.', `<div class="seg desk-only">${[['table','Table'], ['cards','Cards']].map(([v, l]) => `<button data-act="st-view" data-v="${v}" aria-pressed="${f.view === v}">${l}</button>`).join('')}</div><button class="btn btn-primary" data-act="new-startup">${ic('plus')}Add startup</button>`)}
    <div class="sum-cards">${card('all', all.length, 'Startups')}${card('any', any, 'Attended at least once')}${card('never', all.length - any, 'Never attended')}${card('missing', miss, 'Missing contact details')}</div>
    <label class="search" style="${isM() ? '' : 'display:none'}">${ic('search')}<input class="input" type="search" placeholder="Search company, sector, notes, contacts…" value="${esc(f.q)}" data-input="st-q" aria-label="Search startups"></label>
    <div class="${isM() ? 'scroller' : 'toolbar'}">
      ${isM() ? '' : `<label class="search">${ic('search')}<input class="input" type="search" placeholder="Search company, sector, notes, contacts…" value="${esc(f.q)}" data-input="st-q" aria-label="Search startups" style="width:280px"></label>`}
      <select class="input" data-change="st-sector" aria-label="Sector"><option value="all">All sectors</option>${sectors.map(([k, l]) => opt(k, l, f.sector)).join('')}</select>
      <select class="input" data-change="st-att" aria-label="Attendance">${opt('all', 'Any attendance', f.att)}${opt('any', 'Attended at least once', f.att)}${opt('never', 'Never attended', f.att)}${PAST_EVENTS.map(e => opt(e, 'Attended ' + e, f.att)).join('')}</select>
      <label class="fchip" style="display:inline-flex;align-items:center;gap:6px;${f.missing ? 'background:var(--text-primary);color:var(--ink)' : ''}"><input type="checkbox" data-change="st-missing" ${f.missing ? 'checked' : ''} style="accent-color:var(--amber)">Missing contact details</label>
      ${hasF ? '<button class="btn btn-ghost sm" data-act="st-clear">Clear filters</button>' : ''}
      ${isM() ? '' : `<span class="spacer"></span><span class="faint" id="st-count" style="font-size:13px">${filteredStartups().length} shown</span>`}
    </div>
    <div id="st-results">${startupResults()}</div>
  </div>`;
}

/* ================= budget ================= */
function vBudget() {
  const b = state.budget, t = budgetTotals(), overAlloc = t.allocated > b.overall;
  const evs = state.events.filter(e => b.allocations[e.id] != null || b.expenses.some(x => x.event === e.id));
  const rcpt = r => r ? `<span class="mono" style="font-size:12px">${esc(r)}</span>` : '<span class="faint">None</span>';
  const exRows = b.expenses.map(e => ({e, over:+e.actual > +e.planned && +e.actual > 0}));
  return `<div class="page">
    ${heading('Budget', 'Club budget, event allocations, expenses and reimbursements in AED. Amounts are illustrative.', `<button class="btn" data-act="edit-alloc">Edit allocations</button><button class="btn" data-act="new-reimb">${ic('plus')}Reimbursement</button><button class="btn btn-primary" data-act="new-expense">${ic('plus')}Expense</button>`)}
    ${overAlloc ? `<div class="banner">${ic('info')}Event allocations (${aed(t.allocated)}) exceed the overall budget (${aed(b.overall)}).</div>` : ''}
    <div class="totals">
      <div class="total"><span class="eyebrow">Overall budget</span><span class="v">${num(b.overall)}<small>AED</small></span></div>
      <div class="total"><span class="eyebrow">Allocated to events</span><span class="v">${num(t.allocated)}<small>AED</small></span></div>
      <div class="total"><span class="eyebrow">Planned</span><span class="v">${num(t.planned)}<small>AED</small></span></div>
      <div class="total"><span class="eyebrow">Actual · remaining</span><span class="v">${num(t.actual)}<small>/ ${num(b.overall - t.actual)} left</small></span></div>
    </div>
    <div class="bud-cards">${evs.map(e => { const x = budgetTotals(e.id), p = x.allocation ? Math.min(x.actual / x.allocation, 1) * 100 : 0;
      return `<section class="bud-card ${x.over ? 'over' : ''}"><div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline"><h3 style="font-size:17px">${esc(e.name)}</h3>${x.over ? '<span class="over-flag">Overspent</span>' : `<span class="num faint" style="font-size:12px">${fmtDate(e.date, {day:'numeric', month:'short'})}</span>`}</div>
        <div class="bbar"><i class="${x.over ? 'over' : p > 85 ? 'warn' : ''}" style="width:${p}%"></i></div>
        <dl class="kv"><dt>Allocation</dt><dd>${num(x.allocation)}</dd><dt>Planned</dt><dd>${num(x.planned)}</dd><dt>Actual</dt><dd>${num(x.actual)}</dd><dt>Remaining</dt><dd style="${x.remaining < 0 ? 'color:var(--ember)' : ''}">${num(x.remaining)}</dd></dl></section>`; }).join('')}</div>
    <section class="dl-group"><h2>Expenses <span class="num">${b.expenses.length}</span></h2>
      ${isM() ? `<ul class="m-rows">${exRows.map(({e, over}) => `<li data-act="edit-expense" data-id="${e.id}"><div class="top"><b>${esc(e.name)}</b><span class="num">${num(e.actual)} / ${num(e.planned)}</span></div><div class="sub"><span>${esc(eventById(e.event)?.name || '—')}</span>${over ? '<span class="over-flag">Over plan</span>' : ''}<span style="margin-left:auto">${rcpt(e.receipt)}</span></div></li>`).join('')}</ul>`
      : `<div class="table-wrap"><table><thead><tr><th>Expense</th><th>Event</th><th class="r">Planned</th><th class="r">Actual</th><th>Receipt</th></tr></thead><tbody>${exRows.map(({e, over}) => `<tr data-act="edit-expense" data-id="${e.id}"><td class="name">${esc(e.name)}</td><td>${esc(eventById(e.event)?.name || '—')}</td><td class="r num">${num(e.planned)}</td><td class="r num" style="${over ? 'color:var(--ember)' : ''}">${num(e.actual)}</td><td>${rcpt(e.receipt)}</td></tr>`).join('')}</tbody></table></div>`}</section>
    <section class="dl-group"><h2>Reimbursements <span class="num">${b.reimbursements.length}</span></h2>
      ${isM() ? `<ul class="m-rows">${b.reimbursements.map(r => `<li data-act="edit-reimb" data-id="${r.id}"><div class="top"><b>${esc(r.name)}</b>${badge('rs-' + r.status, r.status)}</div><div class="sub"><span>${esc(member(r.member)?.name)}</span><span class="faint">·</span><span>${esc(eventById(r.event)?.name || '—')}</span><span class="num" style="margin-left:auto">${num(r.amount)} AED</span></div></li>`).join('')}</ul>`
      : `<div class="table-wrap"><table><thead><tr><th>Reimbursement</th><th>Member</th><th>Event</th><th class="r">Amount</th><th>Status</th><th>Receipt</th></tr></thead><tbody>${b.reimbursements.map(r => `<tr data-act="edit-reimb" data-id="${r.id}"><td class="name">${esc(r.name)}</td><td>${who(r.member)}</td><td>${esc(eventById(r.event)?.name || '—')}</td><td class="r num">${num(r.amount)}</td><td>${badge('rs-' + r.status, r.status)}</td><td>${rcpt(r.receipt)}</td></tr>`).join('')}</tbody></table></div>`}
      <span class="muted-note">Planned counts every reimbursement that isn’t rejected; actual counts paid ones only. Receipts store the filename only.</span></section>
  </div>`;
}

/* ================= design ================= */
function vDesign() {
  const list = state.designs.filter(d => filters.design === 'all' || d.status !== 'completed').sort((a, b) => a.due.localeCompare(b.due));
  const rel = d => esc(d.event ? eventById(d.event)?.name || 'Event' : d.campaign || 'Campaign');
  return `<div class="page">
    ${heading('Design', 'Creative requests for events and campaigns. Assigned members see their work in Events and Deadlines too.', `${driveBtn()}<button class="btn btn-primary" data-act="new-design">${ic('plus')}New request</button>`)}
    <div class="toolbar">${seg('design-f', filters.design, [['open','Open'], ['all','All requests']])}</div>
    ${list.length ? (isM() ? `<ul class="m-rows">${list.map(d => `<li data-act="open-design" data-id="${d.id}"><div class="top"><b>${esc(d.title)}</b>${designBadge(d.status)}</div><div class="sub"><span>${rel(d)}</span><span class="faint">·</span>${avatar(d.owner)}<span style="margin-left:auto">${dueChip(d.due, d.status === 'completed')}</span></div></li>`).join('')}</ul>`
      : `<div class="table-wrap"><table><thead><tr><th>Request</th><th>Event / campaign</th><th>Deliverables</th><th>Assigned</th><th>Due</th><th>Status</th></tr></thead><tbody>${list.map(d => `<tr data-act="open-design" data-id="${d.id}"><td class="name">${esc(d.title)}</td><td>${rel(d)}</td><td class="muted" style="font-size:13px">${esc(d.deliverables)}</td><td style="white-space:nowrap">${who(d.owner)}</td><td>${dueChip(d.due, d.status === 'completed')}</td><td>${designBadge(d.status)}</td></tr>`).join('')}</tbody></table></div>`)
      : '<div class="panel empty">No open design requests.</div>'}
  </div>`;
}

/* ================= members & teams ================= */
const waBtn = (kind, id, label, sm) => `<button class="btn btn-wa ${sm ? 'sm' : ''} ${label ? '' : 'icon-btn'}" data-act="wa" data-kind="${kind}" data-id="${id}" aria-label="Chat on WhatsApp" title="Chat on WhatsApp">${ic('wa')}${label || ''}</button>`;
function vMembers() {
  return `<div class="page">
    ${heading('Members & teams', 'Who’s on each team and what they’re responsible for. Leadership edits responsibilities; admins add and remove members and change roles in Admin.', isAdmin() ? `<button class="btn" data-act="go" data-v="admin">${ic('shield')}Manage members</button>` : '')}
    <div class="teams">${TEAMS.map(t => { const ms = teamMembers(t.id);
      return `<section class="team"><div style="display:flex;justify-content:space-between;gap:10px"><h3>${esc(t.name)}</h3><span class="num faint" style="font-size:12px">${ms.length} ${ms.length === 1 ? 'person' : 'people'}</span></div><p>${esc(t.desc)}</p>
        <div class="team-foot"><span class="stack">${ms.map(id => avatar(id)).join('')}</span>${waBtn('team', t.id, 'Chat on WhatsApp', true)}</div></section>`; }).join('')}</div>
    ${isM() ? `<ul class="m-rows">${state.members.filter(m => m.active !== false).map(m => `<li data-act="edit-member" data-id="${m.id}"><div class="top"><span class="who">${avatar(m.id)}<b>${esc(m.name)}</b></span>${waBtn('person', m.id)}</div><div class="sub"><span class="role">${esc(roleLabel(m.role))}</span><span class="faint">·</span><span>${esc(teamName(m.team))}</span></div><div class="sub">${esc(m.responsibility)}</div></li>`).join('')}</ul>`
    : `<div class="table-wrap"><table><thead><tr><th>Member</th><th>Role</th><th>Team</th><th>Responsibility</th><th></th></tr></thead><tbody>${state.members.filter(m => m.active !== false).map(m => `<tr data-act="edit-member" data-id="${m.id}"><td style="white-space:nowrap">${who(m.id)}</td><td style="white-space:nowrap">${esc(roleLabel(m.role))}</td><td>${esc(teamName(m.team))}</td><td class="muted" style="font-size:13px;max-width:52ch">${esc(m.responsibility)}</td><td class="r">${waBtn('person', m.id, '', true)}</td></tr>`).join('')}</tbody></table></div>`}
  </div>`;
}

/* ================= knowledge base (static) ================= */
const KB = [
  {id:'k1', title:'Your first two weeks at Launchpad', category:'Onboarding', roles:[], summary:'What every new member does first.', steps:['Pick your role in Rocket and read its guidance article.','Join your team’s WhatsApp group from Members & teams (ask leadership for the link if you can’t see that section).','Check Deadlines daily — it shows only what you own.','Submit at least one idea in your first month.']},
  {id:'k2', title:'Scheduling a club meeting', category:'Meeting coordination', roles:['ea'], summary:'Only the Executive Assistant schedules, edits and cancels meetings.', steps:['Open Meetings and choose Schedule meeting.','Invite all members, whole teams, individuals, or a mix. The unique attendee count updates as you pick.','Add an agenda people can prepare for, and a room or call link.','Editing a meeting notifies everyone who was on it before or after the change.','Deleting a meeting sends a cancellation to its current attendees.']},
  {id:'k3', title:'How meeting invitations reach you', category:'Meeting coordination', roles:['treasurer','startup','pr','tech','media','design','innovation'], summary:'You see a meeting when you’re invited directly or through your team.', steps:['Invitations appear in Meetings and in your notification log.','If your team is invited, you are too.','Ask the Executive Assistant for changes — other roles can’t edit meetings.']},
  {id:'k4', title:'Budget, expenses and reimbursements', category:'Finance', roles:['treasurer'], summary:'Keeping allocations, plans and actuals honest.', steps:['Set the overall budget, then allocate per event. Allocations can’t exceed the overall budget.','Log each expense with a planned and an actual amount.','Record reimbursements separately so a cost isn’t counted twice.','Move reimbursements through Requested, Approved, Paid or Rejected.','Attach the receipt filename; check event cards for overspending.']},
  {id:'k5', title:'Claiming a reimbursement', category:'Finance', roles:[], summary:'Getting paid back for something you bought for the club.', steps:['Get the Treasurer’s go-ahead before you spend.','Keep an itemised receipt.','Send it to the Treasurer, who records the claim in Budget.']},
  {id:'k6', title:'Planning an event checklist', category:'Event planning', roles:['president','vp'], summary:'Turning an event into owned, dated requirements.', steps:['Create the event and pick the responsible team.','Add every requirement with one owner and a deadline.','Owners tick requirements off in Deadlines; progress updates on the event.','Assign design requests to the event so creative work shows up alongside it.']},
  {id:'k7', title:'Keeping startup contacts current', category:'Startup contacts', roles:['startup'], summary:'A directory is only useful if you can reach people.', steps:['Filter by Missing contact details weekly.','Each startup needs exactly one primary contact.','Record every event a startup attended, including Rise and Ignite.','Save incomplete details rather than losing them — follow up later.']},
  {id:'k8', title:'Creative requests and approvals', category:'Creative approvals', roles:['pr','media','design'], summary:'From brief to approved asset.', steps:['PR or leadership writes the brief and deliverables in Design.','The assignee moves the request to In Progress, then In Review.','PR reviews and marks it Completed.','Assignees without the Design section update status from Events.']},
  {id:'k9', title:'Leading the board', category:'Leadership', roles:['president','vp','advisor'], summary:'What oversight roles can and can’t do.', steps:['You can see every meeting, deadline and idea.','You can’t create or change meetings — that stays with the Executive Assistant.','Use Members & teams to keep responsibilities accurate.']},
  {id:'k10', title:'Technical setup: forms, livestream and tools', category:'Technical setup', roles:['tech'], summary:'The club’s technical checklist.', steps:['Test sign-up forms a week before each event.','Run a livestream rehearsal on the actual network.','Keep credentials in the club password manager, never in chats.']},
  {id:'k12', title:'Admin: managing members and logins', category:'Admin', roles:[], summary:'For whoever holds admin rights — usually someone on Tech.', steps:['Invite members from Admin with their @aus.edu email, club role and team. They sign in with an emailed code and set a password.','Change someone’s role or team from Admin; their sections and permissions update the next time the page loads.','Disable a login to lock someone out but keep their history. Remove a member only when their records should become unassigned.','New members sign in once with an emailed code, then set their own password. If someone forgets theirs, send them a sign-in code from Admin.','Keep at least two admins so the club never gets locked out.']},
  {id:'k11', title:'Moving an idea through the pipeline', category:'Innovation', roles:['innovation'], summary:'Submitted → Under Review → Approved → In Progress → Completed.', steps:['Give every idea an owner, a team and one clear next step.','The next step appears in Deadlines for the owner and collaborators.','Completing that step marks the idea Completed; reopening restores its earlier stage.']}];
// `KB` above is only the starting content for a new demo. The live list is state.kb, which admins edit.
function kbOrdered() {
  const q = filters.kb.trim().toLowerCase();
  const rank = a => a.roles.includes(state.role) ? 0 : a.category === 'Onboarding' ? 1 : 2;
  return state.kb.filter(a => !q || [a.title, a.summary, a.category, a.body].join(' ').toLowerCase().includes(q)).sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title));
}
function kbResults() {
  const list = kbOrdered();
  return list.length ? `<div class="cards" style="grid-template-columns:repeat(auto-fill,minmax(${isM() ? '100%' : '280px'},1fr))">${list.map(a => `<button class="kb-card" data-act="open-kb" data-id="${a.id}"><div class="chiprow"><span class="tag">${esc(a.category)}</span>${a.roles.includes(state.role) ? '<span class="tag for-you">For your role</span>' : ''}</div><h3>${esc(a.title)}</h3><p>${esc(a.summary)}</p>${a.updatedAt ? `<span class="kb-meta">Updated ${fmtDate(a.updatedAt.slice(0, 10), {day:'numeric', month:'short', year:'numeric'})}</span>` : ''}</button>`).join('')}</div>` : `<div class="panel empty">${state.kb.length ? 'No articles match that search.' : 'No articles yet.'}</div>`;
}
function vKB() {
  return `<div class="page">
    ${heading('Knowledge Base', isAdmin() ? 'Club SOPs and guides. As an admin you can add, edit and delete articles — with formatting, links and images.' : 'Guides for every role. Articles for your role come first, then onboarding.', isAdmin() ? `<button class="btn btn-primary" data-act="kb-new">${ic('plus')}New article</button>` : '')}
    <div class="readonly-note">${ic('info')}<span>Club guidance written by Launchpad — not official university policy.</span></div>
    <label class="search" style="max-width:420px">${ic('search')}<input class="input" type="search" placeholder="Search guides…" value="${esc(filters.kb)}" data-input="kb-q" aria-label="Search guides" style="width:100%"></label>
    <div id="kb-results">${kbResults()}</div>
  </div>`;
}
