/**
 * Rocket × Google Forms — The Venture Hour sign-up form.
 *
 * Paste this into the sign-up Form's Apps Script editor (Form → ⋮ → Apps Script), signed in as the club's
 * Google account. It does three things:
 *   1. On every form response, sends it to Rocket, which books the student into the earliest open slot
 *      (first come, first served), or waitlists / blocks them. The student gets an email with the outcome.
 *   2. Every hour, asks Rocket for post-meeting surveys that are due and emails them to the students.
 *   3. If Rocket can't be reached, keeps the response and retries it on the next hourly run.
 *
 * Setup (once):
 *   a. Project Settings (⚙) → Script properties → add VENTURE_SECRET with the same value you set in Supabase
 *      (supabase secrets set VENTURE_SECRET=…).
 *   b. Run the `setup` function once and accept the permissions. That installs both triggers.
 *   c. Send a test response to the form and check Rocket → Programmes → The Venture Hour → Sign-ups.
 *
 * The form needs these questions (the titles just have to contain the word in quotes):
 *   "name"   — Full name                         (short answer, required)
 *   "email"  — AUS email                         (short answer, required)  or turn on "Collect email addresses"
 *   "major"  — Major                             (short answer)
 *   "year"   — Year                              (dropdown: Freshman, Sophomore, Junior, Senior, Graduate)
 *   "topic" or "discuss" — What do you want to discuss?  (short answer / paragraph, required)
 */
const ROCKET_URL = 'https://ptcsxotsucwaxqfrdlkd.supabase.co/functions/v1/venture-hour';
const SENDER_NAME = 'AUS Launchpad';

function onFormSubmit(e) {
  const payload = fromResponse(e.response);
  let res;
  try { res = callRocket(payload); }
  catch (err) { queue(payload); console.error('Rocket unreachable, queued for retry: ' + err); return; }
  reply(payload.email, res);
}

// Hourly: retry anything Rocket missed, then send the surveys that are due.
function hourly() {
  const pending = queued();
  PropertiesService.getScriptProperties().deleteProperty('PENDING');
  pending.forEach(p => { try { reply(p.email, callRocket(p)); } catch (err) { queue(p); } });
  const res = callRocket({ action: 'due-surveys' });
  (res.emails || []).forEach(m => MailApp.sendEmail({ to: m.to, subject: m.subject, body: m.body, name: SENDER_NAME }));
}

function setup() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('onFormSubmit').forForm(FormApp.getActiveForm()).onFormSubmit().create();
  ScriptApp.newTrigger('hourly').timeBased().everyHours(1).create();
  const ok = callRocket({ action: 'ping' });
  console.log(ok.ok ? 'Connected to Rocket. Triggers installed.' : 'Triggers installed, but Rocket said: ' + JSON.stringify(ok));
}

// ── helpers ──
function fromResponse(r) {
  const answers = r.getItemResponses().map(ir => ({ title: ir.getItem().getTitle().toLowerCase(), value: String(ir.getResponse() || '').trim() }));
  const pick = words => (answers.find(a => words.some(w => a.title.indexOf(w) >= 0)) || { value: '' }).value;
  const major = pick(['major']), year = pick(['year']);
  return {
    action: 'intake',
    response_id: r.getId(),
    submitted_at: r.getTimestamp().toISOString(),   // the first-come-first-served order
    name: pick(['name']),
    email: (r.getRespondentEmail() || pick(['email'])).toLowerCase(),
    major: major,
    year: year === major ? '' : year,
    topic: pick(['topic', 'discuss']),
  };
}
function callRocket(payload) {
  const secret = PropertiesService.getScriptProperties().getProperty('VENTURE_SECRET');
  if (!secret) throw new Error('Add VENTURE_SECRET under Project Settings → Script properties.');
  const res = UrlFetchApp.fetch(ROCKET_URL, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'x-venture-secret': secret }, payload: JSON.stringify(payload),
  });
  const body = JSON.parse(res.getContentText() || '{}');
  if (res.getResponseCode() >= 500 || res.getResponseCode() === 401) throw new Error(body.error || 'HTTP ' + res.getResponseCode());
  return body;
}
function reply(to, res) {
  if (res && res.email && to) MailApp.sendEmail({ to: to, subject: res.email.subject, body: res.email.body, name: SENDER_NAME });
  if (res && res.error) console.error('Rocket: ' + res.error);
}
function queued() { return JSON.parse(PropertiesService.getScriptProperties().getProperty('PENDING') || '[]'); }
function queue(p) { const q = queued(); q.push(p); PropertiesService.getScriptProperties().setProperty('PENDING', JSON.stringify(q.slice(-200))); }
