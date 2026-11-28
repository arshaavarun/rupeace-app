/* RuPeace — shared core of the app's screens (window.App): formatting, icons, API, dialogs, theme, bottom sheet, router.
   The screens themselves: phone.js, phone-settings.js, phone-worth.js. */
(function () {
'use strict';
const App = window.App = {};
const pages = {};
let current = null;

/* ---------- formatting ---------- */
const MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
App.MN = MN;
App.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
App.inr = v => { const r = Math.round(Number(v) || 0); return (r < 0 ? '−' : '') + '₹' + Math.abs(r).toLocaleString('en-IN'); };
/* Indian grouping on a typed amount: '1250000' -> '12,50,000', '-4500.5' -> '-4,500.5' (two decimals at most) */
const groupIn = i => (i.length <= 3 ? i : i.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + i.slice(-3));
App.groupINR = s => {
  s = String(s == null ? '' : s); const neg = /^\s*[-−]/.test(s); s = s.replace(/[^\d.]/g, '');
  const k = s.indexOf('.'); let i = k < 0 ? s : s.slice(0, k); const f = k < 0 ? null : s.slice(k + 1).replace(/\./g, '').slice(0, 2);
  i = i.replace(/^0+(?=\d)/, '');
  const out = (i ? groupIn(i) : f !== null ? '0' : '') + (f !== null ? '.' + f : '');
  return (neg ? '-' : '') + out;
};
/* every box for an amount (data-money) gets its commas as you type, the cursor staying where it was */
document.addEventListener('input', e => {
  const i = e.target;
  if (!(i instanceof HTMLInputElement) || !i.hasAttribute('data-money')) return;
  const pos = i.selectionStart == null ? i.value.length : i.selectionStart, before = i.value.slice(0, pos).replace(/[^\d.\-]/g, '').length;
  const v = App.groupINR(i.value);
  if (v === i.value) return;
  i.value = v;
  let n = 0, p = 0; while (p < v.length && n < before) { if (/[\d.\-]/.test(v[p])) n++; p++; }
  try { i.setSelectionRange(p, p); } catch (ex) { /* not a text box */ }
}, true);
App.lakh = (v, dp = 2) => { v = Number(v) || 0; if (Math.abs(v) < 1e5) return App.inr(v); const a = Math.abs(v); return (v < 0 ? '−' : '') + '₹' + (a >= 1e7 ? (a / 1e7).toFixed(2) + ' Cr' : (a / 1e5).toFixed(dp) + 'L'); };
App.money = v => (Math.abs(Number(v) || 0) >= 1e5 ? App.lakh(v) : App.inr(v));   // ₹7,500 · ₹1.25L · ₹1.53 Cr
App.dmy = iso => { if (!iso) return ''; const [y, m, d] = iso.slice(0, 10).split('-'); return d + '-' + m + '-' + y; };
App.date = iso => { if (!iso) return ''; const [y, m, d] = iso.slice(0, 10).split('-').map(Number); return d + ' ' + MN[m - 1] + ' ' + y; };
App.month = ym => { if (!ym) return ''; const [y, m] = ym.split('-').map(Number); return MN[m - 1] + ' ' + y; };
App.today = () => (App.opt && App.opt.today) || new Date().toISOString().slice(0, 10);
App.ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
App.monthStart = iso => iso.slice(0, 7) + '-01';
App.monthEnd = iso => { const [y, m] = iso.split('-').map(Number); return App.ymd(new Date(y, m, 0)); };
App.addMonths = (ym, n) => { const [y, m] = ym.split('-').map(Number); const i = y * 12 + m - 1 + n; return Math.floor(i / 12) + '-' + String(i % 12 + 1).padStart(2, '0'); };
App.label = s => String(s || '').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
/* When in the month a recurring row comes (its "day"): 1-31 a fixed day, 32 the last day, 40 the first working day,
   41 the last working day (Monday to Friday), 100 + n*10 + w the n-th weekday w (n 1-4, 5 = last; w 0 Sun .. 6 Sat).
   The same codes as google/server/ledger.js recDayOf_. App.dayRule.mount(host, code, onChange) draws the picker. */
const WDS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], WDL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const NTH = ['', 'first', 'second', 'third', 'fourth', 'last'], NTHS = ['', '1st', '2nd', '3rd', '4th', 'Last'];
const drParse = c => {
  c = Math.round(Number(c)) || 1;
  if (c >= 1 && c <= 31) return { k: 'day', d: c };
  if (c === 32) return { k: 'end' };
  if (c === 40) return { k: 'fwd' };
  if (c === 41) return { k: 'lwd' };
  const n = Math.floor((c - 100) / 10), w = c % 10;
  if (c > 100 && n >= 1 && n <= 5 && w <= 6) return { k: 'wk', n, w };
  return { k: 'day', d: 1 };
};
const drCode = r => (r.k === 'day' ? Math.min(31, Math.max(1, Math.round(Number(r.d) || 1))) : r.k === 'end' ? 32 : r.k === 'fwd' ? 40 : r.k === 'lwd' ? 41 : 100 + (r.n || 1) * 10 + (r.w == null ? 1 : r.w));
App.dayRule = {
  parse: drParse, code: drCode,
  /** 'on day 5' · 'on the last working day' · 'on the first Tuesday' */
  label: c => { const r = drParse(c); return r.k === 'day' ? 'on day ' + r.d : r.k === 'end' ? 'on the last day' : r.k === 'fwd' ? 'on the first working day' : r.k === 'lwd' ? 'on the last working day' : 'on the ' + NTH[r.n] + ' ' + WDL[r.w]; },
  /** the day of the month it falls on in month mo (1-12) of year y */
  dayIn: (c, y, mo) => {
    const dim = new Date(y, mo, 0).getDate(), dow = d => new Date(y, mo - 1, d).getDay(), r = drParse(c);
    if (r.k === 'day') return Math.min(r.d, dim);
    if (r.k === 'end') return dim;
    if (r.k === 'fwd' || r.k === 'lwd') { let d = r.k === 'fwd' ? 1 : dim; while (dow(d) === 0 || dow(d) === 6) d += r.k === 'fwd' ? 1 : -1; return d; }
    if (r.n === 5) { let d = dim; while (dow(d) !== r.w) d--; return d; }
    let d = 1; while (dow(d) !== r.w) d++;
    return Math.min(d + (r.n - 1) * 7, dim);
  },
  mount(host, code, onChange) {
    let r = drParse(code);
    const chip = (attr, val, label, on) => '<button type="button" class="pchip" ' + attr + '="' + val + '" aria-pressed="' + !!on + '">' + label + '</button>';
    const draw = () => {
      host.innerHTML = '<div class="ph-wrap dr-kinds">' + [['day', 'A fixed day'], ['fwd', 'First working day'], ['lwd', 'Last working day'], ['end', 'Last day'], ['wk', 'A weekday']]
        .map(([k, l]) => chip('data-drk', k, l, r.k === k)).join('') + '</div>' +
        (r.k === 'day' ? '<div class="dr-day"><span>Day</span><input type="text" inputmode="numeric" maxlength="2" data-drd value="' + r.d + '" aria-label="Day of the month"><span>of the month</span></div>' : '') +
        (r.k === 'wk' ? '<div class="ph-wrap dr-row">' + [1, 2, 3, 4, 5].map(n => chip('data-drn', n, NTHS[n], r.n === n)).join('') + '</div>' +
          '<div class="ph-wrap dr-row">' + [1, 2, 3, 4, 5, 6, 0].map(w => chip('data-drw', w, WDS[w], r.w === w)).join('') + '</div>' : '') +
        '<div class="dr-say">Comes ' + App.esc(App.dayRule.label(drCode(r))) + (r.k === 'fwd' || r.k === 'lwd' ? ' (Monday to Friday)' : '') + '</div>';
    };
    const set = x => { r = Object.assign(r, x); draw(); if (onChange) onChange(drCode(r)); };
    host.addEventListener('click', e => {
      const k = e.target.closest('[data-drk]'); if (k) return set(k.dataset.drk === 'wk' ? { k: 'wk', n: r.n || 1, w: r.w == null ? 1 : r.w } : k.dataset.drk === 'day' ? { k: 'day', d: r.d || 1 } : { k: k.dataset.drk });
      const n = e.target.closest('[data-drn]'); if (n) return set({ n: Number(n.dataset.drn) });
      const w = e.target.closest('[data-drw]'); if (w) return set({ w: Number(w.dataset.drw) });
    });
    host.addEventListener('input', e => {
      if (!e.target.matches('[data-drd]')) return;
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 2);
      const d = Number(e.target.value);
      if (d >= 1 && d <= 31) { r.d = d; host.querySelector('.dr-say').textContent = 'Comes ' + App.dayRule.label(drCode(r)); if (onChange) onChange(drCode(r)); }
    });
    draw();
    if (onChange) onChange(drCode(r));
    return { get code() { return drCode(r); } };
  },
};

/* ---------- icons: one set of line icons (24px grid, drawn in currentColor) ---------- */
const ICO = {
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>', down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  grid: '<rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/>',
  paperplane: '<path d="M21.5 3 2.5 10.5l7 2.5 2.5 7z"/><path d="M21.5 3 9.5 13"/>',
  bomb: '<path d="M12 2l1.8 4.6 4.7-1.9-1.9 4.7L21.2 12l-4.6 1.8 1.9 4.7-4.7-1.9L12 21.2l-1.8-4.6-4.7 1.9 1.9-4.7L2.8 12l4.6-1.8-1.9-4.7 4.7 1.9z"/><circle cx="12" cy="12" r="2.5"/>',   // Bombs: the boom (approved 4)
  basket: '<path d="M4 10h16l-1.6 9.2a1 1 0 0 1-1 .8H6.6a1 1 0 0 1-1-.8z"/><path d="M8.5 10 12 4l3.5 6M9 14v3M12 14v3M15 14v3"/>',
  home: '<path d="M4 11 12 4l8 7"/><path d="M6 9.5V20h12V9.5"/><path d="M10 20v-5h4v5"/>',
  book: '<path d="M4 5h6a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H4zM20 5h-6a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h6z"/>',
  kid: '<circle cx="12" cy="13" r="7"/><path d="M9.5 12h.01M14.5 12h.01M10 16c1.2.8 2.8.8 4 0M12 6c0-1.5 1-2 2-2"/>',
  medical: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8.5v7M8.5 12h7"/>',
  fuel: '<path d="M5 20V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v14M3.5 20h13M5 10h10"/><path d="m15 8 3 3v6a1.5 1.5 0 0 0 3 0v-7l-3-3"/>',
  food: '<path d="M7 3v8a2 2 0 0 0 2 2v8M11 3v8M7 7h4M17 3c-2 2-2.5 6 0 8v10"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3 13h18"/>',
  laptop: '<rect x="5" y="5" width="14" height="10" rx="1.5"/><path d="M3 19h18"/>',
  trend: '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  bank: '<path d="M3 21h18M4 10h16M12 3l8 5H4z"/><path d="M6 10v8M10 10v8M14 10v8M18 10v8"/>',
  shield: '<path d="M12 3 20 6v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  plane: '<path d="M10.5 13.5 4 15.5v-2l6.5-4V5a1.5 1.5 0 0 1 3 0v4.5l6.5 4v2l-6.5-2V18l2 1.5V21L12 20l-3.5 1v-1.5l2-1.5z"/>',
  bag: '<path d="M6 8h12l-1 12H7z"/><path d="M9 8V7a3 3 0 0 1 6 0v1"/>',
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v8h14v-8M12 8v12M12 8C10 4 6.5 4.5 7.5 7.5M12 8c2-4 5.5-3.5 4.5-.5"/>',
  coin: '<ellipse cx="12" cy="7" rx="7" ry="3"/><path d="M5 7v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7M5 12v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  money: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6.5 9.5h.01M17.5 14.5h.01"/>',
  car: '<path d="M3 17v-4l2.2-5.2A1.5 1.5 0 0 1 6.6 7h10.8a1.5 1.5 0 0 1 1.4.8L21 13v4z"/><path d="M3 13h18"/><circle cx="7.5" cy="17" r="1.5"/><circle cx="16.5" cy="17" r="1.5"/>',
  tool: '<path d="M14.5 5.5a4 4 0 0 0 4.9 4.9L10 19.8a2.1 2.1 0 0 1-3-3l9.4-9.4"/>',
  film: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3z"/>',
  paw: '<circle cx="7" cy="10" r="1.6"/><circle cx="11" cy="6.5" r="1.6"/><circle cx="15" cy="6.5" r="1.6"/><circle cx="18" cy="10" r="1.6"/><path d="M12.5 11c-3 0-5.5 4-5.5 6a2 2 0 0 0 2.5 2c1-.3 2-.5 3-.5s2 .2 3 .5a2 2 0 0 0 2.5-2c0-2-2.5-6-5.5-6z"/>',
  heart: '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>',
  scroll: '<path d="M8 4h11v13a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-1h11v1"/><path d="M10 8h6M10 12h6"/>',
  sofa: '<path d="M5 11V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3"/><path d="M3 12a1.5 1.5 0 0 1 3 0v2h12v-2a1.5 1.5 0 0 1 3 0v5H3zM5 17v2M19 17v2"/>',
  building: '<path d="M4 21V5l8-2v18M12 8l8 3v10M3 21h18M7 8h2M7 12h2M7 16h2M15 13h2M15 17h2"/>',
  piggy: '<path d="M5 11.5a6 5 0 0 1 10.5-3.3H18l1 2h1.5v4H19l-1.5 2v2.3h-2.2V17h-5v1.5H8.1V16A5 5 0 0 1 5 11.5z"/><path d="M14.5 11h.01"/>',
  repeat: '<path d="M4 9h13l-3-3M20 15H7l3 3"/>',
  phone: '<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/>',
  card: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18M7 15h3"/>',
  wallet: '<path d="M4 7.5V18a2 2 0 0 0 2 2h13a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1H6a2 2 0 0 1-2-1.5zM4 7.5A2 2 0 0 1 6 6h10"/><path d="M16 14h.01"/>',
  percent: '<path d="M19 5 5 19"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M3 20h18"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="M12 12h.01"/>',
  family: '<circle cx="8" cy="7" r="2.5"/><circle cx="16" cy="7" r="2.5"/><path d="M3.5 20v-3.5A4.5 4.5 0 0 1 8 12a4.5 4.5 0 0 1 4 2.4A4.5 4.5 0 0 1 16 12a4.5 4.5 0 0 1 4.5 4.5V20"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8z"/><path d="M7.5 7.5h.01"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  save: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2"/>',
  palette: '<path d="M12 3a9 9 0 0 0 0 18c1.1 0 1.5-.8 1.5-1.5 0-1.2-1-1.5-1-2.5 0-.8.7-1.5 1.5-1.5H16a5 5 0 0 0 5-5c0-4.1-4-7.5-9-7.5z"/><path d="M7.5 11h.01M10 7h.01M15 7h.01"/>',
  cog: '<path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543.826-3.31 2.37-2.37 1 .608 2.296.07 2.572-1.065z"/><circle cx="12" cy="12" r="3"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  crane: '<path d="M6 21V5h12M6 5l3 4M18 5v4M16 9h4v3h-4zM4 21h6"/>',
  dot: '<circle cx="12" cy="12" r="3"/>',
};
/* App.ico(name, color): an inline line icon; color (optional) tints it, otherwise it takes the text colour */
App.ico = (name, color) => '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"' + (color ? ' style="--ic:' + color + '"' : '') + '>' + (ICO[name] || ICO.dot) + '</svg>';
const ICONS = [
  [/grocer|vegetable|supermarket|kirana|fruit/, 'basket'], [/rent/, 'home'], [/school|tuition|education|admission|book/, 'book'],
  [/kid|child|baby|toy|delivery/, 'kid'], [/medic|hospital|pharma|health|doctor|clinic/, 'medical'], [/fuel|petrol|diesel/, 'fuel'],
  [/eat|food|restaurant|dining|swiggy|zomato|snack|coffee|tea/, 'food'], [/mobile|phone|recharge/, 'phone'], [/salary|payroll|wage/, 'briefcase'], [/freelanc|client|invoice|consult/, 'laptop'],
  [/sip|mutual|invest|stock|share|equity/, 'trend'], [/ppf|epf|nps|pension|provident/, 'bank'], [/fd|deposit|rd\b/, 'bank'],
  [/emi|loan|mortgage/, 'bank'], [/insur/, 'shield'], [/travel|trip|flight|train|hotel|holiday/, 'plane'], [/shop|cloth|amazon|flipkart|myntra/, 'bag'],
  [/electric|power|utilit|water|gas|internet|wifi|broadband|bill/, 'bulb'], [/gift|festival|diwali|pongal/, 'gift'],
  [/gold|jewel|silver/, 'coin'], [/tax|gst|tds/, 'receipt'], [/interest|dividend|refund|bonus/, 'money'], [/cab|uber|ola|auto|transport|metro|bus/, 'car'],
  [/maint|repair|service/, 'tool'], [/movie|netflix|prime|entertain|subscription|ott/, 'film'], [/pet|vet/, 'paw'], [/charity|donat|temple/, 'heart'],
  [/stamp|registration|legal/, 'scroll'], [/interior|furniture|decor|moving/, 'sofa'], [/house|home|builder|flat/, 'building'], [/car|bike|vehicle/, 'car'],
];
const TYPE_ICON = { income: 'money', expense: 'receipt', savings: 'piggy', loan: 'bank', transfer: 'repeat' };
const HUES = ['#7466d4', '#c77aa8', '#3fb58a', '#e0a24f', '#4e9fd1', '#9a7fd8', '#dd7272', '#3aaea3', '#e08a5a', '#6a8fe0'];
App.hue = s => { let h = 0; for (const ch of String(s || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return HUES[h % HUES.length]; };
/* the icon for a category / row name, tinted with that name's colour (rows set the same colour on their tile) */
App.iconFor = (name, type) => { const n = String(name || '').toLowerCase(); const hit = ICONS.find(([re]) => re.test(n)); return App.ico(hit ? hit[1] : (TYPE_ICON[type] || 'dot'), App.hue(name)); };
/* ---------- API ---------- */
/* App.transport(method, url, body) -> Promise<data>: set by google/client/bridge.js (the copy on this phone, synced with Google). */
App.transport = null;
async function call(method, url, body) {
  if (!App.transport) throw new Error('The app is still starting. Try again in a moment.');
  return App.transport(method, url, body);
}
App.api = { get: u => call('GET', u), post: (u, b) => call('POST', u, b || {}), put: (u, b) => call('PUT', u, b || {}), del: u => call('DELETE', u) };
App.qs = o => Object.entries(o).filter(([, v]) => v !== '' && v != null).map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&');

/* ---------- lookups (people, accounts, categories, loans, savings places) ---------- */
let catsAsked = false;
App.loadOptions = async () => {
  App.opt = await App.api.get('/api/options');
  if (!catsAsked && App.opt.settings && App.opt.settings.cats_ready === false) {   // ready-to-use categories, once per family
    catsAsked = true;
    try { const r = await App.api.post('/api/categories/defaults', {}); if (r && r.added) App.opt = await App.api.get('/api/options'); }
    catch (e) { /* next time the app opens */ }
  }
  return App.opt;
};
const lst = (arr, pick, lab) => (arr || []).filter(x => x.active !== 0 && (!pick || pick(x))).map(x => ({ value: x.id, label: lab ? lab(x) : x.name }));
App.people = () => lst(App.opt.people);
App.accounts = pick => lst(App.opt.accounts, pick, a => a.name);
App.cards = () => App.accounts(a => a.kind === 'card');
App.categories = type => lst(App.opt.categories, c => !type || c.type === type);
App.loans = () => lst(App.opt.loans);
App.savingsPlaces = () => lst(App.opt.savings);
App.choices = name => (App.opt.choices[name] || []).map(v => ({ value: v, label: App.label(v) }));
App.nameOf = (kind, id) => { const x = (App.opt[kind] || []).find(r => r.id === Number(id)); return x ? x.name : ''; };
App.ensureCategory = async (name, type) => { const r = await App.api.post('/api/categories/ensure', { name, type }); if (r.created) await App.loadOptions(); return r.row.id; };

/* ---------- toast / confirm / form dialog ---------- */
let toastT;
App.toast = (msg, bad) => { const t = document.getElementById('toast'); t.innerHTML = '<span class="t-i" aria-hidden="true">' + (bad ? '!' : '✓') + '</span><span>' + App.esc(msg) + '</span>'; t.classList.toggle('bad', !!bad); t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), bad ? 3600 : 2400); };
App.fail = e => App.toast(e && e.message ? e.message : String(e), true);
/* Questions and small forms are bottom sheets like everything else (never the browser's own grey boxes).
   App.confirm(message, { okLabel, danger, title }) -> Promise<boolean> */
App.confirm = (message, { okLabel = 'OK', danger = false, title = 'Are you sure?', cancelLabel = 'Cancel' } = {}) => new Promise(resolve => {
  let yes = false;
  const d = App.bsheet({ title, cls: 'qa cf-sheet', focus: false, onClose: () => resolve(yes),
    body: '<p class="cf-msg">' + App.esc(message) + '</p>' +
      '<div class="qa-foot"><button type="button" class="btn" data-bs-close>' + App.esc(cancelLabel) + '</button>' +
      '<button type="button" class="btn ' + (danger ? 'danger' : 'primary') + '" data-ok>' + App.esc(okLabel) + '</button></div>' });
  d.querySelector('[data-ok]').onclick = () => { yes = true; d.close2(); };
});
/* A small form in a sheet. fields: [{name,label,type,value,options,required,full,hint}] -> Promise<values or null> */
App.form = ({ title, fields, submit = 'Save', onSubmit }) => new Promise(resolve => {
  let result = null;
  const body = fields.map(f => {
    const v = f.value == null ? '' : f.value, id = 'cf_' + f.name;
    const inp = f.type === 'select'
      ? '<select id="' + id + '" name="' + f.name + '">' + (f.required ? '' : '<option value=""></option>') + (f.options || []).map(o => '<option value="' + App.esc(o.value) + '"' + (String(o.value) === String(v) ? ' selected' : '') + '>' + App.esc(o.label) + '</option>').join('') + '</select>'
      : f.type === 'date' ? App.dateInput(' id="' + id + '" name="' + f.name + '"', v)
      : '<input id="' + id + '" name="' + f.name + '" type="text" autocomplete="off"' + (f.type === 'money' ? ' inputmode="decimal" data-money' : '') + ' value="' + App.esc(f.type === 'money' && v !== '' ? App.groupINR(v) : v) + '">';
    return '<div class="cf-f"><label class="qa-cap" for="' + id + '">' + App.esc(f.label) + '</label>' + inp + (f.hint ? '<div class="hint">' + App.esc(f.hint) + '</div>' : '') + '</div>';
  }).join('');
  const d = App.bsheet({ title, cls: 'qa cf-sheet', focus: false, onClose: () => resolve(result),
    body: '<form class="cf-form" novalidate>' + body + '<div class="qa-err" role="alert" data-err></div>' +
      '<div class="qa-foot"><button type="button" class="btn" data-bs-close>Cancel</button><button type="submit" class="btn primary">' + App.esc(submit) + '</button></div></form>' });
  const form = d.querySelector('form'), err = d.querySelector('[data-err]');
  form.onsubmit = async e => {
    e.preventDefault();
    const v = {};
    fields.forEach(f => { const el = form.elements[f.name], x = el ? el.value : '';
      v[f.name] = f.type === 'money' ? (String(x).trim() === '' ? '' : Number(String(x).replace(/[,₹\s]/g, ''))) : f.type === 'date' ? App.toIso(x) : x; });
    const miss = fields.find(f => f.required && (v[f.name] === '' || v[f.name] == null || (typeof v[f.name] === 'string' && !v[f.name].trim())));
    if (miss) { err.textContent = miss.label + ' is required'; return; }
    const bad = fields.find(f => f.type === 'money' && v[f.name] !== '' && !isFinite(v[f.name]));
    if (bad) { err.textContent = bad.label + ' must be a number'; return; }
    try { const r = onSubmit ? await onSubmit(v) : undefined; result = r === undefined || r === null ? v : r; d.close2(); }
    catch (ex) { err.textContent = ex.message; }
  };
  const first = form.querySelector('input:not([data-date]), select');
  if (first) setTimeout(() => first.focus(), 60);
});

/* Remember the month picked on Home and Activity (for this session). */
App.range = (key, def) => { try { const r = JSON.parse(sessionStorage.getItem('ff.range.' + key) || 'null'); if (r && r.from) return r; } catch (e) { /* ignore */ } return def || { from: App.monthStart(App.today()), to: App.monthEnd(App.today()) }; };
App.saveRange = (key, r) => { try { sessionStorage.setItem('ff.range.' + key, JSON.stringify(r)); } catch (e) { /* ignore */ } };

/* ---------- savings kinds ---------- */
const SAV_KINDS = { mutual_fund: 'Mutual fund', ppf: 'PPF', epf: 'EPF', nps: 'NPS', stocks: 'Stocks', fd: 'FD', rd: 'RD', gold: 'Gold', other: 'Other' };
App.savingsKinds = () => Object.keys(SAV_KINDS).map(k => ({ value: k, label: SAV_KINDS[k] }));

/* ---------- extra Settings screens added by other files (restore.js: restore a backup; bridge.js: PINs) ---------- */
App.settingsTabs = [];
App.settingsTab = (id, def) => { App.settingsTabs.push({ id, ...def }); App.settingsTabs.sort((a, b) => (a.order || 50) - (b.order || 50)); if (current === 'settings') App.refresh(); };

/* ---------- theme: Light · Dark · Follow phone (localStorage ff.theme = light | dark | auto) ---------- */
const THEMES = [['light', 'Light'], ['dark', 'Dark'], ['auto', 'Follow phone']];
const mqDark = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
App.themePref = () => { try { const v = localStorage.getItem('ff.theme'); return THEMES.some(t => t[0] === v) ? v : 'auto'; } catch (e) { return 'auto'; } };
App.applyTheme = () => {
  const p = App.themePref(), t = p === 'auto' ? (mqDark && mqDark.matches ? 'dark' : 'light') : p, root = document.documentElement;
  root.dataset.theme = t; root.dataset.themePref = p;
  document.querySelectorAll('[data-theme-seg] button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.themeSet === p)));
};
App.setTheme = p => { try { localStorage.setItem('ff.theme', p); } catch (e) { /* ignore */ } App.applyTheme(); };
App.themeSeg = () => '<div class="tseg" role="radiogroup" aria-label="Theme" data-theme-seg>' + THEMES.map(([k, l]) =>
  '<button type="button" role="radio" data-theme-set="' + k + '" aria-checked="' + (App.themePref() === k) + '">' + l + '</button>').join('') + '</div>';
if (mqDark) { if (mqDark.addEventListener) mqDark.addEventListener('change', App.applyTheme); else mqDark.addListener(App.applyTheme); }
document.addEventListener('click', e => { const b = e.target.closest('[data-theme-set]'); if (b) App.setTheme(b.dataset.themeSet); });
App.applyTheme();

/* ---------- screens, avatar menu, bottom sheet ---------- */
App.isPhone = () => true;        // the app only has the phone screens
/* App.phonePage(name, { title, render(el, ctx), after(el) }) — the screen for #/name. */
App.phonePage = (name, def) => { pages[name] = def; if (current === name) App.refresh(); };
App.me = () => { const id = App.opt && App.opt.me && App.opt.me.person_id; return id ? (App.opt.people || []).find(p => p.id === Number(id)) || null : null; };
const USER_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>';
/* the round button top right: the Google account's photo when signed in with Google (App.profile, google/client/bridge.js),
   otherwise the first letter of this person's name */
App.profile = null;
App.avatar = () => {
  const p = App.me(), pr = App.profile, name = (pr && pr.name) || (p && p.name) || '';
  const letter = name ? App.esc(name.trim().charAt(0).toUpperCase()) : USER_SVG;
  return '<button type="button" class="ph-av" data-avatar aria-label="' + App.esc((name ? name + ': ' : '') + 'menu, settings and theme') + '" title="Settings and theme">' +
    (pr && pr.photo ? '<img src="' + App.esc(pr.photo) + '" alt="" referrerpolicy="no-referrer" onerror="this.remove()">' : '') + '<span>' + letter + '</span></button>';
};
App.reduced = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
/* Bottom sheet (a <dialog>): App.bsheet({ title, body, cls, onClose, focus, dock }) -> dialog (d.close2() closes it). Tap outside or ✕ closes.
   dock: a sheet the + opened. It sits just above the bottom bar (not over it) and the + turns into its ✕.
   A closing sheet slides away for 0.2 s with data-closing set: look for open sheets with App.OPEN. */
App.OPEN = 'dialog[open]:not([data-closing])';
App.dockSync = () => { const b = document.querySelector('[data-bnav-add]'); if (!b) return; const x = !!document.querySelector('dialog.docked' + App.OPEN.slice(6)); b.classList.toggle('x', x); b.setAttribute('aria-label', x ? 'Close' : 'Add'); };
App.bsheet = ({ title, body, cls, onClose, focus, dock }) => {
  const d = document.createElement('dialog');
  d.className = 'bsheet' + (cls ? ' ' + cls : '') + (dock ? ' docked' : '');
  d.innerHTML = '<div class="bs-in"><div class="bs-grab" aria-hidden="true"></div><div class="bs-head"><h2>' + App.esc(title) + '</h2>' +
    '<button type="button" class="bs-x" data-bs-close aria-label="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>' +
    '<div class="bs-body">' + body + '</div></div>';
  let scrim = null;
  if (dock) { scrim = document.createElement('div'); scrim.className = 'dock-scrim'; document.body.appendChild(scrim); }
  document.body.appendChild(d);
  let closed = false;
  d.close2 = () => {
    if (closed) return; closed = true;
    d.dataset.closing = '1';
    const gone = () => { try { d.close(); } catch (e) { /* already closed */ } d.remove(); if (scrim) scrim.remove(); };
    if (App.reduced()) gone(); else { d.classList.add('out'); if (scrim) scrim.classList.add('out'); setTimeout(gone, 200); }
    App.dockSync();
    if (onClose) onClose();
  };
  d.addEventListener('click', e => {
    if (e.target === d) {                                            // a tap outside: an open calendar or list goes first, the sheet stays
      const pop = d.querySelector('.dp, .qa-ddm');
      if (pop) { pop.remove(); return; }
    }
    if (e.target === d || e.target.closest('[data-bs-close]')) d.close2();
  });
  d.addEventListener('cancel', e => { e.preventDefault(); d.close2(); });
  if (scrim) scrim.addEventListener('click', () => d.close2());
  if (dock) d.show(); else d.showModal();
  App.dockSync();
  if (focus === false) { const a = document.activeElement; if (a && d.contains(a)) a.blur(); }
  return d;
};
/* a tab tapped while a + sheet is open: the sheet goes */
window.addEventListener('hashchange', () => document.querySelectorAll('dialog.docked' + App.OPEN.slice(6)).forEach(d => d.close2 && d.close2()));
App.openMenu = () => {
  const p = App.me(), em = App.opt && App.opt.me && App.opt.me.email;
  const link = (href, icon, label, sub) => '<a class="mn-row" href="' + href + '" data-bs-close><span class="mn-ic">' + icon + '</span><span class="mn-t"><b>' + label + '</b><small>' + sub + '</small></span><span class="mn-go">›</span></a>';
  App.bsheet({
    title: p ? p.name : 'RuPeace', cls: 'menu', focus: false,
    body: (em ? '<p class="mn-who">' + App.esc(em) + '</p>' : '') + (App.syncUI && App.syncUI.menuRow ? App.syncUI.menuRow() : '') +
      link('#/ahead', App.ico('trend'), 'Next 12 months', 'Where bank and cash are heading, month by month') +
      link('#/settings', App.ico('cog'), 'Family Setup', 'Accounts and categories') +
      '<div class="mn-cap">Theme</div>' + App.themeSeg(),
  });
};
document.addEventListener('click', e => { if (e.target.closest('[data-avatar]')) { if (location.hash !== '#/account') location.hash = '#/account'; } });   // the Account page (core/phone-settings.js)

/* ---------- motion: the bar's blob, screen changes, rolling numbers, bars that grow, rows that arrive ---------- */
const TAB_ORDER = ['home', 'ledger', 'worth', 'ahead'];
let lastTab = null, lastKey = null, lastDepth = 0, lastRange = null, lastSu = null;
/* the purple blob behind the tab you are on; it stretches as it slides */
App.navBlob = anim => {
  const nav = document.querySelector('.bnav'); if (!nav) return;
  let b = nav.querySelector('.bnav-blob');
  if (!b) { b = document.createElement('span'); b.className = 'bnav-blob'; b.setAttribute('aria-hidden', 'true'); nav.prepend(b); }
  const a = nav.querySelector('a[aria-current="page"]');
  if (!a || !a.offsetWidth) { b.style.opacity = '0'; return; }
  const r = a.getBoundingClientRect(), p = nav.getBoundingClientRect(), w = Math.min(66, r.width - 4);
  const x = r.left - p.left - nav.clientLeft + (r.width - w) / 2, from = parseFloat(b.dataset.x);
  b.style.width = w + 'px'; b.style.transform = 'translateX(' + x + 'px)'; b.style.opacity = '1'; b.dataset.x = x;
  if (anim && !isNaN(from) && Math.abs(from - x) > 1 && !App.reduced() && b.animate) {
    b.animate([{ transform: 'translateX(' + from + 'px) scaleX(1)' }, { transform: 'translateX(' + (from + x) / 2 + 'px) scaleX(1.45)', offset: 0.45 }, { transform: 'translateX(' + x + 'px)' }],
      { duration: 380, easing: 'cubic-bezier(.3,1.2,.45,1)' });
  }
};
let kbMax = window.innerHeight;
window.addEventListener('resize', () => {
  kbMax = Math.max(kbMax, window.innerHeight);
  document.documentElement.classList.toggle('kb', window.innerHeight < kbMax * 0.78);       // the keyboard is up
  App.navBlob(false);
});
document.addEventListener('touchstart', () => {}, { passive: true });                          // :active on touch

/* Numbers roll like a meter from the last value shown to the new one (from zeros the first time). Each digit is a
   column 0-9 that slides; after the roll the plain text goes back. */
const ROLL = '.ph-hero .big, .ph-hero .trio b, .hm-sub > span, .ph-sum .v, .hp-leg .val, .hm-pr .v';
const shown = new Map();
const roll = (el, from) => {
  const to = el.textContent, nd = (to.match(/\d/g) || []).length;
  if (!nd || from === to) return;
  const od = String(from || '').replace(/\D/g, '');
  const texts = [], w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) if (/\d/.test(w.currentNode.nodeValue)) texts.push(w.currentNode);
  let k = 0;
  const cols = [];
  texts.forEach(t => {
    const f = document.createDocumentFragment();
    for (const ch of t.nodeValue) {
      if (!/\d/.test(ch)) { f.append(ch); continue; }
      const j = od.length - (nd - k), start = j >= 0 ? Number(od[j]) : 0; k++;
      const s = document.createElement('span'); s.className = 'rl'; s.setAttribute('aria-hidden', 'true');
      s.innerHTML = '<span class="rl-s">' + ch + '</span><span class="rl-c" style="transform:translateY(-' + start * 10 + '%)">' + '0123456789'.split('').map(n => '<span>' + n + '</span>').join('') + '</span>';
      f.append(s); cols.push([s.lastChild, Number(ch), cols.length]);
    }
    t.replaceWith(f);
  });
  el.setAttribute('aria-label', to);
  requestAnimationFrame(() => requestAnimationFrame(() => cols.forEach(([c, d, i]) => {
    c.style.transitionDelay = Math.min(i, 8) * 35 + 'ms'; c.style.transform = 'translateY(-' + d * 10 + '%)';
  })));
  setTimeout(() => {                                   // back to plain text
    el.querySelectorAll('.rl').forEach(s => s.replaceWith(s.firstChild.textContent));
    el.normalize(); el.removeAttribute('aria-label');
  }, 1300);
};
/* A screen drawn again in place (a sync finished, a list changed) keeps what the person was typing and picking:
   the values of its boxes, the chips they pressed, and the box they were in. A screen that has just saved what was
   typed sets App.noKeep first, so it starts clean. */
const fieldKey = i => (i.dataset.f ? '[data-f="' + i.dataset.f + '"]' : i.dataset.plan ? '[data-plan="' + i.dataset.plan + '"]' : i.hasAttribute('data-drd') ? '[data-drd]'
  : i.id ? '#' + CSS.escape(i.id) : i.name ? '[name="' + i.name + '"]' : null);
const CHOICE = ['c', 'drk', 'drn', 'drw'];
const choiceKey = b => { for (const k of CHOICE) if (b.dataset[k] !== undefined) return '[data-' + k + '="' + CSS.escape(b.dataset[k]) + '"]' + (k === 'c' ? '[data-v="' + CSS.escape(b.dataset.v || '') + '"]' : ''); return null; };
const keepState = old => {
  const a = document.activeElement;
  return {
    vals: [...old.querySelectorAll('input:not([type=hidden]), textarea, select')].map(i => [fieldKey(i), i.value]).filter(x => x[0] && x[1] !== ''),
    picks: [...old.querySelectorAll('[aria-pressed="true"]')].map(choiceKey).filter(Boolean),
    focus: a && old.contains(a) && /^(INPUT|TEXTAREA)$/.test(a.tagName) ? fieldKey(a) : null,
  };
};
const putState = (el, st) => {
  st.picks.forEach(k => { const b = el.querySelector(k); if (b && b.getAttribute('aria-pressed') !== 'true') b.click(); });   // in order: a day rule's kind first
  st.vals.forEach(([k, v]) => { const i = el.querySelector(k); if (i && i.value !== v) { i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); } });
  if (st.focus) { const i = el.querySelector(st.focus); if (i) { i.focus({ preventScroll: true }); try { const n = i.value.length; i.setSelectionRange(n, n); } catch (e) { /* not a text box */ } } }
};
/* Setup, step to step (Back / Next): the old page slides out one way while the new one glides in from the other;
   the setup bar stays where it is, only its words and button move, and the step marker glides along the dots. */
const suOf = h => { const m = h.match(/[?&]su=([^&]+)/); return m ? m[1] : null; };
function setupSwap(main, old, el, dir, fromK, toK, tabs) {        // tabs: a whole tab changes (nothing stays put)
  const r = old.getBoundingClientRect(), E = 'cubic-bezier(.3,1.15,.45,1)', EIN = 'cubic-bezier(.5,0,.75,.4)';
  Object.assign(old.style, { position: 'fixed', top: r.top + 'px', left: r.left + 'px', width: r.width + 'px', margin: '0', pointerEvents: 'none', zIndex: '1' });
  if (!tabs) old.querySelectorAll('.ph-top, .su-bar').forEach(n => { n.style.visibility = 'hidden'; });      // the new bar sits in the same place
  main.appendChild(el);
  const gone = () => { if (old.parentNode) old.remove(); };
  const a = old.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(' + (-dir * 56) + 'px) scale(.985)' }], { duration: 230, easing: EIN, fill: 'forwards' });
  a.onfinish = gone; setTimeout(gone, 500);
  const slide = (n, delay, dx, dur) => n.animate([{ opacity: 0, transform: 'translateX(' + dx + 'px)' }, { opacity: 1, transform: 'none' }], { duration: dur || 480, delay, easing: E, fill: 'backwards' });
  const t = el.querySelector('.ph-title'); if (t) slide(t, 40, dir * 26, 420);
  [...el.children].filter(n => tabs || !n.matches('.ph-top, .su-bar')).forEach((n, i) => slide(n, (tabs ? 40 : 110) + Math.min(i, 6) * 40, dir * 80));
  const bar = el.querySelector('.su-bar');
  if (bar) {
    ['.su-say', '.su-add', '.su-link'].forEach((s, i) => { const n = bar.querySelector(s); if (n) slide(n, 60 + i * 45, dir * 30, 440); });
    const head = bar.querySelector('.su-head span');
    if (head) head.animate([{ opacity: 0, transform: 'translateY(' + (dir * 7) + 'px)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: E });
    const cur = bar.querySelector('.su-cur');
    if (cur && fromK >= 0) { cur.style.transition = 'none'; cur.style.setProperty('--k', fromK); void cur.offsetWidth; cur.style.transition = ''; cur.style.setProperty('--k', toK); }
  }
}
/* Account (the photo, top right) and the Settings under it are a side panel: it slides in from the right over the
   screen you were on, and slides back out to the right when you leave. */
const inPanel = (name, h) => name === 'account' || (name === 'settings' && !/[?&]su=/.test(h) && !/[?&]s=(loan|place|loans|savings|oneoffs|recurring)(&|$)/.test(h));
function panelSwap(main, old, el, opening) {
  const r = old.getBoundingClientRect(), E = 'cubic-bezier(.32,.72,0,1)';
  Object.assign(old.style, { position: 'fixed', top: r.top + 'px', left: r.left + 'px', width: r.width + 'px', margin: '0', pointerEvents: 'none', zIndex: opening ? '1' : '3' });
  if (!opening) Object.assign(old.style, { background: 'var(--page)', minHeight: '100vh', boxShadow: '-12px 0 32px rgba(0,0,0,.18)' });
  main.appendChild(el);
  window.scrollTo(0, 0);
  const gone = () => { if (old.parentNode) old.remove(); };
  if (opening) {
    Object.assign(el.style, { position: 'relative', zIndex: '2', background: 'var(--page)', minHeight: '100vh', boxShadow: '-12px 0 32px rgba(0,0,0,.18)' });
    const a = el.animate([{ transform: 'translateX(100%)' }, { transform: 'none' }], { duration: 380, easing: E });
    old.animate([{ opacity: 1, transform: 'none' }, { opacity: .5, transform: 'translateX(-18%)' }], { duration: 380, easing: E, fill: 'forwards' });
    a.onfinish = () => { gone(); ['position', 'zIndex', 'background', 'minHeight', 'boxShadow'].forEach(k => { el.style[k] = ''; }); };
    setTimeout(a.onfinish, 700);
  } else {
    const a = old.animate([{ transform: 'none' }, { transform: 'translateX(100%)' }], { duration: 320, easing: E, fill: 'forwards' });
    el.animate([{ opacity: .5, transform: 'translateX(-18%)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: E });
    a.onfinish = gone; setTimeout(gone, 700);
  }
}
/* inside the panel, a stack: opening an option slides the whole page out to the left as the next comes in from the
   right; Back slides it the other way. Account 0, Settings 1, a Settings page 2, a page under that 3. */
const panelDepth = (name, h) => name === 'account' ? 0 : 1 + (h.split('?')[1] || '').split('&').filter(Boolean).length;
function stackSwap(main, old, el, dir) {
  const r = old.getBoundingClientRect(), E = 'cubic-bezier(.32,.72,0,1)';
  Object.assign(old.style, { position: 'fixed', top: r.top + 'px', left: r.left + 'px', width: r.width + 'px', margin: '0', pointerEvents: 'none' });
  main.appendChild(el);
  window.scrollTo(0, 0);
  const gone = () => { if (old.parentNode) old.remove(); };
  const a = old.animate([{ transform: 'none' }, { transform: 'translateX(' + (-dir * 100) + '%)' }], { duration: 340, easing: E, fill: 'forwards' });
  el.animate([{ transform: 'translateX(' + (dir * 100) + '%)' }, { transform: 'none' }], { duration: 340, easing: E });
  a.onfinish = gone; setTimeout(gone, 700);
}
let lastPanel = false, lastPanelDepth = 0;
/* el (the new screen) goes into main, with motion fitting what changed */
const depthOf = (name, h) => (/[?&]s=/.test(h) ? 2 : 0) + (/^(ahead|welcome|loans|savings|plan)$/.test(name) ? 1 : 0);
function motion(main, el, name, tab) {
  const su = suOf(location.hash), key = (location.hash.split('&')[0] || '#/home') + (su ? '|' + su : ''), depth = depthOf(name, location.hash);
  const range = JSON.stringify(App.range('phone')), old = main.firstElementChild;
  const quiet = App.reduced(), same = key === lastKey;
  const swap = same && range !== lastRange;
  const oldBars = same && !swap && old ? [...old.querySelectorAll('.ph-bar i')].map(i => i.style.width) : null;
  const oldIds = same && !swap && old ? new Set([...old.querySelectorAll('[data-eid]')].map(r => r.dataset.eid)) : null;
  const kept = same && !swap && old && !App.noKeep ? keepState(old) : null;
  App.noKeep = false;
  const order = (App.SETUP || []).map(x => x.id), fromK = order.indexOf(lastSu), toK = order.indexOf(su);
  const stepping = !quiet && !same && old && fromK >= 0 && toK >= 0 && fromK !== toK;
  const ti = TAB_ORDER.indexOf(tab), tj = TAB_ORDER.indexOf(lastTab);
  const panel = inPanel(name, location.hash), paneling = !quiet && !same && old && lastKey !== null && panel !== lastPanel;
  const pDepth = panel ? panelDepth(name, location.hash) : 0;
  const stacking = !paneling && panel && lastPanel && !quiet && !same && old && lastKey !== null;
  const stackDir = Math.sign(pDepth - lastPanelDepth) || 1;
  lastPanel = panel; lastPanelDepth = pDepth;
  const tabbing = !stacking && !paneling && !stepping && !quiet && !same && old && lastKey !== null && ti >= 0 && tj >= 0 && ti !== tj;
  if (paneling) panelSwap(main, old, el, panel);
  else if (stacking) stackSwap(main, old, el, stackDir);
  else if (stepping) setupSwap(main, old, el, Math.sign(toK - fromK), fromK, toK);
  else if (tabbing) setupSwap(main, old, el, Math.sign(ti - tj), -1, -1, true);          // tabs slide like setup steps
  else main.replaceChildren(el);
  if (App.onScreen) { try { App.onScreen(el); } catch (e) { console.error(e); } }
  if (kept && (kept.vals.length || kept.picks.length)) { try { putState(el, kept); } catch (e) { console.error(e); } }
  if (!quiet) {
    let cls = '';
    if (!same && !stepping && !tabbing && !paneling && !stacking) {
      const dir = lastKey === null ? 0 : tab !== lastTab ? Math.sign(TAB_ORDER.indexOf(tab) - TAB_ORDER.indexOf(lastTab)) : Math.sign(depth - lastDepth) || 1;
      el.style.setProperty('--pg-x', dir * 22 + 'px'); el.style.setProperty('--pg-y', dir ? '0px' : '10px');
      cls = 'pg-in';
    } else if (swap) {
      const a = JSON.parse(lastRange || 'null'), b = JSON.parse(range);
      el.style.setProperty('--pg-x', (a && b.from < a.from ? -1 : 1) * 28 + 'px');
      cls = 'pg-swap';
    }
    if (cls) { el.classList.add(cls); setTimeout(() => el.classList.remove(cls), 1000); }
    if (oldBars) {
      const nb = [...el.querySelectorAll('.ph-bar i')];
      if (nb.length === oldBars.length && nb[0] && nb[0].animate) nb.forEach((b, i) => { if (oldBars[i] && b.style.width && oldBars[i] !== b.style.width) b.animate([{ width: oldBars[i] }, { width: b.style.width }], { duration: 650, easing: 'cubic-bezier(.3,1.25,.45,1)' }); });
    }
    if (oldIds && oldIds.size) {
      const now = [...el.querySelectorAll('[data-eid]')], ids = new Set(now.map(r => r.dataset.eid));
      const renamed = [...oldIds].some(id => Number(id) < 0 && !ids.has(id));          // a new entry got its id from Google: not new
      now.forEach(r => { const id = r.dataset.eid; if (!oldIds.has(id) && (Number(id) < 0 || !renamed)) r.classList.add('row-new'); });
    }
  }
  const page = key + '|';
  el.querySelectorAll(ROLL).forEach((n, i) => {
    const k = page + i, prev = shown.get(k), txt = n.textContent;
    shown.set(k, txt);
    if (!quiet) roll(n, prev);
  });
  lastKey = key; lastTab = tab; lastDepth = depth; lastRange = range; lastSu = su;
}

/* ---------- router: #/home (#/ahead) · #/ledger (Activity) · #/worth · #/settings?s=… ---------- */
App.go = name => { location.hash = '#/' + name; };
// Ahead (the last button) covers loans, savings, recurring and planned, and their detail screens under Settings
const tabOf = name => /^(loans|savings|planned|events|bombs)$/.test(name) || (name === 'settings' && !/[?&]su=/.test(location.hash) && /[?&]s=(loan|place|loans|savings|oneoffs|recurring)(&|$)/.test(location.hash)) ? 'ahead'
  : /^(ahead|plan|welcome)$/.test(name) || /[?&]su=/.test(location.hash) ? 'home' : name;
App.markTab = (tab, anim) => {
  if (!tab) tab = tabOf(location.hash.replace(/^#\/?/, '').split('?')[0] || 'home');
  document.querySelectorAll('.bnav a').forEach(a => a.setAttribute('aria-current', a.getAttribute('href') === '#/' + tab || a.dataset.tab === tab ? 'page' : 'false'));
  App.navBlob(anim);
};
App.refresh = async () => {
  const name = location.hash.replace(/^#\/?/, '').split('?')[0] || 'home';
  current = name;
  const tab = tabOf(name);
  App.markTab(tab, lastTab !== null && lastTab !== tab);
  const main = document.getElementById('main');
  const def = pages[name] || pages.home;
  if (!def) { main.innerHTML = '<div class="empty">Loading…</div>'; return; }
  document.title = def.title + ' · RuPeace';
  try {
    if (!App.opt) await App.loadOptions();
    const el = document.createElement('div');
    await def.render(el, { params: new URLSearchParams(location.hash.split('?')[1] || '') });
    if (current !== name) return;
    el.querySelectorAll('.ph-hero .big').forEach(b => { const f = b.firstChild; if (f && f.nodeType === 3 && /^−?₹/.test(f.nodeValue)) { const m = f.nodeValue.match(/^(−?)₹/); f.nodeValue = f.nodeValue.slice(m[0].length); b.insertAdjacentHTML('afterbegin', m[1] + '<span class="cur">₹</span>'); } });
    motion(main, el, name, tab);
    if (def.after) def.after(el);
  } catch (e) {
    console.error(e);
    main.innerHTML = '<div class="ph"><div class="ph-card ph-empty"><b>Could not open this screen.</b><br>' + App.esc(e.message) + '</div></div>';
  }
};
/* ---------- the phone's Back button ----------
   The Android app asks RuPeaceBack() what Back should do (android/.../MainActivity.java), instead of going back in
   browser history (which holds every tab switch and step). In order: stop a running tour; close the top sheet, pop-up
   or date picker; go up from a detail screen (its own ‹ button knows where); show this month again; go to Home from
   any other tab; on Home, leave the app. Returns 'handled' or 'exit'. */
App.backHooks = [];
const PARENT = { ledger: '#/home', worth: '#/home', settings: '#/account', ahead: '#/home', plan: '#/home', welcome: '#/home', account: '#/home', loans: '#/home', savings: '#/home', planned: '#/home', events: '#/home', bombs: '#/home' };
/* A long press does nothing outside the boxes you type in: no word picking, no menu, no dragging a picture or link
   (core/app.css stops the picking too; this covers the phone's long-press menu and anything drawn later). */
const typing = t => !!(t && t.closest && t.closest('input, textarea, [contenteditable="true"]'));
['contextmenu', 'selectstart', 'dragstart'].forEach(ev => document.addEventListener(ev, e => { if (!typing(e.target)) e.preventDefault(); }, true));
window.RuPeaceBack = () => {
  try {
    if (document.querySelector('.rp-lock')) return 'exit';
    const sel = window.getSelection && getSelection();             // a long press picked some words: Back lets go of them first
    if (sel && sel.rangeCount && !sel.isCollapsed) { sel.removeAllRanges(); return 'handled'; }
    for (const f of App.backHooks) { if (f()) return 'handled'; }
    const dp = document.querySelector('.dp'); if (dp) { dp.remove(); return 'handled'; }
    const open = [...document.querySelectorAll(App.OPEN)], top = open[open.length - 1];
    if (top) {
      if (top.close2) top.close2();
      else if (top.dispatchEvent(new Event('cancel', { cancelable: true }))) top.close();
      return 'handled';
    }
    const main = document.getElementById('main');
    const up = main && main.querySelector('[data-back], .ah-back');
    if (up) { up.click(); return 'handled'; }
    const name = location.hash.replace(/^#\/?/, '').split('?')[0] || 'home';
    if (name === 'home') {
      const now = main && main.querySelector('[data-mnow]');
      if (now) { now.click(); return 'handled'; }
      return 'exit';
    }
    location.replace(PARENT[name] || '#/home');
    return 'handled';
  } catch (e) {
    return 'none';
  }
};

App.boot = () => {
  document.documentElement.classList.add('phone');
  window.addEventListener('hashchange', App.refresh);
  App.refresh();
};
})();
