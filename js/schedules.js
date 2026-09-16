
/* ================= Schedules: everyone's class timetable =================
   Each member keeps their weekly classes here, so the club can see when people are actually free.
   Everyone sees everyone's timetable; you edit your own, and the Executive Assistant can fill one in
   for someone who hasn't (and fix it afterwards). Entries repeat weekly between their semester dates,
   so last term's classes stop counting. All times are plain club times (Gulf Standard Time), the same
   way meetings are stored — no timezone conversion anywhere.
   Schedules are deliberately separate from meetings: they never block or change a meeting. */

const CLUB_TZ = 'Gulf Standard Time';
const SCH_DAYS = [[1, 'Mon', 'Monday'], [2, 'Tue', 'Tuesday'], [3, 'Wed', 'Wednesday'], [4, 'Thu', 'Thursday'], [5, 'Fri', 'Friday'], [6, 'Sat', 'Saturday'], [7, 'Sun', 'Sunday']];
const SCH_MIN = [[30, '30 min'], [60, '1 hour'], [90, '1½ hours'], [120, '2 hours']];
const SCH_WINDOW = ['08:00', '20:00'];   // the day the free-time finder looks at
const sch = {slotH:22};

const schedules = () => state.schedules || [];
const mins = t => { const [h, m] = String(t).slice(0, 5).split(':').map(Number); return h * 60 + m; };
const hhmm = n => `${pad(Math.floor(n / 60))}:${pad(n % 60)}`;
const schOwner = r => r.member;
const canEditSched = r => !!r && (r.member === me().id || ea());
const schOf = id => schedules().find(r => r.id === id);
const dayName = d => SCH_DAYS.find(x => x[0] === d)?.[2] || '';
const schMonday = (d = new Date()) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return ymd(x); };
const schWeek = () => filters.sched.week ||= schMonday();
const schDate = (week, day) => addDays(week, day - 1);                        // the date that weekday falls on
const schRuns = (r, date) => (!r.term_start || r.term_start <= date) && (!r.term_end || r.term_end >= date);
const schActive = (r, week) => schRuns(r, schDate(week, r.day_of_week));       // still running in this week
const schFor = (memberId, week) => schedules().filter(r => r.member === memberId && schActive(r, week));
const schHue = id => HUES[[...String(id)].reduce((s, c) => s + c.charCodeAt(0), 0) % HUES.length];
const overlaps = (a, b) => mins(a.start_time) < mins(b.end_time) && mins(b.start_time) < mins(a.end_time);   // touching edges don't count
const schClash = r => schedules().some(x => x.id !== r.id && x.member === r.member && x.day_of_week === r.day_of_week && overlaps(x, r)
  && (!x.term_end || !r.term_start || x.term_end >= r.term_start) && (!r.term_end || !x.term_start || r.term_end >= x.term_start));
const schTerm = r => r.term_start || r.term_end ? `${r.term_start ? fmtDate(r.term_start, {day:'numeric', month:'short'}) : 'now'} – ${r.term_end ? fmtDate(r.term_end, {day:'numeric', month:'short', year:'numeric'}) : 'ongoing'}` : 'Every week';
const schTime = r => `${fmtTime(String(r.start_time).slice(0, 5))}–${fmtTime(String(r.end_time).slice(0, 5))}`;
// Who the timetable views are showing
function schPeople() {
  const f = filters.sched, active = state.members.filter(m => m.active !== false);
  if (f.view === 'mine') return [me().id];
  const inTeam = f.team === 'all' ? active : active.filter(m => m.team === f.team);
  const picked = f.people.filter(id => inTeam.some(m => m.id === id));
  return (picked.length ? picked : inTeam.map(m => m.id));
}
// Days worth showing: the working week, plus any day someone actually has a class on
function schDaysShown(ids, week) {
  const used = new Set(ids.flatMap(id => schFor(id, week)).map(r => r.day_of_week));
  return SCH_DAYS.filter(([d]) => d <= 5 || used.has(d));
}

/* ---------------- free time ---------------- */
// The windows on each day when nobody selected has a class. Merges everyone's classes, then takes the gaps.
function freeGaps(ids, week, minLen) {
  const [from, to] = SCH_WINDOW.map(mins);
  return schDaysShown(ids, week).map(([d, , long]) => {
    const busy = ids.flatMap(id => schFor(id, week).filter(r => r.day_of_week === d))
      .map(r => [Math.max(mins(r.start_time), from), Math.min(mins(r.end_time), to)]).filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0]);
    const merged = [];
    busy.forEach(([a, b]) => { const last = merged[merged.length - 1]; if (last && a <= last[1]) last[1] = Math.max(last[1], b); else merged.push([a, b]); });
    const gaps = []; let at = from;
    merged.forEach(([a, b]) => { if (a - at >= minLen) gaps.push([at, a]); at = Math.max(at, b); });
    if (to - at >= minLen) gaps.push([at, to]);
    return {day:d, label:long, gaps, allFree:!merged.length};
  });
}

/* ---------------- views ---------------- */
function vSchedules() {
  const f = filters.sched, week = schWeek(), ids = schPeople(), mineCount = schFor(me().id, week).length;
  const head = heading('Schedules', `Everyone’s class timetable, so you can see when people are free. All times are ${CLUB_TZ}.`,
    `<button class="btn btn-primary" data-act="sch-new">${ic('plus')}Add a class</button>`);
  const tabs = `<div class="tabs" role="tablist">${[['mine', 'My schedule'], ['team', 'Team schedules'], ['free', 'Common free time']]
    .map(([v, l]) => `<button role="tab" data-act="sch-view" data-v="${v}" aria-selected="${f.view === v}">${l}</button>`).join('')}</div>`;
  const nav = `<div class="sch-bar">
      <div class="vh-weeknav" style="gap:6px">
        <button type="button" class="btn sm icon-btn" data-act="sch-week" data-v="-1" aria-label="Previous week">‹</button>
        <div class="vh-weeklabel"><b>Week of ${fmtDate(week, {day:'numeric', month:'short'})}</b><span class="faint">${week === schMonday() ? 'This week' : week > schMonday() ? 'Upcoming' : 'Past'}</span></div>
        <button type="button" class="btn sm icon-btn" data-act="sch-week" data-v="1" aria-label="Next week">›</button>
        ${week === schMonday() ? '' : '<button type="button" class="btn sm btn-ghost" data-act="sch-week" data-v="0">This week</button>'}
      </div>
      ${f.view === 'mine' ? '' : schPicker()}
    </div>`;
  const body = f.view === 'mine' ? schMineView(week, mineCount) : f.view === 'team' ? schTeamView(ids, week) : schFreeView(ids, week);
  return `<div class="page">${head}${tabs}${nav}${body}</div>`;
}

function schPicker() {
  const f = filters.sched, active = state.members.filter(m => m.active !== false), inTeam = f.team === 'all' ? active : active.filter(m => m.team === f.team);
  return `<div class="sch-picker">
    <select class="input" data-change="sch-team" aria-label="Team"><option value="all" ${f.team === 'all' ? 'selected' : ''}>Everyone</option>${TEAMS.map(t => opt(t.id, `${t.name} team`, f.team)).join('')}</select>
    <div class="${isM() ? 'scroller' : 'filters'}">${inTeam.map(m => { const on = f.people.includes(m.id), has = schFor(m.id, schWeek()).length;
      return `<button type="button" class="fchip sch-chip ${on ? 'on' : ''}" data-act="sch-who" data-id="${m.id}" aria-pressed="${on}" title="${has ? `${has} class${has === 1 ? '' : 'es'} this week` : 'No timetable yet'}">
        <i style="background:${on ? schHue(m.id) : 'transparent'};border-color:${schHue(m.id)}"></i>${esc(m.name.split(' ')[0])}${has ? '' : ' <span class="num">—</span>'}</button>`; }).join('')}
      ${f.people.length ? '<button type="button" class="fchip" data-act="sch-clear">Clear</button>' : ''}</div>
  </div>`;
}

function schMineView(week, count) {
  const rows = [...schFor(me().id, week)].sort((a, b) => a.day_of_week - b.day_of_week || mins(a.start_time) - mins(b.start_time));
  const all = schedules().filter(r => r.member === me().id), expired = all.length - rows.length;
  const empty = `<div class="panel vh-empty">${ic('sched')}<div><b>No classes this week.</b>
    <p>Add your timetable so the club can see when you’re free. Entries repeat every week between the semester dates you set, and nobody else can change them.${expired ? ` You have ${expired} entr${expired === 1 ? 'y' : 'ies'} from another semester.` : ''}</p>
    <button type="button" class="btn btn-primary" data-act="sch-new">${ic('plus')}Add a class</button></div></div>`;
  return `${count ? schGrid([me().id], week, true) : empty}
    ${all.length ? `<section class="panel"><div class="panel-head"><h2>Your classes</h2><span class="faint" style="font-size:12.5px">${all.length} entr${all.length === 1 ? 'y' : 'ies'}${expired ? ` · ${expired} outside this week` : ''}</span></div>
      <ul class="sch-list">${[...all].sort((a, b) => a.day_of_week - b.day_of_week || mins(a.start_time) - mins(b.start_time)).map(r => schRow(r, week)).join('')}</ul></section>` : ''}`;
}
function schRow(r, week) {
  const off = !schActive(r, week), clash = schClash(r);
  return `<li class="${off ? 'sch-off' : ''}"><div class="sch-row-main"><b>${esc(r.title)}</b>
      <span class="faint">${dayName(r.day_of_week)} · ${schTime(r)}${r.location ? ` · ${esc(r.location)}` : ''}</span>
      <span class="faint sch-term">${esc(schTerm(r))}${off ? ' · not in this week' : ''}</span></div>
    ${clash ? `<span class="tag vh-blocking" title="It overlaps another class in your own timetable">Overlaps</span>` : ''}
    ${canEditSched(r) ? `<div class="sch-row-acts"><button type="button" class="btn sm btn-ghost" data-act="sch-edit" data-id="${esc(r.id)}">Edit</button>
      <button type="button" class="btn btn-ghost sm icon-btn" data-act="sch-del" data-id="${esc(r.id)}" aria-label="Delete ${esc(r.title)}">${ic('trash')}</button></div>` : ''}
  </li>`;
}

function schTeamView(ids, week) {
  const withNone = ids.filter(id => !schFor(id, week).length);
  return `${schGrid(ids, week, false)}
    ${withNone.length ? `<div class="banner sch-unknown">${ic('info')}<span><b>${withNone.length === ids.length ? 'Nobody here has' : `${withNone.map(id => member(id)?.name.split(' ')[0]).join(', ')} ${withNone.length === 1 ? 'hasn’t' : 'haven’t'}`} added a timetable</b> — schedule not provided, availability unknown.${ea() ? ' You can add one for them.' : ''}</span></div>` : ''}`;
}

// One week, drawn to scale. Classes sit in their day column; where people overlap, the blocks share the width.
function schGrid(ids, week, mine) {
  const days = schDaysShown(ids, week);
  const all = ids.flatMap(id => schFor(id, week).map(r => ({...r, hue:mine ? 'var(--cyan)' : schHue(id)})));
  if (!all.length && !mine) return '<div class="panel empty">Nobody selected has a class this week.</div>';
  const from = Math.min(mins(SCH_WINDOW[0]), ...all.map(r => mins(r.start_time))) - 30;
  const to = Math.max(mins(SCH_WINDOW[1]), ...all.map(r => mins(r.end_time))) + 30;
  const start = Math.max(Math.floor(from / 60) * 60, 0), end = Math.min(Math.ceil(to / 60) * 60, 24 * 60), span = end - start;
  const hours = []; for (let t = start; t <= end - 60; t += 60) hours.push(t);
  const height = (span / 30) * sch.slotH;
  const col = ([d]) => {
    const items = all.filter(r => r.day_of_week === d).sort((a, b) => mins(a.start_time) - mins(b.start_time) || String(a.member).localeCompare(String(b.member)));
    // lanes: overlapping blocks sit side by side
    const lanes = [];
    items.forEach(r => { let lane = lanes.findIndex(l => mins(l[l.length - 1].end_time) <= mins(r.start_time)); if (lane < 0) { lanes.push([r]); lane = lanes.length - 1; } else lanes[lane].push(r); r._lane = lane; });
    const n = Math.max(lanes.length, 1);
    return `<div class="sch-col">${items.map(r => { const top = (mins(r.start_time) - start) / span * 100, h = (mins(r.end_time) - mins(r.start_time)) / span * 100, who = member(r.member);
      return `<div class="sch-block${canEditSched(r) ? ' click' : ''}" ${canEditSched(r) ? `data-act="sch-edit" data-id="${esc(r.id)}" role="button" tabindex="0"` : ''}
        style="top:${top.toFixed(2)}%;height:${Math.max(h, 3.2).toFixed(2)}%;left:calc(${(r._lane / n * 100).toFixed(2)}% + 2px);width:calc(${(100 / n).toFixed(2)}% - 4px);--h:${r.hue}"
        title="${esc(r.title)} · ${schTime(r)}${r.location ? ` · ${r.location}` : ''}${mine ? '' : ` · ${who?.name || ''}`}">
        <b>${esc(r.title)}</b><span>${schTime(r)}</span>${mine ? '' : `<span class="sch-who">${esc(who?.name.split(' ')[0] || '')}</span>`}${r.location ? `<span class="sch-loc">${esc(r.location)}</span>` : ''}</div>`; }).join('')}</div>`;
  };
  const legend = mine ? '' : `<div class="sch-legend">${[...new Set(all.map(r => r.member))].map(id => `<span><i style="background:${schHue(id)}"></i>${esc(member(id)?.name || 'Former member')}</span>`).join('')}</div>`;
  if (isM()) return schPhoneGrid(days, all, week, mine, legend);
  return `<section class="panel sch-panel">
    <div class="sch-grid" style="--rows:${span / 30};--h:${height}px">
      <div class="sch-times">${hours.map(t => `<span style="top:${((t - start) / span * 100).toFixed(2)}%">${fmtTime(hhmm(t))}</span>`).join('')}</div>
      <div class="sch-days" style="grid-template-columns:repeat(${days.length},minmax(0,1fr))">
        ${days.map(([d, short, long]) => `<div class="sch-dayhead ${schDate(week, d) === today() ? 'is-today' : ''}"><b>${short}</b><span>${fmtDate(schDate(week, d), {day:'numeric'})}</span><span class="sr-only">${long}</span></div>`).join('')}
        ${days.map(col).join('')}
      </div>
    </div>${legend}</section>`;
}
// Phones: one day at a time, as a list
function schPhoneGrid(days, all, week, mine, legend) {
  const f = filters.sched, day = f.day && days.some(([d]) => d === f.day) ? f.day : (days.find(([d]) => schDate(week, d) === today()) || days[0])[0];
  const items = all.filter(r => r.day_of_week === day).sort((a, b) => mins(a.start_time) - mins(b.start_time));
  return `<div class="scroller sch-daypick">${days.map(([d, short]) => { const n = all.filter(r => r.day_of_week === d).length;
      return `<button type="button" class="fchip" data-act="sch-day" data-v="${d}" aria-pressed="${d === day}">${short}${n ? `<span class="num">${n}</span>` : ''}</button>`; }).join('')}</div>
    <section class="panel"><div class="panel-head"><h2>${dayName(day)}</h2><span class="faint" style="font-size:12.5px">${fmtDate(schDate(week, day))}</span></div>
      ${items.length ? `<ul class="sch-list">${items.map(r => `<li${canEditSched(r) ? ` data-act="sch-edit" data-id="${esc(r.id)}"` : ''}><span class="sch-dot" style="background:${mine ? 'var(--cyan)' : schHue(r.member)}"></span>
        <div class="sch-row-main"><b>${esc(r.title)}</b><span class="faint">${schTime(r)}${r.location ? ` · ${esc(r.location)}` : ''}</span>${mine ? '' : `<span class="faint">${esc(member(r.member)?.name || '')}</span>`}</div></li>`).join('')}</ul>`
        : '<div class="empty">No classes on this day.</div>'}</section>${legend}`;
}

function schFreeView(ids, week) {
  const f = filters.sched, minLen = f.min || 60, days = freeGaps(ids, week, minLen);
  const known = ids.filter(id => schFor(id, week).length), unknown = ids.filter(id => !schFor(id, week).length);
  const chips = `<div class="vh-filters"><span class="faint" style="font-size:13px">Gaps of at least</span><div class="${isM() ? 'scroller' : 'filters'}">${SCH_MIN.map(([v, l]) =>
    `<button type="button" class="fchip" data-act="sch-min" data-v="${v}" aria-pressed="${minLen === v}">${l}</button>`).join('')}</div>
    <span class="spacer"></span><span class="faint" style="font-size:12.5px">Between ${fmtTime(SCH_WINDOW[0])} and ${fmtTime(SCH_WINDOW[1])} · ${CLUB_TZ}</span></div>`;
  if (!known.length) return `${chips}<div class="panel empty">Nobody selected has added a timetable, so there’s nothing to compare. Availability is unknown.</div>`;
  const total = days.reduce((s, d) => s + d.gaps.length, 0);
  const body = days.map(d => `<div class="sch-free-day"><div class="sch-free-name">${d.label}<span class="faint">${fmtDate(schDate(week, d.day), {day:'numeric', month:'short'})}</span></div>
    <div class="sch-free-list">${d.gaps.length ? d.gaps.map(([a, b]) => `<span class="sch-gap ${b - a >= 120 ? 'big' : ''}">${fmtTime(hhmm(a))} – ${fmtTime(hhmm(b))}<i>${b - a >= 60 ? `${Math.floor((b - a) / 60)}h${(b - a) % 60 ? ` ${(b - a) % 60}m` : ''}` : `${b - a}m`}</i></span>`).join('')
      : '<span class="faint" style="font-size:13px">No common gap this long.</span>'}${d.allFree ? '<span class="faint" style="font-size:12.5px">Nobody has class</span>' : ''}</div></div>`).join('');
  return `${chips}
    <section class="panel"><div class="panel-head"><h2>When everyone is free</h2><span class="faint" style="font-size:12.5px">${known.length} timetable${known.length === 1 ? '' : 's'} · ${total} window${total === 1 ? '' : 's'}</span></div>
      <div class="sch-free">${body}</div></section>
    ${unknown.length ? `<div class="banner sch-unknown">${ic('info')}<span><b>${unknown.map(id => member(id)?.name.split(' ')[0]).join(', ')}</b> — schedule not provided, availability unknown. ${unknown.length === 1 ? 'They are' : 'They’re'} not counted in the gaps above.</span></div>` : ''}`;
}

/* ---------------- add / edit ---------------- */
function openClass(id) {
  const r = id ? schOf(id) : null;
  if (id && !canEditSched(r)) return toast('You can only change your own classes', '', true);
  const last = schedules().filter(x => x.member === me().id).slice(-1)[0];
  const v = r || {member:me().id, title:'', day_of_week:1, start_time:'10:00', end_time:'11:00', location:'', term_start:last?.term_start || '', term_end:last?.term_end || ''};
  const t = s => String(s || '').slice(0, 5);
  openDialog(`<form data-form="sch" ${id ? `data-id="${esc(id)}"` : ''} novalidate>${dHead(id ? 'Edit class' : 'Add a class', `Repeats every ${dayName(v.day_of_week).toLowerCase()} between the semester dates. Times are ${CLUB_TZ}.`)}
    <div class="dlg-body">
      ${ea() ? field('Whose timetable', `<select class="input" id="f-member" name="member">${state.members.filter(m => m.active !== false).map(m => opt(m.id, m.id === me().id ? `${m.name} (you)` : m.name, v.member)).join('')}</select>`, 'f-member')
        : `<input type="hidden" name="member" value="${esc(v.member)}">`}
      ${field('Class', inp('title', v.title, 'required placeholder="MKT 301 Marketing" autocomplete="off"'), 'f-title')}
      ${id ? `<div class="grid2">${field('Day', `<select class="input" id="f-day" name="day">${SCH_DAYS.map(([d, , long]) => opt(String(d), long, String(v.day_of_week))).join('')}</select>`, 'f-day')}
        ${field('Location <span class="faint">— optional</span>', inp('location', v.location, 'placeholder="ARC 101"'), 'f-location')}</div>`
      : `<div class="field"><span class="lbl">Days <span class="faint">— tick every day this class runs</span></span>
          <div class="vh-choice sch-daychoice">${SCH_DAYS.map(([d, short, long]) => `<label><input type="checkbox" name="days" value="${d}" ${d === v.day_of_week ? 'checked' : ''}><span title="${long}">${short}</span></label>`).join('')}</div></div>
        ${field('Location <span class="faint">— optional</span>', inp('location', v.location, 'placeholder="ARC 101"'), 'f-location')}`}
      <div class="grid2">${field('Starts', `<input class="input" id="f-start" name="start" type="time" value="${t(v.start_time)}" required>`, 'f-start')}
        ${field('Ends', `<input class="input" id="f-end" name="end" type="time" value="${t(v.end_time)}" required>`, 'f-end')}</div>
      <div class="grid2">${field('Semester starts <span class="faint">— optional</span>', `<input class="input" id="f-ts" name="term_start" type="date" value="${esc(v.term_start || '')}">`, 'f-ts')}
        ${field('Semester ends <span class="faint">— optional</span>', `<input class="input" id="f-te" name="term_end" type="date" value="${esc(v.term_end || '')}">`, 'f-te')}</div>
      ${id ? `<div class="field sect"><span class="lbl">Copy to other days <span class="faint">— same time, room and semester</span></span>
        <div class="vh-choice sch-daychoice">${SCH_DAYS.filter(([d]) => d !== v.day_of_week).map(([d, short, long]) => `<label><input type="checkbox" name="copy" value="${d}"><span title="${long}">${short}</span></label>`).join('')}</div>
        <span class="muted-note">Ticked days are added as their own entries when you save, so you can change them separately later.</span></div>` : ''}
      <span class="muted-note">Leave the semester dates empty to keep the class until you remove it. Once the end date passes, it stops showing as busy.</span>
      <span class="err" id="scherr" role="alert"></span>
    </div>${foot(`<button class="btn btn-primary">${id ? 'Save' : 'Add class'}</button>`, id ? `<button type="button" class="btn btn-del" data-act="sch-del" data-id="${esc(id)}">${ic('trash')}Delete</button>` : '')}</form>`, 'narrow');
}

/* ---------------- class clashes when scheduling a meeting ----------------
   Advisory only: it warns the Executive Assistant, and never moves, blocks or changes anything else.
   A clash is any real overlap; touching edges are fine (a class ending at 2:00 and a meeting starting
   at 2:00 don't clash). Someone whose timetable doesn't cover that date counts as unknown, never free. */
function meetingClashes(m) {
  const out = {clashes:[], unknown:[], known:[], day:0};
  if (!m || !m.date || !m.start || !m.end || mins(m.end) <= mins(m.start)) return out;
  out.day = (parseD(m.date).getDay() + 6) % 7 + 1;
  recipients(m).forEach(id => {
    const rows = schedules().filter(r => r.member === id && schRuns(r, m.date));
    if (!rows.length) return out.unknown.push(id);          // no timetable covering that date
    out.known.push(id);
    rows.filter(r => r.day_of_week === out.day && mins(r.start_time) < mins(m.end) && mins(m.start) < mins(r.end_time))
      .forEach(r => out.clashes.push({member:id, title:r.title, start:String(r.start_time).slice(0, 5), end:String(r.end_time).slice(0, 5), location:r.location}));
  });
  return out;
}
const clashLine = (c, day) => `${member(c.member)?.name.split(' ')[0] || 'Someone'} has ${c.title} from ${fmtTime(c.start)}–${fmtTime(c.end)} on ${dayName(day)}`;
// Upcoming meetings whose attendees have class then — recalculated every render, so editing a
// timetable updates the warnings on their own without touching the meetings.
const meetingClashCount = m => meetingEnded(m) ? 0 : meetingClashes(m).clashes.length;

const newSchedId = () => (crypto.randomUUID ? crypto.randomUUID() : uid('cl'));
// Copies a class onto other days — same time, room and semester. A day that already has the same
// class at the same time is left alone, so copying twice never doubles anything up.
function copyClass(rec, days) {
  const added = [], skipped = [];
  [...new Set(days)].filter(d => d >= 1 && d <= 7 && d !== rec.day_of_week).sort().forEach(d => {
    const same = schedules().some(x => x.member === rec.member && x.day_of_week === d && x.title === rec.title
      && String(x.start_time).slice(0, 5) === rec.start_time && String(x.end_time).slice(0, 5) === rec.end_time);
    if (same) return skipped.push(d);
    state.schedules.push({...rec, id:newSchedId(), day_of_week:d, created_at:new Date().toISOString(), updated_at:new Date().toISOString()});
    added.push(d);
  });
  return {added, skipped};
}

const SCH_ACTS = {
  'sch-view': el => { filters.sched.view = el.dataset.v; render(); },
  'sch-week': el => { const v = +el.dataset.v; filters.sched.week = v === 0 ? schMonday() : addDays(schWeek(), 7 * v); render(); },
  'sch-day': el => { filters.sched.day = +el.dataset.v; render(); },
  'sch-min': el => { filters.sched.min = +el.dataset.v; render(); },
  'sch-who': el => { const f = filters.sched, id = el.dataset.id; f.people = f.people.includes(id) ? f.people.filter(x => x !== id) : [...f.people, id]; render(); },
  'sch-clear': () => { filters.sched.people = []; render(); },
  'sch-new': () => openClass(null),
  'sch-edit': el => openClass(el.dataset.id),
  'sch-del': el => { const r = schOf(el.dataset.id); if (!canEditSched(r)) return toast('You can only change your own classes', '', true);
    state.schedules = schedules().filter(x => x.id !== r.id);
    finish(`Removed ${r.title}`, r.member === me().id ? '' : `from ${member(r.member)?.name.split(' ')[0]}’s timetable`); },
};
const SCH_CHANGE = {
  'sch-team': el => { filters.sched.team = el.value; filters.sched.people = []; render(); },
};
const SCH_FORMS = {
  sch(f, fd) {
    const err = $('#scherr'), id = f.dataset.id, prev = id ? schOf(id) : null;
    const owner = ea() ? String(fd.get('member')) : me().id;
    const days = id ? [+fd.get('day')] : fd.getAll('days').map(Number);
    const rec = {id:id || newSchedId(), member:owner, title:String(fd.get('title')).trim(), day_of_week:days[0],
      start_time:String(fd.get('start')), end_time:String(fd.get('end')), location:String(fd.get('location') || '').trim(),
      term_start:String(fd.get('term_start') || '') || null, term_end:String(fd.get('term_end') || '') || null,
      created_by:prev?.created_by || me().id, created_at:prev?.created_at || new Date().toISOString(), updated_at:new Date().toISOString()};
    if (prev && !canEditSched(prev)) { closeDialog(); return toast('You can only change your own classes', '', true); }
    if (!rec.title) return err.textContent = 'Add the class name.';
    if (!days.length) return err.textContent = 'Pick at least one day.';
    if (!rec.start_time || !rec.end_time) return err.textContent = 'Add the start and end times.';
    if (mins(rec.end_time) <= mins(rec.start_time)) return err.textContent = 'The class has to end after it starts.';
    if (rec.term_start && rec.term_end && rec.term_end < rec.term_start) return err.textContent = 'The semester has to end after it starts.';
    upsert(state.schedules, rec);
    // the other days it runs on (when adding), or the days you copied it to (when editing)
    const copyTo = id ? fd.getAll('copy').map(Number) : days.slice(1);
    const {added, skipped} = copyClass(rec, copyTo);
    const where = [rec.day_of_week, ...added].sort().map(d => SCH_DAYS.find(x => x[0] === d)[1]).join(', ');
    const clash = schedules().find(x => x.id !== rec.id && x.member === rec.member && x.day_of_week === rec.day_of_week && overlaps(x, rec));
    finish(id ? `Saved ${rec.title}` : `Added ${rec.title}`,
      `${where} · ${schTime(rec)}${owner === me().id ? '' : ` · ${member(owner)?.name.split(' ')[0]}’s timetable`}`);
    if (skipped.length) toast(`Already on ${skipped.map(d => SCH_DAYS.find(x => x[0] === d)[1]).join(', ')}`, 'those days were left as they are');
    if (clash) toast(`Heads up: it overlaps ${clash.title}`, `${dayName(clash.day_of_week)} · ${schTime(clash)}`, true);
  },
};

// Sample timetables for the demo: a few members have classes, a few haven't added theirs yet.
function schedSeed(members) {
  const t0 = new Date(), start = ymd(new Date(t0.getFullYear(), t0.getMonth() - 1, 1)), end = ymd(new Date(t0.getFullYear(), t0.getMonth() + 3, 20));
  const by = role => members.find(m => m.role === role)?.id;
  const C = (member, title, day, s, e, location) => ({id:uid('cl'), member, title, day_of_week:day, start_time:s, end_time:e, location, term_start:start, term_end:end,
    created_by:member, created_at:new Date(Date.now() - 20 * 864e5).toISOString(), updated_at:new Date(Date.now() - 20 * 864e5).toISOString()});
  const rows = [];
  const add = (role, list) => { const id = by(role); if (id) list.forEach(a => rows.push(C(id, ...a))); };
  add('ea', [['ACC 201 Accounting', 1, '09:30', '10:45', 'SBA 205'], ['ACC 201 Accounting', 3, '09:30', '10:45', 'SBA 205'],
    ['MGT 210 Management', 2, '14:00', '15:15', 'SBA 118'], ['MGT 210 Management', 4, '14:00', '15:15', 'SBA 118']]);
  add('president', [['FIN 340 Corporate Finance', 1, '11:00', '12:15', 'SBA 301'], ['FIN 340 Corporate Finance', 3, '11:00', '12:15', 'SBA 301'],
    ['STA 202 Statistics', 2, '09:30', '10:45', 'CAS 120'], ['Capstone studio', 5, '10:00', '13:00', 'SBA Lab']]);
  add('vp', [['MKT 301 Marketing', 2, '14:00', '15:15', 'SBA 210'], ['MKT 301 Marketing', 4, '14:00', '15:15', 'SBA 210'], ['ENG 207 Writing', 1, '15:30', '16:45', 'CAS 019']]);
  add('treasurer', [['ACC 310 Audit', 1, '09:30', '10:45', 'SBA 207'], ['ECO 202 Microeconomics', 3, '12:30', '13:45', 'SBA 110'], ['ACC 310 Audit', 3, '09:30', '10:45', 'SBA 207']]);
  add('tech', [['CMP 305 Databases', 2, '11:00', '12:15', 'ENG 214'], ['CMP 305 Lab', 4, '16:00', '18:00', 'ENG Lab 2'], ['CMP 320 Networks', 1, '12:30', '13:45', 'ENG 210']]);
  add('innovation', [['BUS 250 Entrepreneurship', 3, '14:00', '16:45', 'SBA 115'], ['PSY 101 Psychology', 5, '09:30', '10:45', 'CAS 210']]);
  add('design', [['DES 240 Typography', 2, '09:00', '11:45', 'ARC 105'], ['ARC 210 Studio', 4, '09:00', '12:45', 'ARC Studio']]);
  return rows;   // Advisor, PR, Media, Startup Coordinator have none — "schedule not provided"
}
