/* Phone Settings (under 760px wide): a hub of live tiles, then one app-style screen per list.
   Registered with App.phonePage('settings'); the desktop Settings page (pages/settings*.js) is untouched and still used ≥ 760px.
   Screens are #/settings?s=<screen>[&id=<id>]: family, accounts, categories, loans, loan, savings, place, recurring, oneoffs,
   pins (Google version only), backup, look, tab (any other Settings tab, drawn with its desktop render).
   Edits go through the same /api/setup/<table> routes as the desktop tabs, in a slide-up sheet (App.bsheet). */
(function () {
'use strict';
const App = window.App;
const esc = App.esc;

/* ---------- look (prefixed .pss; tokens only) ---------- */
const CSS = `
:root{--pss-bank:linear-gradient(135deg,#0b7a71 0%,#0d9488 60%,#0e7490 100%);--pss-card:linear-gradient(135deg,#2e2463 0%,#7a3f8f 55%,#c25a86 100%);
--pss-cash:linear-gradient(135deg,#17805f 0%,#2fa57c 60%,#5bbf8f 100%);--pss-wallet:linear-gradient(135deg,#b4642a 0%,#d98a3c 60%,#e8b04f 100%);--pss-off:linear-gradient(135deg,#6f7396,#8f93b3)}
:root[data-theme="dark"]{--pss-bank:linear-gradient(135deg,#463ba8 0%,#6a46ad 60%,#8a4f9e 100%);--pss-card:linear-gradient(135deg,#221a4d 0%,#5f3173 55%,#9c4870 100%);
--pss-cash:linear-gradient(135deg,#11604a 0%,#1f8364 60%,#3a9c75 100%);--pss-wallet:linear-gradient(135deg,#8c4c1f 0%,#ad6c2c 60%,#bf8a3a 100%);--pss-off:linear-gradient(135deg,#3a3d5c,#55597c)}
.pss .pss-tl{display:flex;align-items:center;gap:2px;min-width:0;flex:1}
.pss .pss-tl .ph-title{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.pss .pss-tl .ph-ib{margin-left:-10px}
.pss-plus{width:44px;height:44px;border-radius:50%;border:0;display:grid;place-items:center;background:var(--fab);color:#fff;box-shadow:var(--fab-glow);cursor:pointer;flex:none}
.pss-plus svg,.pss-pill svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
.pss-pill{min-height:44px;padding:0 16px;border-radius:999px;border:1px solid var(--chip-line);background:var(--chip-bg);color:var(--accent-fg);font:700 13.5px/1 var(--font);cursor:pointer;flex:none;display:inline-flex;align-items:center;gap:6px}
.pss-lead{color:var(--muted);font-size:13px;margin:-8px 2px 0}
.pss-tiles{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.pss-tile{display:flex;flex-direction:column;align-items:flex-start;gap:9px;min-height:112px;padding:14px;border-radius:20px;background:var(--glass);border:1px solid var(--glass-border);box-shadow:var(--shadow);backdrop-filter:var(--blur);-webkit-backdrop-filter:var(--blur);color:var(--ink);text-align:left;cursor:pointer;font:inherit;min-width:0;width:100%}
.pss-tile:hover{border-color:color-mix(in srgb,var(--accent) 40%,var(--glass-border))}
.pss-tile .ic{width:40px;height:40px;border-radius:13px;display:grid;place-items:center;font-size:19px;flex:none;background:color-mix(in srgb,var(--h) 16%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--h) 24%,transparent)}
.pss-tile .tx{display:flex;flex-direction:column;gap:2px;min-width:0;width:100%}
.pss-tile b{font-size:14.5px;font-weight:700;line-height:1.25}
.pss-tile .s{font-size:12.5px;color:var(--muted);line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
.pss-tile .s em{font-style:normal;color:var(--ink-2);font-weight:650}
.pss-tile.wide,.pss-tiles>.pss-tile:last-child:nth-child(odd){grid-column:1/-1;flex-direction:row;align-items:center;min-height:76px}
.pss-sec-cap{font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;margin:4px 2px -4px}
.pss .ph-row .am small{font-size:11.5px;color:var(--muted);font-weight:600;white-space:nowrap}
.pss .ph-row .am small.neg{color:var(--bad)} .pss .ph-row .am small.pos{color:var(--good)}
.pss .ph-row .av{width:42px;height:42px;border-radius:50%;display:grid;place-items:center;flex:none;font:700 16px/1 var(--font);color:#fff;background:var(--h)}
.pss .ph-row.off .nm b{color:var(--muted)}
.pss .ph-card.ph-list{padding-top:4px;padding-bottom:4px}
.pss-hid{margin-top:-4px}
.pss-hid>summary,.pss-yr>summary{list-style:none;min-height:44px;display:flex;align-items:center;justify-content:space-between;gap:8px;color:var(--muted);font-weight:650;font-size:13px;cursor:pointer;padding:0 2px}
.pss-hid>summary::-webkit-details-marker,.pss-yr>summary::-webkit-details-marker{display:none}
.pss-hid>summary::after,.pss-yr>summary .chev{content:"›";font-size:20px;line-height:1;transition:transform .15s;display:inline-block}
.pss-hid[open]>summary::after,.pss-yr[open]>summary .chev{transform:rotate(90deg)}
.pss-hid .ph-list{opacity:.8}
.pss-stg{margin-top:0}.pss-stg>summary{background:var(--glass);border:1px solid var(--glass-border);border-radius:16px;padding:0 14px;min-height:52px;color:var(--ink)}.pss-stg .ph-list{opacity:1}.pss-stg[open]>summary{margin-bottom:8px}
.pss-yr{border-bottom:1px solid var(--border)}
.pss-yr:last-child{border-bottom:0}
.pss-yr>summary{color:var(--ink);font-size:14.5px;font-weight:750;min-height:52px}
.pss-yr>summary span{display:flex;align-items:center;gap:8px;min-width:0}
.pss-yr>summary small{color:var(--muted);font-weight:600;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pss-yr .ph-row{cursor:default;min-height:56px}
.pss-yr .ph-row.cur{background:color-mix(in srgb,var(--accent) 8%,transparent);border-radius:12px;padding-left:6px;padding-right:6px;margin:0 -6px;width:calc(100% + 12px)}
.pss-mo{font-size:11.5px !important;font-weight:800;color:var(--accent-fg);line-height:1.1;text-align:center}
.pss-cards{display:flex;flex-direction:column;gap:12px}
.pss-bc{position:relative;overflow:hidden;display:flex;flex-direction:column;justify-content:space-between;gap:12px;width:100%;min-height:178px;padding:16px 18px;border:0;border-radius:22px;color:#fff;text-align:left;font:inherit;cursor:pointer;background:var(--g);box-shadow:var(--hero-shadow)}
.pss-bc::before{content:"";position:absolute;width:220px;height:220px;right:-70px;top:-110px;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,.2),transparent 70%);pointer-events:none}
.pss-bc::after{content:"";position:absolute;width:180px;height:180px;left:-60px;bottom:-120px;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,.1),transparent 70%);pointer-events:none}
.pss-bc>*{position:relative;z-index:1}
.pss-bc .top{display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:12.5px;font-weight:600;color:rgba(255,255,255,.88)}
.pss-bc .top span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.pss-bc .chipi{width:34px;height:25px;border-radius:6px;flex:none;background:linear-gradient(135deg,rgba(255,255,255,.55),rgba(255,255,255,.2));box-shadow:inset 0 0 0 1px rgba(255,255,255,.35)}
.pss-bc .mid .k{font-size:12px;color:rgba(255,255,255,.78);font-weight:600}
.pss-bc .mid .v{font-size:28px;font-weight:750;letter-spacing:-.02em;line-height:1.1;white-space:nowrap;font-variant-numeric:tabular-nums}
.pss-bc .lim{height:6px;border-radius:6px;background:rgba(255,255,255,.22);overflow:hidden;margin-top:8px}
.pss-bc .lim i{display:block;height:100%;background:#fff;border-radius:6px}
.pss-bc .limt{font-size:11.5px;color:rgba(255,255,255,.8);margin-top:4px}
.pss-bc .bot{display:flex;justify-content:space-between;align-items:flex-end;gap:10px}
.pss-bc .bot>div{min-width:0}
.pss-bc .nm{font-weight:750;font-size:15.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pss-bc .ow{font-size:12px;color:rgba(255,255,255,.8);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pss-bc .l4{font-size:14px;font-weight:700;letter-spacing:.14em;white-space:nowrap;font-variant-numeric:tabular-nums}
.pss-bc.off{opacity:.8}
.pss-ring{width:42px;height:42px;flex:none;position:relative;display:grid;place-items:center}
.pss-ring>svg{position:absolute;inset:0;width:42px;height:42px;transform:rotate(-90deg)}
.pss-ring>svg circle{fill:none;stroke-width:4}
.pss-ring .bg{stroke:var(--grid-soft)} .pss-ring .fg{stroke:var(--accent);stroke-linecap:round}
.pss-ring.over .fg{stroke:var(--bad)} .pss-ring.good .fg{stroke:var(--good)}
.pss-ring .e{font-size:17px;line-height:1}
.pss .ph-row .amt.over{color:var(--bad)}
.pss-cbar{height:4px;border-radius:4px;background:var(--grid-soft);overflow:hidden;margin-top:5px}
.pss-cbar i{display:block;height:100%;border-radius:4px;background:var(--accent)}
.pss-cbar.over i{background:var(--bad)} .pss-cbar.good i{background:var(--good)}
.pss-catrow .nm .pss-cbar{max-width:220px}
.pss-chipbox{padding:10px 0 2px}
.pss-chipbox .cap{font-size:12px;color:var(--muted);font-weight:600;margin:0 0 8px}
.pss .ph-hero .big small{font-size:15px;font-weight:600;opacity:.8;margin-left:6px}
.pss-facts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 14px}
.pss-note{font-size:12.5px;color:var(--muted);margin:10px 0 0}
.pss-note b{color:var(--ink-2)}
.pss-ff{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px 12px}
.pss-f{grid-column:1/-1;min-width:0}
.pss-f.half{grid-column:auto}
.pss-f .qa-cap{display:block;margin-bottom:6px}
.pss-f input:not([type=checkbox]),.pss-f select{width:100%;height:46px;font-size:15px;border-radius:14px;padding:4px 12px}
.pss-f input[data-date]{padding-left:38px}
.pss-f .hint{margin-top:6px;line-height:1.4}
.pss-f .ph-wrap .hint{align-self:center}
.pss-sec{grid-column:1/-1;font-size:14px;font-weight:750;color:var(--ink);padding-top:12px;border-top:1px solid var(--border);margin-top:2px}
.pss-sec:first-child{border-top:0;padding-top:0}
.pss-sw{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;min-height:48px;padding:0 2px;border:0;background:transparent;color:var(--ink);font:600 14.5px/1.3 var(--font);cursor:pointer;text-align:left}
.pss-sw small{display:block;font-size:12.5px;color:var(--muted);font-weight:500}
.pss-sw i{flex:none;width:48px;height:28px;border-radius:999px;background:color-mix(in srgb,var(--muted) 38%,transparent);position:relative;transition:background .15s}
.pss-sw i::after{content:"";position:absolute;top:3px;left:3px;width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3);transition:transform .15s}
.pss-sw[aria-checked="true"] i{background:var(--accent)}
.pss-sw[aria-checked="true"] i::after{transform:translateX(20px)}
.pss-sheet .qa-foot .btn.ghost{flex:none}
.pss-tab .card{margin:0;padding:14px 16px;border-radius:20px}.pss-tab .card h2{font-size:15.5px;margin-bottom:4px}.pss-tab .card>p{font-size:12.5px;color:var(--muted)}
.pss-tab .btn{min-height:44px}
.pss-look .tseg button{min-height:44px;font-size:13.5px}
.pss-pin{display:flex;gap:10px;align-items:center}
.pss-actions{display:flex;flex-direction:column;gap:10px}
a.ph-tap{display:block;color:inherit;text-decoration:none;cursor:pointer}a.ph-tap:hover{text-decoration:none;border-color:color-mix(in srgb,var(--accent) 40%,var(--glass-border))}
.pss-actions .btn{min-height:48px;justify-content:center;font-size:14.5px;border-radius:16px}
`;
if (!document.getElementById('pss-css')) { const st = document.createElement('style'); st.id = 'pss-css'; st.textContent = CSS; document.head.appendChild(st); }

/* ---------- small helpers ---------- */
const SVG = p => '<svg viewBox="0 0 24 24" aria-hidden="true">' + p + '</svg>';
const I = { left: SVG('<path d="m15 6-6 6 6 6"/>'), right: SVG('<path d="m9 6 6 6-6 6"/>'), plus: SVG('<path d="M12 5v14M5 12h14"/>'), edit: SVG('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>') };
const TYPES = [['expense', 'Expense'], ['income', 'Income'], ['savings', 'Savings'], ['loan', 'Loan payment'], ['transfer', 'Transfer']];
const TYPE_GROUP = { expense: 'Spending', income: 'Money in', savings: 'Savings', loan: 'Loan payments', transfer: 'Transfers' };
const typeLabel = t => (TYPES.find(x => x[0] === t) || [t, App.label(t)])[1];
const ACCT_KINDS = [['bank', 'Bank account', App.ico('bank')], ['card', 'Credit card', App.ico('card')], ['cash', 'Cash', App.ico('money')], ['wallet', 'Wallet', App.ico('wallet')]];
const FREQ = [['monthly', 'Monthly'], ['quarterly', 'Quarterly'], ['yearly', 'Yearly']];
const PARTS = [['emi', 'EMI'], ['pre_emi', 'Pre-EMI'], ['prepay', 'Prepayment'], ['charges', 'Charges']];
const DISB = [['full', 'Full'], ['stages', 'In stages']];
const PREPAY = [['none', 'None'], ['surplus_quarterly', 'Every quarter'], ['fixed_monthly', 'Every month']];
const REPAY = [['emi', 'Principal + interest'], ['interest', 'Interest only']];
const RELATIONS = ['Self', 'Spouse', 'Child', 'Parent', 'Other'];
const THEME_LABEL = { light: 'Light', dark: 'Dark', auto: 'Follow phone' };
const ST = { paid: ['Paid', 'good'], short: ['Short', 'warn'], missed: ['Missed', 'bad'], early: ['Paid extra', 'good'], due: ['Due', 'warn'], overdue: ['Overdue', 'bad'], closed: ['Closed', ''], upcoming: ['Upcoming', ''] };
const LSTATUS = { 'not started': 'Not started', 'pre-EMI': 'Pre-EMI', 'interest only': 'Interest only', EMI: 'EMI', closed: 'Closed' };
const opts = pairs => pairs.map(([value, label, emoji]) => ({ value, label, emoji }));
const thisMonth = () => App.today().slice(0, 7);
const mIdx = ym => { const [y, m] = ym.split('-').map(Number); return y * 12 + m - 1; };
const dshort = iso => { const [, m, d] = iso.split('-').map(Number); return d + ' ' + App.MN[m - 1]; };
const parseAmt = s => { const t = String(s == null ? '' : s).replace(/[,₹\s]/g, ''); if (t === '') return NaN; const n = Number(t); return isFinite(n) ? n : NaN; };
/* ₹8.6k · ₹12k · ₹1.25L (short, for "spent / plan") */
const kfmt = (v, rupee = true) => {                                     // ₹12,500 · ₹1.25L · ₹1.5 Cr (Indian, no "k")
  v = Math.round(Number(v) || 0); const a = Math.abs(v), s = (v < 0 ? '−' : '') + (rupee ? '₹' : '');
  if (a < 1e5) return s + a.toLocaleString('en-IN');
  return s + (a >= 1e7 ? (a / 1e7).toFixed(2) + ' Cr' : (a / 1e5).toFixed(2).replace(/\.?0+$/, '') + 'L');
};
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : (many || one + 's'));
const pick = (kind, cur, test) => (App.opt[kind] || []).filter(x => (x.active !== 0 || String(x.id) === String(cur)) && (!test || test(x)));
const peopleOf = key => v => pick('people', v[key]).map(p => ({ value: p.id, label: p.name }));
const loanKinds = () => (App.opt.choices.loan_kinds || []).map(k => ({ value: k, label: App.label(k) }));
const savKinds = () => (App.savingsKinds ? App.savingsKinds() : (App.opt.choices.savings_kinds || []).map(k => ({ value: k, label: App.label(k) })));
const savKindLabel = k => (savKinds().find(o => o.value === k) || { label: App.label(k) }).label;
const SAV_ICON = { mutual_fund: App.ico('trend'), stocks: App.ico('trend'), ppf: App.ico('bank'), epf: App.ico('bank'), nps: App.ico('bank'), fd: App.ico('bank'), rd: App.ico('bank'), gold: App.ico('coin'), other: App.ico('piggy') };
const personName = id => App.nameOf('people', id);
const settled = async calls => (await Promise.allSettled(calls)).map(r => (r.status === 'fulfilled' ? r.value : null));
const monthRange = () => { const f = thisMonth() + '-01'; return { from: f, to: App.monthEnd(f) }; };

/* ---------- navigation: #/settings?s=screen&id=… with a back button that pops history when it came from the parent ---------- */
const HUB = '#/settings';
const qp = k => new URLSearchParams(location.hash.split('?')[1] || '').get(k);
/* common names offered as chips when picking a category (made when picked); everyone can rename or hide them later */
const SUGGEST = App.SUGGEST_CATS = {                // also offered in the add sheet (core/phone.js)
  income: ['Salary', 'Business income', 'Rent received', 'Interest', 'Other income'],
  expense: ['Rent', 'Groceries', 'Electricity', 'Internet', 'Phone', 'Fuel', 'Eating out', 'Travel', 'School fees', 'Insurance', 'Maid', 'Medical', 'Shopping'],
  savings: ['SIP', 'PPF', 'Fixed deposit', 'Gold'],
};
const href = (s, id) => HUB + '?' + App.qs({ s, id });
/* trail of hashes this tab moved through (going back pops), so Back pops history only when the parent is really the entry
   before; otherwise (opened from a link or a refresh) it replaces this entry with the parent */
const trail = [location.hash];
let replacing = false;
window.addEventListener('hashchange', () => {
  const h = location.hash;
  if (replacing) { trail[trail.length - 1] = h; replacing = false; }
  else if (trail.length > 1 && trail[trail.length - 2] === h) trail.pop();
  else { trail.push(h); if (trail.length > 60) trail.shift(); }
});
const replaceTo = h => { if (location.hash === h) return; replacing = true; location.replace(h); };
/* back to the parent; or, when this screen was opened from another page (e.g. a loan card on the Loans tab), back to that page */
const goBack = parent => { const prev = trail.length > 1 ? trail[trail.length - 2] : null; if (prev != null && (prev === parent || !/^#\/settings/.test(prev))) history.back(); else replaceTo(parent); };
const top = (title, back, right) => '<div class="ph-top"><div class="pss-tl">' +
  (back ? '<button type="button" class="ph-ib" data-back="' + esc(back) + '" aria-label="Back">' + I.left + '</button>' : '') +
  '<div class="ph-title">' + esc(title) + '</div></div>' + (right || '') + '</div>';
const aheadRight = btn => '<span class="ah-right">' + btn + App.avatar() + '</span>';      // an Ahead page: its + and the photo
const plusBtn = (what, attr) => '<button type="button" class="pss-plus" ' + (attr || 'data-new') + ' aria-label="Add ' + esc(what) + '" title="Add ' + esc(what) + '">' + I.plus + '</button>';
const editBtn = '<button type="button" class="pss-pill" data-edit>' + I.edit + 'Edit</button>';

/* ---------- list rows ---------- */
const row = ({ attrs = '', ic = '', hue, av, title, sub = '', amt = '', amtCls = '', small = '', smallCls = '', tag = '', off = false, go = true, extra = '' }) =>
  '<button type="button" class="ph-row' + (off ? ' off' : '') + '" ' + attrs + '>' +
  (av ? '<span class="av" style="--h:' + App.hue(av) + '">' + esc(String(av).trim().charAt(0).toUpperCase()) + '</span>'
    : ic ? '<span class="ic" style="--h:' + (hue || App.hue(title)) + '">' + ic + '</span>' : '') +
  '<span class="nm"><b>' + esc(title) + '</b>' + (sub ? '<span>' + esc(sub) + '</span>' : '') + extra + '</span>' +
  (amt || small || tag ? '<span class="am">' + (amt ? '<span class="amt ' + amtCls + '">' + amt + '</span>' : '') + (small ? '<small class="' + smallCls + '">' + small + '</small>' : '') + tag + '</span>' : '') +
  (go ? '<span class="go">' + I.right + '</span>' : '') + '</button>';
const listCard = rows => '<div class="ph-card ph-list">' + rows.join('') + '</div>';
const hiddenBox = (rows, what) => (rows.length ? '<details class="pss-hid"><summary>Hidden · ' + plural(rows.length, what) + '</summary>' + listCard(rows) + '</details>' : '');
const cap = (t, right) => '<div class="ph-cap"><span>' + t + '</span>' + (right || '') + '</div>';
const tagOf = (text, cls) => '<span class="ph-tag ' + (cls || '') + '">' + esc(text) + '</span>';

/* ================= the edit sheet: same fields and rules as the desktop tab =================
   fields: [{ key, label, type: text|email|money|num|int|date|month|chips|check|pin, required, options(v), ref, show(v), sec, half,
             hint, placeholder, newCat, onPick(v), maxlength, text }] */
function editSheet({ title, fields, values = {}, isNew, save, del, delLabel = 'Delete' }) {
  const v = Object.assign({}, values);
  fields.forEach(f => { if ((f.type === 'money' || f.type === 'num' || f.type === 'int') && v[f.key] != null && v[f.key] !== '') v[f.key] = String(v[f.key]); });
  const d = App.bsheet({
    title, cls: 'qa pss-sheet', focus: isNew && fields.some(f => f.autofocus) ? undefined : false,
    body: '<div class="pss-ff" data-ff></div><div class="qa-err" role="alert" data-err></div>' +
      '<div class="qa-foot">' + (del ? '<button type="button" class="btn danger" data-del>' + esc(delLabel) + '</button>' : '') +
      '<button type="button" class="btn primary" data-save>' + (isNew ? 'Add' : 'Save changes') + '</button></div>',
  });
  const ff = d.querySelector('[data-ff]'), err = d.querySelector('[data-err]');
  const shown = () => fields.filter(f => !f.show || f.show(v));
  const fieldHtml = f => {
    const val = v[f.key], id = 'pss_' + f.key;
    const ph = f.placeholder ? ' placeholder="' + esc(f.placeholder) + '"' : '';
    const lab = '<label class="qa-cap" for="' + id + '">' + esc(f.label) + '</label>';
    let inner;
    if (f.type === 'chips') {
      const list = f.options(v);
      /* keep the current value pickable even if it is not in the list (e.g. a relation typed on the laptop) */
      if (!f.ref && val != null && val !== '' && !list.some(o => String(o.value) === String(val))) list.push({ value: val, label: String(val) });
      inner = '<div class="qa-cap">' + esc(f.label) + '</div><div class="ph-wrap" role="group" aria-label="' + esc(f.label) + '">' +
        list.map(o => '<button type="button" class="pchip' + (o.sug ? ' sug' : '') + '" data-fk="' + f.key + '" data-fv="' + esc(o.value) + '" aria-pressed="' + (o.value === '' ? val == null || val === '' : val != null && String(o.value) === String(val)) + '">' +
          (o.emoji ? '<span class="e">' + o.emoji + '</span>' : '') + '<span>' + esc(o.label) + '</span></button>').join('') +
        (f.newCat ? '<button type="button" class="pchip ghost" data-newcat="' + f.key + '">+ New</button>' : '') +
        (!list.length && !f.newCat ? '<span class="hint">' + esc(f.empty || 'Nothing to pick yet.') + '</span>' : '') + '</div>';
    } else if (f.type === 'check') {
      inner = '<button type="button" class="pss-sw" role="switch" data-sw="' + f.key + '" aria-checked="' + !!Number(val) + '"><span>' + esc(f.label) + (f.text ? '<small>' + esc(f.text) + '</small>' : '') + '</span><i></i></button>';
    } else if (f.type === 'date') {
      inner = lab + App.dateInput(' id="' + id + '" data-fi="' + f.key + '"', val || '').replace('inputmode="numeric"', 'inputmode="none"');
    } else if (f.type === 'month') {
      inner = lab + '<input type="month" id="' + id + '" data-fi="' + f.key + '" value="' + esc(val || '') + '">';
    } else if (f.type === 'dayrule') {
      inner = '<div class="qa-cap">' + esc(f.label) + '</div><div data-drhost="' + f.key + '"></div>';
    } else {
      const t = f.type === 'email' ? 'email' : f.type === 'pin' ? 'password' : 'text';
      const im = f.inputmode ? ' inputmode="' + f.inputmode + '"' : f.type === 'money' || f.type === 'num' ? ' inputmode="decimal"' : f.type === 'int' || f.type === 'pin' ? ' inputmode="numeric"' : f.type === 'email' ? ' inputmode="email"' : '';
      inner = lab + '<input type="' + t + '" id="' + id + '" data-fi="' + f.key + '"' + im + ph + ' autocomplete="off"' + (f.maxlength ? ' maxlength="' + f.maxlength + '"' : '') +
        (f.autofocus && isNew ? ' autofocus' : '') + (f.type === 'money' ? ' data-money' : '') + ' value="' + esc(val == null ? '' : f.type === 'money' && val !== '' ? App.groupINR(val) : val) + '">';
    }
    return '<div class="pss-f' + (f.half ? ' half' : '') + '">' + inner + (f.hint ? '<div class="hint">' + f.hint + '</div>' : '') + '</div>';
  };
  const draw = () => {
    let sec = null;
    ff.innerHTML = shown().map(f => { let h = ''; if (f.sec && f.sec !== sec) { sec = f.sec; h = '<div class="pss-sec">' + esc(sec) + '</div>'; } return h + fieldHtml(f); }).join('');
    ff.querySelectorAll('[data-drhost]').forEach(h => { const k = h.dataset.drhost; App.dayRule.mount(h, v[k] || 1, c => { v[k] = c; }); });
  };
  draw();
  const byKey = k => fields.find(f => f.key === k);
  ff.addEventListener('input', e => { const k = e.target.dataset.fi; if (!k) return; const f = byKey(k); v[k] = f.type === 'date' ? App.toIso(e.target.value) : e.target.value; if (f.type === 'pin') { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 8); v[k] = e.target.value; } });
  ff.addEventListener('change', e => { const k = e.target.dataset.fi; if (k) v[k] = byKey(k).type === 'date' ? App.toIso(e.target.value) : e.target.value; });
  ff.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('input')) { e.preventDefault(); e.target.blur(); } });
  ff.addEventListener('click', async e => {
    const nc = e.target.closest('[data-newcat]');
    if (nc) {
      const type = v.type || 'expense';
      const r = await App.form({ title: 'New ' + typeLabel(type).toLowerCase() + ' category', fields: [{ name: 'name', label: 'Name', required: true, full: true }], submit: 'Add' });
      if (r && r.name.trim()) { try { v[nc.dataset.newcat] = await App.ensureCategory(r.name.trim(), type); draw(); } catch (ex) { err.textContent = ex.message; } }
      return;
    }
    const sw = e.target.closest('[data-sw]');
    if (sw) { const k = sw.dataset.sw; v[k] = Number(v[k]) ? 0 : 1; sw.setAttribute('aria-checked', String(!!v[k])); const f = byKey(k); if (f.onPick) { f.onPick(v); draw(); } return; }
    const c = e.target.closest('[data-fk]'); if (!c) return;
    const f = byKey(c.dataset.fk), raw = c.dataset.fv;
    if (/^new:/.test(raw)) {                                         // a suggested category: made now, then picked
      const nm = raw.slice(4);
      try { v[f.key] = await App.ensureCategory(nm, v.type || 'expense'); } catch (ex) { err.textContent = ex.message; return; }
      if (f.fillName && !String(v.name || '').trim()) v.name = nm;
      if (f.onPick) f.onPick(v);
      return draw();
    }
    const val = raw === '' && f.ref ? null : f.ref ? Number(raw) : raw;
    if (f.fillName && val && !String(v.name || '').trim()) v.name = (App.opt.categories || []).find(x => x.id === val) ? App.nameOf('categories', val) : v.name;
    v[f.key] = String(v[f.key]) === String(val) && !f.required ? (f.ref ? null : '') : val;
    if (f.onPick) f.onPick(v);
    draw();
  });
  const collect = () => {
    const out = {};
    for (const f of shown()) {
      let x = v[f.key];
      if (f.type === 'money' || f.type === 'num' || f.type === 'int') {
        const n = parseAmt(x);
        if (String(x == null ? '' : x).trim() === '') { if (f.required) return f.label + ' is required'; x = ''; }
        else if (!isFinite(n)) return f.label + ' must be a number';
        else x = f.type === 'int' ? Math.round(n) : n;
      } else if (f.type === 'date') {
        x = x ? App.toIso(x) : '';
        if (x && !/^\d{4}-\d{2}-\d{2}$/.test(x)) return f.label + ': type the date as dd-mm-yyyy';
        if (!x && f.required) return f.label + ' is required';
      } else if (f.type === 'month') {
        x = x || '';
        if (!x && f.required) return f.label + ' is required';
      } else if (f.type === 'check') x = Number(x) ? 1 : 0;
      else if (f.type === 'dayrule') x = App.dayRule.code(x || 1);
      else if (f.type === 'chips') { if (x === '' || x == null) { if (f.required) return 'Pick ' + f.label.toLowerCase(); x = f.ref ? null : ''; } }
      else { x = String(x == null ? '' : x).trim(); if (!x && f.required) return f.label + ' is required'; }
      out[f.key] = x;
    }
    return out;
  };
  let busy = false;
  const setBusy = on => { busy = on; d.querySelectorAll('.qa-foot .btn').forEach(b => { b.disabled = on; }); };
  d.querySelector('[data-save]').onclick = async () => {
    if (busy) return;
    const b = collect();
    if (typeof b === 'string') { err.textContent = b; return; }
    err.textContent = ''; setBusy(true);
    try { const msg = await save(b, v); d.close2(); App.toast(msg || 'Saved'); App.refresh(); }
    catch (ex) { err.textContent = ex.message; setBusy(false); }
  };
  const db = d.querySelector('[data-del]');
  if (db) db.onclick = async () => {
    if (!(await App.confirm(del.message, { okLabel: delLabel, danger: true, title: del.title || 'Delete this?' }))) return;
    setBusy(true);
    try { const msg = await del.run(); d.close2(); App.toast(msg || 'Deleted'); App.refresh(); }
    catch (ex) { err.textContent = ex.message; setBusy(false); }
  };
  return d;
}

/* create / update / delete on /api/setup/<table>, then reload the lookups */
const setup = {
  add: async (table, body) => { const r = await App.api.post('/api/setup/' + table, body); await App.loadOptions(); return r.row; },
  put: async (table, id, body) => { const r = await App.api.put('/api/setup/' + table + '/' + id, body); await App.loadOptions(); return r.row; },
  del: async (table, id) => { const r = await App.api.del('/api/setup/' + table + '/' + id); await App.loadOptions(); return r.archived ? 'In use, so it was hidden instead of deleted' : 'Deleted'; },
};
/* the usual open-a-sheet for one setup table */
const openSetup = ({ table, what, row, fields, defaults, params = {}, after, delMessage, name, afterDel }) => {
  const isNew = !row;
  return editSheet({
    title: isNew ? 'New ' + what : 'Edit ' + what, isNew, fields: isNew ? fields.filter(f => f.key !== 'active') : fields,
    values: isNew ? Object.assign({}, defaults ? defaults() : {}) : row,
    save: async b => {
      const saved = isNew ? await setup.add(table, Object.assign({}, params, b)) : await setup.put(table, row.id, b);
      return (after && (await after(saved, isNew))) || (isNew ? 'Added' : 'Saved');
    },
    del: isNew ? null : { title: 'Delete ' + ((name && name(row)) || 'this ' + what) + '?', message: delMessage || 'This is removed.', run: async () => { const m = await setup.del(table, row.id); if (afterDel) afterDel(m); return m; } },
  });
};
const activeField = text => ({ key: 'active', label: 'Shown in lists', type: 'check', text: text || 'Turn off to hide it without losing its history' });
const inUseMsg = 'If it is already used somewhere, it is hidden instead, so old entries keep it.';

/* ---------- field sets (match pages/settings*.js) ---------- */
const F = {
  people: () => [
    { key: 'name', label: 'Name', type: 'text', required: true, autofocus: true, placeholder: 'Name' },
    { key: 'relation', label: 'Relation', type: 'chips', options: () => RELATIONS.map(r => ({ value: r, label: r })) },
    { key: 'email', label: 'Google account', type: 'email', placeholder: 'name@gmail.com', hint: 'The Gmail address this person signs in with, so the app knows who is adding an entry.' },
    { key: 'earns', label: 'Earns', type: 'check', text: 'Has an income of their own' },
    activeField(),
  ],
  accounts: () => [
    { key: 'name', label: 'Name', type: 'text', required: true, autofocus: true, placeholder: 'Savings account' },
    { key: 'kind', label: 'Kind', type: 'chips', required: true, options: () => opts(ACCT_KINDS) },
    { key: 'provider', label: 'Bank', type: 'text', half: true, show: v => v.kind !== 'cash' },
    { key: 'last4', label: 'Last 4 digits', type: 'int', half: true, maxlength: 4, asText: true, show: v => v.kind === 'bank' || v.kind === 'card' },
    { key: 'owner_id', label: 'Owner', type: 'chips', ref: true, options: peopleOf('owner_id'), empty: 'Add people in Family first.' },
    { key: 'opening_balance', label: 'Opening balance', type: 'money', half: true, placeholder: '0' },
    { key: 'opening_date', label: 'As of', type: 'date', half: true },
    { key: 'credit_limit', label: 'Card limit', type: 'money', show: v => v.kind === 'card', placeholder: '0' },
    { key: 'note', label: 'Note', type: 'text' },
    activeField(),
  ],
  categories: () => [
    { key: 'name', label: 'Category', type: 'text', required: true, autofocus: true, placeholder: 'Groceries' },
    { key: 'type', label: 'Type', type: 'chips', required: true, options: () => opts(TYPES) },
    { key: 'budget', label: 'Monthly budget', type: 'money', placeholder: '0', hint: 'What you expect to spend or receive in a month. Cash flow uses it.' },
    activeField(),
  ],
  loans: () => [
    { key: 'name', label: 'Name', type: 'text', required: true, autofocus: true, placeholder: 'Home loan', sec: 'Loan' },
    { key: 'kind', label: 'Kind', type: 'chips', required: true, options: loanKinds, sec: 'Loan' },
    { key: 'lender', label: 'Lender', type: 'text', sec: 'Loan', placeholder: 'Bank name' },
    { key: 'borrower_id', label: 'Borrower', type: 'chips', ref: true, options: peopleOf('borrower_id'), sec: 'Loan' },
    { key: 'principal', label: 'Amount', type: 'money', required: true, sec: 'Loan' },
    { key: 'rate', label: 'Rate % a year', type: 'num', required: true, half: true, sec: 'Loan' },
    { key: 'tenure_months', label: 'Tenure (months)', type: 'int', required: true, half: true, sec: 'Loan', hint: '' },
    { key: 'start_date', label: 'Start date', type: 'date', required: true, sec: 'Loan', hint: 'Tenure is the number of EMIs, counted from the first EMI month.' },
    { key: 'repay', label: 'Paying', type: 'chips', options: () => opts(REPAY), sec: 'Repayment', hint: 'Interest only: you pay just the interest each month and the amount owed stays the same.' },
    { key: 'interest_until', label: 'Interest only until', type: 'month', sec: 'Repayment', show: v => v.repay === 'interest', hint: 'The last month of interest only; the full EMI starts the month after. Leave empty if there is no end yet.' },
    { key: 'emi_start', label: 'First EMI month', type: 'month', half: true, sec: 'EMI' },
    { key: 'emi_day', label: 'EMI day', type: 'int', half: true, sec: 'EMI', placeholder: '5' },
    { key: 'emi_amount', label: 'EMI (0 = calculate)', type: 'money', sec: 'EMI', placeholder: '0', hint: 'Leave at 0 and it is worked out from the amount, rate and tenure.' },
    { key: 'disbursal', label: 'Releases', type: 'chips', options: () => opts(DISB), sec: 'Releases', hint: 'For a flat under construction pick <b>In stages</b>, then add the stages on the loan screen. Until the first EMI month you pay only pre-EMI interest.' },
    { key: 'prepay_plan', label: 'Prepay plan', type: 'chips', options: () => opts(PREPAY), sec: 'Prepayments' },
    { key: 'prepay_amount', label: 'Prepay ₹', type: 'money', sec: 'Prepayments', show: v => !!v.prepay_plan && v.prepay_plan !== 'none' },
    { key: 'track_from', label: 'Tracking from', type: 'date', sec: 'Already running?', hint: 'For a loan that was running before this app: the date you start entering its payments here, and below what the bank statement said you still owed on that date. Leave both empty for a new loan.' },
    { key: 'track_balance', label: 'Balance then', type: 'money', sec: 'Already running?' },
    { key: 'note', label: 'Note', type: 'text', sec: 'Already running?' },
    Object.assign(activeField(), { sec: 'Already running?' }),
  ],
  stages: () => [
    { key: 'label', label: 'Stage', type: 'text', autofocus: true, placeholder: 'Stage name' },
    { key: 'due_date', label: 'Due date', type: 'date', required: true, half: true },
    { key: 'amount', label: 'Amount', type: 'money', required: true, half: true },
    { key: 'released_date', label: 'Released on', type: 'date', hint: 'Fill this when the bank actually pays the builder.' },
  ],
  rates: () => [
    { key: 'from_date', label: 'From', type: 'date', required: true, half: true },
    { key: 'rate', label: 'Rate %', type: 'num', required: true, half: true },
    { key: 'note', label: 'Note', type: 'text', placeholder: 'Repo cut', hint: 'From that date the new rate applies; the EMI stays the same and the number of months moves, as banks do.' },
  ],
  places: () => [
    { key: 'name', label: 'Name', type: 'text', required: true, autofocus: true, placeholder: 'Mutual fund SIP' },
    { key: 'kind', label: 'Kind', type: 'chips', required: true, options: savKinds },
    { key: 'provider', label: 'Provider', type: 'text', placeholder: 'Fund house or broker' },
    { key: 'owner_id', label: 'Owner', type: 'chips', ref: true, options: peopleOf('owner_id') },
    { key: 'opening_value', label: 'Opening value', type: 'money', half: true, placeholder: '0' },
    { key: 'opening_date', label: 'Opening date', type: 'date', half: true },
    { key: 'monthly_target', label: 'Monthly target', type: 'money', placeholder: '0', hint: 'What you plan to put in each month. Cash flow uses it.' },
    { key: 'maturity_date', label: 'Maturity', type: 'date' },
    { key: 'note', label: 'Note', type: 'text' },
    activeField(),
  ],
  values: () => [
    { key: 'date', label: 'Date', type: 'date', required: true, half: true },
    { key: 'value', label: 'Value', type: 'money', required: true, half: true, autofocus: true, placeholder: 'Worth then' },
    { key: 'note', label: 'Note', type: 'text', placeholder: 'e.g. CAS statement' },
  ],
  /* recurring and planned one-offs: a ledger-like row */
  catField: (key = 'category_id', fillName) => ({ key, label: 'Category', type: 'chips', ref: true, newCat: true, fillName,
    options: v => {
      const t = v.type || 'expense', have = pick('categories', v[key], c => c.type === t);
      const names = new Set(have.map(c => c.name.toLowerCase()));
      return have.map(c => ({ value: c.id, label: c.name, emoji: App.iconFor(c.name, c.type) }))
        .concat((SUGGEST[t] || []).filter(n => !names.has(n.toLowerCase())).map(n => ({ value: 'new:' + n, label: n, emoji: App.iconFor(n, t), sug: true })));
    } }),
  recurring: () => [
    { key: 'type', label: 'Type', type: 'chips', required: true, options: () => opts(TYPES), onPick: v => {
      const c = (App.opt.categories || []).find(x => x.id === v.category_id); if (c && c.type !== v.type) v.category_id = null;
      if (v.type !== 'transfer') v.to_account_id = null;
    } },
    F.catField('category_id', true),
    { key: 'name', label: 'Name', type: 'text', required: true, placeholder: 'What it is called' },
    { key: 'amount', label: 'Amount', type: 'money', required: true },
    { key: 'person_id', label: 'By', type: 'chips', ref: true, options: v => peopleOf('person_id')(v).filter(o => v.type !== 'income' || !/^child$/i.test(((App.opt.people || []).find(p => p.id === o.value) || {}).relation || '')) },
    { key: 'for_id', label: 'For', type: 'chips', ref: true, show: v => (v.type || 'expense') === 'expense', options: v => [{ value: '', label: 'Family', emoji: App.ico('home') }].concat(peopleOf('for_id')(v)) },
    { key: 'method', label: 'Paid via', type: 'chips', options: () => (App.opt.choices.methods || []).map(m => ({ value: m, label: m })), onPick: v => {
      const a = (App.opt.accounts || []).find(x => x.id === v.account_id); if (a && v.method === 'Credit card' && a.kind !== 'card') v.account_id = null;
    } },
    { key: 'account_id', label: 'Account / card', type: 'chips', ref: true, options: v => pick('accounts', v.account_id, a => v.method !== 'Credit card' || a.kind === 'card').map(a => ({ value: a.id, label: a.name + (a.last4 ? ' ••' + a.last4 : '') })),
      onPick: v => { if (v.to_account_id === v.account_id) v.to_account_id = null; } },
    { key: 'to_account_id', label: 'To account', type: 'chips', ref: true, show: v => v.type === 'transfer', options: v => pick('accounts', v.to_account_id, a => a.id !== v.account_id || a.id === v.to_account_id).map(a => ({ value: a.id, label: a.name })) },
    { key: 'loan_id', label: 'Loan', type: 'chips', ref: true, show: v => v.type === 'loan', options: v => pick('loans', v.loan_id).map(l => ({ value: l.id, label: l.name })), empty: 'Add a loan first.' },
    { key: 'loan_part', label: 'Part', type: 'chips', show: v => v.type === 'loan', options: () => opts(PARTS) },
    { key: 'savings_id', label: 'Savings place', type: 'chips', ref: true, show: v => v.type === 'savings', options: v => pick('savings', v.savings_id).map(s => ({ value: s.id, label: s.name })), empty: 'Add a savings place first.' },
    { key: 'frequency', label: 'Frequency', type: 'chips', required: true, options: () => opts(FREQ), sec: 'When' },
    { key: 'day', label: 'When in the month', type: 'dayrule', sec: 'When' },
    { key: 'start_month', label: 'Start month', type: 'month', half: true, sec: 'When' },
    { key: 'end_month', label: 'End month', type: 'month', sec: 'When', hint: 'Leave empty if it has no end.' },
    Object.assign(activeField('Turn off to stop it coming back, without deleting it'), { sec: 'When' }),
  ],
  planned: () => [
    { key: 'month', label: 'Month', type: 'month', required: true },
    { key: 'type', label: 'Type', type: 'chips', required: true, options: () => opts(TYPES.filter(t => t[0] !== 'transfer')), onPick: v => {
      const c = (App.opt.categories || []).find(x => x.id === v.category_id); if (c && c.type !== v.type) v.category_id = null;
    } },
    F.catField(),
    { key: 'description', label: 'Description', type: 'text', placeholder: 'What it is for' },
    { key: 'amount', label: 'Amount', type: 'money', required: true },
    { key: 'person_id', label: 'By', type: 'chips', ref: true, options: peopleOf('person_id') },
    { key: 'note', label: 'Note', type: 'text' },
  ],
};
/* last 4 stays text (keeps leading zeros) */
const fixLast4 = fields => fields.map(f => (f.asText ? Object.assign({}, f, { type: 'text', inputmode: 'numeric' }) : f));

/* ---------- recurring: when does it next come round? ---------- */
const nextDue = App.nextDue = rec => {
  if (rec.active === 0) return null;
  const today = App.today(), cur = thisMonth(), start = rec.start_month || cur, step = rec.frequency === 'quarterly' ? 3 : rec.frequency === 'yearly' ? 12 : 1;
  for (let k = 0; k < 40; k++) {
    const m = App.addMonths(cur, k);
    if (m < start) continue;
    if (rec.end_month && m > rec.end_month) return null;
    if ((mIdx(m) - mIdx(start)) % step) continue;
    const day = App.dayRule.dayIn(rec.day, Number(m.slice(0, 4)), Number(m.slice(5, 7)));
    const iso = m + '-' + String(day).padStart(2, '0');
    if (iso >= today) return iso;
  }
  return null;
};

/* ================= screens ================= */
const S = {};

/* ---------- hub ---------- */
S.hub = async el => {
  const [led] = await settled([App.api.get('/api/ledger?' + App.qs(monthRange()))]);
  const accts = (App.opt.accounts || []).filter(a => a.active !== 0);
  const bal = led ? (led.balances || []).filter(a => a.active !== 0) : [];
  const cash = bal.filter(a => a.kind !== 'card').reduce((s, a) => s + a.balance, 0);
  const due = bal.filter(a => a.kind === 'card' && a.balance < 0).reduce((s, a) => s - a.balance, 0);
  const cats = (App.opt.categories || []).filter(c => c.active !== 0);
  const spent = {}; if (led) led.entries.forEach(e => { if (e.status === 'done' && e.category_id) spent[e.category_id] = (spent[e.category_id] || 0) + e.amount; });
  const over = cats.filter(c => c.type === 'expense' && c.budget > 0 && (spent[c.id] || 0) > c.budget).length;
  const tile = (s, ic, hue, label, sub, wide) => '<button type="button" class="pss-tile' + (wide ? ' wide' : '') + '" data-go="' + esc(s) + '"><span class="ic" style="--h:' + hue + '">' + ic + '</span><span class="tx"><b>' + esc(label) + '</b><span class="s">' + sub + '</span></span></button>';
  const known = ['family', 'pins', 'accounts', 'categories', 'loans', 'savings', 'oneoffs', 'recurring', 'app', 'move'];   // the rest are on Account or under Ahead
  const others = App.settingsTabs.filter(t => !known.includes(t.id));
  el.innerHTML = top('Family Setup', '#/account') +
    '<p class="pss-lead">Your family\'s accounts and the categories money goes on. Tap a tile to change it.</p>' +
    (App.guide ? App.guide.tip('settings', 'Set these once. Family, security, backup, the look and the tour are on the Account page; loans, savings, recurring and planned amounts are under Ahead.') : '') +
    '<div class="pss-tiles">' +
      tile('accounts', App.ico('card'), '#7466d4', 'Accounts and cards', accts.length ? '<em>' + accts.length + ' · ' + App.lakh(cash) + '</em>' + (due ? ' · ' + App.money(due) + ' card due' : '') : 'Banks, cards, cash') +
      tile('categories', App.ico('tag'), '#e0a24f', 'Categories', cats.length ? '<em>' + cats.length + '</em>' + (over ? ' · <span style="color:var(--bad)">' + over + ' over budget</span>' : ' · this month vs budget') : 'What money goes on') +
    '</div>' +
    (others.length ? '<div class="pss-sec-cap">More</div><div class="pss-tiles">' + others.map(t => tile('tab:' + t.id, App.ico('cog'), App.hue(t.label), t.label, 'Open', false)).join('') + '</div>' : '');
  el.addEventListener('click', e => {
    const t = e.target.closest('[data-go]'); if (!t) return;
    const g = t.dataset.go; location.hash = g.startsWith('tab:') ? href('tab', g.slice(4)) : href(g);
  });
};

/* ---------- Family ---------- */
S.family = async el => {
  const { rows } = await App.api.get('/api/setup/people');
  const me = App.me();
  const r = p => row({ attrs: 'data-id="' + p.id + '"', av: p.name, title: p.name + (me && me.id === p.id ? ' (you)' : ''), sub: [p.relation, p.earns ? 'Earns' : '', p.email].filter(Boolean).join(' · '), off: p.active === 0 });
  const act = rows.filter(p => p.active !== 0), hid = rows.filter(p => p.active === 0);
  el.innerHTML = top('Family', '#/account', plusBtn('a person')) +
    '<p class="pss-lead">Everyone who earns or spends. They are the "By" on each entry.</p>' +
    (act.length ? listCard(act.map(r)) : '<div class="ph-card ph-empty">Add yourself first, then the rest of the family.</div>') + hiddenBox(hid.map(r), 'person') +
    (App.family ? '<div class="ph-card fm-inv"><div class="hd"><div><h3>Invite to this family</h3><small>Lets their Google account into the family file, so they can sign in on their own phone.</small></div></div>' +
      '<div class="pss-f"><label class="qa-cap" for="fm_mail">Their Google account (Gmail)</label><input type="email" id="fm_mail" inputmode="email" autocomplete="off" placeholder="name@gmail.com" data-invmail></div>' +
      '<div class="qa-err" role="alert" data-inverr></div>' +
      '<button type="button" class="btn su-add" data-invite>' + App.ico('plus') + '<span>Invite</span></button>' +
      '<div class="fm-code"><span class="qa-cap">Family code</span><code data-code>' + esc(App.family.code) + '</code>' +
      '<div class="pss-actions"><button type="button" class="btn" data-copy>Copy code</button><a class="btn" data-wa href="https://wa.me/?text=' + encodeURIComponent('Join our RuPeace family. Install RuPeace, choose Continue with Google, then Join my family and paste this code: ' + App.family.code) + '">Send on WhatsApp</a></div></div></div>' : '');
  const open = p => openSetup({ table: 'people', what: 'person', row: p, fields: F.people(), name: x => x.name, delMessage: (p ? p.name : '') + ' is removed from Family. ' + inUseMsg });
  el.addEventListener('click', async e => {
    if (e.target.closest('[data-copy]')) {
      try { await navigator.clipboard.writeText(App.family.code); App.toast('Family code copied'); }
      catch (ex) {                                                  // older WebViews: copy through a hidden box
        const t = document.createElement('textarea'); t.value = App.family.code; t.setAttribute('readonly', ''); t.style.cssText = 'position:fixed;opacity:0;top:0';
        document.body.appendChild(t); t.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (e2) { ok = false; } t.remove();
        App.toast(ok ? 'Family code copied' : 'Could not copy. Use Send on WhatsApp instead.', !ok);
      }
      return;
    }
    const iv = e.target.closest('[data-invite]');
    if (iv) {
      const mail = el.querySelector('[data-invmail]').value.trim(), er = el.querySelector('[data-inverr]');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) { er.textContent = 'Type their Google email address'; return; }
      iv.disabled = true; er.textContent = '';
      try {
        await App.family.invite(mail, (App.me() || {}).name || '');
        const p = rows.find(x => String(x.email || '').toLowerCase() === mail.toLowerCase());
        App.toast(p ? p.name + ' can join now. Send them the family code.' : 'Invited. Add them here too, with this email.');
        el.querySelector('[data-invmail]').value = '';
      } catch (ex) { er.textContent = ex.message; }
      iv.disabled = false;
      return;
    }
    if (e.target.closest('[data-new]')) return open(null);
    const b = e.target.closest('[data-id]'); if (b) open(rows.find(x => String(x.id) === b.dataset.id));
  });
};

/* ---------- Accounts and cards: drawn like bank cards ---------- */
S.accounts = async el => {
  const [{ rows }, led] = await settled([App.api.get('/api/setup/accounts'), App.api.get('/api/ledger?' + App.qs(monthRange()))]);
  const bal = {}; ((led && led.balances) || []).forEach(a => { bal[a.id] = a.balance; });
  const card = a => {
    const k = ACCT_KINDS.find(x => x[0] === a.kind) || ACCT_KINDS[0], b = bal[a.id] || 0, isCard = a.kind === 'card';
    const owed = isCard ? Math.max(0, -b) : 0, lim = Number(a.credit_limit) || 0;
    return '<button type="button" class="pss-bc' + (a.active === 0 ? ' off' : '') + '" style="--g:var(' + (a.active === 0 ? '--pss-off' : '--pss-' + a.kind) + ')" data-id="' + a.id + '" aria-label="' + esc(a.name + ', ' + k[1]) + '">' +
      '<div class="top"><span>' + k[2] + ' ' + esc(k[1]) + (a.provider ? ' · ' + esc(a.provider) : '') + '</span>' + (isCard || a.kind === 'bank' ? '<span class="chipi" aria-hidden="true"></span>' : '') + '</div>' +
      '<div class="mid"><div class="k">' + (isCard ? (owed ? 'Card bill due' : b > 0 ? 'In credit' : 'Nothing due') : 'Balance') + '</div><div class="v">' + App.inr(isCard ? (owed || b) : b) + '</div>' +
        (isCard && lim ? '<div class="lim"><i style="width:' + Math.min(100, owed / lim * 100).toFixed(1) + '%"></i></div><div class="limt">Limit ' + App.money(lim) + ' · ' + App.money(Math.max(0, lim - owed)) + ' free</div>' : '') + '</div>' +
      '<div class="bot"><div><div class="nm">' + esc(a.name) + '</div><div class="ow">' + esc(personName(a.owner_id) || (a.kind === 'cash' ? 'Household' : '—')) + (a.active === 0 ? ' · hidden' : '') + '</div></div>' +
        (a.last4 ? '<span class="l4">•••• ' + esc(a.last4) + '</span>' : '') + '</div></button>';
  };
  const act = rows.filter(a => a.active !== 0), hid = rows.filter(a => a.active === 0);
  const cash = act.filter(a => a.kind !== 'card').reduce((s, a) => s + (bal[a.id] || 0), 0);
  const due = act.filter(a => a.kind === 'card').reduce((s, a) => s + Math.max(0, -(bal[a.id] || 0)), 0);
  el.innerHTML = top('Accounts and cards', HUB, plusBtn('an account or card')) +
    (act.length ? '<div class="ph-sum"><div><div class="k">Bank and cash</div><div class="v">' + App.money(cash) + '</div></div><div><div class="k">Cards due</div><div class="v' + (due ? ' neg' : '') + '">' + App.money(due) + '</div></div><div><div class="k">Accounts</div><div class="v">' + act.length + '</div></div></div>' +
      '<div class="pss-cards">' + act.map(card).join('') + '</div>' : '<div class="ph-card ph-empty">Add your bank accounts, credit cards and cash. In an entry, "Account / card" picks from these.</div>') +
    (hid.length ? '<details class="pss-hid"><summary>Hidden · ' + plural(hid.length, 'account') + '</summary><div class="pss-cards">' + hid.map(card).join('') + '</div></details>' : '');
  const open = a => openSetup({ table: 'accounts', what: a && a.kind === 'card' ? 'card' : 'account', row: a, fields: fixLast4(F.accounts()), name: x => x.name,
    defaults: () => ({ kind: 'bank', opening_date: App.today() }), delMessage: (a ? a.name : '') + ' is removed. ' + inUseMsg });
  el.addEventListener('click', e => { if (e.target.closest('[data-new]')) return open(null); const b = e.target.closest('[data-id]'); if (b) open(rows.find(x => String(x.id) === b.dataset.id)); });
};

/* ---------- Categories: grouped by type, this month vs plan ---------- */
const ring = (pct, cls, emoji) => { const C = 2 * Math.PI * 17, p = Math.max(0, Math.min(1, pct)); return '<span class="pss-ring ' + cls + '"><svg viewBox="0 0 42 42"><circle class="bg" cx="21" cy="21" r="17"/>' + (p > 0 ? '<circle class="fg" cx="21" cy="21" r="17" stroke-dasharray="' + (p * C).toFixed(1) + ' ' + C.toFixed(1) + '"/>' : '') + '</svg><span class="e">' + emoji + '</span></span>'; };
S.categories = async el => {
  const [{ rows }, led] = await settled([App.api.get('/api/setup/categories'), App.api.get('/api/ledger?' + App.qs(monthRange()))]);
  const got = {}; ((led && led.entries) || []).forEach(e => { if (e.status === 'done' && e.category_id) got[e.category_id] = (got[e.category_id] || 0) + e.amount; });
  const mon = App.month(thisMonth());
  const exp = rows.filter(c => c.type === 'expense' && c.active !== 0), planTot = exp.reduce((s, c) => s + (c.budget || 0), 0), spentTot = exp.reduce((s, c) => s + (got[c.id] || 0), 0);
  const catRow = c => {
    const a = got[c.id] || 0, b = c.budget || 0, isIn = c.type === 'income', overP = b > 0 && a > b && !isIn;
    const cls = overP ? 'over' : isIn && b && a >= b ? 'good' : '';
    const left = b ? (isIn ? (a >= b ? 'all in' : kfmt(b - a) + ' to come') : overP ? kfmt(a - b) + ' over' : kfmt(b - a) + ' left') : '';
    return '<button type="button" class="ph-row pss-catrow' + (c.active === 0 ? ' off' : '') + '" data-id="' + c.id + '">' + ring(b ? a / b : 0, cls, App.iconFor(c.name, c.type)) +
      '<span class="nm"><b>' + esc(c.name) + '</b>' + (b ? '<div class="pss-cbar ' + cls + '"><i style="width:' + Math.min(100, a / b * 100).toFixed(1) + '%"></i></div>' : '<span>' + (a ? ({ income: 'Received', savings: 'Put in', loan: 'Paid', transfer: 'Moved' }[c.type] || 'Spent') + ' this month' : 'No budget') + '</span>') + '</span>' +
      '<span class="am"><span class="amt ' + (overP ? 'over' : '') + '">' + kfmt(a) + (b ? ' <span style="color:var(--muted);font-weight:600">/ ' + kfmt(b, false) + '</span>' : '') + '</span>' + (left ? '<small class="' + (overP ? 'neg' : cls === 'good' ? 'pos' : '') + '">' + left + '</small>' : '') + '</span></button>';
  };
  const chip = c => '<button type="button" class="pchip" data-id="' + c.id + '"><span class="e">' + App.iconFor(c.name, c.type) + '</span><span>' + esc(c.name) + '</span></button>';
  const groups = TYPES.filter(([t]) => !qp('su') || t === 'expense').map(([t, l]) => {
    const all = rows.filter(c => c.type === t), act = all.filter(c => c.active !== 0), hid = all.filter(c => c.active === 0);
    if (!all.length && t !== 'expense') return '';
    const tracked = act.filter(c => c.budget > 0 || got[c.id]), rest = act.filter(c => !(c.budget > 0 || got[c.id]));
    return '<section>' + cap(esc(TYPE_GROUP[t] || l) + ' · ' + act.length) +
      '<div class="ph-card">' + (tracked.length ? '<div class="ph-list">' + tracked.map(catRow).join('') + '</div>' : '') +
      '<div class="pss-chipbox"' + (tracked.length ? '' : ' style="padding-top:2px"') + '>' + (rest.length ? '<div class="cap">' + (tracked.length ? 'No budget and nothing this month' : 'Tap one to change it') + '</div>' : '') +
      '<div class="ph-wrap">' + rest.map(chip).join('') + '<button type="button" class="pchip ghost" data-newcat="' + t + '">+ New</button></div>' +
      (t === 'expense' ? (() => { const have = new Set(all.map(c => c.name.toLowerCase())), sug = SUGGEST.expense.filter(n => !have.has(n.toLowerCase()));
        return sug.length ? '<div class="cap" style="margin-top:10px">Common ones: tap to add</div><div class="ph-wrap">' + sug.map(n => '<button type="button" class="pchip sug" data-sugcat="' + esc(n) + '"><span class="e">' + App.iconFor(n, 'expense') + '</span><span>' + esc(n) + '</span></button>').join('') + '</div>' : ''; })() : '') +
      '</div></div>' +
      hiddenBox(hid.map(catRow), 'category') + '</section>';
  }).join('');
  el.innerHTML = top('Categories', HUB, plusBtn('a category')) +
    (planTot || spentTot ? '<section class="ph-hero"><div class="lbl"><span>Spending in ' + esc(mon) + ' vs budget</span></div><div class="big">' + App.inr(spentTot) + '<small>of ' + App.money(planTot) + '</small></div>' +
      '<div class="ph-bar" style="background:rgba(255,255,255,.2)"><i style="width:' + (planTot ? Math.min(100, spentTot / planTot * 100) : 0).toFixed(1) + '%;background:#fff"></i></div>' +
      '<div class="note" style="margin:0">' + (planTot ? (spentTot > planTot ? App.inr(spentTot - planTot) + ' over the monthly budget' : App.inr(planTot - spentTot) + ' left in the monthly budget') : 'No monthly budgets set yet') + '</div></section>' : '') +
    groups + '<p class="hint" style="text-align:center">Categories also get made when you type a new one while adding an entry. "Monthly budget" feeds Cash flow.</p>';
  const open = (c, type) => openSetup({ table: 'categories', what: 'category', row: c, fields: F.categories(), name: x => x.name, defaults: () => ({ type: type || 'expense' }), delMessage: (c ? c.name : '') + ' is removed. ' + inUseMsg });
  el.addEventListener('click', e => {
    if (e.target.closest('[data-new]')) return open(null);
    const n = e.target.closest('[data-newcat]'); if (n) return open(null, n.dataset.newcat);
    const sg = e.target.closest('[data-sugcat]');
    if (sg) { sg.disabled = true; App.ensureCategory(sg.dataset.sugcat, 'expense').then(id => { const c = (App.opt.categories || []).find(x => x.id === id); App.refresh(); if (c) open(c); }).catch(App.fail); return; }
    const b = e.target.closest('[data-id]'); if (b) open(rows.find(x => String(x.id) === b.dataset.id));
  });
};

/* ---------- Loans: list, then a detail screen ---------- */
const openLoan = (L, o) => openSetup({ table: 'loans', what: 'loan', row: L, fields: F.loans(), name: x => x.name,
  defaults: () => ({ kind: 'home', start_date: App.today(), emi_day: 5, emi_amount: 0, disbursal: 'full', prepay_plan: 'none', repay: 'emi' }),
  delMessage: (L ? L.name : 'This loan') + ' is removed with its stages and rate changes. If payments were already entered for it, it is hidden instead.',
  after: (row, isNew) => { if (isNew && !(o && o.stay)) setTimeout(() => { location.hash = href('loan', row.id); }, 0); return isNew ? 'Loan added' : 'Saved'; },
  afterDel: m => { if (m === 'Deleted' && /[?&]s=loan&/.test(location.hash + '&')) replaceTo('#/loans'); } });
S.loans = async el => {
  const [d, st] = await settled([App.api.get('/api/loans'), App.api.get('/api/setup/loans')]);
  const rows = (st && st.rows) || [], info = {}; ((d && d.loans) || []).forEach(l => { info[l.id] = l; });
  const f = (d && d.family) || {};
  const r = L => { const x = info[L.id] || {}, s = String(x.status || ''); return row({ attrs: 'data-id="' + L.id + '"', ic: App.ico('bank'), hue: App.hue(L.name), title: L.name, off: L.active === 0,
    sub: [App.label(L.kind), L.lender, (x.rate_now || L.rate) ? (x.rate_now || L.rate) + '%' : ''].filter(Boolean).join(' · '),
    amt: App.money(x.outstanding || 0), small: x.next_due ? 'next ' + dshort(x.next_due.date) : esc(LSTATUS[s] || App.label(s)), smallCls: x.missed ? 'neg' : '' }); };
  const act = rows.filter(L => L.active !== 0), hid = rows.filter(L => L.active === 0);
  el.innerHTML = top('Loans', HUB, plusBtn('a loan')) +
    (act.length ? '<div class="ph-sum"><div><div class="k">Still to repay</div><div class="v">' + App.money(f.outstanding || 0) + '</div></div><div><div class="k">Monthly</div><div class="v">' + App.money(f.monthly || 0) + '</div></div><div><div class="k">Debt-free</div><div class="v">' + esc(f.debt_free ? App.month(f.debt_free) : '—') + '</div></div></div>' +
      listCard(act.map(r)) : '<div class="ph-card ph-empty">No loans yet. Tap + to add your home, car or personal loan. Payments are entered as type Loan.</div>') +
    hiddenBox(hid.map(r), 'loan');
  el.addEventListener('click', e => { if (e.target.closest('[data-new]')) return openLoan(null, { stay: !!qp('su') }); const b = e.target.closest('[data-id]'); if (b) location.hash = href('loan', b.dataset.id); });
};
const kindOf = (r, io) => (r.kind === 'pre_emi' && !r.plan_payment && r.released ? 'Release' : r.kind === 'emi' ? 'EMI' : io ? 'Interest' : 'Pre-EMI');
/* a row added offline has a temporary id until it syncs: follow it to its real id (and fix the address) */
const realId = (table, s, id) => {
  const r = App.sync && App.sync.realId ? App.sync.realId(table, id) : id;
  if (String(r) !== String(id)) { try { history.replaceState(null, '', href(s, r)); trail[trail.length - 1] = location.hash; } catch (e) { /* ignore */ } }
  return r;
};
S.loan = async (el, id) => {
  id = realId('loans', 'loan', id);
  const [st, sch, stages, rates] = await settled([App.api.get('/api/setup/loans'), App.api.get('/api/loans/' + id + '/schedule'),
    App.api.get('/api/setup/loan_stages?' + App.qs({ loan_id: id })), App.api.get('/api/setup/loan_rates?' + App.qs({ loan_id: id }))]);
  const L = ((st && st.rows) || []).find(x => String(x.id) === String(id));
  if (!L) { el.innerHTML = top('Loan', '#/loans') + '<div class="ph-card ph-empty">This loan is not there any more.</div>'; return; }
  const s = (sch && sch.summary) || {}, sched = (sch && sch.rows) || [], stg = (stages && stages.rows) || [], rts = (rates && rates.rows) || [];
  const nd = s.next_due, now = thisMonth();
  const stgSum = stg.reduce((a, r) => a + (Number(r.amount) || 0), 0), diff = Math.round((L.principal || 0) - stgSum);
  /* payment timeline grouped by year (this year open) */
  const years = []; sched.forEach(r => { const y = r.month.slice(0, 4); const g = years[years.length - 1]; if (g && g.y === y) g.rows.push(r); else years.push({ y, rows: [r] }); });
  const tl = r => {
    const mo = Number(r.month.slice(5, 7)), k = kindOf(r, s.repay === 'interest'), amt = r.plan_payment || r.due || 0;
    const title = k === 'Release' ? 'Release ' + App.money(r.released) : (amt ? k + ' ' + App.inr(amt) : k + ' · nothing due') + (r.plan_prepay ? ' + ' + App.money(r.plan_prepay) + ' prepay' : '');
    const sub = [r.paid ? 'Paid ' + App.inr(r.paid) : /^(missed|short|due|overdue)$/.test(r.status || '') ? 'Nothing paid yet' : '', r.prepaid ? 'prepaid ' + App.money(r.prepaid) : '', r.released && k !== 'Release' ? 'release ' + App.money(r.released) + (r.released_actual ? '' : ' planned') : '', r.interest ? 'interest ' + App.inr(r.interest) : '', Number(r.rate).toFixed(2) + '%'].filter(Boolean).join(' · ');
    const stt = r.status || '', [tt, tc] = ST[stt] || [stt, ''];
    const balv = r.actual_balance != null ? r.actual_balance : r.plan_balance;
    return '<div class="ph-row' + (r.current ? ' cur' : '') + '"><span class="ic pss-mo" style="--h:var(--accent)">' + App.MN[mo - 1] + '</span><span class="nm"><b>' + esc(title) + '</b><span>' + esc(sub) + '</span></span>' +
      '<span class="am"><span class="amt" style="font-size:14px">' + App.money(balv) + '</span>' + (stt ? tagOf(tt, tc) : '<small>owed</small>') + '</span></div>';
  };
  const yearBox = g => {
    const paid = g.rows.reduce((a, r) => a + (r.past || r.current ? r.paid + (r.prepaid || 0) : 0), 0), plan = g.rows.reduce((a, r) => a + (r.plan_payment || 0) + (r.plan_prepay || 0), 0);
    const open = g.y === now.slice(0, 4);
    return '<details class="pss-yr"' + (open ? ' open' : '') + '><summary><span>' + g.y + '<small>' + (g.y < now.slice(0, 4) ? 'paid ' + App.money(paid) : g.y === now.slice(0, 4) ? 'paid ' + App.money(paid) + ' of ' + App.money(plan) : 'plan ' + App.money(plan)) + '</small></span><span class="chev">›</span></summary>' +
      '<div class="ph-list">' + g.rows.map(tl).join('') + '</div></details>';
  };
  const stRow = r => row({ attrs: 'data-stage="' + r.id + '"', ic: r.released_date ? App.ico('check') : App.ico('crane'), hue: r.released_date ? 'var(--good)' : 'var(--accent)', title: r.label || 'Stage', sub: 'Due ' + App.date(r.due_date) + (r.released_date ? ' · released ' + App.date(r.released_date) : ''), amt: App.money(r.amount), tag: r.released_date ? tagOf('Released', 'good') : tagOf('Not yet', '') });
  const rtRow = r => row({ attrs: 'data-rate="' + r.id + '"', ic: App.ico('percent'), hue: 'var(--accent)', title: Number(r.rate).toFixed(2) + '% a year', sub: 'From ' + App.date(r.from_date) + (r.note ? ' · ' + r.note : ''), amt: '' });
  el.innerHTML = top(L.name, '#/loans', editBtn) +
    '<section class="ph-hero"><div class="lbl"><span>' + (s.released ? 'Still to repay' : 'Nothing released yet') + '</span><span>' + esc(LSTATUS[s.status] || App.label(s.status || '')) + (L.active === 0 ? ' · hidden' : '') + '</span></div>' +
      '<div class="big">' + App.money(s.outstanding || 0) + '</div>' +
      '<div class="note">' + esc([App.label(L.kind), L.lender, personName(L.borrower_id)].filter(Boolean).join(' · ')) + (s.missed ? ' · ' + s.missed + ' missed' : '') + '</div>' +
      '<div class="trio"><div>' + (nd && nd.kind === 'pre_emi' ? (s.repay === 'interest' ? 'Next interest' : 'Next pre-EMI') : 'Next EMI') + '<b>' + (nd ? App.inr(nd.amount) : '—') + '</b>' + (nd ? '<span style="font-size:11px">' + esc(dshort(nd.date)) + '</span>' : '') + '</div>' +
      '<div>Loan-free<b>' + esc(s.loan_free ? App.month(s.loan_free) : s.repay === 'interest' ? 'Not yet' : '—') + '</b></div><div>Rate now<b>' + (s.rate_now != null ? Number(s.rate_now).toFixed(2) + '%' : '—') + '</b></div></div></section>' +
    '<div class="ph-card"><div class="pss-facts ph-kv">' +
      '<div><div class="k">' + (s.repay === 'interest' && !s.emi_start ? 'Interest a month' : 'EMI') + '</div><div class="v">' + App.inr(s.emi || 0) + '</div></div>' +
      '<div><div class="k">From</div><div class="v">' + esc(s.emi_start ? App.month(s.emi_start) : '—') + '</div></div>' +
      '<div><div class="k">Released</div><div class="v">' + App.money(s.released || 0) + '</div></div>' +
      '<div><div class="k">Of</div><div class="v">' + App.money(L.principal || 0) + '</div></div>' +
      '<div><div class="k">Interest on plan</div><div class="v">' + App.money(s.interest_plan || 0) + '</div></div>' +
      '<div><div class="k">Planned loan-free</div><div class="v">' + esc(s.loan_free_plan ? App.month(s.loan_free_plan) : '—') + '</div></div></div>' +
      (s.released > 0 ? '<div class="ph-bar"><i style="width:' + Math.min(100, Math.max(0, (s.principal_paid || 0) / s.released * 100)).toFixed(1) + '%"></i></div><div class="ph-foot"><span>' + Math.round((s.principal_paid || 0) / s.released * 100) + '% of what was released is repaid</span></div>' : '') +
      '<p class="pss-note">' + [s.repay === 'interest' ? (s.interest_until ? 'interest only until ' + App.month(s.interest_until) + ', then the full EMI' : 'interest only: the amount owed stays the same until you prepay') : '',
        s.repay === 'interest' && !s.interest_until ? '' : s.emi_calculated ? 'EMI worked out from the amount, rate and tenure' : 'EMI as you set it',
        s.prepay_plan && s.prepay_plan !== 'none' && s.prepay_amount ? 'planned prepayments save <b>' + App.lakh(s.interest_saved_by_plan || 0) + '</b> interest (without them: ' + esc(s.loan_free_no_prepay ? App.month(s.loan_free_no_prepay) : '—') + ')' : '',
        s.track_from ? 'tracked from ' + App.date(s.track_from) + ' (' + App.lakh(s.track_balance || 0) + ' owed then)' : ''].filter(Boolean).join(' · ').replace(/^./, c => c.toUpperCase()) + '.</p></div>' +
    (L.disbursal === 'stages' || stg.length ? '<section>' + cap('Release stages', '<button type="button" class="pss-pill" data-newstage>' + I.plus + 'Stage</button>') +
      (!stg.length ? '<div class="ph-card ph-empty">No stages yet. Add each payment the bank makes to the builder.</div>'
        : stg.length <= 4 ? listCard(stg.map(stRow))
        : '<details class="pss-hid pss-stg"><summary>' + plural(stg.length, 'stage') + ' · ' + stg.filter(r => r.released_date).length + ' released · next ' +
          esc((stg.find(r => !r.released_date) || {}).label || '—') + '</summary>' + listCard(stg.map(stRow)) + '</details>') +
      '<p class="hint" style="margin:6px 2px 0">Stages add up to <b>' + App.inr(stgSum) + '</b> of ' + App.inr(L.principal) + (diff ? ' · <span style="color:var(--bad)">' + (diff > 0 ? App.inr(diff) + ' not in any stage' : App.inr(-diff) + ' more than the loan') + '</span>' : ' ✓') + '</p></section>' : '') +
    '<section>' + cap('Rate changes', '<button type="button" class="pss-pill" data-newrate>' + I.plus + 'Rate</button>') +
      (rts.length ? listCard(rts.map(rtRow)) : '<div class="ph-card ph-empty" style="padding:18px 10px">No rate changes. Add one when the bank changes the rate.</div>') + '</section>' +
    '<section>' + cap('Payment timeline', '<span style="font-weight:500">' + plural(sched.length, 'month') + '</span>') +
      (years.length ? '<div class="ph-card" style="padding-top:2px;padding-bottom:2px">' + years.map(yearBox).join('') + '</div>' : '<div class="ph-card ph-empty">No months to show yet.</div>') +
      '<p class="hint" style="margin:6px 2px 0">Balances are real up to this month, then projected from today.</p></section>';
  const openStage = r => openSetup({ table: 'loan_stages', what: 'stage', row: r, fields: F.stages(), params: { loan_id: L.id }, defaults: () => ({ due_date: App.today() }), delMessage: 'This release stage is removed.', name: x => x.label || 'this stage' });
  const openRate = r => openSetup({ table: 'loan_rates', what: 'rate change', row: r, fields: F.rates(), params: { loan_id: L.id }, defaults: () => ({ from_date: App.today() }), delMessage: 'This rate change is removed.' });
  el.addEventListener('click', e => {
    if (e.target.closest('[data-edit]')) return openLoan(L);
    if (e.target.closest('[data-newstage]')) return openStage(null);
    if (e.target.closest('[data-newrate]')) return openRate(null);
    const a = e.target.closest('[data-stage]'); if (a) return openStage(stg.find(x => String(x.id) === a.dataset.stage));
    const b = e.target.closest('[data-rate]'); if (b) return openRate(rts.find(x => String(x.id) === b.dataset.rate));
  });
};

/* ---------- Savings places: list, then a detail screen ---------- */
const openPlace = (p, o) => openSetup({ table: 'savings_places', what: 'savings place', row: p, fields: F.places(), name: x => x.name,
  defaults: () => ({ kind: 'mutual_fund', opening_date: App.today() }),
  delMessage: (p ? p.name : 'This place') + ' is removed with its value updates. If savings entries already use it, it is hidden instead.',
  after: (row, isNew) => { if (isNew && !(o && o.stay)) setTimeout(() => { location.hash = href('place', row.id); }, 0); return isNew ? 'Savings place added' : 'Saved'; },
  afterDel: m => { if (m === 'Deleted' && /[?&]s=place&/.test(location.hash + '&')) replaceTo('#/savings'); } });
S.savings = async el => {
  const [d, st] = await settled([App.api.get('/api/savings'), App.api.get('/api/setup/savings_places')]);
  const rows = (st && st.rows) || [], info = {}; ((d && d.places) || []).forEach(p => { info[p.id] = p; });
  const T = (d && d.totals) || {};
  const r = p => { const x = info[p.id] || {}; return row({ attrs: 'data-id="' + p.id + '"', ic: SAV_ICON[p.kind] || App.ico('piggy'), hue: App.hue(p.name), title: p.name, off: p.active === 0,
    sub: [savKindLabel(p.kind), personName(p.owner_id), p.provider].filter(Boolean).join(' · '), amt: App.money(x.value_now || 0),
    small: x.gain ? (x.gain > 0 ? '+' : '') + App.money(x.gain) : p.monthly_target ? App.money(p.monthly_target) + '/mo' : '', smallCls: x.gain > 0 ? 'pos' : x.gain < 0 ? 'neg' : '' }); };
  const act = rows.filter(p => p.active !== 0), hid = rows.filter(p => p.active === 0);
  el.innerHTML = top('Savings places', HUB, plusBtn('a savings place')) +
    (act.length ? '<div class="ph-sum"><div><div class="k">Worth now</div><div class="v">' + App.money(T.value_now || 0) + '</div></div><div><div class="k">Put in</div><div class="v">' + App.money(T.put_in_total || 0) + '</div></div><div><div class="k">Target / mo</div><div class="v">' + App.money(T.monthly_target || 0) + '</div></div></div>' +
      listCard(act.map(r)) : '<div class="ph-card ph-empty">No savings places yet. Tap + to add your mutual funds, PPF, EPF, NPS, FDs and so on.</div>') +
    hiddenBox(hid.map(r), 'place');
  el.addEventListener('click', e => { if (e.target.closest('[data-new]')) return openPlace(null, { stay: !!qp('su') }); const b = e.target.closest('[data-id]'); if (b) location.hash = href('place', b.dataset.id); });
};
S.place = async (el, id) => {
  id = realId('savings_places', 'place', id);
  const [st, det, vals] = await settled([App.api.get('/api/setup/savings_places'), App.api.get('/api/savings/' + id), App.api.get('/api/setup/savings_values?' + App.qs({ place_id: id }))]);
  const P = ((st && st.rows) || []).find(x => String(x.id) === String(id));
  if (!P) { el.innerHTML = top('Savings place', '#/savings') + '<div class="ph-card ph-empty">This savings place is not there any more.</div>'; return; }
  const x = (det && det.place) || {}, hist = (det && det.rows) || [], vs = (vals && vals.rows) || [];
  const tgt = x.monthly_target > 0, pct = tgt ? Math.min(100, x.this_month / x.monthly_target * 100) : 0;
  const vRow = r => row({ attrs: 'data-val="' + r.id + '"', ic: App.ico('chart'), hue: 'var(--accent)', title: 'Worth ' + App.inr(r.value), sub: App.date(r.date) + (r.note ? ' · ' + r.note : '') });
  const groups = []; hist.forEach(h => { const y = String(h.date || '').slice(0, 4); const g = groups[groups.length - 1]; if (g && g.y === y) g.rows.push(h); else groups.push({ y, rows: [h] }); });
  const hRow = h => '<div class="ph-row" style="cursor:default"><span class="ic" style="--h:' + (h.value != null ? 'var(--accent)' : 'var(--good)') + '">' + (h.value != null ? App.ico('chart') : h.added ? App.ico('plus') : '•') + '</span>' +
    '<span class="nm"><b>' + esc(h.what || '') + (h.added ? ' ' + App.inr(h.added) : h.value != null ? ' · ' + App.inr(h.value) : '') + '</b><span>' + esc([App.date(h.date), h.detail, h.by].filter(Boolean).join(' · ')) + '</span></span>' +
    '<span class="am"><span class="amt" style="font-size:14px">' + App.money(h.worth != null ? h.worth : 0) + '</span><small>' + (h.status === 'pending' ? 'to confirm' : 'worth then') + '</small></span></div>';
  el.innerHTML = top(P.name, '#/savings', editBtn) +
    '<section class="ph-hero"><div class="lbl"><span>Worth now</span><span>' + esc(savKindLabel(P.kind)) + (P.active === 0 ? ' · hidden' : '') + '</span></div><div class="big">' + App.money(x.value_now || 0) + '</div>' +
      '<div class="note">' + (x.value_as_of ? 'Value checked ' + esc(App.date(x.value_as_of)) + ', plus money added after it' : 'No value update yet, so it shows what was put in') + '</div>' +
      '<div class="trio"><div>Put in<b>' + App.money(x.put_in_total || 0) + '</b></div><div>Gain<b>' + (x.gain ? (x.gain > 0 ? '+' : '') + App.money(x.gain) : '—') + '</b></div><div>This month<b>' + App.money(x.this_month || 0) + '</b></div></div></section>' +
    (tgt ? '<div class="ph-card"><div class="hd"><div><h3>Monthly target</h3><small>' + App.inr(x.this_month) + ' of ' + App.inr(x.monthly_target) + ' this month</small></div>' + tagOf(x.target_met ? 'Target met' : 'Below target', x.target_met ? 'good' : 'warn') + '</div><div class="ph-bar' + (x.target_met ? ' good' : '') + '" style="margin-top:0"><i style="width:' + pct.toFixed(1) + '%"></i></div></div>' : '') +
    '<div class="ph-card"><div class="pss-facts ph-kv"><div><div class="k">Owner</div><div class="v">' + esc(personName(P.owner_id) || '—') + '</div></div><div><div class="k">Provider</div><div class="v">' + esc(P.provider || '—') + '</div></div>' +
      '<div><div class="k">Opening value</div><div class="v">' + App.money(P.opening_value || 0) + '</div></div><div><div class="k">Matures</div><div class="v">' + esc(P.maturity_date ? App.date(P.maturity_date) : '—') + '</div></div></div></div>' +
    '<section>' + cap('Value updates', '<button type="button" class="pss-pill" data-newval>' + I.plus + 'Value</button>') +
      (vs.length ? listCard(vs.map(vRow)) : '<div class="ph-card ph-empty" style="padding:18px 10px">No value updates yet. Add one whenever you check a statement.</div>') + '</section>' +
    '<section>' + cap('History') + (hist.length ? '<div class="ph-card ph-list">' + groups.map(g => '<div class="ph-day"><span>' + esc(g.y) + '</span><span></span></div>' + g.rows.map(hRow).join('')).join('') + '</div>' : '<div class="ph-card ph-empty">Nothing put in yet. Savings entries in the ledger that pick this place show up here.</div>') + '</section>';
  const openVal = r => openSetup({ table: 'savings_values', what: 'value update', row: r, fields: F.values(), params: { place_id: P.id }, defaults: () => ({ date: App.today() }), delMessage: 'This value update is removed.' });
  el.addEventListener('click', e => {
    if (e.target.closest('[data-edit]')) return openPlace(P);
    if (e.target.closest('[data-newval]')) return openVal(null);
    const b = e.target.closest('[data-val]'); if (b) openVal(vs.find(v => String(v.id) === b.dataset.val));
  });
};

/* ---------- Recurring ---------- */
const openRecurring = (x, preset) => openSetup({ table: 'recurring', what: preset && preset.type === 'income' ? 'income' : preset && preset.type === 'expense' ? 'bill' : 'recurring row', row: x, fields: F.recurring(), name: y => y.name,
  defaults: () => Object.assign({ type: 'expense', frequency: 'monthly', day: 1, start_month: thisMonth(), method: 'UPI', person_id: (App.me() || {}).id || null },
    preset && preset.type === 'income' ? { method: 'Bank transfer' } : {}, preset || {}),
  delMessage: (x ? x.name : '') + ' stops coming back. Rows already in the ledger stay as they are.',
  after: async saved => { const s = await App.api.post('/api/ledger/recurring/' + saved.id + '/sync', {}); return s && (s.updated || s.removed) ? 'Saved · this month’s pending row ' + (s.removed ? 'removed' : 'updated') : 'Saved'; } });
S.recurring = async el => {
  const { rows } = await App.api.get('/api/setup/recurring');
  const fr = r => (FREQ.find(f => f[0] === r.frequency) || ['', 'Monthly'])[1];
  const r = x => { const nd = nextDue(x); return row({ attrs: 'data-id="' + x.id + '"', ic: App.iconFor(x.name || App.nameOf('categories', x.category_id), x.type), hue: App.hue(x.name), title: x.name, off: x.active === 0,
    sub: [fr(x) + (x.day ? ' · ' + App.dayRule.label(x.day).replace(/^on /, '') : ''), App.nameOf('categories', x.category_id), x.method, App.nameOf('accounts', x.account_id)].filter(Boolean).join(' · '),
    amt: (x.type === 'income' ? '+' : '') + App.inr(x.amount), amtCls: x.type === 'income' ? 'in' : x.type === 'savings' ? 'sav' : x.type === 'transfer' ? 'mv' : '',
    small: nd ? 'next ' + dshort(nd) : x.active === 0 ? '' : 'ended' }); };
  const only = qp('t');                                                // setup: income only, or bills only
  const act = rows.filter(x => x.active !== 0 && (!only || x.type === only)), hid = rows.filter(x => x.active === 0 && (!only || x.type === only));
  const monthly = act.filter(x => x.type !== 'income' && x.type !== 'transfer').reduce((s, x) => s + x.amount / (x.frequency === 'quarterly' ? 3 : x.frequency === 'yearly' ? 12 : 1), 0);
  el.innerHTML = top('Recurring', null, aheadRight(plusBtn('a recurring row'))) +
    '<p class="pss-lead">Each one shows up in the ledger on its day as a row to confirm. Deleting that ledger row skips it for that month only.</p>' +
    (act.length ? '<div class="ph-sum"><div><div class="k">Going out a month</div><div class="v">' + App.money(monthly) + '</div></div><div><div class="k">Rows</div><div class="v">' + act.length + '</div></div></div>' +
      TYPES.map(([t]) => { const g = act.filter(x => x.type === t); return g.length ? '<section>' + cap(esc(TYPE_GROUP[t])) + listCard(g.map(r)) + '</section>' : ''; }).join('')
      : '<div class="ph-card ph-empty">' + (only === 'income' ? 'No regular income yet.' : only ? 'No regular bills yet.' : 'Nothing recurring yet. Tap + to add your rent, EMIs, SIPs and subscriptions.') + '</div>') +
    hiddenBox(hid.map(r), 'row');
  const open = x => openRecurring(x, only ? { type: only } : null);
  el.addEventListener('click', e => { if (e.target.closest('[data-new]')) return open(null); const b = e.target.closest('[data-id]'); if (b) open(rows.find(x => String(x.id) === b.dataset.id)); });
};

/* ---------- Planned one-offs ---------- */
const openPlanned = x => openSetup({ table: 'planned_items', what: 'planned one-off', row: x, fields: F.planned(), name: () => 'this planned one-off',
  defaults: () => ({ type: 'expense', month: thisMonth() }), delMessage: 'It is removed from Cash flow.' });
S.oneoffs = async el => { location.replace('#/bombs'); };
S.oneoffsOld = async el => {
  const { rows } = await App.api.get('/api/setup/planned_items');
  const cur = thisMonth();
  const r = x => { const cat = App.nameOf('categories', x.category_id); return row({ attrs: 'data-id="' + x.id + '"', ic: App.iconFor(cat || x.description, x.type), hue: App.hue(cat || x.description), title: x.description || cat || typeLabel(x.type),
    sub: [x.description && cat ? cat : '', typeLabel(x.type), personName(x.person_id), x.note].filter(Boolean).join(' · '),
    amt: (x.type === 'income' ? '+' : '') + App.inr(x.amount), amtCls: x.type === 'income' ? 'in' : x.type === 'savings' ? 'sav' : '' }); };
  const byMonth = list => { const g = []; list.forEach(x => { const l = g[g.length - 1]; if (l && l.m === x.month) l.rows.push(x); else g.push({ m: x.month, rows: [x] }); }); return g; };
  const ahead = rows.filter(x => x.month >= cur), past = rows.filter(x => x.month < cur);
  const monthBlock = g => '<div class="ph-day"><span>' + esc(App.month(g.m)) + '</span><span>' + App.money(g.rows.reduce((s, x) => s + (x.type === 'income' ? 0 : x.amount), 0)) + ' out</span></div>' + g.rows.map(r).join('');
  el.innerHTML = top('Planned one-offs', null, aheadRight(plusBtn('a planned one-off'))) +
    '<p class="pss-lead">Big one-time amounts you expect in a month: a hospital bill, school admission, a bonus. Cash flow adds each one to its month.</p>' +
    (ahead.length ? '<div class="ph-card ph-list">' + byMonth(ahead).map(monthBlock).join('') + '</div>' : '<div class="ph-card ph-empty">Nothing planned ahead. Example: Feb 2027 · Expense · Medical · Delivery · ₹3,00,000.</div>') +
    (past.length ? '<details class="pss-hid"><summary>Earlier months · ' + plural(past.length, 'item') + '</summary><div class="ph-card ph-list">' + byMonth(past).map(monthBlock).join('') + '</div></details>' : '');
  const open = openPlanned;
  el.addEventListener('click', e => { if (e.target.closest('[data-new]')) return open(null); const b = e.target.closest('[data-id]'); if (b) open(rows.find(x => String(x.id) === b.dataset.id)); });
};

/* ---------- Events: a rough budget for a trip or a festival (spends are linked to it when added) ---------- */
const EVENT_FIELDS = () => [
  { key: 'name', label: 'Name', type: 'text', required: true, placeholder: 'Goa trip, Diwali, a wedding…' },
  { key: 'start_date', label: 'From', type: 'date', required: true, half: true },
  { key: 'end_date', label: 'Until', type: 'date', half: true, hint: 'Leave Until empty for a single day. While the dates are on, new spends are linked to it for you.' },
  { key: 'budget', label: 'Budget', type: 'money', required: true, hint: 'A rough amount is fine: you will see how much is spent against it.' },
  { key: 'note', label: 'Note', type: 'text' },
];
const openEvent = x => openSetup({ table: 'events', what: 'event', row: x, fields: EVENT_FIELDS(), name: r => r.name,
  defaults: () => ({ start_date: App.today() }), delMessage: 'Its spends stay in Activity; they are just not linked to it any more.',
  after: (saved, isNew) => {
    App.events = null;
    const r = App.qaResume;                                           // came from the entry screen's "+ New event": back to it, linked
    if (isNew && r && saved && saved.id && App.quickAdd) { App.qaResume = null; setTimeout(() => App.quickAdd({ preset: Object.assign({}, r.preset, { event_id: saved.id }), amount: r.amount, desc: r.desc }), 350); }
  } });

/* ---------- Bombs: one exact amount on a date, money in (a bonus) or out (a delivery). On the day it waits on Home to
   be confirmed, and the amount can be changed then. Stored in planned_items (month + day). ---------- */
const BOMB_FIELDS = () => [
  { key: 'type', label: 'Money', type: 'chips', required: true, options: () => [{ value: 'expense', label: 'Going out' }, { value: 'income', label: 'Coming in' }], onPick: v => {
    const c = (App.opt.categories || []).find(x => x.id === v.category_id); if (c && c.type !== v.type) v.category_id = null;
  } },
  { key: 'description', label: 'What it is', type: 'text', required: true, placeholder: 'Bonus, delivery, stamp duty…' },
  { key: 'amount', label: 'Amount', type: 'money', required: true },
  { key: 'when', label: 'On', type: 'date', required: true },
  F.catField(),
  { key: 'person_id', label: 'By', type: 'chips', ref: true, options: peopleOf('person_id') },
  { key: 'note', label: 'Note', type: 'text' },
];
const openBomb = x => {
  const isNew = !x, isBomb = !x || x.type === 'income' || x.type === 'expense';
  const row = x ? Object.assign({}, x, { when: x.month + '-' + String(Math.max(1, x.day || 1)).padStart(2, '0') }) : null;
  const toRow = b => { const o = Object.assign({}, b); if (o.when) { o.month = o.when.slice(0, 7); o.day = Number(o.when.slice(8, 10)); } delete o.when; return o; };
  return editSheet({
    title: isNew ? 'New bomb' : 'Edit bomb', isNew, fields: isBomb ? BOMB_FIELDS() : F.planned(),
    values: isNew ? { type: 'expense', when: App.today() } : row,
    save: async b => { if (isNew) await setup.add('planned_items', toRow(b)); else await setup.put('planned_items', x.id, toRow(b)); App.bombs = null; return isNew ? 'Added' : 'Saved'; },
    del: isNew ? null : { title: 'Delete ' + (x.description || 'this bomb') + '?', message: 'It is taken out of the months ahead, and its row to confirm goes too.', run: async () => { const m = await setup.del('planned_items', x.id); App.bombs = null; return m; } },
  });
};

/* ---------- the + on the Loans, Savings and Cash flow tabs (core/phone.js) opens these ---------- */
const pickOne = (kind, key, label, empty) => ({ key, label, type: 'chips', ref: true, required: true, empty, options: v => pick(kind, v[key]).map(x => ({ value: x.id, label: x.name })) });
const onlyOne = kind => { const l = pick(kind); return l.length === 1 ? l[0].id : null; };
App.phAdd = {
  loan: o => openLoan(null, o),
  rate: () => openSetup({ table: 'loan_rates', what: 'rate change', fields: [pickOne('loans', 'loan_id', 'Loan', 'Add a loan first.')].concat(F.rates()),
    defaults: () => ({ from_date: App.today(), loan_id: onlyOne('loans') }) }),
  place: o => openPlace(null, o),
  value: () => openSetup({ table: 'savings_values', what: 'value update', fields: [pickOne('savings', 'place_id', 'Savings place', 'Add a savings place first.')].concat(F.values()),
    defaults: () => ({ date: App.today(), place_id: onlyOne('savings') }) }),
  recurring: () => openRecurring(null),
  planned: x => openBomb(x || null),
  bomb: x => openBomb(x || null),
  event: x => openEvent(x || null),
};

/* ---------- PINs (Google version: only when the PINs settings tab exists) ---------- */
S.pins = async el => {
  if (!App.settingsTabs.find(t => t.id === 'pins')) { el.innerHTML = top('PINs', '#/account') + '<div class="ph-card ph-empty">PINs are only used in the Google version.</div>'; return; }
  const d = await App.api.get('/api/auth/pins');
  const people = d.people.filter(p => p.active !== 0 || p.has_pin);
  el.innerHTML = top('PINs', '#/account') +
    '<p class="pss-lead">Each person signs in on their phone with their own PIN (4 to 8 digits, all different). Forgot one? Use "First time here, or forgot your PIN?" on the sign-in screen with the setup code.</p>' +
    (people.length ? listCard(people.map(p => row({ attrs: 'data-id="' + p.id + '"', av: p.name, title: p.name + (p.id === d.me ? ' (you)' : ''), sub: p.has_pin ? 'Tap to change the PIN' : 'Tap to set a PIN', tag: tagOf(p.has_pin ? 'PIN set' : 'No PIN', p.has_pin ? 'good' : '') })))
      : '<div class="ph-card ph-empty">Add people in Family first.</div>') +
    '<div class="pss-actions">' + (App.signOut ? '<button type="button" class="btn" data-signout>Sign out of this device</button>' : '') + '</div>';
  el.addEventListener('click', e => {
    if (e.target.closest('[data-signout]')) return App.signOut();
    const b = e.target.closest('[data-id]'); if (!b) return;
    const p = people.find(x => String(x.id) === b.dataset.id);
    editSheet({ title: (p.has_pin ? 'Change PIN · ' : 'Set PIN · ') + p.name, isNew: true,
      fields: [{ key: 'pin', label: 'New PIN', type: 'pin', required: true, autofocus: true, maxlength: 8, hint: '4 to 8 digits, different from everyone else’s.' }],
      save: async b2 => { if (!/^\d{4,8}$/.test(String(b2.pin))) throw new Error('A PIN is 4 to 8 digits'); await App.api.put('/api/auth/pins/' + p.id, { pin: String(b2.pin) }); return 'PIN saved for ' + p.name; },
      del: p.has_pin && p.id !== d.me ? { title: 'Remove ' + p.name + '’s PIN?', message: 'They are signed out on every device until a new PIN is set.', run: async () => { await App.api.del('/api/auth/pins/' + p.id); return 'PIN removed'; } } : null,
      delLabel: 'Remove' });
    const sv = document.querySelector('dialog.pss-sheet [data-save]'); if (sv) sv.textContent = 'Save PIN';
  });
};

/* ---------- Backup and move data ---------- */
/* save everything as one .json file (Downloads in the Android app); resolves the number of rows */
const saveBackup = async tag => {
  const data = await App.api.get('/api/export');
  const name = 'rupeace-' + (tag || 'backup') + '-' + App.today() + '.json', text = JSON.stringify(data, null, 1);
  if (!(window.RuPeaceAndroid && window.RuPeaceAndroid.saveText(name, text))) {   // the Android app saves through its own bridge
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  if (App.guide) App.guide.mark('backup');
  return Object.values(data.tables || {}).reduce((n, t) => n + (t ? t.length : 0), 0);
};
/* when a backup was made, in plain words */
const bkWhen = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }); };
const bkKind = k => ({ daily: 'Automatic', 'before-reset': 'Before a reset', 'before-restore': 'Before a restore' }[k] || 'Saved by hand');
const bkAgo = ms => { const m = Math.round((Date.now() - ms) / 60000); return m < 2 ? 'just now' : m < 60 ? m + ' minutes ago' : m < 2880 ? Math.round(m / 60) + ' hours ago' : Math.round(m / 1440) + ' days ago'; };
/* a backup in Drive (falls back to a file in Downloads when Drive backups are not switched on yet) */
const backupNow = async kind => {
  try { const r = await App.api.post('/api/backups', { kind: kind || 'manual' }); if (App.guide) App.guide.mark('backup'); return { drive: true, backup: r.backup }; }
  catch (ex) { if (!/authorizeDrive|Drive/.test(ex.message)) throw ex; return { drive: false, rows: await saveBackup(kind === 'before-reset' ? 'before-reset' : 'backup') }; }
};
S.backup = async el => {
  el.innerHTML = top('Backup and reset', '#/account') +
    '<div class="ph-card"><div class="hd"><div><h3>Backups in Google Drive</h3><small>Made every day by themselves, and before a reset or a restore. The newest 30 are kept, in the "RuPeace backups" folder.</small></div></div>' +
      '<div data-bk class="bk-list"><div class="bk-load"><span class="bk-spin"></span>Looking in Google Drive…</div></div>' +
      '<div class="pss-actions"><button type="button" class="btn primary" data-bknow>Back up now</button></div></div>' +
    '<details class="pss-hid bk-files"><summary>Files on this phone</summary><div class="ph-card">' +
      '<p class="pss-lead" style="margin:0 0 10px">Save a copy as a file in Downloads, or load one from a file.</p>' +
      '<div class="pss-actions" style="margin-bottom:10px"><button type="button" class="btn" data-backup>Save a copy to Downloads</button></div>' +
      '<div class="pss-tab" data-move></div></div></details>' +
    '<div class="ph-card pss-danger"><div class="hd"><div><h3>Reset data</h3><small>A clean slate: erases everything, on Google and on every phone, including the family and every PIN. RuPeace then starts like a fresh install. A backup is saved to Google Drive first.</small></div></div>' +
      '<div class="pss-actions"><button type="button" class="btn danger" data-reset>Reset data…</button></div></div>';
  const host = el.querySelector('[data-bk]');
  let list = [];
  const draw = async () => {
    try {
      const d = await App.api.get('/api/backups');
      list = d.backups || [];
      host.innerHTML = (d.last ? '<p class="bk-last">Last backup ' + esc(bkAgo(d.last)) + '</p>' : '') +
        (list.length ? '<div class="ph-list">' + list.map((b, k) => '<button type="button" class="ph-row" data-bk-i="' + k + '"><span class="ic" style="--h:' + (b.kind === 'daily' ? '#3fb58a' : b.kind === 'manual' ? '#7466d4' : '#e0a24f') + '">' + App.ico('save') + '</span>' +
          '<span class="nm"><b>' + esc(bkWhen(b.created)) + '</b><span>' + plural(b.entries, 'entry', 'entries') + ' · ' + plural(b.people, 'person', 'people') + ' · ' + esc(bkKind(b.kind)) + '</span></span><span class="go">›</span></button>').join('') + '</div>'
          : '<div class="ph-empty" style="padding:14px 4px">No backups yet. Tap Back up now, or wait for tonight\'s automatic one.</div>') +
        '<a class="bk-folder" href="' + esc(d.folder_url) + '" target="_blank" rel="noopener">Open the folder in Google Drive ›</a>';
    } catch (ex) {
      host.innerHTML = '<div class="pss-warn">' + (/authorizeDrive/.test(ex.message)
        ? '<b>Drive backups are not switched on yet.</b> The owner gives a one-time OK in Google: open the RuPeace script and run <b>authorizeDrive</b>. Until then, Back up now saves a file to Downloads.'
        : esc(ex.message)) + '</div>';
    }
  };
  draw();
  host.addEventListener('click', e => {
    const r = e.target.closest('[data-bk-i]'); if (!r) return;
    const b = list[Number(r.dataset.bkI)];
    const d = App.bsheet({ title: 'Restore this backup?', cls: 'qa pss-sheet', focus: false, body:
      '<div class="bk-pick"><span class="ic" style="--h:var(--accent)">' + App.ico('save') + '</span><span><b>' + esc(bkWhen(b.created)) + '</b><small>' + plural(b.entries, 'entry', 'entries') + ' · ' + plural(b.people, 'person', 'people') + ' · ' + plural(b.accounts, 'account') + ' · ' + esc(bkKind(b.kind)) + '</small></span></div>' +
      '<div class="pss-warn"><b>Everything in RuPeace is replaced</b> with this backup, on every phone. What is here now is backed up to Drive first, so nothing is lost. ' + (App.security ? 'Your sign-in and PIN stay as they are.' : 'PINs stay as they are.') + '</div>' +
      '<div class="qa-err" role="alert" data-err></div>' +
      '<div class="qa-foot"><button type="button" class="btn" data-bs-close>Cancel</button><button type="button" class="btn primary" data-go>Restore</button></div>' });
    const go = d.querySelector('[data-go]'), err = d.querySelector('[data-err]');
    go.onclick = async () => {
      go.disabled = true; go.textContent = 'Restoring…'; err.textContent = '';
      try {
        const res = await App.api.post('/api/backups/restore', { id: b.id, confirm: 'REPLACE' });
        await App.loadOptions();
        d.close2();
        App.toast('Restored · ' + ((res.restored && res.restored.entries) || 0) + ' entries');
        location.replace('#/home'); App.refresh();
      } catch (ex) { err.textContent = ex.message; go.disabled = false; go.textContent = 'Restore'; }
    };
  });
  el.querySelector('[data-bknow]').onclick = async e => {
    const btn = e.currentTarget; btn.disabled = true; btn.textContent = 'Backing up…';
    try { const r = await backupNow('manual'); App.toast(r.drive ? 'Backed up to Google Drive' : 'Saved to Downloads · ' + r.rows + ' rows'); if (r.drive) draw(); }
    catch (ex) { App.fail(ex); }
    btn.disabled = false; btn.textContent = 'Back up now';
  };
  el.querySelector('[data-backup]').onclick = async e => {
    const btn = e.currentTarget; btn.disabled = true;
    try { App.toast('Saved to Downloads · ' + (await saveBackup()) + ' rows'); } catch (ex) { App.fail(ex); }
    btn.disabled = false;
  };
  el.querySelector('[data-reset]').onclick = () => {
    const drv = !!App.security;                                      // app 2.0: the family file in Google Drive
    const d = App.bsheet({ title: 'Reset data', cls: 'qa pss-sheet', focus: false, body: (drv
      ? '<div class="pss-warn"><b>This erases everything</b> in the family\'s file, on every phone: entries, accounts, categories, loans, savings, recurring rows, events, bombs, plans and the family list.</div>' +
        '<p class="pss-lead" style="margin:0">A backup goes to Google Drive first, so you can bring it back from this page. You stay signed in, with the same PIN; you are added back as the first person.</p>'
      : '<div class="pss-warn"><b>This erases everything</b> on Google and on every phone: entries, accounts, categories, loans, savings, recurring rows, planned expenses, plans, ' +
        'the family and every PIN, including yours. Nothing is kept.</div>' +
      '<p class="pss-lead" style="margin:0">A backup goes to Google Drive first. RuPeace then opens like a fresh install: you will need the <b>setup code</b>, and it offers to bring that backup back.</p>') +
      '<div class="pss-f"><label class="qa-cap" for="pss_reset">Type RESET to confirm</label><input type="text" id="pss_reset" autocomplete="off" autocapitalize="characters" placeholder="RESET" data-rs></div>' +
      '<div class="qa-err" role="alert" data-err></div>' +
      '<div class="qa-foot"><button type="button" class="btn" data-bs-close>Cancel</button><button type="button" class="btn danger" data-go>Erase everything</button></div>' });
    const inp = d.querySelector('[data-rs]'), err = d.querySelector('[data-err]'), go = d.querySelector('[data-go]');
    go.onclick = async () => {
      if (inp.value.trim().toUpperCase() !== 'RESET') { err.textContent = 'Type RESET to confirm'; inp.focus(); return; }
      inp.blur();
      const body = d.querySelector('.bs-body'), was = body.innerHTML;
      body.innerHTML = '<div class="rs-busy" role="status"><span class="bk-spin"></span><b>Backing up and erasing…</b><small>A backup goes to Google Drive, then everything is erased. This takes a few seconds; keep the app open.</small></div>';
      d.querySelector('.bs-x').hidden = true;
      const close2 = d.close2; d.close2 = () => {};                             // Back or a tap outside does not close it half way
      try {
        try { await App.api.post('/api/reset', { confirm: 'RESET', backup: true }); }           // one trip: backup and erase
        catch (ex) {
          if (!/Drive/.test(ex.message)) throw ex;
          await saveBackup('before-reset');                                    // Drive backups not switched on: a file on the phone
          await App.api.post('/api/reset', { confirm: 'RESET' });
        }
        // the app restarts from scratch (google/client/bridge.js)
      } catch (ex) {
        body.innerHTML = was; d.querySelector('.bs-x').hidden = false; d.close2 = close2;
        d.querySelector('[data-err]').textContent = ex.message;
        d.querySelector('[data-go]').onclick = go.onclick;
      }
    };
  };
  const mv = App.settingsTabs.find(t => t.id === 'move');
  if (mv) await mv.render(el.querySelector('[data-move]'));
};

/* ---------- Help and tour (core/phone-guide.js) ---------- */
S.help = async el => { if (App.guide) App.guide.help(el, top('Help and tour', '#/account')); else el.innerHTML = top('Help and tour', '#/account'); };

/* ---------- Look ---------- */
S.look = async el => {
  el.innerHTML = top('Look', '#/account') +
    '<div class="ph-card pss-look"><div class="hd"><div><h3>Theme</h3><small>Light, dark, or follow the phone setting. Saved on this device.</small></div></div>' + App.themeSeg() + '</div>' +
    '<section class="ph-hero"><div class="lbl"><span>Preview</span></div><div class="big">₹42,500</div><div class="note">Cards and lists follow the theme you pick.</div></section>';
};

/* ---------- any other Settings tab (added later by another file): its desktop render, inside a phone screen ---------- */
S.tab = async (el, id) => {
  const t = App.settingsTabs.find(x => x.id === id);
  el.innerHTML = top(t ? t.label : 'Family Setup', HUB) + '<div class="pss-tab" data-tab></div>';
  if (t) await t.render(el.querySelector('[data-tab]'));
  else el.querySelector('[data-tab]').innerHTML = '<div class="ph-card ph-empty">This part of Settings is not in this version.</div>';
};

/* ================= first-run setup: the same pages as later, one step at a time =================
   #/settings?s=<page>&su=<step>: the page as always, with a setup bar on top (step k of 7, what to do here, a big Add
   button, Back and Next). Home's "What the setup covers" and #/welcome open these. */
const SETUP = [
  { id: 'family', s: 'family', t: 'You and your family', sub: 'Everyone whose money goes in or out', ic: 'family', say: 'Add everyone whose money goes in or out: your spouse, children, parents.', add: 'Add a person' },
  { id: 'accounts', s: 'accounts', t: 'Accounts and cards', sub: 'Banks, cards, cash', ic: 'card', say: 'Your bank accounts, credit cards and cash: where money is kept and spent from.', add: 'Add an account or card' },
  { id: 'pay', s: 'recurring', q: { t: 'income' }, t: 'Money coming in', sub: 'Salary, business, rent received', ic: 'briefcase', say: 'Income that comes regularly. It shows up on its day for you to confirm.', add: 'Add income' },
  { id: 'bills', s: 'recurring', q: { t: 'expense' }, t: 'Regular bills', sub: 'Rent, electricity, fees, insurance', ic: 'bulb', say: 'Bills that come back every month, every 3 months or every year.', add: 'Add a bill' },
  { id: 'plans', s: 'categories', t: 'Monthly budgets', sub: 'Groceries, fuel, eating out: a rough limit for each', ic: 'basket', say: 'Things you spend on bit by bit, like groceries, fuel or eating out. Tap one and give it a rough monthly budget.', add: 'Add a category' },
  { id: 'loans', s: 'loans', t: 'Loans', sub: 'Optional: home, car, personal, gold', ic: 'bank', say: 'Optional. Home, car, personal or gold loans, with their EMIs.', add: 'Add a loan' },
  { id: 'savings', s: 'savings', t: 'Savings', sub: 'Optional: SIPs, PPF, FDs, gold', ic: 'piggy', say: 'Optional. Where you put money away: mutual funds, PPF, EPF, FDs, gold.', add: 'Add a savings place' },
];
App.SETUP = SETUP;
App.setupHref = id => { const st = SETUP.find(x => x.id === id) || SETUP[0]; return HUB + '?' + App.qs(Object.assign({ s: st.s }, st.q || {}, { su: st.id })); };
/** [done?] for each step, read from the data (the same everywhere) */
App.setupStatus = async () => {
  const [rec, cats] = await Promise.all([App.api.get('/api/setup/recurring').catch(() => ({ rows: [] })), App.api.get('/api/setup/categories').catch(() => ({ rows: [] }))]);
  const recs = (rec.rows || []).filter(r => r.active !== 0), o = k => (App.opt[k] || []).filter(x => x.active !== 0);
  return [App.familyDone(), o('accounts').length > 0, recs.some(r => r.type === 'income'), recs.some(r => r.type === 'expense'),
    (cats.rows || []).some(c => c.type === 'expense' && c.budget > 0), o('loans').length > 0, o('savings').length > 0];
};
let suWas = {};
const setupBar = async (el, id) => {
  const k = SETUP.findIndex(x => x.id === id); if (k < 0) return;
  const st = SETUP[k], ok = await App.setupStatus(), done = ok[k], nx = SETUP[k + 1];
  const people = (App.opt.people || []).filter(p => p.active !== 0), accts = (App.opt.accounts || []).filter(a => a.active !== 0);
  const extra = st.id === 'family' && people.length === 1 && !done ? '<button type="button" class="su-link" data-su-solo>It is just me</button>'
    : st.id === 'accounts' && !accts.some(a => a.kind === 'cash') ? '<button type="button" class="su-link" data-su-cash>+ Cash (money in hand)</button>' : '';
  const bar = document.createElement('div');
  bar.className = 'su-bar';
  bar.innerHTML = '<div class="su-head"><span>Setup · step ' + (k + 1) + ' of ' + SETUP.length + '</span><a href="#/home" class="su-exit">Exit setup</a></div>' +
    '<div class="su-dots" aria-hidden="true" style="--n:' + SETUP.length + '">' + SETUP.map((x, j) => '<i class="' + (ok[j] ? 'ok' : '') + (j === k ? ' on' : '') + '"></i>').join('') + '<span class="su-cur" style="--k:' + k + '"></span></div>' +
    '<p class="su-say">' + esc(st.say) + '</p>' +
    '<button type="button" class="btn su-add' + (done ? ' again' : '') + '" data-new>' + App.ico('plus') + '<span>' + esc(done ? (st.id === 'pay' ? 'Add more income' : st.add.replace(/^Add (a|an) /, 'Add another ')) : st.add) + '</span></button>' + extra +
    '<div class="su-nav">' + (k ? '<a class="btn su-prev" href="' + esc(App.setupHref(SETUP[k - 1].id)) + '"><span class="ar">‹</span> Previous</a>' : '<span></span>') +
      (nx ? '<a class="btn su-next' + (done ? ' primary' : '') + '" href="' + esc(App.setupHref(nx.id)) + '"><span>' + (done ? 'Next' : 'Skip for now') + '</span> <span class="ar">›</span></a>'
        : '<a class="btn su-next primary" href="#/home"><span>Finish setup</span> <span class="ar">›</span></a>') + '</div>';
  if (suWas.id === st.id && suWas.done === false && done && !App.reduced()) bar.classList.add('su-won');     // just got done: the dot pops, Next fills in
  suWas = { id: st.id, done };
  const topEl = el.querySelector('.ph-top');
  if (topEl) {
    topEl.after(bar);
    const t = topEl.querySelector('.ph-title'); if (t) t.textContent = st.t;
    const b = topEl.querySelector('[data-back]'); if (b) b.dataset.back = '#/home';
    const plus = topEl.querySelector('.pss-plus'); if (plus) plus.remove();                // the big Add button is enough
    el.querySelectorAll('.ph-empty').forEach(n => { n.innerHTML = n.innerHTML.replace(/Tap \+ to add/g, 'Tap the button above to add').replace(/Tap \+/g, 'Tap the button above'); });
  } else el.prepend(bar);
  bar.addEventListener('click', async e => {
    if (e.target.closest('[data-su-solo]')) { try { localStorage.setItem('rp.familySolo', '1'); } catch (ex) { /* ignore */ } location.hash = App.setupHref('accounts'); return; }
    if (e.target.closest('[data-su-cash]')) { try { await setup.add('accounts', { name: 'Cash', kind: 'cash' }); App.toast('Cash added'); App.refresh(); } catch (ex) { App.fail(ex); } }
  });
};

/* ================= Account (the photo top right opens it): who you are, sync, family, this phone, the app ================= */
const ACI = {
  sync: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.6-4.5L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.6 4.5L20 16"/><path d="M20 20v-4h-4"/></svg>',
  invite: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="8" r="4"/><path d="M3 20a7 7 0 0 1 12-4.9"/><path d="M19 14v6M16 17h6"/></svg>',
  dark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>',
  light: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  auto: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="2" width="10" height="20" rx="2.5"/><path d="M11 18h2"/></svg>',
};
const THEME_NAME = { light: 'Light', dark: 'Dark', auto: 'Auto' };
App.phonePage('account', {
  title: 'Account',
  async render(el) {
    const me = App.me() || {}, pr = App.profile || {}, fam = App.family;
    const name = pr.name || me.name || 'You', email = (fam && App.familyEmail ? App.familyEmail() : '') || (App.opt && App.opt.me && App.opt.me.email) || me.email || '';
    const pic = pr.photo ? '<img src="' + esc(pr.photo) + '" alt="" referrerpolicy="no-referrer" onerror="this.remove()">' : '';
    const syncOn = !!(App.syncUI && App.syncUI.on && App.syncUI.on());
    const lr = (href, ic, hue, t, sub) => '<a class="ph-row" href="' + href + '"><span class="ic" style="--h:' + hue + '">' + App.ico(ic) + '</span><span class="nm"><b>' + esc(t) + '</b><span>' + esc(sub) + '</span></span><span class="go">' + I.right + '</span></a>';
    el.className = 'ph pss pss-account';
    el.innerHTML = '<div class="ph-top"><div class="pss-tl"><button type="button" class="ph-ib" data-acc-back aria-label="Back">' + I.left + '</button><div class="ph-title">Account</div></div></div>' +
      '<section class="ac-prof"><span class="ac-av">' + pic + '<span>' + esc(name.trim().charAt(0).toUpperCase()) + '</span></span><span class="ac-who"><b>' + esc(name) + '</b>' +
        (email ? '<span>' + esc(email) + '</span>' : '') + (fam && fam.name ? '<span>' + esc(fam.name) + '</span>' : '') + (syncOn ? App.syncUI.line() : '') + '</span></section>' +
      /* round actions (approved: C): Sync now, Invite, the theme */
      '<div class="ac-acts">' +
        (syncOn ? '<button type="button" class="ac-act" data-sync-act="retry" data-sync-round><i>' + ACI.sync + '</i>Sync now</button>' : '') +
        '<a class="ac-act" href="' + HUB + '?s=family"><i>' + ACI.invite + '</i>' + (fam ? 'Invite' : 'Family') + '</a>' +
        '<button type="button" class="ac-act" data-ac-theme aria-haspopup="true" aria-expanded="false"><i>' + ACI[App.themePref()] + '</i><span>' + THEME_NAME[App.themePref()] + '</span></button>' +
        '<div class="ac-tmenu" role="menu" hidden>' + ['light', 'dark', 'auto'].map(k => '<button type="button" role="menuitemradio" data-theme-set="' + k + '" aria-checked="' + (App.themePref() === k) + '">' + ACI[k] + (k === 'auto' ? 'Follow phone' : THEME_NAME[k]) + '</button>').join('') + '</div>' +
      '</div>' +
      cap('This phone') + '<div class="ph-card ph-list">' + lr(HUB + '?s=security', 'lock', '#4e9fd1', 'Security', App.security ? 'PIN, fingerprint' : 'PINs') +
        lr(HUB + '?s=backup', 'save', '#6a8fe0', 'Backup and reset', 'Backups in Google Drive, restore, start over') + '</div>' +
      cap('App') + '<div class="ph-card ph-list">' + lr(HUB, 'cog', '#9a7fd8', 'Family Setup', 'Accounts and categories') +
        lr(HUB + '?s=help', 'target', '#3aaea3', 'Help and tour', 'The step-by-step guide, again') + '</div>' +
      (App.signOut ? '<button type="button" class="btn ac-out" data-signout>Sign out</button>' : '') +
      (App.deleteMyData ? '<button type="button" class="ac-del" data-delmine>Delete my RuPeace data</button>' : '');
    el.addEventListener('click', e => {
      if (e.target.closest('[data-acc-back]')) { if (history.length > 1) history.back(); else location.hash = '#/home'; return; }
      if (e.target.closest('[data-signout]')) App.signOut();
      if (e.target.closest('[data-delmine]')) return deleteMine();
      const menu = el.querySelector('.ac-tmenu'), tb = el.querySelector('[data-ac-theme]');
      const show = on => { menu.hidden = !on; tb.setAttribute('aria-expanded', String(on)); };
      if (e.target.closest('[data-ac-theme]')) return show(menu.hidden);
      const pick = e.target.closest('.ac-tmenu [data-theme-set]');
      if (pick) {                                                   // core.js sets the theme; here the button follows
        const k = pick.dataset.themeSet;
        tb.querySelector('i').innerHTML = ACI[k]; tb.querySelector('span').textContent = THEME_NAME[k];
        menu.querySelectorAll('[data-theme-set]').forEach(b => b.setAttribute('aria-checked', String(b === pick)));
        return setTimeout(() => show(false), 160);
      }
      if (!menu.hidden && !e.target.closest('.ac-tmenu')) show(false);
    });
    if (syncOn) App.syncUI.paint();
  },
});

/* Delete my RuPeace data: type DELETE, then the family file goes (or, for someone who joined, they leave it) */
function deleteMine() {
  const d = App.bsheet({ title: 'Delete my RuPeace data', cls: 'qa pss-sheet', focus: false, body:
    '<div class="pss-warn"><b>If you started this family,</b> its file goes to the bin in your Google Drive, so everyone in the family loses it. ' +
      '<b>If you joined,</b> you leave the family; their data stays with them.</div>' +
    '<p class="pss-lead" style="margin:0">RuPeace is then signed out and its access to your Google account is removed. Things in the Drive bin are deleted for good after 30 days.</p>' +
    '<label class="pss-chk"><input type="checkbox" data-delbk> Also delete my backups (the "RuPeace backups" folder)</label>' +
    '<div class="pss-f"><label class="qa-cap" for="pss_del">Type DELETE to confirm</label><input type="text" id="pss_del" autocomplete="off" autocapitalize="characters" placeholder="DELETE" data-del></div>' +
    '<div class="qa-err" role="alert" data-err></div>' +
    '<div class="qa-foot"><button type="button" class="btn" data-bs-close>Cancel</button><button type="button" class="btn danger" data-go>Delete</button></div>' });
  const inp = d.querySelector('[data-del]'), err = d.querySelector('[data-err]'), go = d.querySelector('[data-go]');
  go.onclick = async () => {
    if (inp.value.trim().toUpperCase() !== 'DELETE') { err.textContent = 'Type DELETE to confirm'; inp.focus(); return; }
    go.disabled = true; go.textContent = 'Deleting…'; err.textContent = '';
    try { await App.deleteMyData(d.querySelector('[data-delbk]').checked); }
    catch (ex) { err.textContent = ex.message; go.disabled = false; go.textContent = 'Delete'; }
  };
}

/* ---------- Security: PIN and fingerprint for this phone (app 2.0), or the PINs page (the old sign-in) ---------- */
S.security = async el => {
  const sec = App.security;
  if (!sec) { const pins = App.settingsTabs.find(t => t.id === 'pins'); if (pins) { location.replace(HUB + '?s=pins'); } else el.innerHTML = top('Security', '#/account') + '<div class="ph-card ph-empty">Nothing to set here.</div>'; return; }
  const st = sec.state();
  el.innerHTML = top('Security', '#/account') +
    '<div class="ph-card ph-list">' +
      '<button type="button" class="ph-row" data-sec="pin"><span class="ic" style="--h:#4e9fd1">' + App.ico('lock') + '</span><span class="nm"><b>Change PIN</b><span>The PIN that opens RuPeace on this phone</span></span><span class="go">' + I.right + '</span></button>' +
      (st.bioAvailable ? '<button type="button" class="pss-sw" role="switch" data-sec="bio" aria-checked="' + !!st.bio + '"><span>Unlock with fingerprint<small>Fingerprint or face; the PIN still works</small></span><i></i></button>' : '') +
    '</div>';
  el.addEventListener('click', async e => {
    const b = e.target.closest('[data-sec]'); if (!b) return;
    const k = b.dataset.sec;
    if (k === 'pin') { if (await sec.changePin()) App.toast('PIN changed'); return; }
    if (k === 'bio') { const on = b.getAttribute('aria-checked') !== 'true'; const ok = await sec.setBio(on); b.setAttribute('aria-checked', String(ok ? on : !on)); if (ok) App.toast(on ? 'Fingerprint unlock is on' : 'Fingerprint unlock is off'); }
  });
};

/* ================= the route ================= */
let lastKey = null;
App.phonePage('settings', {
  title: 'Family Setup',
  async render(el, ctx) {
    const p = ctx.params, s = p.get('s') || 'hub', id = p.get('id');
    el.className = 'ph pss pss-' + s;
    el.dataset.key = s + ':' + (id || '');
    await (S[s] || S.hub)(el, id);
    if (p.get('su')) { el.classList.add('pss-setup'); await setupBar(el, p.get('su')); }
    el.addEventListener('click', e => { const b = e.target.closest('[data-back]'); if (b) { if (p.get('su')) { location.hash = '#/home'; return; } goBack(b.dataset.back); } });
  },
  after(el) { if (el.dataset.key !== lastKey) { lastKey = el.dataset.key; window.scrollTo(0, 0); } },
});
})();
