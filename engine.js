/* engine.js - written by google/client/engine/bundle.py. Do not edit: change google/server/*.js or google/client/engine/*.js and build again. */
(function (root) {
// ---- google/client/engine/shim.js
/* RuPeace local engine — browser versions of the Apps Script services google/server/*.js uses.
   Bundled by google/client/engine/bundle.py into engine.js, in one function scope with the server files, so the
   server code finds SpreadsheetApp, LockService, Session, Utilities, PropertiesService and CacheService here.
   Behaves like google/test/fakes.js where it matters: a string written into a cell that is not formatted '@'
   becomes a number / Date / boolean (as Sheets does), ranges outside the grid throw, setValues needs exact sizes.
   One spreadsheet per engine (RPShim_.use(...) picks the one the next call runs on). */

const RPShim_ = (function () {
  const NUMERIC = /^\s*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?\s*$/;
  const ISO_DATE = /^\d{4}-\d{1,2}-\d{1,2}$/;
  const TZ = 'Asia/Kolkata';

  function Range(sheet, row, col, nr, nc) {
    if (row < 1 || col < 1 || nr < 1 || nc < 1) throw new Error('Bad range ' + [row, col, nr, nc].join(','));
    if (row + nr - 1 > sheet.maxRows || col + nc - 1 > sheet.maxCols) {
      throw new Error('The coordinates of the range are outside the dimensions of the sheet.');
    }
    this.sheet = sheet; this.row = row; this.col = col; this.nr = nr; this.nc = nc;
  }
  Range.prototype.getValues = function () {
    const out = [];
    for (let i = 0; i < this.nr; i++) {
      const src = this.sheet.data[this.row + i - 1] || [];
      const row = new Array(this.nc);
      for (let j = 0; j < this.nc; j++) {
        const v = src[this.col + j - 1];
        row[j] = v === undefined || v === null ? '' : (v instanceof Date ? new Date(v.getTime()) : v);
      }
      out.push(row);
    }
    return out;
  };
  Range.prototype.setValues = function (values) {
    if (!Array.isArray(values) || values.length !== this.nr) throw new Error('The number of rows in the data does not match the number of rows in the range.');
    for (let i = 0; i < this.nr; i++) {
      if (!Array.isArray(values[i]) || values[i].length !== this.nc) throw new Error('The number of columns in the data does not match the number of columns in the range.');
    }
    for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.sheet.put(this.row + i - 1, this.col + j - 1, values[i][j]);
    return this;
  };
  Range.prototype.setNumberFormat = function (f) {            // formats are kept per column (all the server needs)
    for (let j = 0; j < this.nc; j++) this.sheet.formats[this.col + j - 1] = f;
    return this;
  };
  Range.prototype.setNumberFormats = function (fs) {
    if (fs.length !== this.nr || fs.some(r => r.length !== this.nc)) throw new Error('setNumberFormats: dimensions do not match');
    for (let j = 0; j < this.nc; j++) this.sheet.formats[this.col + j - 1] = fs[0][j];
    return this;
  };
  Range.prototype.getNumberFormats = function () {
    const out = [];
    for (let i = 0; i < this.nr; i++) {
      const row = [];
      for (let j = 0; j < this.nc; j++) row.push(this.sheet.formats[this.col + j - 1] || 'General');
      out.push(row);
    }
    return out;
  };
  Range.prototype.clearContent = function () {
    for (let i = 0; i < this.nr; i++) {
      const r = this.sheet.data[this.row + i - 1];
      if (r) for (let j = 0; j < this.nc; j++) r[this.col + j - 1] = '';
    }
    return this;
  };

  function Sheet(name) {
    this.name = name; this.maxRows = 1000; this.maxCols = 26; this.data = []; this.formats = [];
  }
  Sheet.prototype.getName = function () { return this.name; };
  Sheet.prototype.put = function (r, c, v) {                  // what Sheets does with a written value
    if (!this.data[r]) this.data[r] = [];
    const f = this.formats[c] || 'General';
    if (v === undefined || v === null) v = '';
    if (typeof v === 'string' && f !== '@' && v !== '') {
      if (NUMERIC.test(v)) v = Number(v);
      else if (ISO_DATE.test(v)) { const p = v.split('-').map(Number); v = new Date(p[0], p[1] - 1, p[2]); }
      else if (/^(TRUE|FALSE)$/i.test(v)) v = /^true$/i.test(v);
    }
    this.data[r][c] = v;
  };
  Sheet.prototype.getLastRow = function () {
    for (let r = this.data.length - 1; r >= 0; r--) {
      const row = this.data[r];
      if (row && row.some(v => v !== '' && v !== undefined && v !== null)) return r + 1;
    }
    return 0;
  };
  Sheet.prototype.getLastColumn = function () {
    let m = 0;
    this.data.forEach(row => {
      if (!row) return;
      for (let c = row.length - 1; c >= m; c--) if (row[c] !== '' && row[c] !== undefined && row[c] !== null) { m = c + 1; break; }
    });
    return m;
  };
  Sheet.prototype.getMaxRows = function () { return this.maxRows; };
  Sheet.prototype.getMaxColumns = function () { return this.maxCols; };
  Sheet.prototype.getDataRange = function () {
    return new Range(this, 1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn()));
  };
  Sheet.prototype.getRange = function (row, col, nr, nc) {
    if (typeof row === 'string') throw new Error('A1 notation is not supported by the local engine');
    return new Range(this, row, col, nr || 1, nc || 1);
  };
  Sheet.prototype.insertRowsAfter = function (after, n) {
    while (this.data.length < after) this.data.push([]);
    const rows = [];
    for (let i = 0; i < n; i++) rows.push([]);
    this.data.splice.apply(this.data, [after, 0].concat(rows));
    this.maxRows += n;
    return this;
  };
  Sheet.prototype.insertColumnsAfter = function (after, n) {
    this.data.forEach(row => { if (row && row.length > after) row.splice.apply(row, [after, 0].concat(new Array(n).fill(''))); });
    this.formats.splice.apply(this.formats, [after, 0].concat(new Array(n).fill(this.formats[after - 1] || 'General')));
    this.maxCols += n;
    return this;
  };
  Sheet.prototype.deleteRow = function (r) { return this.deleteRows(r, 1); };
  Sheet.prototype.deleteRows = function (r, n) {
    if (r < 1 || r + n - 1 > this.maxRows) throw new Error('deleteRows out of range');
    this.data.splice(r - 1, n);
    this.maxRows -= n;
    return this;
  };
  Sheet.prototype.setFrozenRows = function () { return this; };

  function Spreadsheet() { this.sheets = []; }
  Spreadsheet.prototype.getId = function () { return 'local-copy'; };
  Spreadsheet.prototype.getName = function () { return 'RuPeace (this device)'; };
  Spreadsheet.prototype.getSheets = function () { return this.sheets.slice(); };
  Spreadsheet.prototype.getSheetByName = function (n) { return this.sheets.find(s => s.name === n) || null; };
  Spreadsheet.prototype.insertSheet = function (n) {
    if (this.getSheetByName(n)) throw new Error('A sheet with the name "' + n + '" already exists.');
    const s = new Sheet(n);
    this.sheets.push(s);
    return s;
  };
  /** A tab filled straight from rows (no conversions): header, values, and a format per column. */
  Spreadsheet.prototype.fill = function (name, header, rows, formats) {
    const s = this.getSheetByName(name) || this.insertSheet(name);
    s.data = [header.slice()].concat(rows);
    s.formats = formats.slice();
    s.maxRows = Math.max(1000, s.data.length + 50);
    s.maxCols = Math.max(26, header.length);
    return s;
  };

  function formatDate(date, tz, pattern) {
    const parts = {};
    new Intl.DateTimeFormat('en-GB', { timeZone: tz || TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
      minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(date.getTime()))
      .forEach(p => { parts[p.type] = p.value; });
    return pattern.replace('yyyy', parts.year).replace('MM', parts.month).replace('dd', parts.day)
      .replace('HH', parts.hour).replace('mm', parts.minute).replace('ss', parts.second);
  }

  // SHA-256 of a UTF-8 string, as Apps Script's signed bytes (-128..127).
  const K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98,
    0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6,
    0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3,
    0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e,
    0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116,
    0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814,
    0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
  function utf8(s) {
    if (typeof TextEncoder !== 'undefined') return Array.from(new TextEncoder().encode(s));
    return Array.from(unescape(encodeURIComponent(s)), c => c.charCodeAt(0));
  }
  function sha256(text) {
    const bytes = utf8(String(text));
    const bitLen = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    for (let i = 7; i >= 0; i--) bytes.push(i > 3 ? 0 : (bitLen >>> (i * 8)) & 0xff);
    const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    const w = new Array(64);
    const rotr = (x, n) => (x >>> n) | (x << (32 - n));
    for (let o = 0; o < bytes.length; o += 64) {
      for (let i = 0; i < 16; i++) w[i] = (bytes[o + 4 * i] << 24) | (bytes[o + 4 * i + 1] << 16) | (bytes[o + 4 * i + 2] << 8) | bytes[o + 4 * i + 3];
      for (let i = 16; i < 64; i++) {
        const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], k = h[7];
      for (let i = 0; i < 64; i++) {
        const t1 = (k + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
        const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        k = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
      h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + k) | 0;
    }
    const out = [];
    h.forEach(x => { for (let i = 3; i >= 0; i--) { const b = (x >>> (i * 8)) & 0xff; out.push(b > 127 ? b - 256 : b); } });
    return out;
  }
  function uuid() {
    const c = typeof crypto !== 'undefined' ? crypto : null;
    if (c && c.randomUUID) return c.randomUUID();
    const b = [];
    for (let i = 0; i < 16; i++) b.push(c && c.getRandomValues ? c.getRandomValues(new Uint8Array(1))[0] : Math.floor(Math.random() * 256));
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    const hx = b.map(x => (x + 0x100).toString(16).slice(1)).join('');
    return hx.slice(0, 8) + '-' + hx.slice(8, 12) + '-' + hx.slice(12, 16) + '-' + hx.slice(16, 20) + '-' + hx.slice(20);
  }

  // the engine whose spreadsheet / properties / cache the next server call uses
  let cur = { ss: null, props: new Map(), cache: new Map() };
  const lock = { held: false, tryLock() { this.held = true; return true; }, waitLock() { this.held = true; },
    releaseLock() { this.held = false; }, hasLock() { return this.held; } };

  return {
    Spreadsheet, sha256, uuid, formatDate, TZ,
    use(state) { cur = state; },
    services: {
      SpreadsheetApp: { getActiveSpreadsheet: () => cur.ss, openById: () => cur.ss },
      LockService: { getScriptLock: () => lock, getUserLock: () => lock, getDocumentLock: () => lock },
      Session: {
        getScriptTimeZone: () => TZ,
        getActiveUser: () => ({ getEmail: () => '' }),
        getEffectiveUser: () => ({ getEmail: () => '' }),
      },
      Utilities: {
        formatDate,
        DigestAlgorithm: { SHA_256: 'sha256' },
        Charset: { UTF_8: 'utf8' },
        computeDigest: (alg, text) => sha256(text),
        getUuid: uuid,
        sleep: () => {},
      },
      CacheService: { getScriptCache: () => ({ get: k => (cur.cache.has(k) ? cur.cache.get(k) : null),
        put: (k, v) => { cur.cache.set(k, String(v)); }, remove: k => { cur.cache.delete(k); } }) },
      PropertiesService: { getScriptProperties: () => ({
        getProperty: k => (cur.props.has(k) ? cur.props.get(k) : null),
        setProperty: (k, v) => { cur.props.set(k, String(v)); },
        deleteProperty: k => { cur.props.delete(k); },
        getProperties: () => { const o = {}; cur.props.forEach((v, k) => { o[k] = v; }); return o; },
      }) },
      lock,
    },
  };
})();
const SpreadsheetApp = RPShim_.services.SpreadsheetApp;
const LockService = RPShim_.services.LockService;
const Session = RPShim_.services.Session;
const Utilities = RPShim_.services.Utilities;
const CacheService = RPShim_.services.CacheService;
const PropertiesService = RPShim_.services.PropertiesService;

// ---- google/server/auth.js
// google/server/auth.js — PIN sign-in in front of every request (the Google version only).
//
// The web app runs as the owner and opens without a Google sign-in (so phones with several Google accounts work).
// Instead, every person gets a PIN. Signing in with a PIN gives the device a token; every api() call must carry it.
//
// Stored in Script Properties (never in the Sheet, never in exports):
//   pin:<person_id>  {salt, hash}         the PIN, salted and hashed many times
//   tok:<sha256>     {pid, at}            a signed-in device (the token itself is only on the device)
//   fail:login / fail:setup  {n, until}   wrong tries; 5 wrong in a row locks that door for 15 minutes
// The one-time setup code (first PIN, or "forgot my PIN") is checked against SETUP_HASH: a Script Property if set,
// else the SETUP_HASH_ constant that google/build.py writes into config.js from google/.setup-code (not in git).
//
// api(method, url, body, token) and apiBatch(calls, token) are the only functions the page calls; everything else
// ends in _ (private).

const AUTH_ = { person: null };              // who is signed in for the current request (null outside one)
const AUTH_TRIES_ = 5;
const AUTH_LOCK_MS_ = 15 * 60 * 1000;
const AUTH_TOKEN_DAYS_ = 365;
const AUTH_ROUNDS_ = 400;

function authProps_() {
  return PropertiesService.getScriptProperties();
}

function authHex_(text) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(text), Utilities.Charset.UTF_8);
  return bytes.map(b => ((b < 0 ? b + 256 : b) + 0x100).toString(16).slice(1)).join('');
}

function authPinHash_(salt, pin) {
  let h = salt + ':' + pin;
  for (let i = 0; i < AUTH_ROUNDS_; i++) h = authHex_(h + ':' + salt);
  return h;
}

function authRead_(key) {
  const raw = authProps_().getProperty(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function authWrite_(key, val) {
  if (val === null) authProps_().deleteProperty(key);
  else authProps_().setProperty(key, JSON.stringify(val));
}

function authSetupHash_() {
  let h = '';
  try {
    h = authProps_().getProperty('SETUP_HASH') || '';
  } catch (e) {
    h = '';
  }
  if (!h && typeof SETUP_HASH_ !== 'undefined') h = SETUP_HASH_;
  return String(h || '').toLowerCase();
}

function authNormCode_(code) {
  return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function authCleanPin_(pin) {
  const p = String(pin == null ? '' : pin).trim();
  if (!/^\d{4,8}$/.test(p)) throw ApiError_('A PIN is 4 to 8 digits');
  return p;
}

/** Removes every PIN except those of the given people (Reset data). */
function authDropPins_(keepIds) {
  const keep = keepIds.map(Number);
  authPinIds_().filter(id => keep.indexOf(id) < 0).forEach(id => authWrite_('pin:' + id, null));
}

function authPinIds_() {
  return Object.keys(authProps_().getProperties())
    .filter(k => k.indexOf('pin:') === 0)
    .map(k => Number(k.slice(4)))
    .filter(n => n > 0);
}

/** Person id whose PIN this is, or null. */
function authWhosePin_(pin) {
  const ids = authPinIds_();
  for (let i = 0; i < ids.length; i++) {
    const rec = authRead_('pin:' + ids[i]);
    if (rec && rec.salt && authPinHash_(rec.salt, pin) === rec.hash) return ids[i];
  }
  return null;
}

function authSetPin_(pid, pin) {
  const owner = authWhosePin_(pin);
  if (owner !== null && owner !== pid) throw ApiError_('Someone else already uses that PIN. Pick a different one.');
  const salt = Utilities.getUuid().replace(/-/g, '');
  authWrite_('pin:' + pid, { salt, hash: authPinHash_(salt, pin) });
}

/** Throws while a door is locked. */
function authCheckLock_(door) {
  const f = authRead_('fail:' + door);
  if (f && f.until && f.until > Date.now()) {
    const min = Math.max(1, Math.ceil((f.until - Date.now()) / 60000));
    throw ApiError_('Too many wrong tries. Try again in ' + min + ' minute' + (min > 1 ? 's' : '') + '.');
  }
}

/** Counts a wrong try; returns the sentence to show. */
function authFail_(door, what) {
  const f = authRead_('fail:' + door) || { n: 0, until: 0 };
  const n = (f.until && f.until <= Date.now() ? 0 : f.n || 0) + 1;
  if (n >= AUTH_TRIES_) {
    authWrite_('fail:' + door, { n: 0, until: Date.now() + AUTH_LOCK_MS_ });
    return 'Wrong ' + what + '. Too many wrong tries: locked for 15 minutes.';
  }
  authWrite_('fail:' + door, { n, until: 0 });
  const left = AUTH_TRIES_ - n;
  return 'Wrong ' + what + '. ' + left + ' tr' + (left > 1 ? 'ies' : 'y') + ' left.';
}

function authIssueToken_(pid) {
  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  authWrite_('tok:' + authHex_(token), { pid, at: Date.now() });
  return token;
}

/** Person id for a token, or null (unknown, expired, or that person's PIN was removed). */
function authTokenPerson_(token) {
  if (!token || typeof token !== 'string' || token.length < 32) return null;
  const key = 'tok:' + authHex_(token);
  const rec = authRead_(key);
  if (!rec || !rec.pid) return null;
  if (Date.now() - (rec.at || 0) > AUTH_TOKEN_DAYS_ * 864e5 || !authRead_('pin:' + rec.pid)) {
    authWrite_(key, null);
    return null;
  }
  return rec.pid;
}

function authPerson_(db, pid) {
  const p = db.all_('people').filter(x => Number(x.id) === Number(pid))[0];
  return p ? { id: p.id, name: p.name } : { id: pid, name: '' };
}

/** The /api/auth/* routes. Returns data or throws ApiError_. */
function authRoute_(method, path, body, token) {
  if (method === 'GET' && path === '/api/auth/state') return { has_pins: authPinIds_().length > 0 };

  if (method === 'POST' && path === '/api/auth/login') {
    authCheckLock_('login');
    const pin = String(body.pin == null ? '' : body.pin).trim();
    const pid = /^\d{4,8}$/.test(pin) ? authWhosePin_(pin) : null;
    if (pid === null) throw ApiError_(authFail_('login', 'PIN'));
    authWrite_('fail:login', null);
    return { token: authIssueToken_(pid), person: authPerson_(Db.open(), pid) };
  }

  if (method === 'POST' && path === '/api/auth/setup') {
    authCheckLock_('setup');
    const want = authSetupHash_();
    if (!want) throw ApiError_('This app has no setup code yet. Rebuild and upload it from the laptop.');
    if (authHex_(authNormCode_(body.code)) !== want) throw ApiError_(authFail_('setup', 'setup code'));
    authWrite_('fail:setup', null);
    const name = String(body.name || '').trim();
    if (!name) throw ApiError_('Type your name');
    const pin = authCleanPin_(body.pin);
    const db = Db.open();
    let p = db.all_('people').filter(x => String(x.name || '').trim().toLowerCase() === name.toLowerCase())[0];
    let pid = p ? Number(p.id) : db.insert('people', { name, relation: '', earns: 0, email: '', active: 1, sort: 0 });
    pid = Number(pid && pid.id !== undefined ? pid.id : pid);
    authSetPin_(pid, pin);
    db.commit();
    return { token: authIssueToken_(pid), person: authPerson_(db, pid) };
  }

  // the rest need a signed-in device
  const me = authTokenPerson_(token);
  if (!me) throw Object.assign(ApiError_('Sign in with your PIN.'), { signin: true });

  if (method === 'GET' && path === '/api/auth/me') return { person: authPerson_(Db.open(), me) };

  if (method === 'POST' && path === '/api/auth/logout') {
    authWrite_('tok:' + authHex_(token), null);
    return { ok: true };
  }

  if (method === 'GET' && path === '/api/auth/pins') {
    const ids = authPinIds_();
    return { me, people: Db.open().all_('people').map(p => ({ id: p.id, name: p.name, active: p.active, has_pin: ids.indexOf(Number(p.id)) >= 0 })) };
  }

  const m = /^\/api\/auth\/pins\/(\d+)$/.exec(path);
  if (m && method === 'PUT') {
    const pid = Number(m[1]);
    if (!Db.open().all_('people').some(p => Number(p.id) === pid)) throw ApiError_('No such person');
    authSetPin_(pid, authCleanPin_(body.pin));
    return { ok: true };
  }
  if (m && method === 'DELETE') {
    const pid = Number(m[1]);
    if (pid === me) throw ApiError_("You can't remove your own PIN while signed in with it");
    authWrite_('pin:' + pid, null);
    return { ok: true };
  }
  throw ApiError_('Not found');
}

/**
 * The client entry (doPost in main.js calls it). Same as apiRoute_() in router.js, plus the PIN check:
 * /api/auth/* is handled here; every other call needs a valid token, else {ok: false, error, signin: true}.
 */
function api(method, url, body, token) {
  method = String(method || 'GET').toUpperCase();
  let path = String(url || '');
  path = path.split('#')[0].split('?')[0];
  if (path.indexOf('/api/auth/') === 0) {
    let b = body;
    if (typeof b === 'string') {
      try {
        b = b ? JSON.parse(b) : {};
      } catch (e) {
        return { ok: false, error: 'Bad JSON' };
      }
    }
    if (!b || typeof b !== 'object') b = {};
    let lock = null;
    try {
      if (method !== 'GET') {
        lock = LockService.getScriptLock();
        if (!lock.tryLock(30000)) {
          lock = null;
          return { ok: false, error: 'Someone else is saving right now. Try again in a moment.' };
        }
      }
      return { ok: true, data: authRoute_(method, path, b, token) };
    } catch (e) {
      if (e && e.apiError) return e.signin ? { ok: false, error: e.message, signin: true } : { ok: false, error: e.message };
      console.error((e && e.stack) || e);
      return { ok: false, error: 'Something went wrong: ' + ((e && e.message) || e) };
    } finally {
      if (lock) lock.releaseLock();
    }
  }
  let pid = null;
  try {
    pid = authTokenPerson_(token);
  } catch (e) {
    console.error((e && e.stack) || e);
    return { ok: false, error: 'Something went wrong: ' + ((e && e.message) || e) };
  }
  if (!pid) return { ok: false, error: 'Sign in with your PIN.', signin: true };
  AUTH_.person = pid;
  try {
    return apiRoute_(method, url, body);
  } finally {
    AUTH_.person = null;
  }
}

/**
 * Several calls in one trip (each trip to Apps Script costs ~2.5 s, so the page sends what it needs together).
 * calls: [{method, url, body}], run in order (a save first, then the reads that should see it). Returns one answer
 * per call, exactly what api() would. The calls share one read of the Sheet; a failed call drops it so the next
 * call reads the Sheet again (nothing half-done is seen).
 */
function apiBatch(calls, token) {
  if (!Array.isArray(calls)) return [];
  REQ_.shareDb = true;
  REQ_.db = null;
  try {
    return calls.slice(0, 40).map(c => {
      const r = api(c && c.method, c && c.url, c && c.body, token);
      if (!r || !r.ok) REQ_.db = null;
      return r;
    });
  } finally {
    REQ_.shareDb = false;
    REQ_.db = null;
  }
}

// ---- google/server/backup.js
// google/server/backup.js — backups in the owner's Google Drive, folder "RuPeace backups" (one .json per backup, the same
// file as Settings → Backup). Drive permission: only files this app creates (drive.file), through the Drive REST API.
// GET  /api/backups           -> {backups: [...newest first], last, folder_url, keep}
// GET  /api/backups/offer     -> {empty, backups}: on a fresh start with no data, the backups that could be restored
// POST /api/backups {kind}    -> {backup}: save one now
// POST /api/backups/restore {id, confirm: 'REPLACE'} -> {restored, signin_again}: the current data is backed up first
// A daily backup is made by the first sync of the day (bkMaybeDaily_ in sync.js); the newest 30 are kept.

const BK_API_ = 'https://www.googleapis.com/drive/v3/files';
const BK_UP_ = 'https://www.googleapis.com/upload/drive/v3/files';
const BK_KEEP_ = 30;
const BK_EVERY_MS_ = 20 * 3600 * 1000;      // a daily backup at most every 20 hours
const BK_RETRY_MS_ = 6 * 3600 * 1000;       // after Drive said no, wait before trying the daily one again
const BK_KINDS_ = ['manual', 'daily', 'before-reset', 'before-restore'];

function backupRoutes_() {
  return [
    ['GET', /^\/api\/backups$/, bkListRoute_],
    ['GET', /^\/api\/backups\/offer$/, bkOfferRoute_],
    ['POST', /^\/api\/backups$/, bkSaveRoute_],
    ['POST', /^\/api\/backups\/restore$/, bkRestoreRoute_],
  ];
}

const bkProps_ = () => PropertiesService.getScriptProperties();

function bkWhy_(msg) {
  return /authori|permission|scope|insufficient/i.test(String(msg || ''))
    ? 'Drive backups need a one-time OK from the owner: open the RuPeace script in Google and run authorizeDrive.'
    : 'Could not reach Google Drive. Try again in a moment.';
}

/** One call to the Drive API as the owner. null for 404; a plain ApiError_ for anything else that failed. */
function bkCall_(method, url, opt) {
  let r;
  try {
    r = UrlFetchApp.fetch(url, Object.assign({ method, muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() } }, opt || {}));
  } catch (e) {
    throw ApiError_(bkWhy_(e && e.message));
  }
  const code = r.getResponseCode();
  if (code === 404) return null;
  if (code === 401 || code === 403) throw ApiError_(bkWhy_(r.getContentText() + ' permission'));
  if (code >= 300) throw ApiError_('Google Drive did not accept that (' + code + '). Try again in a moment.');
  return r;
}
const bkJson_ = r => JSON.parse(r.getContentText() || '{}');

/** The "RuPeace backups" folder (made the first time, found again by its id). */
function bkFolder_() {
  let id = bkProps_().getProperty('BACKUP_FOLDER_ID');
  if (id) {
    const r = bkCall_('get', BK_API_ + '/' + encodeURIComponent(id) + '?fields=id,trashed');
    if (r && !bkJson_(r).trashed) return id;
  }
  const r = bkCall_('post', BK_API_ + '?fields=id', { contentType: 'application/json',
    payload: JSON.stringify({ name: 'RuPeace backups', mimeType: 'application/vnd.google-apps.folder' }) });
  id = bkJson_(r).id;
  bkProps_().setProperty('BACKUP_FOLDER_ID', id);
  return id;
}

function bkShape_(f) {
  const a = f.appProperties || {};
  return { id: f.id, name: f.name, created: f.createdTime || '', size: Number(f.size || 0), kind: a.kind || 'manual',
    entries: Number(a.entries || 0), people: Number(a.people || 0), accounts: Number(a.accounts || 0), rows: Number(a.rows || 0) };
}

/** Is there nothing to lose? (no entries, no accounts, at most the one person who just signed in) */
function bkEmpty_(db) {
  return !db.all_('entries').length && !db.all_('accounts').length && db.all_('people').length <= 1;
}

/** Saves everything as one file in the folder; keeps the newest BK_KEEP_. */
function bkSave_(db, kind, prune) {
  const data = exportAll_({ db });
  const n = t => (data.tables[t] || []).length;
  const folder = bkFolder_();
  const k = BK_KINDS_.indexOf(kind) >= 0 ? kind : 'manual';
  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Kolkata', 'yyyy-MM-dd HH.mm');
  const meta = { name: 'RuPeace backup ' + stamp + (k === 'manual' ? '' : ' (' + k + ')') + '.json', parents: [folder], mimeType: 'application/json',
    appProperties: { rupeace: '1', kind: k, entries: String(n('entries')), people: String(n('people')), accounts: String(n('accounts')),
      rows: String(Object.keys(data.tables).reduce((s, t) => s + n(t), 0)) } };
  const b = 'rupeace' + Utilities.getUuid().replace(/-/g, '');
  const body = '--' + b + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(meta) + '\r\n--' + b +
    '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(data) + '\r\n--' + b + '--';
  const r = bkCall_('post', BK_UP_ + '?uploadType=multipart&fields=id,name,createdTime,size,appProperties',
    { contentType: 'multipart/related; boundary=' + b, payload: body });
  bkProps_().setProperty('BACKUP_LAST', String(Date.now()));
  bkProps_().deleteProperty('BACKUP_FAILED');
  const saved = bkShape_(bkJson_(r));
  if (prune !== false) bkList_(folder).slice(BK_KEEP_).forEach(f => { try { bkCall_('delete', BK_API_ + '/' + encodeURIComponent(f.id)); } catch (e) { /* next time */ } });
  return saved;
}

function bkList_(folder) {
  const q = encodeURIComponent("'" + folder + "' in parents and trashed = false");
  const r = bkCall_('get', BK_API_ + '?q=' + q + '&orderBy=createdTime%20desc&pageSize=100&fields=files(id,name,createdTime,size,appProperties)');
  return r ? (bkJson_(r).files || []).filter(f => f.appProperties && f.appProperties.rupeace === '1').map(bkShape_) : [];
}

/** The first sync of the day saves a backup (never on an empty sheet; quiet when Drive is not set up yet). */
function bkMaybeDaily_(db) {
  const p = bkProps_(), now = Date.now();
  if (now - Number(p.getProperty('BACKUP_LAST') || 0) < BK_EVERY_MS_) return;
  if (now - Number(p.getProperty('BACKUP_FAILED') || 0) < BK_RETRY_MS_) return;
  if (bkEmpty_(db)) return;
  try { bkSave_(db, 'daily'); } catch (e) { p.setProperty('BACKUP_FAILED', String(now)); }
}

// ---------------------------------------------------------------- routes
function bkListRoute_() {
  const folder = bkFolder_();
  return { backups: bkList_(folder), last: Number(bkProps_().getProperty('BACKUP_LAST') || 0) || null,
    folder_url: 'https://drive.google.com/drive/folders/' + folder, keep: BK_KEEP_ };
}

function bkOfferRoute_(ctx) {
  if (!bkEmpty_(ctx.db)) return { empty: false, backups: [] };
  try {
    const id = bkProps_().getProperty('BACKUP_FOLDER_ID');
    return { empty: true, backups: id ? bkList_(bkFolder_()).filter(f => f.entries || f.accounts || f.people > 1).slice(0, 6) : [] };
  } catch (e) {
    return { empty: true, backups: [], error: e.message };
  }
}

function bkSaveRoute_(ctx) {
  return { backup: bkSave_(ctx.db, (ctx.body || {}).kind) };
}

function bkRestoreRoute_(ctx) {
  const db = ctx.db, b = ctx.body || {};
  if (b.confirm !== 'REPLACE') throw ApiError_('Confirm that this backup should replace everything.');
  const r = bkCall_('get', BK_API_ + '/' + encodeURIComponent(String(b.id || '')) + '?alt=media');
  if (!r) throw ApiError_('That backup is no longer in Google Drive.');
  let data;
  try { data = JSON.parse(r.getContentText()); } catch (e) { data = null; }
  if (!data || data.version !== 1 || !data.tables) throw ApiError_("That file isn't a RuPeace backup.");
  if (!bkEmpty_(db)) bkSave_(db, 'before-restore');            // nothing is lost: what is here now is kept in Drive
  // PINs belong to people: remember whose they are, so a PIN never ends up on someone else after the restore
  const nameOf = id => { const p = db.get('people', id); return p ? String(p.name).trim().toLowerCase() : null; };
  const holders = authPinIds_().map(id => [id, nameOf(id)]);
  const me = AUTH_.person, myName = me ? nameOf(me) : null;
  const res = importAll_({ db, body: { version: 1, tables: data.tables, confirm: 'REPLACE' } });
  holders.forEach(([id, was]) => { if (nameOf(id) !== was) authWrite_('pin:' + id, null); });
  return { restored: res.imported, signin_again: !me || nameOf(me) !== myName };
}

// ---- google/server/db.js
// google/server/db.js — the Sheet table layer.
// One tab per table, header row = column names, text columns formatted '@' so Sheets never turns '2026-11-23' into a
// date. Each request opens a DbConn_: a tab is read once (getDataRange) on first use and cached; writes change the
// cache and are written to the Sheet by commit() at the end of a successful request (single rows with setValues,
// deletions with deleteRows, new rows in one block). A request that fails writes nothing, like the SQLite rollback.

const TYPES_ = ['income', 'expense', 'savings', 'loan', 'transfer'];
const METHODS_ = ['UPI', 'Bank transfer', 'Debit card', 'Credit card', 'Cash', 'Auto-debit', 'Cheque', 'Other'];
const ACCOUNT_KINDS_ = ['bank', 'card', 'cash', 'wallet'];
const LOAN_KINDS_ = ['home', 'car', 'personal', 'education', 'gold', 'other'];
const LOAN_PARTS_ = ['emi', 'pre_emi', 'prepay', 'charges'];
const SAVINGS_KINDS_ = ['mutual_fund', 'ppf', 'epf', 'nps', 'stocks', 'fd', 'rd', 'gold', 'other'];
const FREQUENCIES_ = ['monthly', 'quarterly', 'yearly'];

// [column, kind, default]. kind: id | int | real | text | key. Number columns without a default are NULL-able.
// Same columns and order as the SQLite schema (people.email, entries/recurring.for_id, loans.repay/interest_until
// last, as ALTER TABLE added them). No tz_invoices.
const SCHEMA_ = {
  people: [['id', 'id'], ['name', 'text'], ['relation', 'text'], ['earns', 'int', 0], ['active', 'int', 1],
    ['sort', 'int', 0], ['email', 'text']],
  accounts: [['id', 'id'], ['name', 'text'], ['kind', 'text', 'bank'], ['provider', 'text'], ['owner_id', 'int'],
    ['last4', 'text'], ['opening_balance', 'real', 0], ['opening_date', 'text'], ['credit_limit', 'real', 0],
    ['active', 'int', 1], ['note', 'text'], ['sort', 'int', 0]],
  categories: [['id', 'id'], ['name', 'text'], ['type', 'text'], ['budget', 'real', 0], ['active', 'int', 1],
    ['sort', 'int', 0]],
  loans: [['id', 'id'], ['name', 'text'], ['kind', 'text', 'other'], ['lender', 'text'], ['borrower_id', 'int'],
    ['principal', 'real', 0], ['rate', 'real', 0], ['tenure_months', 'int', 0], ['start_date', 'text'],
    ['emi_start', 'text'], ['emi_day', 'int', 5], ['emi_amount', 'real', 0], ['disbursal', 'text', 'full'],
    ['prepay_plan', 'text', 'none'], ['prepay_amount', 'real', 0], ['reserve', 'real', 0], ['active', 'int', 1],
    ['note', 'text'], ['track_from', 'text'], ['track_balance', 'real', 0], ['repay', 'text', 'emi'],
    ['interest_until', 'text']],
  loan_stages: [['id', 'id'], ['loan_id', 'int'], ['label', 'text'], ['due_date', 'text'], ['amount', 'real', 0],
    ['released_date', 'text']],
  loan_rates: [['id', 'id'], ['loan_id', 'int'], ['from_date', 'text'], ['rate', 'real'], ['note', 'text']],
  savings_places: [['id', 'id'], ['name', 'text'], ['kind', 'text', 'other'], ['provider', 'text'], ['owner_id', 'int'],
    ['opening_value', 'real', 0], ['opening_date', 'text'], ['monthly_target', 'real', 0], ['maturity_date', 'text'],
    ['active', 'int', 1], ['note', 'text']],
  savings_values: [['id', 'id'], ['place_id', 'int'], ['date', 'text'], ['value', 'real'], ['note', 'text']],
  entries: [['id', 'id'], ['date', 'text'], ['type', 'text'], ['category_id', 'int'], ['description', 'text'],
    ['amount', 'real'], ['person_id', 'int'], ['method', 'text'], ['account_id', 'int'], ['to_account_id', 'int'],
    ['loan_id', 'int'], ['loan_part', 'text'], ['savings_id', 'int'], ['status', 'text', 'done'],
    ['source', 'text', 'manual'], ['source_ref', 'text'], ['note', 'text'], ['created_at', 'text', '', 'now'],
    ['for_id', 'int'], ['event_id', 'int']],
  recurring: [['id', 'id'], ['name', 'text'], ['type', 'text'], ['category_id', 'int'], ['amount', 'real', 0],
    ['person_id', 'int'], ['method', 'text'], ['account_id', 'int'], ['to_account_id', 'int'], ['loan_id', 'int'],
    ['loan_part', 'text'], ['savings_id', 'int'], ['frequency', 'text', 'monthly'], ['day', 'int', 1],
    ['start_month', 'text'], ['end_month', 'text'], ['active', 'int', 1], ['for_id', 'int']],
  planned_items: [['id', 'id'], ['month', 'text'], ['type', 'text'], ['category_id', 'int'], ['description', 'text'],
    ['amount', 'real', 0], ['person_id', 'int'], ['note', 'text'], ['day', 'int']],
  // Events (a trip, a festival): a rough budget for some dates; spends are linked to one by entries.event_id
  events: [['id', 'id'], ['name', 'text'], ['start_date', 'text'], ['end_date', 'text'], ['budget', 'real', 0],
    ['note', 'text']],
  settings: [['key', 'key'], ['value', 'text']],
};
const UNIQUE_ = { people: [['name']], accounts: [['name']], categories: [['name', 'type']], loans: [['name']],
  savings_places: [['name']] };
// Hidden row metadata for offline sync (OFFLINE.md): _at = ISO UTC time of the row's last change, _by = person id
// (or ''). They live in the Sheet only: never in rows()/get()/all_() or any API answer, kept as they are on writes,
// stamped by commit() on every row it changes. A tab gets them once sync is switched on (Script Property SYNC_ON,
// set by the first POST /api/sync); before that the Sheet looks exactly as it always did.
const META_COLS_ = ['_at', '_by'];

const Db = {
  /** Opens the data Sheet: Script Property SHEET_ID, else the spreadsheet the script is bound to. */
  open(spreadsheet) {
    // inside apiBatch(): one connection (one read of each tab) serves every call of the trip
    if (!spreadsheet && REQ_.shareDb && REQ_.db) return REQ_.db;
    let ss = spreadsheet || null;
    if (!ss) {
      const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
      ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
    }
    if (!ss) throw ApiError_('The data sheet was not found. Set the SHEET_ID script property.');
    const conn = new DbConn_(ss);
    if (!spreadsheet && REQ_.shareDb) REQ_.db = conn;
    return conn;
  },
};

function isNumKind_(kind) {
  return kind === 'id' || kind === 'int' || kind === 'real';
}

function colDefault_(col) {
  if (col[3] === 'now') return nowUtc_();
  if (col[1] === 'text' || col[1] === 'key') return col[2] === undefined ? '' : col[2];
  return col[2] === undefined ? null : col[2];
}

function decodeCell_(col, v) {   // Sheet cell -> value as SQLite would hand it back
  if (!isNumKind_(col[1])) {
    if (v === '' || v === null || v === undefined) return '';
    if (isDate_(v)) return Utilities.formatDate(v, Session.getScriptTimeZone() || 'Asia/Kolkata', 'yyyy-MM-dd');
    return String(v);
  }
  if (v === '' || v === null || v === undefined) return col[2] === undefined ? null : col[2];
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const s = String(v).trim();
  if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) return Number(s);
  return s === '' ? (col[2] === undefined ? null : col[2]) : String(v);
}

function coerceVal_(col, v) {    // value written by code -> stored value (SQLite column affinity)
  if (v === undefined || v === null) return colDefault_(col[3] === 'now' ? [col[0], col[1], ''] : col);
  if (!isNumKind_(col[1])) {
    if (typeof v === 'boolean') return v ? '1' : '0';
    if (isDate_(v)) return Utilities.formatDate(v, Session.getScriptTimeZone() || 'Asia/Kolkata', 'yyyy-MM-dd');
    return typeof v === 'string' ? v : String(v);
  }
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string' && /^\s*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?\s*$/.test(v)) return Number(v);
  return v;
}

function encodeCell_(col, v) {   // stored value -> Sheet cell
  if (isNumKind_(col[1])) return v === null || v === undefined ? '' : v;
  return v === null || v === undefined ? '' : String(v);
}

function integrityError_(msg) {
  const e = new Error('IntegrityError: ' + msg);
  e.integrity = true;
  return e;
}

class DbConn_ {
  constructor(ss) {
    this.ss = ss;
    this.tabs = null;
    this.cache = {};
  }

  // ---------------------------------------------------------------- tabs
  sheet_(name) {
    if (!this.tabs) {
      this.tabs = {};
      this.ss.getSheets().forEach(s => { this.tabs[s.getName()] = s; });
    }
    return this.tabs[name] || null;
  }

  makeTab_(name) {
    const sh = this.ss.insertSheet(name);
    this.sheet_(name);
    this.tabs[name] = sh;
    this.fixHeader_(sh, name, []);
    sh.setFrozenRows(1);
    return sh;
  }

  /** Adds the schema columns missing from a tab's header (at the end) and formats them. */
  fixHeader_(sh, name, header) {
    const cols = SCHEMA_[name];
    const missing = cols.filter(c => header.indexOf(c[0]) < 0);
    if (META_COLS_.some(m => header.indexOf(m) < 0) && this.metaOn_()) {
      META_COLS_.forEach(m => { if (header.indexOf(m) < 0) missing.push([m, 'text']); });
    }
    if (!missing.length) return false;
    let used = header.length;
    while (used > 0 && header[used - 1] === '') used--;
    const need = used + missing.length;
    if (sh.getMaxColumns() < need) sh.insertColumnsAfter(sh.getMaxColumns(), need - sh.getMaxColumns());
    sh.getRange(1, used + 1, 1, missing.length).setValues([missing.map(c => c[0])]);
    const rows = sh.getMaxRows();
    missing.forEach((c, k) => {
      sh.getRange(1, used + 1 + k, rows, 1).setNumberFormat(isNumKind_(c[1]) ? 'General' : '@');
    });
    return true;
  }

  /** Creates missing tabs and header columns for every table. Safe to run again. */
  ensureSchema() {
    Object.keys(SCHEMA_).forEach(name => {
      const sh = this.sheet_(name);
      if (!sh) {
        this.makeTab_(name);
      } else {
        const header = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0].map(h => String(h).trim());
        this.fixHeader_(sh, name, header);
      }
      delete this.cache[name];
    });
  }

  /** Is offline sync switched on (Script Property SYNC_ON)? Read once per connection. */
  metaOn_() {
    if (this.meta === undefined) {
      let v = null;
      try {
        v = PropertiesService.getScriptProperties().getProperty('SYNC_ON');
      } catch (e) {
        v = null;
      }
      this.meta = v === '1';
    }
    return this.meta;
  }

  /** Switches sync on (first POST /api/sync): every tab gets its _at/_by columns. Call before any write. */
  enableMeta_() {
    if (!this.metaOn_()) {
      PropertiesService.getScriptProperties().setProperty('SYNC_ON', '1');
      this.meta = true;
    }
    Object.keys(SCHEMA_).forEach(name => {
      const t = this.cache[name];
      if (t && t.atIdx >= 0 && t.byIdx >= 0) return;
      if (t && t.dirty) throw new Error('enableMeta_() after a write to ' + name);
      delete this.cache[name];
      this.table_(name);                                     // reads the tab and adds the columns
    });
  }

  table_(name) {
    if (this.cache[name]) return this.cache[name];
    const cols = SCHEMA_[name];
    if (!cols) throw new Error('Unknown table: ' + name);
    let sh = this.sheet_(name);
    if (!sh) sh = this.makeTab_(name);                      // lazy schema: a missing tab is made on first use
    let values = sh.getDataRange().getValues();
    let header = (values[0] || []).map(h => String(h).trim());
    if (this.fixHeader_(sh, name, header)) {
      values = sh.getDataRange().getValues();
      header = values[0].map(h => String(h).trim());
    }
    const idx = cols.map(c => header.indexOf(c[0]));
    const items = [];
    for (let i = 1; i < values.length; i++) {
      const raw = values[i];
      const key = raw[idx[0]];
      if (key === '' || key === null || key === undefined) continue;    // blank line in the tab
      const rec = {};
      cols.forEach((c, j) => { rec[c[0]] = decodeCell_(c, raw[idx[j]]); });
      items.push({ rec, orig: rec, raw, r: i + 1, changed: false });     // orig: the row as read (update() never
    }                                                                        // changes a rec in place)
    if (cols[0][1] === 'id') items.sort((a, b) => a.rec.id - b.rec.id);
    const t = { name, sh, cols, header, idx, width: header.length, items, byKey: null, deleted: [],
      dirty: false, replaced: false, loaded: items.slice(), atIdx: header.indexOf('_at'), byIdx: header.indexOf('_by') };
    this.cache[name] = t;
    return t;
  }

  keyOf_(t, v) {
    return t.cols[0][1] === 'id' ? Number(v) : String(v);
  }

  find_(t, key) {
    if (!t.byKey) {
      t.byKey = new Map();
      t.items.forEach(it => t.byKey.set(it.rec[t.cols[0][0]], it));
    }
    return t.byKey.get(this.keyOf_(t, key)) || null;
  }

  checkUnique_(t, rec, self) {
    (UNIQUE_[t.name] || []).forEach(cols => {
      const clash = t.items.some(it => it !== self && cols.every(c => it.rec[c] === rec[c]));
      if (clash) throw integrityError_('UNIQUE constraint failed: ' + t.name + '.' + cols.join(', ' + t.name + '.'));
    });
  }

  // ---------------------------------------------------------------- reads
  /** All rows of a table (copies), in id order (settings: sheet order). */
  rows(table) {
    return this.table_(table).items.map(it => Object.assign({}, it.rec));
  }

  /** The cached rows themselves — read-only, for loops over big tables. */
  all_(table) {
    return this.table_(table).items.map(it => it.rec);
  }

  get(table, id) {
    const it = this.find_(this.table_(table), id);
    return it ? Object.assign({}, it.rec) : null;
  }

  // ---------------------------------------------------------------- writes
  /** Inserts a row (missing columns get their defaults, id = max + 1 unless given). Returns the new id. */
  insert(table, obj) {
    const t = this.table_(table);
    const keyCol = t.cols[0];
    const rec = {};
    t.cols.forEach(c => {
      if (c === keyCol) return;
      rec[c[0]] = has_(obj, c[0]) ? coerceVal_(c, obj[c[0]]) : colDefault_(c);
    });
    let key;
    if (keyCol[1] === 'id') {
      const last = t.items.length ? t.items[t.items.length - 1].rec.id : 0;
      const given = has_(obj, 'id') && obj.id !== null && obj.id !== '';
      if (given) key = Number(obj.id);
      else if (REQ_.localIds) key = Math.min(0, t.items.length ? Number(t.items[0].rec.id) || 0 : 0) - 1;  // temporary
      else key = (Number(last) || 0) + 1;
    } else {
      key = String(obj[keyCol[0]]);
    }
    if (this.find_(t, key)) throw integrityError_('UNIQUE constraint failed: ' + t.name + '.' + keyCol[0]);
    const full = {};
    full[keyCol[0]] = key;
    Object.keys(rec).forEach(k => { full[k] = rec[k]; });
    this.checkUnique_(t, full, null);
    const it = { rec: full, raw: null, r: 0, changed: true };
    if (keyCol[1] === 'id' && t.items.length && key < t.items[t.items.length - 1].rec.id) {
      let pos = t.items.findIndex(x => x.rec.id > key);
      t.items.splice(pos, 0, it);
    } else {
      t.items.push(it);
    }
    t.byKey.set(key, it);
    t.dirty = true;
    return key;
  }

  /** Changes some columns of one row. Unknown ids are ignored (like UPDATE ... WHERE id=?). */
  update(table, id, patch) {
    const t = this.table_(table);
    const it = this.find_(t, id);
    if (!it || !patch) return 0;
    const rec = Object.assign({}, it.rec);
    let any = false;
    t.cols.forEach(c => {
      if (c === t.cols[0] || !has_(patch, c[0])) return;
      rec[c[0]] = coerceVal_(c, patch[c[0]]);
      any = true;
    });
    if (!any) return 0;
    this.checkUnique_(t, rec, it);
    it.rec = rec;
    it.changed = true;
    t.dirty = true;
    return 1;
  }

  remove(table, id) {
    const t = this.table_(table);
    const it = this.find_(t, id);
    if (!it) return 0;
    this.drop_(t, [it]);
    return 1;
  }

  /** Deletes every row for which pred(row) is true. Returns how many. */
  removeWhere(table, pred) {
    const t = this.table_(table);
    const gone = t.items.filter(it => pred(it.rec));
    if (gone.length) this.drop_(t, gone);
    return gone.length;
  }

  drop_(t, gone) {
    this.find_(t, -1);                                               // builds t.byKey
    const set = new Set(gone);
    t.items = t.items.filter(it => !set.has(it));
    gone.forEach(it => {
      if (it.r) t.deleted.push(it.r);
      t.byKey.delete(it.rec[t.cols[0][0]]);
    });
    t.dirty = true;
  }

  /** Replaces every row of a table (ids kept). */
  replaceAll(table, rows) {
    const t = this.table_(table);
    t.items = [];
    t.byKey = new Map();
    t.deleted = [];
    t.replaced = true;
    t.dirty = true;
    (rows || []).forEach(r => this.insert(table, r));
  }

  getSetting(key, dflt) {
    const it = this.find_(this.table_('settings'), key);
    if (!it) return dflt === undefined ? null : dflt;
    try {
      return JSON.parse(it.rec.value);
    } catch (e) {
      return dflt === undefined ? null : dflt;
    }
  }

  setSetting(key, value) {
    const text = JSON.stringify(value === undefined ? null : value);
    if (this.find_(this.table_('settings'), key)) this.update('settings', key, { value: text });
    else this.insert('settings', { key: String(key), value: text });
  }

  // ---------------------------------------------------------------- row metadata (sync)
  metaOfItem_(t, it) {
    const cell = i => (i >= 0 && it.raw && it.raw[i] !== undefined && it.raw[i] !== null ? it.raw[i] : '');
    let at = cell(t.atIdx);
    if (isDate_(at)) at = at.toISOString();
    const b = cell(t.byIdx);
    const by = b === '' ? '' : /^\s*\d+\s*$/.test(String(b)) ? Number(b) : String(b);
    return { at: String(at), by };
  }

  /** {at, by} of a row as it was read from the Sheet ('' when unknown), or null if there is no such row. */
  rowMeta_(table, key) {
    const t = this.table_(table);
    const it = this.find_(t, key);
    return it ? this.metaOfItem_(t, it) : null;
  }

  /** Rows with their metadata: [{row (read-only), at, by}], in table order. */
  rowsWithMeta_(table) {
    const t = this.table_(table);
    return t.items.map(it => { const m = this.metaOfItem_(t, it); return { row: it.rec, at: m.at, by: m.by }; });
  }

  /** What this request really changed in a table: [{key, before, after, it}] (no-op updates left out). */
  diff_(t) {
    const kn = t.cols[0][0];
    const live = new Set(t.items);
    const same = (a, b) => t.cols.every(c => a[c[0]] === b[c[0]]);
    const out = [], matched = new Set();
    t.loaded.forEach(old => {
      const key = old.orig[kn];
      let now = live.has(old) ? old : (t.byKey && t.byKey.get(key)) || null;
      if (now && !live.has(now)) now = null;
      if (now) matched.add(now);
      if (now && same(old.orig, now.rec)) return;
      out.push({ key, before: old.orig, after: now ? now.rec : null, it: now });
    });
    t.items.forEach(it => { if (!matched.has(it)) out.push({ key: it.rec[kn], before: null, after: it.rec, it }); });
    return out;
  }

  // ---------------------------------------------------------------- commit
  rowOut_(t, it) {
    const raw = it.raw ? it.raw.slice() : [];
    while (raw.length < t.width) raw.push('');
    t.cols.forEach((c, j) => { raw[t.idx[j]] = encodeCell_(c, it.rec[c[0]]); });
    if (this.stamp && this.stamp.items.has(it)) {
      if (t.atIdx >= 0) raw[t.atIdx] = this.stamp.at;
      if (t.byIdx >= 0) raw[t.byIdx] = this.stamp.by;
    }
    return raw;
  }

  formats_(t) {
    const f = [];
    for (let i = 0; i < t.width; i++) f.push('General');
    t.cols.forEach((c, j) => { if (!isNumKind_(c[1])) f[t.idx[j]] = '@'; });
    if (t.atIdx >= 0) f[t.atIdx] = '@';
    if (t.byIdx >= 0) f[t.byIdx] = '@';
    return f;
  }

  /** SYNC_SEQ + 1, and remember when (SYNC_SEQ_LOG: the last 200 [seq, ISO time]). */
  bumpSeq_(at) {
    const p = PropertiesService.getScriptProperties();
    const seq = (Number(p.getProperty('SYNC_SEQ')) || 0) + 1;
    let log = [];
    try {
      log = JSON.parse(p.getProperty('SYNC_SEQ_LOG') || '[]');
    } catch (e) {
      log = [];
    }
    if (!Array.isArray(log)) log = [];
    log.push([seq, at]);
    if (log.length > 200) log = log.slice(log.length - 200);
    p.setProperty('SYNC_SEQ', String(seq));
    p.setProperty('SYNC_SEQ_LOG', JSON.stringify(log));
    this.seq = seq;
    return seq;
  }

  writeBlock_(t, startRow, items) {
    if (!items.length) return;
    const sh = t.sh;
    const need = startRow + items.length - 1;
    if (sh.getMaxRows() < need) sh.insertRowsAfter(sh.getMaxRows(), need - sh.getMaxRows() + 50);
    const fmt = this.formats_(t);
    const rg = sh.getRange(startRow, 1, items.length, t.width);
    rg.setNumberFormats(items.map(() => fmt));
    rg.setValues(items.map(it => this.rowOut_(t, it)));
  }

  /** Writes this request's changes to the Sheet. Called by api() after the handler succeeded. */
  commit() {
    const at = new Date().toISOString();
    const by = typeof AUTH_ !== 'undefined' && AUTH_.person ? String(AUTH_.person) : '';
    const capture = Array.isArray(REQ_.capture) ? REQ_.capture : null;
    let wrote = false;
    Object.keys(this.cache).forEach(name => {
      const t = this.cache[name];
      if (!t.dirty) return;
      const changes = this.diff_(t);
      if (!changes.length && !t.replaced) {                          // only no-op updates: nothing to write
        t.dirty = false;
        t.items.forEach(it => { it.changed = false; });
        return;
      }
      wrote = true;
      if (capture) {
        changes.forEach(c => capture.push({ table: name, key: c.key, before: c.before ? Object.assign({}, c.before) : null,
          after: c.after ? Object.assign({}, c.after) : null }));
      }
      const touched = new Set();
      changes.forEach(c => { if (c.it) touched.add(c.it); });
      t.items.forEach(it => { if (!it.r) touched.add(it); });
      this.stamp = { at, by, items: touched };
      const sh = t.sh;
      if (t.replaced && !t.items.length && !t.loaded.length) {         // emptied, and it was empty: nothing to write
        this.stamp = null; delete this.cache[name]; return;
      }
      if (t.replaced) {
        const last = sh.getLastRow();
        if (last > 1) sh.getRange(2, 1, last - 1, Math.max(t.width, sh.getLastColumn())).clearContent();
        this.writeBlock_(t, 2, t.items);
      } else {
        t.items.forEach(it => {                                      // changed rows, one setValues each
          if (it.changed && it.r && touched.has(it)) sh.getRange(it.r, 1, 1, t.width).setValues([this.rowOut_(t, it)]);
        });
        const del = t.deleted.slice().sort((a, b) => b - a);         // bottom up, runs of rows at once
        for (let i = 0; i < del.length;) {
          let j = i;
          while (j + 1 < del.length && del[j + 1] === del[j] - 1) j++;
          sh.deleteRows(del[j], j - i + 1);
          i = j + 1;
        }
        this.writeBlock_(t, sh.getLastRow() + 1, t.items.filter(it => !it.r));
      }
      this.stamp = null;
      delete this.cache[name];                                       // row numbers changed: read again if needed
    });
    if (wrote) this.bumpSeq_(at);
    return wrote;
  }
}

// ---------------------------------------------------------------- money helpers shared by every module
/** How a done entry moves money: [[account_id, signed amount]]. Pending entries move nothing. */
function entryEffect_(e) {
  if ((e.status === undefined ? 'done' : e.status) !== 'done' || !e.account_id) return [];
  const a = e.amount;
  if (e.type === 'income') return [[e.account_id, a]];
  if (e.type === 'transfer') return [[e.account_id, -a]].concat(e.to_account_id ? [[e.to_account_id, a]] : []);
  return [[e.account_id, -a]];
}

/** Balance of every account on a date (default today): opening balance + done entries. */
function balances_(db, asOf) {
  asOf = asOf || today_();
  const accts = orderBy_(db.rows('accounts'), [['sort'], ['id']]);
  const bal = new Map();
  accts.forEach(a => bal.set(a.id, (a.opening_date || '') <= asOf ? a.opening_balance : 0.0));
  const es = db.all_('entries').filter(e => e.date <= asOf && e.status === 'done');
  orderBy_(es, [['date']]).forEach(e => {
    entryEffect_(e).forEach(x => bal.set(x[0], mapGet_(bal, x[0], 0.0) + x[1]));
  });
  accts.forEach(a => { a.balance = pyRound_(mapGet_(bal, a.id, 0.0), 2); });
  return accts;
}

// ---- google/server/events.js
// google/server/events.js — Events: a rough budget for a trip or a festival, with the spends linked to it.
// GET /api/events -> {events: [{id, name, start_date, end_date, budget, note, spent, count, left, over, state}]}
// state: 'coming' (before its start), 'on' (today within its dates), 'done' (after its last day).
// The rows themselves are added, changed and deleted through /api/setup/events (setup.js).

function eventsRoutes_() {
  return [['GET', /^\/api\/events$/, eventsList_]];
}

function eventsList_(ctx) {
  const db = ctx.db, t = today_();
  const spent = new Map(), count = new Map();
  db.all_('entries').forEach(e => {
    if (!e.event_id || e.status !== 'done') return;
    spent.set(e.event_id, mapGet_(spent, e.event_id, 0.0) + e.amount);
    count.set(e.event_id, mapGet_(count, e.event_id, 0) + 1);
  });
  const rows = db.rows('events').map(ev => {
    const s = r2_(mapGet_(spent, ev.id, 0.0)), b = ev.budget || 0;
    const end = ev.end_date || ev.start_date;
    const state = t < ev.start_date ? 'coming' : t > end ? 'done' : 'on';
    return Object.assign({}, ev, { spent: s, count: mapGet_(count, ev.id, 0), left: r2_(Math.max(0, b - s)), over: r2_(Math.max(0, s - b)), state });
  });
  const rank = { on: 0, coming: 1, done: 2 };
  rows.sort((a, b) => rank[a.state] - rank[b.state] || (a.state === 'done' ? (b.start_date < a.start_date ? -1 : 1) : (a.start_date < b.start_date ? -1 : a.start_date > b.start_date ? 1 : a.id - b.id)));
  return { events: rows, today: t };
}

// ---- google/server/ledger.js
// google/server/ledger.js — every entry, plus pending rows made from recurring items.
// GET /api/ledger?from&to · POST / PUT / DELETE /api/ledger[/<id>] · POST .../confirm · POST /api/ledger/recurring/<id>/sync

const LEDGER_NEEDS_CATEGORY_ = ['income', 'expense', 'savings', 'loan'];
const LEDGER_DISMISSED_ = 'ledger_dismissed';   // settings key: source_refs the user deleted, never made again

function ledgerRoutes_() {
  return [
    ['GET', /^\/api\/ledger$/, ledgerList_, [], true],          // writes: makes pending recurring rows
    ['POST', /^\/api\/ledger$/, ledgerCreate_],
    ['PUT', /^\/api\/ledger\/(-?\d+)$/, ledgerUpdate_, ['id']],
    ['DELETE', /^\/api\/ledger\/(-?\d+)$/, ledgerDelete_, ['id']],
    ['POST', /^\/api\/ledger\/(-?\d+)\/confirm$/, ledgerConfirm_, ['id']],
    ['POST', /^\/api\/ledger\/recurring\/(-?\d+)\/sync$/, recurringSync_, ['id']],
  ];
}

function ledgerLookups_(db) {
  const m = t => {
    const x = new Map();
    db.all_(t).forEach(r => x.set(r.id, r));
    return x;
  };
  return { categories: m('categories'), people: m('people'), accounts: m('accounts'), loans: m('loans'),
    savings: m('savings_places'), events: m('events') };
}

/** An entry with the names the SQL joins add (category, person, account, account_kind, to_account, loan, savings). */
function ledgerRow_(e, lk) {
  const o = Object.assign({}, e);
  const get = (map, id) => (id === null || id === undefined ? null : map.get(id) || null);
  const nm = r => (r ? r.name : null);
  const acc = get(lk.accounts, e.account_id);
  o.category = nm(get(lk.categories, e.category_id));
  o.person = nm(get(lk.people, e.person_id));
  o.account = nm(acc);
  o.account_kind = acc ? acc.kind : null;
  o.to_account = nm(get(lk.accounts, e.to_account_id));
  o.loan = nm(get(lk.loans, e.loan_id));
  o.savings = nm(get(lk.savings, e.savings_id));
  o.for_person = nm(get(lk.people, e.for_id));
  o.event = nm(get(lk.events, e.event_id));
  return o;
}

function ledgerGetEntry_(db, id) {
  const e = db.get('entries', id);
  if (!e) throw ApiError_('That row no longer exists');
  return ledgerRow_(e, ledgerLookups_(db));
}

function ledgerExists_(db, table, rid, what) {
  if (rid && !db.get(table, rid)) throw ApiError_('That ' + what + ' no longer exists');
  return rid;
}

/** Validate an entry. For an update, `old` is the saved row and body holds only the changed fields. */
function ledgerClean_(db, body, old) {
  const e = Object.assign({}, old || {});
  ['date', 'type', 'category_id', 'description', 'amount', 'person_id', 'method', 'account_id', 'to_account_id',
    'loan_id', 'loan_part', 'savings_id', 'note', 'for_id', 'event_id'].forEach(k => { if (has_(body, k)) e[k] = body[k]; });
  const out = {
    date: iso_(e.date, 'date'),
    type: pyTruthy_(e.type) ? choice_(e.type, TYPES_, 'type') : null,
    description: (pyTruthy_(e.description) ? pyStr_(e.description) : '').trim(),
    amount: pyRound_(num_(e.amount, 0.0, 'amount'), 2),
    note: (pyTruthy_(e.note) ? pyStr_(e.note) : '').trim(),
  };
  if (!out.type) throw ApiError_('Type is required');
  const typ = out.type;
  if (out.amount <= 0) throw ApiError_('Amount must be more than zero');

  out.category_id = ledgerExists_(db, 'categories', refId_(e.category_id), 'category');
  if (LEDGER_NEEDS_CATEGORY_.indexOf(typ) >= 0 && !out.category_id) throw ApiError_('Category is required');
  if (out.category_id) {
    const cat = db.get('categories', out.category_id);
    if (cat.type !== typ) {
      // the type was changed: move to the same-named category of the new type (made if needed)
      const same = db.all_('categories').filter(c => lowerAscii_(c.name) === lowerAscii_(cat.name) && c.type === typ)[0];
      out.category_id = same ? same.id : db.insert('categories', { name: cat.name, type: typ,
        sort: (maxOf_(db.all_('categories').map(c => c.sort), 0) || 0) + 1 });
    }
  }

  out.person_id = ledgerExists_(db, 'people', refId_(e.person_id), 'person');
  // who the money was spent on (expenses only): a person, or empty = the family as a whole
  out.for_id = typ === 'expense' ? ledgerExists_(db, 'people', refId_(e.for_id), 'person') : null;
  out.event_id = typ === 'expense' ? ledgerExists_(db, 'events', refId_(e.event_id), 'event') : null;
  out.method = pyTruthy_(e.method) ? choice_(e.method, METHODS_, 'paid via') : '';
  out.account_id = ledgerExists_(db, 'accounts', refId_(e.account_id), 'account');
  if (out.method === 'Credit card') {
    if (!out.account_id) throw ApiError_('Pick which credit card');
    if (db.get('accounts', out.account_id).kind !== 'card') throw ApiError_("Paid via credit card needs a card in 'Account / card'");
  }

  out.to_account_id = null;
  if (typ === 'transfer') {
    out.to_account_id = ledgerExists_(db, 'accounts', refId_(e.to_account_id), 'account');
    if (!out.account_id) throw ApiError_('Pick the account the money leaves from');
    if (!out.to_account_id) throw ApiError_("'To account' is required for a transfer");
    if (out.to_account_id === out.account_id) throw ApiError_("'To account' must be different from the account it leaves");
  }

  // loan / savings: required, except when an existing row's type was just changed (the cell opens to fill in next)
  const typeChanged = !!old && has_(body, 'type') && body.type !== old.type;
  out.loan_id = null;
  out.loan_part = '';
  out.savings_id = null;
  if (typ === 'loan') {
    out.loan_id = ledgerExists_(db, 'loans', refId_(e.loan_id), 'loan');
    if (!out.loan_id) {
      const act = db.all_('loans').filter(l => l.active === 1);
      if (act.length === 1) out.loan_id = act[0].id;
      else if (!typeChanged) throw ApiError_('Pick which loan this payment is for');
    }
    out.loan_part = choice_(pyTruthy_(e.loan_part) ? e.loan_part : 'emi', LOAN_PARTS_, 'part');
  }
  if (typ === 'savings') {
    out.savings_id = ledgerExists_(db, 'savings_places', refId_(e.savings_id), 'savings place');
    if (!out.savings_id) {
      const act = db.all_('savings_places').filter(p => p.active === 1);
      if (act.length === 1) out.savings_id = act[0].id;
      else if (!typeChanged) throw ApiError_('Pick which savings place the money went into');
    }
  }
  return out;
}

// --- recurring -> pending rows
function ledgerDue_(rec, m) {    // is recurring item `rec` due in month index m?
  const start = mi_(rec.start_month);
  if (m < start || (rec.end_month && m > mi_(rec.end_month))) return false;
  const step = rec.frequency === 'quarterly' ? 3 : rec.frequency === 'yearly' ? 12 : 1;
  return (m - start) % step === 0;
}

/* recurring.day: 1-31 a fixed day (the month's last day when it is shorter); 32 the last day; 40 the first working day;
   41 the last working day (working = Monday to Friday); 100 + n*10 + w the n-th weekday w (n 1-4, 5 = the last one;
   w 0 Sunday .. 6 Saturday), e.g. 112 = the first Tuesday. core/core.js App.dayRule reads and writes the same codes. */
function recDayOf_(code, y, mo) {          // mo 1..12 -> day of the month
  const dim = daysIn_(y, mo), dow = d => new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  const c = pyInt_(code || 1);
  if (c >= 1 && c <= 31) return Math.min(c, dim);
  if (c === 32) return dim;
  if (c === 40 || c === 41) {
    let d = c === 40 ? 1 : dim;
    while (dow(d) === 0 || dow(d) === 6) d += c === 40 ? 1 : -1;
    return d;
  }
  const n = Math.floor((c - 100) / 10), w = c % 10;
  if (c > 100 && n >= 1 && n <= 5 && w <= 6) {
    if (n === 5) { let d = dim; while (dow(d) !== w) d--; return d; }
    let d = 1; while (dow(d) !== w) d++;
    return Math.min(d + (n - 1) * 7, dim);
  }
  return 1;
}

function ledgerRecDay_(rec, m) {
  const y = Math.floor(m / 12), mo = (m % 12) + 1;
  return ms_(m) + '-' + pad_(recDayOf_(rec.day, y, mo), 2);
}

function ledgerRecFields_(rec, m) {
  const typ = rec.type;
  return {
    date: ledgerRecDay_(rec, m), type: typ, category_id: rec.category_id, description: rec.name, amount: rec.amount,
    person_id: rec.person_id, method: rec.method || '', account_id: rec.account_id,
    to_account_id: typ === 'transfer' ? rec.to_account_id : null,
    loan_id: typ === 'loan' ? rec.loan_id : null, loan_part: typ === 'loan' ? (rec.loan_part || 'emi') : '',
    savings_id: typ === 'savings' ? rec.savings_id : null,
    for_id: typ === 'expense' ? (rec.for_id === undefined ? null : rec.for_id) : null,
  };
}

/** Create pending rows for active recurring items due in months overlapping [frm, to], never after this month. */
function makeRecurring_(db, frm, to) {
  const cur = mi_(today_());
  const m0 = mi_(frm), m1 = Math.min(mi_(to), cur);
  if (m0 > m1) return 0;
  const recs = db.rows('recurring').filter(r => r.active === 1);
  if (!recs.length) return 0;
  const seen = new Set();
  db.all_('entries').forEach(e => { if (lowerAscii_(e.source_ref).indexOf('rec:') === 0) seen.add(e.source_ref); });
  (db.getSetting(LEDGER_DISMISSED_, []) || []).forEach(x => seen.add(x));
  let made = 0;
  recs.forEach(rec => {
    if (!rec.start_month) {                       // no start: it starts the month it is first seen
      rec.start_month = ms_(cur);
      db.update('recurring', rec.id, { start_month: rec.start_month });
    }
    if (!rec.amount || rec.amount <= 0) return;
    for (let m = Math.max(m0, mi_(rec.start_month)); m <= m1; m++) {
      const ref = 'rec:' + rec.id + ':' + ms_(m);
      if (seen.has(ref) || !ledgerDue_(rec, m)) continue;
      const row = ledgerRecFields_(rec, m);
      row.status = 'pending';
      row.source = 'recurring';
      row.source_ref = ref;
      db.insert('entries', row);
      seen.add(ref);
      made += 1;
    }
  });
  return made;
}

/** After a recurring item is edited: bring this month's still-pending row in line with it (or remove it). */
function recurringSync_(ctx) {
  const db = ctx.db;
  const rec = db.get('recurring', Number(ctx.groups.id));
  if (!rec) throw ApiError_('That recurring item no longer exists');
  const cur = mi_(today_());
  const ref = 'rec:' + rec.id + ':' + ms_(cur);
  const pend = db.all_('entries').filter(e => e.source_ref === ref && e.status === 'pending')[0];
  if (!pend) return { updated: 0, removed: 0 };
  if (!rec.active || !rec.start_month || !ledgerDue_(rec, cur) || !rec.amount || rec.amount <= 0) {
    db.remove('entries', pend.id);
    return { updated: 0, removed: 1 };
  }
  db.update('entries', pend.id, ledgerRecFields_(rec, cur));
  return { updated: 1, removed: 0 };
}

// --- Bombs (planned_items: one exact amount, in or out, on a date) -> a row to confirm in its month, like a recurring
// bill. source_ref 'one:<id>'. The row follows the Bomb while it is still pending (amount, day, name), and goes when
// the Bomb is deleted. A row the user deleted is remembered (ledger_dismissed) and never made again.
const BOMB_TYPES_ = ['income', 'expense'];
function bombDate_(o) {
  const m = mi_(o.month), y = Math.floor(m / 12), mo = (m % 12) + 1;
  return o.month + '-' + pad_(Math.min(Math.max(1, pyInt_(o.day || 1)), daysIn_(y, mo)), 2);
}
function bombFields_(o) {
  return { date: bombDate_(o), type: o.type, category_id: o.category_id, description: o.description || '', amount: o.amount,
    person_id: o.person_id, note: o.note || '' };
}
function makeBombs_(db, frm, to) {
  const cur = mi_(today_());
  const m0 = mi_(frm), m1 = Math.min(mi_(to), cur);
  const items = new Map();
  db.rows('planned_items').forEach(o => items.set(o.id, o));
  const dismissed = new Set(db.getSetting(LEDGER_DISMISSED_, []) || []);
  const have = new Map();
  let made = 0;
  db.all_('entries').forEach(e => {
    const m = /^one:(-?\d+)$/.exec(e.source_ref || '');
    if (!m) return;
    const o = items.get(Number(m[1]));
    if (e.status === 'pending' && (!o || BOMB_TYPES_.indexOf(o.type) < 0 || !(o.amount > 0) || mi_(o.month) > cur)) { db.remove('entries', e.id); return; }
    have.set(e.source_ref, e);
    if (e.status === 'pending') {                                     // keep it in line with the Bomb
      const f = bombFields_(o), ch = {};
      Object.keys(f).forEach(k => { if (e[k] !== f[k]) ch[k] = f[k]; });
      if (Object.keys(ch).length) db.update('entries', e.id, ch);
    }
  });
  items.forEach(o => {
    const ref = 'one:' + o.id, m = mi_(o.month);
    if (BOMB_TYPES_.indexOf(o.type) < 0 || !(o.amount > 0) || m < m0 || m > m1 || have.has(ref) || dismissed.has(ref)) return;
    const row = bombFields_(o);
    row.status = 'pending'; row.source = 'oneoff'; row.source_ref = ref;
    db.insert('entries', row);
    made += 1;
  });
  return made;
}

// --- handlers
function ledgerList_(ctx) {
  const db = ctx.db;
  const r = dateRange_(ctx.q), frm = r[0], to = r[1];
  const made = makeRecurring_(db, frm, to) + makeBombs_(db, frm, to);
  const lk = ledgerLookups_(db);
  const entries = orderBy_(db.all_('entries').filter(e => e.date >= frm && e.date <= to), [['date', true], ['id', true]])
    .map(e => ledgerRow_(e, lk));
  const tot = {};
  TYPES_.forEach(t => { tot[t] = 0.0; });
  let pending = 0;
  entries.forEach(e => {
    if (e.status === 'done') tot[e.type] += e.amount;
    else pending += 1;
  });
  const totals = { income: tot.income, expense: tot.expense, savings: tot.savings, loan: tot.loan,
    transfer: tot.transfer, net: tot.income - tot.expense - tot.savings - tot.loan, pending };
  Object.keys(totals).forEach(k => { totals[k] = pyRound_(totals[k], 2); });
  const t = today_();
  const asOf = to < t ? to : t;
  return { from: frm, to, entries, totals, balances: balances_(db, asOf), balances_as_of: asOf, made };
}

function ledgerCreate_(ctx) {
  const data = ledgerClean_(ctx.db, ctx.body);
  data.status = 'done';
  data.source = 'manual';
  return { row: ledgerGetEntry_(ctx.db, ctx.db.insert('entries', data)) };
}

function ledgerUpdate_(ctx) {
  const id = Number(ctx.groups.id);
  const old = ledgerGetEntry_(ctx.db, id);
  ctx.db.update('entries', id, ledgerClean_(ctx.db, ctx.body, old));
  return { row: ledgerGetEntry_(ctx.db, id) };
}

function ledgerDelete_(ctx) {
  const db = ctx.db, id = Number(ctx.groups.id);
  const e = ledgerGetEntry_(db, id);
  if (e.source_ref) {
    const dis = db.getSetting(LEDGER_DISMISSED_, []) || [];
    if (dis.indexOf(e.source_ref) < 0) db.setSetting(LEDGER_DISMISSED_, dis.concat([e.source_ref]));
  }
  db.remove('entries', id);
  return { deleted: true };
}

function ledgerConfirm_(ctx) {
  const db = ctx.db, id = Number(ctx.groups.id), body = ctx.body;
  const old = ledgerGetEntry_(db, id);
  if (old.status !== 'pending') throw ApiError_('This row is already confirmed');
  const patch = {};
  ['amount', 'date', 'account_id', 'method'].forEach(k => { if (!isBlank_(body[k])) patch[k] = body[k]; });
  const data = ledgerClean_(db, patch, old);
  data.status = 'done';
  db.update('entries', id, data);
  return { row: ledgerGetEntry_(db, id) };
}

// ---- google/server/loans.js
// google/server/loans.js — loans, inquiry only. The plan comes from Settings (loans, loan_stages, loan_rates); the actual
// comes from done ledger rows of type 'loan' (loan_id + loan_part emi / pre_emi / prepay / charges). Nothing here writes.
//
// Month rule (one simple rule for every loan): the payment made in month m covers the interest on the balance held during
// the month before, i.e. interest(m) = opening balance(m) x rate / 1200. Money released in month m earns interest from
// month m+1. Before the first EMI month you pay only that interest (pre-EMI); from then on a fixed EMI covers interest
// and principal. A rate change keeps the EMI and lets the number of months move (as Indian banks do). Tenure = number
// of EMIs from the first EMI month. A loan running before the app sets track_from + track_balance: the actual side
// starts from that balance on that date. Repayment 'interest' = interest only, until interest_until (then the EMI) or
// for as long as it runs (the schedule then shows the tenure, or at least the next 12 months).
// GET /api/loans?from&to · GET /api/loans/<id>/schedule?from&to&extra&extra_from&extra_once

const LOAN_HORIZON_ = 720;               // never simulate more than 60 years
const LOAN_QUARTER_ENDS_ = [2, 5, 8, 11]; // Mar, Jun, Sep, Dec (month index % 12)

function loansRoutes_() {
  return [
    ['GET', /^\/api\/loans$/, apiLoans_],
    ['GET', /^\/api\/loans\/(-?\d+)\/schedule$/, apiSchedule_, ['id']],
  ];
}

function r2_(v) {
  return pyRound_(v || 0.0, 2);
}

function zeroPays_() {
  return { emi: 0.0, pre_emi: 0.0, prepay: 0.0, charges: 0.0 };
}

/** A loan plus everything the simulators need, read once. */
class Loan_ {
  constructor(db, l) {
    this.l = l;
    this.id = l.id;
    const t = today_();
    this.today = t;
    this.cur = mi_(t);
    const stages = orderBy_(db.all_('loan_stages').filter(s => s.loan_id === this.id), [['due_date'], ['id']]);
    this.rates = orderBy_(db.all_('loan_rates').filter(r => r.loan_id === this.id), [['from_date'], ['id']])
      .map(r => [mi_(r.from_date), r.rate]);
    const startM = l.start_date ? mi_(l.start_date) : this.cur;
    this.planRel = new Map();
    this.actRel = new Map();
    this.pending = [];      // [[month, amount]] not released yet
    this.relDates = [];     // [[month, date, amount]] actually released
    if (l.disbursal === 'stages' && stages.length) {
      stages.forEach(s => {
        const d = s.released_date || s.due_date;
        mapAdd_(this.planRel, mi_(d), s.amount);
        if (s.released_date && s.released_date <= t) {
          mapAdd_(this.actRel, mi_(s.released_date), s.amount);
          this.relDates.push([mi_(s.released_date), s.released_date, s.amount]);
        } else {
          this.pending.push([mi_(d), s.amount]);
        }
      });
    } else {
      this.planRel.set(startM, l.principal);
      if (l.start_date && l.start_date <= t) {
        this.actRel.set(startM, l.principal);
        this.relDates.push([startM, l.start_date, l.principal]);
      } else {
        this.pending.push([startM, l.principal]);
      }
    }
    if (l.emi_start) this.es = mi_(l.emi_start);
    else if (l.disbursal === 'stages' && stages.length) this.es = maxOf_([...this.planRel.keys()]) + 1;
    else this.es = startM + 1;
    this.first = this.planRel.size ? minOf_([...this.planRel.keys()]) : startM;
    this.emiDay = Math.max(1, Math.min(31, pyInt_(l.emi_day || 5)));
    // Repayment: 'emi' = interest + principal; 'interest' = interest only until interest_until, or for as long as it
    // runs (see the top of this file)
    this.repay = String(l.repay || 'emi').trim() || 'emi';
    this.ioUntil = String(l.interest_until || '').trim();
    this.ioEnd = null;
    if (this.repay === 'interest') {
      if (this.ioUntil) {
        this.es = Math.max(this.es, mi_(this.ioUntil) + 1);
      } else {
        this.ioEnd = Math.max(this.cur + 12, this.first + (pyInt_(l.tenure_months || 0) || 12));
        this.es = this.ioEnd + LOAN_HORIZON_ + 1;
      }
    }
    // Tracking: a loan already running before the app (see the top of this file)
    this.trackFrom = String(l.track_from || '').trim();
    this.trackBalance = Number(l.track_balance || 0.0);
    if (this.trackFrom) {
      const tm = mi_(this.trackFrom);
      this.walkStart = Number(this.trackFrom.slice(8, 10)) > this.emiDay ? tm + 1 : tm;
      this.walkRel = new Map();
      this.relDates.forEach(x => {
        if (x[1] > this.trackFrom) mapAdd_(this.walkRel, Math.max(x[0], this.walkStart), x[2]);
      });
    } else {
      this.walkStart = null;
      this.walkRel = new Map(this.actRel);
    }
    // payments: month -> {part: amount}; only those the walk can see (on/after track_from)
    this.entries = orderBy_(db.all_('entries').filter(e => e.type === 'loan' && e.loan_id === this.id && e.status === 'done'),
      [['date'], ['id']]).map(e => ({ date: e.date, amount: e.amount, loan_part: e.loan_part }));
    this.pays = new Map();
    this.entries.forEach(e => {
      const m = mi_(e.date);
      if (this.trackFrom && (e.date < this.trackFrom || m < this.walkStart)) return;
      const part = LOAN_PARTS_.indexOf(e.loan_part) >= 0 ? e.loan_part : 'emi';
      if (!this.pays.has(m)) this.pays.set(m, zeroPays_());
      this.pays.get(m)[part] += e.amount;
    });
    this.emiAmt = null;   // filled by plan()
  }

  rateAt(m) {
    let r = this.l.rate;
    this.rates.forEach(x => { if (x[0] <= m) r = x[1]; });
    return r;
  }

  plannedPrepay(m) {
    if (m < this.es || !this.l.prepay_amount) return 0.0;
    const p = this.l.prepay_plan;
    if (p === 'fixed_monthly') return this.l.prepay_amount;
    if (p === 'surplus_quarterly' && LOAN_QUARTER_ENDS_.indexOf(m % 12) >= 0) return this.l.prepay_amount;
    return 0.0;
  }

  /** Month these rows repay the loan in (null: an interest-only loan still owed at the end). */
  closeMonth(rows) {
    if (!rows.length) return null;
    if (this.ioEnd !== null && rows[rows.length - 1].closing > 0.5) return null;
    return rows[rows.length - 1].m;
  }

  dueDate(m) {
    const y = Math.floor(m / 12), mo = (m % 12) + 1;
    return ms_(m) + '-' + pad_(Math.min(this.emiDay, daysIn_(y, mo)), 2);
  }

  /** Month by month from `start` with opening balance `bal` until the loan is closed (or `until`). */
  simulate(start, bal, releases, prepayFn, emiAmt, until) {
    if (emiAmt === undefined) emiAmt = null;
    if (until === undefined) until = null;
    const out = [];
    const lastRel = maxOf_([...releases].filter(x => x[1] > 0).map(x => x[0]), start);
    const tenure = pyInt_(this.l.tenure_months || 0);
    let m = start;
    while (m <= start + LOAN_HORIZON_) {
      const rel = mapGet_(releases, m, 0.0);
      const r = this.rateAt(m);
      const opening = bal;
      const interest = opening * r / 1200;
      let kind, pay;
      if (m < this.es) {
        kind = 'pre_emi';
        pay = interest;
      } else {
        kind = 'emi';
        if (emiAmt === null) emiAmt = this.l.emi_amount || emi_(opening || pySum_([...releases.values()]), r, tenure);
        if (opening > 0.5 && emiAmt <= interest + 0.5) {   // rate rose so far the EMI no longer covers interest
          emiAmt = emi_(opening, r, Math.max(12, tenure - (m - this.es)));
        }
        pay = Math.min(emiAmt, opening + interest);
      }
      const after = opening + interest - pay;
      const pp = Math.min(prepayFn(m), Math.max(0.0, after));
      bal = Math.max(0.0, after - pp) + rel;
      out.push({ month: ms_(m), m, kind, released: rel, rate: r, opening, interest, payment: pay, prepay: pp,
        principal: pay - interest + pp, closing: bal });
      if (until !== null && m >= until) break;
      if (until === null && this.ioEnd !== null && m >= this.ioEnd) break;
      if (bal <= 0.5 && m >= lastRel && (out[out.length - 1].payment > 0 || pp > 0 || m >= this.es)) break;
      m += 1;
    }
    if (emiAmt !== null) this.emiAmt = this.emiAmt !== null ? this.emiAmt : emiAmt;
    return out;
  }

  /** The plan from Settings: planned releases, pre-EMI, EMI, planned prepayments. */
  plan() {
    const rows = this.simulate(this.first, 0.0, this.planRel, m => this.plannedPrepay(m));
    if (this.emiAmt === null) {   // loan closed before EMI started (odd setup) — still report an EMI
      this.emiAmt = this.l.emi_amount || emi_(pySum_([...this.planRel.values()]), this.rateAt(this.es),
        pyInt_(this.l.tenure_months || 0));
    }
    return rows;
  }

  /** Walk the real balance up to this month. Returns [rows, projStart, projBal]. */
  actual() {
    const out = [];
    let first, bal, releasedBefore;
    if (this.walkStart !== null) {
      first = this.walkStart;
      bal = releasedBefore = this.trackBalance;
      if (first > this.cur) return [out, this.cur + 1, bal];
    } else {
      const months = [...this.walkRel.keys(), ...this.pays.keys()];
      if (!months.length) return [out, this.cur, 0.0];
      first = Math.min(minOf_(months), this.first);
      bal = releasedBefore = 0.0;
    }
    const tol = x => Math.max(10.0, x * 0.03);   // bank's daily-interest bills never match ours to the rupee
    let projStart = this.cur + 1, projBal = null;
    const day = Number(this.today.slice(8, 10));
    for (let m = first; m <= this.cur; m++) {
      const rel = mapGet_(this.walkRel, m, 0.0);
      const p = this.pays.get(m) || zeroPays_();
      const regular = p.emi + p.pre_emi, prepay = p.prepay, charges = p.charges;
      const r = this.rateAt(m);
      const opening = bal;
      const interest = opening * r / 1200;
      const emiAmt = this.emiAmt || 0.0;
      let expected = m < this.es ? interest : Math.min(emiAmt, opening + interest);
      if (expected < 1) expected = 0.0;
      let status = '';
      if (m === this.cur && regular === 0 && expected > 0) {
        // this month, not paid yet: don't book it; the projection starts here
        status = day <= this.emiDay ? 'due' : 'overdue';
        out.push({ m, month: ms_(m), released: rel, opening, interest: 0.0, expected, paid: 0.0, prepaid: prepay,
          charges, closing: null, status });
        projStart = m;
        projBal = opening;
        if (prepay) projBal = Math.max(0.0, opening - prepay);   // a prepayment made this month still counts
        projBal += rel;
        break;
      }
      const pre = m < this.es;
      if (expected === 0 && regular === 0) status = prepay > 0 ? 'early' : '';
      else if (regular === 0) status = 'missed';
      else if (regular < expected - (pre ? expected * 0.5 : tol(expected))) status = 'short';
      else if (prepay > 0 || (!pre && regular > expected + tol(expected))) status = 'early';
      else status = 'paid';
      if (opening <= 0.5 && rel === 0 && regular === 0 && prepay === 0 && releasedBefore > 0) status = 'closed';
      if (pre && regular > 0) bal = Math.max(0.0, opening - prepay) + rel;   // pre-EMI pays interest only
      else bal = Math.max(0.0, opening + interest - regular - prepay) + rel;
      releasedBefore += rel;
      out.push({ m, month: ms_(m), released: rel, opening, interest, expected, paid: regular, prepaid: prepay,
        charges, closing: bal, status });
    }
    if (projBal === null) projBal = bal;
    return [out, projStart, projBal];
  }

  pendingReleases(start) {
    const rel = new Map();
    this.pending.forEach(x => mapAdd_(rel, Math.max(x[0], start), x[1]));
    return rel;
  }

  projection(start, bal, withPlanPrepay, extra, extraFrom, extraOnce, until) {
    if (withPlanPrepay === undefined) withPlanPrepay = true;
    extra = extra || 0.0;
    if (extraFrom === undefined) extraFrom = null;
    if (until === undefined) until = null;
    const ef = Math.max(extraFrom !== null ? extraFrom : start, start);
    const fn = m => {
      let v = withPlanPrepay ? this.plannedPrepay(m) : 0.0;
      if (extra && (extraOnce ? m === ef : m >= ef)) v += extra;
      return v;
    };
    if (bal <= 0.5 && !this.pending.length) return [];
    return this.simulate(start, bal, this.pendingReleases(start), fn, this.emiAmt, until);
  }
}

// ---------------------------------------------------------------- per-loan summary
function loanAnalyse_(db, l, frm, to) {
  const L = new Loan_(db, l);
  const plan = L.plan();
  const a = L.actual(), act = a[0], ps = a[1], pb = a[2];
  const proj = L.projection(ps, pb);
  const projNone = L.projection(ps, pb, false);
  const released = pySum_([...L.actRel.values()]);
  const pays = [...L.pays.values()];
  const paidRegular = pySum_(pays.map(p => p.emi + p.pre_emi));
  const paidPrepay = pySum_(pays.map(p => p.prepay));
  const paidCharges = pySum_(pays.map(p => p.charges));
  const outstanding = pb;
  const principalPaid = Math.max(0.0, released - outstanding);
  // interest = what was paid (since tracking) minus the principal it repaid (since tracking)
  const walkPrincipal = (L.trackFrom ? L.trackBalance : 0.0) + pySum_([...L.walkRel.values()]) - outstanding;
  const interestPaid = Math.max(0.0, paidRegular + paidPrepay - walkPrincipal);
  const futureInterest = pySum_(proj.map(r => r.interest));
  const nxt = proj.filter(r => r.payment > 0.5)[0] || null;
  const planClose = L.closeMonth(plan);
  let projClose;
  if (proj.length) projClose = L.closeMonth(proj);
  else if (act.length) projClose = maxOf_(act.filter(x => x.paid || x.prepaid || x.released).map(x => x.m), act[act.length - 1].m);
  else projClose = planClose;
  const missed = act.filter(x => x.status === 'missed' || x.status === 'overdue').length;
  const status = !proj.length && released > 0 ? 'closed'
    : released === 0 && !L.pays.size ? 'not started' : ps < L.es ? (L.repay === 'interest' ? 'interest only' : 'pre-EMI') : 'EMI';
  let inRange = 0.0;
  if (frm && to) inRange = pySum_(L.entries.filter(e => frm <= e.date && e.date <= to).map(e => e.amount));
  const s = {
    id: l.id, name: l.name, kind: l.kind, lender: l.lender, borrower_id: l.borrower_id,
    active: l.active, disbursal: l.disbursal, prepay_plan: l.prepay_plan, prepay_amount: l.prepay_amount,
    principal: l.principal, released: r2_(released), rate_now: L.rateAt(L.cur), emi: r2_(L.emiAmt),
    emi_start: L.ioEnd !== null ? null : ms_(L.es), emi_calculated: !l.emi_amount, tenure_months: l.tenure_months,
    status, repay: L.repay, interest_until: L.ioUntil, track_from: L.trackFrom, track_balance: r2_(L.trackBalance),
    paid_range: r2_(inRange), paid_total: r2_(paidRegular + paidPrepay + paidCharges),
    paid_prepay: r2_(paidPrepay), paid_charges: r2_(paidCharges),
    principal_paid: r2_(principalPaid), interest_paid: r2_(interestPaid),
    outstanding: r2_(outstanding),
    next_due: nxt ? { date: L.dueDate(nxt.m), amount: r2_(nxt.payment), kind: nxt.kind, prepay: r2_(nxt.prepay) } : null,
    missed,
    loan_free: projClose !== null ? ms_(projClose) : null,
    loan_free_plan: planClose !== null ? ms_(planClose) : null,
    months_ahead: planClose !== null && projClose !== null ? planClose - projClose : 0,
    interest_total: r2_(interestPaid + futureInterest),
    interest_plan: r2_(pySum_(plan.map(r => r.interest))),
    interest_saved_by_plan: r2_(pySum_(projNone.map(r => r.interest)) - futureInterest),
    loan_free_no_prepay: projNone.length ? (L.closeMonth(projNone) !== null ? ms_(L.closeMonth(projNone)) : null)
      : (projClose !== null ? ms_(projClose) : null),
    // what this loan takes out of a normal month now: the next regular payment if it falls this month or next
    this_month: r2_(nxt && nxt.m <= L.cur + 1 ? nxt.payment : 0.0),
  };
  if (L.ioEnd !== null) s.emi = s.next_due ? s.next_due.amount : 0.0;   // interest only: the payment is the interest
  return { L, plan, act, proj, s, ps, pb };
}

function loanWhatif_(L, ps, pb, proj, extra, extraFrom, extraOnce) {
  const alt = L.projection(ps, pb, true, extra, extraFrom, extraOnce);
  const baseClose = L.closeMonth(proj);
  const newClose = L.closeMonth(alt);
  const baseInt = pySum_(proj.map(r => r.interest));
  const newInt = pySum_(alt.map(r => r.interest));
  const ef = Math.max(extraFrom !== null ? extraFrom : ps, ps);
  return [alt, {
    extra, from: ms_(ef), once: !!extraOnce,
    loan_free_before: baseClose !== null ? ms_(baseClose) : null,
    loan_free_after: newClose !== null ? ms_(newClose) : null,
    months_sooner: baseClose !== null && newClose !== null ? baseClose - newClose : 0,
    interest_before: r2_(baseInt), interest_after: r2_(newInt), interest_saved: r2_(baseInt - newInt),
    extra_paid: r2_(pySum_(alt.map(r => r.prepay)) - pySum_(proj.map(r => r.prepay))),
  }];
}

function byMonth_(list) {
  const m = new Map();
  list.forEach(r => m.set(r.m, r));
  return m;
}

/** One row per month from the first release to closure: plan, actual (past), projection (future), what-if. */
function loanSchedule_(db, loanId, extraPrepay, extraFrom, extraOnce, frm, to) {
  const l = db.get('loans', loanId);
  if (!l) throw ApiError_('Loan not found');
  const ef = extraFrom ? mi_(extraFrom) : null;
  const A = loanAnalyse_(db, l, frm, to);
  const L = A.L;
  let whatif = null, alt = [];
  if (extraPrepay) {
    const w = loanWhatif_(L, A.ps, A.pb, A.proj, Number(extraPrepay), ef, extraOnce);
    alt = w[0];
    whatif = w[1];
  }
  const P = byMonth_(A.plan), Ac = byMonth_(A.act), J = byMonth_(A.proj), W = byMonth_(alt);
  const all = [...P.keys(), ...Ac.keys(), ...J.keys(), ...W.keys()];
  let out = [];
  if (all.length) {
    const maxW = maxOf_([...W.keys()], null);
    for (let m = minOf_(all); m <= maxOf_(all); m++) {
      const p = P.get(m) || null, a = Ac.get(m) || null, j = J.get(m) || null, w = W.get(m) || null;
      let interest, balAct, projected;
      if (a && a.closing !== null) {
        interest = a.interest; balAct = a.closing; projected = false;
      } else if (j) {
        interest = j.interest; balAct = j.closing; projected = true;
      } else if (m > L.cur) {
        interest = 0.0; balAct = 0.0; projected = true;
      } else {
        interest = 0.0; balAct = a ? a.opening : null; projected = false;
        if (!a && L.trackFrom && m === mi_(L.trackFrom)) balAct = L.trackBalance;   // the balance entered for that day
      }
      let status = a ? a.status : '';
      if (!a && m < L.cur && p && p.payment > 0.5 && (L.actRel.size || L.pays.size)
        && (L.walkStart === null || m >= L.walkStart)) status = 'missed';
      const pj = p || j;
      out.push({
        month: ms_(m),
        kind: pj ? pj.kind : (m >= L.es ? 'emi' : 'pre_emi'),
        released: r2_(p ? p.released : 0.0),
        released_actual: r2_(mapGet_(L.actRel, m, 0.0)),
        rate: pj ? pj.rate : L.rateAt(m),
        plan_payment: r2_(p ? p.payment : 0.0),
        due: r2_(a ? a.expected : (j ? j.payment : 0.0)),
        paid: r2_(a ? a.paid : 0.0),
        plan_prepay: r2_(p ? p.prepay : 0.0),
        prepaid: r2_(a ? a.prepaid : 0.0),
        charges: r2_(a ? a.charges : 0.0),
        interest: r2_(interest),
        plan_balance: r2_(p ? p.closing : 0.0),
        actual_balance: balAct === null ? null : r2_(balAct),
        projected,
        proj_payment: r2_(j ? j.payment : 0.0),
        proj_prepay: r2_(j ? j.prepay : 0.0),
        whatif_balance: extraPrepay ? (w ? r2_(w.closing) : (m > (maxW === null ? m : maxW) ? 0.0 : null)) : null,
        status,
        past: m < L.cur, current: m === L.cur,
      });
    }
  }
  if (frm || to) {
    const fm = frm ? frm.slice(0, 7) : '0000-00';
    const tm = to ? to.slice(0, 7) : '9999-99';
    out = out.filter(r => fm <= r.month && r.month <= tm);
  }
  return { loan: l, rows: out, summary: A.s, whatif };
}

/** Map loan_id -> [{month, payment, prepay, interest, outstanding, kind, released, paid}] for every active loan,
 *  from today's actual position to `untilMonth` or closure. For the Plan page. */
function loansProjection_(db, untilMonth, withPlanPrepay) {
  if (withPlanPrepay === undefined) withPlanPrepay = true;
  const until = untilMonth ? mi_(untilMonth) : null;
  const res = new Map();
  db.rows('loans').filter(l => l.active === 1).forEach(l => {
    const L = new Loan_(db, l);
    L.plan();
    const a = L.actual(), ps = a[1], pb = a[2];
    const proj = L.projection(ps, pb, withPlanPrepay, 0.0, null, false, until);
    const out = proj.filter(r => until === null || r.m <= until).map(r => ({
      month: r.month, payment: r2_(r.payment), prepay: r2_(r.prepay), interest: r2_(r.interest),
      outstanding: r2_(r.closing), kind: r.kind, released: r2_(r.released), paid: false }));
    if (proj.length && ps > L.cur) {
      // this month's payment is already in the ledger: still give a row so every loan starts at this month
      out.unshift({ month: ms_(L.cur), payment: 0.0, prepay: 0.0, interest: 0.0, outstanding: r2_(pb),
        kind: L.cur >= L.es ? 'emi' : 'pre_emi', released: 0.0, paid: true });
    }
    res.set(l.id, out);
  });
  return res;
}

// ---------------------------------------------------------------- API
function apiLoans_(ctx) {
  const db = ctx.db;
  const r = dateRange_(ctx.q), frm = r[0], to = r[1];
  const loans = [], free = [];
  let famOut = 0.0, famMonth = 0.0, famSaved = 0.0;
  orderBy_(db.rows('loans'), [['active', true], ['id']]).forEach(l => {
    const s = loanAnalyse_(db, l, frm, to).s;
    loans.push(s);
    if (l.active) {
      famOut += s.outstanding;
      famMonth += s.this_month;
      famSaved += s.interest_saved_by_plan;
      if (s.status !== 'closed' && s.loan_free) free.push(s.loan_free);
    }
  });
  const nexts = loans.filter(s => s.active && s.next_due)
    .map(s => Object.assign({}, s.next_due, { loan: s.name, loan_id: s.id }));
  nexts.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
  return {
    from: frm, to, today: today_(),
    loans,
    family: { outstanding: r2_(famOut), monthly: r2_(famMonth), debt_free: free.length ? maxOf_(free) : null,
      interest_saved: r2_(famSaved), next: nexts.length ? nexts[0] : null },
    pie: loans.filter(s => s.active && s.outstanding > 0.5).map(s => ({ label: s.name, value: s.outstanding })),
  };
}

function apiSchedule_(ctx) {
  const q = ctx.q;
  const frm = iso_(q.from, 'from', false) || null;
  const to = iso_(q.to, 'to', false) || null;
  const extra = num_(q.extra, 0.0, 'extra');
  if (extra < 0) throw ApiError_("Extra prepayment can't be negative");
  const ef = monthStr_(q.extra_from, 'extra_from', false) || null;
  const once = ['1', 'true', 'yes'].indexOf(q.extra_once) >= 0;
  return loanSchedule_(ctx.db, Number(ctx.groups.id), extra, ef, once, frm, to);
}

// ---- google/server/plan.js
// google/server/plan.js — month by month, plan next to actual and the cash left at each month end.
// GET /api/plan?from&to (default: this month + 23 = 24 months)

const PLAN_CASH_KINDS_ = ['bank', 'cash', 'wallet'];
const PLAN_BUCKETS_ = ['income', 'spending', 'savings', 'loans'];
const PLAN_TYPE_BUCKET_ = { income: 'income', expense: 'spending', savings: 'savings', loan: 'loans' };
const PLAN_TYPE_ORDER_ = ['income', 'expense', 'savings', 'loan'];

function planRoutes_() {
  return [['GET', /^\/api\/plan$/, planRoute_]];
}

function planRange_(q) {
  const cur = mi_(today_());
  const frm = iso_(q.from, 'from', false) || monthStart_(cur);
  const to = iso_(q.to, 'to', false) || monthEnd_(cur + 23);
  if (to < frm) throw ApiError_("'To' is before 'From'");
  return [mi_(frm), mi_(to)];
}

function planDue_(r, m) {        // is a recurring row due in month index m?
  if (!r.active) return false;
  if (r.start_month && m < mi_(r.start_month)) return false;
  if (r.end_month && m > mi_(r.end_month)) return false;
  const base = r.start_month ? mi_(r.start_month) : 0;   // no start: quarterly Jan/Apr/Jul/Oct, yearly in January
  const step = r.frequency === 'quarterly' ? 3 : r.frequency === 'yearly' ? 12 : 1;
  return (((m - base) % step) + step) % step === 0;
}

/** Map 'YYYY-MM' -> {payment, outstanding, loans: Map loan_id -> payment, paid: Set} from loans.js, or [null, why]. */
function planLoanProjection_(db, until) {
  let raw;
  try {
    raw = loansProjection_(db, until);
  } catch (e) {
    return [null, 'Loan projection could not be worked out (' + e.message + '); using Recurring rows of type Loan.'];
  }
  const out = new Map();
  raw.forEach((sched, lid) => {
    sched.forEach(r => {
      const k = String(r.month).slice(0, 7);
      if (!out.has(k)) out.set(k, { payment: 0.0, outstanding: 0.0, loans: new Map(), paid: new Set() });
      const mo = out.get(k);
      if (r.paid) mo.paid.add(lid);      // already paid this month: the plan takes the ledger's actual instead
      const pay = Number(r.payment || 0) + Number(r.prepay || 0);
      mo.payment += pay;
      mo.loans.set(lid, mapGet_(mo.loans, lid, 0.0) + pay);
      mo.outstanding += Number(r.outstanding || 0);
    });
  });
  return [out, ''];
}

function planKey_(kind, id) {
  return kind + ':' + (id === null || id === undefined ? 'None' : id);
}

function planRoute_(ctx) {
  const db = ctx.db;
  const rg = planRange_(ctx.q), m0 = rg[0], m1 = rg[1];
  const t = today_();
  const cur = mi_(t);
  const h1 = Math.max(m1, cur + 12);              // always project far enough for the "in 12 months" chip
  const months = [];
  for (let m = Math.min(m0, cur); m <= h1; m++) months.push(m);

  const cats = new Map(), places = new Map(), loans = new Map();
  db.rows('categories').forEach(c => cats.set(c.id, c));
  db.rows('savings_places').forEach(p => places.set(p.id, p));
  db.rows('loans').forEach(x => loans.set(x.id, { id: x.id, name: x.name }));
  const recs = db.rows('recurring');
  const ones = db.rows('planned_items');
  const budgetCat = new Set(), targetPlace = new Set();
  cats.forEach((c, cid) => { if (c.active && (c.budget || 0) > 0) budgetCat.add(cid); });
  places.forEach((p, pid) => { if (p.active && (p.monthly_target || 0) > 0) targetPlace.add(pid); });
  const lp = planLoanProjection_(db, ms_(h1)), proj = lp[0], loansNote = lp[1];
  const nameOr = (map, id, dflt) => (map.has(id) ? map.get(id).name : dflt);

  // ---- planned amount per line per month. key = 'kind:id'; kind: cat | place | loan | rec | loans | one
  const planned = new Map();   // key -> Map(m -> amount)
  const meta = new Map();      // key -> [label, type]
  const add = (kind, id, m, amount, label, typ) => {
    if (!amount) return;
    const key = planKey_(kind, id);
    if (!planned.has(key)) planned.set(key, new Map());
    const per = planned.get(key);
    per.set(m, mapGet_(per, m, 0.0) + amount);
    if (!meta.has(key)) meta.set(key, [label, typ]);
  };

  months.forEach(m => {
    ones.forEach(o => {
      if (mi_(o.month) !== m || !has_(PLAN_TYPE_BUCKET_, o.type)) return;
      if (cats.has(o.category_id)) {      // joins that category's line, so it's compared with what you log there
        const c = cats.get(o.category_id);
        add('cat', o.category_id, m, o.amount, c.name, c.type);
      } else {
        add('one', o.id, m, o.amount, o.description || 'One-off', o.type);
      }
    });
    budgetCat.forEach(cid => {
      const c = cats.get(cid);
      if (PLAN_TYPE_ORDER_.indexOf(c.type) >= 0) add('cat', cid, m, c.budget, c.name, c.type);
    });
    targetPlace.forEach(pid => {
      const p = places.get(pid);
      if (p.opening_date && m < mi_(p.opening_date)) return;
      if (p.maturity_date && m > mi_(p.maturity_date)) return;
      add('place', pid, m, p.monthly_target, p.name, 'savings');
    });
    const mkey = ms_(m);
    if (proj !== null && proj.has(mkey)) {
      const pm = proj.get(mkey);
      if (pm.loans.size) {
        pm.loans.forEach((amt, lid) => add('loan', lid, m, amt, nameOr(loans, lid, 'Loan ' + lid), 'loan'));
        const rest = pm.payment - pySum_([...pm.loans.values()]);
        if (rest > 0.5) add('loans', 0, m, rest, 'Loans (other)', 'loan');
      } else {
        add('loans', 0, m, pm.payment, 'Loan payments', 'loan');
      }
    }
    recs.forEach(r => {
      if (!has_(PLAN_TYPE_BUCKET_, r.type) || !planDue_(r, m)) return;
      const typ = r.type;
      if (typ === 'loan') {
        if (proj !== null && proj.has(mkey)) return;    // the Loans projection already has it
        if (r.loan_id) add('loan', r.loan_id, m, r.amount, nameOr(loans, r.loan_id, r.name), 'loan');
        else add('rec', r.id, m, r.amount, r.name, 'loan');
      } else if (typ === 'savings') {
        const sid = r.savings_id;
        if (targetPlace.has(sid)) return;              // the place's monthly target already covers it
        if (sid) add('place', sid, m, r.amount, nameOr(places, sid, r.name), 'savings');
        else if (budgetCat.has(r.category_id)) return;
        else add('rec', r.id, m, r.amount, r.name, 'savings');
      } else {
        const cid = r.category_id;
        if (budgetCat.has(cid)) return;                // the category's monthly plan already covers it
        if (cid && cats.has(cid)) add('cat', cid, m, r.amount, cats.get(cid).name, typ);
        else add('rec', r.id, m, r.amount, r.name, typ);
      }
    });
  });

  // ---- actual: done entries, months up to the end of the range (and this month)
  const aFrom = monthStart_(Math.min(m0, cur)), aTo = monthEnd_(Math.max(m1, cur));
  const actual = new Map();
  const doneRows = orderBy_(db.all_('entries').filter(e => e.status === 'done' && PLAN_TYPE_ORDER_.indexOf(e.type) >= 0
    && e.date >= aFrom && e.date <= aTo), [['date']]);
  doneRows.forEach(e => {
    const m = mi_(e.date);
    const typ = e.type;
    let kind, id, label;
    if (typ === 'savings') {
      const sid = e.savings_id;
      if (sid) { kind = 'place'; id = sid; } else if (budgetCat.has(e.category_id)) { kind = 'cat'; id = e.category_id; }
      else { kind = 'place'; id = null; }
      label = sid ? (places.has(sid) ? places.get(sid).name : null) : null;
    } else if (typ === 'loan') {
      const lid = e.loan_id;
      if (lid) { kind = 'loan'; id = lid; } else if (budgetCat.has(e.category_id)) { kind = 'cat'; id = e.category_id; }
      else { kind = 'loan'; id = null; }
      label = lid ? (loans.has(lid) ? loans.get(lid).name : null) : null;
    } else {
      kind = 'cat';
      id = e.category_id;
      label = cats.has(id) ? cats.get(id).name : null;
    }
    if (kind === 'cat' && cats.has(id)) label = cats.get(id).name;
    const key = planKey_(kind, id);
    if (!meta.has(key)) {
      meta.set(key, [label || ({ savings: 'Savings (no place)', loan: 'Loan payments (no loan)' }[typ] || '(no category)'), typ]);
    }
    if (!actual.has(key)) actual.set(key, new Map());
    const per = actual.get(key);
    per.set(m, mapGet_(per, m, 0.0) + e.amount);
  });

  // a loan whose payment for this month is already done shows 0 in the projection: plan = what was paid
  const pmCur = proj !== null && proj.has(ms_(cur)) ? proj.get(ms_(cur)) : null;
  (pmCur ? [...pmCur.paid] : []).forEach(lid => {
    const per = actual.get(planKey_('loan', lid));
    const paid = per ? mapGet_(per, cur, 0.0) : 0.0;
    if (paid) add('loan', lid, cur, paid, nameOr(loans, lid, 'Loan ' + lid), 'loan');
  });

  const bucketSum = (src, m) => {
    const out = { income: 0.0, spending: 0.0, savings: 0.0, loans: 0.0 };
    src.forEach((per, key) => { out[PLAN_TYPE_BUCKET_[meta.get(key)[1]]] += mapGet_(per, m, 0.0); });
    return out;
  };

  // ---- cash
  const accts = balances_(db);
  const cashNow = pySum_(accts.filter(a => PLAN_CASH_KINDS_.indexOf(a.kind) >= 0).map(a => a.balance));
  const cardNow = pySum_(accts.filter(a => a.kind === 'card').map(a => a.balance));
  const cashAt = day => pySum_(balances_(db, day).filter(a => PLAN_CASH_KINDS_.indexOf(a.kind) >= 0 || a.kind === 'card')
    .map(a => a.balance));

  const table = [];
  let cash = null;
  months.forEach(m => {
    const p = bucketSum(planned, m), a = bucketSum(actual, m);
    const pLeft = p.income - p.spending - p.savings - p.loans;
    const aLeft = a.income - a.spending - a.savings - a.loans;
    let when, left;
    if (m < cur) {
      when = 'past'; left = aLeft; cash = cashAt(monthEnd_(m));
    } else if (m === cur) {
      const rem = {};
      PLAN_BUCKETS_.forEach(b => { rem[b] = Math.max(0.0, p[b] - a[b]); });
      left = aLeft + rem.income - rem.spending - rem.savings - rem.loans;
      cash = cashAt(monthEnd_(m)) + rem.income - rem.spending - rem.savings - rem.loans;
      when = 'now';
    } else {
      when = 'future'; left = pLeft; cash = cash + pLeft;
    }
    const pm = proj !== null && proj.has(ms_(m)) ? proj.get(ms_(m)) : null;
    const row = { month: ms_(m), when, left_plan: pyRound_(pLeft, 2), left: pyRound_(left, 2), cash_end: pyRound_(cash, 2),
      loans_outstanding: pm ? pm.outstanding : null };
    PLAN_BUCKETS_.forEach(b => {
      row[b + '_plan'] = pyRound_(p[b], 2);
      row[b + '_actual'] = when === 'future' ? null : pyRound_(a[b], 2);
    });
    table.push(row);
  });

  const inRange = table.filter(r => m0 <= mi_(r.month) && mi_(r.month) <= m1);
  let ahead = inRange.filter(r => r.when !== 'past');
  if (!ahead.length) ahead = inRange;
  let low = null;
  ahead.forEach(r => { if (low === null || r.cash_end < low.cash_end) low = r; });
  const in12 = table.filter(r => mi_(r.month) === cur + 12)[0] || null;
  const over = inRange.filter(r => r.when !== 'future' && (r.spending_actual || 0) > r.spending_plan + 0.5).map(r => r.month);

  // ---- per line plan vs actual for the range
  const keys = [...planned.keys()];
  actual.forEach((v, k) => { if (!planned.has(k)) keys.push(k); });
  const sortKey = k => [PLAN_TYPE_ORDER_.indexOf(meta.get(k)[1]), String(meta.get(k)[0]).toLowerCase()];
  const ordered = keys.map((k, i) => [k, sortKey(k), i]).sort((x, y) => {
    if (x[1][0] !== y[1][0]) return x[1][0] - y[1][0];
    if (x[1][1] !== y[1][1]) return x[1][1] < y[1][1] ? -1 : 1;
    return x[2] - y[2];
  }).map(x => x[0]);
  const soFarEnd = Math.min(m1, cur);
  const lines = [];
  ordered.forEach(key => {
    const label = meta.get(key)[0], typ = meta.get(key)[1];
    const pl = planned.get(key) || new Map(), ac = actual.get(key) || new Map();
    const pv = [...pl];
    const planRange = pySum_(pv.filter(x => m0 <= x[0] && x[0] <= m1).map(x => x[1]));
    const planSoFar = pySum_(pv.filter(x => m0 <= x[0] && x[0] <= soFarEnd).map(x => x[1]));
    const act = pySum_([...ac].filter(x => m0 <= x[0] && x[0] <= m1).map(x => x[1]));
    if (!planRange && !act) return;
    lines.push({ key, label, type: typ, plan: pyRound_(planRange, 2), plan_so_far: pyRound_(planSoFar, 2),
      actual: pyRound_(act, 2), diff: pyRound_(act - planSoFar, 2),
      used_pct: planSoFar ? pyRound_(act / planSoFar * 100, 1) : null });
  });
  const pie = lines.filter(x => x.type === 'expense' && x.plan > 0).map(x => ({ label: x.label, value: x.plan }));

  return {
    from: monthStart_(m0), to: monthEnd_(m1), this_month: ms_(cur), today: t,
    cash_now: pyRound_(cashNow, 2), card_now: pyRound_(cardNow, 2), start_cash: pyRound_(cashNow + cardNow, 2),
    months: inRange, lines, pie,
    summary: { cash_in_12: in12 ? { month: in12.month, cash: in12.cash_end } : null,
      lowest: low ? { month: low.month, cash: low.cash_end } : null,
      over_months: over, over_count: over.length,
      has_loans: proj !== null, loans_note: loansNote },
  };
}

// ---- google/server/projection.js
// google/server/projection.js — the next 12 months, read-only: where the money in bank and cash is heading, worked out only
// from what is already in the app. Nothing here is a plan someone types; nothing here writes.
// GET /api/projection?months=12  (1 to 36 months after this one)
//
// Start: bank, cash and wallet balances today plus credit cards (a card balance owed is negative).
// Each month: + recurring income (salary …); + for income categories with no recurring row, the average of the last 3
// months (or this month, while there is no history); − day-to-day spending per expense category = the average of the last 3 months (entries not made by a
// recurring row), or that category's monthly plan when it has no history and no recurring bill; − recurring bills;
// − loan payments from the loan schedules (EMI or interest only; nothing after a loan ends); − savings (each place's
// monthly target, plus recurring savings rows for other places); ± planned one-offs (goals) in their month.
// This month counts only what has not happened yet (rows still to confirm, targets not met, spending below average).

const PROJ_CASH_KINDS_ = ['bank', 'cash', 'wallet'];

function projectionRoutes_() {
  return [['GET', /^\/api\/projection$/, projectionRoute_]];
}

function projectionRoute_(ctx) {
  const db = ctx.db;
  const n = Math.max(1, Math.min(36, pyInt_(num_(ctx.q.months, 12, 'months'))));
  const today = today_(), cur = mi_(today), last = cur + n;
  const thisYm = ms_(cur);

  const cats = new Map(), places = new Map(), loans = new Map();
  db.rows('categories').forEach(c => cats.set(c.id, c));
  db.rows('savings_places').forEach(p => places.set(p.id, p));
  db.rows('loans').forEach(l => loans.set(l.id, l));
  const recs = db.rows('recurring').filter(r => r.active);
  const ones = db.rows('planned_items');
  const entries = db.all_('entries');
  const dismissed = new Set(db.getSetting('ledger_dismissed', []) || []);
  const byRef = new Map();
  entries.forEach(e => { if (e.source_ref) byRef.set(e.source_ref, e); });
  const catName = id => (cats.has(id) ? cats.get(id).name : 'Other');

  // ---- averages from the last 3 full months that have anything in them (this month so far when none)
  const winMonths = [cur - 3, cur - 2, cur - 1];
  const active = new Set();
  entries.forEach(e => { if (e.status === 'done') { const m = mi_(e.date); if (winMonths.indexOf(m) >= 0) active.add(m); } });
  const useWin = active.size > 0;
  const sumBy = (type, inMonth) => {
    const out = new Map();
    entries.forEach(e => {
      if (e.status !== 'done' || e.type !== type || e.source === 'recurring' || e.source === 'oneoff' || e.event_id) return;   // events and Bombs are counted on their own
      const m = mi_(e.date);
      if (!inMonth(m)) return;
      const k = e.category_id || 0;
      out.set(k, mapGet_(out, k, 0.0) + e.amount);
    });
    return out;
  };
  const hist = { expense: sumBy('expense', m => active.has(m)), income: sumBy('income', m => active.has(m)) };
  const now = { expense: sumBy('expense', m => m === cur), income: sumBy('income', m => m === cur) };
  const avg = (type, cid) => (useWin ? mapGet_(hist[type], cid, 0.0) / active.size : mapGet_(now[type], cid, 0.0));
  const recCats = { expense: new Set(), income: new Set() };
  recs.forEach(r => { if (recCats[r.type]) recCats[r.type].add(r.category_id || 0); });

  // monthly day-to-day spending per expense category, and income categories with no recurring row
  const spendCats = [];
  const cidsSpend = new Set([...hist.expense.keys(), ...now.expense.keys()]);
  cats.forEach((c, cid) => { if (c.type === 'expense' && c.active && (c.budget || 0) > 0) cidsSpend.add(cid); });
  cidsSpend.forEach(cid => {
    let v = avg('expense', cid), how = useWin ? 'average' : 'this month';
    const c = cats.get(cid);
    if (!(v > 0.5) && c && (c.budget || 0) > 0 && !recCats.expense.has(cid)) { v = c.budget; how = 'monthly plan'; }
    if (v > 0.5) spendCats.push({ id: cid, label: catName(cid), monthly: v, how });
  });
  const incCats = [];
  new Set([...hist.income.keys(), ...now.income.keys()]).forEach(cid => {
    if (recCats.income.has(cid)) return;
    const v = avg('income', cid);
    if (v > 0.5) incCats.push({ id: cid, label: catName(cid), monthly: v, how: useWin ? 'average' : 'this month' });
  });

  // ---- loans: the schedules from today's real position (projectionRoute_ never pays a loan twice: recurring rows
  // of type loan for a loan with a schedule are left out)
  let loanSched = new Map();
  try { loanSched = loansProjection_(db, ms_(last)); } catch (e) { loanSched = new Map(); }
  const loanEnds = new Map();           // month index -> [names]: the month of a loan's last payment
  loanSched.forEach((rows, lid) => {
    const paying = rows.filter(r => r.payment + r.prepay > 0.5);
    const lastRow = paying[paying.length - 1];
    if (lastRow && lastRow.outstanding <= 0.5) {
      const m = mi_(lastRow.month);
      if (!loanEnds.has(m)) loanEnds.set(m, []);
      loanEnds.get(m).push({ name: (loans.get(lid) || {}).name || 'A loan', amount: lastRow.payment });
    }
  });

  // ---- a recurring row in month m: its amount, or null (already done this month, skipped, or not due)
  const recIn = (r, m) => {
    if (!planDue_(r, m)) return null;
    if (m === cur) {
      const ref = 'rec:' + r.id + ':' + thisYm, e = byRef.get(ref);
      if (dismissed.has(ref) || (e && e.status === 'done')) return null;
      return e ? e.amount : r.amount;
    }
    return r.amount;
  };
  const doneThisMonth = (type, pick) => pySum_(entries.filter(e => e.status === 'done' && e.type === type && mi_(e.date) === cur && pick(e)).map(e => e.amount));

  const evs = db.rows('events').map(ev => {
    const endM = mi_(ev.end_date || ev.start_date);
    if (endM < cur) return null;
    const spent = pySum_(entries.filter(e => e.status === 'done' && e.event_id === ev.id).map(e => e.amount));
    return { name: ev.name, m: Math.max(cur, mi_(ev.start_date)), left: Math.max(0, (ev.budget || 0) - spent) };
  }).filter(Boolean);
  const start = pySum_(balances_(db).filter(a => PROJ_CASH_KINDS_.indexOf(a.kind) >= 0 || a.kind === 'card').map(a => a.balance));
  const months = [];
  let cash = start;
  for (let m = cur; m <= last; m++) {
    const lines = [];        // {group, label, amount (signed), note}
    const add = (group, label, amount, note) => { if (Math.abs(amount) > 0.5) lines.push({ group, label, amount: r2_(amount), note: note || '' }); };
    const first = m === cur;
    // money in
    recs.filter(r => r.type === 'income').forEach(r => { const a = recIn(r, m); if (a) add('in', r.name, a, 'recurring'); });
    incCats.forEach(c => add('in', c.label, first ? Math.max(0, c.monthly - mapGet_(now.income, c.id, 0.0)) : c.monthly, c.how === 'average' ? '3-month average' : 'like this month'));
    // day-to-day spending
    let spend = 0.0;
    const spendParts = [];
    spendCats.forEach(c => {
      const v = first ? Math.max(0, c.monthly - mapGet_(now.expense, c.id, 0.0)) : c.monthly;
      if (v > 0.5) { spend += v; spendParts.push({ label: c.label, amount: r2_(v), how: c.how }); }
    });
    if (spend > 0.5) lines.push({ group: 'spend', label: 'Day-to-day spending', amount: r2_(-spend), note: useWin ? '3-month average' : 'like this month', parts: spendParts });
    // bills
    recs.filter(r => r.type === 'expense').forEach(r => { const a = recIn(r, m); if (a) add('bills', r.name, -a, 'recurring'); });
    // loans
    loanSched.forEach((rows, lid) => {
      const row = rows.filter(x => mi_(x.month) === m && !x.paid)[0];
      if (row) add('loans', (loans.get(lid) || {}).name || 'Loan', -(row.payment + row.prepay), row.kind === 'pre_emi' ? 'interest' : 'EMI');
    });
    recs.filter(r => r.type === 'loan' && !(r.loan_id && loanSched.has(r.loan_id))).forEach(r => { const a = recIn(r, m); if (a) add('loans', r.name, -a, 'recurring'); });
    // savings
    places.forEach((p, pid) => {
      if (!p.active || !(p.monthly_target > 0)) return;
      if (p.opening_date && m < mi_(p.opening_date)) return;
      if (p.maturity_date && m > mi_(p.maturity_date)) return;
      const v = first ? Math.max(0, p.monthly_target - doneThisMonth('savings', e => e.savings_id === pid)) : p.monthly_target;
      add('savings', p.name, -v, 'monthly target');
    });
    recs.filter(r => r.type === 'savings' && !(r.savings_id && places.has(r.savings_id) && places.get(r.savings_id).monthly_target > 0))
      .forEach(r => { const a = recIn(r, m); if (a) add('savings', r.name, -a, 'recurring'); });
    // Bombs: until confirmed (their row to confirm, if made, holds the amount); events: what is left of the budget
    ones.filter(o => mi_(o.month) === m).forEach(o => {
      const ref = 'one:' + o.id, row = byRef.get(ref);
      if (dismissed.has(ref) || (row && row.status === 'done')) return;
      let v = row ? row.amount : o.amount;
      if (first && o.category_id && !row && BOMB_TYPES_.indexOf(o.type) < 0) v = Math.max(0, v - doneThisMonth(o.type, e => e.category_id === o.category_id));
      const label = o.description || catName(o.category_id);
      if (o.type === 'income') add('in', label, v, 'planned');
      else add(o.type === 'expense' ? 'goals' : o.type === 'loan' ? 'loans' : 'savings', label, -v, 'planned');
    });
    evs.forEach(ev => { if (ev.m === m && ev.left > 0.5) add('goals', ev.name, -ev.left, 'event budget'); });
    const total = pySum_(lines.map(l => l.amount));
    const startM = cash;
    cash = cash + total;
    const outNormal = -pySum_(lines.filter(l => l.amount < 0 && l.group !== 'goals').map(l => l.amount));
    const events = lines.filter(l => l.group === 'goals').map(l => ({ kind: 'goal', label: l.label, amount: -l.amount }));
    (loanEnds.get(m) || []).forEach(x => events.push({ kind: 'loan_end', label: x.name + ' ends', amount: x.amount }));
    months.push({ month: ms_(m), first, start: r2_(startM), end: r2_(cash), in: r2_(pySum_(lines.filter(l => l.amount > 0).map(l => l.amount))),
      out: r2_(-pySum_(lines.filter(l => l.amount < 0).map(l => l.amount))),
      status: cash < -0.5 ? 'short' : cash < outNormal * 0.5 ? 'tight' : 'ok', lines, events });
  }
  let lowest = null;
  months.forEach(x => { if (lowest === null || x.end < lowest.end) lowest = x; });
  const short = months.filter(x => x.status === 'short')[0] || null;
  return {
    today, start: r2_(start), months,
    lowest: lowest ? { month: lowest.month, end: lowest.end, status: lowest.status, events: lowest.events } : null,
    short: short ? { month: short.month, end: short.end } : null,
    through: months.length ? months[months.length - 1].month : thisYm,
    basis: { average_months: useWin ? active.size : 0, spending: spendCats.map(c => ({ label: c.label, monthly: r2_(c.monthly), how: c.how })) },
  };
}

// ---- google/server/router.js
// google/server/router.js — routes every /api/... call: apiRoute_(method, url, body). The page reaches it only
// through api() in auth.js, which checks the PIN sign-in first.
// Every /api route of the app. Returns {ok: true, data} or {ok: false, error}.

function routes_() {
  return [].concat(setupRoutes_(), ledgerRoutes_(), loansRoutes_(), savingsRoutes_(), planRoutes_(), projectionRoutes_(), backupRoutes_(), statsRoutes_(), eventsRoutes_(),
    syncRoutes_());
}

function parseQuery_(qs) {       // like urllib.parse.parse_qs(...) first values; blank values are dropped
  const q = {};
  String(qs || '').split('&').forEach(part => {
    const i = part.indexOf('=');
    if (i < 0) return;
    const dec = s => {
      try {
        return decodeURIComponent(s.replace(/\+/g, ' '));
      } catch (e) {
        return s;
      }
    };
    const k = dec(part.slice(0, i)), v = dec(part.slice(i + 1));
    if (v === '' || has_(q, k)) return;
    q[k] = v;
  });
  return q;
}

/**
 * Runs one request (called by api() in auth.js once the PIN token is checked). method: GET|POST|PUT|DELETE,
 * url: '/api/...?...', body: object.
 * Writes (and GET /api/ledger, which makes recurring rows) run under the script lock; the Sheet is only written
 * when the handler succeeds.
 */
function apiRoute_(method, url, body) {
  REQ_.today = null;
  method = String(method || 'GET').toUpperCase();
  let u = String(url || '');
  const hash = u.indexOf('#');
  if (hash >= 0) u = u.slice(0, hash);
  const qi = u.indexOf('?');
  const path = qi < 0 ? u : u.slice(0, qi);
  const q = parseQuery_(qi < 0 ? '' : u.slice(qi + 1));
  if (typeof body === 'string') {
    try {
      body = body ? JSON.parse(body) : {};
    } catch (e) {
      return { ok: false, error: 'Bad JSON' };
    }
  }
  if (body === null || body === undefined || typeof body !== 'object') body = {};

  let route = null, mt = null;
  const all = routes_();
  for (let i = 0; i < all.length; i++) {
    if (all[i][0] !== method) continue;
    mt = all[i][1].exec(path);
    if (mt) {
      route = all[i];
      break;
    }
  }
  if (!route) return { ok: false, error: 'Not found' };
  const groups = {};
  (route[3] || []).forEach((name, i) => { groups[name] = mt[i + 1]; });

  const writes = method !== 'GET' || route[4] === true;
  let lock = null;
  try {
    if (writes) {
      lock = LockService.getScriptLock();
      if (!lock.tryLock(30000)) {
        lock = null;
        return { ok: false, error: 'Someone else is saving right now. Try again in a moment.' };
      }
    }
    const db = Db.open();
    let me;
    const ctx = { body, q, groups, db, get me() { if (me === undefined) me = me_(db); return me; } };
    const data = route[2](ctx);
    db.commit();
    return { ok: true, data };
  } catch (e) {
    if (e && e.apiError) return { ok: false, error: e.message };
    console.error((e && e.stack) || e);
    return { ok: false, error: 'Something went wrong: ' + ((e && e.message) || e) };
  } finally {
    if (lock) lock.releaseLock();
  }
}

// ---- google/server/savings.js
// google/server/savings.js — every savings place with what was put in, what it is worth now
// and the gain. GET /api/savings?from&to · GET /api/savings/<id>

const SAVINGS_KIND_LABELS_ = { mutual_fund: 'Mutual fund', ppf: 'PPF', epf: 'EPF', nps: 'NPS', stocks: 'Stocks', fd: 'FD',
  rd: 'RD', gold: 'Gold', other: 'Other' };

function savingsRoutes_() {
  return [
    ['GET', /^\/api\/savings$/, savingsList_],
    ['GET', /^\/api\/savings\/(-?\d+)$/, savingsDetail_, ['id']],
  ];
}

function groupBy_(rows, key) {
  const out = new Map();
  rows.forEach(r => {
    if (!out.has(r[key])) out.set(r[key], []);
    out.get(r[key]).push(r);
  });
  return out;
}

/** Savings places with the owner's name (SELECT s.*, pe.name owner ...). */
function savingsPlaces_(db) {
  const people = new Map();
  db.all_('people').forEach(p => people.set(p.id, p));
  return db.rows('savings_places').map(p => {
    const o = people.get(p.owner_id);
    p.owner = o ? o.name : null;
    return p;
  });
}

function savingsPlaceStatus_(p, contribs, values, frm, to, t) {
  const opening = p.opening_value || 0.0;
  const putInTotal = opening + pySum_(contribs.map(e => e.amount));
  const inRange = pySum_(contribs.filter(e => frm <= e.date && e.date <= to).map(e => e.amount));
  const thisM = t.slice(0, 7);
  const thisMonth = pySum_(contribs.filter(e => e.date.slice(0, 7) === thisM).map(e => e.amount));
  const last = Math.min(mi_(to), mi_(t));                 // months of the range that have started
  const nMonths = last >= mi_(frm) ? Math.max(1, last - mi_(frm) + 1) : 1;
  let valueNow, valueAsOf, valueSource;
  if (values.length) {
    const lv = values[values.length - 1];
    const addedAfter = pySum_(contribs.filter(e => e.date > lv.date).map(e => e.amount));
    valueNow = lv.value + addedAfter;
    valueAsOf = lv.date;
    valueSource = 'update';
  } else {
    valueNow = putInTotal;
    valueAsOf = '';
    valueSource = 'put_in';
  }
  const gain = valueNow - putInTotal;
  const target = p.monthly_target || 0.0;
  return {
    id: p.id, name: p.name, kind: p.kind, kind_label: has_(SAVINGS_KIND_LABELS_, p.kind) ? SAVINGS_KIND_LABELS_[p.kind] : p.kind,
    provider: p.provider, owner_id: p.owner_id, owner: p.owner || '',
    opening_value: pyRound_(opening, 2), opening_date: p.opening_date,
    put_in_total: pyRound_(putInTotal, 2), put_in_range: pyRound_(inRange, 2),
    monthly_avg: pyRound_(inRange / nMonths, 2),
    last_added: contribs.length ? contribs[contribs.length - 1].date : '',
    value_now: pyRound_(valueNow, 2), value_as_of: valueAsOf, value_source: valueSource,
    gain: pyRound_(gain, 2), gain_pct: putInTotal ? pyRound_(gain / putInTotal * 100, 2) : null,
    monthly_target: pyRound_(target, 2), this_month: pyRound_(thisMonth, 2),
    target_met: target > 0 ? thisMonth >= target - 0.5 : null,
    maturity_date: p.maturity_date, active: p.active, note: p.note,
  };
}

function savingsList_(ctx) {
  const db = ctx.db;
  const r = dateRange_(ctx.q), frm = r[0], to = r[1];
  const t = today_();
  const entries = db.all_('entries');
  const contribs = groupBy_(orderBy_(entries.filter(e => e.type === 'savings' && e.status === 'done'
    && e.savings_id !== null && e.date <= t), [['date'], ['id']]), 'savings_id');
  const values = groupBy_(orderBy_(db.all_('savings_values').filter(v => v.date <= t), [['date'], ['id']]), 'place_id');
  const places = orderBy_(savingsPlaces_(db), [['active', true], ['id']])
    .map(p => savingsPlaceStatus_(p, contribs.get(p.id) || [], values.get(p.id) || [], frm, to, t));
  const tot = {};
  ['value_now', 'put_in_total', 'put_in_range', 'gain', 'monthly_target', 'this_month', 'opening_value'].forEach(k => {
    tot[k] = pyRound_(pySum_(places.map(p => p[k])), 2);
  });
  tot.gain_pct = tot.put_in_total ? pyRound_(tot.gain / tot.put_in_total * 100, 2) : null;
  const byKind = new Map();
  places.forEach(p => byKind.set(p.kind_label, mapGet_(byKind, p.kind_label, 0) + Math.max(0, p.value_now)));
  // money put in per month of the range (all places, done entries)
  const inRange = orderBy_(entries.filter(e => e.type === 'savings' && e.status === 'done' && e.date >= frm && e.date <= to),
    [['date']]);
  const per = new Map();
  groupBy_(inRange.map(e => ({ m: e.date.slice(0, 7), amount: e.amount })), 'm')
    .forEach((list, m) => per.set(m, pySum_(list.map(x => x.amount))));
  const months = [];
  for (let i = mi_(frm); i <= mi_(to); i++) months.push({ month: ms_(i), put_in: pyRound_(mapGet_(per, ms_(i), 0.0), 2) });
  const unlinked = inRange.filter(e => e.savings_id === null);
  return {
    from: frm, to, today: t, places, totals: tot,
    pie: [...byKind].sort((a, b) => b[1] - a[1]).map(x => ({ label: x[0], value: pyRound_(x[1], 2) })),
    months, unlinked: { count: unlinked.length, amount: pyRound_(unlinked.length ? pySum_(unlinked.map(e => e.amount)) : 0, 2) },
  };
}

function savingsDetail_(ctx) {
  const db = ctx.db, id = Number(ctx.groups.id);
  const p = savingsPlaces_(db).filter(x => x.id === id)[0];
  if (!p) throw ApiError_('Savings place not found');
  const t = today_();
  const lk = ledgerLookups_(db);
  const nm = (map, k) => (k === null || k === undefined ? null : (map.get(k) || {}).name || null);
  const contribs = orderBy_(db.all_('entries').filter(e => e.type === 'savings' && e.savings_id === id), [['date'], ['id']])
    .map(e => ({ id: e.id, date: e.date, amount: e.amount, description: e.description, method: e.method, note: e.note,
      status: e.status, category: nm(lk.categories, e.category_id), person: nm(lk.people, e.person_id),
      account: nm(lk.accounts, e.account_id) }));
  const vals = orderBy_(db.rows('savings_values').filter(v => v.place_id === id), [['date'], ['id']]);
  const timeline = [];
  if (p.opening_value) {
    timeline.push({ key: 'o', date: p.opening_date || '', what: 'Opening value', added: p.opening_value, value: null,
      detail: 'From Settings', by: p.owner || '', account: '', status: 'done', _o: 0 });
  }
  contribs.forEach(e => {
    timeline.push({ key: 'e' + e.id, date: e.date, what: e.status === 'done' ? 'Added' : 'Added (pending)',
      added: e.amount, value: null,
      detail: [e.description, e.category, e.method, e.note].filter(x => pyTruthy_(x)).join(' · '),
      by: e.person || '', account: e.account || '', status: e.status, _o: 1 });
  });
  vals.forEach(v => {
    timeline.push({ key: 'v' + v.id, date: v.date, what: 'Value update', added: null, value: v.value,
      detail: v.note, by: '', account: '', status: 'done', _o: 2 });
  });
  const sorted = timeline.map((r, i) => [r, i]).sort((x, y) => {
    const a = x[0], b = y[0];
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (a._o !== b._o) return a._o - b._o;
    return x[1] - y[1];
  }).map(x => x[0]);
  let putIn = 0.0, lastVal = null, putInAtVal = 0.0;
  sorted.forEach(r => {
    if (r.added && r.status === 'done') putIn += r.added;
    if (r.value !== null) {
      lastVal = r.value;
      putInAtVal = putIn;
    }
    r.put_in_so_far = pyRound_(putIn, 2);
    // worth on that date: last statement value + money added after it (or just what was put in)
    r.worth = pyRound_(lastVal === null ? putIn : lastVal + putIn - putInAtVal, 2);
    delete r._o;
  });
  const status = savingsPlaceStatus_(p, contribs.filter(e => e.status === 'done' && e.date <= t),
    vals.filter(v => v.date <= t), t.slice(0, 8) + '01', t, t);
  return { place: status, rows: sorted.reverse() };
}

// ---- google/server/setup.js
// google/server/setup.js — generic Settings CRUD, options, categories/ensure, settings,
// export / import (the backup). TimeZone settings are gone in the Google version.

function setupChoices_() {
  return { types: TYPES_, methods: METHODS_, account_kinds: ACCOUNT_KINDS_, loan_kinds: LOAN_KINDS_,
    loan_parts: LOAN_PARTS_, savings_kinds: SAVINGS_KINDS_, frequencies: FREQUENCIES_,
    disbursal: ['full', 'stages'], prepay_plan: ['none', 'surplus_quarterly', 'fixed_monthly'],
    planned_types: ['income', 'expense', 'savings', 'loan'], repay: ['emi', 'interest'] };
}

// field: [name, kind, required]. kinds: text int num bool date month ref choice:<list-name>
const SETUP_TABLES_ = {
  people: { order: [['sort'], ['id']], fields: [['name', 'text', true], ['relation', 'text', false],
    ['earns', 'bool', false], ['email', 'text', false], ['active', 'bool', false]] },
  accounts: { order: [['sort'], ['id']], fields: [['name', 'text', true], ['kind', 'choice:account_kinds', true],
    ['provider', 'text', false], ['owner_id', 'ref', false], ['last4', 'text', false], ['opening_balance', 'num', false],
    ['opening_date', 'date', false], ['credit_limit', 'num', false], ['active', 'bool', false], ['note', 'text', false]] },
  categories: { order: [['type'], ['sort'], ['name']], fields: [['name', 'text', true], ['type', 'choice:types', true],
    ['budget', 'num', false], ['active', 'bool', false]] },
  loans: { order: [['active', true], ['id']], fields: [['name', 'text', true], ['kind', 'choice:loan_kinds', true],
    ['lender', 'text', false], ['borrower_id', 'ref', false], ['principal', 'num', true], ['rate', 'num', true],
    ['tenure_months', 'int', true], ['start_date', 'date', true], ['emi_start', 'month', false],
    ['emi_day', 'int', false], ['emi_amount', 'num', false], ['disbursal', 'choice:disbursal', false],
    ['prepay_plan', 'choice:prepay_plan', false], ['prepay_amount', 'num', false], ['reserve', 'num', false],
    ['active', 'bool', false], ['note', 'text', false], ['track_from', 'date', false], ['track_balance', 'num', false],
    ['repay', 'choice:repay', false], ['interest_until', 'month', false]] },
  loan_stages: { order: [['due_date'], ['id']], parent: 'loan_id', fields: [['loan_id', 'ref', true],
    ['label', 'text', false], ['due_date', 'date', true], ['amount', 'num', true], ['released_date', 'date', false]] },
  loan_rates: { order: [['from_date'], ['id']], parent: 'loan_id', fields: [['loan_id', 'ref', true],
    ['from_date', 'date', true], ['rate', 'num', true], ['note', 'text', false]] },
  savings_places: { order: [['active', true], ['id']], fields: [['name', 'text', true],
    ['kind', 'choice:savings_kinds', true], ['provider', 'text', false], ['owner_id', 'ref', false],
    ['opening_value', 'num', false], ['opening_date', 'date', false], ['monthly_target', 'num', false],
    ['maturity_date', 'date', false], ['active', 'bool', false], ['note', 'text', false]] },
  savings_values: { order: [['date', true], ['id', true]], parent: 'place_id', fields: [['place_id', 'ref', true],
    ['date', 'date', true], ['value', 'num', true], ['note', 'text', false]] },
  recurring: { order: [['active', true], ['day'], ['id']], fields: [['name', 'text', true], ['type', 'choice:types', true],
    ['category_id', 'ref', false], ['amount', 'num', true], ['person_id', 'ref', false], ['method', 'choice:methods', false],
    ['account_id', 'ref', false], ['to_account_id', 'ref', false], ['loan_id', 'ref', false],
    ['loan_part', 'choice:loan_parts', false], ['savings_id', 'ref', false], ['frequency', 'choice:frequencies', false],
    ['day', 'int', false], ['start_month', 'month', false], ['end_month', 'month', false], ['active', 'bool', false],
    ['for_id', 'ref', false]] },
  planned_items: { order: [['month'], ['id']], fields: [['month', 'month', true], ['type', 'choice:planned_types', true],
    ['category_id', 'ref', false], ['description', 'text', false], ['amount', 'num', true], ['person_id', 'ref', false],
    ['note', 'text', false], ['day', 'int', false]] },
  events: { order: [['start_date', true], ['id']], fields: [['name', 'text', true], ['start_date', 'date', true],
    ['end_date', 'date', false], ['budget', 'num', true], ['note', 'text', false]] },
};
// deleting one of these unlinks what points at it (the spends of a deleted event stay, just not linked)
const SETUP_UNLINK_ = { events: [['entries', 'event_id']] };
// what refers to what, for "can I delete this?"
const SETUP_REFS_ = {
  people: [['entries', 'person_id'], ['accounts', 'owner_id'], ['recurring', 'person_id'], ['loans', 'borrower_id'],
    ['savings_places', 'owner_id'], ['planned_items', 'person_id'], ['entries', 'for_id'], ['recurring', 'for_id']],
  accounts: [['entries', 'account_id'], ['entries', 'to_account_id'], ['recurring', 'account_id']],
  categories: [['entries', 'category_id'], ['recurring', 'category_id'], ['planned_items', 'category_id']],
  loans: [['entries', 'loan_id'], ['recurring', 'loan_id']],
  savings_places: [['entries', 'savings_id'], ['recurring', 'savings_id']],
};
const SETUP_CHILDREN_ = { loans: [['loan_stages', 'loan_id'], ['loan_rates', 'loan_id']],
  savings_places: [['savings_values', 'place_id']] };
const SETUP_ALLOWED_SETTINGS_ = ['plan'];
const EXPORT_TABLES_ = ['people', 'accounts', 'categories', 'loans', 'loan_stages', 'loan_rates', 'savings_places',
  'savings_values', 'events', 'entries', 'recurring', 'planned_items', 'settings'];

function setupRoutes_() {
  const T = '([a-z_]+)';
  return [
    ['GET', /^\/api\/options$/, options_],
    ['GET', new RegExp('^/api/setup/' + T + '$'), setupList_, ['table']],
    ['POST', new RegExp('^/api/setup/' + T + '$'), setupCreate_, ['table']],
    ['PUT', new RegExp('^/api/setup/' + T + '/(-?\\d+)$'), setupUpdate_, ['table', 'id']],
    ['DELETE', new RegExp('^/api/setup/' + T + '/(-?\\d+)$'), setupDelete_, ['table', 'id']],
    ['POST', /^\/api\/categories\/ensure$/, categoryEnsure_],
    ['POST', /^\/api\/categories\/defaults$/, categoryDefaults_],
    ['GET', /^\/api\/settings\/([a-z_]+)$/, settingsGet_, ['key']],
    ['PUT', /^\/api\/settings\/([a-z_]+)$/, settingsPut_, ['key']],
    ['GET', /^\/api\/backup$/, exportAll_],     // Google version: JSON, the page saves it as a file
    ['GET', /^\/api\/export$/, exportAll_],
    ['POST', /^\/api\/import$/, importAll_],
    ['POST', /^\/api\/reset$/, resetAll_],
  ];
}

/** Sets up the Sheet: every tab and header column. Run once from the editor (wrap it) or let api() do it lazily. */
function setupSheet_() {
  const db = Db.open();
  db.ensureSchema();
  return Object.keys(SCHEMA_);
}

function setupClean_(table, body, partial) {
  const ch = setupChoices_();
  const out = {};
  SETUP_TABLES_[table].fields.forEach(spec => {
    const f = spec[0], kind = spec[1], req = spec[2];
    if (!has_(body, f)) {
      if (req && !partial) throw ApiError_(reqLabel_(f) + ' is required');
      return;
    }
    const v = body[f];
    if (req && isBlank_(v)) throw ApiError_(reqLabel_(f) + ' is required');
    if (kind === 'text') out[f] = (pyTruthy_(v) ? pyStr_(v) : '').trim();
    else if (kind === 'int') out[f] = pyInt_(num_(v, 0, f));
    else if (kind === 'num') out[f] = num_(v, 0.0, f);
    else if (kind === 'bool') out[f] = [true, 1, '1', 'true', 'yes', 'Yes'].indexOf(v) >= 0 ? 1 : 0;
    else if (kind === 'date') out[f] = iso_(v, f, req);
    else if (kind === 'month') out[f] = monthStr_(v, f, req);
    else if (kind === 'ref') out[f] = refId_(v);
    else if (kind.indexOf('choice:') === 0) out[f] = isBlank_(v) ? '' : choice_(v, ch[kind.slice(7)], f);
  });
  return out;
}

function setupCheck_(table) {
  if (!has_(SETUP_TABLES_, table)) throw ApiError_('Unknown list');
}

function sqlIntArg_(v) {         // a query/path value compared with an INTEGER column
  const s = String(v).trim();
  return /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s) ? Number(s) : s;
}

function setupList_(ctx) {
  const table = ctx.groups.table;
  setupCheck_(table);
  const t = SETUP_TABLES_[table];
  let rows = ctx.db.rows(table);
  if (t.parent && ctx.q[t.parent]) {
    const want = sqlIntArg_(ctx.q[t.parent]);
    rows = rows.filter(r => r[t.parent] === want);
  }
  return { rows: orderBy_(rows, t.order) };
}

function setupCreate_(ctx) {
  const table = ctx.groups.table;
  setupCheck_(table);
  const db = ctx.db;
  const data = setupClean_(table, ctx.body, false);
  if (SCHEMA_[table].some(c => c[0] === 'sort')) data.sort = (maxOf_(db.all_(table).map(r => r.sort), 0) || 0) + 1;
  let id;
  try {
    id = db.insert(table, data);
  } catch (e) {
    if (e.integrity) throw ApiError_("'" + (has_(data, 'name') ? data.name : '') + "' already exists");
    throw e;
  }
  return { row: db.get(table, id) };
}

function setupUpdate_(ctx) {
  const table = ctx.groups.table, id = ctx.groups.id;
  setupCheck_(table);
  const db = ctx.db;
  if (!db.get(table, id)) throw ApiError_('Not found');
  try {
    db.update(table, Number(id), setupClean_(table, ctx.body, true));
  } catch (e) {
    if (e.integrity) throw ApiError_('That name already exists');
    throw e;
  }
  return { row: db.get(table, id) };
}

function setupDelete_(ctx) {
  const table = ctx.groups.table, id = Number(ctx.groups.id);
  setupCheck_(table);
  const db = ctx.db;
  (SETUP_UNLINK_[table] || []).forEach(rc => db.all_(rc[0]).forEach(r => { if (r[rc[1]] === id) db.update(rc[0], r.id, { [rc[1]]: null }); }));
  if (table === 'planned_items') db.all_('entries').forEach(e => { if (e.source_ref === 'one:' + id && e.status === 'pending') db.remove('entries', e.id); });
  let used = 0;
  (SETUP_REFS_[table] || []).forEach(rc => {
    used += db.all_(rc[0]).filter(r => r[rc[1]] === id).length;
  });
  if (used) {
    if (SETUP_TABLES_[table].fields.some(f => f[0] === 'active')) {
      db.update(table, id, { active: 0 });
      return { archived: true, message: 'In use, so it was made inactive instead of deleted.' };
    }
    throw ApiError_("This is in use and can't be deleted");
  }
  (SETUP_CHILDREN_[table] || []).forEach(ch => db.removeWhere(ch[0], r => r[ch[1]] === id));
  db.remove(table, id);
  return { deleted: true };
}

function pick_(rows, cols) {
  return rows.map(r => {
    const o = {};
    cols.forEach(c => { o[c] = r[c]; });
    return o;
  });
}

/** The signed-in Google account and the person whose email matches it (case-insensitive). */
function me_(db) {
  // Signed in with a PIN (auth.js): that person. Otherwise (tests, or a Google sign-in deployment): match the email.
  if (typeof AUTH_ !== 'undefined' && AUTH_.person) return { email: '', person_id: Number(AUTH_.person) };
  let email = '';
  try {
    email = String(Session.getActiveUser().getEmail() || '');
  } catch (e) {
    email = '';
  }
  const want = email.trim().toLowerCase();
  const p = want ? db.all_('people').filter(x => String(x.email || '').trim().toLowerCase() === want)[0] : null;
  return { email, person_id: p ? p.id : null };
}

function options_(ctx) {
  const db = ctx.db;
  return {
    today: today_(),
    people: pick_(orderBy_(db.rows('people'), [['sort'], ['id']]), ['id', 'name', 'relation', 'earns', 'email', 'active']),
    accounts: pick_(orderBy_(db.rows('accounts'), [['sort'], ['id']]),
      ['id', 'name', 'kind', 'provider', 'last4', 'owner_id', 'active']),
    categories: pick_(orderBy_(db.rows('categories'), [['type'], ['sort'], ['name']]), ['id', 'name', 'type', 'budget', 'active']),
    loans: pick_(db.rows('loans'), ['id', 'name', 'kind', 'lender', 'active']),
    savings: pick_(db.rows('savings_places'), ['id', 'name', 'kind', 'provider', 'active']),
    choices: setupChoices_(),
    settings: { plan: db.getSetting('plan', {}), cats_ready: !!db.getSetting('cats_ready', false) },
    me: ctx.me,
  };
}

/* Ready-to-use categories: every family starts with these (made once; settings key cats_ready). One that was hidden
   or deleted later is not brought back. core/phone-settings.js SUGGEST lists the same names. */
const DEFAULT_CATEGORIES_ = {
  expense: ['Rent', 'Groceries', 'Electricity', 'Internet', 'Phone', 'Fuel', 'Eating out', 'Travel', 'School fees', 'Insurance', 'Maid', 'Medical', 'Shopping'],
  income: ['Salary', 'Business income', 'Rent received', 'Interest', 'Other income'],
  savings: ['SIP', 'PPF', 'Fixed deposit', 'Gold'],
};
/** POST /api/categories/defaults -> {added}: makes the ready-to-use categories a family does not have yet (once). */
function categoryDefaults_(ctx) {
  const db = ctx.db;
  if (db.getSetting('cats_ready', false)) return { added: 0 };
  const have = new Set(db.all_('categories').map(c => c.type + '|' + lowerAscii_(c.name)));
  let sort = maxOf_(db.all_('categories').map(c => c.sort), 0) || 0, added = 0;
  Object.keys(DEFAULT_CATEGORIES_).forEach(typ => DEFAULT_CATEGORIES_[typ].forEach(name => {
    if (have.has(typ + '|' + lowerAscii_(name))) return;
    db.insert('categories', { name, type: typ, sort: ++sort });
    added += 1;
  }));
  db.setSetting('cats_ready', true);
  return { added };
}

/** Create a category on the fly when someone types a new one in a sheet. */
function categoryEnsure_(ctx) {
  const db = ctx.db, body = ctx.body;
  const name = (pyTruthy_(body.name) ? pyStr_(body.name) : '').trim();
  const typ = choice_(body.type, TYPES_, 'type');
  if (!name) throw ApiError_('Category name is required');
  const r = db.rows('categories').filter(c => lowerAscii_(c.name) === lowerAscii_(name) && c.type === typ)[0];
  if (r) {
    if (!r.active) db.update('categories', r.id, { active: 1 });
    return { row: r, created: false };
  }
  const id = db.insert('categories', { name, type: typ, sort: (maxOf_(db.all_('categories').map(c => c.sort), 0) || 0) + 1 });
  return { row: db.get('categories', id), created: true };
}

function settingsGet_(ctx) {
  if (SETUP_ALLOWED_SETTINGS_.indexOf(ctx.groups.key) < 0) throw ApiError_('Unknown setting');
  return { key: ctx.groups.key, value: ctx.db.getSetting(ctx.groups.key) };
}

function settingsPut_(ctx) {
  if (SETUP_ALLOWED_SETTINGS_.indexOf(ctx.groups.key) < 0) throw ApiError_('Unknown setting');
  ctx.db.setSetting(ctx.groups.key, has_(ctx.body, 'value') ? ctx.body.value : null);
  return { ok: true };
}

/** GET /api/export -> {version: 1, exported, tables: {table: rows}} — the backup file. */
function exportAll_(ctx) {
  const db = ctx.db;
  const tables = {};
  EXPORT_TABLES_.forEach(t => {
    tables[t] = t === 'settings'
      ? orderBy_(db.rows('settings'), [['key']]).map(r => {
        let v = null;
        try { v = JSON.parse(r.value); } catch (e) { v = r.value; }
        return { key: r.key, value: v };
      })
      : db.rows(t);
  });
  return { version: 1, exported: today_(), tables };
}

/** POST /api/reset {confirm: 'RESET'} -> Settings → Backup and reset → Reset data: a clean slate. Every table is
 *  emptied (family included) and every PIN and sign-in goes; the app then starts like a fresh install, with the setup
 *  code. Nobody added later can inherit an old PIN. */
function resetAll_(ctx) {
  const db = ctx.db;
  if (!ctx.body || ctx.body.confirm !== 'RESET') throw ApiError_('Type RESET to confirm.');
  // {backup: true}: the backup to Google Drive in the same request (one trip; the tabs are read once, for both).
  // If Drive says no, nothing is erased and the app saves a file on the phone instead, then asks again.
  let backup = null;
  if (ctx.body.backup && !bkEmpty_(db)) {
    try { backup = bkSave_(db, 'before-reset', false); }
    catch (e) { throw ApiError_('The backup to Google Drive did not work, so nothing was erased (' + e.message + ').'); }
  }
  EXPORT_TABLES_.forEach(t => db.replaceAll(t, []));
  authDropPins_([]);
  return { reset: true, backup };
}

/** POST /api/import {version, tables, confirm} -> replaces all data, ids kept. */
function importAll_(ctx) {
  const db = ctx.db, body = ctx.body;
  const tabs = body.tables;
  if (body.version !== 1 || !tabs || typeof tabs !== 'object' || Array.isArray(tabs)) {
    throw ApiError_("That file isn't a RuPeace export");
  }
  const has = db.all_('people').length + db.all_('entries').length;
  if (has && body.confirm !== 'REPLACE') {
    throw ApiError_('There is already data here. Confirm that you want to replace all of it.');
  }
  const counts = {};
  EXPORT_TABLES_.forEach(t => {
    const list = Array.isArray(tabs[t]) ? tabs[t] : [];
    const cols = SCHEMA_[t].map(c => c[0]);
    const rows = list.map(r => {
      if (t === 'settings') return { key: String(r.key), value: JSON.stringify(r.value === undefined ? null : r.value) };
      const keep = {};
      Object.keys(r || {}).forEach(k => { if (cols.indexOf(k) >= 0) keep[k] = r[k]; });
      return keep;
    });
    db.replaceAll(t, rows);
    counts[t] = rows.length;
  });
  return { imported: counts };
}

// ---- google/server/stats.js
// google/server/stats.js — GET /api/months?from=YYYY-MM&to=YYYY-MM

function statsRoutes_() {
  return [['GET', /^\/api\/months$/, statsMonths_]];
}

function statsMonths_(ctx) {
  const a = monthStr_(ctx.q.from, 'from'), b = monthStr_(ctx.q.to, 'to');
  const i0 = mi_(a), i1 = mi_(b);
  if (i1 < i0 || i1 - i0 > 60) throw ApiError_('Pick at most 5 years of months');
  const out = new Map();
  for (let i = i0; i <= i1; i++) out.set(ms_(i), { month: ms_(i), spend: 0.0, income: 0.0, saved: 0.0, loans: 0.0 });
  const key = { expense: 'spend', income: 'income', savings: 'saved', loan: 'loans' };
  const frm = monthStart_(i0), to = monthEnd_(i1);
  const groups = new Map();      // 'YYYY-MM|type' -> amounts, in date order (SQL SUM per group)
  orderBy_(ctx.db.all_('entries').filter(e => e.status === 'done' && e.date >= frm && e.date <= to), [['date']])
    .forEach(e => {
      const g = e.date.slice(0, 7) + '|' + e.type;
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(e.amount);
    });
  groups.forEach((amounts, g) => {
    const m = g.slice(0, 7), typ = g.slice(8);
    if (has_(key, typ) && out.has(m)) out.get(m)[key[typ]] = pyRound_(pySum_(amounts), 2);
  });
  return { months: [...out.values()] };
}

// ---- google/server/sync.js
// google/server/sync.js — offline sync (OFFLINE.md, Contract 1). Each phone keeps a copy of every table, works on it
// offline and sends what it changed as row changes {cid, at, table, key, before, after}; this file merges them into
// the Sheet row by row and answers with what happened plus a fresh copy of everything.
//
//   GET  /api/sync/seq  -> {seq}                    cheap "did anything change?" check (Script Property SYNC_SEQ)
//   POST /api/sync      {device, since, changes}   -> {seq, idmap, applied, conflicts, duplicates, errors, tables}
//
// Rules (in the order the changes come, all in one request = one lock, one commit):
// - temporary ids: new rows made offline have negative ids. A negative key, or a negative *_id field, means "the row
//   this request inserted with that temporary id"; it is replaced by the real id (idmap). A source_ref
//   'rec:<negative>:<month>' (a recurring row made offline) is remapped the same way.
// - insert: a row that already exists (same unique name, or same entries.source_ref) is the same row: the temporary
//   id maps to it and blanks in it are filled from the phone's row (nothing of the other person's is overwritten).
//   Otherwise the row is inserted. A new entry that looks like one the other person added since the phone last
//   synced (same date, type, amount, category) is reported as a possible duplicate.
// - update: three-way merge per field (before = what the phone started from, after = the phone's, current = the
//   Sheet's). Fields only one side changed merge by themselves; a field both changed differently is a conflict.
//   A row the other person deleted is a conflict too.
// - delete: refused (conflict) when the other person changed the row since; otherwise deleted the way
//   DELETE /api/setup/... does (a row in use is made inactive instead).
// - settings rows are keyed by `key`; 'ledger_dismissed' (a list) merges as a set and never conflicts.
// - a change sent again (the answer to an earlier sync never reached the phone) is recognised by its cid and not
//   applied twice (Script Property syncdev:<device> remembers the inserts of the last sync of each device).
// - a change that can't be applied at all (unknown table, a name clash, a temporary id this request doesn't know)
//   is listed in `errors` [{cid, error}] and left alone.

const SYNC_REFS_ = { category_id: 'categories', account_id: 'accounts', to_account_id: 'accounts', person_id: 'people',
  owner_id: 'people', borrower_id: 'people', loan_id: 'loans', savings_id: 'savings_places',
  place_id: 'savings_places', for_id: 'people', event_id: 'events' };
const SYNC_DEVICE_KEEP_ = 250;          // inserts remembered per device for "sent again"
const SYNC_DEVICE_MAX_CHARS_ = 8500;    // a Script Property value holds 9 kB

function syncRoutes_() {
  return [
    ['GET', /^\/api\/sync\/seq$/, syncSeq_],
    ['POST', /^\/api\/sync$/, syncRoute_],
  ];
}

function syncProps_() {
  return PropertiesService.getScriptProperties();
}

function syncSeqNow_() {
  return Number(syncProps_().getProperty('SYNC_SEQ')) || 0;
}

function syncSeq_() {
  return { seq: syncSeqNow_() };
}

/** ISO time at which SYNC_SEQ reached `since` ('' = before anything we remember: every row counts as newer). */
function syncSinceTime_(since) {
  if (!(since > 0)) return '';
  let log = [];
  try {
    log = JSON.parse(syncProps_().getProperty('SYNC_SEQ_LOG') || '[]');
  } catch (e) {
    log = [];
  }
  let at = '';
  (Array.isArray(log) ? log : []).forEach(x => { if (Array.isArray(x) && x[0] <= since) at = String(x[1] || ''); });
  return at;
}

function syncDeviceKey_(device) {
  const d = String(device || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
  return d ? 'syncdev:' + d : '';
}

function syncDeviceRead_(key) {
  if (!key) return [];
  try {
    const rec = JSON.parse(syncProps_().getProperty(key) || 'null');
    return rec && Array.isArray(rec.ins) ? rec.ins : [];
  } catch (e) {
    return [];
  }
}

function syncDeviceWrite_(key, old, ins) {
  if (!key || (!old.length && !ins.length)) return;
  let list = ins.slice(Math.max(0, ins.length - SYNC_DEVICE_KEEP_));
  let text = JSON.stringify({ at: new Date().toISOString(), ins: list });
  while (text.length > SYNC_DEVICE_MAX_CHARS_ && list.length) {
    list = list.slice(Math.ceil(list.length / 4));
    text = JSON.stringify({ at: new Date().toISOString(), ins: list });
  }
  if (!list.length) syncProps_().deleteProperty(key);
  else syncProps_().setProperty(key, text);
}

// ------------------------------------------------------------------ helpers
function syncCol_(table, f) {
  return SCHEMA_[table].filter(c => c[0] === f)[0] || null;
}

function syncNorm_(col, v) {             // value as the Sheet layer would store it, for comparing
  return coerceVal_(col, v);
}

function syncSame_(a, b) {
  return a === b;
}

function syncIdKey_(v) {
  return String(Number(v));
}

/** Real id for a temporary (negative) one, from this request's inserts. Other values pass through. */
function syncMapId_(st, table, v) {
  if (v === null || v === undefined || v === '' || typeof v === 'boolean') return v;
  const n = Number(v);
  if (!(n < 0)) return v;
  const m = st.idmap[table] && st.idmap[table][syncIdKey_(n)];
  if (m === undefined) throw ApiError_('Unknown temporary id ' + n + ' in ' + table);
  return m;
}

function syncMapDismissed_(st, list) {
  return (Array.isArray(list) ? list : []).map(x => {
    const m = /^rec:(-\d+):(.*)$/.exec(String(x)), b = /^one:(-\d+)$/.exec(String(x));
    return m ? 'rec:' + syncMapId_(st, 'recurring', m[1]) + ':' + m[2] : b ? 'one:' + syncMapId_(st, 'planned_items', b[1]) : x;
  });
}

function syncParse_(text, dflt) {
  try {
    return JSON.parse(text);
  } catch (e) {
    return dflt;
  }
}

/** A row from the phone with its references remapped (a copy; `id` is left alone). */
function syncMapRow_(st, table, row) {
  if (!row || typeof row !== 'object') return null;
  const out = Object.assign({}, row);
  Object.keys(SYNC_REFS_).forEach(f => {
    if (has_(out, f)) out[f] = syncMapId_(st, SYNC_REFS_[f], out[f]);
  });
  if (table === 'entries' && typeof out.source_ref === 'string') {
    const m = /^rec:(-\d+):(.*)$/.exec(out.source_ref);
    if (m) out.source_ref = 'rec:' + syncMapId_(st, 'recurring', m[1]) + ':' + m[2];
    const b = /^one:(-\d+)$/.exec(out.source_ref);
    if (b) out.source_ref = 'one:' + syncMapId_(st, 'planned_items', b[1]);
  }
  if (table === 'settings' && String(out.key) === LEDGER_DISMISSED_ && typeof out.value === 'string') {
    const list = syncParse_(out.value, null);
    if (Array.isArray(list)) out.value = JSON.stringify(syncMapDismissed_(st, list));
  }
  return out;
}

function syncRemember_(st, table, temp, real) {
  if (temp === null || temp === undefined || temp === '') return;
  if (!st.idmap[table]) st.idmap[table] = {};
  st.idmap[table][syncIdKey_(temp)] = real;
}

function syncTheirs_(st, table, key, kind, cid, extra) {
  const m = st.db.rowMeta_(table, key) || { at: '', by: '' };
  return Object.assign({ cid, kind, table, key, theirs: st.db.get(table, key), theirs_at: m.at, theirs_by: m.by },
    extra || {});
}

// ------------------------------------------------------------------ one change
function syncOne_(st, ch, cid) {
  const table = String(ch.table || '');
  if (!has_(SCHEMA_, table) || EXPORT_TABLES_.indexOf(table) < 0) throw ApiError_('Unknown table: ' + table);
  const keyed = SCHEMA_[table][0][1] === 'key';
  const before = ch.before ? syncMapRow_(st, table, ch.before) : null;
  const after = ch.after ? syncMapRow_(st, table, ch.after) : null;
  if (!before && !after) throw ApiError_('A change needs a before or an after');
  if (!before) return syncInsert_(st, cid, table, keyed, ch.key, after);
  const rawKey = ch.key !== undefined && ch.key !== null ? ch.key : (keyed ? before.key : before.id);
  const key = keyed ? String(rawKey) : Number(syncMapId_(st, table, rawKey));
  if (!keyed && !(key > 0)) throw ApiError_('Bad key ' + rawKey + ' in ' + table);
  const kn = SCHEMA_[table][0][0];
  before[kn] = key;                                              // a temporary id in the row itself -> the real one
  if (after) after[kn] = key;
  if (!after) return syncDelete_(st, cid, table, key, before);
  return syncUpdate_(st, cid, table, key, before, after);
}

function syncInsert_(st, cid, table, keyed, rawKey, after) {
  const db = st.db;
  const cols = SCHEMA_[table];
  if (keyed) {                                                   // settings: by key
    const key = String(rawKey !== undefined && rawKey !== null ? rawKey : after.key);
    if (!key) throw ApiError_('A setting needs a key');
    if (!db.get(table, key)) {
      const obj = Object.assign({}, after, { key });
      db.insert(table, obj);
      return {};
    }
    return syncUpdate_(st, cid, table, key, { key, value: null }, Object.assign({}, after, { key }));
  }
  const temp = rawKey !== undefined && rawKey !== null ? rawKey : after.id;
  const norm = f => syncNorm_(syncCol_(table, f), after[f]);
  let same = null;
  (UNIQUE_[table] || []).forEach(u => {
    if (same || !u.every(f => has_(after, f))) return;
    same = db.all_(table).filter(r => u.every(f => r[f] === norm(f)))[0] || null;
  });
  if (!same && table === 'entries' && !isBlank_(after.source_ref)) {
    same = db.all_('entries').filter(r => r.source_ref === norm('source_ref'))[0] || null;
  }
  if (same) {                                                    // made on both phones: one row
    syncRemember_(st, table, temp, same.id);
    const patch = {};
    cols.forEach(c => {
      const f = c[0];
      if (c === cols[0] || !has_(after, f)) return;
      const v = norm(f);
      if (isBlank_(same[f]) && !isBlank_(v)) patch[f] = v;
    });
    if (has_(after, 'active') && norm('active') === 1 && same.active === 0) patch.active = 1;
    if (Object.keys(patch).length) db.update(table, same.id, patch);
    return {};
  }
  const obj = Object.assign({}, after);
  delete obj.id;
  const id = db.insert(table, obj);
  syncRemember_(st, table, temp, id);
  st.inserted.push([cid, table, temp === undefined ? null : temp, id]);
  const res = {};
  if (table === 'entries') {
    const e = db.get('entries', id);
    const me = String(st.me || '');
    const dup = db.rowsWithMeta_('entries').filter(x => x.row.id !== id && x.by !== '' && String(x.by) !== me &&
      x.at > st.sinceAt && x.row.date === e.date && x.row.type === e.type && x.row.amount === e.amount &&
      x.row.category_id === e.category_id)[0];
    if (dup) res.duplicate = { cid, table, key: id, of: dup.row.id, of_by: dup.by, of_at: dup.at };
  }
  return res;
}

function syncUpdate_(st, cid, table, key, before, after) {
  const db = st.db;
  const cols = SCHEMA_[table];
  const cur = db.get(table, key);
  if (!cur) return { conflict: { cid, kind: 'deleted_theirs', table, key, mine: after, theirs: null, theirs_at: '', theirs_by: '' } };
  if (table === 'settings' && key === LEDGER_DISMISSED_) {      // a set: add what they added, drop what they dropped
    const b = syncParse_(before.value, []) || [], a = syncParse_(after.value, []) || [];
    const c = syncParse_(cur.value, []) || [];
    const added = (Array.isArray(a) ? a : []).filter(x => b.indexOf(x) < 0);
    const dropped = (Array.isArray(b) ? b : []).filter(x => a.indexOf(x) < 0);
    let next = (Array.isArray(c) ? c : []).filter(x => dropped.indexOf(x) < 0);
    added.forEach(x => { if (next.indexOf(x) < 0) next.push(x); });
    const text = JSON.stringify(next);
    if (text !== cur.value) db.update(table, key, { value: text });
    return {};
  }
  const patch = {}, fields = [];
  cols.forEach(c => {
    const f = c[0];
    if (c === cols[0] || !has_(after, f)) return;
    const mine = syncNorm_(c, after[f]);
    const was = syncNorm_(c, has_(before, f) ? before[f] : undefined);
    if (syncSame_(mine, was)) return;                            // the phone didn't change it
    if (syncSame_(cur[f], was)) patch[f] = mine;                 // only the phone changed it
    else if (syncSame_(cur[f], mine)) return;                    // both made the same change
    else fields.push({ name: f, before: has_(before, f) ? before[f] : null, mine: after[f], theirs: cur[f] });
  });
  if (Object.keys(patch).length) db.update(table, key, patch);
  if (fields.length) return { conflict: syncTheirs_(st, table, key, 'field', cid, { fields }) };
  return {};
}

function syncDelete_(st, cid, table, key, before) {
  const db = st.db;
  const cur = db.get(table, key);
  if (!cur) return {};                                           // already gone
  const changed = SCHEMA_[table].some(c => has_(before, c[0]) && !syncSame_(syncNorm_(c, before[c[0]]), cur[c[0]]));
  if (changed) return { conflict: syncTheirs_(st, table, key, 'edited_theirs', cid) };
  if (has_(SETUP_TABLES_, table)) {                              // same rules as DELETE /api/setup/<table>/<id>
    setupDelete_({ groups: { table, id: String(key) }, db, body: {}, q: {} });
  } else {
    db.remove(table, key);
  }
  return {};
}

// ------------------------------------------------------------------ the route
function syncRoute_(ctx) {
  const db = ctx.db, body = ctx.body;
  db.enableMeta_();                                              // first sync: every tab gets _at/_by
  const since = Number(body.since) || 0;
  const changes = Array.isArray(body.changes) ? body.changes : [];
  const devKey = syncDeviceKey_(body.device);
  const old = syncDeviceRead_(devKey);
  const done = new Map(old.map(x => [x[0], x]));
  const st = { db, idmap: {}, inserted: [], sinceAt: syncSinceTime_(since),
    me: typeof AUTH_ !== 'undefined' ? AUTH_.person : null };
  const out = { applied: [], conflicts: [], duplicates: [], errors: [] };
  changes.forEach(ch => {
    if (!ch || typeof ch !== 'object') return;
    const cid = String(ch.cid || '');
    const prev = cid ? done.get(cid) : null;
    if (prev) {                                                  // applied by an earlier sync: not twice
      syncRemember_(st, prev[1], prev[2], prev[3]);
      st.inserted.push(prev);
      out.applied.push(cid);
      return;
    }
    try {
      const r = syncOne_(st, ch, cid);
      if (r.conflict) out.conflicts.push(r.conflict);
      else out.applied.push(cid);
      if (r.duplicate) out.duplicates.push(r.duplicate);
    } catch (e) {
      if (!(e && (e.apiError || e.integrity))) console.error((e && e.stack) || e);
      const msg = e && e.integrity ? 'That name already exists' : String((e && e.message) || e);
      out.errors.push({ cid, error: msg });
    }
  });
  const snapshot = exportAll_({ db }).tables;                    // from memory, before commit drops the cache
  db.commit();
  if (typeof bkMaybeDaily_ === 'function' && typeof UrlFetchApp !== 'undefined') bkMaybeDaily_(db);   // the first sync of the day saves a backup in Drive (not on a phone: it backs up itself)
  syncDeviceWrite_(devKey, old, st.inserted.filter(x => x[0]));
  const seq = syncSeqNow_();
  return { seq, idmap: st.idmap, applied: out.applied, conflicts: out.conflicts, duplicates: out.duplicates,
    errors: out.errors, tables: seq !== since || out.applied.length ? snapshot : null };
}

// ---- google/server/util.js
// google/server/util.js — small helpers (values, dates, rounding) shared by the server code.
// Apps Script concatenates every server file into one global scope: only declarations live at the top level, and
// every name ends in "_" so it can't be called from outside (api() in auth.js is the only entry).

// per-request memo; shareDb/db: one Sheet read per batch (apiBatch).
// Local mode (the phone's engine, OFFLINE.md): localIds -> new rows get temporary negative ids; capture = [] -> every
// commit pushes {table, key, before, after} per row it really changed. Both are off on the server.
const REQ_ = { today: null, shareDb: false, db: null, localIds: false, capture: null };

function ApiError_(message) {   // like fin.db.ApiError: a plain sentence the user should read
  const e = new Error(message);
  e.apiError = true;
  return e;
}

function today_() {
  if (!REQ_.today) {
    const tz = Session.getScriptTimeZone() || 'Asia/Kolkata';
    REQ_.today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  }
  return REQ_.today;
}

function nowUtc_() {            // SQLite CURRENT_TIMESTAMP: 'YYYY-MM-DD HH:MM:SS' in UTC
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

function pad_(n, w) {
  let s = String(n);
  while (s.length < w) s = '0' + s;
  return s;
}

function has_(obj, k) {
  return obj !== null && obj !== undefined && Object.prototype.hasOwnProperty.call(obj, k);
}

function isBlank_(v) {          // Python: v in (None, "")
  return v === null || v === undefined || v === '';
}

function isDate_(v) {
  return Object.prototype.toString.call(v) === '[object Date]';
}

function pyTruthy_(v) {
  if (Array.isArray(v)) return v.length > 0;
  if (v instanceof Map || v instanceof Set) return v.size > 0;
  if (v && typeof v === 'object') return Object.keys(v).length > 0;
  return !!v;
}

function pyStr_(v) {            // Python str() for the values a JSON body can hold
  if (v === true) return 'True';
  if (v === false) return 'False';
  if (v === null || v === undefined) return 'None';
  return String(v);
}

function cap_(s) {              // Python str.capitalize()
  s = String(s);
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function label_(field) {        // field.replace('_', ' ').capitalize()
  return cap_(String(field).replace(/_/g, ' '));
}

function lowerAscii_(s) {       // SQLite lower(): ASCII only
  return String(s === null || s === undefined ? '' : s).replace(/[A-Z]/g, c => c.toLowerCase());
}

function pyInt_(x) {            // Python int() of a float
  if (typeof x !== 'number') x = Number(x);
  if (x !== x) throw new Error('ValueError: cannot convert float NaN to integer');
  if (!isFinite(x)) throw new Error('OverflowError: cannot convert float infinity to integer');
  return Math.trunc(x);
}

// --- values: num iso month_str need choice ref_id
function num_(v, dflt, field) {
  if (isBlank_(v)) return dflt;
  const s = pyStr_(v).replace(/,/g, '').replace(/₹/g, '').trim();
  if (/^[+-]?(inf|infinity)$/i.test(s)) return s.charAt(0) === '-' ? -Infinity : Infinity;
  if (/^[+-]?nan$/i.test(s)) return NaN;
  if (!/^[+-]?(\d(_?\d)*(\.(\d(_?\d)*)?)?|\.\d(_?\d)*)([eE][+-]?\d(_?\d)*)?$/.test(s)) {
    throw ApiError_(label_(field || 'value') + ' must be a number');
  }
  return Number(s.replace(/_/g, ''));
}

function daysIn_(y, m) {        // m = 1..12
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function iso_(v, field, required) {
  field = field || 'date';
  if (required === undefined) required = true;
  if (isBlank_(v)) {
    if (required) throw ApiError_(label_(field) + ' is required');
    return '';
  }
  let s = pyStr_(v).trim();
  const m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s);    // dd-mm-yyyy typed in the sheet
  if (m) s = m[3] + '-' + pad_(Number(m[2]), 2) + '-' + pad_(Number(m[1]), 2);
  s = s.slice(0, 10);
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s) || /^(\d{4})(\d{2})(\d{2})$/.exec(s);
  if (d) {
    const y = Number(d[1]), mo = Number(d[2]), dd = Number(d[3]);
    if (y >= 1 && mo >= 1 && mo <= 12 && dd >= 1 && dd <= daysIn_(y, mo)) return d[1] + '-' + d[2] + '-' + d[3];
  }
  throw ApiError_(label_(field) + ' must be a date (dd-mm-yyyy)');
}

function monthStr_(v, field, required) {
  field = field || 'month';
  if (required === undefined) required = true;
  if (isBlank_(v)) {
    if (required) throw ApiError_(label_(field) + ' is required');
    return '';
  }
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(pyStr_(v))) throw ApiError_(label_(field) + ' must be a month (YYYY-MM)');
  return pyStr_(v);
}

function reqLabel_(k) {         // k.replace('_id', '').replace('_', ' ').capitalize()
  return cap_(String(k).split('_id').join('').replace(/_/g, ' '));
}

function need_(body, keys) {
  keys.forEach(k => {
    if (isBlank_(body[k])) throw ApiError_(reqLabel_(k) + ' is required');
  });
}

function choice_(v, allowed, field) {
  if (allowed.indexOf(v) < 0) throw ApiError_(label_(field) + ' must be one of: ' + allowed.join(', '));
  return v;
}

function refId_(v) {            // int(v) if v not in (None, "", 0, "0") else None
  if (isBlank_(v) || v === 0 || v === '0' || v === false) return null;
  if (v === true) return 1;
  if (typeof v === 'number') return pyInt_(v);
  const s = String(v).trim();
  if (/^[+-]?\d(_?\d)*$/.test(s)) return parseInt(s.replace(/_/g, ''), 10);
  throw new Error("ValueError: invalid literal for int() with base 10: '" + v + "'");
}

// --- months: index = year * 12 + month - 1
function mi_(s) {
  return Number(String(s).slice(0, 4)) * 12 + Number(String(s).slice(5, 7)) - 1;
}

function ms_(i) {
  return pad_(Math.floor(i / 12), 4) + '-' + pad_((i % 12) + 1, 2);
}

function monthStart_(i) {
  return ms_(i) + '-01';
}

function monthEnd_(i) {
  return ms_(i) + '-' + pad_(daysIn_(Math.floor(i / 12), (i % 12) + 1), 2);
}

function emi_(principal, rate, n) {
  const i = rate / 1200;
  if (n <= 0) return 0.0;
  if (i === 0) return principal / n;
  const f = Math.pow(1 + i, n);
  return principal * i * f / (f - 1);
}

function dateRange_(q) {        // from/to from the query string (dd-mm-yyyy or ISO); defaults to this month
  const cur = mi_(today_());
  const frm = iso_(q.from, 'from', false) || monthStart_(cur);
  const to = iso_(q.to, 'to', false) || monthEnd_(cur);
  if (to < frm) throw ApiError_("'To' is before 'From'");
  return [frm, to];
}

// --- numbers exactly like Python
function pyRound_(x, n) {       // round(x, n): correctly rounded, ties to even
  if (typeof x !== 'number' || !isFinite(x)) return x;
  const ax = Math.abs(x);
  if (ax >= 1e21) return x;
  const s = ax.toFixed(100);
  const dot = s.indexOf('.');
  const tail = s.slice(dot + 1 + n);
  let r;
  if (/^50*$/.test(tail)) {
    const digits = Number(s.slice(0, dot) + s.slice(dot + 1, dot + 1 + n));
    r = (digits % 2 === 0 ? digits : digits + 1) / Math.pow(10, n);
  } else {
    r = Number(ax.toFixed(n));
  }
  return x < 0 ? -r : r;
}

function pySum_(xs) {           // Python 3.12+ sum() of floats (Neumaier); also SQLite SUM() on REAL columns
  let s = 0, c = 0;
  for (const x of xs) {
    const t = s + x;
    if (Math.abs(s) >= Math.abs(x)) c += (s - t) + x;
    else c += (x - t) + s;
    s = t;
  }
  if (c && isFinite(c)) s += c;
  return s;
}

function mapAdd_(map, k, v) {
  map.set(k, (map.has(k) ? map.get(k) : 0.0) + v);
}

function mapGet_(map, k, dflt) {
  return map.has(k) ? map.get(k) : dflt;
}

// --- SQLite ORDER BY: NULL < numbers < text; text compares by code unit (BINARY)
function sqlCmp_(a, b) {
  const rank = v => (v === null || v === undefined ? 0 : typeof v === 'number' ? 1 : 2);
  const ra = rank(a), rb = rank(b);
  if (ra !== rb) return ra - rb;
  if (ra === 0) return 0;
  return a < b ? -1 : a > b ? 1 : 0;
}

function orderBy_(rows, keys) {  // keys: [[col], [col, true = DESC], ...]; ties keep the input order
  return rows.map((r, i) => [r, i]).sort((x, y) => {
    for (const k of keys) {
      const c = sqlCmp_(x[0][k[0]], y[0][k[0]]);
      if (c) return k[1] ? -c : c;
    }
    return x[1] - y[1];
  }).map(x => x[0]);
}

function maxOf_(xs, dflt) {
  let m = null;
  xs.forEach(x => { if (m === null || x > m) m = x; });
  return m === null ? dflt : m;
}

function minOf_(xs, dflt) {
  let m = null;
  xs.forEach(x => { if (m === null || x < m) m = x; });
  return m === null ? dflt : m;
}

// ---- google/client/engine/main.js
/* RuPeace local engine — the end of engine.js (after shim.js and every google/server/*.js).
   RPEngine.create(tables, {person, localIds}) runs the server's own code on a copy of all tables kept on this device:
     .api(method, url, body) -> {ok: true, data, changes} | {ok: false, error}
        changes: the rows this call inserted, changed or deleted, [{table, key, before, after}] (from REQ_.capture)
     .tables() -> every table, in the shape of GET /api/export (and of the snapshot POST /api/sync answers)
   New rows get temporary negative ids (REQ_.localIds) so two phones never hand out the same id. */

// Rows created on this device have negative ids until Google gives them real ones; the routes must accept them.
// The server's routes say (-?\d+) already; this only catches a route added later with a plain (\d+).
const RP_SERVER_ROUTES_ = routes_;
let RP_ROUTES_ = null;
routes_ = function () {
  if (!RP_ROUTES_) {
    RP_ROUTES_ = RP_SERVER_ROUTES_().map(r => {
      const src = r[1].source.split('(\\d+)').join('(-?\\d+)');
      return [r[0], src === r[1].source ? r[1] : new RegExp(src, r[1].flags)].concat(r.slice(2));
    });
  }
  return RP_ROUTES_;
};

const RPEngine_ = (function () {
  const clone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  // the hooks google/server/db.js has for local mode (Contract 1); without them local mode is not safe
  const hooks = {
    localIds: /localIds/.test(String(DbConn_.prototype.insert)),
    capture: /capture/.test(String(DbConn_.prototype.commit)),
    sync: typeof routes_ === 'function' && RP_SERVER_ROUTES_().some(r => r[1].test('/api/sync')),
  };

  /** Builds the in-memory spreadsheet from export-shaped tables (settings values are JSON, like /api/import). */
  function fill(ss, tables) {
    Object.keys(SCHEMA_).forEach(name => {
      const cols = SCHEMA_[name];
      const header = cols.map(c => c[0]);
      const formats = cols.map(c => (isNumKind_(c[1]) ? 'General' : '@'));
      const list = (tables && Array.isArray(tables[name])) ? tables[name] : [];
      const rows = list.map(r => cols.map(c => {
        let v = r ? r[c[0]] : undefined;
        if (name === 'settings' && c[0] === 'value') v = JSON.stringify(v === undefined ? null : v);
        if (v === undefined || v === null) return '';
        if (isNumKind_(c[1])) return typeof v === 'number' ? v : (v === '' ? '' : (isFinite(Number(v)) ? Number(v) : String(v)));
        return String(v);
      }));
      ss.fill(name, header, rows, formats);
    });
  }

  function create(tables, opts) {
    opts = opts || {};
    const state = { ss: new RPShim_.Spreadsheet(), props: new Map(), cache: new Map() };
    fill(state.ss, tables);
    const localIds = opts.localIds !== false;
    let person = opts.person == null ? null : Number(opts.person);

    function api(method, url, body) {
      RPShim_.use(state);
      REQ_.shareDb = false;
      REQ_.db = null;
      REQ_.localIds = localIds;
      REQ_.capture = [];
      AUTH_.person = person;
      try {
        const res = apiRoute_(method, url, clone(body));
        if (!res || !res.ok) return { ok: false, error: (res && res.error) || 'Something went wrong' };
        return { ok: true, data: res.data, changes: clone(REQ_.capture || []) };
      } catch (e) {
        return { ok: false, error: 'Something went wrong: ' + ((e && e.message) || e) };
      } finally {
        REQ_.capture = null;
        REQ_.localIds = false;
        AUTH_.person = null;
        RPShim_.services.lock.held = false;
      }
    }

    return {
      api,
      tables() {
        const r = api('GET', '/api/export');
        return r.ok ? r.data.tables : null;
      },
      setPerson(p) { person = p == null ? null : Number(p); },
      hooks,
    };
  }

  /** The family's Sheet itself, tab by tab ({tab: [[header…], [row…]…]}, hidden _at/_by columns and all) and its
      properties ({key: value}), for a phone that is the server for one sync (google/client/drive.js).
      .api() as above; .grids() and .props() give the Sheet back after the call. */
  function createRaw(grids, props, opts) {
    opts = opts || {};
    const state = { ss: new RPShim_.Spreadsheet(), props: new Map(), cache: new Map() };
    Object.keys(props || {}).forEach(k => state.props.set(k, String(props[k])));
    Object.keys(grids || {}).forEach(name => {
      const g = grids[name] || [];
      const header = (g[0] || []).map(h => String(h == null ? '' : h));
      const cols = SCHEMA_[name] || [];
      const formats = header.map(h => { const c = cols.find(x => x[0] === h); return c && isNumKind_(c[1]) ? 'General' : '@'; });
      const rows = g.slice(1).map(r => header.map((_, j) => (r && r[j] !== undefined && r[j] !== null ? r[j] : '')));
      state.ss.fill(name, header, rows, formats);
    });
    let person = opts.person == null ? null : Number(opts.person);
    function api(method, url, body) {
      RPShim_.use(state);
      REQ_.shareDb = false; REQ_.db = null; REQ_.localIds = false; REQ_.capture = null;
      AUTH_.person = person;
      try {
        const res = apiRoute_(method, url, clone(body));
        if (!res || !res.ok) return { ok: false, error: (res && res.error) || 'Something went wrong' };
        return { ok: true, data: res.data };
      } catch (e) {
        return { ok: false, error: 'Something went wrong: ' + ((e && e.message) || e) };
      } finally {
        AUTH_.person = null;
        RPShim_.services.lock.held = false;
      }
    }
    function gridsOut() {
      const out = {};
      state.ss.getSheets().forEach(sh => {
        const lr = sh.getLastRow(), lc = sh.getLastColumn();
        out[sh.getName()] = lr && lc ? sh.getRange(1, 1, lr, lc).getValues() : [];
      });
      return out;
    }
    function propsOut() { const o = {}; state.props.forEach((v, k) => { o[k] = v; }); return o; }
    return { api, grids: gridsOut, props: propsOut };
  }

  return { create, createRaw, hooks, sha256Hex: t => RPShim_.sha256(t).map(b => ((b < 0 ? b + 256 : b) + 0x100).toString(16).slice(1)).join('') };
})();

root.RPEngine = RPEngine_;
if (typeof module !== 'undefined' && module.exports) module.exports.RPEngine = RPEngine_;
})(typeof window !== 'undefined' ? window : globalThis);

// ---- google/client/engine/store.js
/* RuPeace local engine — where this device keeps its copy (IndexedDB database "rupeace", object store "kv").
   Keys: meta {person, seq, lastSync, device}, synced (all tables as Google last sent them), pending (changes not yet
   confirmed by Google), conflicts (changes waiting for a person's decision). Each key is written on its own, so a
   save after a quick entry writes only the short pending list, not every table.
   RPStore.idb() for the browser; RPStore.memory() for tests and when IndexedDB is blocked (private windows). */
(function (root) {
'use strict';
const KEYS = ['meta', 'synced', 'pending', 'conflicts'];

function memory(seed) {
  let data = seed ? JSON.parse(JSON.stringify(seed)) : {};
  return {
    kind: 'memory',
    async load() { return KEYS.some(k => data[k] !== undefined) ? JSON.parse(JSON.stringify(data)) : null; },
    async save(parts) { Object.keys(parts).forEach(k => { data[k] = JSON.parse(JSON.stringify(parts[k])); }); },
    async clear() { data = {}; },
    dump() { return JSON.parse(JSON.stringify(data)); },
  };
}

function idb(name) {
  name = name || 'rupeace';
  let dbp = null;
  const open = () => {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      let req;
      try { req = indexedDB.open(name, 1); } catch (e) { reject(e); return; }
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains('kv')) req.result.createObjectStore('kv'); };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => { db.close(); dbp = null; };
        resolve(db);
      };
      req.onerror = () => reject(req.error || new Error('IndexedDB would not open'));
      req.onblocked = () => reject(new Error('IndexedDB is blocked by another tab'));
    });
    dbp.catch(() => { dbp = null; });
    return dbp;
  };
  const tx = async (mode, fn) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction('kv', mode);
      const st = t.objectStore('kv');
      const out = fn(st);
      t.oncomplete = () => resolve(out && out.result !== undefined ? out : out);
      t.onerror = () => reject(t.error || new Error('IndexedDB error'));
      t.onabort = () => reject(t.error || new Error('IndexedDB write was cancelled (storage full?)'));
    });
  };
  return {
    kind: 'idb',
    async load() {
      const reqs = {};
      await tx('readonly', st => { KEYS.forEach(k => { reqs[k] = st.get(k); }); });
      const out = {};
      let any = false;
      KEYS.forEach(k => { if (reqs[k].result !== undefined) { out[k] = reqs[k].result; any = true; } });
      return any ? out : null;
    },
    async save(parts) {
      await tx('readwrite', st => { Object.keys(parts).forEach(k => st.put(parts[k], k)); });
    },
    async clear() {
      await tx('readwrite', st => st.clear());
    },
  };
}

/** IndexedDB if it works here, else memory (the app still works, it just can't keep its copy between visits). */
async function best(name) {
  if (typeof indexedDB === 'undefined') return memory();
  const s = idb(name);
  try { await s.load(); return s; } catch (e) { return memory(); }
}

const api = { memory, idb, best, KEYS };
root.RPStore = api;
if (typeof module !== 'undefined' && module.exports) module.exports.RPStore = api;
})(typeof window !== 'undefined' ? window : globalThis);

// ---- google/client/engine/local.js
/* RuPeace local engine — this device's copy, its waiting changes, and the sync with the Google Sheet (OFFLINE.md,
   Contract 2). No DOM here: google/client/bridge.js wires it to the page, google/test/engine.js to the server code.

   RPLocal.create({store, engine: RPEngine, send, isOnline, autoSync, onChange, onSynced, onSignIn})
     send(body) -> Promise<{ok, data | error, signin}>   one POST /api/sync through the PIN-checked api()
                   rejects with err.offline = true when Google can't be reached
   The local view = synced tables (Google's last snapshot) + conflicted changes + pending changes, applied in that
   order. Every write the engine makes is captured as row changes and appended to pending. */
(function (root) {
'use strict';

const REF_TABLE = { category_id: 'categories', account_id: 'accounts', to_account_id: 'accounts', person_id: 'people',
  owner_id: 'people', borrower_id: 'people', loan_id: 'loans', savings_id: 'savings_places', place_id: 'savings_places',
  event_id: 'events' };
const URL_TABLE = [[/^\/api\/ledger\/recurring\/(-\d+)(\/|$)/, 'recurring'], [/^\/api\/ledger\/(-\d+)(\/|$)/, 'entries'],
  [/^\/api\/setup\/([a-z_]+)\/(-\d+)$/, null], [/^\/api\/loans\/(-\d+)(\/|$)/, 'loans'], [/^\/api\/savings\/(-\d+)(\/|$)/, 'savings_places']];
const FIELD_LABEL = { date: 'Date', type: 'Type', category_id: 'Category', description: 'Description', amount: 'Amount',
  person_id: 'By', method: 'Paid via', account_id: 'Account', to_account_id: 'To account', loan_id: 'Loan',
  loan_part: 'Loan part', savings_id: 'Savings', status: 'Status', note: 'Note', name: 'Name', owner_id: 'Owner',
  borrower_id: 'Borrower', place_id: 'Savings place', value: 'Value', budget: 'Budget', active: 'Active', month: 'Month',
  frequency: 'How often', day: 'Day', start_month: 'From month', end_month: 'Until month', kind: 'Kind', rate: 'Rate',
  principal: 'Amount borrowed', emi_amount: 'EMI', opening_balance: 'Opening balance', credit_limit: 'Credit limit',
  event_id: 'Event', start_date: 'From', end_date: 'Until' };
const TABLE_WORD = { entries: 'Entry', people: 'Person', accounts: 'Account', categories: 'Category', loans: 'Loan',
  loan_stages: 'Loan stage', loan_rates: 'Rate change', savings_places: 'Savings place', savings_values: 'Value update',
  recurring: 'Recurring item', planned_items: 'Bomb', events: 'Event', settings: 'Setting' };
const CHOICES = { field: ['mine', 'theirs'], duplicate: ['one', 'both'], deleted_theirs: ['keep', 'delete'],
  edited_theirs: ['theirs', 'delete'] };

const MAX_TRIES = 5;           // a change Google refuses this many times is set aside (meta.dropped)
const clone = v => (v === undefined || v === null ? v : JSON.parse(JSON.stringify(v)));
const same = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);
const keyCol = table => (table === 'settings' ? 'key' : 'id');
const keyEq = (a, b) => String(a) === String(b);
function uuid() {
  const c = typeof crypto !== 'undefined' ? crypto : null;
  if (c && c.randomUUID) return c.randomUUID();
  return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

/** A captured row (database shape: settings.value is JSON text) -> the export shape the tables are kept in. */
function toExport(table, row) {
  if (!row || table !== 'settings') return row;
  let v = row.value;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { /* keep the text */ } }
  return { key: row.key, value: v };
}
/** The reverse, for changes made here from an exported row (resolve). */
function toDb(table, row) {
  if (!row || table !== 'settings') return row;
  return { key: row.key, value: typeof row.value === 'string' ? row.value : JSON.stringify(row.value === undefined ? null : row.value) };
}

/** Applies one change to export-shaped tables, field by field (only what this change altered). */
function applyChange(tables, ch) {
  const list = tables[ch.table] || (tables[ch.table] = []);
  const kc = keyCol(ch.table);
  const i = list.findIndex(r => keyEq(r[kc], ch.key));
  const after = toExport(ch.table, ch.after), before = toExport(ch.table, ch.before);
  if (!after) {                                                    // delete
    if (i >= 0) list.splice(i, 1);
    return;
  }
  if (!before) {                                                   // insert
    if (i >= 0) list[i] = clone(after);
    else list.push(clone(after));
    return;
  }
  if (i < 0) return;                                               // update of a row that is gone
  const row = list[i];
  Object.keys(after).forEach(f => { if (!same(after[f], before[f])) row[f] = clone(after[f]); });
}

function create(opts) {
  const store = opts.store;
  const Engine = opts.engine;
  const send = opts.send;
  const isOnline = opts.isOnline || (() => true);
  const autoSync = opts.autoSync !== false;
  const now = opts.now || (() => new Date());

  let meta = null;               // {person, seq, lastSync, device}
  let synced = null;             // tables as Google last sent them
  let pending = [];              // [{cid, at, table, key, before, after}]
  let conflicts = [];            // [{id, kind, change, info}]
  let engine = null;
  let names = null;              // lookups for labels, rebuilt with the engine
  const recentIds = {};          // temp id -> real id from recent syncs (a page may still hold a temp id)
  const st = { online: true, syncing: false, error: null };
  const listeners = new Set();
  let flight = null, again = false, timer = null, saveTimer = null, savingParts = {};
  let sendingIds = null;         // the cids of the sync now in flight (never folded into)

  const emit = () => { listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } }); if (opts.onChange) opts.onChange(); };

  function persist(parts, soon) {
    Object.assign(savingParts, parts);
    clearTimeout(saveTimer);
    const run = () => {
      const p = savingParts;
      savingParts = {};
      return store.save(p).catch(e => { console.error('RuPeace: could not save the copy on this device', e); });
    };
    if (soon) { saveTimer = setTimeout(run, 250); return Promise.resolve(); }
    return run();
  }

  function view() {
    const t = clone(synced) || {};
    conflicts.forEach(c => { if (c.change) applyChange(t, c.change); });
    pending.forEach(c => applyChange(t, c));
    return t;
  }

  function rebuild() {
    engine = Engine.create(view(), { person: meta && meta.person });
    names = null;
  }

  function lookups() {
    if (names) return names;
    const t = engine ? engine.tables() || {} : {};
    const m = tbl => { const x = new Map(); (t[tbl] || []).forEach(r => x.set(String(r.id), r)); return x; };
    names = { categories: m('categories'), accounts: m('accounts'), people: m('people'), loans: m('loans'),
      savings_places: m('savings_places'), tables: t };
    return names;
  }

  // ------------------------------------------------------------------ temp ids from earlier syncs
  function mapId(table, v) {
    const m = recentIds[table];
    if (m && typeof v === 'number' && v < 0 && m[String(v)] !== undefined) return m[String(v)];
    if (m && typeof v === 'string' && /^-\d+$/.test(v) && m[v] !== undefined) return m[v];
    return v;
  }
  function mapUrl(url) {
    const qi = url.indexOf('?');
    let path = qi < 0 ? url : url.slice(0, qi);
    const rest = qi < 0 ? '' : url.slice(qi);
    for (const [re, tbl] of URL_TABLE) {
      const m = re.exec(path);
      if (!m) continue;
      if (tbl === null) {
        const real = mapId(m[1], m[2]);
        if (real !== m[2]) path = '/api/setup/' + m[1] + '/' + real;
      } else {
        const real = mapId(tbl, m[1]);
        if (real !== m[1]) path = path.replace(m[1], String(real));
      }
      break;
    }
    return path + rest;
  }
  function mapBody(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
    let out = body;
    Object.keys(REF_TABLE).forEach(f => {
      const v = body[f];
      const real = mapId(REF_TABLE[f], v);
      if (real !== v) { if (out === body) out = Object.assign({}, body); out[f] = real; }
    });
    return out;
  }
  /** Rewrites temp ids in a change with Google's real ones. */
  function remap(ch, idmap) {
    const one = (tbl, v) => {
      const m = idmap[tbl];
      return m && v !== null && v !== undefined && m[String(v)] !== undefined ? m[String(v)] : v;
    };
    const ref = v => {                                     // 'rec:<recurring id>:<month>' (entries.source_ref)
      const m = /^rec:(-\d+):(.*)$/.exec(String(v)), b = /^one:(-\d+)$/.exec(String(v));
      return m ? 'rec:' + one('recurring', Number(m[1])) + ':' + m[2] : b ? 'one:' + one('planned_items', Number(b[1])) : v;
    };
    ch.key = one(ch.table, ch.key);
    [ch.before, ch.after].forEach(r => {
      if (!r) return;
      if (r.id !== undefined) r.id = one(ch.table, r.id);
      Object.keys(REF_TABLE).forEach(f => { if (r[f] !== undefined) r[f] = one(REF_TABLE[f], r[f]); });
      if (ch.table === 'entries' && typeof r.source_ref === 'string') r.source_ref = ref(r.source_ref);
      if (ch.table === 'settings' && r.key === 'ledger_dismissed' && typeof r.value === 'string' && /rec:-/.test(r.value)) {
        try { r.value = JSON.stringify((JSON.parse(r.value) || []).map(ref)); } catch (e) { /* leave it */ }
      }
    });
  }

  // ------------------------------------------------------------------ changes
  /** Adds captured changes, folding them into a waiting change for the same row when that one isn't being sent. */
  function addChanges(list, sending) {
    const at = now().toISOString();
    list.forEach(raw => {
      const ch = { cid: uuid(), at, table: raw.table, key: raw.key, before: clone(raw.before), after: clone(raw.after) };
      let k = -1;
      for (let j = pending.length - 1; j >= 0; j--) if (pending[j].table === ch.table && keyEq(pending[j].key, ch.key)) { k = j; break; }
      const prev = k >= 0 ? pending[k] : null;
      if (!prev || (sending && sending.has(prev.cid))) { pending.push(ch); return; }
      if (!prev.before && !ch.after) { pending.splice(k, 1); return; }          // made here and deleted again
      if (!ch.after) { prev.after = null; prev.at = at; return; }               // changed, then deleted
      if (!prev.after) { pending.push(ch); return; }                            // deleted, then made again
      prev.after = ch.after;                                                    // insert/update, then update
      prev.at = at;
      if (prev.before && same(prev.before, prev.after)) pending.splice(k, 1);   // changed back: nothing to send
    });
  }

  function tempId(table) {
    const t = view()[table] || [];
    let m = 0;
    t.forEach(r => { if (typeof r.id === 'number' && r.id < m) m = r.id; });
    pending.forEach(c => { if (c.table === table && typeof c.key === 'number' && c.key < m) m = c.key; });
    return m - 1;
  }

  // ------------------------------------------------------------------ sync
  function scheduleSync(ms) {
    if (!autoSync) return;
    clearTimeout(timer);
    timer = setTimeout(() => { timer = null; sync().catch(() => {}); }, ms == null ? 1000 : ms);
  }

  /** One POST /api/sync. Resolves {ok, changed} (changed: the local view is different now); never rejects. */
  function sync() {
    if (!meta) return Promise.resolve({ ok: false, changed: false });
    if (flight) { again = true; return flight; }
    flight = run().finally(() => {
      flight = null;
      if (again) { again = false; scheduleSync(50); }
    });
    return flight;
  }

  async function run() {
    if (!isOnline()) { st.online = false; emit(); return { ok: false, changed: false, offline: true }; }
    const sending = pending.slice();
    const sentIds = new Set(sending.map(c => c.cid));
    sendingIds = sentIds;
    st.syncing = true;
    st.online = true;                                          // trying: "Syncing…", back to offline if the trip fails
    emit();
    let res;
    try {
      res = await send({ device: meta.device, since: meta.seq || 0, changes: sending.map(c => clone(c)) });
    } catch (e) {
      st.syncing = false;
      sendingIds = null;
      if (e && e.offline) { st.online = false; st.error = null; }
      else { st.online = isOnline(); st.error = (e && e.message) || String(e); }
      emit();
      return { ok: false, changed: false, offline: !!(e && e.offline) };
    }
    st.syncing = false;
    sendingIds = null;
    if (!res || !res.ok) {
      st.online = true;
      st.error = (res && res.error) || 'Google did not answer the sync.';
      emit();
      if (res && res.signin && opts.onSignIn) opts.onSignIn();
      return { ok: false, changed: false, signin: !!(res && res.signin) };
    }
    return absorb(res.data || {}, sentIds, sending);
  }

  /** Takes Google's answer to a sync: new snapshot, real ids, conflicts, duplicates. */
  function absorb(d, sentIds, sending) {
    const before = engine ? JSON.stringify(engine.tables()) : '';
    const idmap = d.idmap || {};
    const applied = new Set(d.applied || []);
    const byCid = new Map(sending.map(c => [c.cid, c]));
    Object.keys(idmap).forEach(t => {
      recentIds[t] = Object.assign(recentIds[t] || {}, idmap[t]);
    });
    const fresh = [];
    (d.conflicts || []).forEach(c => {
      const ch = byCid.get(c.cid);
      fresh.push({ id: c.cid, kind: c.kind, change: ch ? clone(ch) : null, info: c });
      applied.add(c.cid);                                    // handled: it waits as a conflict, not as pending
    });
    (d.duplicates || []).forEach(dup => {
      fresh.push({ id: 'dup:' + dup.cid, kind: 'duplicate', change: null, info: dup,
        mine: (() => { const ch = byCid.get(dup.cid); return ch ? clone(ch.after) : null; })() });
    });
    // a change Google could not apply (errors) stays waiting and is tried again; after MAX_TRIES it is set aside
    const refused = new Map((d.errors || []).map(x => [x.cid, x.error]));
    const dropped = [];
    pending = pending.filter(c => {
      if (!sentIds.has(c.cid)) return true;
      if (applied.has(c.cid)) return false;
      c.tries = (c.tries || 0) + 1;
      c.error = refused.get(c.cid) || c.error || 'Google did not take this change';
      if (c.tries >= MAX_TRIES) { dropped.push(c); return false; }
      return true;
    });
    if (dropped.length) meta.dropped = (meta.dropped || []).concat(dropped).slice(-50);
    if (Object.keys(idmap).length) {
      pending.forEach(c => remap(c, idmap));
      conflicts.forEach(c => { if (c.change) remap(c.change, idmap); });
      fresh.forEach(c => { if (c.change) remap(c.change, idmap); if (c.mine) remap({ table: c.info.table, key: 0, before: null, after: c.mine }, idmap); });
    }
    conflicts = conflicts.concat(fresh);
    if (d.tables) synced = d.tables;
    else {                                                     // no snapshot: keep what Google took, here
      sending.forEach(c => { if (applied.has(c.cid) && !fresh.some(f => f.id === c.cid)) { const x = clone(c); remap(x, idmap); applyChange(synced, x); } });
    }
    meta.seq = d.seq != null ? d.seq : meta.seq;
    meta.lastSync = now().toISOString();
    st.online = true;
    const stuckList = pending.filter(c => sentIds.has(c.cid));
    const stuck = stuckList.length;
    st.error = stuck ? (stuck > 1 ? stuck + ' changes' : 'A change') + ' could not be saved to Google: ' + stuckList[0].error
      : dropped.length ? (dropped.length > 1 ? dropped.length + ' changes were' : 'A change was') + ' refused by Google and set aside: ' + dropped[0].error
      : null;
    rebuild();
    const changed = before !== JSON.stringify(engine.tables());
    const parts = { meta, pending, conflicts };
    if (d.tables) parts.synced = synced;
    persist(parts);
    emit();
    if (opts.onSynced) opts.onSynced(changed);
    if (pending.length > stuck) scheduleSync(1000);           // made while this sync was on its way
    return { ok: true, changed };
  }

  // ------------------------------------------------------------------ conflicts for the UI
  function nameOf(field, v) {
    const L = lookups();
    const tbl = REF_TABLE[field];
    if (tbl && v !== null && v !== undefined && v !== '') {
      const r = L[tbl] && L[tbl].get(String(v));
      return r ? r.name : '#' + v;
    }
    return v;
  }
  function text(field, v) {
    if (v === null || v === undefined || v === '') return '—';
    if (REF_TABLE[field]) return String(nameOf(field, v));
    if (typeof v === 'number' && /amount|balance|value|budget|limit|principal|emi/.test(field)) {
      return '₹' + v.toLocaleString('en-IN', { maximumFractionDigits: 2 });
    }
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }
  function rowLabel(table, row, key) {
    if (!row) return (TABLE_WORD[table] || table) + ' ' + key;
    if (table === 'entries') {
      const what = row.description || nameOf('category_id', row.category_id) || cap(row.type || 'entry');
      return [what, row.amount != null ? text('amount', row.amount) : '', row.date || ''].filter(Boolean).join(' · ');
    }
    if (table === 'settings') return 'Setting: ' + row.key;
    return row.name || row.label || row.description || ((TABLE_WORD[table] || table) + ' ' + key);
  }
  const cap = s => String(s).charAt(0).toUpperCase() + String(s).slice(1);
  const label = f => FIELD_LABEL[f] || cap(String(f).replace(/_id$/, '').replace(/_/g, ' '));
  const field = (name, mine, theirs) => ({ name, label: label(name), mine, theirs, mine_text: text(name, mine), theirs_text: text(name, theirs) });
  const personName = id => (id === null || id === undefined || id === '' ? '' : String(nameOf('person_id', id)));
  function syncedRow(table, key) {
    const r = ((synced || {})[table] || []).find(x => keyEq(x[keyCol(table)], key));
    return r ? clone(r) : null;
  }

  function describe(c) {
    const info = c.info || {};
    const table = info.table || (c.change && c.change.table);
    const key = info.key !== undefined ? info.key : c.change && c.change.key;
    const out = { id: c.id, kind: c.kind, table, key, label: '', fields: [], mine_at: c.change ? c.change.at : null,
      theirs_at: info.theirs_at || info.of_at || null, theirs_by_name: '', choices: CHOICES[c.kind] || ['mine', 'theirs'],
      suggestion: null, reason: '' };
    const mineRow = c.change ? toExport(table, c.change.after || c.change.before) : null;
    if (c.kind === 'field') {
      out.label = rowLabel(table, toExport(table, info.theirs) || mineRow, key);
      out.fields = (info.fields || []).map(f => field(f.name, f.mine, f.theirs));
      out.theirs_by_name = personName(info.theirs_by);
      const mineNewer = !out.theirs_at || (out.mine_at && out.mine_at > out.theirs_at);
      out.suggestion = mineNewer ? 'mine' : 'theirs';
      out.reason = mineNewer ? 'Yours is the newer change' : 'Their change is newer';
    } else if (c.kind === 'duplicate') {
      const other = syncedRow(table, info.of);
      const mine = c.mine || syncedRow(table, key);
      out.label = rowLabel(table, mine, key);
      out.mine_at = c.mine && mine ? (mine.created_at || null) : out.mine_at;
      out.fields = ['date', 'amount', 'category_id', 'description', 'person_id', 'method', 'account_id']
        .filter(f => (mine && mine[f] != null && mine[f] !== '') || (other && other[f] != null && other[f] !== ''))
        .map(f => field(f, mine ? mine[f] : null, other ? other[f] : null));
      out.theirs_by_name = personName(info.of_by);
      out.suggestion = 'one';
      out.reason = 'Looks like the same expense';
    } else if (c.kind === 'deleted_theirs') {                 // I changed it, they deleted it
      const ch = c.change || {};
      out.label = rowLabel(table, mineRow, key);
      out.fields = Object.keys(ch.after || {}).filter(f => f !== 'id' && ch.before && !same(ch.after[f], ch.before[f]))
        .map(f => field(f, ch.after[f], null));
      out.theirs_by_name = personName(info.theirs_by);
      out.suggestion = 'keep';
      out.reason = 'They deleted it, but you had changed it: bring it back with your changes';
    } else if (c.kind === 'edited_theirs') {                  // I deleted it, they changed it
      const ch = c.change || {};
      const theirs = toExport(table, info.theirs) || syncedRow(table, key);
      out.label = rowLabel(table, theirs || toExport(table, ch.before), key);
      out.fields = Object.keys(theirs || {}).filter(f => f !== 'id' && ch.before && !same(theirs[f], ch.before[f]))
        .map(f => field(f, ch.before[f], theirs[f]));
      out.theirs_by_name = personName(info.theirs_by);
      out.suggestion = 'theirs';
      out.reason = 'Keep their edit';
    }
    return out;
  }

  /** Turns a person's choice into changes (made against Google's latest copy) and syncs them. */
  async function resolve(id, choice) {
    const i = conflicts.findIndex(c => c.id === id);
    if (i < 0) throw new Error('That clash was already sorted out.');
    const c = conflicts[i];
    const allowed = CHOICES[c.kind] || [];
    if (allowed.indexOf(choice) < 0) throw new Error('Pick one of: ' + allowed.join(', '));
    const info = c.info || {};
    const table = info.table || (c.change && c.change.table);
    const key = info.key !== undefined ? info.key : c.change && c.change.key;
    const kc = keyCol(table);
    const out = [];
    const cur = syncedRow(table, key);
    if (c.kind === 'field' && choice === 'mine' && cur) {
      const after = Object.assign({}, cur);
      (info.fields || []).forEach(f => { after[f.name] = f.mine; });
      out.push({ table, key, before: toDb(table, cur), after: toDb(table, after) });
    } else if (c.kind === 'duplicate' && choice === 'one' && cur) {
      out.push({ table, key, before: toDb(table, cur), after: null });
    } else if (c.kind === 'deleted_theirs' && choice === 'keep' && c.change && c.change.after) {
      const row = Object.assign({}, c.change.after);
      const nk = kc === 'id' ? tempId(table) : row[kc];
      if (kc === 'id') row.id = nk;
      out.push({ table, key: nk, before: null, after: row });
    } else if (c.kind === 'edited_theirs' && choice === 'delete' && cur) {
      out.push({ table, key, before: toDb(table, cur), after: null });
    }
    conflicts.splice(i, 1);
    addChanges(out, sendingIds);
    rebuild();
    await persist({ pending, conflicts });
    emit();
    if (opts.onSynced) opts.onSynced(true);
    if (out.length || conflicts.length === 0) await sync();
    return { ok: true };
  }

  // ------------------------------------------------------------------ public
  return {
    /** Loads this device's copy. Resolves true when there is one. */
    async load() {
      const s = await store.load();
      if (!s || !s.meta || !s.synced) return false;
      meta = s.meta;
      synced = s.synced;
      pending = s.pending || [];
      conflicts = s.conflicts || [];
      rebuild();
      emit();
      return true;
    },
    has() { return !!(meta && synced && engine); },
    person() { return meta ? meta.person : null; },
    /** First run (or another person signed in): everything from Google. sendFirst({since: 0, changes: []}). */
    async pull(person, res) {
      const d = res && res.data ? res.data : res;
      if (!d || !d.tables) throw new Error('Google sent no data.');
      meta = { person: person == null ? null : Number(person), seq: d.seq || 0, lastSync: now().toISOString(), device: (meta && meta.device) || uuid() };
      synced = d.tables;
      pending = [];
      conflicts = [];
      rebuild();
      await persist({ meta, synced, pending, conflicts });
      st.online = true;
      st.error = null;
      emit();
    },
    device() { return (meta && meta.device) || null; },
    newDevice() { return uuid(); },
    setPerson(p) { if (meta) { meta.person = Number(p); persist({ meta }); if (engine) engine.setPerson(p); } },
    /** Answers one /api/... call from the copy on this device. Writes become waiting changes. */
    api(method, url, body) {
      if (!engine) return { ok: false, error: 'This device has no copy of the data yet.' };
      const res = engine.api(method, mapUrl(url), mapBody(body));
      if (res.ok && res.changes && res.changes.length) {
        addChanges(res.changes, sendingIds);
        names = null;
        persist({ pending }, true);
        emit();
        scheduleSync(1000);
      }
      return res;
    },
    sync,
    scheduleSync,
    status() {
      return { online: !!(st.online && isOnline()), syncing: st.syncing, pending: pending.length,
        lastSync: (meta && meta.lastSync) || null, conflicts: conflicts.length, error: st.error };
    },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    isPending(table, id) {
      if (typeof id === 'number' ? id < 0 : /^-\d+$/.test(String(id))) return true;
      const hit = c => c && c.table === table && keyEq(c.key, id);
      return pending.some(hit) || conflicts.some(c => hit(c.change));
    },
    conflicts() { return conflicts.map(describe); },
    /** The real id of a row made offline (temporary negative id) once a sync has sent it; else the id itself. */
    realId(table, id) { return mapId(table, id); },
    resolve,
    syncNow() { return sync(); },
    tables() { return engine ? engine.tables() : null; },
    pending() { return clone(pending); },
    rawConflicts() { return clone(conflicts); },
    setOffline() { st.online = false; emit(); },
    async clear() {
      clearTimeout(timer);
      clearTimeout(saveTimer);
      savingParts = {};
      meta = null; synced = null; pending = []; conflicts = []; engine = null; names = null;
      st.error = null;
      await store.clear();
      emit();
    },
  };
}

const api = { create, applyChange, toExport, CHOICES };
root.RPLocal = api;
if (typeof module !== 'undefined' && module.exports) module.exports.RPLocal = api;
})(typeof window !== 'undefined' ? window : globalThis);
