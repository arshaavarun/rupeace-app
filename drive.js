/* RuPeace — the family's own Google Sheet in their Google Drive, as the place every family phone syncs with.
   No server: whichever phone syncs is the server for that moment. It takes a short lock in the Sheet (tab _lock),
   reads every tab, runs RuPeace's own sync code on it (engine.js, RPEngine.createRaw: the same merge rules the Google
   script used), writes back what changed in one request, and lets go of the lock. Script Properties live in tab
   _props; tab _meta says what the file is. Only for the Android app, which signs in with Google and gets an access
   token for the Sheet (window.RuPeaceAndroid, android/.../MainActivity.java).

   window.RPDrive:
     .available                       this app can sign in with Google
     .signIn() -> {email, name, photo, idToken}           Android's Google account sheet
     .signOut()
     .find() -> [{id, name, ownedByMe}]                   RuPeace family files this Google account made or opened here
     .create(family, me) -> id                            a new family Sheet in this account's Drive
     .open(id) -> {id, name, owner}                       checks a Sheet is a RuPeace family file this account can use
     .share(id, email, message) -> true                   lets a family member's Google account in
     .call(id, method, url, body, person) -> {ok, data | error}   what the Google script used to answer, done here */
(function () {
'use strict';
const A = window.RuPeaceAndroid;
const NATIVE = !!(A && typeof A.call === 'function' && typeof A.features === 'function');
let feats = {};
try { feats = NATIVE ? JSON.parse(A.features()) : {}; } catch (e) { feats = {}; }
const wait = ms => new Promise(r => setTimeout(r, ms));

/* ---------- asking Android ---------- */
const waiting = new Map();
let n = 0;
window.__rpNative = (id, res) => { const w = waiting.get(id); if (w) { waiting.delete(id); w(res || {}); } };
const native = (method, arg) => new Promise(resolve => {
  const id = 'n' + (++n) + '-' + Date.now();
  waiting.set(id, resolve);
  try { A.call(id, method, JSON.stringify(arg || {})); } catch (e) { waiting.delete(id); resolve({ ok: false, error: String(e && e.message || e) }); }
});

/* ---------- Google's APIs, with this phone's access token ---------- */
let tok = null, tokAt = 0, tokWait = null;
function token(force) {
  if (!force && tok && Date.now() - tokAt < 45 * 60e3) return Promise.resolve(tok);
  if (tokWait) return tokWait;
  tokWait = native('googleDrive').then(r => {
    tokWait = null;
    if (!r.ok || !r.accessToken) {
      const e = new Error(r.cancelled ? 'RuPeace needs your OK to keep the family’s data in your Google Drive.' : (r.error || 'Google did not answer. Try again.'));
      e.code = r.cancelled ? 'cancelled' : 'auth';
      throw e;
    }
    tok = r.accessToken; tokAt = Date.now();
    return tok;
  }, e => { tokWait = null; throw e; });
  return tokWait;
}
async function gapi(method, url, body, tries) {
  tries = tries || 0;
  const t = await token(tries > 0 && tries === -1);
  let r;
  try {
    r = await fetch(url, { method, cache: 'no-store', headers: Object.assign({ Authorization: 'Bearer ' + t }, body ? { 'Content-Type': 'application/json' } : {}),
      body: body ? JSON.stringify(body) : undefined });
  } catch (e) {
    const er = new Error('Can’t reach Google right now. Check your internet connection.'); er.offline = true; throw er;
  }
  if (r.status === 401 && tries < 1) { tok = null; return gapi(method, url, body, tries + 1); }
  if ((r.status === 429 || r.status >= 500) && tries < 3) { await wait(700 * (tries + 1)); return gapi(method, url, body, tries + 1); }
  const text = await r.text();
  let j = null;
  try { j = text ? JSON.parse(text) : {}; } catch (e) { j = null; }
  if (!r.ok) {
    const msg = (j && j.error && j.error.message) || ('Google said ' + r.status);
    const er = new Error(r.status === 404 ? 'That RuPeace family file is not there, or this Google account can’t open it.' : r.status === 403 ? 'This Google account isn’t allowed to open that family file.' : msg);
    er.status = r.status; throw er;
  }
  return j || {};
}
const SH = 'https://sheets.googleapis.com/v4/spreadsheets', DR = 'https://www.googleapis.com/drive/v3/files';
const enc = encodeURIComponent;
const tab = t => "'" + String(t).replace(/'/g, "''") + "'";
const colName = k => { let s = ''; for (k++; k > 0; k = Math.floor((k - 1) / 26)) s = String.fromCharCode(65 + (k - 1) % 26) + s; return s; };
const SYS = ['_meta', '_props', '_lock'];

/* ---------- the family file ---------- */
async function find() {
  const q = "appProperties has { key='rupeace' and value='household' } and trashed=false";
  const r = await gapi('GET', DR + '?q=' + enc(q) + '&spaces=drive&fields=' + enc('files(id,name,ownedByMe,createdTime)') + '&orderBy=createdTime');
  return (r.files || []).map(f => ({ id: f.id, name: f.name, ownedByMe: !!f.ownedByMe }));
}
async function create(family, me) {
  const ss = await gapi('POST', SH, {
    properties: { title: 'RuPeace · ' + family, timeZone: 'Asia/Kolkata' },
    sheets: SYS.map((t, i) => ({ properties: { title: t, index: i, gridProperties: { rowCount: 100, columnCount: 6 } } })),
  });
  const id = ss.spreadsheetId;
  await gapi('PUT', SH + '/' + id + '/values/' + enc("'_meta'!A1") + '?valueInputOption=RAW', { values: [
    ['app', 'RuPeace'], ['kind', 'household'], ['version', '1'], ['family', family], ['owner', me.email || ''], ['created', new Date().toISOString()],
    ['note', 'The RuPeace app keeps this file. Please change things in the app, not here.']] });
  await gapi('PATCH', DR + '/' + id + '?fields=id', { appProperties: { rupeace: 'household' }, description: 'RuPeace family data. Kept by the RuPeace app.' });
  return id;
}
async function open(id) {
  const r = await gapi('GET', SH + '/' + id + '?fields=' + enc('properties.title,sheets.properties.title'));
  const titles = (r.sheets || []).map(s => s.properties.title);
  if (titles.indexOf('_meta') < 0) throw new Error('That file is not a RuPeace family file.');
  const m = await gapi('GET', SH + '/' + id + '/values/' + enc("'_meta'!A1:B20") + '?valueRenderOption=UNFORMATTED_VALUE');
  const meta = {}; (m.values || []).forEach(row => { if (row[0]) meta[row[0]] = row[1]; });
  if (meta.app !== 'RuPeace') throw new Error('That file is not a RuPeace family file.');
  return { id, name: meta.family || r.properties.title, owner: meta.owner || '' };
}
async function share(id, email, message) {
  await gapi('POST', DR + '/' + id + '/permissions?sendNotificationEmail=true&emailMessage=' + enc(message || ''), { role: 'writer', type: 'user', emailAddress: email });
  return true;
}

/* ---------- the lock: one phone writes at a time ----------
   A phone appends a ticket to _lock; the oldest ticket still waiting holds the lock. A ticket left behind (a phone
   that died half way) is passed over once it has stood first for 45 s by this phone's own clock, so phones whose
   clocks differ never fight. */
async function lock(id, device) {
  const me = String(device || 'phone') + ':' + Math.random().toString(36).slice(2, 9);
  await gapi('POST', SH + '/' + id + '/values/' + enc("'_lock'!A:C") + ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS', { values: [[me, Date.now(), '']] });
  const seen = new Map(), t0 = Date.now();
  for (;;) {
    const v = await gapi('GET', SH + '/' + id + '/values/' + enc("'_lock'!A:C") + '?valueRenderOption=UNFORMATTED_VALUE');
    const rows = v.values || [], now = Date.now();
    const live = [];
    rows.forEach((r, i) => {
      if (!r[0] || r[2]) return;
      if (!seen.has(r[0])) seen.set(r[0], now);
      if (r[0] !== me && now - seen.get(r[0]) > 45000) return;          // stood first too long: left behind
      live.push({ who: r[0], row: i + 1 });
    });
    if (live.length && live[0].who === me) return { me, row: live[0].row, total: rows.length };
    if (!live.some(x => x.who === me)) throw new Error('Could not get a turn to sync. Trying again shortly.');
    if (now - t0 > 40000) { await unlock(id, { row: live.find(x => x.who === me).row }); const e = new Error('Another phone is syncing. Trying again shortly.'); e.busy = true; throw e; }
    await wait(450 + Math.random() * 450);
  }
}
async function unlock(id, L) {
  if (!L || !L.row) return;
  await gapi('PUT', SH + '/' + id + '/values/' + enc("'_lock'!C" + L.row) + '?valueInputOption=RAW', { values: [['done']] });
  if (L.total > 60) {                                                    // tidy: every ticket up to ours is finished
    try { await gapi('POST', SH + '/' + id + '/values:batchClear', { ranges: ["'_lock'!A1:C" + L.row] }); } catch (e) { /* next time */ }
  }
}

/* ---------- reading and writing the whole Sheet ---------- */
async function readAll(id) {
  const meta = await gapi('GET', SH + '/' + id + '?fields=' + enc('sheets.properties(sheetId,title,gridProperties)'));
  const sheets = (meta.sheets || []).map(s => s.properties);
  const titles = sheets.map(s => s.title).filter(t => t !== '_lock' && t !== '_meta');
  const grids = {};
  if (titles.length) {
    const r = await gapi('GET', SH + '/' + id + '/values:batchGet?' + titles.map(t => 'ranges=' + enc(tab(t))).join('&') +
      '&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING&majorDimension=ROWS');
    (r.valueRanges || []).forEach((vr, i) => { grids[titles[i]] = vr.values || []; });
  }
  const props = {};
  (grids._props || []).forEach(r => { if (r[0] !== undefined && r[0] !== '') props[String(r[0])] = r[1] === undefined || r[1] === null ? '' : String(r[1]); });
  delete grids._props;
  return { sheets, grids, props };
}
const width = g => g.reduce((m, r) => Math.max(m, r.length), 0);
/* everything that changed goes in ONE values:batchUpdate (all or nothing); rows and columns that are no longer used
   are written as blanks in the same request, so a half-done write can't leave stray rows behind */
async function writeAll(id, sheets, before, after, propsBefore, propsAfter) {
  const byTitle = new Map(sheets.map(s => [s.title, s]));
  const data = [], structure = [];
  const put = (title, oldGrid, newGrid) => {
    if (JSON.stringify(oldGrid) === JSON.stringify(newGrid)) return;
    const rows = Math.max(oldGrid.length, newGrid.length, 1), cols = Math.max(width(oldGrid), width(newGrid), 1);
    const values = [];
    for (let i = 0; i < rows; i++) {
      const src = newGrid[i] || [], row = new Array(cols);
      for (let j = 0; j < cols; j++) { const x = src[j]; row[j] = x === undefined || x === null ? '' : (x instanceof Date ? x.toISOString() : x); }
      values.push(row);
    }
    const s = byTitle.get(title);
    if (!s) structure.push({ addSheet: { properties: { title, gridProperties: { rowCount: rows + 200, columnCount: Math.max(26, cols), frozenRowCount: 1 } } } });
    else {
      if (s.gridProperties.rowCount < rows) structure.push({ appendDimension: { sheetId: s.sheetId, dimension: 'ROWS', length: rows - s.gridProperties.rowCount + 200 } });
      if (s.gridProperties.columnCount < cols) structure.push({ appendDimension: { sheetId: s.sheetId, dimension: 'COLUMNS', length: cols - s.gridProperties.columnCount } });
    }
    data.push({ range: tab(title) + '!A1:' + colName(cols - 1) + rows, values });
  };
  Object.keys(after).forEach(t => { if (SYS.indexOf(t) < 0) put(t, before[t] || [], after[t] || []); });
  const pb = Object.keys(propsBefore).sort().map(k => [k, propsBefore[k]]), pa = Object.keys(propsAfter).sort().map(k => [k, propsAfter[k]]);
  put('_props', pb, pa);
  if (!data.length) return false;
  if (structure.length) await gapi('POST', SH + '/' + id + ':batchUpdate', { requests: structure });
  await gapi('POST', SH + '/' + id + '/values:batchUpdate', { valueInputOption: 'RAW', data });
  return true;
}

/** Everything replaced by these tables (a move from the old Google-script RuPeace, or a backup file). */
async function importAll(id, tables) {
  const L = await lock(id, 'import');
  try {
    const { sheets, grids, props } = await readAll(id);
    const eng = window.RPEngine.createRaw(grids, props, {});
    const r = eng.api('POST', '/api/import', { version: 1, tables, confirm: 'REPLACE' });
    if (!r.ok) throw new Error(r.error);
    await writeAll(id, sheets, grids, eng.grids(), props, eng.props());
    return r.data;
  } finally {
    unlock(id, L).catch(() => {});
  }
}

/* ---------- what the Google script used to answer ---------- */
async function syncHere(id, body, person) {
  const since = Number(body && body.since) || 0;
  const changes = (body && body.changes) || [];
  if (since > 0 && !changes.length) {                                    // nothing to send: has anything changed there?
    const v = await gapi('GET', SH + '/' + id + '/values/' + enc("'_props'!A1:B400") + '?valueRenderOption=UNFORMATTED_VALUE');
    const row = (v.values || []).find(r => r[0] === 'SYNC_SEQ');
    if (row && Number(row[1]) === since) return { ok: true, data: { seq: since, idmap: {}, applied: [], conflicts: [], duplicates: [], errors: [], tables: null } };
  }
  const L = await lock(id, body && body.device);
  try {
    const { sheets, grids, props } = await readAll(id);
    const eng = window.RPEngine.createRaw(grids, props, { person });
    const res = eng.api('POST', '/api/sync', body);
    if (!res.ok) return res;
    if (!res.data.tables && !since) {                                    // a first copy, even of a family file still empty
      const ex = eng.api('GET', '/api/export');
      if (ex.ok) res.data.tables = ex.data.tables;
    }
    await writeAll(id, sheets, grids, eng.grids(), props, eng.props());
    return res;
  } finally {
    unlock(id, L).catch(() => {});
  }
}
/* ---------- backups: one .json per backup (the same file as Settings → Backup) in a "RuPeace backups" folder in this
   Google account's Drive. Each phone makes a daily one after its first sync of the day; the newest 30 are kept. ---------- */
const BK_KEEP = 30, BK_EVERY = 20 * 3600e3, BK_LAST = 'rp.bkLast';
async function bkFolder() {
  const q = "appProperties has { key='rupeace' and value='backups' } and trashed=false";
  const r = await gapi('GET', DR + '?q=' + enc(q) + '&spaces=drive&fields=' + enc('files(id)'));
  if (r.files && r.files.length) return r.files[0].id;
  return (await gapi('POST', DR + '?fields=id', { name: 'RuPeace backups', mimeType: 'application/vnd.google-apps.folder', appProperties: { rupeace: 'backups' } })).id;
}
const bkShape = f => { const a = f.appProperties || {}; return { id: f.id, name: f.name, created: f.createdTime || '', size: Number(f.size || 0), kind: a.kind || 'manual',
  entries: Number(a.entries || 0), people: Number(a.people || 0), accounts: Number(a.accounts || 0), rows: Number(a.rows || 0) }; };
async function bkList(folder) {
  const q = "'" + folder + "' in parents and trashed=false";
  const r = await gapi('GET', DR + '?q=' + enc(q) + '&orderBy=' + enc('createdTime desc') + '&pageSize=100&fields=' + enc('files(id,name,createdTime,size,appProperties)'));
  return (r.files || []).filter(f => f.appProperties && f.appProperties.rupeace === '1').map(bkShape);
}
async function exportOf(id) {
  const { grids, props } = await readAll(id);
  const r = window.RPEngine.createRaw(grids, props, {}).api('GET', '/api/export');
  if (!r.ok) throw new Error(r.error);
  return r.data;
}
const bkEmpty = data => { const n = t => ((data.tables || {})[t] || []).length; return !n('entries') && !n('accounts') && n('people') <= 1; };
async function bkSave(id, kind, data) {
  data = data || await exportOf(id);
  const n = t => (data.tables[t] || []).length, folder = await bkFolder();
  const d = new Date(), p = x => String(x).padStart(2, '0');
  const stamp = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + '.' + p(d.getMinutes());
  const k = ['manual', 'daily', 'before-reset', 'before-restore'].indexOf(kind) >= 0 ? kind : 'manual';
  const meta = { name: 'RuPeace backup ' + stamp + (k === 'manual' ? '' : ' (' + k + ')') + '.json', parents: [folder], mimeType: 'application/json',
    appProperties: { rupeace: '1', kind: k, entries: String(n('entries')), people: String(n('people')), accounts: String(n('accounts')),
      rows: String(Object.keys(data.tables).reduce((s, t) => s + n(t), 0)) } };
  const b = 'rupeace' + Math.random().toString(36).slice(2) + Date.now();
  const body = '--' + b + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(meta) + '\r\n--' + b +
    '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(data) + '\r\n--' + b + '--';
  let r;
  try {
    r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=' + enc('id,name,createdTime,size,appProperties'),
      { method: 'POST', headers: { Authorization: 'Bearer ' + await token(), 'Content-Type': 'multipart/related; boundary=' + b }, body });
  } catch (e) { const er = new Error('Can’t reach Google right now. Check your internet connection.'); er.offline = true; throw er; }
  if (!r.ok) throw new Error('Google Drive did not take the backup (' + r.status + '). Try again in a moment.');
  const saved = bkShape(JSON.parse(await r.text()));
  try { localStorage.setItem(BK_LAST, String(Date.now())); } catch (e) { /* ignore */ }
  (await bkList(folder)).slice(BK_KEEP).forEach(f => { gapi('DELETE', DR + '/' + f.id).catch(() => {}); });
  return saved;
}
const bkLast = () => { try { return Number(localStorage.getItem(BK_LAST)) || 0; } catch (e) { return 0; } };
let bkDailyBusy = false;
function bkDaily(id) {                                                   // after a sync: once a day, quietly
  if (bkDailyBusy || Date.now() - bkLast() < BK_EVERY) return;
  bkDailyBusy = true;
  exportOf(id).then(data => (bkEmpty(data) ? null : bkSave(id, 'daily', data))).catch(() => {}).then(() => { bkDailyBusy = false; });
}
async function backupRoute(id, method, path, body, person) {
  if (method === 'GET' && path === '/api/backups') {
    const folder = await bkFolder();
    return { backups: await bkList(folder), last: bkLast() || null, folder_url: 'https://drive.google.com/drive/folders/' + folder, keep: BK_KEEP };
  }
  if (method === 'POST' && path === '/api/backups') return { backup: await bkSave(id, (body || {}).kind) };
  if (method === 'GET' && path === '/api/backups/offer') {
    if (!bkEmpty(await exportOf(id))) return { empty: false, backups: [] };
    try { return { empty: true, backups: (await bkList(await bkFolder())).filter(f => f.entries || f.accounts || f.people > 1).slice(0, 6) }; }
    catch (e) { return { empty: true, backups: [], error: e.message }; }
  }
  if (method === 'POST' && path === '/api/backups/restore') {
    if ((body || {}).confirm !== 'REPLACE') throw new Error('Confirm that this backup should replace everything.');
    const data = await gapi('GET', DR + '/' + enc(String(body.id || '')) + '?alt=media');
    if (!data || data.version !== 1 || !data.tables) throw new Error('That file isn’t a RuPeace backup.');
    const now = await exportOf(id);
    if (!bkEmpty(now)) await bkSave(id, 'before-restore', now);         // nothing is lost: what is here now is kept in Drive
    const res = await importAll(id, data.tables);
    return { restored: res.imported, signin_again: false };
  }
  throw new Error('This is not available in this version yet.');
}
/* Reset: a backup to Drive first (nothing is erased if Drive says no), then every table is emptied and the one who
   reset is put back as the first person, so this phone stays in the family. */
async function resetRoute(id, body, person) {
  if (!body || body.confirm !== 'RESET') throw new Error('Type RESET to confirm.');
  let backup = null;
  if (body.backup) {
    const now = await exportOf(id);
    if (!bkEmpty(now)) {
      try { backup = await bkSave(id, 'before-reset', now); }
      catch (e) { throw new Error('The backup to Google Drive did not work, so nothing was erased (' + e.message + ').'); }
    }
  }
  const me = body.me || {};
  const L = await lock(id, 'reset');
  try {
    const { sheets, grids, props } = await readAll(id);
    const e = window.RPEngine.createRaw(grids, props, { person });
    const r = e.api('POST', '/api/reset', { confirm: 'RESET' });
    if (!r.ok) throw new Error(r.error);
    const p = e.api('POST', '/api/setup/people', { name: me.name || 'Me', email: me.email || '' });
    await writeAll(id, sheets, grids, e.grids(), props, e.props());
    return Object.assign({}, r.data, { backup, person: p.ok ? (p.data.row ? p.data.row.id : p.data.id) : null });
  } finally { unlock(id, L).catch(() => {}); }
}
/* Delete my data: the owner's family file goes to the bin (and, if asked, the backups folder); someone who joined
   leaves the family instead (their access to the file is removed). Then Google access for RuPeace is revoked. */
async function deleteMine(id, withBackups) {
  const f = await gapi('GET', DR + '/' + enc(id) + '?fields=' + enc('id,ownedByMe'));
  if (f.ownedByMe) await gapi('PATCH', DR + '/' + enc(id) + '?fields=id', { trashed: true });
  else {
    const about = await gapi('GET', 'https://www.googleapis.com/drive/v3/about?fields=' + enc('user(permissionId)'));
    await gapi('DELETE', DR + '/' + enc(id) + '/permissions/' + enc(about.user.permissionId));
  }
  if (withBackups) { try { await gapi('PATCH', DR + '/' + enc(await bkFolder()) + '?fields=id', { trashed: true }); } catch (e) { /* none */ } }
  try { const t = await token(); await fetch('https://oauth2.googleapis.com/revoke?token=' + enc(t), { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }); } catch (e) { /* signed out anyway */ }
  tok = null;
  return { owner: !!f.ownedByMe };
}

async function call(id, method, url, body, person) {
  const path = String(url).split('?')[0];
  try {
    if (method === 'POST' && path === '/api/sync') { const r = await syncHere(id, body || {}, person); if (r && r.ok) bkDaily(id); return r; }
    if (method === 'GET' && path === '/api/auth/me') return { ok: true, data: { person: person ? { id: person } : null } };
    if (path.indexOf('/api/backups') === 0) return { ok: true, data: await backupRoute(id, method, path, body, person) };
    if (method === 'POST' && path === '/api/reset') return { ok: true, data: await resetRoute(id, body, person) };
    if (method === 'POST' && path === '/api/import') {
      if ((body || {}).confirm !== 'REPLACE') throw new Error('There is already data here. Confirm that you want to replace all of it.');
      return { ok: true, data: await importAll(id, body.tables) };
    }
    return { ok: false, error: 'This is not available in this version yet.' };
  } catch (e) {
    return { ok: false, error: e.message || String(e), offline: !!e.offline };
  }
}

window.RPDrive = {
  available: NATIVE && !!feats.google,
  features: feats,
  native,
  signIn: async () => {
    const r = await native('googleSignIn', {});
    if (!r.ok) { const e = new Error(r.cancelled ? '' : (r.error || 'Google sign-in did not finish.')); e.cancelled = !!r.cancelled; throw e; }
    return { email: r.email, name: r.name || '', photo: r.photo || '', idToken: r.idToken };
  },
  signOut: () => { tok = null; return native('googleSignOut', {}); },
  allow: () => token(true),
  find, create, open, share, call, importAll, deleteMine,
  /** the signed-in Google account's name and photo (Drive's about: works with the Drive access RuPeace already has) */
  me: async () => { const r = await gapi('GET', 'https://www.googleapis.com/drive/v3/about?fields=' + enc('user(displayName,photoLink,emailAddress)')); return r.user || {}; },
};
})();
