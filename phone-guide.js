/* First-time help, for each person on each phone: a hands-on tour (it points, you tap: your first real expense), a "Getting started" checklist on Home
   that ticks itself off as things get done, and one-time tips at the top of screens. Settings → Help and tour replays it.
   Progress is kept on this phone per person (localStorage rp.guide.<person id>); checklist items that can be read from
   the data (people, accounts, entries, PINs) are worked out from it, so they are right on any phone. */
(function () {
'use strict';
const App = window.App;
const esc = App.esc;

/* ---------- this person's progress ---------- */
const key = () => 'rp.guide.' + ((App.me() || {}).id || 'x');
const load = () => { try { return JSON.parse(localStorage.getItem(key()) || '{}') || {}; } catch (e) { return {}; } };
const save = st => { try { localStorage.setItem(key(), JSON.stringify(st)); } catch (e) { /* storage blocked: shown again next time */ } };
const mark = id => { const st = load(); if (st[id]) return; st[id] = Date.now(); save(st); };

/* ---------- one-time tips: App.guide.tip(id, text) -> html, or '' once dismissed ---------- */
/* A screen's tip is no longer a bar at the top (it pushed everything down): the screen gets a small i next to the
   photo, and the i opens "About <screen>" with the tip as a few short points. A dot on the i until it is read. */
const TIPS = {};
const tip = (id, text) => { TIPS[id] = text; return '<i hidden data-tip="' + esc(id) + '"></i>'; };
App.onScreen = el => {
  const m = el.querySelector('[data-tip]'), topEl = el.querySelector('.ph-top');
  if (!m || !topEl || topEl.querySelector('[data-info]')) return;
  const id = m.dataset.tip, av = topEl.querySelector('[data-avatar]');
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'ph-ib ph-info' + (load()['tip:' + id] ? '' : ' new'); b.dataset.info = id;
  b.setAttribute('aria-label', 'About this screen'); b.textContent = 'i';
  if (av) av.before(b); else topEl.appendChild(b);
};
document.addEventListener('click', e => {
  const b = e.target.closest('[data-info]'); if (!b) return;
  const id = b.dataset.info, text = TIPS[id] || '';
  const points = text.split(/(?<=[.!?])\s+(?=[A-Z“"<])/).filter(Boolean);
  const name = (document.title || '').split(' · ')[0] || 'this screen';
  b.classList.add('on'); b.classList.remove('new'); mark('tip:' + id);
  App.bsheet({ title: 'About ' + name, cls: 'qa about-sheet', focus: false, onClose: () => b.classList.remove('on'),
    body: '<ul class="ab-list">' + points.map(p => '<li>' + p + '</li>').join('') + '</ul>' +
      '<div class="qa-foot"><button type="button" class="btn primary" data-bs-close>Got it</button></div>' });
});
document.addEventListener('click', e => {
  const b = e.target.closest('[data-gtip] .gd-ok'); if (!b) return;
  const bar = b.closest('[data-gtip]'); mark('tip:' + bar.dataset.gtip); bar.remove();
});

/* ---------- the hands-on walk: it points at one real thing at a time and waits for you to do it ----------
   An overlay in the browser's top layer (a manual popover, so it sits above bottom sheets without blocking them) dims
   everything except the highlighted thing; taps there go through to the app, taps elsewhere only nudge the bubble.
   A step: { sel (CSS, found again every frame), title, text, wait: 'tap' | 'next' | function (step) -> true when done,
   then (ms to wait once done), finger (show the tapping finger), skipIfMissing (ms), need (function: what this step
   needs on screen, e.g. the add sheet) + backTo (step to return to when it is gone, e.g. "Tap +") }.
   Next only shows on 'next' steps: every other step waits for the person to do the thing. On a 'next' step the
   highlighted thing is only shown, not tappable (a tap there would open something behind the bubble).
   The walk steps aside (paused) while something it did not ask for is on top: another sheet or pop-up (e.g. a new
   category's name) or the phone keyboard. It comes back when that is gone. */
const firstName = () => { const p = App.me(); return p ? p.name.trim().split(/\s+/)[0] : ''; };
const FINGER = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V10l.5-1a1.5 1.5 0 0 1 2.7 1.2l-.2.4.4-.6a1.5 1.5 0 0 1 2.5 1.6l-.2.4a1.4 1.4 0 0 1 2.3 1.5L17.6 18a5 5 0 0 1-4.5 3H12a5 5 0 0 1-4.2-2.3L5.2 14.6a1.4 1.4 0 0 1 2.2-1.8L9 14.5"/></svg>';
let walking = null;
const sheetOpen = () => !!document.querySelector('dialog.bsheet[open]:not([data-closing])');
const addOpen = () => !!document.querySelector('dialog.qa3[open]:not([data-closing])');          // the add / edit sheet itself
const amountTyped = () => { const b = document.querySelector('dialog[open]:not([data-closing]) [data-amtbox]'); return !!b && !b.classList.contains('empty'); };
let lastSaved = null, savedAt = 0;

function walk(steps, done) {
  if (walking) return;
  const ov = document.createElement('div');
  ov.className = 'gw';
  const POP = typeof ov.showPopover === 'function';
  if (POP) ov.setAttribute('popover', 'manual');
  ov.innerHTML = '<div class="gw-b gw-t"></div><div class="gw-b gw-l"></div><div class="gw-b gw-r"></div><div class="gw-b gw-d"></div><div class="gw-full"></div>' +
    '<div class="gw-hole"></div><div class="gw-ring"></div><div class="gw-ring two"></div><div class="gw-finger">' + FINGER + '</div>' +
    '<div class="gw-bub" role="dialog" aria-live="polite" aria-label="Guide"><span class="gw-ar"></span><div class="gw-step"></div><h3></h3><p></p>' +
    '<div class="gw-btns"><button type="button" class="gw-skip">Skip</button><span class="gw-dots"></span><button type="button" class="btn primary gw-next">Next</button></div></div><div class="gw-conf"></div>';
  document.body.appendChild(ov);
  const $ = s => ov.querySelector(s);
  const bub = $('.gw-bub'), next = $('.gw-next');
  let i = -1, raf = 0, target = null, poll = 0, since = 0, cleanup = [], frontedFor = null, waiting = false;
  const front = () => { if (POP) { try { if (ov.matches(':popover-open')) ov.hidePopover(); ov.showPopover(); } catch (e) { /* not shown: fine */ } } };
  const stop = () => {
    walking = null;
    cancelAnimationFrame(raf); clearInterval(poll); cleanup.forEach(f => f()); cleanup = [];
    if (POP) { try { ov.hidePopover(); } catch (e) { /* ignore */ } }
    ov.remove();
  };
  walking = { stop, skip: () => finish('skipped') };
  const finish = how => { stop(); if (done) done(how); };

  /* every frame: follow the target (sheets slide, pages scroll) */
  function frame() {
    const s = steps[i];
    target = s && s.sel ? document.querySelector(s.sel) : null;
    /* a sheet or pop-up on top that the step is not about, or the keyboard: step aside */
    const modals = [...document.querySelectorAll('dialog[open]:not([data-closing])')].filter(d => !d.classList.contains('docked'));
    const topm = modals[modals.length - 1] || null, mine = !!(topm && target && topm.contains(target));
    const kb = document.documentElement.classList.contains('kb') && !(target && target.contains(document.activeElement));
    ov.classList.toggle('paused', !!(topm && !mine) || kb);
    if (mine && frontedFor !== topm) { frontedFor = topm; front(); }      // the step is inside a sheet: sit above it
    if (!topm) frontedFor = null;
    ov.classList.toggle('waiting', waiting);
    const r = target && target.getBoundingClientRect();
    const show = !!(r && r.width && r.height);
    ov.classList.toggle('center', !show);
    if (show) {
      const pad = s.pad == null ? 6 : s.pad, x = r.left - pad, y = r.top - pad, w = r.width + pad * 2, h = r.height + pad * 2;
      const round = w < 72 && Math.abs(w - h) < 14;
      $('.gw-t').style.cssText = 'left:0;top:0;right:0;height:' + Math.max(0, y) + 'px';
      $('.gw-d').style.cssText = 'left:0;right:0;bottom:0;top:' + (y + h) + 'px';
      $('.gw-l').style.cssText = 'left:0;top:' + y + 'px;height:' + h + 'px;width:' + Math.max(0, x) + 'px';
      $('.gw-r').style.cssText = 'right:0;top:' + y + 'px;height:' + h + 'px;left:' + (x + w) + 'px';
      const ring = 'left:' + x + 'px;top:' + y + 'px;width:' + w + 'px;height:' + h + 'px;border-radius:' + (round ? '50%' : '18px');
      $('.gw-ring').style.cssText = ring; $('.gw-ring.two').style.cssText = ring;
      $('.gw-hole').style.cssText = ring + (s.wait === 'next' || s.block ? '' : ';display:none');
      const f = $('.gw-finger');
      f.style.cssText = s.finger ? 'left:' + (x + w / 2 - 6) + 'px;top:' + (y + h / 2 + 2) + 'px' : 'display:none';
      const bh = bub.offsetHeight, below = y + h / 2 < innerHeight * 0.5;
      let top = below ? y + h + 14 : y - bh - 14;
      top = Math.max(12, Math.min(innerHeight - bh - 12, top));
      bub.style.top = top + 'px'; bub.style.bottom = '';
      const ar = $('.gw-ar'), bx = bub.getBoundingClientRect().left;
      ar.style.display = ''; ar.style.left = Math.max(14, Math.min(bub.offsetWidth - 28, x + w / 2 - bx - 7)) + 'px';
      ar.classList.toggle('up', below);
    } else {
      bub.style.top = ''; $('.gw-ar').style.display = 'none'; $('.gw-finger').style.display = 'none';
    }
    raf = requestAnimationFrame(frame);
  }

  function go(k) {
    clearInterval(poll); cleanup.forEach(f => f()); cleanup = [];
    i = k;
    if (i >= steps.length) return finish('done');
    waiting = false;
    const s = steps[i];
    if (s.enter) s.enter();
    bub.classList.remove('in'); void bub.offsetWidth; bub.classList.add('in');
    $('.gw-step').textContent = s.step || '';
    $('h3').textContent = typeof s.title === 'function' ? s.title() : s.title;
    $('p').innerHTML = typeof s.text === 'function' ? s.text() : s.text;
    $('.gw-dots').innerHTML = steps.filter(x => x.dot).map((x, j) => '<i' + (steps.indexOf(x) <= i ? ' class="on"' : '') + '></i>').join('');
    next.hidden = s.wait !== 'next';
    next.textContent = s.nextLabel || 'Next';
    $('.gw-skip').textContent = (typeof s.skipLabel === 'function' ? s.skipLabel() : s.skipLabel) || 'Skip';
    $('.gw-skip').hidden = !!s.noSkip;
    front();
    since = Date.now(); s.at = since; s.lost = 0;
    const done = () => { clearInterval(poll); waiting = true; setTimeout(() => { if (walking) go(i + 1); }, s.then || 250); };
    if (s.wait === 'tap') {
      const h = e => { const t = document.querySelector(s.sel); if (t && t.contains(e.target)) { document.removeEventListener('click', h, true); done(); } };
      document.addEventListener('click', h, true);
      cleanup.push(() => document.removeEventListener('click', h, true));
    }
    poll = setInterval(() => {
      if (typeof s.wait === 'function' && s.wait(s)) return done();
      if (s.need && !s.need()) {                       // e.g. the add sheet was closed: back to the step that opens it
        s.lost = s.lost || Date.now();
        if (Date.now() - s.lost > 900) { clearInterval(poll); return go(s.backTo || 0); }
        return;
      }
      s.lost = 0;
      const found = !s.sel || document.querySelector(s.sel);
      if (!found && s.skipIfMissing && Date.now() - since > s.skipIfMissing) { clearInterval(poll); return go(i + 1); }
    }, 220);
  }
  next.onclick = () => { const s = steps[i]; if (s && s.onNext) s.onNext(); go(i + 1); };
  $('.gw-skip').onclick = async () => { const s = steps[i]; if (s && s.onSkip) { await s.onSkip(); return go(i + 1); } finish('skipped'); };
  ov.querySelectorAll('.gw-b, .gw-full, .gw-hole').forEach(b => b.addEventListener('click', () => { bub.classList.remove('nudge'); void bub.offsetWidth; bub.classList.add('nudge'); }));
  if (POP) ov.showPopover();
  raf = requestAnimationFrame(frame);
  go(0);
  return walking;
}

/* a small burst of colour from the middle of the screen */
function confetti() {
  const c = document.createElement('div');
  c.className = 'gw-burst';
  const cols = ['#2dd4bf', '#5ee0a8', '#f0997b', '#e0a24f', '#ed93b1', '#4e9fd1'];
  c.innerHTML = Array.from({ length: 28 }, (_, k) => '<i style="background:' + cols[k % cols.length] + ';--x:' + (Math.cos(k * 2.4) * (90 + (k % 5) * 22)).toFixed(0) + 'px;--y:' +
    (Math.sin(k * 1.7) * 120 - 90).toFixed(0) + 'px;--r:' + (k * 47 % 360) + 'deg;animation-delay:' + (k % 6) * 25 + 'ms"></i>').join('');
  if (typeof c.showPopover === 'function') c.setAttribute('popover', 'manual');
  document.body.appendChild(c);
  if (c.showPopover) { try { c.showPopover(); } catch (e) { /* ignore */ } }
  setTimeout(() => c.remove(), 1600);
}

/* the first walk: add a real first expense, see what changed, find it again in Activity */
const firstWalk = () => [
  { title: () => 'Hi' + (firstName() ? ' ' + firstName() : '') + '!', text: "Let's add your first expense together. <b>You</b> do the tapping; I'll point the way. It takes about a minute.",
    wait: 'next', nextLabel: "Let's go", skipLabel: 'Not now' },
  { sel: '[data-bnav-add]', dot: 1, step: 'Step 1 of 6', title: 'Tap +', text: 'This is where everything you spend or receive goes in.', wait: 'tap', finger: 1, then: 480,
    enter: () => { if (!/^#?\/?(home)?$/.test(location.hash.split('?')[0])) location.hash = '#/home'; } },
  { sel: 'dialog[open]:not([data-closing]) [data-addtype="expense"]', dot: 1, step: 'Step 2 of 6', title: 'Pick Expense', text: 'Money you spent. Income, savings and the rest are here too.',
    wait: () => addOpen(), finger: 1, then: 500, backTo: 1, skipIfMissing: 3000 },
  { sel: 'dialog[open]:not([data-closing]) [data-keys]', dot: 1, step: 'Step 3 of 6', title: 'Type what you spent', text: 'Use these keys. For example <b>120</b> for vegetables.',
    wait: () => amountTyped() && Date.now() - (window.__gwKey || 0) > 1300, pad: 4, need: addOpen, backTo: 1 },
  { sel: 'dialog[open]:not([data-closing]) [data-cats] .qa-grid', dot: 1, step: 'Step 4 of 6', title: 'What was it for?', text: 'Tap a category.',
    wait: () => !!document.querySelector('dialog[open]:not([data-closing]) [data-cats] [aria-pressed="true"]'), finger: 1, then: 500, need: addOpen, backTo: 1, skipIfMissing: 4000 },
  { sel: 'dialog[open]:not([data-closing]) [data-sum]', step: 'Good to know', title: 'The rest is filled in for you', text: 'How you paid, the date, who it was for and who paid. Tap any of these to change it.',
    wait: 'next', nextLabel: 'Got it', need: addOpen, backTo: 1 },
  { sel: 'dialog[open]:not([data-closing]) [data-save]', dot: 1, step: 'Step 5 of 6', title: 'Save it', text: 'It goes straight into the shared ledger.', wait: s => savedAt > s.at, need: addOpen, backTo: 1, finger: 1, then: 450 },
  { title: 'Nicely done!', text: () => (lastSaved ? '<b>' + App.inr(lastSaved.amount) + ' ' + esc(lastSaved.category || '') + '</b> is saved. It is a real entry: keep it, or undo it if you were only practising.' : 'Your first entry is saved.'),
    wait: 'next', nextLabel: 'Keep it', skipLabel: () => (lastSaved ? 'Undo it' : 'Skip'), enter: confetti,
    onSkip: async () => { if (lastSaved) { try { await App.api.del('/api/ledger/' + lastSaved.id); App.toast('Removed'); App.refresh(); } catch (e) { App.fail(e); } lastSaved = null; } } },
  { sel: '.hm-safe', dot: 1, step: 'Step 5 of 5', title: 'See what changed', text: 'Safe to spend now counts what you just added. Tap it to see how it is worked out.', wait: 'tap', finger: 1, then: 480, skipIfMissing: 5000,
    enter: () => { if (!/^#?\/?(home)?$/.test(location.hash.split('?')[0])) location.hash = '#/home'; window.scrollTo(0, 0); } },
  { sel: 'dialog.bsheet[open]:not(.docked):not([data-closing])', step: 'Every rupee, line by line', title: 'Money in, minus what is already due', text: 'Close it (✕ at the top) when you have had a look.', wait: () => !sheetOpen(), pad: 0, skipIfMissing: 3000 },
  { sel: '.bnav a[href="#/ledger"]', step: 'Last one', title: 'Find it again', text: 'Activity has everything both of you added. Tap it.', wait: 'tap', finger: 1, then: 600 },
  { sel: '.ph-ledger [data-eid]', title: () => (lastSaved ? "That's your entry" : 'Everything in one list'), text: 'Tap any row later to change or delete it. You are all set: the <b>Getting started</b> card on Home has a few more things to try.',
    wait: 'next', nextLabel: 'Finish', noSkip: 1, skipIfMissing: 4000, pad: 4 },
];
document.addEventListener('click', e => { if (e.target.closest('[data-keys] [data-key]')) window.__gwKey = Date.now(); }, true);
const startTour = () => {
  window.scrollTo(0, 0);
  walk(firstWalk(), how => {
    if (how === 'done') { mark('walk'); confetti(); App.toast('Tour done. Help and tour in Settings plays it again.'); }
    else { const s = load(); s.walkSkipped = Date.now(); save(s); App.toast('No problem. Settings → Help and tour starts it any time.'); }
    App.refresh();
  });
};

/* start on Home the first time this person opens the app (after the opening screen, sign-in and any sheet) */
function maybeStart(tries) {
  const st = load();
  if (st.walk || st.walkSkipped || walking) return;
  if (!/^(home)?$/.test(location.hash.replace(/^#\/?/, '').split('?')[0])) return;    // only on Home
  const busy = document.querySelector('#rpSplash:not(.out), .rp-lock, dialog[open]:not([data-closing])');
  if (busy) { if ((tries || 0) < 40) setTimeout(() => maybeStart((tries || 0) + 1), 500); return; }
  startTour();
}

/* Back while the tour runs (and no sheet is open): stop the tour. With a sheet open, Back closes the sheet and the
   tour goes back to "Tap +". */
App.backHooks.push(() => { if (walking && !document.querySelector('dialog[open]:not([data-closing])')) { walking.skip(); return true; } return false; });

/* ---------- "Getting started" on Home ---------- */
const adults = p => p.active !== 0 && (/^(self|spouse|parent)$/i.test(p.relation || '') || p.earns);
async function items(ents) {
  const st = load(), me = App.me();
  const people = (App.opt.people || []).filter(p => p.active !== 0), accts = (App.opt.accounts || []).filter(a => a.active !== 0);
  const [rec, pins] = await Promise.all([App.api.get('/api/setup/recurring').catch(() => null),
    App.settingsTabs.some(t => t.id === 'pins') ? App.api.get('/api/auth/pins').catch(() => null) : null]);
  const recs = rec ? rec.rows.filter(r => r.active !== 0) : [];
  const household = people.length > 0 && accts.length > 0 && recs.length > 0;
  const needPin = pins ? pins.people.filter(p => adults(p) && !p.has_pin) : [];
  const list = [
    { id: 'household', label: 'Set up the household', sub: 'Family, accounts, salary and regular bills', done: household, go: () => { location.hash = '#/welcome'; } },
    { id: 'tour', label: 'Take the hands-on tour', sub: 'Add an expense with the app pointing the way', done: !!st.walk, go: startTour },
    { id: 'added', label: 'Add your first expense', sub: 'Tap +, type the amount, pick a category, Save', done: !!st.added || (!!me && ents.some(e => e.person_id === me.id && e.source !== 'recurring')), go: () => App.quickAdd() },
    { id: 'safe', label: 'See how safe to spend is worked out', sub: 'Tap the big number at the top of Home', done: !!st.safe, go: () => { window.scrollTo(0, 0); const h = document.querySelector('[data-safe]'); if (h) h.click(); } },
    { id: 'ahead', label: 'Look at the next 12 months', sub: 'Where bank and cash are heading', done: !!st.ahead, go: () => { location.hash = '#/ahead'; } },
  ];
  if (pins && people.length > 1) list.push({ id: 'pins', label: needPin.length ? 'Give ' + needPin.map(p => p.name).join(' and ') + ' a PIN' : 'Everyone has a PIN',
    sub: 'So they can sign in on their own phone', done: !needPin.length, go: () => { location.hash = '#/settings?s=pins'; } });
  if (household) list.push({ id: 'backup', label: 'Save a backup', sub: 'One file with everything, kept in Downloads', done: !!st.backup, go: () => { location.hash = '#/settings?s=backup'; } });
  return list;
}
const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12.5 4 4 8-9"/></svg>';
async function fillCard(host, ents) {
  if (!host) return;
  const st = load();
  if (st.hideCard) { host.innerHTML = ''; return; }
  const list = await items(ents);
  const n = list.filter(x => x.done).length;
  if (n === list.length) { host.innerHTML = ''; return; }
  host.innerHTML = '<article class="ph-card gd-card"><div class="hd"><div><h3>Getting started</h3><small>' + n + ' of ' + list.length + ' done</small></div>' +
    '<button type="button" class="gd-hide" data-ghide>Hide</button></div>' +
    '<div class="ph-bar good"><i style="width:' + (n / list.length * 100).toFixed(0) + '%"></i></div>' +
    '<div class="gd-items">' + list.map((x, k) => '<button type="button" class="gd-item' + (x.done ? ' done' : '') + '" data-gi="' + k + '"' + (x.done ? ' aria-label="' + esc(x.label) + ', done"' : '') + '>' +
      '<span class="gd-c">' + (x.done ? CHECK : '') + '</span><span class="nm"><b>' + esc(x.label) + '</b>' + (x.done ? '' : '<span>' + esc(x.sub) + '</span>') + '</span>' +
      (x.done ? '' : '<span class="go" aria-hidden="true">›</span>') + '</button>').join('') + '</div></article>';
  host.onclick = e => {
    if (e.target.closest('[data-ghide]')) { const s = load(); s.hideCard = Date.now(); save(s); host.innerHTML = ''; App.toast('Hidden. Settings → Help and tour brings it back.'); return; }
    const b = e.target.closest('[data-gi]'); if (!b) return;
    const x = list[Number(b.dataset.gi)]; if (x && !x.done) x.go();
  };
}

/* ---------- Settings → Help and tour ---------- */
function helpScreen(el, top) {
  el.innerHTML = top +
    '<p class="pss-lead">The step-by-step help, for whoever is using this phone. Each person has their own.</p>' +
    '<div class="ph-card ph-list">' +
      '<button type="button" class="ph-row" data-h="tour"><span class="ic" style="--h:var(--accent)">' + App.ico('target') + '</span><span class="nm"><b>Take the hands-on tour</b><span>Add an expense with the app pointing the way</span></span><span class="go">›</span></button>' +
      '<button type="button" class="ph-row" data-h="card"><span class="ic" style="--h:#3fb58a">' + App.ico('check') + '</span><span class="nm"><b>Show "Getting started" on Home</b><span>The checklist of first things to do</span></span><span class="go">›</span></button>' +
      '<button type="button" class="ph-row" data-h="tips"><span class="ic" style="--h:#e0a24f">' + App.ico('bulb') + '</span><span class="nm"><b>Show the screen tips again</b><span>The short notes at the top of each screen</span></span><span class="go">›</span></button>' +
      '<button type="button" class="ph-row" data-h="setup"><span class="ic" style="--h:#c77aa8">' + App.ico('home') + '</span><span class="nm"><b>Household setup guide</b><span>Family, accounts, income, bills, budgets, loans, savings</span></span><span class="go">›</span></button>' +
    '</div>' +
    '<p class="hint" style="text-align:center">Adding someone new to the family? Give them a PIN in Settings → PINs. The first time they sign in on their phone, the tour and checklist start for them.</p>';
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-h]'); if (!b) return;
    const s = load(), h = b.dataset.h;
    if (h === 'tour') { location.hash = '#/home'; setTimeout(startTour, 500); }
    if (h === 'card') { delete s.hideCard; save(s); location.hash = '#/home'; App.toast('Getting started is back on Home'); }
    if (h === 'tips') { Object.keys(s).filter(k => k.indexOf('tip:') === 0).forEach(k => delete s[k]); save(s); App.toast('Screen tips will show again'); }
    if (h === 'setup') location.hash = '#/welcome';
  });
}

App.guide = {
  mark, tip, tour: startTour, help: helpScreen,
  /** the entry the add sheet just saved (the tour offers to undo it) */
  saved(row) { lastSaved = row || null; savedAt = Date.now(); },
  /** after Home draws: the checklist (into [data-guide-card]) and, the first time, the tour */
  home(el, ents) {
    const st = load();
    if ((st.tourV || 0) < 2) { delete st.walk; delete st.walkSkipped; st.tourV = 2; save(st); }   // the tour was fixed: everyone gets it once more
    fillCard(el.querySelector('[data-guide-card]'), ents); if (!load().walk) setTimeout(() => maybeStart(0), 700);
  },
};
})();
