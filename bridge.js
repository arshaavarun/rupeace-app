/* RuPeace — the app's link to Google.
   Loaded after the screens and before App.boot() (google/web_build.py). Calls reach the Google script by a cookieless
   POST to its /exec link (window.RUPEACE_API), answered {ok: true, data} or {ok: false, error[, signin]}.
   The screens only open inside the RuPeace Android app (its WebView adds "RuPeaceAndroid" to the user agent); a plain
   browser gets a page that offers the app instead.

   Works offline first (OFFLINE.md): this device keeps a copy of every table (IndexedDB) and runs RuPeace's own server
   code on it (engine.js, window.RPEngine / RPLocal), so every screen and every save is answered here at once. Saves
   become waiting changes that sync with the Google Sheet in the background (POST /api/sync); when two people changed
   the same thing, App.sync.conflicts() says what happened and suggests what to do. Only sign-in and sync go to Google.
   If engine.js is missing or the script is too old to sync, every call goes to Google as before.

   PIN sign-in: the web app runs as the owner and opens for anyone with the link, so every request carries a token
   that this device got by signing in with a PIN (google/server/auth.js). No token, or a dead one: the lock screen
   shows, and once signed in the request goes through. The setup code (from the owner's laptop) makes the first PIN
   and resets a forgotten one. Settings → PINs sets everyone's PIN and signs this device out. */
(function () {
'use strict';
if (!window.App) throw new Error('bridge.js must load after core.js');
// The script's /exec link; posted to with NO cookies so Google never picks an account.
const API_URL = window.RUPEACE_API || '';

/* ---------- the app only ----------
   Outside the Android app (no "RuPeaceAndroid" in the user agent) nothing opens: a page offers the app's download.
   A test server on this computer (localhost) still opens, for development. */
const IN_APP = /RuPeaceAndroid/.test(navigator.userAgent) || /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
if (!IN_APP || !API_URL) {
  App.boot = () => {
    const sp = document.getElementById('rpSplash'); if (sp) sp.remove();
    document.title = 'RuPeace';
    document.body.innerHTML = '<div style="min-height:100vh;display:grid;place-items:center;padding:24px;box-sizing:border-box;background:var(--page);color:var(--ink);font-family:var(--font)">' +
      '<div style="max-width:380px;text-align:center"><div style="width:64px;height:64px;border-radius:18px;margin:0 auto 18px;display:grid;place-items:center;background:var(--hero);color:#fff;font:800 32px/1 var(--font)">₹</div>' +
      '<h1 style="font-size:22px;margin:0 0 8px">RuPeace is an Android app</h1>' +
      '<p style="color:var(--muted);margin:0 0 20px">It does not open in a browser. Install the app on your phone and sign in with your PIN.</p>' +
      (API_URL ? '<a class="btn primary" style="height:48px;padding:0 22px;border-radius:14px;font-size:15px" href="apk/RuPeace.apk">Download the app</a>' +
        '<p style="color:var(--muted);font-size:12.5px;margin-top:14px">If Android asks, allow installing from this source.</p>' : '') + '</div></div>';
  };
  return;
}

const KEY = 'rp.token', PKEY = 'rp.person';
let token = null, person = null;
try { token = localStorage.getItem(KEY); person = Number(localStorage.getItem(PKEY)) || null; } catch (e) { /* storage blocked: sign in each time */ }
function saveToken(t) {
  token = t || null;
  try { if (token) localStorage.setItem(KEY, token); else localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
}
function savePerson(p) {
  person = p == null ? null : Number(p) || null;
  try { if (person) localStorage.setItem(PKEY, String(person)); else localStorage.removeItem(PKEY); } catch (e) { /* ignore */ }
}

/* ---------- the new way (app 2.0): Google sign-in, the family's own Sheet in Drive, a PIN and fingerprint on this phone ----------
   google/client/drive.js does the Drive part. rp.drive = {id, name, email, person} once this phone belongs to a family. */
const DRIVE = !!(window.RPDrive && window.RPDrive.available);
const DKEY = 'rp.drive', LKEY = 'rp.lock';
const legacyToken = token;                                       // the old PIN sign-in, for bringing data over once
let fam = null;
try { fam = JSON.parse(localStorage.getItem(DKEY) || 'null'); } catch (e) { fam = null; }
function saveFam(f) { fam = f || null; try { if (fam) localStorage.setItem(DKEY, JSON.stringify(fam)); else localStorage.removeItem(DKEY); } catch (e) { /* ignore */ } }
if (DRIVE) { token = fam ? 'drive' : null; person = fam ? Number(fam.person) || null : null; }
/* the Google account's name and photo for the button top right: kept with the family, looked up again once a day */
if (DRIVE && fam) App.profile = { name: fam.gname || '', photo: fam.photo || '' };
async function freshProfile() {
  if (!DRIVE || !fam || (fam.photoAt && Date.now() - fam.photoAt < 864e5)) return;
  try {
    const u = await RPDrive.me();
    saveFam(Object.assign({}, fam, { gname: u.displayName || fam.gname || '', photo: u.photoLink || '', photoAt: Date.now() }));
    const was = JSON.stringify(App.profile);
    App.profile = { name: fam.gname, photo: fam.photo };
    if (JSON.stringify(App.profile) !== was) document.querySelectorAll('[data-avatar]').forEach(b => { b.outerHTML = App.avatar(); });
  } catch (e) { /* next time */ }
}

// Turn Google's technical failures into a sentence a person can act on.
const NET = /NetworkError|HTTP 0|Failed to fetch|network|offline|Load failed/i;
function plain(err) {
  const msg = String((err && err.message) || err || '').trim();
  if (NET.test(msg) || (typeof navigator !== 'undefined' && navigator.onLine === false))
    return "Can't reach Google right now. Check your internet connection and try again.";
  if (/server error occurred|Exceeded maximum execution time|too many times|Service (Spreadsheets )?(timed out|unavailable)|Lock timeout|try again/i.test(msg))
    return 'Google is busy for a moment. Please try again.';
  return msg || 'Something went wrong talking to Google. Please try again.';
}
/** An Error with a plain message; .offline = Google could not be reached at all. */
function tripError(err, offline) {
  const e = new Error(plain(err));
  e.offline = offline === undefined ? (NET.test(String((err && err.message) || err || '')) || navigator.onLine === false) : offline;
  return e;
}
const wait = ms => new Promise(r => setTimeout(r, ms));

/* ---------- trips to Google: one trip for many ----------
   Every trip to Google's script costs about 2.5 s however small it is, so requests made at the same moment travel
   together in one trip (apiBatch / doPost {batch}). */
let queue = [], flushTimer = null;
/** One api() call through the queue; resolves with the raw {ok, data | error, signin}; rejects when the trip fails. */
function call(method, url, body) {
  return new Promise((resolve, reject) => {
    let payload = null;
    try { payload = body == null ? null : JSON.parse(JSON.stringify(body)); }   // plain data only
    catch (e) { reject(new Error('That data could not be sent: ' + e.message)); return; }
    queue.push({ req: { method, url, body: payload }, resolve, reject });
    if (!flushTimer) flushTimer = setTimeout(flush, 12);
  });
}
/** Several calls in one trip, in this order. */
function callMany(reqs) {
  return Promise.all(reqs.map(r => call(r.method, r.url, r.body)));
}

async function flush() {
  flushTimer = null;
  const items = queue;
  queue = [];
  if (!items.length) return;
  try {
    const res = await sendBatch(items.map(i => i.req));
    items.forEach((it, k) => it.resolve(res[k] || { ok: false, error: 'No answer from the server. Please try again.' }));
  } catch (e) {
    items.forEach(it => it.reject(e));
  }
}

function sendBatch(reqs) {
  if (DRIVE) return driveBatch(reqs);
  return postWeb({ batch: reqs, token });
}
/** The new way: what the Google script answered is answered here, against the family's Sheet (drive.js). */
async function driveBatch(reqs) {
  if (!fam) return reqs.map(() => ({ ok: false, error: 'Sign in first.', signin: true }));
  const out = [];
  for (const r of reqs) out.push(await RPDrive.call(fam.id, r.method, r.url, r.body, person));
  const off = out.find(x => x && x.offline);
  if (off) throw tripError(off.error, true);
  return out;
}

/** A text/plain POST (no CORS pre-check), no cookies, following Google's redirect to the answer. */
async function postWeb(payload) {
  let r;
  try {
    r = await fetch(API_URL, {
      method: 'POST', credentials: 'omit', redirect: 'follow', cache: 'no-store',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    throw tripError(e, true);
  }
  if (!r.ok) throw tripError(r.status >= 500 ? 'Google is busy for a moment. Please try again.' : 'The app could not reach its Google script (' + r.status + ').', false);
  const text = await r.text();
  try { return JSON.parse(text); }
  catch (e) { throw tripError(/<html/i.test(text) ? 'Google sent a web page instead of data. The script link may be wrong or not published to "Anyone".' : 'No answer from the server. Please try again.', false); }
}

/** One call to Google; a dead token shows the lock screen and asks once more. Resolves data or throws. */
async function remote(method, url, body) {
  let res = await call(method, url, body);
  if (!res.ok && res.signin) {
    await signInAgain();
    res = await call(method, url, body);
  }
  if (res.ok) return res.data;
  throw new Error(res.error || 'No answer from the server. Please try again.');
}

/** Settings → PINs opens from the last answer kept on this device, then refreshes quietly. */
const PINS = 'rp.pins';
async function pinsGet(url) {
  let kept = null;
  try { kept = JSON.parse(localStorage.getItem(PINS) || 'null'); } catch (e) { kept = null; }
  const fresh = remote('GET', url).then(d => {
    try { localStorage.setItem(PINS, JSON.stringify(d)); } catch (e) { /* ignore */ }
    if (kept && JSON.stringify(kept) !== JSON.stringify(d)) redrawSoon();
    return d;
  });
  if (kept) { fresh.catch(() => {}); return kept; }
  return fresh;
}

/* ---------- redraw after a sync (never while someone is typing or a sheet is open) ---------- */
let redrawTimer = null;
function busyTyping() {
  const a = document.activeElement;
  return !!(document.querySelector('dialog[open], .rp-lock, .modal, .dp, .sheet.open, [data-sheet-open]') ||
    (a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable)));
}
function redrawSoon() {
  clearTimeout(redrawTimer);
  redrawTimer = setTimeout(async () => {
    if (busyTyping()) return redrawSoon();                     // wait until the person is done
    try { await App.loadOptions(); } catch (e) { /* the page shows its own error */ }
    App.refresh();
  }, 350);
}

/* ---------- this device's copy (local engine) ---------- */
const ENGINE = !!(window.RPEngine && window.RPLocal && window.RPStore && RPEngine.hooks.localIds && RPEngine.hooks.capture);
let local = null;                 // RPLocal, once opened
let mode = 'remote';              // 'local': every data call is answered on this device
const subs = new Set();
const notify = () => subs.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
const offlineNow = () => navigator.onLine === false || window.__rpOffline === true;   // __rpOffline: a test switch

async function syncSend(body) {
  if (window.__rpOffline === true) throw tripError("Can't reach Google right now.", true);
  return call('POST', '/api/sync', body);
}

async function makeLocal() {
  if (local || !ENGINE) return local;
  local = RPLocal.create({
    store: await RPStore.best('rupeace'), engine: RPEngine, send: syncSend,
    isOnline: () => !offlineNow(),
    onChange: notify,
    onSynced: changed => { if (changed) redrawSoon(); },
    onSignIn: () => { signInAgain().then(() => local && mode === 'local' && local.sync()).catch(() => {}); },
  });
  return local;
}

/** Opens this device's copy; the first time (or for another person) gets everything from Google, behind the opening
    screen. Ends in mode 'local', or 'remote' when this device can't keep a copy or the script can't sync yet. */
async function openLocal() {
  if (!(await makeLocal())) { mode = 'remote'; notify(); return; }
  let have = false;
  try { have = await local.load(); } catch (e) { have = false; }
  if (have && person && local.person() !== person) { await local.clear(); have = false; }   // someone else signed in here
  if (have) {
    mode = 'local';
    notify();
    local.sync();
    return;
  }
  await firstPull();
}

/* the copy could not be made (Google slow or busy): keep trying quietly, so the phone never stays in the slow way */
let healTimer = null;
function healLater() {
  clearTimeout(healTimer);
  healTimer = setTimeout(async () => {
    if (mode === 'local' || !token || !local) return;
    if (offlineNow() || document.visibilityState !== 'visible') return healLater();
    await firstPull(true);
    if (mode === 'local') { try { await App.loadOptions(); } catch (e) { /* ignore */ } App.refresh(); }
  }, 30000);
}

/* The first copy on this phone. Until it is here the app does not open: the opening screen stays (and keeps trying),
   so nobody ever lands in a slow, half-loaded app. On a fresh start with no data on Google but backups in Drive (a
   reinstall, a new phone, after Reset data), it first asks whether to bring a backup back. */
let offerAsked = false;
async function firstPull(quiet) {
  if (!quiet) showSplash('Getting your data from Google…');
  for (let tries = 0; ; tries++) {
    try {
      const reqs = [{ method: 'GET', url: '/api/auth/me' },
        { method: 'POST', url: '/api/sync', body: { device: local.newDevice(), since: 0, changes: [] } }];
      if (!quiet && !offerAsked) reqs.push({ method: 'GET', url: '/api/backups/offer' });
      const [meRes, res, offer] = await callMany(reqs);
      if (meRes.signin || res.signin) {
        if (quiet) { healLater(); return; }
        hideSplash();
        await signInAgain(true);
        showSplash('Getting your data from Google…');
        continue;
      }
      if (!res.ok) {
        if (res.error === 'Not found') { mode = 'remote'; notify(); return; }          // a script from before offline mode
        throw tripError(res.error, false);
      }
      if (meRes.ok && meRes.data && meRes.data.person) savePerson(meRes.data.person.id);
      if (offer && offer.ok && offer.data && offer.data.empty && (offer.data.backups || []).length && !offerAsked) {
        offerAsked = true;
        hideSplash();
        if (await recoverFromDrive(offer.data.backups)) { showSplash('Getting your data from Google…'); continue; }   // pull again, restored
        showSplash('Getting your data from Google…');
      }
      offerAsked = true;
      await local.pull(person, res.data);
      mode = 'local';
      clearTimeout(healTimer);
      notify();
      return;
    } catch (e) {
      if (quiet) { console.error(e); mode = 'remote'; notify(); healLater(); return; }
      showSplash((e.offline ? 'No internet yet. RuPeace needs it once to get your data.' : e.message || 'Google is busy.') + ' Trying again…');
      await wait(Math.min(15000, 3000 * (tries + 1)));
    }
  }
}

/* "Welcome back": pick a backup in Drive (newest first) or start fresh. Resolves true when one was restored. */
function recoverFromDrive(list) {
  if (!document.getElementById('rpLockCss')) document.head.insertAdjacentHTML('beforeend', CSS);
  const esc = App.esc;
  const when = b => { const d = new Date(b.created); return isNaN(d) ? b.name : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }); };
  const kind = k => ({ daily: 'automatic', 'before-reset': 'saved before a reset', 'before-restore': 'saved before a restore' }[k] || 'saved by hand');
  return new Promise(resolve => {
    let sel = list[0].id, err = '', busy = false;
    const box = document.createElement('div');
    box.className = 'rp-lock';
    const draw = () => {
      box.innerHTML = '<div class="rp-card"><div class="rp-logo">₹</div><h1>Welcome back</h1><p class="rp-sub">Your data is backed up in Google Drive. Bring it back?</p>' +
        '<div class="rp-bk" role="radiogroup" aria-label="Backups">' + list.map(b => '<button type="button" role="radio" aria-checked="' + (b.id === sel) + '" class="rp-bkrow" data-id="' + esc(b.id) + '">' +
          '<span class="rp-r"></span><span class="rp-bt"><b>' + esc(when(b)) + '</b><small>' + b.entries + (b.entries === 1 ? ' entry · ' : ' entries · ') + b.people + (b.people === 1 ? ' person · ' : ' people · ') + kind(b.kind) + '</small></span></button>').join('') + '</div>' +
        '<p class="rp-err" role="alert">' + esc(err) + '</p>' +
        '<button class="rp-go" type="button" data-restore' + (busy ? ' disabled' : '') + '>' + (busy ? 'Restoring…' : 'Restore this backup') + '</button>' +
        '<button class="rp-link" type="button" data-fresh' + (busy ? ' disabled' : '') + '>Start fresh instead</button>' +
        '<p class="rp-note">Everything comes back as it was then, and the app opens once it is all on this phone. PINs are not in backups: give the others new PINs in Settings → PINs.</p></div>';
    };
    box.addEventListener('click', async e => {
      if (busy) return;
      const r = e.target.closest('[data-id]'); if (r) { sel = r.dataset.id; return draw(); }
      if (e.target.closest('[data-fresh]')) {
        if (!(await App.confirm('The backups stay in Google Drive: Settings → Backup and reset can bring one back any time.', { title: 'Start with an empty RuPeace?', okLabel: 'Start fresh' }))) return;
        box.remove(); return resolve(false);
      }
      if (!e.target.closest('[data-restore]')) return;
      busy = true; err = ''; draw();
      try {
        const res = await call('POST', '/api/backups/restore', { id: sel, confirm: 'REPLACE' });
        if (!res.ok) throw new Error(res.error || 'That did not work. Try again.');
        box.remove();
        if (res.data && res.data.signin_again) { saveToken(null); savePerson(null); await signIn(); }
        resolve(true);
      } catch (ex) { busy = false; err = plain(ex); draw(); }
    });
    draw();
    document.body.appendChild(box);
  });
}

/** The lock screen again (dead token). Same person: carry on with this device's copy; someone else: theirs. */
let relock = null, resetting = false;
function signInAgain(quiet) {
  if (resetting) return new Promise(() => {});                         // Reset data is running: it restarts the app itself
  if (relock) return relock;
  relock = (async () => {
    saveToken(null);
    const was = person;
    const who = await signIn();
    const now = who && who.id != null ? Number(who.id) : null;
    if (!quiet && local && local.has() && now && local.person() !== now) {
      await local.clear();
      mode = 'remote';
      await firstPull();
      hideSplash();
      App.opt = null;
      redrawSoon();
    } else if (!quiet && was !== now) {
      redrawSoon();
    }
    return who;
  })().finally(() => { relock = null; });
  return relock;
}

App.transport = async (method, url, body) => {
  const path = String(url).split('#')[0].split('?')[0];
  if (path.indexOf('/api/auth/') === 0) return method === 'GET' && path === '/api/auth/pins' ? pinsGet(url) : remote(method, url, body);
  if (path.indexOf('/api/backups') === 0) {                         // backups live in Google Drive: always on Google
    const d = await remote(method, url, body);
    if (method === 'POST' && path === '/api/backups/restore') {      // everything replaced: a fresh copy, then on
      if (local) await local.clear();
      if (d && d.signin_again) { saveToken(null); savePerson(null); location.replace(location.pathname); return d; }
      offerAsked = true;
      if (local) { mode = 'remote'; await firstPull(); hideSplash(); }
      App.opt = null;
    }
    return d;
  }
  if (mode !== 'local' || path.indexOf('/api/sync') === 0) return remote(method, url, body);
  if (method === 'POST' && path === '/api/reset') {                 // clean slate: Google is emptied, then this phone, then a fresh start
    if (local && local.status().pending) { try { await local.sync(); } catch (e) { /* the backup has what Google has */ } }
    resetting = true;                                                // no syncing and no sign-in screen half way through
    if (DRIVE && fam) body = Object.assign({}, body, { me: { name: (App.profile && App.profile.name) || fam.gname || '', email: fam.email || '' } });
    let d;
    try { d = await remote(method, url, body); } catch (e) { resetting = false; throw e; }
    showSplash('Starting fresh…');
    if (local) await local.clear();
    if (DRIVE && fam) {                                              // Drive: same family, same sign-in and PIN, an empty file
      const keepF = Object.assign({}, fam, { person: (d && d.person) || fam.person });
      let keepL = null;
      try { keepL = localStorage.getItem(LKEY); localStorage.clear(); sessionStorage.clear(); } catch (e) { /* ignore */ }
      saveFam(keepF);
      try { if (keepL) localStorage.setItem(LKEY, keepL); } catch (e) { /* ignore */ }
      location.replace(location.pathname);
      return d;
    }
    saveToken(null);
    savePerson(null);
    try { localStorage.clear(); sessionStorage.clear(); } catch (e) { /* ignore */ }
    location.replace(location.pathname);
    return d;
  }
  if (method === 'POST' && path === '/api/import') {               // replaces everything: on Google, then a fresh copy
    const d = await remote(method, url, body);
    await local.clear();
    mode = 'remote';
    await firstPull();
    hideSplash();
    App.opt = null;
    return d;
  }
  const res = local.api(method, url, body);
  if (!res.ok) throw new Error(res.error || 'Something went wrong.');
  return res.data;
};

/* ---------- App.sync: what the sync UI (google/client/sync-ui.js) reads ---------- */
const idle = () => ({ online: !offlineNow(), syncing: false, pending: 0, lastSync: null, conflicts: 0, error: null });
const on = () => !!(local && mode === 'local');
App.sync = {
  /** {online, syncing, pending, lastSync, conflicts, error} */
  status: () => (on() ? local.status() : idle()),
  /** fn() on any status or conflicts change; returns an unsubscribe function */
  onChange(fn) { subs.add(fn); return () => subs.delete(fn); },
  /** true for rows not yet confirmed by Google (temporary ids or waiting changes) */
  isPending: (table, id) => on() && local.isPending(table, id),
  /** clashes waiting for a decision, each with a suggestion and its reason */
  conflicts: () => (on() ? local.conflicts() : []),
  /** turns the choice into changes and syncs them */
  resolve: (id, choice) => (on() ? local.resolve(id, choice) : Promise.reject(new Error('Nothing to sort out.'))),
  /** sync now (resolves when done, also when offline: see status()) */
  syncNow: () => (on() ? local.sync() : Promise.resolve({ ok: true, changed: false })),
  /** 'local': this phone answers from its own copy (fast); 'remote': every screen waits for Google (no copy yet) */
  mode: () => (ENGINE ? mode : 'none'),
  /** make this phone's copy again (one trip to Google), then redraw */
  rebuild: async () => {
    if (!(await makeLocal())) return;
    await firstPull();
    hideSplash();
    try { await App.loadOptions(); } catch (e) { /* ignore */ }
    App.refresh();
  },
  /** the real id of a row made offline, once synced (a screen may still hold its temporary id) */
  realId: (table, id) => (on() && local.realId ? local.realId(table, id) : id),
};

// when to sync: on start (openLocal), after saves (RPLocal, ~1 s), coming back online, every 60 s while visible
window.addEventListener('online', () => { notify(); if (on()) local.sync(); });
window.addEventListener('offline', notify);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !on()) return;
  const last = Date.parse(local.status().lastSync || 0) || 0;
  if (Date.now() - last > 20000) local.sync();
});
setInterval(() => { if (on() && !resetting && document.visibilityState === 'visible') local.sync(); }, 60000);

/* ---------- lock screen ---------- */
const CSS = '<style id="rpLockCss">' +
  '.rp-lock{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;padding:24px 16px;overflow:auto;background:var(--page-bg,#0e1012);color:var(--ink);font-family:var(--font,inherit)}' +
  '.rp-card{width:100%;max-width:360px;background:var(--surface);border:1px solid var(--border);border-radius:24px;padding:28px 22px 22px;box-shadow:var(--shadow-lg);text-align:center}' +
  '.rp-logo{width:64px;height:64px;border-radius:20px;margin:0 auto 14px;display:grid;place-items:center;font-size:30px;font-weight:800;color:#fff;background:var(--hero);box-shadow:var(--hero-shadow)}' +
  '.rp-card h1{font-size:22px;margin:0 0 4px}.rp-card .rp-sub{color:var(--muted);font-size:14px;margin:0 0 18px}' +
  '.rp-card form{display:grid;gap:10px;text-align:left}.rp-card label{font-size:12px;font-weight:650;color:var(--muted)}' +
  '.rp-card input{width:100%;box-sizing:border-box;height:48px;border-radius:14px;border:1px solid var(--border);background:var(--surface-2);color:var(--ink);font:inherit;font-size:17px;padding:0 14px}' +
  '.rp-card input.rp-pin{text-align:center;font-size:26px;letter-spacing:.45em;padding-left:.45em}' +
  '.rp-card input:focus{outline:2px solid var(--accent);outline-offset:1px}' +
  '.rp-go{height:50px;border:0;border-radius:14px;background:var(--btn-grad,var(--accent));color:#fff;font:inherit;font-size:16px;font-weight:700;cursor:pointer;margin-top:6px}' +
  '.rp-go:disabled{opacity:.6;cursor:progress}' +
  '.rp-err{min-height:20px;margin:2px 0 0;color:var(--bad);font-size:13.5px;text-align:center}' +
  '.rp-link{border:1px solid var(--chip-line,#888);border-radius:12px;background:none;color:var(--accent-fg,var(--accent));font:inherit;font-size:13.5px;font-weight:600;cursor:pointer;padding:10px 16px;margin-top:10px}' +
  '.rp-card > .rp-go{display:block;width:100%}.rp-card > .rp-link{display:block;margin:4px auto 0}' +
  '.rp-note{color:var(--muted);font-size:12.5px;line-height:1.45;margin:0}' +
  '.rp-bk{display:grid;gap:8px;text-align:left;margin-bottom:4px;max-height:46vh;overflow:auto}' +
  '.rp-bkrow{display:flex;align-items:center;gap:12px;width:100%;min-height:56px;padding:8px 12px;border-radius:14px;border:1px solid var(--border);background:var(--surface-2);color:var(--ink);font:inherit;text-align:left;cursor:pointer}' +
  '.rp-bkrow[aria-checked="true"]{border-color:var(--accent);background:var(--accent-soft)}' +
  '.rp-r{width:20px;height:20px;border-radius:50%;border:2px solid var(--chip-line,#888);flex:none;display:grid;place-items:center}' +
  '.rp-bkrow[aria-checked="true"] .rp-r{border-color:var(--accent)}.rp-bkrow[aria-checked="true"] .rp-r::after{content:"";width:10px;height:10px;border-radius:50%;background:var(--accent)}' +
  '.rp-bt b{display:block;font-size:14.5px}.rp-bt small{display:block;font-size:12.5px;color:var(--muted)}' +
  '</style>';

let pending = null;
/** Shows the lock screen until this device is signed in. One at a time; everyone waiting shares it. */
function signIn() {
  if (DRIVE) return driveSignIn();
  if (pending) return pending;
  pending = new Promise(done => {
    if (!document.getElementById('rpLockCss')) document.head.insertAdjacentHTML('beforeend', CSS);
    const box = document.createElement('div');
    box.className = 'rp-lock';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', 'Sign in to RuPeace');
    document.body.appendChild(box);
    let hasPins = true;

    const finish = res => {
      saveToken(res.token);
      savePerson(res.person && res.person.id);
      box.remove();
      pending = null;
      done(res.person);
    };
    const busy = (form, on) => form.querySelectorAll('button,input').forEach(x => { x.disabled = on; });
    const send = async (form, url, body) => {
      const err = form.querySelector('.rp-err');
      err.textContent = '';
      busy(form, true);
      try {
        const res = await call('POST', url, body);
        if (res.ok) return finish(res.data);
        err.textContent = res.error;
      } catch (e) {
        err.textContent = e.message;
      }
      busy(form, false);
      const code = form.querySelector('#rpCode');
      if (code) { code.focus(); code.select(); return; }          // setup: keep what was typed, retype the code
      const pin = form.querySelector('input.rp-pin');
      if (pin) { pin.value = ''; pin.focus(); }                   // sign-in: clear the wrong PIN
    };

    const pinView = () => {
      box.innerHTML = '<div class="rp-card"><div class="rp-logo">₹</div><h1>RuPeace</h1><p class="rp-sub">Enter your PIN</p>' +
        '<form novalidate><input class="rp-pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="current-password" aria-label="PIN" autofocus>' +
        '<button class="rp-go" type="submit">Unlock</button><p class="rp-err" role="alert"></p></form>' +
        '<button class="rp-link" type="button" data-setup>First time here, or forgot your PIN?</button></div>';
      const form = box.querySelector('form'), pin = form.querySelector('input');
      pin.addEventListener('input', () => { pin.value = pin.value.replace(/\D/g, '').slice(0, 8); });
      form.onsubmit = e => {
        e.preventDefault();
        if (!/^\d{4,8}$/.test(pin.value)) { form.querySelector('.rp-err').textContent = 'Your PIN is 4 to 8 digits.'; return; }
        send(form, '/api/auth/login', { pin: pin.value });
      };
      box.querySelector('[data-setup]').onclick = setupView;
      setTimeout(() => pin.focus(), 50);
    };

    const setupView = () => {
      box.innerHTML = '<div class="rp-card"><div class="rp-logo">₹</div><h1>' + (hasPins ? 'Set a new PIN' : 'Set up RuPeace') + '</h1>' +
        '<p class="rp-sub">You need the setup code from the RuPeace laptop.</p>' +
        '<form novalidate>' +
        '<label for="rpCode">Setup code</label><input id="rpCode" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="ABCD-EFGH-JK">' +
        '<label for="rpName">Your name</label><input id="rpName" autocomplete="name" placeholder="As it appears in Family">' +
        '<label for="rpPin1">New PIN (4 to 8 digits)</label><input id="rpPin1" class="rp-pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="new-password">' +
        '<label for="rpPin2">Same PIN again</label><input id="rpPin2" class="rp-pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="new-password">' +
        '<button class="rp-go" type="submit">Save PIN and open</button><p class="rp-err" role="alert"></p>' +
        '<p class="rp-note">If your name is already in Family, this replaces your PIN. Otherwise you are added.</p></form>' +
        (hasPins ? '<button class="rp-link" type="button" data-back>Back to PIN</button>' : '') + '</div>';
      const form = box.querySelector('form'), $ = id => form.querySelector('#' + id);
      ['rpPin1', 'rpPin2'].forEach(id => $(id).addEventListener('input', () => { $(id).value = $(id).value.replace(/\D/g, '').slice(0, 8); }));
      form.onsubmit = e => {
        e.preventDefault();
        const err = form.querySelector('.rp-err');
        if (!$('rpCode').value.trim()) { err.textContent = 'Enter the setup code.'; return; }
        if (!$('rpName').value.trim()) { err.textContent = 'Type your name.'; return; }
        if (!/^\d{4,8}$/.test($('rpPin1').value)) { err.textContent = 'A PIN is 4 to 8 digits.'; return; }
        if ($('rpPin1').value !== $('rpPin2').value) { err.textContent = "The two PINs don't match."; return; }
        send(form, '/api/auth/setup', { code: $('rpCode').value, name: $('rpName').value, pin: $('rpPin1').value });
      };
      const back = box.querySelector('[data-back]');
      if (back) back.onclick = pinView;
      setTimeout(() => $('rpCode').focus(), 50);
    };

    box.innerHTML = '<div class="rp-card"><div class="rp-logo">₹</div><h1>RuPeace</h1><p class="rp-sub">Opening…</p>' +
      '<button class="rp-link" type="button" data-retry hidden>Try again now</button></div>';
    // Ask whether any PIN exists yet (first time: setup screen). If Google can't be reached (no signal, phone just
    // woke up), keep retrying here instead of guessing, so a first-time user never lands on a PIN they don't have.
    let tries = 0, timer = null;
    const check = () => {
      clearTimeout(timer);
      const sub = box.querySelector('.rp-sub'), again = box.querySelector('[data-retry]');
      if (!sub) return;                                        // already moved on to a form
      sub.textContent = tries ? 'Trying again…' : 'Opening…';
      call('GET', '/api/auth/state').then(res => {
        if (!res.ok) throw new Error(res.error || 'No answer from the server.');
        hasPins = res.data.has_pins !== false;
        if (hasPins) pinView(); else setupView();
      }).catch(e => {
        tries++;
        sub.textContent = e.message + ' Retrying in a few seconds…';
        again.hidden = false;
        again.onclick = check;
        timer = setTimeout(check, Math.min(15000, 3000 * tries));
      });
    };
    check();
  });
  return pending;
}

/* ---------- opening screen ----------
   The opening screen (google/client/splash.html, part of the page) shows while this device opens
   its copy, which is instant once it has one; only the very first time on a device (or after someone else signed in)
   does it wait for one trip to Google that brings every table. The first page draws behind it. */
function splash() { return document.getElementById('rpSplash'); }
function showSplash(text) {
  const el = splash();
  if (!el) return;
  el.classList.remove('out');
  const tag = el.querySelector('[data-tag]');
  if (tag && text) tag.textContent = text;
}
function hideSplash() {
  const el = splash();
  if (el) el.classList.add('out');
}

// Sign in first if this device has no token; then open this device's copy (or get it), then the first page.
const realBoot = App.boot;
App.boot = async () => {
  const t0 = Date.now();
  if (DRIVE && token) { hideSplash(); await appLock(); showSplash(); setTimeout(freshProfile, 1500); }
  if (!token) {
    hideSplash();
    await signIn();
    showSplash();
  }
  try { await openLocal(); } catch (e) { console.error(e); mode = 'remote'; notify(); }
  realBoot();
  await wait(Math.max(0, 350 - (Date.now() - t0)));    // no flash of the opening screen
  hideSplash();
};

/* ---------- Settings → PINs ---------- */
App.signOut = async () => {
  if (on()) {                                   // changes not on Google yet would be lost: try once, then ask
    if (local.status().pending) await local.sync();
    const st = local.status();
    if (st.pending + st.conflicts && !(await App.confirm((st.pending + st.conflicts) + (st.pending + st.conflicts > 1 ? ' changes on this phone have' : ' change on this phone has') +
      ' not reached Google yet and will be lost if you sign out now.', { title: 'Sign out anyway?', okLabel: 'Sign out', danger: true }))) return;
  }
  if (DRIVE) { try { await RPDrive.signOut(); } catch (e) { /* signed out here either way */ } saveFam(null); try { localStorage.removeItem(LKEY); } catch (e) { /* ignore */ } }
  else { try { await call('POST', '/api/auth/logout'); } catch (e) { /* signed out locally either way */ } }
  saveToken(null);
  savePerson(null);
  try { localStorage.removeItem(PINS); } catch (e) { /* ignore */ }
  if (local) await local.clear();
  mode = 'remote';
  notify();
  App.opt = null;
  await signIn();
  await openLocal();
  hideSplash();
  await App.loadOptions();
  App.refresh();
};

// Settings → PINs is drawn by core/phone-settings.js (S.pins); this marks that PINs exist in this version.
/* Settings -> Family (core/phone-settings.js): the family code and letting someone's Google account in */
App.family = DRIVE ? {
  get code() { return fam ? fam.id : ''; },
  get name() { return fam ? fam.name : ''; },
  invite: (email, who) => RPDrive.share(fam.id, email, (who ? who + ' added you to ' : 'You were added to ') + (fam.name || 'a RuPeace family') +
    '. Install RuPeace, choose Continue with Google with this account, then Join my family and paste this code: ' + fam.id),
} : null;
if (!DRIVE) App.settingsTab('pins', { label: 'PINs', order: 12, render(el) { el.textContent = ''; } });

/* ================= the new way: sign in with Google, a family file in Drive, a PIN and fingerprint =================
   First time on a phone: Continue with Google -> Google's OK for a RuPeace file in Drive -> the family file this
   account already has (a reinstall), or Start a new family / Join with a family code -> a PIN for this phone ->
   fingerprint or face, if the phone has it. After that, opening the app asks for the fingerprint (or the PIN), and
   again when it comes back after a few minutes away.
   Look ("hero card"): a teal hero on top (under the status bar too) with the RuPeace mark or the step's picture, and
   a calm card below with the words and the buttons. One frame for every step: the hero grows or shrinks and the card's
   content slides, so the steps feel like one flow. */
const G_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.8z"/><path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9h-4v3.1A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.7V6.6h-4a12 12 0 0 0 0 10.8l4-3z"/><path fill="#EA4335" d="M12 4.8c1.7 0 3.3.6 4.5 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8z"/></svg>';
const SVG = p => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>';
const HICON = {
  rupee: '<span class="hx-r">₹</span>',
  family: SVG('<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.4"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0M14.5 15.5A4 4 0 0 1 21 19"/>'),
  key: SVG('<circle cx="8" cy="15" r="4"/><path d="m11 12 8-8M16 7l2 2M14 9l2 2"/>'),
  lock: SVG('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  fp: SVG('<path d="M12 11v3a8 8 0 0 1-1.5 4.7M8.5 12a3.5 3.5 0 0 1 7 0v2a12 12 0 0 1-.7 4M5.6 15a7 7 0 0 1-.1-3 6.5 6.5 0 0 1 13 0v1.5M7 5.5A9 9 0 0 1 17 5.5M18.5 18a14 14 0 0 0 .5-3"/>'),
  drive: SVG('<path d="M8 3h8l6 10-4 7H6l-4-7z"/><path d="m8 3 6 10H2M16 3l-6 10 4 7"/>'),
  bolt: SVG('<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>'),
  plus: SVG('<path d="M12 5v14M5 12h14"/>'),
  coin: SVG('<circle cx="12" cy="12" r="9"/><path d="M9 8h6M9 11h6M13 8c2 0 2 6-4 6l5 4"/>'),
};
/* a short reason with its picture, and a choice drawn as a card (layout 3) */
const feat = (ic, title, line) => '<div class="hx-feat"><i>' + HICON[ic] + '</i><div><b>' + title + '</b><span>' + line + '</span></div></div>';
const choice = (attr, ic, title, line, main) => '<button type="button" class="hx-opt' + (main ? ' main' : '') + '" ' + attr + '><i>' + HICON[ic] + '</i><span class="hx-ot"><b>' + title + '</b><span>' + line + '</span></span><span class="hx-go" aria-hidden="true">›</span></button>';
const HERO_CSS = '<style id="rpHeroCss">' +
  '.hx{position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;background:var(--surface);color:var(--ink);font-family:var(--font,inherit);overflow:hidden}' +
  '.hx-hero{position:relative;flex:none;height:50%;background:radial-gradient(120% 90% at 18% 0%,#2dd4bf 0%,#0f9488 46%,#0b5f58 100%);overflow:hidden;transition:height .5s cubic-bezier(.3,1.15,.45,1)}' +
  '.hx[data-h="tall"] .hx-hero{height:58%}.hx[data-h="mid"] .hx-hero{height:46%}.hx[data-h="low"] .hx-hero{height:36%}.hx[data-h="short"] .hx-hero{height:30%}' +
  '.hx-feats{display:flex;flex-direction:column;gap:12px;margin-top:4px}.hx-feat{display:flex;gap:12px;align-items:center}' +
  '.hx-feat i{flex:none;width:40px;height:40px;border-radius:13px;background:var(--pick-bg);color:var(--accent-fg);display:grid;place-items:center}.hx-feat i svg{width:21px;height:21px}' +
  '.hx-feat b{display:block;font-size:14.5px;font-weight:650}.hx-feat span{display:block;font-size:12.5px;color:var(--muted)}' +
  '.hx-opt{display:flex;align-items:center;gap:12px;width:100%;padding:14px;border-radius:18px;border:1.5px solid var(--chip-line);background:var(--surface-2);color:var(--ink);font:inherit;text-align:left;cursor:pointer;transition:transform .2s cubic-bezier(.3,1.4,.45,1),border-color .2s}' +
  '.hx-opt:active{transform:scale(.98)}.hx-opt.main{border-color:var(--accent);background:var(--pick-bg)}' +
  '.hx-opt i{flex:none;width:44px;height:44px;border-radius:14px;background:var(--pick-bg);color:var(--accent-fg);display:grid;place-items:center}.hx-opt.main i{background:var(--accent);color:#fff}.hx-opt i svg{width:22px;height:22px}' +
  '.hx-ot{flex:1;min-width:0}.hx-ot b{display:block;font-size:15.5px;font-weight:700}.hx-ot span{display:block;font-size:12.5px;color:var(--muted);margin-top:2px}.hx-go{color:var(--muted);font-size:22px}' +
  '.hx-blob{position:absolute;border-radius:50%;background:rgba(255,255,255,.12);transition:transform 1.2s cubic-bezier(.3,1.1,.45,1)}' +
  '.hx-b1{width:220px;height:220px;left:-70px;top:-90px}.hx-b2{width:130px;height:130px;right:-40px;top:30%}.hx-b3{width:90px;height:90px;left:30%;bottom:-40px;background:rgba(255,255,255,.08)}' +
  '.hx[data-h="short"] .hx-b2{transform:translate(-20px,-30px) scale(.8)}.hx[data-h="tall"] .hx-b1{transform:translate(10px,20px) scale(1.1)}' +
  '.hx-coin{position:absolute;left:50%;top:48%;transform:translate(-50%,-50%);width:84px;height:84px;border-radius:26px;background:rgba(255,255,255,.18);' +
  'backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);box-shadow:0 14px 34px rgba(0,0,0,.25),inset 0 0 0 1px rgba(255,255,255,.22);display:grid;place-items:center;color:#fff;transition:top .5s cubic-bezier(.3,1.15,.45,1),transform .45s cubic-bezier(.3,1.4,.45,1)}' +
  '.hx-coin svg{width:38px;height:38px}.hx-r{font:800 40px/1 var(--font,inherit)}' +
  '.hx-coin.swap{animation:hx-pop .45s cubic-bezier(.3,1.5,.45,1)}@keyframes hx-pop{0%{transform:translate(-50%,-50%) scale(.6);opacity:.2}}' +
  '.hx-name{position:absolute;left:0;right:0;top:72%;text-align:center;color:#fff;font-weight:750;font-size:19px;letter-spacing:-.01em;opacity:0;transition:opacity .3s}' +
  '.hx[data-h="tall"] .hx-name.on{opacity:1}' +
  '.hx-sheet{position:relative;flex:1;margin-top:-26px;border-radius:26px 26px 0 0;background:var(--surface);padding:24px 22px calc(18px + env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:12px;overflow:auto}' +
  '.hx-in{display:flex;flex-direction:column;gap:12px;flex:1;animation:hx-up .42s cubic-bezier(.3,1.2,.45,1)}@keyframes hx-up{from{opacity:0;transform:translateY(16px)}}' +
  '.hx-t em{font-style:normal;color:var(--accent-fg)}.hx-t{font-size:23px;font-weight:750;letter-spacing:-.02em;line-height:1.2;margin:0}.hx-s{color:var(--muted);font-size:14.5px;line-height:1.5;margin:0}' +
  '.hx-c{text-align:center}.hx-sp{flex:1;min-height:8px}' +
  '.hx-btn{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;min-height:52px;border-radius:16px;border:0;font:700 15.5px/1 var(--font,inherit);cursor:pointer;transition:transform .2s cubic-bezier(.3,1.4,.45,1),opacity .2s}' +
  '.hx-btn:active{transform:scale(.97)}.hx-btn:disabled{opacity:.55}' +
  '.hx-pri{background:var(--accent,#0f9488);color:#fff}.hx-out{background:transparent;color:var(--ink);border:1.5px solid var(--chip-line)}' +
  '.hx-g{background:#fff;color:#1f1f1f;border:1px solid #dadce0;box-shadow:0 1px 2px rgba(0,0,0,.08)}' +
  '.hx-link{align-self:center;border:1px solid var(--chip-line);border-radius:12px;background:none;color:var(--ink-2);font:600 13.5px/1 var(--font,inherit);padding:10px 16px;cursor:pointer}' +
  '.hx-note{color:var(--muted);font-size:12px;text-align:center;line-height:1.45;margin:0}' +
  '.hx-err{min-height:18px;color:var(--bad);font-size:13.5px;text-align:center;margin:0}.hx-err.info{color:var(--muted)}' +
  '.hx-f{display:flex;flex-direction:column;gap:6px}.hx-f label{font-size:12px;font-weight:650;color:var(--muted);letter-spacing:.02em}' +
  '.hx-f input{height:52px;border-radius:14px;border:1px solid var(--chip-line);background:var(--surface-2);color:var(--ink);font:inherit;font-size:16px;padding:0 14px;width:100%;box-sizing:border-box}' +
  '.hx-f input:focus{outline:2px solid var(--accent);outline-offset:1px}' +
  '.hx-check{display:flex;gap:10px;align-items:flex-start;font-size:13.5px;line-height:1.4;padding:12px;border-radius:14px;background:var(--surface-2);border:1px solid var(--border)}.hx-check input{width:20px;height:20px;margin:1px 0 0;flex:none;accent-color:var(--accent)}' +
  '.hx-pins{display:flex;justify-content:center;gap:14px;margin:4px 0 6px}.hx-pins i{width:13px;height:13px;border-radius:50%;border:2px solid var(--chip-line);transition:background .15s,transform .2s cubic-bezier(.3,1.6,.45,1)}' +
  '.hx-pins i.on{background:var(--accent);border-color:var(--accent);transform:scale(1.15)}' +
  '.hx-keys{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.hx-keys button{height:58px;border-radius:18px;border:0;background:var(--surface-3);color:var(--ink);font:600 23px/1 var(--font,inherit);cursor:pointer;transition:transform .15s,background .15s}' +
  '.hx-keys button:active{transform:scale(.92);background:var(--pick-bg)}.hx-keys .k0{grid-column:2}.hx-keys .kx{font-size:16px;color:var(--muted)}' +
  '.hx-shake{animation:hx-shake .38s}@keyframes hx-shake{20%,60%{transform:translateX(-9px)}40%,80%{transform:translateX(9px)}}' +
  '.hx-fp{width:84px;height:84px;margin:6px auto 2px;border-radius:50%;display:grid;place-items:center;color:var(--accent-fg);position:relative;background:var(--pick-bg);border:0;cursor:pointer}' +
  '.hx-fp svg{width:42px;height:42px}.hx-fp::before,.hx-fp::after{content:"";position:absolute;inset:0;border-radius:50%;border:2px solid var(--accent-fg);opacity:0;animation:hx-ring 2.4s ease-out 3}.hx-fp::after{animation-delay:1.2s}' +
  '@keyframes hx-ring{0%{transform:scale(.85);opacity:.6}100%{transform:scale(1.7);opacity:0}}' +
  '.hx-spin{width:22px;height:22px;border-radius:50%;border:2.5px solid var(--grid);border-top-color:var(--accent);animation:ff-spin .8s linear infinite;margin:4px auto}' +
  '@media (prefers-reduced-motion:reduce){.hx *{animation:none !important;transition:none !important}}' +
  '</style>';
const lockGet = () => { try { return JSON.parse(localStorage.getItem(LKEY) || 'null'); } catch (e) { return null; } };
const lockSet = v => { try { if (v) localStorage.setItem(LKEY, JSON.stringify(v)); else localStorage.removeItem(LKEY); } catch (e) { /* ignore */ } };
async function pinHash(pin, salt) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ':' + pin));
  return Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join('');
}
const firstName = s => String(s || '').trim().split(/\s+/)[0] || '';
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const esc = s => App.esc(s);
const dark = () => document.documentElement.getAttribute('data-theme') === 'dark';
/* the phone's own bars: on the sign-in screens teal on top (the hero) and the card's colour at the bottom; afterwards
   the app's page colour. An app without separate colours (2.0) gets the card colour on both, never a teal strip under the card. */
const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const bars = hero => {
  const A = window.RuPeaceAndroid; if (!A) return;
  const page = dark() ? '#0e1012' : '#f5f8f8', card = cssVar('--surface') || (dark() ? '#16191c' : '#ffffff');
  try {
    if (hero && A.setBarColors) A.setBarColors('#0f9488', false, card, !dark());
    else if (A.setBars) A.setBars(dark(), hero ? card : page);
  } catch (e) { /* an older app */ }
};

/** The hero-card frame. box.show({hero: 'tall'|'mid'|'short', icon, name, body}) draws a step; box.close() takes it away. */
function heroBox(label) {
  if (!document.getElementById('rpHeroCss')) document.head.insertAdjacentHTML('beforeend', HERO_CSS);
  const box = document.createElement('div');
  box.className = 'hx'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', label);
  box.innerHTML = '<div class="hx-hero"><span class="hx-blob hx-b1"></span><span class="hx-blob hx-b2"></span><span class="hx-blob hx-b3"></span>' +
    '<div class="hx-coin"></div><div class="hx-name"></div></div><div class="hx-sheet"></div>';
  document.body.appendChild(box);
  bars(true);
  let icon = null;
  box.show = ({ hero, icon: ic, name, body }) => {
    box.dataset.h = hero || 'mid';
    const coin = box.querySelector('.hx-coin');
    if (ic !== icon) { icon = ic; coin.innerHTML = HICON[ic] || ''; coin.classList.remove('swap'); void coin.offsetWidth; coin.classList.add('swap'); }
    const nm = box.querySelector('.hx-name'); nm.textContent = name || ''; nm.classList.toggle('on', !!name);
    box.querySelector('.hx-sheet').innerHTML = '<div class="hx-in">' + body + '</div>';
    return box.querySelector('.hx-in');
  };
  box.err = (m, info) => { const e = box.querySelector('.hx-err'); if (e) { e.textContent = m || ''; e.classList.toggle('info', !!info); } };
  box.busy = on => box.querySelectorAll('.hx-sheet button,.hx-sheet input').forEach(x => { x.disabled = on; });
  box.close = () => { bars(false); box.animate([{ opacity: 1 }, { opacity: 0, transform: 'scale(1.02)' }], { duration: 220, easing: 'ease-in' }).onfinish = () => box.remove(); };
  return box;
}

/** A PIN pad: resolves the digits typed (4 to 6). */
function pinPad(box, { title, sub, icon, extra }) {
  return new Promise(resolve => {
    let v = '';
    const inn = box.show({ hero: 'short', icon: icon || 'lock', body:
      '<p class="hx-t hx-c">' + title + '</p>' + (sub ? '<p class="hx-s hx-c">' + sub + '</p>' : '') +
      '<div class="hx-pins" aria-hidden="true">' + '<i></i>'.repeat(6) + '</div><p class="hx-err" role="alert"></p><div class="hx-sp"></div>' +
      '<div class="hx-keys">' + [1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => '<button type="button" data-d="' + d + '">' + d + '</button>').join('') +
      '<button type="button" class="kx" data-ok>OK</button><button type="button" data-d="0">0</button><button type="button" class="kx" data-del aria-label="Delete">⌫</button></div>' + (extra || '') });
    const dots = [...inn.querySelectorAll('.hx-pins i')];
    const draw = () => dots.forEach((d, i) => d.classList.toggle('on', i < v.length));
    inn.querySelector('.hx-keys').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.d !== undefined && v.length < 6) v += b.dataset.d;
      if (b.hasAttribute('data-del')) v = v.slice(0, -1);
      draw();
      if (b.hasAttribute('data-ok') || v.length === 6) { if (v.length >= 4) resolve(v); else box.err('A PIN is 4 to 6 digits.'); }
    });
    box.pinReset = msg => { v = ''; draw(); box.err(msg || ''); const p = inn.querySelector('.hx-pins'); p.classList.remove('hx-shake'); void p.offsetWidth; p.classList.add('hx-shake'); };
  });
}

/** Sets this phone's PIN, then offers fingerprint / face. */
async function pinSetup(box) {
  for (;;) {
    const a = await pinPad(box, { title: 'Create a PIN', sub: 'For this phone only. Handy when fingerprint isn’t.' });
    const b = await pinPad(box, { title: 'Once more', sub: 'Type the same PIN again.' });
    if (a === b) { const salt = uid(); lockSet({ salt, hash: await pinHash(a, salt), bio: false, fails: 0 }); break; }
    box.pinReset("The two PINs didn't match. Let's start again.");
    await new Promise(r => setTimeout(r, 1100));
  }
  const bio = (RPDrive.features && RPDrive.features.biometric) || '';
  if (bio === 'ready' || bio === 'device') {
    const yes = await new Promise(resolve => {
      const inn = box.show({ hero: 'mid', icon: 'fp', body:
        '<p class="hx-t">Open with a touch</p>' +
        '<p class="hx-s">' + (bio === 'ready' ? 'Use your fingerprint or face. Your PIN stays as a backup.' : 'Use your phone’s own screen lock. Your PIN stays as a backup.') + '</p>' +
        '<div class="hx-feats">' + feat('bolt', 'Opens in a second', 'No typing every time') + feat('lock', 'Stays on this phone', 'RuPeace never sees your fingerprint') + '</div>' +
        '<p class="hx-err" role="alert"></p><div class="hx-sp"></div>' +
        '<button class="hx-btn hx-pri" type="button" data-y>Turn on fingerprint</button><button class="hx-btn hx-out" type="button" data-n>Maybe later</button>' });
      inn.querySelector('[data-y]').onclick = async () => {
        const r = await RPDrive.native('biometric', { title: 'Turn on fingerprint unlock', subtitle: 'Touch the sensor or look at the phone' });
        if (r.ok) resolve(true); else if (!r.cancelled) box.err(r.error || 'That didn’t work. Try again, or choose Maybe later.');
      };
      inn.querySelector('[data-n]').onclick = () => resolve(false);
    });
    const st = lockGet(); st.bio = yes; lockSet(st);
  }
}

/** The lock: fingerprint first if it is on, the PIN otherwise. Five wrong PINs: sign in with Google again. */
let locking = null, hiddenAt = 0;
const LOCK_AFTER = 120000;
function appLock() {
  if (locking) return locking;
  const st = lockGet();
  if (!st) {                                                       // a family but no PIN yet on this phone
    locking = (async () => { const box = heroBox('Set a PIN'); await pinSetup(box); box.close(); })().finally(() => { locking = null; });
    return locking;
  }
  locking = new Promise(done => {
    const box = heroBox('Unlock RuPeace');
    const name = (fam && fam.name) || 'RuPeace';
    const open = () => { const s = lockGet(); s.fails = 0; lockSet(s); box.close(); done(); };
    const tryBio = async () => {
      const r = await RPDrive.native('biometric', { title: 'Unlock RuPeace', subtitle: name });
      if (r.ok) open();
    };
    const bioView = () => {
      const inn = box.show({ hero: 'tall', icon: 'rupee', name, body:
        '<p class="hx-s hx-c">Welcome back</p><button class="hx-fp" type="button" data-bio aria-label="Unlock with fingerprint">' + HICON.fp + '</button>' +
        '<p class="hx-s hx-c" style="font-size:13px">Touch the sensor</p><div class="hx-sp"></div><button class="hx-link" type="button" data-pin>Use PIN</button>' });
      inn.querySelector('[data-bio]').onclick = tryBio;
      inn.querySelector('[data-pin]').onclick = ask;
      tryBio();
    };
    const ask = async () => {
      const pin = await pinPad(box, { title: 'Enter your PIN', sub: esc(name), icon: 'rupee', extra: st.bio ? '<button class="hx-link" type="button" data-usebio>Use fingerprint</button>' : '' });
      const s = lockGet();
      if ((await pinHash(pin, s.salt)) === s.hash) return open();
      s.fails = (s.fails || 0) + 1; lockSet(s);
      if (s.fails >= 5) {                                          // too many: prove it is you with Google again
        lockSet(null); box.close();
        try { await RPDrive.signOut(); } catch (e) { /* ignore */ }
        await driveSignIn(true);
        done(); return;
      }
      box.pinReset('Wrong PIN. ' + (5 - s.fails) + (5 - s.fails === 1 ? ' try left.' : ' tries left.'));
      ask();
    };
    box.addEventListener('click', e => { if (e.target.closest('[data-usebio]')) bioView(); });
    if (st.bio) bioView(); else ask();
  }).finally(() => { locking = null; hiddenAt = 0; });
  return locking;
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') hiddenAt = Date.now(); });
/* Settings → Security (core/phone-settings.js S.security) */
App.familyEmail = () => (fam && fam.email) || '';
/* Account → Delete my RuPeace data (core/phone-settings.js): the owner's family file goes to the Drive bin (and the
   backups folder, if asked); someone who joined leaves the family. Google access is revoked and the phone starts over. */
App.deleteMyData = DRIVE ? async withBackups => {
  if (!fam) throw new Error('Sign in first.');
  if (local && local.status().pending) { try { await local.sync(); } catch (e) { /* going anyway */ } }
  resetting = true;
  let r;
  try { r = await RPDrive.deleteMine(fam.id, !!withBackups); } catch (e) { resetting = false; throw e; }
  showSplash('Deleting…');
  if (local) await local.clear();
  try { await RPDrive.signOut(); } catch (e) { /* ignore */ }
  try { localStorage.clear(); sessionStorage.clear(); } catch (e) { /* ignore */ }
  location.replace(location.pathname);
  return r;
} : null;
App.security = DRIVE ? {
  state: () => { const b = (RPDrive.features && RPDrive.features.biometric) || ''; return { bio: !!(lockGet() || {}).bio, bioAvailable: b === 'ready' || b === 'device' }; },
  lockNow: () => appLock(),
  setBio: async on => {
    const st = lockGet(); if (!st) return false;
    if (on) { const r = await RPDrive.native('biometric', { title: 'Turn on fingerprint unlock', subtitle: 'Touch the sensor or look at the phone' }); if (!r.ok) return false; }
    st.bio = !!on; lockSet(st); return true;
  },
  changePin: async () => {
    const st = lockGet(); if (!st) return false;
    const box = heroBox('Change PIN');
    try {
      for (let tries = 0; ; tries++) {                               // the current PIN first
        const cur = await pinPad(box, { title: 'Current PIN', sub: 'To change it, type the PIN you use now.' });
        if ((await pinHash(cur, st.salt)) === st.hash) break;
        if (tries >= 4) { box.close(); App.toast('Too many tries. Try again later.', true); return false; }
        box.pinReset('That isn’t your PIN. Try again.');
        await new Promise(r => setTimeout(r, 900));
      }
      for (;;) {
        const a = await pinPad(box, { title: 'New PIN', sub: '4 to 6 digits, for this phone only.' });
        const b = await pinPad(box, { title: 'Once more', sub: 'Type the new PIN again.' });
        if (a === b) { const salt = uid(); const s2 = lockGet(); s2.salt = salt; s2.hash = await pinHash(a, salt); s2.fails = 0; lockSet(s2); break; }
        box.pinReset("The two PINs didn't match. Let's start again.");
        await new Promise(r => setTimeout(r, 1000));
      }
      box.close(); return true;
    } catch (e) { box.close(); return false; }
  },
} : null;
/* the phone's bars follow the app's light / dark look (Settings → Look, or the phone's own setting) */
if (typeof App.applyTheme === 'function') {
  const applyTheme = App.applyTheme;
  App.applyTheme = () => { applyTheme(); if (!document.querySelector('.hx')) setTimeout(() => bars(false), 0); };
  setTimeout(() => { if (!document.querySelector('.hx')) bars(false); }, 0);
}
window.RuPeaceResume = () => { if (DRIVE && fam && hiddenAt && Date.now() - hiddenAt > LOCK_AFTER) appLock(); };

/** First time on this phone (or after five wrong PINs, again: `again`): Google, the family file, the PIN. */
let dpending = null;
function driveSignIn(again) {
  if (dpending) return dpending;
  dpending = new Promise(done => {
    const box = heroBox('Sign in to RuPeace');
    let me = null;

    const welcome = () => {
      const inn = box.show({ hero: 'mid', icon: 'rupee', body:
        '<p class="hx-t">' + (again ? 'Let’s make sure it’s you' : 'Track your Rupees, with <em>RuPeace</em>.') + '</p>' +
        '<p class="hx-s">' + (again ? 'Too many wrong PINs. Sign in with Google, then create a new PIN.' : 'Money matters, made peaceful.') + '</p>' +
        (again ? '' : '<div class="hx-feats">' + feat('coin', 'Smarter spending', 'Every rupee, and what’s left to spend') +
          feat('family', 'Built for every family', 'One home, one data point') + feat('lock', 'Your data, only with you', 'Data on your G Drive') + '</div>') +
        '<p class="hx-err" role="alert"></p><div class="hx-sp"></div>' +
        '<button class="hx-btn hx-g" type="button" data-g>' + G_ICON + '<span>Continue with Google</span></button>' +
        '<p class="hx-note">RuPeace only gets your name and email from Google.</p>' });
      inn.querySelector('[data-g]').onclick = google;
    };
    const google = async () => {
      box.busy(true); box.err('');
      try { me = await RPDrive.signIn(); }
      catch (e) { box.busy(false); if (!e.cancelled) box.err(e.message); return; }
      try { await RPDrive.allow(); }
      catch (e) { box.busy(false); box.err(e.message); return; }
      look();
    };
    const look = async () => {
      const inn = box.show({ hero: 'mid', icon: 'drive', body:
        '<p class="hx-t">Welcome, ' + esc(firstName(me.name) || me.email) + '</p><p class="hx-s">Looking for your family in Google Drive…</p>' +
        '<div class="hx-spin" aria-hidden="true"></div><p class="hx-err" role="alert"></p>' });
      let files = [];
      try { files = await RPDrive.find(); }
      catch (e) {
        box.err(e.message);
        inn.querySelector('.hx-spin').remove();
        inn.insertAdjacentHTML('beforeend', '<div class="hx-sp"></div><button class="hx-btn hx-pri" type="button" data-again>Try again</button>');
        inn.querySelector('[data-again]').onclick = look;
        return;
      }
      if (fam && files.some(f => f.id === fam.id)) return go(() => connect(fam.id, false));
      if (files.length) return go(() => connect(files[0].id, false));
      startOrJoin();
    };
    const startOrJoin = () => {
      const inn = box.show({ hero: 'tall', icon: 'family', body:
        '<p class="hx-t">Welcome, ' + esc(firstName(me.name) || '') + '</p><p class="hx-s">Let’s get your family set up. Are you starting fresh or joining in?</p>' +
        '<div class="hx-feats" style="gap:10px">' + choice('data-new', 'plus', 'Start fresh', 'Set up RuPeace for your family', true) +
        choice('data-join', 'key', 'Join in', 'Your family already uses RuPeace', false) + '</div><p class="hx-err" role="alert"></p>' });
      inn.querySelector('[data-new]').onclick = newFamily;
      inn.querySelector('[data-join]').onclick = join;
    };
    const newFamily = () => {
      const inn = box.show({ hero: 'short', icon: 'family', body:
        '<p class="hx-t">Name your family</p><p class="hx-s">It’s shown at the top of RuPeace and on your family file in Drive.</p>' +
        '<form class="hx-in" style="animation:none;gap:12px" novalidate><div class="hx-f"><label for="hxFam">Family name</label><input id="hxFam" maxlength="40" value="' + esc(firstName(me.name) ? firstName(me.name) + '’s family' : 'Our family') + '"></div>' +
        (legacyToken ? '<label class="hx-check"><input type="checkbox" id="hxBring"><span>Bring over everything from the RuPeace I use now: entries, accounts, loans, savings…</span></label>' : '') +
        '<p class="hx-err" role="alert"></p><div class="hx-sp"></div><button class="hx-btn hx-pri" type="submit">Create</button></form>' +
        '<button class="hx-link" type="button" data-back>Back</button>' });
      inn.querySelector('[data-back]').onclick = startOrJoin;
      inn.querySelector('form').onsubmit = async e => {
        e.preventDefault();
        const name = inn.querySelector('#hxFam').value.trim() || 'Our family', bring = !!(inn.querySelector('#hxBring') || {}).checked;
        box.busy(true);
        try {
          let tables = null;
          if (bring) {
            box.err('Copying your current RuPeace…', true);
            const res = await postWeb({ batch: [{ method: 'GET', url: '/api/export' }], token: legacyToken });
            if (!res || !res[0] || !res[0].ok) throw new Error((res && res[0] && res[0].error) || 'Could not copy the current RuPeace. Try again, or untick it.');
            tables = res[0].data.tables;
          }
          box.err('Making your family file in Google Drive…', true);
          const id = await RPDrive.create(name, me);
          if (tables) { box.err('Putting everything in it…', true); await RPDrive.importAll(id, tables); }
          await connect(id, true, name);
        } catch (ex) { box.busy(false); box.err(ex.message); }
      };
    };
    const join = () => {
      const inn = box.show({ hero: 'short', icon: 'key', body:
        '<p class="hx-t">Join your family</p><p class="hx-s">Ask whoever set up RuPeace for your family code (Settings → Family → Invite) and paste it here.</p>' +
        '<form class="hx-in" style="animation:none;gap:12px" novalidate><div class="hx-f"><label for="hxCode">Family code</label><input id="hxCode" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Paste the code"></div>' +
        '<p class="hx-err" role="alert"></p><div class="hx-sp"></div><button class="hx-btn hx-pri" type="submit">Join</button></form>' +
        '<button class="hx-link" type="button" data-back>Back</button>' });
      inn.querySelector('[data-back]').onclick = startOrJoin;
      inn.querySelector('form').onsubmit = e => {
        e.preventDefault();
        const code = inn.querySelector('#hxCode').value.trim().replace(/^.*\/d\/([\w-]+).*$/, '$1');
        if (code.length < 20) { box.err('That code looks too short. Copy the whole code.'); return; }
        box.busy(true); box.err('Joining…', true);
        connect(code, false).catch(ex => { box.busy(false); box.err(ex.message); });
      };
    };
    const go = fn => fn().catch(ex => { startOrJoin(); box.err(ex.message); });
    /** this phone joins family file `id`: a first copy, this person found by their Google email (or added), the PIN */
    const connect = async (id, owner, famName) => {
      const info = await RPDrive.open(id);
      const first = await RPDrive.call(id, 'POST', '/api/sync', { device: 'setup-' + uid(), since: 0, changes: [] }, null);
      if (!first.ok) throw new Error(first.error);
      const people = ((first.data.tables || {}).people || []);
      const mail = String(me.email || '').toLowerCase();
      let p = people.find(x => String(x.email || '').toLowerCase() === mail);
      if (!p && owner && people.length) p = people.find(x => /^self$/i.test(x.relation || '')) || null;     // brought over: that is me
      let pid = p ? p.id : null;
      if (!pid) {
        const add = await RPDrive.call(id, 'POST', '/api/sync', { device: 'setup-' + uid(), since: first.data.seq || 0, changes: [{ cid: uid(), at: new Date().toISOString(),
          table: 'people', key: -1, before: null, after: { id: -1, name: me.name || firstName(me.email), relation: owner ? 'Self' : 'Other', email: me.email, earns: owner ? 1 : 0, active: 1, sort: 0 } }] }, null);
        if (!add.ok) throw new Error(add.error);
        pid = add.data.idmap && add.data.idmap.people ? add.data.idmap.people['-1'] : null;
        if (!pid) throw new Error('Could not add you to the family. Try again.');
      }
      saveFam({ id, name: famName || info.name, email: me.email, person: pid, gname: me.name || '', photo: me.photo || '', photoAt: Date.now() });
      App.profile = { name: me.name || '', photo: me.photo || '' };
      token = 'drive'; savePerson(pid);
      if (local) await local.clear();
      if (!lockGet()) await pinSetup(box);
      box.close();
      dpending = null;
      done({ id: pid });
    };
    welcome();
  });
  return dpending;
}
})();
