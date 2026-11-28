/* RuPeace offline mode — sync UI (OFFLINE.md, Contract 3).
   Status chip, yellow "not synced yet" marks on ledger rows, the "N changes need you" card and the sort-out sheet.
   Uses only App.sync (Contract 2) and core helpers; does nothing until App.sync exists.
   Loads after core.js, the screens and bridge.js, before App.boot() (google/web_build.py). */
(function () {
'use strict';
const App = window.App;
if (!App) return;
const esc = App.esc;
const on = () => !!(App.sync && typeof App.sync.status === 'function');
const SVG = p => '<svg viewBox="0 0 24 24" aria-hidden="true">' + p + '</svg>';
const I = {
  off: SVG('<path d="M2 2l20 20"/><path d="M8.5 16.5a5 5 0 0 1 7 0"/><path d="M5 12.9a10 10 0 0 1 5.2-2.8M19 12.9a10 10 0 0 0-2.5-1.7"/><path d="M2 8.8a15 15 0 0 1 4.2-2.6M22 8.8A15 15 0 0 0 11 5"/><path d="M12 20h.01"/>'),
  spin: SVG('<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/>'),
  warn: SVG('<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>'),
  up: SVG('<path d="M12 19V5M6 11l6-6 6 6"/>'),
  merge: SVG('<path d="M6 3v6a6 6 0 0 0 6 6h6"/><path d="M15 12l3 3-3 3"/><circle cx="6" cy="3" r="0"/><path d="M18 3v6"/>'),
  check: SVG('<path d="M5 12.5 10 17 19 7"/>'),
};

/* ---------- status chip ---------- */
let syncingSince = 0, slowTimer = null;
const chipState = () => {
  if (!on()) return null;
  let s = {};
  try { s = App.sync.status() || {}; } catch (e) { return null; }
  const n = Number(s.pending) || 0;
  if (s.error) return { k: 'bad', icon: I.warn, text: 'Sync problem — tap to retry', err: String(s.error), act: 'retry' };
  if (s.online === false) return { k: 'warn', icon: I.off, text: 'Offline' + (n ? ' · ' + n + ' to sync' : ''), act: 'offline' };
  if (s.syncing) {
    // the quiet background check every minute is not worth a chip: show "Syncing…" when changes are going up or it takes a while
    if (!syncingSince) { syncingSince = Date.now(); clearTimeout(slowTimer); slowTimer = setTimeout(paint, 900); }
    if (n || Date.now() - syncingSince >= 800) return { k: 'busy', icon: I.spin, text: 'Syncing…', act: null };
    return null;
  }
  syncingSince = 0;
  if (n) return { k: 'idle', icon: I.up, text: n + ' to sync', act: 'retry' };
  return null;
};
const chipHtml = st => '<button type="button" class="sy-chip ' + st.k + '" data-sync-act="' + (st.act || '') + '"' + (st.act ? '' : ' aria-disabled="true"') +
  (st.err ? ' title="' + esc(st.err) + '"' : '') + ' aria-label="' + esc(st.text + (st.err ? ': ' + st.err : '')) + '">' +
  '<span class="sy-pill">' + st.icon + '<span>' + esc(st.text) + '</span></span></button>' +
  (st.err ? '<span class="sy-err" title="' + esc(st.err) + '">' + esc(st.err) + '</span>' : '');

/* the avatar menu's sync line: what is going on, and Sync now */
const ago = iso => { const m = Math.round((Date.now() - Date.parse(iso || 0)) / 60000); return !iso ? '' : m < 1 ? 'just now' : m < 60 ? m + ' min ago' : Math.round(m / 60) + 'h ago'; };
function menuHtml() {
  let s = {};
  try { s = App.sync.status() || {}; } catch (e) { s = {}; }
  const n = Number(s.pending) || 0;
  if (App.sync.mode && App.sync.mode() === 'remote') {
    return '<span class="sy-dot warn"></span><span class="sy-mt"><b>No copy on this phone yet</b><small>So every screen waits for Google, which is slow. RuPeace keeps trying by itself; you can also do it now.</small></span>' +
      '<button type="button" class="btn small" data-sync-act="rebuild">Make a copy now</button>';
  }
  const line = s.error ? 'Sync problem: ' + s.error : s.online === false ? 'Offline' + (n ? ' · ' + n + ' change' + (n > 1 ? 's' : '') + ' waiting on this phone' : ' · everything is saved on this phone')
    : s.syncing ? 'Syncing with Google…' : n ? n + ' change' + (n > 1 ? 's' : '') + ' waiting to go to Google' : 'Everything is on Google' + (s.lastSync ? ' · ' + ago(s.lastSync) : '');
  const fast = App.sync.mode && App.sync.mode() === 'local';
  return '<span class="sy-dot ' + (s.error ? 'bad' : s.online === false || n ? 'warn' : 'ok') + '"></span><span class="sy-mt"><b>' + esc(line) + '</b>' +
    '<small>' + (fast ? 'This phone has its own copy, so screens open at once. ' : '') + 'Changes are saved on this phone first, then shared with the Google Sheet in the background.</small></span>' +
    (s.online === false ? '' : '<button type="button" class="btn small" data-sync-act="retry"' + (s.syncing ? ' disabled' : '') + '>Sync now</button>');
}

/* the Account page: one short line under the name, and a round Sync now button (core/phone-settings.js) */
function lineHtml() {
  let s = {};
  try { s = App.sync.status() || {}; } catch (e) { s = {}; }
  const n = Number(s.pending) || 0;
  const t = App.sync.mode && App.sync.mode() === 'remote' ? 'No copy on this phone yet' : s.error ? 'Sync problem: ' + s.error : s.online === false ? 'Offline' + (n ? ' · ' + n + ' waiting' : '')
    : s.syncing ? 'Syncing…' : n ? n + ' change' + (n > 1 ? 's' : '') + ' waiting' : 'Synced' + (s.lastSync ? ' ' + ago(s.lastSync) : '');
  return '<i class="sy-dot ' + (s.error ? 'bad' : s.online === false || n || (App.sync.mode && App.sync.mode() === 'remote') ? 'warn' : 'ok') + '"></i>' + esc(t);
}
const busyNow = () => { try { return !!(App.sync.status() || {}).syncing; } catch (e) { return false; } };

/* ---------- conflicts ---------- */
const list = () => { if (!on() || typeof App.sync.conflicts !== 'function') return []; try { return App.sync.conflicts() || []; } catch (e) { return []; } };
const nNeed = n => n + ' change' + (n > 1 ? 's' : '') + ' need' + (n > 1 ? '' : 's') + ' you';
const whoElse = () => { const names = [...new Set(list().map(c => c.theirs_by_name).filter(Boolean))]; return names.length === 1 ? names[0] : names.length ? names.join(' and ') : 'someone else'; };
const cardHtml = n => '<div class="sy-need" role="region" aria-label="' + esc(nNeed(n)) + '"><span class="sy-need-ic">' + I.merge + '</span>' +
  '<span class="sy-need-t"><b>' + esc(nNeed(n)) + '</b><span>You and ' + esc(whoElse()) + ' changed the same thing while offline. Pick what to keep.</span></span>' +
  '<button type="button" class="btn primary sy-need-go" data-sync-sort>Sort them out</button></div>';

/* ---------- painting the page (idempotent: safe to run after every redraw and every App.sync change) ---------- */
const marks = () => {
  if (!on() || typeof App.sync.isPending !== 'function') return;
  const main = document.getElementById('main'); if (!main) return;
  const pend = id => { try { return !!App.sync.isPending('entries', Number(id)); } catch (e) { return false; } };
  main.querySelectorAll('.ph-home [data-eid], .ph-ledger [data-eid]').forEach(r => {
    const p = pend(r.dataset.eid);
    if (r.classList.contains('sy-pend') !== p) {
      r.classList.toggle('sy-pend', p);
      const al = (r.getAttribute('aria-label') || '').replace(/, not synced yet$/, '');
      r.setAttribute('aria-label', al + (p ? ', not synced yet' : ''));
    }
  });
};
function paint() {
  if (!on()) return;
  subscribe();
  const st = chipState(), n = list().length;
  // the status sits on the avatar: a turning ring while changes go up, a dot when offline or waiting, red on a
  // problem. It never takes a row of its own, so nothing on the screen moves. The avatar menu says more.
  let pend = 0;
  try { pend = Number((App.sync.status() || {}).pending) || 0; } catch (e) { pend = 0; }
  document.querySelectorAll('.ph-av').forEach(a => {
    const k = st ? st.k : '';
    if (a.dataset.sync !== k) a.dataset.sync = k;
    const cnt = st && (st.k === 'warn' || st.k === 'idle') && pend ? String(pend > 9 ? '9+' : pend) : st && st.k === 'bad' ? '!' : '';
    if (a.dataset.n !== cnt) a.dataset.n = cnt;
    a.setAttribute('aria-label', 'Menu: settings and theme' + (st ? '. ' + st.text : ''));
  });
  document.querySelectorAll('[data-sync-line]').forEach(l => { const html = lineHtml(); if (l.dataset.html !== html) { l.dataset.html = html; l.innerHTML = html; } });
  document.querySelectorAll('[data-sync-round]').forEach(b => { b.classList.toggle('busy', busyNow()); });
  const mr = document.querySelector('[data-sync-menu]');
  if (mr) { const html = menuHtml(); if (mr.dataset.html !== html) { mr.dataset.html = html; mr.innerHTML = html; } }
  document.querySelectorAll('[data-sync-card]').forEach(h => {
    const html = n ? cardHtml(n) : '';
    if (h.dataset.html !== html) { h.dataset.html = html; h.innerHTML = html; }
    h.hidden = !n;
  });
  marks();
  if (sheet) sheet.sync();
}

/* re-mark rows when a screen redraws part of itself */
let mo = null, moQueued = false;
const watchRows = () => {
  if (mo || !window.MutationObserver) return;
  const main = document.getElementById('main'); if (!main) return;
  mo = new MutationObserver(() => { if (moQueued) return; moQueued = true; requestAnimationFrame(() => { moQueued = false; marks(); }); });
  mo.observe(main, { childList: true, subtree: true });
};
let unsub = null, subscribedTo = null;
function subscribe() {
  if (!on() || subscribedTo === App.sync) return;
  if (unsub) { try { unsub(); } catch (e) { /* ignore */ } }
  subscribedTo = App.sync;
  try { unsub = App.sync.onChange(() => paint()) || null; } catch (e) { unsub = null; }
  watchRows();
}

/* ---------- the sort-out sheet ---------- */
const TBL = { category_id: 'categories', account_id: 'accounts', to_account_id: 'accounts', person_id: 'people', loan_id: 'loans', savings_id: 'savings', place_id: 'savings', owner_id: 'people', borrower_id: 'people' };
const fmt = (name, v) => {
  if (v == null || v === '') return '—';
  if (typeof v === 'number' && TBL[name]) return App.nameOf(TBL[name], v) || '#' + v;
  if (typeof v === 'number' && /amount|emi|value|target|balance|principal|limit/.test(name)) return App.inr(v);
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return App.date(v);
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (name === 'active') return Number(v) ? 'Active' : 'Inactive';
  return String(v);
};
const when = iso => {
  if (!iso) return '';
  const d = new Date(iso); if (isNaN(d)) return '';
  const hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  const day = App.ymd(d), t = App.ymd(new Date()), y = App.ymd(new Date(Date.now() - 864e5));
  return (day === t ? 'today' : day === y ? 'yesterday' : d.getDate() + ' ' + App.MN[d.getMonth()]) + ', ' + hm;
};
const REASON = { field: 'newer change', duplicate: 'looks like the same expense', deleted_theirs: 'bring it back', edited_theirs: 'keep their edit' };
const HEAD = {
  field: c => 'You and ' + c.theirs_by_name + ' both changed this',
  duplicate: c => 'You and ' + c.theirs_by_name + ' may have added the same thing',
  deleted_theirs: c => 'You changed this, ' + c.theirs_by_name + ' deleted it',
  edited_theirs: c => 'You deleted this, ' + c.theirs_by_name + ' changed it',
};
const choiceLabel = (c, k) => ({
  mine: 'Keep mine', theirs: c.kind === 'edited_theirs' ? 'Keep ' + c.theirs_by_name + '’s edit' : 'Keep ' + c.theirs_by_name + '’s',
  one: 'Keep one', both: 'Keep both', keep: 'Bring it back', delete: c.kind === 'deleted_theirs' ? 'Leave it deleted' : 'Delete it',
}[k] || App.label(k));
/* the reason in plain words; when it only repeats the button ("bring it back"), say what would be lost instead */
const LOST = { deleted_theirs: () => 'otherwise your change is lost', edited_theirs: c => 'otherwise ' + c.theirs_by_name + '’s change is lost' };
const why = (c, reason) => {
  const norm = s => String(s || '').toLowerCase().replace(/[’']s\b/g, '').replace(new RegExp('\\b' + String(c.theirs_by_name).toLowerCase().replace(/[^\w ]/g, '') + '\\b', 'g'), 'their').replace(/\btheir\b/g, '').replace(/\s+/g, ' ').trim();
  if (reason && norm(reason) !== norm(choiceLabel(c, c.suggestion))) return reason;
  return LOST[c.kind] ? LOST[c.kind](c) : reason;
};
const sideOf = (c, k) => (k === 'mine' || k === 'keep' ? 'mine' : k === 'theirs' ? 'theirs' : k === 'delete' ? (c.kind === 'deleted_theirs' ? 'theirs' : 'mine') : null);
const side = (c, who, whoName, at) => {
  const deleted = (who === 'mine' && c.kind === 'edited_theirs') || (who === 'theirs' && c.kind === 'deleted_theirs');
  const sug = sideOf(c, c.suggestion) === who;
  const fs = c.fields || [];
  return '<div class="sy-side' + (sug ? ' sug' : '') + '"><div class="sy-who"><b>' + esc(whoName) + '</b><span>' + esc(when(at)) + '</span></div>' +
    (deleted ? '<div class="sy-del">Deleted</div>'
      : fs.length ? fs.map(f => { const v = who === 'mine' ? f.mine : f.theirs; return '<div class="sy-f"><span>' + esc(f.label || App.label(f.name)) + '</span><b>' + esc(fmt(f.name, v)) + '</b></div>'; }).join('')
      : '<div class="sy-f"><b>' + esc(who === 'mine' ? 'Your version' : 'Their version') + '</b></div>') +
    (sug ? '<span class="sy-sugtag">Suggested</span>' : '') + '</div>';
};
const conflictCard = c => {
  c = Object.assign({}, c, { theirs_by_name: c.theirs_by_name || 'someone else' });
  const reason = c.reason || REASON[c.kind] || '';
  const choices = (c.choices && c.choices.length ? c.choices : ['mine', 'theirs']);
  return '<article class="sy-card" data-cid="' + esc(c.id) + '">' +
    '<div class="sy-hd"><b>' + esc(c.label || App.label(c.table)) + '</b><span>' + esc((HEAD[c.kind] || HEAD.field)(c)) + '</span></div>' +
    '<div class="sy-sides">' + side(c, 'mine', 'You', c.mine_at) + side(c, 'theirs', c.theirs_by_name, c.theirs_at) + '</div>' +
    (c.suggestion ? '<div class="sy-why">' + I.check + '<span>Suggested: <b>' + esc(choiceLabel(c, c.suggestion)) + '</b>' + (why(c, reason) ? ' — ' + esc(why(c, reason)) : '') + '</span></div>' : '') +
    '<div class="sy-acts">' + choices.map(k => '<button type="button" class="btn' + (k === c.suggestion ? ' primary' : '') + '" data-choice="' + esc(k) + '">' + esc(choiceLabel(c, k)) + '</button>').join('') + '</div>' +
    '<div class="sy-cerr" role="alert"></div></article>';
};

let sheet = null;
const openSheet = () => {
  if (!on()) return;
  if (sheet) return;
  const busy = new Set(), gone = new Set();
  const d = App.bsheet({
    title: 'Sort out changes', cls: 'sy-sheet',
    body: '<p class="sy-intro" data-intro></p><div class="sy-cards" data-cards></div>' +
      '<div class="sy-done" data-done hidden><span class="sy-done-ic">' + I.check + '</span><b>All sorted</b><span>Everything is in step with the shared sheet again.</span></div>' +
      '<div class="sy-foot"><button type="button" class="btn" data-later>Later</button></div>',
    onClose: () => { sheet = null; },
  });
  const box = d.querySelector('[data-cards]'), intro = d.querySelector('[data-intro]'), doneEl = d.querySelector('[data-done]'), later = d.querySelector('[data-later]');
  const draw = () => {
    const cs = list().filter(c => !gone.has(String(c.id)));
    const ids = new Set(cs.map(c => String(c.id)));
    box.querySelectorAll('[data-cid]').forEach(el => { if (!ids.has(el.dataset.cid) && !busy.has(el.dataset.cid) && !el.classList.contains('out')) el.remove(); });
    cs.forEach(c => { if (!box.querySelector('[data-cid="' + CSS.escape(String(c.id)) + '"]')) box.insertAdjacentHTML('beforeend', conflictCard(c)); });
    const left = box.querySelectorAll('[data-cid]:not(.out)').length;
    intro.textContent = left ? 'You were both offline and changed the same thing. For each one, pick what to keep. The suggestion is highlighted.' : '';
    intro.hidden = !left;
    doneEl.hidden = !!left || !!box.querySelector('.out');
    later.textContent = left ? 'Later' : 'Done';
    later.classList.toggle('primary', !left);
  };
  box.addEventListener('click', async e => {
    const b = e.target.closest('[data-choice]'); if (!b) return;
    const card = b.closest('[data-cid]'), id = card.dataset.cid;
    if (busy.has(id)) return;
    busy.add(id);
    card.querySelectorAll('[data-choice]').forEach(x => { x.disabled = true; });
    b.classList.add('wait');
    const err = card.querySelector('.sy-cerr'); err.textContent = '';
    const c = list().find(x => String(x.id) === id);
    try {
      await App.sync.resolve(c ? c.id : id, b.dataset.choice);
      gone.add(id);
      card.classList.add('out');
      const rm = () => { card.remove(); busy.delete(id); draw(); };
      card.addEventListener('animationend', rm, { once: true });
      setTimeout(() => { if (card.isConnected) rm(); }, 400);
    } catch (ex) {
      busy.delete(id);
      err.textContent = (ex && ex.message) || 'That did not work. Try again.';
      card.querySelectorAll('[data-choice]').forEach(x => { x.disabled = false; });
      b.classList.remove('wait');
    }
  });
  later.onclick = () => d.close2();
  sheet = { sync: draw };
  draw();
};

/* ---------- clicks: chip (retry / offline note) and "Sort them out" ---------- */
document.addEventListener('click', e => {
  if (!on()) return;
  if (e.target.closest('[data-sync-sort]')) return openSheet();
  const c = e.target.closest('[data-sync-act]');
  if (!c) return;
  const act = c.dataset.syncAct;
  if (act === 'offline') return App.toast('Saved on this phone. It syncs by itself when you are back online.');
  if (act === 'rebuild' && App.sync.rebuild) { const m = document.querySelector('dialog[open].menu'); if (m && m.close2) m.close2(); return App.sync.rebuild(); }
  if (act === 'retry' && typeof App.sync.syncNow === 'function') {
    if (c.hasAttribute('data-sync-round') && App.sync.mode && App.sync.mode() === 'remote' && App.sync.rebuild) return App.sync.rebuild();
    c.disabled = true; c.classList.add('busy');
    Promise.resolve().then(() => App.sync.syncNow()).catch(ex => App.toast((ex && ex.message) || 'Still could not sync', true)).then(() => { c.disabled = false; paint(); });
  }
});

/* after every redraw, fill the hosts and mark rows (App.refresh is looked up at boot, so wrapping it here is enough) */
const realRefresh = App.refresh;
App.refresh = function () {
  const p = realRefresh.apply(this, arguments);
  Promise.resolve(p).then(paint, paint);
  return p;
};

/* For phone.js: empty strings when there is no App.sync, so the page is exactly as before. */
App.syncUI = {
  chipHost: () => '',                                                  // the status is on the avatar now
  menuRow: () => (on() ? '<div class="sy-menu" data-sync-menu>' + menuHtml() + '</div>' : ''),
  line: () => (on() ? '<span class="ac-line" data-sync-line>' + lineHtml() + '</span>' : ''),
  on,
  cardHost: () => (on() ? '<div class="sy-host" data-sync-card hidden></div>' : ''),
  isPending: (table, id) => { if (!on() || typeof App.sync.isPending !== 'function') return false; try { return !!App.sync.isPending(table, Number(id)); } catch (e) { return false; } },
  paint,            // the engine may call this after it defines App.sync late
  open: openSheet,
};
})();
