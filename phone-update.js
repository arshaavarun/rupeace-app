/* The app update sheet, in RuPeace's own look. The Android app (android/.../Updater.java) finds a newer version and
   calls window.RuPeaceUpdate(json); this sheet offers it, then follows window.RuPeaceUpdateState(state, arg) while the
   app downloads (with a percentage), installs, needs the one-time "install unknown apps" permission, or fails.
   After an update it says so once. */
(function () {
'use strict';
const App = window.App;
const esc = App.esc;
const A = () => window.RuPeaceAndroid || {};
const C = 2 * Math.PI * 34;
let info = null, sheet = null, queued = false;

const free = () => !document.querySelector('#rpSplash:not(.out), .rp-lock, dialog[open]:not([data-closing]), .gw');
const kb = n => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
const icon = () => '<div class="up-icon"><svg viewBox="0 0 80 80" aria-hidden="true"><circle class="bg" cx="40" cy="40" r="34"/>' +
  '<circle class="fg" cx="40" cy="40" r="34" stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + C.toFixed(1) + '"/></svg><span>₹</span></div>';

function body(state, arg) {
  const cur = A().appVersion ? A().appVersion() : '';
  if (state === 'downloading') {
    return '<div class="up-status"><b>Downloading… <span data-pct>' + (Number(arg) || 0) + '%</span></b><span>Keep RuPeace open for a few seconds.</span></div>' +
      '<div class="up-bar"><i style="width:' + (Number(arg) || 0) + '%"></i></div>';
  }
  if (state === 'installing') {
    return '<div class="up-status"><b>Installing…</b><span>If Android asks, tap <b>Update</b> or <b>Install</b>. RuPeace reopens by itself.</span></div><div class="up-bar busy"><i></i></div>';
  }
  if (state === 'permission') {
    return '<div class="up-perm"><b>One-time permission</b><p>Android needs your OK before RuPeace can install its own updates. Tap <b>Allow</b>, switch on ' +
      '<b>Allow from this source</b>, then come back to RuPeace.</p></div>' +
      '<div class="qa-foot up-foot"><button type="button" class="btn" data-up="later">Not now</button><button type="button" class="btn primary" data-up="allow">Allow</button></div>';
  }
  if (state === 'error') {
    return '<div class="up-err">' + esc(arg || 'Something went wrong. Try again later.') + '</div>' +
      '<div class="qa-foot up-foot"><button type="button" class="btn" data-up="later">Close</button><button type="button" class="btn primary" data-up="now">Try again</button></div>';
  }
  return '<div class="up-notes"><b>What is new</b><p>' + esc(info.notes || 'Improvements and fixes.') + '</p></div>' +
    '<ul class="up-safe"><li>Takes a few seconds</li><li>Your data stays as it is</li><li>You stay signed in</li></ul>' +
    '<div class="qa-foot up-foot"><button type="button" class="btn" data-up="later">Later</button><button type="button" class="btn primary" data-up="now">Update now</button></div>' +
    (cur ? '<p class="up-cur">You have ' + esc(cur) + '</p>' : '');
}

function draw(state, arg) {
  if (!sheet) return;
  sheet.dataset.state = state;
  sheet.querySelector('[data-up-body]').innerHTML = body(state, arg);
  const fg = sheet.querySelector('.up-icon .fg');
  if (fg) fg.style.strokeDashoffset = state === 'downloading' ? (C * (1 - (Number(arg) || 0) / 100)).toFixed(1) : state === 'installing' ? '0' : C.toFixed(1);
}

function open() {
  queued = false;
  if (!info) return;
  if (!free()) { queued = true; setTimeout(open, 1200); return; }
  sheet = App.bsheet({ title: 'Update', cls: 'upd', focus: false, onClose: () => { const st = sheet && sheet.dataset.state; if (st !== 'downloading' && st !== 'installing' && A().updateLater) A().updateLater(); sheet = null; },
    body: '<div class="up-hero">' + icon() + '<div><div class="up-tag">Update ready</div><h3>RuPeace ' + esc(info.name || '') + '</h3>' +
      '<div class="up-sub">' + (info.size ? kb(info.size) + ' · ' : '') + 'the app on this phone</div></div></div><div data-up-body></div>' });
  sheet.addEventListener('click', e => {
    const b = e.target.closest('[data-up]'); if (!b) return;
    const k = b.dataset.up;
    if (k === 'now') { draw('downloading', '0'); if (A().updateNow) A().updateNow(); }
    if (k === 'allow') { if (A().updateAllow) A().updateAllow(); sheet.close2(); }
    if (k === 'later') { if (A().updateLater) A().updateLater(); sheet.close2(); }
  });
  draw('offer');
}

/* called by the Android app */
window.RuPeaceUpdate = json => {
  try { info = typeof json === 'string' ? JSON.parse(json) : json; } catch (e) { return 'none'; }
  if (!sheet && !queued) open();
  return 'shown';
};
window.RuPeaceUpdateState = (state, arg) => {
  if (!sheet) {                                   // the sheet was closed: still say how it ended
    if (state === 'error') App.toast(arg || 'The update did not install', true);
    if (state === 'permission' && info) open();
    if (sheet) draw(state, arg);
    return;
  }
  if (state === 'downloading' && sheet.dataset.state === 'downloading') {
    const p = sheet.querySelector('[data-pct]'), bar = sheet.querySelector('.up-bar i'), fg = sheet.querySelector('.up-icon .fg');
    if (p) p.textContent = (Number(arg) || 0) + '%';
    if (bar) bar.style.width = (Number(arg) || 0) + '%';
    if (fg) fg.style.strokeDashoffset = (C * (1 - (Number(arg) || 0) / 100)).toFixed(1);
    return;
  }
  draw(state, arg);
};

/* after an update: say so once */
(function updatedSince() {
  const v = A().appVersion ? A().appVersion() : '';
  if (!v) return;
  let was = null;
  try { was = localStorage.getItem('rp.appVersion'); localStorage.setItem('rp.appVersion', v); } catch (e) { return; }
  if (was && was !== v) {
    const say = () => { if (!free()) return setTimeout(say, 1200); App.toast('Updated to RuPeace ' + v + ' ✓'); };
    setTimeout(say, 1500);
  }
})();
})();
