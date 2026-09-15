
/* ================= Programmes → The Venture Hour =================
   Weekly mentor office hours. A pool of mentors (VCs, alumni founders, professors); each week 4–5 are
   picked at random (skipping recent picks), students claim the slots first come, first served through a
   Google Form, both sides get a Google Calendar invite, and a short survey after each meeting is required
   before the student can sign up again.
   Live mode: the booking rules run in the database (vh_* functions) and the venture-hour Edge Function
   (Google Form webhook + calendar invites). Demo mode runs the same rules here, on local data.
   Data shape (both modes, database column names): state.venture = {settings, mentors, slots, students, signups, surveys}. */

const VH_TYPE = {vc:'VC', alumni:'Alumni founder', professor:'Professor'};
const VH_TYPES = [['vc', 'VCs'], ['alumni', 'Alumni founders'], ['professor', 'Professors']];
const VH_STAGES = [['idea', 'Idea'], ['validating', 'Validating'], ['building', 'Building'], ['launched', 'Launched'], ['revenue', 'Revenue']];
const VH_STAGE = Object.fromEntries(VH_STAGES);
const VH_SIGNUP = {assigned:['s-done', 'Booked'], waitlisted:['s-in_progress', 'Waitlisted'], blocked:['s-blocked', 'Blocked'], duplicate:['s-not_started', 'Already booked'], cancelled:['s-not_started', 'Cancelled']};
const VH_REASON = {survey_owed:'owes the survey from their last session', already_booked:'already has an upcoming booking', no_open_slots:'all slots were taken', slot_cancelled:'their slot was cancelled',
  from_waitlist:'moved up from the waitlist', cancelled:'cancelled', didnt_happen:'the meeting didn’t happen', student_cancelled:'the student can’t make it', mentor_unavailable:'the mentor can’t make it'};
const VH_SLOT = {open:['s-in_progress', 'Open'], claimed:['s-done', 'Booked'], completed:['s-not_started', 'Done'], cancelled:['s-blocked', 'Cancelled']};
const VH_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const vh = {tab:'week', week:null, log:'all', logAsc:false, q:'', mtype:'all', inactive:false, mq:'', busy:false, status:null};

const V = () => state.venture;
const vhReady = () => !!(V() && V().settings);
const vhMentor = id => V().mentors.find(m => m.id === id);
const vhStudent = id => V().students.find(s => s.id === id);
const vhSlot = id => V().slots.find(s => s.id === id);
const vhSignup = id => V().signups.find(s => s.id === id);
const vhBooking = slotId => V().signups.find(s => s.slot_id === slotId && s.status === 'assigned');
const vhSurvey = signupId => V().surveys.find(r => r.signup_id === signupId);
const vhMonday = (d = new Date()) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return ymd(x); };
const vhEnded = w => !!w && new Date(w.ends_at) < new Date();
const vhStarted = w => !!w && new Date(w.starts_at) <= new Date();
const vhTime = iso => new Date(iso).toLocaleTimeString('en-US', {hour:'numeric', minute:'2-digit'});
const vhWhen = w => `${fmtDate(ymd(new Date(w.starts_at)))} · ${vhTime(w.starts_at)}–${vhTime(w.ends_at)}`;
const vhStamp = iso => new Date(iso).toLocaleString('en-GB', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit', second:'2-digit'});
const vhSurveyUrl = token => `${location.origin.startsWith('http') && !location.origin.includes('claude') ? location.origin : 'https://userocket.vercel.app'}/survey.html?t=${token}`;
const vhWeekLabel = wk => `Week of ${fmtDate(wk, {day:'numeric', month:'short'})}`;
const vhTypePill = t => `<span class="vh-type t-${esc(t)}">${esc(VH_TYPE[t] || t)}</span>`;
const vhRecent = (m, week) => V().slots.some(w => w.status !== 'cancelled' && w.mentor_id === m.id && w.week_start_date !== week && Math.abs((parseD(w.week_start_date) - parseD(week)) / 864e5) <= 7 * V().settings.cooldown_weeks);
// the survey this student still owes from an earlier meeting (blocks their next sign-up)
function vhOwed(studentId) {
  return V().signups.filter(s => s.student_id === studentId && s.status === 'assigned').map(s => ({s, w:vhSlot(s.slot_id)}))
    .filter(x => x.w && ['claimed', 'completed'].includes(x.w.status) && vhEnded(x.w) && !vhSurvey(x.s.id))
    .sort((a, b) => b.w.starts_at.localeCompare(a.w.starts_at))[0]?.s || null;
}
const vhOwedList = () => V().signups.filter(s => s.status === 'assigned' && vhEnded(vhSlot(s.slot_id)) && vhSlot(s.slot_id)?.status !== 'cancelled' && !vhSurvey(s.id))
  .sort((a, b) => vhSlot(b.slot_id).starts_at.localeCompare(vhSlot(a.slot_id).starts_at));
function vhDefaultWeek() {
  const cur = vhMonday(), has = wk => V().slots.some(w => w.week_start_date === wk && w.status !== 'cancelled');
  return has(cur) || !has(addDays(cur, 7)) ? cur : addDays(cur, 7);
}

/* ---------------- live data ---------------- */
async function loadVenture() {
  const q = t => sb.from(t).select('*');
  const res = await Promise.all([q('venture_settings').eq('id', 1).maybeSingle(), q('mentors').order('name'), q('weekly_slots').order('starts_at'),
    q('students'), q('signups').order('submitted_at'), q('survey_responses')]);
  const bad = res.find(r => r.error);
  if (bad) return {error:bad.error.message, missing:/does not exist|schema cache|not find/i.test(bad.error.message)};
  const [settings, mentors, slots, students, signups, surveys] = res.map(r => r.data);
  if (!settings) return null;   // no Programmes access: row-level security returns nothing
  settings.meeting_time = t5(settings.meeting_time);
  return {settings, mentors, slots, students, signups, surveys};
}
async function vhReload() { if (LIVE) { state.venture = await loadVenture().catch(e => ({error:e.message})); } }
const vhRpc = async (fn, args) => { const {data, error} = await sb.rpc(fn, args); if (error) throw new Error(error.message); return data; };
// Booking changes go through the venture-hour function (it updates Google Calendar too). If that function
// isn't deployed yet, the change still happens in the database, just without calendar invites.
async function vhFn(action, payload, fallback) {
  try { return await fnApi('venture-hour', action, payload); }
  catch (e) {
    if (fallback && /NOT_DEPLOYED|Failed to send|Failed to fetch/i.test(e.message)) return {result:await fallback(), warning:'Saved, but the venture-hour server function isn’t deployed yet, so no calendar invite was sent or changed.'};
    throw e;
  }
}

/* ---------------- demo engine: the same rules as the database functions ---------------- */
const VD = {
  refresh() { V().slots.forEach(w => { if (w.status === 'claimed' && vhEnded(w)) w.status = 'completed'; }); },
  touch() { V().mentors.forEach(m => { m.last_selected_week = V().slots.filter(w => w.mentor_id === m.id && w.status !== 'cancelled').map(w => w.week_start_date).sort().pop() || null; }); },
  startOf(week) { const s = V().settings, d = parseD(addDays(week, s.meeting_day - 1)), [h, mi] = s.meeting_time.split(':').map(Number); d.setHours(h, mi, 0, 0); return d; },
  pick(week) {
    const taken = new Set(V().slots.filter(w => w.week_start_date === week && w.status !== 'cancelled').map(w => w.mentor_id));
    return V().mentors.filter(m => m.active && !taken.has(m.id)).map(m => ({m, recent:vhRecent(m, week), r:Math.random()}))
      .sort((a, b) => a.recent - b.recent || (a.recent ? String(a.m.last_selected_week || '').localeCompare(String(b.m.last_selected_week || '')) : 0) || a.r - b.r)[0] || null;
  },
  newSlot(mentorId, week) { const s = V().settings, st = VD.startOf(week);
    V().slots.push({id:uid('vs'), mentor_id:mentorId, week_start_date:week, starts_at:st.toISOString(), ends_at:new Date(+st + s.meeting_minutes * 6e4).toISOString(), location:s.location, status:'open', created_at:new Date().toISOString()}); },
  generate(week) {
    const want = V().settings.slots_per_week - V().slots.filter(w => w.week_start_date === week && w.status !== 'cancelled').length; let made = 0, repeats = 0;
    while (made < want) { const p = VD.pick(week); if (!p) break; VD.newSlot(p.m.id, week); made++; if (p.recent) repeats++; }
    VD.touch(); return {week, created:made, repeats, short:Math.max(want - made, 0)};
  },
  addSlot(week, mentorId) {
    if (!vhMentor(mentorId)?.active) throw new Error('Pick an active mentor');
    if (V().slots.some(w => w.mentor_id === mentorId && w.week_start_date === week && w.status !== 'cancelled')) throw new Error('That mentor already has a slot that week');
    VD.newSlot(mentorId, week); VD.touch();
  },
  swap(slotId, mentorId) {
    const w = vhSlot(slotId); if (!w || ['completed', 'cancelled'].includes(w.status)) throw new Error('That slot can’t be changed any more');
    const target = mentorId || VD.pick(w.week_start_date)?.m.id; if (!target) throw new Error('No other active mentor is free that week');
    if (V().slots.some(x => x.id !== w.id && x.mentor_id === target && x.week_start_date === w.week_start_date && x.status !== 'cancelled')) throw new Error('That mentor already has a slot that week');
    const from = vhMentor(w.mentor_id)?.name; w.mentor_id = target; VD.touch();
    return {from, to:vhMentor(target).name, signup_id:vhBooking(w.id)?.id || null};
  },
  result(s) { const w = vhSlot(s.slot_id), m = w && vhMentor(w.mentor_id), owed = s.status === 'blocked' ? vhOwed(s.student_id) : null;
    return {status:s.status, reason:s.status_reason, signup_id:s.id, mentor:m ? {name:m.name, org_title:m.org_title, type:m.type} : null, starts_at:w?.starts_at || null,
      survey_token:owed ? owed.survey_token : s.survey_token, owed_mentor:owed ? vhMentor(vhSlot(owed.slot_id)?.mentor_id)?.name : null}; },
  intake(p) {
    const email = String(p.email || '').trim().toLowerCase(), now = new Date().toISOString();
    if (!/^[^@\s]+@aus\.edu$/.test(email)) return {status:'invalid', reason:'Use an @aus.edu email address.'};
    VD.refresh();
    let st = V().students.find(s => s.aus_email === email);
    if (!st) { st = {id:uid('st'), name:'', aus_email:email, major:'', year:'', created_at:now}; V().students.push(st); }
    ['name', 'major', 'year'].forEach(k => { const v = String(p[k] || '').trim(); if (v) st[k] = v; });
    const add = (status, reason = '', slot = null) => { const s = {id:uid('su'), slot_id:slot, student_id:st.id, submitted_at:p.submitted_at || now, topic_note:String(p.topic || '').trim(), status, status_reason:reason,
      source:p.source || 'manual', form_response_id:null, calendar_event_id:status === 'assigned' ? 'demo' : null, calendar_error:'', survey_token:uid('tk'), survey_sent_at:null, created_by:me().id, created_at:now};
      V().signups.push(s); return VD.result(s); };
    if (vhOwed(st.id)) return add('blocked', 'survey_owed');
    if (V().signups.some(s => s.student_id === st.id && s.status === 'assigned' && !vhEnded(vhSlot(s.slot_id)))) return add('duplicate', 'already_booked');
    const w = V().slots.filter(x => x.status === 'open' && new Date(x.starts_at) > Date.now() + V().settings.min_notice_hours * 36e5)
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at) || a.created_at.localeCompare(b.created_at))[0];
    if (!w) return add('waitlisted', 'no_open_slots');
    w.status = 'claimed'; return add('assigned', '', w.id);
  },
  cancelSignup(id, reason) {
    const s = vhSignup(id); if (!s || s.status !== 'assigned') throw new Error('Only a booked sign-up can be cancelled');
    s.status = 'cancelled'; s.status_reason = reason || 'cancelled';
    const w = vhSlot(s.slot_id); let promoted = null;
    if (!w || w.status === 'cancelled') return {cancelled:id, promoted};
    if (w.status === 'completed' || vhEnded(w)) { w.status = 'cancelled'; VD.touch(); return {cancelled:id, promoted}; }
    w.status = 'open';
    if (new Date(w.starts_at) > Date.now() + V().settings.min_notice_hours * 36e5) {
      const from = parseD(w.week_start_date).toISOString();
      const next = V().signups.filter(x => x.status === 'waitlisted' && x.submitted_at >= from).sort((a, b) => a.submitted_at.localeCompare(b.submitted_at))
        .find(x => !vhOwed(x.student_id) && !V().signups.some(y => y.student_id === x.student_id && y.status === 'assigned' && !vhEnded(vhSlot(y.slot_id))));
      if (next) { Object.assign(next, {status:'assigned', status_reason:'from_waitlist', slot_id:w.id, calendar_event_id:'demo'}); w.status = 'claimed'; promoted = next.id; }
    }
    return {cancelled:id, promoted};
  },
  cancelSlot(id) {
    const w = vhSlot(id); if (!w || ['completed', 'cancelled'].includes(w.status)) throw new Error('That slot can’t be cancelled any more');
    const s = vhBooking(w.id); if (s) Object.assign(s, {status:'waitlisted', status_reason:'slot_cancelled', slot_id:null, calendar_event_id:null});
    w.status = 'cancelled'; VD.touch(); return {slot_id:id, signup_id:s?.id || null};
  },
  survey(signupId, a) {
    const s = vhSignup(signupId), w = s && vhSlot(s.slot_id);
    if (!s || s.status !== 'assigned' || !w || w.status === 'cancelled') throw new Error('This meeting was cancelled, so there’s no survey to fill');
    if (vhSurvey(s.id)) throw new Error('This survey is already in');
    V().surveys.push({id:uid('sr'), signup_id:s.id, stage:a.stage, progress_rating:a.rating, key_takeaway:a.takeaway, submitted_at:new Date().toISOString()});
    VD.refresh();
  },
};

// Example programme data for the demo: last two weeks happened, this week's slots are coming up.
function vhSeed() {
  const target = addDays(today(), 2), wk = vhMonday(parseD(target)), dow = (parseD(target).getDay() + 6) % 7 + 1, now = Date.now(), iso = ms => new Date(ms).toISOString();
  const settings = {slots_per_week:5, cooldown_weeks:2, meeting_day:dow, meeting_time:'12:00', meeting_minutes:60, location:'Launchpad room, Library L2', min_notice_hours:2, form_url:'', auto_generate:true};
  const M = (name, type, org_title, focus_area, active = true) => ({id:uid('mn'), name, type, email:name.toLowerCase().replace(/^dr\. /, '').replace(/[^a-z]+/g, '.') + '@example.com', org_title, focus_area, active, last_selected_week:null, created_at:iso(now - 60 * 864e5)});
  const mentors = [
    M('Rami Aziz', 'vc', 'Principal, Gulf Seed Partners', 'Fundraising, pitch decks, term sheets'),
    M('Lina Haddad', 'alumni', 'Founder, Tawseel · AUS ’19', 'Logistics, first hires, going from zero to one'),
    M('Dr. Samir Aoun', 'professor', 'Associate Professor of Entrepreneurship', 'Business models, market sizing'),
    M('Nadia Farah', 'vc', 'Associate, Crescent Ventures', 'Consumer apps, growth metrics'),
    M('Tariq Mansour', 'alumni', 'Co-founder, Qalam Labs · AUS ’17', 'Edtech, product–market fit'),
    M('Dr. Hiba Yassin', 'professor', 'Professor of Marketing', 'Branding, customer research'),
    M('Omar Bakri', 'vc', 'Partner, Dune Capital', 'B2B SaaS, pricing'),
    M('Yasmin Nour', 'alumni', 'Founder, Sukkar Bakery · AUS ’20', 'Food & retail, unit economics'),
    M('Dr. Karim Saleh', 'professor', 'Assistant Professor of Finance', 'Financial models, valuation'),
    M('Maya Rahal', 'alumni', 'Product lead · AUS ’16', 'Product management', false)];
  const S = (name, id, major, year) => ({id:uid('st'), name, aus_email:`b000${id}@aus.edu`, major, year, created_at:iso(now - 30 * 864e5)});
  const students = [S('Aisha Karim', '91234', 'Computer Engineering', 'Junior'), S('Hamza Qureshi', '88412', 'Finance', 'Senior'), S('Leen Abbas', '95120', 'Marketing', 'Sophomore'),
    S('Faris Odeh', '90077', 'Mechanical Engineering', 'Senior'), S('Mira Sabbagh', '97341', 'Architecture', 'Junior'), S('Khalid Al Suwaidi', '93318', 'Business Administration', 'Freshman'),
    S('Jana Mikati', '96602', 'Computer Science', 'Senior'), S('Yousef Darwish', '92045', 'Economics', 'Junior')];
  const slots = [], signups = [], surveys = [];
  const slot = (week, mi, status, dayOffset = dow - 1) => { const d = parseD(addDays(week, dayOffset)); d.setHours(12, 0, 0, 0);
    const w = {id:uid('vs'), mentor_id:mentors[mi].id, week_start_date:week, starts_at:d.toISOString(), ends_at:new Date(+d + 36e5).toISOString(), location:settings.location, status, created_at:iso(+parseD(week))}; slots.push(w); return w; };
  const book = (w, si, topic, minsAfterOpen, extra = {}) => { const s = {id:uid('su'), slot_id:w.id, student_id:students[si].id, submitted_at:iso(+parseD(w.week_start_date) + 6 * 36e5 + minsAfterOpen * 6e4 + 7123), topic_note:topic, status:'assigned', status_reason:'',
    source:'form', form_response_id:uid('resp'), calendar_event_id:'demo', calendar_error:'', survey_token:uid('tk'), survey_sent_at:vhEnded(w) ? w.ends_at : null, created_by:null, created_at:iso(+parseD(w.week_start_date) + 6 * 36e5 + minsAfterOpen * 6e4 + 9000), ...extra}; signups.push(s); return s; };
  const answer = (s, stage, rating, takeaway) => surveys.push({id:uid('sr'), signup_id:s.id, stage, progress_rating:rating, key_takeaway:takeaway, submitted_at:iso(+new Date(vhSlot2(s.slot_id).ends_at) + 5 * 36e5)});
  const vhSlot2 = id => slots.find(x => x.id === id);
  // two weeks ago
  const p2 = addDays(wk, -14);
  [[0, 0, 'Raising a pre-seed round', 'building', 3, 'Get to 20 paying users before pitching angels.'], [2, 1, 'Pricing my tutoring marketplace', 'validating', 4, 'Charge per session, not a subscription, until retention is proven.'],
   [4, 2, 'Is my idea big enough?', 'idea', 3, 'Size the market bottom-up, starting with AUS alone.'], [6, 6, 'Finding a technical co-founder', 'building', 4, 'Build a clickable prototype first so engineers can see it.']]
    .forEach(([mi, si, topic, stage, rating, take], k) => answer(book(slot(p2, mi, 'completed'), si, topic, 4 + k * 3), stage, rating, take));
  // last week: one survey still owed (Faris), one slot nobody took
  const p1 = addDays(wk, -7);
  book(slot(p1, 1, 'completed'), 3, 'Logistics for a campus delivery app', 2);
  const b = book(slot(p1, 3, 'completed'), 4, 'Growing an Instagram-first brand', 5), c = book(slot(p1, 5, 'completed'), 5, 'Customer interviews: how many is enough?', 11);
  slot(p1, 8, 'open'); answer(b, 'launched', 4, 'Double down on the one channel that already works.'); answer(c, 'validating', 5, 'Stop at 15 interviews once the answers repeat.');
  // this week: three booked, two open, plus a blocked and a duplicate sign-up in the log
  const t1 = slot(wk, 0, 'claimed'), t2 = slot(wk, 7, 'claimed'), t3 = slot(wk, 4, 'claimed'); slot(wk, 2, 'open'); slot(wk, 8, 'open');
  const open = +parseD(wk) + 6 * 36e5;
  book(t1, 6, 'Term sheet from an angel: what to watch for', 1);
  book(t3, 7, 'Validating a fintech idea for students', 3);
  book(t2, 1, 'Moving from validation to first sales', 4);
  signups.push({id:uid('su'), slot_id:null, student_id:students[3].id, submitted_at:iso(open + 2 * 6e4 + 512), topic_note:'Follow-up on delivery logistics', status:'blocked', status_reason:'survey_owed',
    source:'form', form_response_id:uid('resp'), calendar_event_id:null, calendar_error:'', survey_token:uid('tk'), survey_sent_at:null, created_by:null, created_at:iso(open + 2 * 6e4 + 2100)});
  signups.push({id:uid('su'), slot_id:null, student_id:students[6].id, submitted_at:iso(open + 9 * 6e4 + 88), topic_note:'Same as before', status:'duplicate', status_reason:'already_booked',
    source:'form', form_response_id:uid('resp'), calendar_event_id:null, calendar_error:'', survey_token:uid('tk'), survey_sent_at:null, created_by:null, created_at:iso(open + 9 * 6e4 + 1500)});
  const data = {settings, mentors, slots, students, signups, surveys};
  mentors.forEach(m => { m.last_selected_week = slots.filter(w => w.mentor_id === m.id).map(w => w.week_start_date).sort().pop() || null; });
  return data;
}

/* ---------------- one API for both modes ---------------- */
const VHA = {
  generate: week => LIVE ? vhRpc('vh_generate_week', {p_week:week}) : VD.generate(week),
  addSlot: (week, mentorId) => LIVE ? vhRpc('vh_add_slot', {p_week:week, p_mentor:mentorId}) : VD.addSlot(week, mentorId),
  swap: (slotId, mentorId) => LIVE ? vhFn('swap', {slot_id:slotId, mentor_id:mentorId || ''}, () => vhRpc('vh_swap_mentor', {p_slot:slotId, p_mentor:mentorId || null})) : {result:VD.swap(slotId, mentorId)},
  addSignup: p => LIVE ? vhFn('add-signup', p, () => vhRpc('vh_intake', {p_name:p.name, p_email:p.email, p_major:p.major, p_year:p.year, p_topic:p.topic, p_source:'manual'})) : {result:VD.intake({...p, source:'manual'})},
  cancelSignup: (id, reason) => LIVE ? vhFn('cancel-signup', {signup_id:id, reason}, () => vhRpc('vh_cancel_signup', {p_signup:id, p_reason:reason})) : {result:VD.cancelSignup(id, reason)},
  cancelSlot: id => LIVE ? vhFn('cancel-slot', {slot_id:id}, () => vhRpc('vh_cancel_slot', {p_slot:id})) : {result:VD.cancelSlot(id)},
  sync: id => LIVE ? vhFn('sync', {signup_id:id}) : {},
  async saveMentor(m) {
    const row = {name:m.name, type:m.type, email:m.email, org_title:m.org_title, focus_area:m.focus_area, active:m.active};
    if (!LIVE) {
      if (V().mentors.some(x => x.id !== m.id && x.email.toLowerCase() === m.email.toLowerCase())) throw new Error('A mentor with that email is already in the pool.');
      if (m.id) Object.assign(vhMentor(m.id), row); else V().mentors.push({id:uid('mn'), ...row, last_selected_week:null, created_at:new Date().toISOString()});
      return;
    }
    const r = m.id ? await sb.from('mentors').update(row).eq('id', m.id).select('id') : await sb.from('mentors').insert(row).select('id');
    if (r.error) throw new Error(/mentors_email|duplicate/i.test(r.error.message) ? 'A mentor with that email is already in the pool.' : r.error.message);
    if (!r.data.length) throw new Error('You don’t have permission for that.');
  },
  async deleteMentor(id) {
    if (V().slots.some(w => w.mentor_id === id)) throw new Error('They’re in the slot history, so they can’t be deleted. Switch them to inactive instead.');
    if (!LIVE) { V().mentors = V().mentors.filter(m => m.id !== id); return; }
    const r = await sb.from('mentors').delete().eq('id', id).select('id'); if (r.error) throw new Error(r.error.message);
  },
  async saveSlot(id, patch) {
    if (!LIVE) { Object.assign(vhSlot(id), patch); return {}; }
    const r = await sb.from('weekly_slots').update(patch).eq('id', id).select('id'); if (r.error) throw new Error(r.error.message);
    if (!r.data.length) throw new Error('You don’t have permission for that.');
    const b = vhBooking(id); return b ? vhFn('sync', {signup_id:b.id}).catch(e => ({warning:'Saved, but the calendar invite didn’t update: ' + e.message})) : {};
  },
  async saveSettings(s) {
    if (!LIVE) { Object.assign(V().settings, s); return; }
    const r = await sb.from('venture_settings').update(s).eq('id', 1).select('id'); if (r.error) throw new Error(r.error.message);
    if (!r.data.length) throw new Error('You don’t have permission for that.');
  },
  survey: (signupId, a) => { if (LIVE) throw new Error('Students fill the survey from their own link.'); VD.survey(signupId, a); },
};
// Runs a change, refreshes the data, and reports calendar warnings without undoing anything.
async function vhRun(fn, ok) {
  if (vh.busy) return; vh.busy = true;
  document.querySelectorAll('#dlg .btn-primary').forEach(b => b.disabled = true);
  try {
    const r = await fn();
    if (LIVE) await vhReload(); else save();
    closeDialog(); render();
    const [msg, sub] = ok(r) || [];
    if (msg) toast(msg, sub || '');
    if (r?.warning) setTimeout(() => toast(r.warning, '', true), 300);
    return r;
  } catch (e) {
    const err = $('#vherr'); if (err && dlg().open) err.textContent = e.message; else toast(e.message, '', true);
    document.querySelectorAll('#dlg .btn-primary').forEach(b => b.disabled = false);
    if (LIVE) { await vhReload(); if (!dlg().open) render(); }
  } finally { vh.busy = false; }
}
function vhOutcome(r) {
  if (!r) return ['Done'];
  const when = r.starts_at ? `${fmtDate(ymd(new Date(r.starts_at)))} · ${vhTime(r.starts_at)}` : '';
  return {assigned:[`Booked with ${r.mentor?.name || 'a mentor'}`, `${when}${LIVE ? ' · calendar invites sent' : ' · invites simulated'}`],
    waitlisted:['All slots are taken — added to the waitlist', 'they move up if a slot frees'], blocked:['Not booked — they owe a survey', r.owed_mentor ? `from their session with ${r.owed_mentor}` : 'from their last session'],
    duplicate:['Not booked — they already have an upcoming session'], invalid:['Use an @aus.edu email address']}[r.status] || ['Done'];
}

/* ---------------- views ---------------- */
function vProgrammes() {
  const d = V();
  const head = heading('Programmes', 'The club’s recurring programmes. Each one runs from here: people, schedule, sign-ups and follow-up.',
    vhReady() ? `<button class="btn btn-primary" data-act="vh-add-signup">${ic('plus')}Add a sign-up</button>` : '');
  const card = `<div class="prog-strip"><button type="button" class="prog-card active" aria-current="true">${ic('spark')}<span><b>The Venture Hour</b><span>Weekly one-to-one mentor office hours</span></span></button></div>`;
  if (!d) return `<div class="page">${head}${card}<div class="panel empty">${LIVE ? 'Loading the programme…' : 'No programme data.'}</div></div>`;
  if (d.error) return `<div class="page">${head}${card}<div class="banner">${ic('info')}<span>${d.missing ? 'The Venture Hour isn’t set up in the database yet. An admin needs to run <b>supabase/migrations/20260918000000_venture_hour.sql</b> in the Supabase SQL Editor.' : `Couldn’t load the programme: ${esc(d.error)}`}</span></div>
    <div><button class="btn" data-act="vh-reload">Try again</button></div></div>`;
  const owed = vhOwedList().length;
  const tabs = `<div class="tabs vh-tabs" role="tablist">${[['week', 'Slots'], ['mentors', 'Mentors'], ['signups', 'Sign-ups'], ['surveys', 'Surveys'], ['setup', 'Setup']]
    .map(([v, l]) => `<button role="tab" data-act="vh-tab" data-v="${v}" aria-selected="${vh.tab === v}">${l}${v === 'surveys' && owed ? `<span class="count">${owed}</span>` : ''}</button>`).join('')}</div>`;
  const body = {week:vhWeekTab, mentors:vhMentorsTab, signups:vhSignupsTab, surveys:vhSurveysTab, setup:vhSetupTab}[vh.tab] || vhWeekTab;
  return `<div class="page">${head}${card}${LIVE ? '' : readonlyNote('Demo: sign-ups you add here stand in for Google Form responses, and calendar invites and emails are simulated.')}${tabs}${body()}</div>`;
}

function vhWeekTab() {
  const d = V(), wk = vh.week ||= vhDefaultWeek(), cur = vhMonday(), past = wk < cur;
  const order = {claimed:0, completed:0, open:1, cancelled:2};
  const slots = d.slots.filter(w => w.week_start_date === wk).sort((a, b) => order[a.status] - order[b.status] || a.starts_at.localeCompare(b.starts_at) || String(vhMentor(a.mentor_id)?.name).localeCompare(String(vhMentor(b.mentor_id)?.name)));
  const live = slots.filter(w => w.status !== 'cancelled'), want = d.settings.slots_per_week;
  const from = parseD(wk).toISOString(), to = parseD(addDays(wk, 7)).toISOString();
  const waitlist = d.signups.filter(s => s.status === 'waitlisted' && s.submitted_at >= from && s.submitted_at < to).sort((a, b) => a.submitted_at.localeCompare(b.submitted_at));
  const n = st => live.filter(w => w.status === st).length;
  const nav = `<div class="vh-weeknav">
      <button type="button" class="btn sm icon-btn" data-act="vh-week" data-v="-1" aria-label="Previous week">‹</button>
      <div class="vh-weeklabel"><b>${vhWeekLabel(wk)}</b><span class="faint">${wk === cur ? 'This week' : wk === addDays(cur, 7) ? 'Next week' : past ? 'Past' : 'Upcoming'}</span></div>
      <button type="button" class="btn sm icon-btn" data-act="vh-week" data-v="1" aria-label="Next week">›</button>
      ${wk !== cur ? '<button type="button" class="btn sm btn-ghost" data-act="vh-week" data-v="0">This week</button>' : ''}
      <span class="spacer"></span>
      ${!past ? `<button type="button" class="btn sm" data-act="vh-add-slot">${ic('plus')}Add a slot</button>` : ''}
      ${!past && live.length < want ? `<button type="button" class="btn sm btn-primary" data-act="vh-generate">${ic('spark')}${live.length ? `Fill ${want - live.length} empty slot${want - live.length === 1 ? '' : 's'}` : `Pick ${want} mentors`}</button>` : ''}
    </div>`;
  const stats = live.length ? `<div class="vh-stats"><span><b>${live.length}</b> slot${live.length === 1 ? '' : 's'}</span><span><b>${n('claimed') + n('completed')}</b> booked</span><span><b>${n('open')}</b> open</span>${waitlist.length ? `<span><b>${waitlist.length}</b> waitlisted</span>` : ''}</div>` : '';
  const empty = `<div class="panel vh-empty">${ic('spark')}<div><b>${past ? 'No Venture Hour this week.' : 'No mentors picked for this week yet.'}</b>
      <p>${past ? 'Nothing was scheduled.' : `Rocket picks ${want} active mentors at random, skipping anyone picked in the last ${d.settings.cooldown_weeks} week${d.settings.cooldown_weeks === 1 ? '' : 's'}. ${d.settings.auto_generate ? 'This happens by itself every Monday at 6:00 AM, or do it now.' : 'Automatic Monday picks are off (Setup).'}`}</p>
      ${past ? '' : `<button type="button" class="btn btn-primary" data-act="vh-generate">${ic('spark')}Pick this week’s mentors</button>`}</div></div>`;
  return `${nav}${stats}${slots.length ? `<div class="vh-slots">${slots.map(vhSlotCard).join('')}</div>` : empty}
    ${waitlist.length ? `<section class="panel"><div class="panel-head"><h2>Waitlist</h2><span class="faint" style="font-size:12.5px">In sign-up order. The first one moves up if a booking is cancelled.</span></div>
      <ol class="vh-wait">${waitlist.map(s => { const st = vhStudent(s.student_id); return `<li><span class="mono faint">${vhStamp(s.submitted_at)}</span><b>${esc(st?.name || st?.aus_email)}</b><span class="faint">${esc(s.topic_note)}</span></li>`; }).join('')}</ol></section>` : ''}`;
}
function vhSlotCard(w) {
  const m = vhMentor(w.mentor_id) || {name:'Former mentor', type:'', org_title:''}, b = vhBooking(w.id), st = b && vhStudent(b.student_id), sv = b && vhSurvey(b.id);
  const [cls, label] = VH_SLOT[w.status], started = vhStarted(w), ended = vhEnded(w);
  const cal = !b ? '' : b.calendar_event_id ? `<span class="vh-flag ok">${ic('cal')}Invite sent${LIVE ? '' : ' (simulated)'}</span>`
    : `<span class="vh-flag warn" title="${esc(b.calendar_error || 'No invite yet')}">${ic('cal')}${b.calendar_error ? 'Invite failed' : 'No invite yet'}</span><button type="button" class="linkbtn" data-act="vh-sync" data-id="${b.id}">${b.calendar_error ? 'Retry' : 'Send invite'}</button>`;
  const survey = !b || !ended ? '' : sv ? `<span class="vh-flag ok">${ic('shield')}Survey in · ${esc(VH_STAGE[sv.stage])} · ${sv.progress_rating}/5</span>` : `<span class="vh-flag owe">${ic('clock')}Survey owed</span>`;
  const acts = [];
  if (!['completed', 'cancelled'].includes(w.status) && !started) acts.push(`<button type="button" class="btn sm" data-act="vh-swap" data-id="${w.id}">Swap mentor</button>`, `<button type="button" class="btn sm btn-ghost" data-act="vh-edit-slot" data-id="${w.id}">Edit time</button>`);
  if (b && !ended) acts.push(`<button type="button" class="btn sm btn-ghost" data-act="vh-cancel-booking" data-id="${b.id}">Cancel booking</button>`);
  if (b && ended && !sv) acts.push(`<button type="button" class="btn sm btn-ghost" data-act="vh-didnt-happen" data-id="${b.id}">Didn’t happen</button>`);
  if (!b && w.status === 'open') acts.push(`<button type="button" class="btn sm btn-ghost" data-act="vh-cancel-slot" data-id="${w.id}">Cancel slot</button>`);
  return `<article class="vh-slot vs-${w.status}">
    <div class="vh-slot-top">${m.type ? vhTypePill(m.type) : '<span></span>'}<span class="pill ${cls}">${label}</span></div>
    <div class="vh-mentor"><b>${esc(m.name)}</b>${m.org_title ? `<span>${esc(m.org_title)}</span>` : ''}</div>
    <div class="vh-when">${ic('clock')}<span>${vhWhen(w)}${w.location ? ` · ${esc(w.location)}` : ''}</span></div>
    ${b ? `<div class="vh-booked"><div class="vh-student"><b>${esc(st?.name || 'Student')}</b><span class="mono">${esc(st?.aus_email || '')}</span>${st && (st.major || st.year) ? `<span class="faint">${esc([st.major, st.year].filter(Boolean).join(' · '))}</span>` : ''}</div>
        ${b.topic_note ? `<p class="vh-topic">“${esc(b.topic_note)}”</p>` : ''}<div class="vh-flags">${cal}${survey}</div></div>`
      : w.status === 'open' ? `<div class="vh-openbox">${ended ? 'Nobody took this slot.' : 'Open — the next sign-up gets it.'}</div>` : w.status === 'cancelled' ? '<div class="vh-openbox">Cancelled</div>' : ''}
    ${acts.length ? `<div class="vh-actions">${acts.join('')}</div>` : ''}
  </article>`;
}

function vhMentorsTab() {
  const d = V(), q = vh.mq.trim().toLowerCase(), wkCount = id => d.slots.filter(w => w.mentor_id === id && w.status !== 'cancelled').length;
  const done = id => d.slots.filter(w => w.mentor_id === id && vhBooking(w.id) && vhEnded(w)).length;
  const list = d.mentors.filter(m => (vh.inactive || m.active) && (vh.mtype === 'all' || m.type === vh.mtype) && (!q || `${m.name} ${m.email} ${m.org_title} ${m.focus_area}`.toLowerCase().includes(q)))
    .sort((a, b) => b.active - a.active || a.name.localeCompare(b.name));
  const count = t => d.mentors.filter(m => m.active && (t === 'all' || m.type === t)).length, inactive = d.mentors.filter(m => !m.active).length;
  const filters = `<div class="vh-filters"><label class="search">${ic('search')}<input class="input" type="search" data-input="vh-mq" value="${esc(vh.mq)}" placeholder="Search mentors…" aria-label="Search mentors"></label>
    <div class="${isM() ? 'scroller' : 'filters'}">${[['all', 'All'], ...VH_TYPES].map(([v, l]) => `<button type="button" class="fchip" data-act="vh-mtype" data-v="${v}" aria-pressed="${vh.mtype === v}">${l}<span class="num">${count(v)}</span></button>`).join('')}
      ${inactive ? `<button type="button" class="fchip" data-act="vh-inactive" aria-pressed="${vh.inactive}">Show inactive<span class="num">${inactive}</span></button>` : ''}</div>
    <span class="spacer"></span><button type="button" class="btn sm btn-primary desk-only" data-act="vh-new-mentor">${ic('plus')}Add mentor</button></div>`;
  const last = m => m.last_selected_week ? vhWeekLabel(m.last_selected_week).replace('Week of ', '') : '<span class="faint">Never</span>';
  const toggle = m => `<label class="switch" title="${m.active ? 'Active — can be picked' : 'Inactive — never picked'}"><input type="checkbox" data-change="vh-active" data-id="${m.id}" ${m.active ? 'checked' : ''} aria-label="${esc(m.name)} is active"><i></i></label>`;
  const rows = !list.length ? `<div class="panel empty">${d.mentors.length ? 'No mentors match.' : 'No mentors yet. Add the people who’ve agreed to mentor — Rocket picks from this pool every week.'}</div>`
    : isM() ? `<ul class="m-rows">${list.map(m => `<li data-act="vh-edit-mentor" data-id="${m.id}" class="${m.active ? '' : 'vh-off'}"><div class="top"><b>${esc(m.name)}</b>${toggle(m)}</div>
        <div class="sub">${vhTypePill(m.type)}<span>${esc(m.org_title)}</span></div>${m.focus_area ? `<div class="sub">${esc(m.focus_area)}</div>` : ''}<div class="sub faint">Last picked: ${last(m)} · ${done(m.id)} session${done(m.id) === 1 ? '' : 's'}</div></li>`).join('')}</ul>`
    : `<div class="table-wrap"><table><thead><tr><th>Mentor</th><th>Type</th><th>Organisation / title</th><th>Focus</th><th>Last picked</th><th class="num">Sessions</th><th>Active</th></tr></thead><tbody>${list.map(m => `<tr data-act="vh-edit-mentor" data-id="${m.id}" class="${m.active ? '' : 'vh-off'}">
        <td><div class="name">${esc(m.name)}</div><div class="mono faint" style="font-size:12px;margin-top:2px">${esc(m.email)}</div></td><td>${vhTypePill(m.type)}</td><td>${esc(m.org_title) || '<span class="faint">—</span>'}</td>
        <td class="muted" style="max-width:260px">${esc(m.focus_area) || '<span class="faint">—</span>'}</td><td class="num" style="white-space:nowrap">${last(m)}</td><td class="num">${done(m.id)}<span class="faint"> / ${wkCount(m.id)}</span></td><td>${toggle(m)}</td></tr>`).join('')}</tbody></table></div>`;
  return `${filters}<p class="muted-note" style="margin:-8px 0 0">${count('all')} active mentor${count('all') === 1 ? '' : 's'}. Each week Rocket picks ${d.settings.slots_per_week}; with a ${d.settings.cooldown_weeks}-week cooldown you need at least ${d.settings.slots_per_week * (d.settings.cooldown_weeks + 1)} active mentors to avoid repeats.</p>${rows}`;
}

function vhSignupsTab() {
  const d = V(), counts = {all:d.signups.length}; d.signups.forEach(s => counts[s.status] = (counts[s.status] || 0) + 1);
  const seg = `<div class="${isM() ? 'scroller' : 'filters'}">${[['all', 'All'], ['assigned', 'Booked'], ['waitlisted', 'Waitlisted'], ['blocked', 'Blocked'], ['duplicate', 'Already booked'], ['cancelled', 'Cancelled']]
    .map(([v, l]) => `<button type="button" class="fchip" data-act="vh-log" data-v="${v}" aria-pressed="${vh.log === v}">${l}<span class="num">${counts[v] || 0}</span></button>`).join('')}</div>`;
  return `<div class="vh-filters"><label class="search">${ic('search')}<input class="input" type="search" data-input="vh-q" value="${esc(vh.q)}" placeholder="Search students, emails, topics…" aria-label="Search sign-ups"></label>${seg}
      <span class="spacer"></span><button type="button" class="btn sm btn-ghost" data-act="vh-sort">${vh.logAsc ? 'Oldest first' : 'Newest first'}</button></div>
    <p class="muted-note" style="margin:-8px 0 0">Every sign-up, in the order it was submitted — that timestamp decides who gets a slot. “Processed” is when Rocket handled it.</p>
    <div id="vh-log">${vhLogList()}</div>`;
}
function vhLogList() {
  const d = V(), q = vh.q.trim().toLowerCase();
  const list = d.signups.filter(s => (vh.log === 'all' || s.status === vh.log) && (!q || (() => { const st = vhStudent(s.student_id); return `${st?.name} ${st?.aus_email} ${st?.major} ${s.topic_note}`.toLowerCase().includes(q); })()))
    .sort((a, b) => (vh.logAsc ? 1 : -1) * a.submitted_at.localeCompare(b.submitted_at));
  if (!list.length) return `<div class="panel empty">${d.signups.length ? 'No sign-ups match.' : 'No sign-ups yet. They appear here as Google Form responses come in.'}</div>`;
  const slotTxt = s => { const w = vhSlot(s.slot_id); return w ? `${esc(vhMentor(w.mentor_id)?.name || '')} · ${fmtDate(ymd(new Date(w.starts_at)), {day:'numeric', month:'short'})}` : '<span class="faint">—</span>'; };
  const pill = s => { const [c, l] = VH_SIGNUP[s.status] || ['s-not_started', s.status]; return `<span class="pill ${c}" title="${esc(VH_REASON[s.status_reason] || '')}">${l}</span>`; };
  const reason = s => s.status_reason && VH_REASON[s.status_reason] ? `<span class="faint vh-reason">${esc(VH_REASON[s.status_reason])}</span>` : '';
  if (isM()) return `<ul class="m-rows">${list.map(s => { const st = vhStudent(s.student_id);
    return `<li><div class="top"><b>${esc(st?.name || st?.aus_email)}</b>${pill(s)}</div><div class="sub mono" style="font-size:12px">${vhStamp(s.submitted_at)} · ${s.source === 'manual' ? 'added by hand' : 'form'}</div>
      ${s.topic_note ? `<div class="sub">“${esc(s.topic_note)}”</div>` : ''}<div class="sub">${s.slot_id ? slotTxt(s) : reason(s)}</div></li>`; }).join('')}</ul>`;
  return `<div class="table-wrap"><table class="vh-log"><thead><tr><th>Submitted</th><th>Student</th><th>Topic</th><th>Outcome</th><th>Slot</th><th>Source</th></tr></thead><tbody>${list.map(s => { const st = vhStudent(s.student_id);
    return `<tr><td class="mono" style="white-space:nowrap;font-size:12.5px">${vhStamp(s.submitted_at)}<div class="faint" style="font-size:11px">processed ${vhStamp(s.created_at)}</div></td>
      <td><div class="name">${esc(st?.name || '—')}</div><div class="mono faint" style="font-size:12px">${esc(st?.aus_email || '')}</div></td>
      <td class="muted" style="max-width:280px">${esc(s.topic_note) || '<span class="faint">—</span>'}</td><td>${pill(s)}${reason(s)}</td><td style="white-space:nowrap">${slotTxt(s)}</td>
      <td><span class="tag">${s.source === 'manual' ? `By hand${s.created_by && member(s.created_by) ? ` · ${esc(member(s.created_by).name.split(' ')[0])}` : ''}` : 'Form'}</span></td></tr>`; }).join('')}</tbody></table></div>`;
}

function vhSurveysTab() {
  const d = V(), owed = vhOwedList(), due = d.signups.filter(s => s.status === 'assigned' && vhEnded(vhSlot(s.slot_id)) && vhSlot(s.slot_id)?.status !== 'cancelled');
  const responses = [...d.surveys].sort((a, b) => b.submitted_at.localeCompare(a.submitted_at));
  const avg = responses.length ? (responses.reduce((s, r) => s + r.progress_rating, 0) / responses.length).toFixed(1) : '—';
  const stages = VH_STAGES.map(([k, l]) => [k, l, responses.filter(r => r.stage === k).length]), top = [...stages].sort((a, b) => b[2] - a[2])[0];
  const blocking = s => d.signups.some(x => x.student_id === s.student_id && x.status === 'blocked' && x.submitted_at > vhSlot(s.slot_id).ends_at);
  const card = (v, l, sub, alert) => `<div class="sum-card ${alert ? 'alert' : ''}" style="cursor:default"><span class="v" ${alert ? 'style="color:var(--amber)"' : ''}>${v}</span><span class="l">${l}</span>${sub ? `<span class="s">${sub}</span>` : ''}</div>`;
  return `<div class="sum-cards">
      ${card(`${pct(due.length - owed.length, due.length)}%`, 'Completion', `${due.length - owed.length} of ${due.length} sessions`)}
      ${card(owed.length, 'Surveys owed', 'Each one blocks that student’s next sign-up', owed.length)}
      ${card(avg, 'Average progress', 'Out of 5, as rated by students')}
      ${card(top && top[2] ? esc(top[1]) : '—', 'Most common stage', `${responses.length} response${responses.length === 1 ? '' : 's'}`)}
    </div>
    <section class="panel"><div class="panel-head"><h2>Owed</h2><span class="faint" style="font-size:12.5px">The meeting happened but the survey isn’t in. ${LIVE ? 'Rocket emails the link an hour after the meeting.' : ''}</span></div>
      ${owed.length ? `<ul class="vh-owed">${owed.map(s => { const st = vhStudent(s.student_id), w = vhSlot(s.slot_id), m = vhMentor(w.mentor_id), url = vhSurveyUrl(s.survey_token);
        const mail = `mailto:${encodeURIComponent(st?.aus_email || '')}?subject=${encodeURIComponent(`Your Venture Hour survey (${m?.name || 'mentor'})`)}&body=${encodeURIComponent(`Hi ${(st?.name || '').split(' ')[0] || 'there'},\n\nPlease fill the 1-minute survey from your Venture Hour with ${m?.name || 'your mentor'} — you need it before you can book the next one:\n${url}\n\nThanks!\nAUS Launchpad`)}`;
        return `<li><div class="vh-owed-who"><b>${esc(st?.name || st?.aus_email)}</b><span class="mono faint">${esc(st?.aus_email || '')}</span></div>
          <div class="vh-owed-meta"><span>with ${esc(m?.name || '—')} · ${fmtDate(ymd(new Date(w.starts_at)))}</span><span class="faint">${s.survey_sent_at ? `Emailed ${fmtStamp(s.survey_sent_at)}` : 'Not emailed yet'}</span>${blocking(s) ? '<span class="tag vh-blocking">Blocking a sign-up</span>' : ''}</div>
          <div class="vh-owed-acts">${LIVE ? `<button type="button" class="btn sm" data-act="copy-text" data-v="${esc(url)}">Copy link</button><a class="btn sm btn-ghost" href="${esc(mail)}">Email</a>`
            : `<button type="button" class="btn sm" data-act="vh-demo-survey" data-id="${s.id}">Fill it (demo)</button>`}
            <button type="button" class="btn sm btn-ghost" data-act="vh-didnt-happen" data-id="${s.id}">Didn’t happen</button></div></li>`; }).join('')}</ul>`
      : '<div class="empty">Nobody owes a survey.</div>'}</section>
    <section class="panel"><div class="panel-head"><h2>Responses</h2><span class="faint" style="font-size:12.5px">Stage of venture · progress 1–5 · key takeaway</span></div>
      ${responses.length ? `<div class="vh-stagebar" role="img" aria-label="Stages: ${stages.map(([, l, c]) => `${l} ${c}`).join(', ')}">${stages.filter(x => x[2]).map(([k, l, c]) => `<span class="sg-${k}" style="flex:${c}" title="${l}: ${c}"><b>${c}</b> ${l}</span>`).join('')}</div>
        <ul class="vh-resp">${responses.map(r => { const s = vhSignup(r.signup_id), st = s && vhStudent(s.student_id), w = s && vhSlot(s.slot_id), m = w && vhMentor(w.mentor_id);
          return `<li><div class="vh-resp-top"><b>${esc(st?.name || 'Student')}</b><span class="faint">with ${esc(m?.name || '—')}${w ? ` · ${fmtDate(ymd(new Date(w.starts_at)), {day:'numeric', month:'short'})}` : ''}</span><span class="spacer"></span>
            <span class="vh-stage sg-${r.stage}">${esc(VH_STAGE[r.stage])}</span><span class="vh-dots" aria-label="Progress ${r.progress_rating} of 5">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= r.progress_rating ? 'on' : ''}"></i>`).join('')}</span></div>
            <p>${esc(r.key_takeaway)}</p></li>`; }).join('')}</ul>` : '<div class="empty">No survey responses yet.</div>'}</section>`;
}

function vhSetupTab() {
  const s = V().settings, fnUrl = (CFG.supabaseUrl || 'https://<project>.supabase.co') + '/functions/v1/venture-hour', cmd = t => `<pre class="cmd">${esc(t)}</pre>`;
  if (LIVE && !vh.status) { vh.status = {loading:true}; fnApi('venture-hour', 'status').then(r => { vh.status = r; }).catch(e => { vh.status = {error:e.message, notDeployed:/NOT_DEPLOYED|Failed/i.test(e.message)}; }).then(() => { if (view === 'programmes' && vh.tab === 'setup') render(); }); }
  const st = LIVE ? vh.status : {webhook:false, calendar:state.calendar.connected, calendarEmail:state.calendar.email};
  const chip = (ok, yes, no) => `<span class="pill ${ok ? 's-done' : 's-not_started'}">${ok ? yes : no}</span>`;
  const status = !st || st.loading ? '<span class="faint">Checking…</span>' : st.notDeployed ? chip(false, '', 'Server function not deployed') : st.error ? `<span class="err">${esc(st.error)}</span>`
    : `${chip(st.calendar, `Google Calendar: ${esc(st.calendarEmail || 'connected')}`, 'Google Calendar not connected')} ${LIVE ? chip(st.webhook, 'Form webhook ready', 'Form webhook secret missing') : ''}`;
  return `<form data-form="vh-settings" novalidate class="stackcol">
    <section class="panel"><div class="panel-head"><h2>Schedule</h2><span class="faint" style="font-size:12.5px">Applies to slots picked from now on — edit existing slots on the Slots tab</span></div>
      <div class="vh-settings">
        ${field('Mentors per week', `<input class="input" id="vs-n" name="slots_per_week" type="number" min="1" max="12" value="${s.slots_per_week}">`, 'vs-n')}
        ${field('Skip mentors picked in the last', `<div class="vh-inline"><input class="input" id="vs-cd" name="cooldown_weeks" type="number" min="0" max="12" value="${s.cooldown_weeks}"><span>weeks</span></div>`, 'vs-cd')}
        ${field('Day', `<select class="input" id="vs-day" name="meeting_day">${VH_DAYS.map((l, i) => opt(String(i + 1), l, String(s.meeting_day))).join('')}</select>`, 'vs-day')}
        ${field('Start time (Dubai)', `<input class="input" id="vs-t" name="meeting_time" type="time" value="${esc(s.meeting_time)}">`, 'vs-t')}
        ${field('Length', `<div class="vh-inline"><input class="input" id="vs-len" name="meeting_minutes" type="number" min="15" max="240" step="5" value="${s.meeting_minutes}"><span>minutes</span></div>`, 'vs-len')}
        ${field('Stop booking a slot', `<div class="vh-inline"><input class="input" id="vs-notice" name="min_notice_hours" type="number" min="0" max="72" value="${s.min_notice_hours}"><span>hours before it starts</span></div>`, 'vs-notice')}
        <div class="vh-wide">${field('Location or meeting link', `<input class="input" id="vs-loc" name="location" value="${esc(s.location)}" placeholder="Launchpad room, or a Google Meet link">`, 'vs-loc')}</div>
        <div class="vh-wide">${field('Google Form sign-up link', `<input class="input" id="vs-form" name="form_url" type="url" value="${esc(s.form_url)}" placeholder="https://forms.gle/…">`, 'vs-form')}<span class="muted-note">Included in the waitlist and survey emails so students can sign up again.</span></div>
        <label class="cbox vh-wide"><input type="checkbox" name="auto_generate" ${s.auto_generate ? 'checked' : ''}>Pick the mentors automatically every Monday at 6:00 AM</label>
      </div></section>
    <div class="links-save"><span class="err" id="vherr" role="alert"></span><button class="btn btn-primary">Save settings</button></div>
  </form>
  <section class="panel"><div class="panel-head"><h2>Connections</h2><div class="chiprow">${status}</div></div>
    <div class="links-body"><ol class="setup">
      <li><b>Google Calendar</b> — invites go out from the club Google account already connected for meetings. ${state.calendar.connected ? `It’s connected (${esc(state.calendar.email)}).` : isAdmin() ? '<button type="button" class="linkbtn" data-act="admin-links">Connect it in Admin → Links</button>.' : 'Ask an admin to connect it in Admin → Links.'}</li>
      <li><b>Server function</b> — in Terminal, in the Rocket folder, choose a long random secret and deploy:${cmd('supabase secrets set VENTURE_SECRET=' + (LIVE ? '<a long random string>' : 'choose-a-long-random-string'))}${cmd('supabase functions deploy venture-hour --use-api --no-verify-jwt')}</li>
      <li><b>Google Form</b> — create the sign-up form with questions for <i>name</i>, <i>AUS email</i>, <i>major</i>, <i>year</i> and <i>what to discuss</i>. Open <b>⋮ → Apps Script</b>, paste <code>integrations/venture-hour-form.gs</code> from the Rocket folder, add the same <code>VENTURE_SECRET</code> under Project Settings → Script properties, then run <code>setup</code> once.</li>
      <li><b>That’s it.</b> Each response is booked into the earliest open slot, first come first served. The student gets an email with the outcome, both sides get a calendar invite, and an hour after the meeting the student is emailed their survey link.</li>
    </ol>
    <span class="muted-note">Webhook address: <span class="mono" style="overflow-wrap:anywhere">${esc(fnUrl)}</span> <button type="button" class="btn sm btn-ghost" data-act="copy-text" data-v="${esc(fnUrl)}">Copy</button></span></div></section>`;
}

/* ---------------- dialogs ---------------- */
function vhMentorDialog(id) {
  const m = id ? vhMentor(id) : {name:'', type:'vc', email:'', org_title:'', focus_area:'', active:true}, used = id && V().slots.some(w => w.mentor_id === id);
  openDialog(`<form data-form="vh-mentor" ${id ? `data-id="${id}"` : ''} novalidate>${dHead(id ? m.name : 'Add a mentor', id ? `${esc(VH_TYPE[m.type])}${m.last_selected_week ? ` · last picked ${vhWeekLabel(m.last_selected_week).replace('Week of ', '')}` : ''}` : 'They join the pool Rocket picks from each week.')}
    <div class="dlg-body">
      <div class="grid2">${field('Name', inp('name', m.name, 'required autocomplete="off"'), 'f-name')}${field('Type', `<select class="input" id="f-type" name="type">${Object.entries(VH_TYPE).map(([v, l]) => opt(v, l, m.type)).join('')}</select>`, 'f-type')}</div>
      <div class="grid2">${field('Email (for the calendar invite)', inp('email', m.email, 'type="email" required autocomplete="off"'), 'f-email')}${field('Organisation / title', inp('org_title', m.org_title, 'placeholder="Partner, Dune Capital"'), 'f-org_title')}</div>
      ${field('Focus / bio <span class="faint">— optional</span>', txt('focus_area', m.focus_area, 2, 'placeholder="What students should bring to them"'), 'f-focus_area')}
      <label class="cbox"><input type="checkbox" name="active" ${m.active ? 'checked' : ''}>Active — can be picked for upcoming weeks</label>
      <span class="err" id="vherr" role="alert"></span>
    </div>${foot(`<button class="btn btn-primary">${id ? 'Save' : 'Add mentor'}</button>`, id ? `<button type="button" class="btn btn-del" data-act="vh-del-mentor" data-id="${id}" ${used ? 'disabled title="In the slot history — switch them to inactive instead"' : ''}>${ic('trash')}Delete</button>` : '')}</form>`, 'narrow');
}
function vhSignupDialog() {
  openDialog(`<form data-form="vh-signup" novalidate>${dHead('Add a sign-up', 'For a walk-in, or a response that didn’t come through. It follows the same rules as the Google Form: the earliest open slot, first come first served, and no booking while a survey is owed.')}
    <div class="dlg-body">
      <div class="grid2">${field('Student name', inp('name', '', 'required autocomplete="off"'), 'f-name')}${field('AUS email', inp('email', '', 'type="email" required placeholder="b000xxxxx@aus.edu" autocomplete="off"'), 'f-email')}</div>
      <div class="grid2">${field('Major', inp('major', '', 'autocomplete="off"'), 'f-major')}${field('Year', `<select class="input" id="f-year" name="year">${['', 'Freshman', 'Sophomore', 'Junior', 'Senior', 'Graduate'].map(y => opt(y, y || '—', '')).join('')}</select>`, 'f-year')}</div>
      ${field('What do they want to discuss?', txt('topic', '', 2, 'required'), 'f-topic')}
      <span class="err" id="vherr" role="alert"></span>
    </div>${foot('<button class="btn btn-primary">Add sign-up</button>')}</form>`, 'narrow');
}
function vhSwapDialog(slotId) {
  const w = vhSlot(slotId), cur = vhMentor(w.mentor_id), b = vhBooking(w.id);
  const taken = new Set(V().slots.filter(x => x.week_start_date === w.week_start_date && x.status !== 'cancelled').map(x => x.mentor_id));
  const free = V().mentors.filter(m => m.active && !taken.has(m.id)).sort((a, c) => vhRecent(a, w.week_start_date) - vhRecent(c, w.week_start_date) || a.name.localeCompare(c.name));
  openDialog(`<form data-form="vh-swap" data-id="${w.id}" novalidate>${dHead('Swap mentor', `${esc(cur?.name || 'Mentor')} · ${vhWhen(w)}`)}
    <div class="dlg-body">
      ${field('New mentor', `<select class="input" id="f-mentor" name="mentor"><option value="">Pick one at random (skips recent picks)</option>${free.map(m => opt(m.id, `${m.name} · ${VH_TYPE[m.type]}${vhRecent(m, w.week_start_date) ? ' · picked recently' : ''}`, '')).join('')}</select>`, 'f-mentor')}
      ${free.length ? '' : '<span class="muted-note">Every active mentor already has a slot this week.</span>'}
      ${b ? `<span class="muted-note">${esc(vhStudent(b.student_id)?.name || 'The student')} keeps the slot. ${LIVE ? 'The calendar invite updates: the new mentor is invited and the old one gets a cancellation.' : 'In the live app the calendar invite updates.'}</span>` : ''}
      <span class="err" id="vherr" role="alert"></span>
    </div>${foot('<button class="btn btn-primary">Swap</button>')}</form>`, 'narrow');
}
function vhSlotDialog(slotId) {
  const w = vhSlot(slotId), s = new Date(w.starts_at), e = new Date(w.ends_at), hm = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  openDialog(`<form data-form="vh-slot" data-id="${w.id}" novalidate>${dHead('Edit slot', `${esc(vhMentor(w.mentor_id)?.name || '')} · ${vhWeekLabel(w.week_start_date)}`)}
    <div class="dlg-body">
      <div class="grid2">${field('Date', `<input class="input" id="f-date" name="date" type="date" value="${ymd(s)}" min="${w.week_start_date}" max="${addDays(w.week_start_date, 6)}" required>`, 'f-date')}
        <div class="grid2">${field('Starts', `<input class="input" id="f-start" name="start" type="time" value="${hm(s)}" required>`, 'f-start')}${field('Ends', `<input class="input" id="f-end" name="end" type="time" value="${hm(e)}" required>`, 'f-end')}</div></div>
      ${field('Location or meeting link', inp('location', w.location), 'f-location')}
      ${vhBooking(w.id) ? `<span class="muted-note">${LIVE ? 'The calendar invite updates for the mentor and the student.' : 'In the live app the calendar invite updates.'}</span>` : ''}
      <span class="err" id="vherr" role="alert"></span>
    </div>${foot('<button class="btn btn-primary">Save</button>')}</form>`, 'narrow');
}
function vhAddSlotDialog() {
  const wk = vh.week, taken = new Set(V().slots.filter(x => x.week_start_date === wk && x.status !== 'cancelled').map(x => x.mentor_id));
  const free = V().mentors.filter(m => m.active && !taken.has(m.id)).sort((a, b) => a.name.localeCompare(b.name));
  openDialog(`<form data-form="vh-add-slot" novalidate>${dHead('Add a slot', `${vhWeekLabel(wk)} · ${VH_DAYS[V().settings.meeting_day - 1]} ${fmtTime(V().settings.meeting_time)}`)}
    <div class="dlg-body">
      ${free.length ? field('Mentor', `<select class="input" id="f-mentor" name="mentor">${free.map(m => opt(m.id, `${m.name} · ${VH_TYPE[m.type]}${vhRecent(m, wk) ? ' · picked recently' : ''}`, '')).join('')}</select>`, 'f-mentor') : '<span class="muted-note">Every active mentor already has a slot this week. Add a mentor first.</span>'}
      <span class="muted-note">Use this to pick a specific mentor. It opens for sign-ups straight away.</span>
      <span class="err" id="vherr" role="alert"></span>
    </div>${foot(free.length ? '<button class="btn btn-primary">Add slot</button>' : '')}</form>`, 'narrow');
}
function vhCancelDialog(kind, id) {
  const b = kind === 'slot' ? null : vhSignup(id), w = kind === 'slot' ? vhSlot(id) : vhSlot(b.slot_id), st = b && vhStudent(b.student_id), m = w && vhMentor(w.mentor_id);
  const t = {booking:['Cancel this booking?', `${esc(st?.name || 'The student')} with ${esc(m?.name || 'the mentor')} · ${vhWhen(w)}. The slot reopens, and the first person on this week’s waitlist gets it.${LIVE ? ' Both sides get a calendar cancellation.' : ''}`],
    didnt:['Mark as didn’t happen?', `${esc(st?.name || 'The student')} with ${esc(m?.name || 'the mentor')} · ${vhWhen(w)}. No survey will be owed, so they can sign up again.`],
    slot:['Cancel this slot?', `${esc(m?.name || 'The mentor')} · ${vhWhen(w)}. It won’t take sign-ups. Use Swap mentor instead if someone else can cover it.`]}[kind];
  openDialog(`<form data-form="vh-cancel" data-kind="${kind}" data-id="${id}" novalidate>${dHead(t[0], t[1])}
    <div class="dlg-body">${kind === 'booking' ? field('Why?', `<select class="input" id="f-reason" name="reason">${opt('student_cancelled', 'The student can’t make it', '')}${opt('mentor_unavailable', 'The mentor can’t make it', '')}${opt('cancelled', 'Other', '')}</select>`, 'f-reason') : ''}
      <span class="err" id="vherr" role="alert"></span></div>
    ${foot(`<button class="btn btn-primary btn-danger">${kind === 'didnt' ? 'Mark it' : 'Cancel it'}</button>`)}</form>`, 'narrow');
}
function vhDemoSurveyDialog(signupId) {
  const s = vhSignup(signupId), st = vhStudent(s.student_id), m = vhMentor(vhSlot(s.slot_id)?.mentor_id);
  openDialog(`<form data-form="vh-survey" data-id="${s.id}" novalidate>${dHead('Post-meeting survey', `What ${esc((st?.name || 'the student').split(' ')[0])} sees after meeting ${esc(m?.name || 'their mentor')}. In the live app they open it from their own link.`)}
    <div class="dlg-body">
      <div class="field"><label>Stage of your venture</label><div class="vh-choice">${VH_STAGES.map(([v, l], i) => `<label><input type="radio" name="stage" value="${v}" ${i === 2 ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div></div>
      <div class="field"><label>How much progress did you make? <span class="faint">1 = none, 5 = a lot</span></label><div class="vh-choice">${[1, 2, 3, 4, 5].map(n => `<label><input type="radio" name="rating" value="${n}" ${n === 4 ? 'checked' : ''}><span>${n}</span></label>`).join('')}</div></div>
      ${field('Your key takeaway', txt('takeaway', '', 3, 'required placeholder="One thing you’ll do differently"'), 'f-takeaway')}
      <span class="err" id="vherr" role="alert"></span>
    </div>${foot('<button class="btn btn-primary">Send survey</button>')}</form>`, 'narrow');
}

/* ---------------- actions, forms, changes (merged into app.js) ---------------- */
const VH_ACTS = {
  'vh-tab': el => { vh.tab = el.dataset.v; if (vh.tab === 'setup') vh.status = null; render(); },
  'vh-reload': async () => { await vhReload(); render(); },
  'vh-week': el => { const v = +el.dataset.v; vh.week = v === 0 ? vhMonday() : addDays(vh.week || vhDefaultWeek(), 7 * v); render(); },
  'vh-open-week': el => { vh.tab = 'week'; vh.week = el.dataset.id; go('programmes'); },
  'vh-generate': () => { const wk = vh.week || vhDefaultWeek();
    vhRun(() => VHA.generate(wk), r => r.created ? [`Picked ${r.created} mentor${r.created === 1 ? '' : 's'} for ${vhWeekLabel(wk).toLowerCase()}`, r.repeats ? `${r.repeats} picked recently — the pool is small` : r.short ? `only ${r.created} active mentor${r.created === 1 ? ' was' : 's were'} free` : 'open for sign-ups']
      : ['No mentors free to pick', 'add mentors or switch some to active']); },
  'vh-add-signup': () => vhSignupDialog(),
  'vh-add-slot': () => vhAddSlotDialog(),
  'vh-swap': el => vhSwapDialog(el.dataset.id),
  'vh-edit-slot': el => vhSlotDialog(el.dataset.id),
  'vh-cancel-booking': el => vhCancelDialog('booking', el.dataset.id),
  'vh-didnt-happen': el => vhCancelDialog('didnt', el.dataset.id),
  'vh-cancel-slot': el => vhCancelDialog('slot', el.dataset.id),
  'vh-sync': el => vhRun(() => VHA.sync(el.dataset.id), () => [LIVE ? 'Calendar invite sent' : 'Invite sent (simulated)']),
  'vh-new-mentor': () => vhMentorDialog(null),
  'vh-edit-mentor': el => vhMentorDialog(el.dataset.id),
  'vh-del-mentor': el => { const m = vhMentor(el.dataset.id); vhRun(() => VHA.deleteMentor(el.dataset.id), () => [`Removed ${m?.name || 'mentor'} from the pool`]); },
  'vh-mtype': el => { vh.mtype = el.dataset.v; render(); },
  'vh-inactive': () => { vh.inactive = !vh.inactive; render(); },
  'vh-log': el => { vh.log = el.dataset.v; render(); },
  'vh-sort': () => { vh.logAsc = !vh.logAsc; render(); },
  'vh-demo-survey': el => vhDemoSurveyDialog(el.dataset.id),
};
const VH_FORMS = {
  'vh-mentor'(f, fd) {
    const m = {id:f.dataset.id || null, name:String(fd.get('name')).trim(), type:fd.get('type'), email:String(fd.get('email')).trim().toLowerCase(), org_title:String(fd.get('org_title')).trim(), focus_area:String(fd.get('focus_area')).trim(), active:!!fd.get('active')};
    if (!m.name) return $('#vherr').textContent = 'Add their name.';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m.email)) return $('#vherr').textContent = 'Add a valid email — the calendar invite goes there.';
    vhRun(() => VHA.saveMentor(m), () => [m.id ? `Saved ${m.name}` : `Added ${m.name}`, m.active ? '' : 'inactive — won’t be picked']);
  },
  'vh-signup'(f, fd) {
    const p = {name:String(fd.get('name')).trim(), email:String(fd.get('email')).trim().toLowerCase(), major:String(fd.get('major')).trim(), year:String(fd.get('year') || ''), topic:String(fd.get('topic')).trim()};
    if (!p.name || !p.topic) return $('#vherr').textContent = 'Add their name and what they want to discuss.';
    if (!/^[^@\s]+@aus\.edu$/.test(p.email)) return $('#vherr').textContent = 'Use their @aus.edu email address.';
    vhRun(() => VHA.addSignup(p), r => vhOutcome(r?.result));
  },
  'vh-swap'(f, fd) { const mentor = String(fd.get('mentor') || ''); vhRun(() => VHA.swap(f.dataset.id, mentor), r => [`Swapped to ${r?.result?.to || 'a new mentor'}`, r?.result?.signup_id ? (LIVE ? 'calendar invite updated' : 'the student keeps the slot') : '']); },
  'vh-add-slot'(f, fd) { const mentor = String(fd.get('mentor') || ''); if (!mentor) return; vhRun(() => VHA.addSlot(vh.week, mentor), () => [`Added a slot with ${vhMentor(mentor)?.name}`, 'open for sign-ups']); },
  'vh-slot'(f, fd) {
    const w = vhSlot(f.dataset.id), date = String(fd.get('date')), start = String(fd.get('start')), end = String(fd.get('end'));
    if (!date || !start || !end) return $('#vherr').textContent = 'Add the date and both times.';
    if (date < w.week_start_date || date > addDays(w.week_start_date, 6)) return $('#vherr').textContent = `Keep it within the ${vhWeekLabel(w.week_start_date).toLowerCase()}.`;
    if (end <= start) return $('#vherr').textContent = 'It has to end after it starts.';
    const patch = {starts_at:new Date(`${date}T${start}`).toISOString(), ends_at:new Date(`${date}T${end}`).toISOString(), location:String(fd.get('location')).trim()};
    vhRun(() => VHA.saveSlot(w.id, patch), () => ['Slot updated', vhBooking(w.id) ? (LIVE ? 'calendar invite updated' : 'invite update simulated') : '']);
  },
  'vh-cancel'(f, fd) {
    const kind = f.dataset.kind, id = f.dataset.id;
    if (kind === 'slot') return vhRun(() => VHA.cancelSlot(id), () => ['Slot cancelled']);
    vhRun(() => VHA.cancelSignup(id, kind === 'didnt' ? 'didnt_happen' : String(fd.get('reason') || 'cancelled')),
      r => kind === 'didnt' ? ['Marked as didn’t happen', 'no survey owed'] : ['Booking cancelled', r?.result?.promoted ? 'the slot went to the next person on the waitlist' : 'the slot is open again']);
  },
  'vh-survey'(f, fd) {
    const a = {stage:fd.get('stage'), rating:+fd.get('rating'), takeaway:String(fd.get('takeaway')).trim()};
    if (!a.takeaway) return $('#vherr').textContent = 'Add the key takeaway.';
    vhRun(() => VHA.survey(f.dataset.id, a), () => ['Survey in', 'they can sign up again']);
  },
  'vh-settings'(f, fd) {
    const n = k => Math.round(+fd.get(k)), s = {slots_per_week:n('slots_per_week'), cooldown_weeks:n('cooldown_weeks'), meeting_day:n('meeting_day'), meeting_time:String(fd.get('meeting_time') || ''),
      meeting_minutes:n('meeting_minutes'), min_notice_hours:n('min_notice_hours'), location:String(fd.get('location')).trim(), form_url:String(fd.get('form_url')).trim(), auto_generate:!!fd.get('auto_generate')};
    const bad = !(s.slots_per_week >= 1 && s.slots_per_week <= 12) ? 'Mentors per week: 1 to 12.' : !(s.cooldown_weeks >= 0 && s.cooldown_weeks <= 12) ? 'Cooldown: 0 to 12 weeks.'
      : !/^\d\d:\d\d$/.test(s.meeting_time) ? 'Add a start time.' : !(s.meeting_minutes >= 15 && s.meeting_minutes <= 240) ? 'Length: 15 to 240 minutes.'
      : !(s.min_notice_hours >= 0 && s.min_notice_hours <= 72) ? 'Booking cut-off: 0 to 72 hours.' : s.form_url && !/^https:\/\/\S+$/i.test(s.form_url) ? 'Paste the full https:// link to the form.' : '';
    if (bad) return $('#vherr').textContent = bad;
    vhRun(() => VHA.saveSettings(s), () => ['Settings saved', 'used for the next slots Rocket picks']);
  },
};
const VH_CHANGE = {
  'vh-active': el => { const m = vhMentor(el.dataset.id); if (!m) return;
    vhRun(() => VHA.saveMentor({...m, active:el.checked}), () => [el.checked ? `${m.name} is active` : `${m.name} is inactive`, el.checked ? 'can be picked again' : 'won’t be picked for new weeks']); },
};
function vhInput(el) {
  if (el.dataset.input === 'vh-q') { vh.q = el.value; const box = $('#vh-log'); if (box) box.innerHTML = vhLogList(); return true; }
  if (el.dataset.input === 'vh-mq') { vh.mq = el.value; const pos = el.selectionStart; render(); const again = document.querySelector('[data-input="vh-mq"]'); if (again) { again.focus(); try { again.setSelectionRange(pos, pos); } catch (e) {} } return true; }
  return false;
}
// Venture Hour sessions on the Calendar (members with the Programmes section)
function vhCalItems() {
  if (!access('programmes') || !vhReady()) return [];
  return V().slots.filter(w => w.status !== 'cancelled').map(w => { const m = vhMentor(w.mentor_id), b = vhBooking(w.id), st = b && vhStudent(b.student_id), d = new Date(w.starts_at);
    return {kind:'programme', date:ymd(d), time:`${pad(d.getHours())}:${pad(d.getMinutes())}`, title:`Venture Hour: ${m?.name || 'Mentor'}`, sub:`${vhTime(w.starts_at)} · ${st ? `with ${st.name}` : w.status === 'open' ? 'Open slot' : 'Done'}${w.location ? ` · ${w.location}` : ''}`,
      act:'vh-open-week', id:w.week_start_date, done:vhEnded(w)}; });
}
