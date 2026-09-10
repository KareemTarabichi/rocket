
/* ================= Pull to refresh: the Rocket launch =================
   Pull down at the top of any page on a phone. The Rocket mark rises out of the gap, growing and glowing
   with your pull; past the threshold it arms, and on release it accelerates up and off-screen with a
   cyan/amber exhaust trail while Rocket reloads, then drops back into place and the page settles.
   Everything is driven by the finger's distance until release — nothing is a pre-rendered video. */
const PTR = {start:null, active:false, busy:false, pull:0, armed:false, threshold:82, max:140};
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = ms => new Promise(r => setTimeout(r, ms));
// Animations pause while the app is in the background; never let the pull wait on one forever.
const done = (anim, ms) => Promise.race([anim.finished.catch(() => {}), wait(ms)]);
const MARK_SVG = '<svg class="ptr-mark" viewBox="0 0 28 28" aria-hidden="true"><path d="M14 5 21 21 14 17.5 7 21Z" fill="none" stroke="#4DD9E8" stroke-width="1.8" stroke-linejoin="round"/><path d="M14 17.5V23" stroke="#F5B942" stroke-width="1.8" stroke-linecap="round"/></svg>';

function ptrEls() {
  let el = document.getElementById('ptr');
  if (!el) {
    el = document.createElement('div'); el.id = 'ptr'; el.className = 'ptr'; el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `<div class="ptr-rocket"><span class="ptr-trail"></span><span class="ptr-halo"></span>${MARK_SVG}</div><span class="ptr-label"></span>`;
    document.body.appendChild(el);
  }
  return {el, rocket:el.querySelector('.ptr-rocket'), trail:el.querySelector('.ptr-trail'), label:el.querySelector('.ptr-label'), main:document.getElementById('main')};
}
// Top of the pull area: just under the phone's top bar.
const ptrTop = () => { const tb = document.getElementById('topbar'); const r = tb && tb.getBoundingClientRect(); return r && r.height ? r.bottom : 0; };
// Rubber band: the further you pull, the harder it gets (never past PTR.max).
const rubber = dy => PTR.max * (1 - Math.exp(-dy / 190));

function ptrAllowed(target) {
  if (!state || PTR.busy || !isM()) return false;
  if (document.body.classList.contains('is-login') || document.body.classList.contains('welcome-open')) return false;
  if (dlg().open || document.getElementById('confirm')?.open) return false;
  if ((window.scrollY || document.documentElement.scrollTop) > 0) return false;
  for (let n = target; n && n !== document.body; n = n.parentElement) {
    if (n.matches?.('input, textarea, select, [contenteditable="true"]')) return false;
    if (n.scrollTop > 0) return false;   // inside something that is itself scrolled
  }
  return true;
}

function ptrRender(pull) {
  const {el, rocket, trail, label, main} = ptrEls(), p = Math.min(pull / PTR.threshold, 1), top = ptrTop();
  el.style.setProperty('--g', p.toFixed(3));
  main.style.transform = `translate3d(0, ${pull.toFixed(1)}px, 0)`;
  // the mark rides in the middle of the revealed gap, rising slightly as it arms
  const y = top + pull / 2 - 22 - p * 4, s = 0.5 + 0.5 * p;
  rocket.style.opacity = Math.min(1, p * 1.5).toFixed(3);
  rocket.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0) scale(${s.toFixed(3)})`;
  trail.style.height = `${(4 + 20 * p).toFixed(1)}px`;
  trail.style.opacity = (p * 0.9).toFixed(3);
  const armed = pull >= PTR.threshold;
  if (armed !== PTR.armed) {
    PTR.armed = armed; el.classList.toggle('armed', armed);
    label.textContent = armed ? 'Release to launch' : '';
    if (armed && navigator.vibrate) navigator.vibrate(8);
  }
  label.style.transform = `translate3d(0, ${(top + pull - 26).toFixed(1)}px, 0)`;
}

function ptrReset() {
  const {el, rocket, trail, label, main} = ptrEls();
  rocket.getAnimations?.().forEach(a => a.cancel()); trail.getAnimations?.().forEach(a => a.cancel());
  main.style.transition = ''; main.style.transform = '';
  rocket.style.cssText = ''; trail.style.cssText = ''; label.textContent = ''; label.style.transform = '';
  el.classList.remove('armed', 'launching');
  Object.assign(PTR, {start:null, active:false, busy:false, pull:0, armed:false});
}

async function ptrSnapBack() {
  const {rocket, main} = ptrEls();
  PTR.busy = true;
  main.style.transition = 'transform .35s cubic-bezier(.2,.9,.3,1.2)'; main.style.transform = 'translate3d(0,0,0)';
  rocket.style.transition = 'transform .3s ease, opacity .25s ease'; rocket.style.opacity = '0';
  await wait(360); ptrReset();
}

async function ptrRefresh() {
  if (LIVE) { await reloadLive(); if (view === 'admin') { adminData.members = null; adminData.calendar = null; render(); } }
  else { await wait(450); render(); }
}

async function ptrLaunch() {
  const {el, rocket, trail, label, main} = ptrEls();
  PTR.busy = true; el.classList.add('launching'); label.textContent = '';
  const hold = Math.round(PTR.threshold * 0.7), top = ptrTop();
  main.style.transition = 'transform .32s cubic-bezier(.2,.8,.2,1)'; main.style.transform = `translate3d(0, ${hold}px, 0)`;
  const from = rocket.style.transform || `translate3d(0, ${top + PTR.pull / 2 - 26}px, 0) scale(1)`;
  const refresh = Promise.race([ptrRefresh().catch(e => toast('Couldn’t refresh: ' + e.message, '', true)), wait(8000)]);
  if (reducedMotion()) {
    rocket.animate([{opacity:1}, {opacity:0}], {duration:250, fill:'forwards'});
    await Promise.all([refresh, wait(250)]);
  } else {
    // a beat of thrust, then accelerate up and out past the top of the screen
    const flight = rocket.animate([
      {transform:from, offset:0},
      {transform:from.replace(/scale\([^)]+\)/, 'scale(1.06)').replace(/translate3d\(0, ([\d.-]+)px/, (m, v) => `translate3d(0, ${+v + 6}px`), offset:0.16},
      {transform:`translate3d(0, ${-(window.innerHeight * 0.35)}px, 0) scale(0.96)`, offset:0.7},
      {transform:`translate3d(0, ${-(window.innerHeight + 120)}px, 0) scale(0.9)`, offset:1},
    ], {duration:720, easing:'cubic-bezier(.5,0,.75,.2)', fill:'forwards'});
    trail.animate([
      {height:'24px', opacity:.9, offset:0},
      {height:'34px', opacity:1, offset:0.16},
      {height:'150px', opacity:.85, offset:0.7},
      {height:'220px', opacity:0, offset:1},
    ], {duration:720, easing:'cubic-bezier(.5,0,.75,.2)', fill:'forwards'});
    await Promise.all([refresh, done(flight, 900)]);
  }
  // settle: the mark drops back into the gap, then the page closes over it
  rocket.getAnimations().forEach(a => a.cancel()); trail.getAnimations().forEach(a => a.cancel());
  el.classList.remove('launching', 'armed'); el.style.setProperty('--g', '0.35');
  trail.style.height = '4px'; trail.style.opacity = '0';
  const rest = `translate3d(0, ${top + hold / 2 - 22}px, 0) scale(0.72)`;
  if (!reducedMotion()) await done(rocket.animate([
    {transform:`translate3d(0, ${top - 50}px, 0) scale(0.72)`, opacity:0},
    {transform:rest, opacity:1},
  ], {duration:340, easing:'cubic-bezier(.2,.9,.3,1.25)', fill:'forwards'}), 500);
  rocket.style.transform = rest; rocket.style.opacity = '1';
  await wait(120);
  main.style.transition = 'transform .38s cubic-bezier(.2,.8,.2,1)'; main.style.transform = 'translate3d(0,0,0)';
  rocket.getAnimations().forEach(a => a.cancel());
  rocket.style.transition = 'opacity .28s ease, transform .38s cubic-bezier(.2,.8,.2,1)';
  rocket.style.opacity = '0'; rocket.style.transform = `translate3d(0, ${top - 10}px, 0) scale(0.6)`;
  await wait(400); ptrReset();
}

if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
  document.addEventListener('touchstart', e => {
    if (e.touches.length !== 1 || !ptrAllowed(e.target)) { PTR.start = null; return; }
    PTR.start = {x:e.touches[0].clientX, y:e.touches[0].clientY}; PTR.active = false;
  }, {passive:true});
  document.addEventListener('touchmove', e => {
    if (!PTR.start || PTR.busy) return;
    const dx = e.touches[0].clientX - PTR.start.x, dy = e.touches[0].clientY - PTR.start.y;
    if (!PTR.active) {
      if (dy > 8 && dy > Math.abs(dx) * 1.3 && (window.scrollY || 0) <= 0) { PTR.active = true; ptrEls().main.style.transition = 'none'; }
      else if (Math.abs(dx) > 10 || dy < -4) { PTR.start = null; return; }
      else return;
    }
    e.preventDefault();                       // we're handling this pull, not the browser
    PTR.pull = rubber(Math.max(0, dy - 8));
    ptrRender(PTR.pull);
  }, {passive:false});
  const end = () => {
    if (!PTR.start) return;
    const wasActive = PTR.active; PTR.start = null;
    if (!wasActive || PTR.busy) return;
    if (PTR.pull >= PTR.threshold) ptrLaunch(); else ptrSnapBack();
  };
  document.addEventListener('touchend', end, {passive:true});
  document.addEventListener('touchcancel', end, {passive:true});
}
