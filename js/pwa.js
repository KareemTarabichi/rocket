
/* ================= PWA: install to home screen, welcome screen, push notifications ================= */
let swReg = null, installEvt = null, welcome = null;   // welcome = {step, platform}

const UA = navigator.userAgent;
const isIOS = () => /iphone|ipad|ipod/i.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isAndroid = () => /android/i.test(UA);
const detectPlatform = () => isIOS() ? 'ios' : isAndroid() ? 'android' : 'desktop';
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const pushConfigured = () => LIVE && !!CFG.vapidPublicKey;
const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const b64ToBytes = s => { const b = atob((s + '='.repeat((4 - s.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(b, c => c.charCodeAt(0)); };

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  if (!(location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) return;
  navigator.serviceWorker.register('/sw.js').then(r => { swReg = r; }).catch(() => {});
}
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; if (welcome) renderWelcome(); });
window.addEventListener('appinstalled', () => { installEvt = null; toast('Rocket is on your home screen'); if (welcome?.step === 'install') { welcome.step = 'notify'; renderWelcome(); } });

/* ---- push notifications ---- */
async function pushStatus() {
  if (!LIVE) return 'demo';
  if (!pushConfigured()) return 'not-configured';
  if (!pushSupported()) return isIOS() && !isStandalone() ? 'needs-install' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = swReg || await navigator.serviceWorker.getRegistration();
  const sub = reg && await reg.pushManager.getSubscription();
  return sub ? 'on' : 'off';
}
async function enablePush() {
  try {
    if (!pushConfigured() || !pushSupported()) return false;
    const perm = await Notification.requestPermission();   // must stay the first await: browsers need the tap
    if (perm !== 'granted') { toast('Notifications are blocked for Rocket', 'allow them in your browser or phone settings', true); return false; }
    const reg = swReg || await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription() || await reg.pushManager.subscribe({userVisibleOnly:true, applicationServerKey:b64ToBytes(CFG.vapidPublicKey)});
    const j = sub.toJSON();
    const {error} = await sb.rpc('register_push', {p_endpoint:j.endpoint, p_p256dh:j.keys.p256dh, p_auth:j.keys.auth, p_user_agent:UA.slice(0, 200)});
    if (error) throw error;
    fnApi('push', 'test').catch(() => {});
    toast('Notifications are on for this device', 'a test notification is on its way');
    return true;
  } catch (e) { toast('Couldn’t turn on notifications: ' + e.message, '', true); return false; }
}
async function disablePush(silent) {
  try {
    const reg = swReg || await navigator.serviceWorker?.getRegistration();
    const sub = reg && await reg.pushManager.getSubscription();
    if (sub) { if (sb) await sb.rpc('unregister_push', {p_endpoint:sub.endpoint}); await sub.unsubscribe(); }
    if (!silent) toast('Notifications are off for this device');
  } catch (e) { if (!silent) toast('Couldn’t turn notifications off: ' + e.message, '', true); }
}
// The "This device" block at the bottom of the notifications panel.
async function renderPushRow() {
  const st = await pushStatus(), el = $('#push-row'); if (!el) return;
  const row = (title, sub, actions, on) => `<div class="notif-sec">This device</div><div class="nitem"><span class="dot ${on ? '' : 'read'}"></span><div><div class="ttl">${title}</div>${sub ? `<div class="sb">${sub}</div>` : ''}</div><span></span>${actions ? `<div class="acts">${actions}</div>` : ''}</div>`;
  el.innerHTML = {
    demo: row('Phone notifications work on the live site', 'This demo has no server to send them.'),
    'not-configured': row('Phone notifications aren’t set up yet', isAdmin() ? 'Add the VAPID public key to config.js — see the README.' : 'An admin needs to finish setting them up.'),
    unsupported: row('This browser can’t show notifications', 'Try Chrome, Edge or Safari — or install Rocket to your home screen.'),
    'needs-install': row('On iPhone, add Rocket to your home screen first', 'Then open it from there and turn notifications on.', '<button type="button" class="btn sm" data-act="welcome-install">Show me how</button>'),
    denied: row('Notifications are blocked for Rocket', 'Allow them in your browser or phone settings, then come back.'),
    off: row('Get notified on this device', 'Meeting invites, work assigned to you, approvals, and a 9 AM summary of what’s due.', '<button type="button" class="btn sm btn-primary" data-act="push-on">Turn on notifications</button>'),
    on: row('Notifications are on for this device', '', '<button type="button" class="btn sm" data-act="push-test">Send a test</button><button type="button" class="btn sm btn-ghost" data-act="push-off">Turn off</button>', true),
  }[st] + (isStandalone() ? '' : `<div style="padding:4px 20px 12px"><button type="button" class="linkbtn" data-act="welcome-install">${ic('plus')} Add Rocket to your home screen</button></div>`);
}

/* ---- welcome screen for new members ---- */
const WELCOME_STEPS = ['hello', 'install', 'notify'];
const welcomeKey = () => 'rocket-welcome-done-' + (LIVE ? me().id : 'demo');
function maybeShowWelcome() {
  let done = false; try { done = !!localStorage.getItem(welcomeKey()); } catch (e) { done = true; }
  if (!done) showWelcome('hello');
}
function showWelcome(step = 'hello') { welcome = {step, platform:detectPlatform()}; renderWelcome(); }
function closeWelcome(markDone = true) {
  if (markDone) { try { localStorage.setItem(welcomeKey(), new Date().toISOString()); } catch (e) {} }
  welcome = null; $('#welcome').innerHTML = ''; document.body.classList.remove('welcome-open');
}
const STEP_ICON = {
  share:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3m0 0L8 7m4-4 4 4"/><path d="M7 10H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-1"/></svg>',
  addsq:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/></svg>',
  dots:'<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>',
  install:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M12 8v6m0 0-3-3m3 3 3-3M8 21h8"/></svg>',
};
function installSteps(p) {
  const s = (n, html) => `<li><span class="w-num">${n}</span><span>${html}</span></li>`;
  if (p === 'ios') return `<ol class="w-steps">
      ${s(1, 'Open <b>userocket.vercel.app</b> in <b>Safari</b>.')}
      ${s(2, `Tap <b>Share</b> <span class="w-ico">${STEP_ICON.share}</span> in the toolbar.`)}
      ${s(3, `Scroll down and tap <b>Add to Home Screen</b> <span class="w-ico">${STEP_ICON.addsq}</span>.`)}
      ${s(4, 'Tap <b>Add</b>, then open Rocket from your home screen.')}</ol>
    <p class="w-note">iPhone only shows notifications for apps on the home screen (iOS 16.4 or later).</p>`;
  if (p === 'android') return (installEvt && welcome.platform === 'android' ? `<button type="button" class="btn btn-primary w-big" data-act="pwa-install">${STEP_ICON.install}Install Rocket</button><p class="w-note">Or do it by hand:</p>` : '') + `<ol class="w-steps">
      ${s(1, 'Open <b>userocket.vercel.app</b> in <b>Chrome</b>.')}
      ${s(2, `Tap the menu <span class="w-ico">${STEP_ICON.dots}</span> at the top right.`)}
      ${s(3, 'Tap <b>Install app</b> (or <b>Add to Home screen</b>).')}
      ${s(4, 'Open Rocket from your home screen or app drawer.')}</ol>`;
  return (installEvt && welcome.platform === 'desktop' ? `<button type="button" class="btn btn-primary w-big" data-act="pwa-install">${STEP_ICON.install}Install Rocket on this computer</button><p class="w-note">Or do it by hand:</p>` : '') + `<ol class="w-steps">
      ${s(1, `In <b>Chrome</b> or <b>Edge</b>, click the install icon <span class="w-ico">${STEP_ICON.install}</span> at the right of the address bar.`)}
      ${s(2, 'On a Mac in <b>Safari</b>: <b>File → Add to Dock</b>.')}
      ${s(3, 'Rocket opens in its own window, with its icon in your dock or taskbar.')}</ol>`;
}
function renderWelcome() {
  if (!welcome || !state) return;
  const steps = WELCOME_STEPS.filter(s => s !== 'install' || !isStandalone());
  if (!steps.includes(welcome.step)) welcome.step = steps[Math.min(steps.length - 1, 1)];
  const i = steps.indexOf(welcome.step), last = i === steps.length - 1, first = me().name.split(' ')[0];
  let body = '';
  if (welcome.step === 'hello') body = `
    <h1 id="w-title">Welcome aboard, ${esc(first)}.</h1>
    <p class="w-lead">Rocket is where Launchpad runs — meetings, events, deadlines, ideas and startups in one place, shaped around your role as <b>${esc(roleLabel(state.role))}</b>.</p>
    <ul class="w-facts">
      <li>${ic('bell')}<span><b>The bell</b> lists what needs you right now.</span></li>
      <li>${ic('flag')}<span><b>Deadlines</b> only shows work you own.</span></li>
      <li>${ic('cal')}<span><b>Meetings</b> you’re invited to appear on their own${state.calendar?.connected ? ', with a Google Calendar invite' : ''}.</span></li>
    </ul>`;
  if (welcome.step === 'install') body = `
    <h1 id="w-title">Put Rocket on your home screen</h1>
    <p class="w-lead">It opens full-screen like an app — and on iPhone it’s the only way to get notifications.</p>
    <div class="seg w-seg" role="group" aria-label="Device">${[['ios','iPhone'], ['android','Android'], ['desktop','Computer']].map(([v, l]) => `<button type="button" data-act="welcome-platform" data-v="${v}" aria-pressed="${welcome.platform === v}">${l}</button>`).join('')}</div>
    ${installSteps(welcome.platform)}`;
  if (welcome.step === 'notify') body = `
    <h1 id="w-title">Turn on notifications</h1>
    <p class="w-lead">Get a nudge for meeting invites, work assigned to you and approvals — plus a 9 AM summary of what’s due.</p>
    <div id="w-push"></div>`;
  $('#welcome').innerHTML = `<div class="welcome" role="dialog" aria-modal="true" aria-labelledby="w-title">
    <div class="thermal"></div><div class="grain"></div>
    <div class="w-card">
      <div class="w-top"><span class="w-mark">${LOGO}</span><div class="w-dots" aria-label="Step ${i + 1} of ${steps.length}">${steps.map((s, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div><button type="button" class="linkbtn" data-act="welcome-skip">Skip</button></div>
      <div class="w-body">${body}</div>
      <div class="w-actions">${i > 0 ? '<button type="button" class="btn btn-ghost" data-act="welcome-back">Back</button>' : '<span></span>'}
        <button type="button" class="btn btn-primary" data-act="${last ? 'welcome-done' : 'welcome-next'}">${last ? 'Start using Rocket' : welcome.step === 'install' ? (isStandalone() ? 'Next' : 'I’ve added it') : 'Next'}</button></div>
    </div></div>`;
  document.body.classList.add('welcome-open');
  if (welcome.step === 'notify') renderWelcomePush();
}
async function renderWelcomePush() {
  const st = await pushStatus(), el = $('#w-push'); if (!el) return;
  el.innerHTML = {
    on: `<div class="w-ok">${ic('bell')}<span>Notifications are on for this device.</span></div>`,
    off: `<button type="button" class="btn btn-primary w-big" data-act="push-on">${ic('bell')}Turn on notifications</button>`,
    'needs-install': `<div class="w-note">First add Rocket to your home screen and open it from there. Then tap the bell → <b>Turn on notifications</b>.</div>`,
    denied: `<div class="w-note">Notifications are blocked. Allow them for Rocket in your browser or phone settings.</div>`,
    unsupported: `<div class="w-note">This browser can’t show notifications. You’ll still see everything under the bell.</div>`,
    'not-configured': `<div class="w-note">Notifications aren’t switched on for the club yet. You’ll still see everything under the bell.</div>`,
    demo: `<div class="w-note">In the live app this button turns on phone notifications. This demo has no server to send them.</div>`,
  }[st];
}
async function installNow() {
  if (!installEvt) return;
  installEvt.prompt();
  const {outcome} = await installEvt.userChoice.catch(() => ({outcome:'dismissed'}));
  installEvt = null;
  if (outcome === 'accepted' && welcome) { welcome.step = 'notify'; renderWelcome(); }
  else if (welcome) renderWelcome();
}
