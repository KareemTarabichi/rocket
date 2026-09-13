/* Live mode runs against Supabase when config.js has a project URL and anon key; otherwise the app is a local demo. */
const APP_VERSION = '2026.09.14-1';   // bump with every release (also the ?v= in index.html)
const CFG = window.ROCKET_CONFIG || {};
const LIVE = !!(CFG.supabaseUrl && CFG.supabaseAnonKey);
const STARTUP_ROWS = window.STARTUP_ROWS || [];

/* ================= utilities ================= */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => ymd(new Date());
const parseD = s => new Date(s + 'T00:00');
const addDays = (base, n) => { const d = parseD(base); d.setDate(d.getDate() + n); return ymd(d); };
const daysFrom = s => Math.round((parseD(s) - parseD(today())) / 864e5);
const fmtDate = (s, o = {weekday:'short', day:'numeric', month:'short'}) => s ? parseD(s).toLocaleDateString('en-GB', o) : '—';
const fmtDateY = s => fmtDate(s, {day:'numeric', month:'short', year:'numeric'});
const fmtTime = t => { if (!t) return ''; const [h, m] = t.split(':').map(Number); return new Date(2000, 0, 1, h, m).toLocaleTimeString('en-US', {hour:'numeric', minute:'2-digit'}); };
const fmtStamp = iso => new Date(iso).toLocaleString('en-GB', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'});
const aed = n => 'AED ' + Math.round(n || 0).toLocaleString('en-US');
const num = n => Math.round(n || 0).toLocaleString('en-US');
const uid = p => p + Math.random().toString(36).slice(2, 9);
const pct = (done, total) => total ? Math.round(done / total * 100) : 0;
const relDue = s => { const n = daysFrom(s); if (n === 0) return 'Today'; if (n === 1) return 'Tomorrow'; if (n === -1) return 'Yesterday'; return n < 0 ? `${-n}d overdue` : `in ${n}d`; };

const ICON = {
  home:'<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  cal:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  flag:'<path d="M5 21V4m0 0h11l-2 4 2 4H5"/>',
  board:'<rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="11" rx="1"/><rect x="17" y="4" width="4" height="7" rx="1"/>',
  star:'<path d="m12 3 2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/>',
  bulb:'<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3z"/>',
  rocket:'<path d="M12 3c3 2 5 5.5 5 10l-2.5 3h-5L7 13c0-4.5 2-8 5-10z"/><circle cx="12" cy="10" r="1.6"/><path d="M9.5 16 8 21l4-2 4 2-1.5-5"/>',
  image:'<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
  coins:'<ellipse cx="9" cy="7" rx="6" ry="3"/><path d="M3 7v5c0 1.7 2.7 3 6 3s6-1.3 6-3V7"/><path d="M15 12.5c3.3 0 6 1.3 6 3v3c0 1.7-2.7 3-6 3-2 0-3.8-.5-4.9-1.2"/>',
  team:'<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.2c2.8.3 5 2.7 5 5.8"/>',
  book:'<path d="M4 5a2 2 0 0 1 2-2h13v15H6a2 2 0 0 0-2 2z"/><path d="M4 20a2 2 0 0 0 2 2h13v-4M8 7h7M8 11h5"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  x:'<path d="M6 6l12 12M18 6 6 18"/>',
  lock:'<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  wa:'<path d="M20.5 11.7a8.6 8.6 0 0 1-12.7 7.5L3.5 20.5l1.3-4.1a8.6 8.6 0 1 1 15.7-4.7z"/><path d="M9 8.3c.2 3.4 3.3 6.4 6.7 6.6l1.1-1.7-2.1-1.1-.9.9a4.6 4.6 0 0 1-2.6-2.6l.9-.9-1-2.1z"/>',
  more:'<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
  bell:'<path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  trash:'<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  shield:'<path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  logout:'<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 16l-4-4 4-4M6 12h10"/>',
  folder:'<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2h8.5A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/>',
  edit:'<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  ext:'<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  chat:'<path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.1A8 8 0 1 1 20 12z"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  grid:'<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4M7.5 13h.01M12 13h.01M16.5 13h.01M7.5 17h.01M12 17h.01"/>'
};
const ic = n => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n]}</svg>`;
const mq = window.matchMedia('(max-width: 760px)');
const isM = () => mq.matches;

/* ================= roles, sections, teams ================= */
const ROLES = [
  {id:'president', label:'President'}, {id:'vp', label:'Vice President'}, {id:'advisor', label:'Advisor'}, {id:'ea', label:'Executive Assistant'},
  {id:'treasurer', label:'Treasurer'}, {id:'startup', label:'Startup Coordinator'}, {id:'pr', label:'PR'}, {id:'tech', label:'Tech'},
  {id:'media', label:'Media'}, {id:'design', label:'Graphic Design'}, {id:'innovation', label:'Innovation'}];
const roleLabel = r => ROLES.find(x => x.id === r)?.label || r;
const OVERSIGHT = ['president', 'vp', 'advisor', 'ea'];
const BASE_SECTIONS = ['overview', 'calendar', 'meetings', 'events', 'ideas', 'deadlines', 'kb'];
const OVERSIGHT_SECTIONS = ['startups', 'budget', 'design', 'members'];
const EXTRA_SECTIONS = {treasurer:['budget'], startup:['startups'], pr:['design']};
const SECTIONS = [
  ['overview','Overview','home'], ['calendar','Calendar','grid'], ['meetings','Meetings','clock'], ['events','Events','star'], ['ideas','Ideas','bulb'], ['deadlines','Deadlines','flag'],
  ['startups','Startup Directory','rocket'], ['budget','Budget','coins'], ['design','Design','image'], ['members','Members & teams','team'], ['kb','Knowledge Base','book'], ['admin','Admin','shield']];
const sectionLabel = s => SECTIONS.find(x => x[0] === s)?.[1] || s;
const TEAMS = [
  {id:'leadership', name:'Leadership', wa:'chat.whatsapp.com/LeadRocket', desc:'President, Vice President, Advisor and Executive Assistant.'},
  {id:'finance', name:'Finance', wa:'chat.whatsapp.com/FinRocket', desc:'Budget, expenses and reimbursements.'},
  {id:'startups', name:'Startups', wa:'chat.whatsapp.com/StartRocket', desc:'Startup relationships and the directory.'},
  {id:'creative', name:'Creative', wa:'chat.whatsapp.com/CreateRocket', desc:'PR, media and graphic design.'},
  {id:'tech', name:'Tech', wa:'chat.whatsapp.com/TechRocket', desc:'Forms, livestreams and club tools.'},
  {id:'innovation', name:'Innovation', wa:'chat.whatsapp.com/InnoRocket', desc:'New programmes and the ideas pipeline.'}];
const teamName = id => TEAMS.find(t => t.id === id)?.name || '—';
const HUES = ['#4DD9E8','#F5B942','#B7A6E6','#F5F4F7','#4ADE80','#E8672E','#F5626B','#7FE3EE','#F0946A','#F8CF7A','#9BE8B4'];
const IDEA_STAGES = ['submitted','review','approved','progress','completed'];
const IDEA_LABEL = {submitted:'Submitted', review:'Under Review', approved:'Approved', progress:'In Progress', completed:'Completed'};
const DESIGN_STATUS = ['requested','in_progress','in_review','completed'];
const DESIGN_LABEL = {requested:'Requested', in_progress:'In Progress', in_review:'In Review', completed:'Completed'};
const REIMB_STATUS = ['Requested','Approved','Paid','Rejected'];
const PAST_EVENTS = ['Rise', 'Ignite', 'Pitch Night', 'Founders Mixer'];

/* ================= seed ================= */
function seed() {
  const T = today(), D = n => addDays(T, n);
  const M = (id, name, role, team, email, responsibility) => ({id, name, role, team, email, responsibility});
  const members = [
    M('m1','Layla Haddad','president','leadership','g00092114@aus.edu','Sets club direction, chairs leadership syncs and owns sponsor relationships for Ignite.'),
    M('m2','Omar Siddiqui','vp','leadership','g00095320@aus.edu','Runs the events calendar and steps in for the President.'),
    M('m3','Kareem Tarabichi','advisor','leadership','g00090057@aus.edu','Advises the board, reviews ideas and connects the club with founders.'),
    M('m4','Dana Khoury','ea','leadership','g00097342@aus.edu','Schedules every club meeting, sends invitations and keeps minutes.'),
    M('m5','Noor Al Mansoori','treasurer','finance','g00097781@aus.edu','Keeps the budget, approves reimbursements and reconciles receipts.'),
    M('m6','Yousef Karam','startup','startups','g00094406@aus.edu','Maintains the startup directory and invites founders to Rise and Ignite.'),
    M('m7','Hana Farouk','pr','creative','g00103418@aus.edu','Plans campaigns, writes posts and approves creative requests.'),
    M('m8','Zaid Nasser','tech','tech','g00104127@aus.edu','Looks after forms, the livestream setup and club tools.'),
    M('m9','Mariam Qasim','media','creative','g00105560@aus.edu','Photo and video coverage, reels and recaps.'),
    M('m10','Sara Iqbal','design','creative','g00098215@aus.edu','Posters, signage and social templates.'),
    M('m11','Ali Rahman','innovation','innovation','g00102289@aus.edu','Runs new programmes and shepherds ideas through the pipeline.'),
    M('m12','Rana Said','media','creative','g00107713@aus.edu','Event photography.')];
  // platform-admin demo data: Zaid (Tech) is the admin; Rana was invited and hasn't signed in yet
  const hoursAgo = h => new Date(Date.now() - h * 36e5).toISOString();
  members.forEach((m, i) => Object.assign(m, {is_admin:m.id === 'm8', active:true, last_sign_in_at:hoursAgo(2 + i * 7), invited_at:hoursAgo(24 * 30)}));
  Object.assign(members[11], {last_sign_in_at:null, invited_at:hoursAgo(20)});
  const adminLog = [
    {id:1, actor:'m8', action:'invite', target_email:'g00107713@aus.edu', details:'media · creative', created_at:hoursAgo(20)},
    {id:2, actor:'m8', action:'update', target_email:'g00097342@aus.edu', details:'role: media → ea', created_at:hoursAgo(24 * 6)}];

  const meetings = [
    {id:'mt1', title:'Leadership weekly sync', date:T, start:'18:00', end:'19:00', location:'Launchpad room', agenda:'Overdue deadlines, Rise run-sheet, Ignite venue request.', mode:'custom', teamIds:['leadership'], attendees:[]},
    {id:'mt2', title:'Creative sprint: Ignite visuals', date:D(2), start:'16:00', end:'17:00', location:'meet.google.com/rkt-ignt-viz', agenda:'Poster direction, story templates, reel shot list.', mode:'custom', teamIds:['creative'], attendees:['m8']},
    {id:'mt3', title:'Startup & tech planning', date:D(3), start:'15:00', end:'16:00', location:'Innovation lab', agenda:'Rise booth map, sign-up form, hackathon idea.', mode:'custom', teamIds:['startups','tech'], attendees:['m11','m6']},
    {id:'mt4', title:'All-members monthly', date:D(6), start:'17:30', end:'18:30', location:'Main Plaza auditorium', agenda:'Term plan, Rise and Ignite roles, open floor.', mode:'all', teamIds:[], attendees:[]},
    {id:'mt5', title:'Rise planning debrief', date:D(-5), start:'16:00', end:'17:00', location:'Launchpad room', agenda:'What worked, what to change for Ignite.', mode:'custom', teamIds:['leadership'], attendees:['m6']}];

  const R = (title, owner, due, done = false) => ({id:uid('r'), title, owner, due:D(due), done});
  const events = [
    {id:'ev_rise', name:'Rise', description:'Startup showcase: student and UAE founders pitch and exhibit on the plaza.', date:D(18), location:'Main Plaza', team:'startups', assigned:['m6','m11'], createdBy:'m1',
      tasks:[R('Invite list sent to founders','m6',-2,true), R('Stage & AV booking','m4',-1), R('Confirm startup lineup','m6',5), R('Booth map','m8',10), R('Sponsor thank-you pack','m5',12)]},
    {id:'ev_ignite', name:'Ignite', description:'Flagship annual event: Startup Zone, workshops, talks, panels, comedy segments, women empowerment conversations, entrepreneurship stories, a CV-building workshop, student & alumni startups, a small business bazaar and networking.', date:D(45), location:'Main Plaza', team:'leadership', assigned:['m1','m2','m4','m7'], createdBy:'m1',
      tasks:[R('Venue request to Student Affairs','m4',0), R('Poster & socials plan','m7',7), R('Title sponsor confirmed','m1',14), R('Small business bazaar vendor form','m5',16), R('Speaker lineup','m2',20), R('Livestream setup','m8',30)]},
    {id:'ev_cv', name:'CV-Building Workshop', description:'Hands-on CV clinic with templates and one-to-one reviews.', date:D(9), location:'Library seminar room', team:'innovation', assigned:['m11'], createdBy:'m11',
      tasks:[R('Facilitator confirmed','m11',-3,true), R('Handouts printed','m10',8)]}];

  const tasks = [
    {id:'t1', title:'Send Rise sponsor invoice', owner:'m5', due:D(2), done:false, related:'Rise'},
    {id:'t2', title:'Update onboarding deck for new members', owner:'m2', due:D(4), done:false, related:'Onboarding'},
    {id:'t3', title:'Reply to Healthstay.io about a workshop', owner:'m6', due:D(-1), done:false, related:'Startup Directory'},
    {id:'t4', title:'Fix sign-up form validation', owner:'m8', due:T, done:false, related:'Rise'},
    {id:'t5', title:'Photo selects from Rise rehearsal', owner:'m9', due:D(3), done:false, related:'Rise'},
    {id:'t6', title:'Archive last term’s minutes', owner:'m4', due:D(-6), done:true, related:'Meetings'},
    {id:'t7', title:'Review hackathon budget ask', owner:'m3', due:D(5), done:false, related:'Ideas'}];

  const I = (id, title, description, team, owner, assigned, stage, notes, next, due, previousStage) => ({id, title, description, team, owner, assigned, stage, notes, next, due:D(due), ...(previousStage ? {previousStage} : {})});
  const ideas = [
    I('i1','Founder office hours','Weekly slot where a founder from the directory takes student questions.','startups','m6',[],'submitted','','Draft a one-page format',7),
    I('i2','Launchpad podcast','Short interviews with founders who pitched at Rise.','creative','m9',['m7'],'review','Needs a quiet room and one decent mic.','Record a pilot episode',10),
    I('i3','Alumni mentor matching','Pair members with alumni founders for a term.','innovation','m11',['m2'],'approved','Advisor supports; keep it to 10 pairs first.','Shortlist 10 alumni mentors',5),
    I('i4','Hackathon with Tech','Weekend build sprint using problems from the startup directory.','tech','m8',['m11','m6'],'progress','Budget ask under review.','Book the lab for a weekend',2),
    I('i5','Arabic content series','Bilingual carousels explaining startup basics.','creative','m7',['m10'],'progress','','Publish the first carousel',-1),
    I('i6','Club merch drop','Hoodies and stickers with the Rocket mark.','creative','m10',[],'completed','Sold out in two days.','Order the first batch',-10,'progress'),
    I('i7','Startup newsletter','Monthly email to founders in the directory.','leadership','m3',[],'submitted','','Pick a newsletter tool',12)];

  const designs = [
    {id:'ds1', title:'Ignite main poster', event:'ev_ignite', campaign:'', brief:'Hero poster in the thermal-gradient style. Must list every Ignite segment and the sponsor lockup.', deliverables:'A3 poster, Instagram post, Instagram story', owner:'m10', due:D(6), status:'in_progress'},
    {id:'ds2', title:'Rise booth signage', event:'ev_rise', campaign:'', brief:'One sign per startup booth with name and sector.', deliverables:'20 × A2 booth signs, wayfinding arrows', owner:'m10', due:D(12), status:'requested'},
    {id:'ds3', title:'Rise recap reel', event:'ev_rise', campaign:'', brief:'60-second recap cut from the day’s footage.', deliverables:'Vertical reel, 3 stills', owner:'m9', due:D(22), status:'requested'},
    {id:'ds4', title:'Ramadan greetings carousel', event:'', campaign:'Ramadan greetings', brief:'Bilingual greetings carousel from the club.', deliverables:'5-slide carousel', owner:'m7', due:D(15), status:'in_review'},
    {id:'ds5', title:'Member recruitment post', event:'', campaign:'Recruitment', brief:'Call for new members across all teams.', deliverables:'Post + story', owner:'m9', due:D(-3), status:'completed', previousStatus:'in_review'}];

  const budget = {overall:90000, allocations:{ev_rise:20000, ev_ignite:55000, ev_cv:1500},
    expenses:[
      {id:'e1', name:'Main Plaza stage & AV', event:'ev_ignite', planned:18000, actual:0, receipt:''},
      {id:'e2', name:'Rise booth rental', event:'ev_rise', planned:8000, actual:8400, receipt:'rise-booths-invoice.pdf'},
      {id:'e3', name:'Rise catering', event:'ev_rise', planned:6000, actual:5200, receipt:'catering-receipt.jpg'},
      {id:'e4', name:'Ignite poster print run', event:'ev_ignite', planned:2500, actual:0, receipt:''},
      {id:'e5', name:'CV workshop handouts', event:'ev_cv', planned:300, actual:280, receipt:'print-shop.pdf'},
      {id:'e6', name:'Facilitator honorarium', event:'ev_cv', planned:1000, actual:1400, receipt:'honorarium.pdf'}],
    reimbursements:[
      {id:'rb1', name:'Rise badges & lanyards', member:'m6', event:'ev_rise', amount:640, status:'Paid', receipt:'lanyards.jpg'},
      {id:'rb2', name:'Ignite sponsor lunch', member:'m1', event:'ev_ignite', amount:420, status:'Approved', receipt:'lunch.pdf'},
      {id:'rb3', name:'Test poster prints', member:'m10', event:'ev_ignite', amount:150, status:'Requested', receipt:''},
      {id:'rb4', name:'Taxi to venue walkthrough', member:'m4', event:'ev_rise', amount:80, status:'Rejected', receipt:'taxi.png'}]};

  const startups = STARTUP_ROWS.map((r, i) => {
    const F = r.founders.length ? r.founders : (r.phones.length || r.emails.length ? [''] : []);
    const contacts = F.map((name, k) => ({id:uid('c'), name, email: F.length > 1 ? (r.emails[k] || '') : (r.emails[0] || ''), phone: F.length > 1 ? (r.phones[k] || '') : (r.phones[0] || ''), primary:k === 0}));
    const extra = F.length <= 1 ? [...r.emails.slice(1), ...r.phones.slice(1)] : [];
    return {id:'s' + (i + 1), name:r.name, sector:r.sector, contacts, rating:r.rating,
      notes:[r.desc, extra.length ? `Other contact details: ${extra.join(', ')}` : ''].filter(Boolean).join('\n\n'),
      attendance: r.attendance ? ['Rise'] : [], deletion:null};
  });
  // example of the approval flow: the Startup Coordinator has asked to delete one record
  const pendingDel = startups.find(s => s.name === 'Paci.ai');
  if (pendingDel) pendingDel.deletion = {by:'m6', at:new Date(Date.now() - 5 * 36e5).toISOString(), reason:'Example request — no contact details and no activity since RISE25.'};

  // knowledge base starts from the built-in guides; admins edit it from there
  const kb = KB.map(a => ({id:a.id, title:a.title, category:a.category, roles:a.roles, summary:a.summary,
    body:a.steps.map((s, i) => `${i + 1}. ${s}`).join('\n'), updatedBy:'m8', updatedAt:new Date(Date.now() - 864e5 * 12).toISOString()}));

  const notifications = [
    {id:uid('n'), kind:'invite', title:'Meeting invitation: Leadership weekly sync', details:`${fmtDate(T)} · 6:00 PM–7:00 PM · Launchpad room`, recipients:['m1','m2','m3','m4'], at:new Date(Date.now() - 864e5 * 2).toISOString(), calendar:false},
    {id:uid('n'), kind:'invite', title:'Meeting invitation: All-members monthly', details:`${fmtDate(D(6))} · 5:30 PM–6:30 PM · Main Plaza auditorium`, recipients:members.map(m => m.id), at:new Date(Date.now() - 864e5).toISOString(), calendar:false}];

  const C = (ideaId, author, hoursAgo, title, body) => ({id:uid('ic'), ideaId, author, title, body, at:new Date(Date.now() - hoursAgo * 36e5).toISOString()});
  const ideaComments = [
    C('i2', 'm7', 30, 'Guest list for the pilot', 'Start with two Rise founders who already said yes to interviews. Keep it to 20 minutes.'),
    C('i2', 'm9', 6, '', 'The library has a recording room we can book for free — I’ll check next week’s slots.'),
    C('i4', 'm11', 20, 'Problem statements', 'Pull three problems from the startup directory notes so teams build for real founders.'),
    C('i4', 'm6', 3, 'Judges', 'Yousef can bring two founders from the directory to judge on the last day.')];
  return {version:2, role:'ea', meId:'m4', ideaComments, members, meetings, events, tasks, ideas, designs, budget, startups, notifications, adminLog, kb,
    settings:{designDriveUrl:'', links:emptyLinks()}, calendar:{connected:false, email:''}};
}

/* ================= state & persistence ================= */
const KEY = 'launchpad-demo-v2';
let storageOk = true;
let state = null;   // live mode: filled from Supabase after sign-in
function initDemoState() {
  try { const raw = localStorage.getItem(KEY); if (raw) { const s = JSON.parse(raw); if (s && s.version === 2 && Array.isArray(s.members) && s.meId && s.adminLog && s.kb && s.settings) state = s; } } catch (e) { storageOk = false; }
  if (!state) state = seed();
  ensureLinks(); state.ideaComments ||= [];
  if (!state.changeLog) {   // a little example history for the demo
    const at = h => new Date(Date.now() - h * 36e5).toISOString(), E = (entity_type, entity_id, actor, h, action, subject, changes = {}) => ({id:h, entity_type, entity_id, actor, action, subject, changes, created_at:at(h)});
    state.changeLog = [
      E('idea', 'i2', 'm9', 3, 'updated', 'Launchpad podcast', {stage:['submitted', 'review']}),
      E('idea', 'i2', 'm9', 30, 'updated', 'Launchpad podcast', {assigned:[[], ['m7']]}),
      E('idea', 'i2', 'm9', 48, 'created', 'Launchpad podcast'),
      E('event', 'ev_ignite', 'm4', 5, 'requirement updated', 'Venue request to Student Affairs', {due:[addDays(today(), -2), today()]}),
      E('event', 'ev_ignite', 'm1', 26, 'updated', 'Ignite', {location:['TBC', 'Main Plaza']}),
      E('event', 'ev_rise', 'm6', 8, 'requirement updated', 'Invite list sent to founders', {done:[false, true]}),
      E('startup', 's1', 'm6', 12, 'updated', state.startups[0]?.name || '', {sector:['', state.startups[0]?.sector || 'Edtech']})];
  }
}
let view = 'overview';
let draft = null;          // record being edited in the open dialog
let pendingDeletion = null; // {kind, id}
const filters = {
  meetings:'upcoming', events:'mine', deadlines:'pending',
  ideas:{team:'all', owner:'all', stage:'all', scope:'all'}, ideaStageM:'progress',
  startups:{q:'', sector:'all', att:'all', missing:false, view:'table'},
  design:'open', kb:'',
  cal:{cursor:null, sel:null, mine:false, types:{meeting:true, event:true, task:true, idea:true, design:true}}
};
function save() {
  if (LIVE) return queueSync();   // live.js writes the changed records to Supabase
  try { localStorage.setItem(KEY, JSON.stringify(state)); storageOk = true; }
  catch (e) { if (storageOk) toast('Couldn’t save to this browser — changes last until you close the page', '', true); storageOk = false; }
}
function upsert(list, rec) { const i = list.findIndex(x => x.id === rec.id); if (i >= 0) list[i] = rec; else list.push(rec); return rec; }
function finish(msg, sub) { save(); closeDialog(); render(); if (msg) toast(msg, sub); }

/* ================= links (admin-managed) ================= */
// state.settings.links = {whatsapp:{all, <team id>…}, calendarUrl, custom:[{id, label, url}]}
const emptyLinks = () => ({whatsapp:{}, calendarUrl:'', custom:[]});
function ensureLinks() {
  if (!state) return;
  state.settings ||= {designDriveUrl:''};
  const l = state.settings.links || {};
  state.settings.links = {whatsapp:l.whatsapp || {}, calendarUrl:l.calendarUrl || '', custom:Array.isArray(l.custom) ? l.custom : []};
}
const links = () => state.settings?.links || emptyLinks();
const waDigits = phone => String(phone || '').replace(/\D/g, '');
// WhatsApp target for a team group, the club-wide group ('all'), or a member's own number.
function waHref(kind, id) {
  if (kind === 'team' || kind === 'all') return links().whatsapp[kind === 'all' ? 'all' : id] || '';
  const d = waDigits(member(id)?.whatsapp);
  return d.length >= 7 ? `https://wa.me/${d}` : '';
}

/* ================= identity & permissions ================= */
const me = () => state.members.find(m => m.id === state.meId) || state.members.find(m => m.role === state.role);
const member = id => state.members.find(m => m.id === id);
const teamMembers = teamId => state.members.filter(m => m.team === teamId && m.active !== false).map(m => m.id);
const oversight = (role = state.role) => OVERSIGHT.includes(role);
const ea = (role = state.role) => role === 'ea';
const isAdmin = () => !!me()?.is_admin;
const access = (section, role = state.role) => section === 'admin' ? isAdmin() : BASE_SECTIONS.includes(section) || (oversight(role) && OVERSIGHT_SECTIONS.includes(section)) || (EXTRA_SECTIONS[role] || []).includes(section);
const canIdea = idea => !!idea && (oversight() || isAdmin() || idea.owner === me().id || idea.assigned.includes(me().id));
// The owner is locked; only the owner or an admin deletes; owner + collaborators contribute.
const canDeleteIdea = idea => !!idea && (idea.owner === me().id || isAdmin());
const canCommentIdea = idea => !!idea && (idea.owner === me().id || idea.assigned.includes(me().id));
const ideaOf = c => state.ideas.find(i => i.id === c?.ideaId);
const canDeleteComment = c => !!c && (c.author === me().id || ideaOf(c)?.owner === me().id || isAdmin());
const commentsFor = ideaId => (state.ideaComments || []).filter(c => c.ideaId === ideaId).sort((a, b) => a.at.localeCompare(b.at));
const canEvent = ev => !!ev && (oversight() || ev.createdBy === me().id || teamMembers(ev.team).includes(me().id));
const canTask = item => !!item && (oversight() || item.owners.includes(me().id));
const canDesignStatus = d => access('design') || d.owner === me().id;
// Deleting a startup needs an admin or the President; anyone with the directory can ask for it.
const canApproveStartupDeletion = () => isAdmin() || state.role === 'president';
function deletable(kind, rec) {
  if (!rec) return false;
  if (kind === 'meeting') return ea();
  if (kind === 'idea') return canDeleteIdea(rec);
  if (kind === 'comment') return canDeleteComment(rec);
  if (kind === 'startup') return canApproveStartupDeletion();
  if (kind === 'kb') return isAdmin();
  if (kind === 'member') { const list = adminData.members || state.members;
    return isAdmin() && rec.id !== me().id && !(rec.is_admin && rec.active !== false && list.filter(m => m.is_admin && m.active !== false).length <= 1); }
  return false;
}

/* ================= meetings ================= */
function recipients(m) {
  if (m.mode === 'all') return state.members.filter(x => x.active !== false).map(x => x.id);
  const set = new Set(m.attendees);
  state.members.forEach(x => { if (m.teamIds.includes(x.team)) set.add(x.id); });
  return state.members.map(x => x.id).filter(id => set.has(id));
}
const meetingEnded = m => new Date(`${m.date}T${m.end}`) < new Date();
const meetingLive = m => !meetingEnded(m) && new Date(`${m.date}T${m.start}`) <= new Date();
function visibleMeetings() {
  const list = oversight() ? state.meetings : state.meetings.filter(m => recipients(m).includes(me().id));
  return [...list].sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
}
const upcomingMeetings = () => visibleMeetings().filter(m => !meetingEnded(m));
function audienceText(m) {
  if (m.mode === 'all') return 'All members';
  const parts = [...m.teamIds.map(teamName), ...m.attendees.filter(id => !m.teamIds.includes(member(id)?.team)).map(id => member(id)?.name.split(' ')[0])];
  return parts.join(', ') || 'No one yet';
}
function notify(kind, title, details, ids) {
  const n = {id:uid('n'), kind, title, details, recipients:[...new Set(ids)], at:new Date().toISOString(), calendar:state.calendar.connected};
  state.notifications.unshift(n);
  state.notifications = state.notifications.slice(0, 100);
  return n.id;
}
const visibleNotifications = () => oversight() ? state.notifications : state.notifications.filter(n => n.recipients.includes(me().id));

/* ================= events & ideas relevance ================= */
const eventById = id => state.events.find(e => e.id === id);
function relevantEvent(ev, id = me().id) {
  const why = [];
  if (teamMembers(ev.team).includes(id)) why.push('your team');
  if (ev.assigned.includes(id)) why.push('assigned');
  if (ev.tasks.some(t => t.owner === id)) why.push('your requirements');
  if (state.designs.some(d => d.event === ev.id && d.owner === id)) why.push('your design work');
  return why;
}
const upcomingEvents = (mine = true) => [...state.events].filter(e => daysFrom(e.date) >= 0 && (!mine || relevantEvent(e).length)).sort((a, b) => a.date.localeCompare(b.date));
const relevantIdea = (i, id = me().id) => i.owner === id || i.assigned.includes(id) || teamMembers(i.team).includes(id);

/* ================= deadlines (derived) ================= */
function deadlineItems(all = false) {
  const items = [];
  state.tasks.forEach(t => items.push({key:'task:' + t.id, src:'task', srcLabel:'Follow-up', id:t.id, title:t.title, related:t.related || 'Follow-up', owner:t.owner, owners:[t.owner], team:member(t.owner)?.team, due:t.due, done:t.done}));
  state.events.forEach(e => e.tasks.forEach(r => items.push({key:`req:${e.id}:${r.id}`, src:'req', srcLabel:'Event', id:r.id, eventId:e.id, title:r.title, related:e.name, owner:r.owner, owners:[r.owner], team:e.team, due:r.due, done:r.done})));
  state.ideas.forEach(i => { if (i.next && i.due) items.push({key:'idea:' + i.id, src:'idea', srcLabel:'Idea', id:i.id, title:i.next, related:i.title, owner:i.owner, owners:[i.owner, ...i.assigned], team:i.team, due:i.due, done:i.stage === 'completed'}); });
  state.designs.forEach(d => { if (d.owner && d.due) items.push({key:'design:' + d.id, src:'design', srcLabel:'Design', id:d.id, title:d.title, related:d.event ? eventById(d.event)?.name || 'Event' : d.campaign || 'Campaign', owner:d.owner, owners:[d.owner], team:member(d.owner)?.team, due:d.due, done:d.status === 'completed'}); });
  const list = all || oversight() ? items : items.filter(x => x.owners.includes(me().id));
  return list.sort((a, b) => a.due.localeCompare(b.due));
}
const pending = () => deadlineItems().filter(x => !x.done);
function findItem(key) { return deadlineItems(true).find(x => x.key === key); }
function completeItem(key, done) {
  const item = findItem(key);
  if (!canTask(item)) { toast('Only the owner or leadership can complete this item', '', true); return false; }
  if (item.src === 'task') state.tasks.find(t => t.id === item.id).done = done;
  if (item.src === 'req') eventById(item.eventId).tasks.find(r => r.id === item.id).done = done;
  if (item.src === 'idea') { const i = state.ideas.find(x => x.id === item.id);
    if (done && i.stage !== 'completed') { i.previousStage = i.stage; i.stage = 'completed'; }
    if (!done && i.stage === 'completed') { i.stage = i.previousStage && i.previousStage !== 'completed' ? i.previousStage : 'progress'; delete i.previousStage; } }
  if (item.src === 'design') { const d = state.designs.find(x => x.id === item.id);
    if (done && d.status !== 'completed') { d.previousStatus = d.status; d.status = 'completed'; }
    if (!done && d.status === 'completed') { d.status = d.previousStatus && d.previousStatus !== 'completed' ? d.previousStatus : 'in_progress'; delete d.previousStatus; } }
  save(); return true;
}

/* ================= startups ================= */
const missingContact = s => !s.contacts.length || !s.contacts.some(c => c.primary) || s.contacts.some(c => !c.name.trim() || !c.email.trim() || !c.phone.trim());
const primaryContact = s => s.contacts.find(c => c.primary) || s.contacts[0];
function filteredStartups() {
  const f = filters.startups, q = f.q.trim().toLowerCase();
  return state.startups.filter(s =>
    (!q || [s.name, s.sector, s.notes, ...s.contacts.flatMap(c => [c.name, c.email, c.phone])].join(' ').toLowerCase().includes(q)) &&
    (f.sector === 'all' || (s.sector || '').toLowerCase() === f.sector) &&
    (f.att === 'all' || (f.att === 'any' ? s.attendance.length : f.att === 'never' ? !s.attendance.length : s.attendance.includes(f.att))) &&
    (!f.missing || missingContact(s))
  ).sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1) || a.name.localeCompare(b.name));
}

/* ================= budget ================= */
function budgetTotals(eventId) {
  const ex = state.budget.expenses.filter(e => !eventId || e.event === eventId), rb = state.budget.reimbursements.filter(r => !eventId || r.event === eventId);
  const planned = ex.reduce((s, e) => s + (+e.planned || 0), 0) + rb.filter(r => r.status !== 'Rejected').reduce((s, r) => s + (+r.amount || 0), 0);
  const actual = ex.reduce((s, e) => s + (+e.actual || 0), 0) + rb.filter(r => r.status === 'Paid').reduce((s, r) => s + (+r.amount || 0), 0);
  const allocation = eventId ? (+state.budget.allocations[eventId] || 0) : +state.budget.overall || 0;
  const allocated = Object.values(state.budget.allocations).reduce((s, v) => s + (+v || 0), 0);
  return {planned, actual, allocation, remaining:allocation - actual, over:actual > allocation, allocated};
}

/* ================= notification centre ================= */
// Things that need the signed-in member's attention, newest-urgent first. Computed, never stored.
function attentionItems() {
  const m = me(), items = [];
  deadlineItems(true).filter(x => !x.done && x.owners.includes(m.id) && daysFrom(x.due) <= 1).forEach(x => {
    const n = daysFrom(x.due);
    items.push({kind:'deadline', tone:n < 0 ? 'over' : 'soon', label:x.srcLabel, title:x.title,
      sub:`${x.related} · ${n < 0 ? relDue(x.due) : n === 0 ? 'due today' : 'due tomorrow'}`, key:x.key,
      act:x.src === 'req' ? 'open-event' : x.src === 'idea' ? 'open-idea' : x.src === 'design' ? 'open-design' : 'go', id:x.src === 'req' ? x.eventId : x.src === 'task' ? 'deadlines' : x.id});
  });
  upcomingMeetings().filter(mt => recipients(mt).includes(m.id) && daysFrom(mt.date) <= 1).forEach(mt =>
    items.push({kind:'meeting', tone:meetingLive(mt) ? 'over' : 'info', label:'Meeting', title:mt.title,
      sub:`${meetingLive(mt) ? 'Happening now' : daysFrom(mt.date) === 0 ? 'Today' : 'Tomorrow'} · ${fmtTime(mt.start)} · ${mt.location}`, act:'open-meeting', id:mt.id}));
  state.designs.filter(d => d.owner === m.id && d.status === 'requested').forEach(d =>
    items.push({kind:'design', tone:'info', label:'Design', title:`New request: ${d.title}`, sub:`Due ${fmtDate(d.due)} · ${d.deliverables}`, act:'open-design', id:d.id}));
  if (state.role === 'pr') state.designs.filter(d => d.status === 'in_review').forEach(d =>
    items.push({kind:'design', tone:'soon', label:'Review', title:`${d.title} is ready for review`, sub:`From ${member(d.owner)?.name || 'someone'}`, act:'open-design', id:d.id}));
  const submitted = state.ideas.filter(i => i.stage === 'submitted').length;
  if (oversight() && submitted) items.push({kind:'ideas', tone:'info', label:'Ideas', title:`${submitted} new idea${submitted === 1 ? '' : 's'} to review`, sub:'Submitted and waiting for a decision', act:'notif-ideas'});
  const reimb = access('budget') ? state.budget.reimbursements.filter(r => r.status === 'Requested').length : 0;
  if (reimb) items.push({kind:'budget', tone:'soon', label:'Budget', title:`${reimb} reimbursement${reimb === 1 ? '' : 's'} to approve`, sub:'Requested and waiting for the Treasurer', act:'notif-budget'});
  if (canApproveStartupDeletion()) state.startups.filter(s => s.deletion).forEach(s =>
    items.push({kind:'startup-deletion', tone:'over', label:'Approval', title:`Delete ${s.name}?`, sub:`Requested by ${member(s.deletion.by)?.name || 'a member'} · ${s.deletion.reason || 'no reason given'}`, id:s.id}));
  return items;
}
const updatesForMe = () => state.notifications.filter(n => n.recipients.includes(me().id) && (Date.now() - new Date(n.at)) < 14 * 864e5);
const seenKey = () => 'rocket-seen-' + me().id;
function lastSeen() { try { return +localStorage.getItem(seenKey()) || 0; } catch (e) { return 0; } }
function markSeen() { try { localStorage.setItem(seenKey(), String(Date.now())); } catch (e) {} }
const unreadCount = () => attentionItems().length + updatesForMe().filter(n => new Date(n.at) > lastSeen()).length;

/* ================= markdown (knowledge base) =================
   Escapes everything first, then adds a small safe subset: headings, bold, italic, code,
   lists, quotes, rules, links and images. Only http(s), mailto and relative links are allowed. */
function safeUrl(u, img) { return /^(https?:\/\/|mailto:|\/|#)/i.test(u) || (img && /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(u)); }
function mdInline(s) {
  return s
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, url) => safeUrl(url, true) ? `<img src="${url}" alt="${alt}" loading="lazy">` : m)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, url) => safeUrl(url) ? `<a href="${url}" target="_blank" rel="noopener noreferrer">${t}</a>` : m)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, '$1<em>$2</em>');
}
function mdToHtml(md) {
  const lines = esc(md || '').replace(/\r/g, '').split('\n'), out = [];
  let list = null, para = [];
  const flushPara = () => { if (para.length) { out.push(`<p>${para.map(mdInline).join('<br>')}</p>`); para = []; } };
  const flushList = () => { if (list) { out.push(`<${list.tag}>${list.items.map(i => `<li>${mdInline(i)}</li>`).join('')}</${list.tag}>`); list = null; } };
  for (const raw of lines) {
    const line = raw.trimEnd(); let m;
    if (!line.trim()) { flushPara(); flushList(); continue; }
    if ((m = line.match(/^(#{1,3})\s+(.*)$/))) { flushPara(); flushList(); out.push(`<h${m[1].length + 1}>${mdInline(m[2])}</h${m[1].length + 1}>`); continue; }
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) { flushPara(); flushList(); out.push('<hr>'); continue; }
    if ((m = line.match(/^&gt;\s?(.*)$/))) { flushPara(); flushList(); out.push(`<blockquote>${mdInline(m[1])}</blockquote>`); continue; }
    if ((m = line.match(/^\s*[-*]\s+(.*)$/)) || (m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
      const tag = /^\s*\d/.test(line) ? 'ol' : 'ul'; flushPara();
      if (!list || list.tag !== tag) { flushList(); list = {tag, items:[]}; }
      list.items.push(m[1]); continue;
    }
    flushList(); para.push(line);
  }
  flushPara(); flushList();
  return out.join('');
}

/* ================= calendar: everything with a date ================= */
const CAL_TYPES = [['meeting', 'Meetings'], ['event', 'Events'], ['task', 'Tasks & checklists'], ['idea', 'Idea next steps'], ['design', 'Design due']];
function calItems() {
  const f = filters.cal, meId = me().id, items = [];
  if (f.types.meeting) visibleMeetings().forEach(m => { if (f.mine && !recipients(m).includes(meId)) return;
    items.push({kind:'meeting', date:m.date, time:m.start, title:m.title, sub:`${fmtTime(m.start)}–${fmtTime(m.end)} · ${m.location}`, act:'open-meeting', id:m.id, done:meetingEnded(m)}); });
  if (f.types.event) state.events.forEach(e => { if (f.mine && !relevantEvent(e).length) return;
    items.push({kind:'event', date:e.date, title:e.name, sub:`${e.location || 'Location TBC'} · ${teamName(e.team)} team`, act:'open-event', id:e.id, done:daysFrom(e.date) < 0}); });
  deadlineItems().forEach(x => {
    const kind = x.src === 'idea' ? 'idea' : x.src === 'design' ? 'design' : 'task';
    if (!f.types[kind] || (f.mine && !x.owners.includes(meId))) return;
    const n = daysFrom(x.due);
    items.push({kind, date:x.due, title:x.title, sub:`${x.srcLabel} · ${x.related} · ${member(x.owner)?.name || 'Unassigned'}`, done:x.done, due:x.done ? 'done' : n < 0 ? 'over' : n <= 1 ? 'soon' : '',
      act:x.src === 'req' ? 'open-event' : x.src === 'idea' ? 'open-idea' : x.src === 'design' ? 'open-design' : 'go', id:x.src === 'req' ? x.eventId : x.src === 'task' ? 'deadlines' : x.id});
  });
  return items.sort((a, b) => (a.date + (a.time || '00:00')).localeCompare(b.date + (b.time || '00:00')));
}

/* ================= change history (demo mode records it here; live mode's database does it) ================= */
function recordChange(type, id, action, subject, changes = {}) {
  if (LIVE || !state) return;
  (state.changeLog ||= []).unshift({id:Date.now() + Math.random(), entity_type:type, entity_id:id, actor:me().id, action, subject:subject || '', changes, created_at:new Date().toISOString()});
  state.changeLog = state.changeLog.slice(0, 500);
}
// {field: [old, new]} for the fields that differ
function diffFields(before, after, keys) {
  const out = {};
  keys.forEach(k => { const a = before?.[k] ?? null, b = after?.[k] ?? null; if (JSON.stringify(a) !== JSON.stringify(b)) out[k] = [a, b]; });
  return out;
}
