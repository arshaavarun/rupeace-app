/* Phone screens (under 760px wide): Home, Ledger (day feed), Loans, Savings, Cash flow, and the quick-add sheet.
   Registered with App.phonePage(); core.js uses them instead of the desktop pages when App.isPhone().
   Same /api routes as the desktop pages, all through App.api. Read-only except the ledger (add / edit / delete / confirm). */
(function () {
'use strict';
const App = window.App;
const esc = App.esc;
const SVG = p => '<svg viewBox="0 0 24 24" aria-hidden="true">' + p + '</svg>';
const I = {
  left: SVG('<path d="m15 6-6 6 6 6"/>'), right: SVG('<path d="m9 6 6 6-6 6"/>'), plus: SVG('<path d="M12 5v14M5 12h14"/>'),
  clock: SVG('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'), down: SVG('<path d="m6 9 6 6 6-6"/>'),
};
const FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TYPES = [['expense', 'Expense'], ['income', 'Income'], ['savings', 'Savings'], ['loan', 'Loan payment'], ['transfer', 'Transfer']];
const PARTS = [['emi', 'EMI'], ['pre_emi', 'Pre-EMI'], ['prepay', 'Prepayment'], ['charges', 'Charges']];
const typeLabel = t => (TYPES.find(x => x[0] === t) || [t, App.label(t)])[1];
const store = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } } };

/* ---------- the period shown on Home and Activity: one month, or a run of months (remembered for this session) ---------- */
const mIx = ym => Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1;
const thisYm = () => App.today().slice(0, 7);
const period = () => {
  const r = App.range('phone'), f = (r.from || App.today()).slice(0, 7), t = (r.to || r.from || App.today()).slice(0, 7);
  return { from: f, to: t < f ? f : t };
};
const monthsIn = p => mIx(p.to) - mIx(p.from) + 1;
const isSingle = p => p.from === p.to;
const setPeriod = (f, t) => { if (t < f) { const x = f; f = t; t = x; } App.saveRange('phone', { from: f + '-01', to: App.monthEnd((t || f) + '-01') }); App.refresh(); };
const monthOf = () => period().from;
const monthRange = () => { const p = period(); return { from: p.from + '-01', to: App.monthEnd(p.to + '-01') }; };
const setMonth = ym => setPeriod(ym, ym);
const shiftPeriod = dir => { const p = period(), n = monthsIn(p); setPeriod(App.addMonths(p.from, dir * n), App.addMonths(p.to, dir * n)); };
const shortM = ym => App.MN[Number(ym.slice(5, 7)) - 1];
const rangeName = p => {
  const y0 = p.from.slice(0, 4), y1 = p.to.slice(0, 4), ty = App.today().slice(0, 4);
  if (p.from.slice(5) === '01' && p.to.slice(5) === '12' && y0 === y1) return y0;
  if (y0 === y1) return shortM(p.from) + ' – ' + shortM(p.to) + (y0 !== ty ? ' ' + y0 : '');
  return shortM(p.from) + ' ’' + y0.slice(2) + ' – ' + shortM(p.to) + ' ’' + y1.slice(2);
};
/* a month 'YYYY-MM' or a period {from, to} */
const monthName = x => {
  if (x && typeof x === 'object') return isSingle(x) ? monthName(x.from) : rangeName(x);
  const [y, m] = x.split('-').map(Number); return FULL[m - 1] + (String(y) !== App.today().slice(0, 4) ? ' ' + y : '');
};
const curPeriod = () => { const p = period(); return isSingle(p) ? p.from : p; };
const CHEV = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>';
const TODAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/><circle cx="12" cy="15" r="1.6"/></svg>';
const monthBar = () => {
  const p = period(), single = isSingle(p), now = thisYm(), y = p.from.slice(0, 4);
  const label = single ? FULL[Number(p.from.slice(5, 7)) - 1] + (y !== App.today().slice(0, 4) ? '<small>' + y + '</small>' : '') : esc(rangeName(p));
  const atNow = single && p.from === now;
  return '<div class="ph-month"><button type="button" class="ph-ib" data-mshift="-1" aria-label="Earlier">' + I.left + '</button>' +
    '<button type="button" class="mb" data-mpick aria-haspopup="dialog" aria-label="' + esc((single ? monthName(p.from) : rangeName(p)) + ': pick a month or a period') + '">' + label + CHEV + '</button>' +
    '<button type="button" class="ph-ib" data-mshift="1" aria-label="Later">' + I.right + '</button>' +
    (atNow ? '' : '<button type="button" class="ph-today" data-mnow aria-label="Back to this month" title="Back to this month">' + TODAY + '</button>') + '</div>';
};
const nowRow = () => '';

/* the picker: quick periods, or tap a month (one month, or a first and last month for a range) */
const openPicker = () => {
  const p = period(), now = thisYm(), add = (ym, k) => App.addMonths(ym, k);
  const presets = [['This month', now, now], ['Last month', add(now, -1), add(now, -1)], ['Last 3 months', add(now, -2), now],
    ['Last 6 months', add(now, -5), now], ['This year', now.slice(0, 4) + '-01', now], ['Last 12 months', add(now, -11), now]];
  let year = Number(p.to.slice(0, 4)), mode = isSingle(p) ? 'one' : 'range', start = null;
  const d = App.bsheet({ title: 'Show', cls: 'menu mpk', focus: false, body:
    '<div class="mpk-quick">' + presets.map((x, k) => '<button type="button" class="pchip" data-pp="' + k + '" aria-pressed="' + (p.from === x[1] && p.to === x[2]) + '">' + x[0] + '</button>').join('') + '</div>' +
    '<div class="tseg" role="radiogroup" aria-label="Pick"><button type="button" role="radio" data-pm-mode="one">One month</button><button type="button" role="radio" data-pm-mode="range">From – to</button></div>' +
    '<div class="mpk-year"><button type="button" class="ph-ib" data-py="-1" aria-label="Previous year">' + I.left + '</button><b data-yl></b><button type="button" class="ph-ib" data-py="1" aria-label="Next year">' + I.right + '</button></div>' +
    '<div class="mpk-grid" data-grid></div><p class="mpk-hint" data-hint></p>' });
  const draw = () => {
    d.querySelectorAll('[data-pm-mode]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.pmMode === mode)));
    d.querySelector('[data-yl]').textContent = year;
    const sel = ym => (start ? ym === start : mIx(ym) >= mIx(p.from) && mIx(ym) <= mIx(p.to));
    d.querySelector('[data-grid]').innerHTML = App.MN.map((m, k) => {
      const ym = year + '-' + String(k + 1).padStart(2, '0');
      return '<button type="button" data-ym="' + ym + '" class="' + [sel(ym) ? 'sel' : '', ym === now ? 'now' : '', ym > now ? 'future' : '', !start && sel(ym) && ym === p.from ? 'first' : '', !start && sel(ym) && ym === p.to ? 'last' : ''].join(' ') + '">' + m + '</button>';
    }).join('');
    d.querySelector('[data-hint]').textContent = mode === 'one' ? 'Tap a month to open it.' : start ? 'Now tap the last month.' : 'Tap the first month, then the last.';
  };
  d.addEventListener('click', e => {
    const q = e.target.closest('[data-pp]'); if (q) { const x = presets[Number(q.dataset.pp)]; d.close2(); return setPeriod(x[1], x[2]); }
    const md = e.target.closest('[data-pm-mode]'); if (md) { mode = md.dataset.pmMode; start = null; return draw(); }
    const yy = e.target.closest('[data-py]'); if (yy) { year += Number(yy.dataset.py); return draw(); }
    const b = e.target.closest('[data-ym]'); if (!b) return;
    const ym = b.dataset.ym;
    if (mode === 'one') { d.close2(); return setPeriod(ym, ym); }
    if (!start) { start = ym; return draw(); }
    d.close2(); setPeriod(start, ym);
  });
  draw();
};

/* offline mode (google/client/sync-ui.js): hosts it fills; '' when there is no App.sync (laptop), so nothing changes there */
const SY = () => (App.syncUI && App.sync ? App.syncUI : null);
const topBar = left => '<div class="ph-top">' + left + App.avatar() + (SY() ? SY().chipHost() : '') + '</div>';
const noSetup = () => !App.people().length || !App.accounts().length;
/* the + on Loans, Savings and Cash flow: a short menu of what can be added there */
const addMenu = (title, items) => {
  const d = App.bsheet({ title, cls: 'menu', focus: false, dock: true,
    body: items.map((x, k) => '<button type="button" class="mn-row mn-btn" data-mi="' + k + '"><span class="mn-ic">' + x.icon + '</span><span class="mn-t"><b>' + esc(x.label) + '</b><small>' + esc(x.sub) + '</small></span><span class="mn-go">›</span></button>').join('') });
  d.addEventListener('click', e => { const b = e.target.closest('[data-mi]'); if (b) { d.close2(); items[Number(b.dataset.mi)].run(); } });
  return d;
};
const ADD = () => App.phAdd || {};
const needSetup = () => { if (!noSetup()) return false; location.hash = '#/welcome'; return true; };
const loanMenu = () => addMenu('Add to loans', [
  { icon: App.ico('money'), label: 'Record a payment', sub: 'An EMI, interest, a prepayment or charges you paid', run: () => { if (!needSetup()) App.quickAdd({ preset: { type: 'loan' } }); } },
  { icon: App.ico('bank'), label: 'New loan', sub: 'Home, car, personal, gold: amount, rate, tenure, interest only or EMI', run: () => ADD().loan && ADD().loan() },
  { icon: App.ico('percent'), label: 'Rate change', sub: 'The bank changed the interest rate from a date', run: () => ADD().rate && ADD().rate() },
]);
const savingsMenu = () => addMenu('Add to savings', [
  { icon: App.ico('money'), label: 'Add money', sub: 'Money you put into a SIP, PPF, FD and so on', run: () => { if (!needSetup()) App.quickAdd({ preset: { type: 'savings' } }); } },
  { icon: App.ico('piggy'), label: 'New place', sub: 'A mutual fund, PPF, EPF, NPS, FD, gold…', run: () => ADD().place && ADD().place() },
  { icon: App.ico('chart'), label: 'Update value', sub: 'What a place is worth now, from its statement', run: () => ADD().value && ADD().value() },
]);
const worthMenu = () => addMenu('Add to worth', [
  { icon: App.ico('money'), label: 'Loan payment', sub: 'An EMI, interest, a prepayment or charges you paid', run: () => { if (!needSetup()) App.quickAdd({ preset: { type: 'loan' } }); } },
  { icon: App.ico('piggy'), label: 'Money into savings', sub: 'A SIP, PPF, FD or anything you put away', run: () => { if (!needSetup()) App.quickAdd({ preset: { type: 'savings' } }); } },
  { icon: App.ico('paperplane'), label: 'Event', sub: 'A trip or a festival with a rough budget; spends during it are linked to it', run: () => ADD().event && ADD().event() },
  { icon: App.ico('bomb'), label: 'Bomb', sub: 'One big amount on a date: a bonus coming in, a delivery going out', run: () => ADD().bomb && ADD().bomb() },
  { icon: App.ico('bank'), label: 'New loan', sub: 'Home, car, personal, gold: interest only or EMI', run: () => ADD().loan && ADD().loan() },
  { icon: App.ico('trend'), label: 'New savings place', sub: 'A mutual fund, PPF, EPF, NPS, FD, gold…', run: () => ADD().place && ADD().place() },
  { icon: App.ico('chart'), label: 'Update a value', sub: 'What a savings place is worth now', run: () => ADD().value && ADD().value() },
]);
/* Ahead (the last button in the bar): a small chooser above the bar, Loans · Savings · Recurring / Planned · One-offs */
const AHEAD_ICO = { events: 'paperplane', bombs: 'bomb' };
const aheadPick = async () => {
  const open = document.querySelector('dialog.ahead-pick' + App.OPEN.slice(6)); if (open) { open.close2(); return; }
  const tile = (go, ic, hue, title, sub) => '<button type="button" class="ap-t" data-go="' + go + '"><span class="ap-i" style="--h:' + hue + '">' + App.ico(ic) + '</span><b>' + title + '</b><span class="ap-s">' + sub + '</span></button>';
  App.markTab('ahead', true);                                          // Ahead lights up while its chooser is open
  const d = App.bsheet({ title: 'Ahead', cls: 'menu ahead-pick', focus: false, dock: true, onClose: () => App.markTab(null, true), body: '<div class="ap-row" data-ap>' +
    tile('#/loans', 'bank', '#dd7272', 'Loans', '…') + tile('#/savings', 'piggy', '#3fb58a', 'Savings', '…') + tile('#/settings?s=recurring', 'repeat', '#9a7fd8', 'Recurring', '…') +
    tile('#/events', AHEAD_ICO.events, '#e0a24f', 'Events', '…') + tile('#/bombs', AHEAD_ICO.bombs, '#3aaea3', 'Bombs', '…') + '</div>' });
  d.addEventListener('click', e => { const b = e.target.closest('[data-go]'); if (b) { location.hash = b.dataset.go; d.close2(); } });
  try {
    const cur = App.today().slice(0, 7);
    const [ln, sv, pl, rc, ev] = await Promise.all([App.api.get('/api/loans'), App.api.get('/api/savings'), App.api.get('/api/setup/planned_items').catch(() => ({ rows: [] })), App.api.get('/api/setup/recurring').catch(() => ({ rows: [] })), App.api.get('/api/events').catch(() => ({ events: [] }))]);
    const loans = (ln.loans || []).filter(l => l.active !== 0 && l.status !== 'closed'), places = (sv.places || []).filter(p => p.active !== 0);
    const ones = (pl.rows || []).filter(o => o.month >= cur).sort((a, b) => (a.month + String(a.day || 1).padStart(2, '0') < b.month + String(b.day || 1).padStart(2, '0') ? -1 : 1));
    const evs = (ev.events || []).filter(e => e.state !== 'done'), evNow = evs[0];
    const dm = o => (o.day ? Number(o.day) + ' ' : '') + App.MN[Number(o.month.slice(5, 7)) - 1].slice(0, 3);
    const recs = (rc.rows || []).filter(r => r.active !== 0);
    const nxt = App.nextDue ? recs.map(r => ({ r, d: App.nextDue(r) })).filter(x => x.d).sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0))[0] : null;
    const subs = [loans.length ? loans.length + ' · ' + App.money((ln.family && ln.family.outstanding) || 0) + ' left' : 'None yet',
      places.length ? places.length + ' · ' + App.money((sv.totals && sv.totals.value_now) || 0) : 'None yet',
      nxt ? 'next: ' + nxt.r.name + ', ' + Number(nxt.d.slice(8, 10)) + ' ' + App.MN[Number(nxt.d.slice(5, 7)) - 1].slice(0, 3) : recs.length ? recs.length + ' set' : 'None yet',
      evNow ? evNow.name + ' · ' + (evNow.over > 0.5 ? App.money(evNow.over) + ' over' : App.money(evNow.left) + ' left') : 'None yet',
      ones.length ? (ones[0].description || 'Next') + ' · ' + dm(ones[0]) : 'None yet'];
    d.querySelectorAll('.ap-s').forEach((s, i) => { s.textContent = subs[i]; });
  } catch (e) { d.querySelectorAll('.ap-s').forEach(s => { s.textContent = ''; }); }
};
document.addEventListener('click', e => { if (e.target.closest('[data-ahead]')) { e.preventDefault(); aheadPick(); } });
document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.closest && e.target.closest('[data-ahead]')) { e.preventDefault(); aheadPick(); } });
/* the + in the middle of the bottom bar: a new entry, or what fits the tab you are on */
document.addEventListener('click', e => {
  if (!e.target.closest('[data-bnav-add]')) return;
  const open = document.querySelector('dialog.docked' + App.OPEN.slice(6));            // the + is a ✕ now: close
  if (open) { open.close2(); return; }
  if (!App.opt || noSetup()) { location.hash = '#/welcome'; return; }
  const h = location.hash, p = h.replace(/^#\/?/, '').split('?')[0];
  if (p === 'worth') worthMenu();
  else if (p === 'loans' || /[?&]s=loans?(&|$)/.test(h)) loanMenu();
  else if (p === 'savings' || /[?&]s=(place|savings)(&|$)/.test(h)) savingsMenu();
  else if (p === 'planned' || p === 'bombs') { if (ADD().bomb) ADD().bomb(); }
  else if (p === 'events') { if (ADD().event) ADD().event(); }
  else addPick();
});

/* + on Home and Activity: "What are you adding?" above the bar (Expense and Income big; Savings, Loan payment,
   Transfer small), and the last three different entries, one tap to add one again (approved: option 2). */
const TYPE_WORD = { expense: 'expense', income: 'income', savings: 'savings', loan: 'loan payment', transfer: 'transfer' };
const addPick = async () => {
  const big = (t, ic, hue, title, sub) => '<button type="button" class="ap-t ad-big" data-addtype="' + t + '"><span class="ap-i" style="--h:' + hue + '">' + App.ico(ic) + '</span><b>' + title + '</b><span class="ap-s">' + sub + '</span></button>';
  const small = (t, ic, hue, title) => '<button type="button" class="ad-small" data-addtype="' + t + '"><span class="ap-i" style="--h:' + hue + '">' + App.ico(ic) + '</span><span>' + title + '</span></button>';
  const d = App.bsheet({ title: 'What are you adding?', cls: 'menu add-pick', focus: false, dock: true, body:
    '<div class="ad-row2">' + big('expense', 'down', '#dd7272', 'Expense', 'Money spent') + big('income', 'up', '#3fb58a', 'Income', 'Money in') + '</div>' +
    '<div class="ad-row3">' + small('savings', 'piggy', '#4e9fd1', 'Savings') + small('loan', 'bank', '#e0a24f', 'Loan payment') + small('transfer', 'repeat', '#9a7fd8', 'Transfer') + '</div>' +
    '<div data-again></div>' });
  let again = [];
  const go = (preset, amount, desc) => { d.close2(); setTimeout(() => App.quickAdd({ preset, amount, desc }), 140); };
  d.addEventListener('click', e => {
    const t = e.target.closest('[data-addtype]'); if (t) return go({ type: t.dataset.addtype });
    const a = e.target.closest('[data-again]'); if (!a || a.dataset.again === '') return;
    const x = again[Number(a.dataset.again)]; if (!x) return;
    const keep = ['type', 'category_id', 'method', 'account_id', 'to_account_id', 'loan_id', 'loan_part', 'savings_id', 'for_id'];
    go(Object.fromEntries(keep.filter(k => x[k] != null && x[k] !== '').map(k => [k, x[k]])), Math.round(x.amount * 100) / 100, x.description || '');
  });
  try {
    const to = App.today(), from = App.addMonths(to.slice(0, 7), -2) + '-01';
    const r = await App.api.get('/api/ledger?' + App.qs({ from, to }));
    const seen = new Set();
    again = (r.entries || []).filter(e => e.status === 'done').sort((a, b) => (String(b.created_at || '') + b.date).localeCompare(String(a.created_at || '') + a.date))
      .filter(e => { const k = e.type + '|' + (e.category_id || '') + '|' + String(e.description || '').toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 3);
    if (!again.length || !d.open) return;
    const when = iso => (iso === to ? 'Today' : iso === addDays(to, -1) ? 'Yesterday' : dayLabel(iso).replace(/, .*/, ''));
    d.querySelector('[data-again]').outerHTML = '<div class="ad-again"><div class="qa-cap">Again? One tap</div>' + again.map((x, k) => {
      const nm = entryName(x);
      return '<button type="button" class="ad-rep" data-again="' + k + '"><span class="ic" style="--h:' + App.hue(nm) + '">' + App.iconFor(nm, x.type) + '</span>' +
        '<span class="nm"><b>' + esc(x.description && x.category ? x.category + ' · ' + x.description : nm) + '</b><span>' + esc([when(x.date), x.method || x.account].filter(Boolean).join(' · ')) + '</span></span>' +
        '<span class="am' + (x.type === 'income' ? ' in' : '') + '">' + App.inr(x.amount) + '</span><span class="ag">Again</span></button>';
    }).join('') + '</div>';
  } catch (e) { /* the chooser works without them */ }
};

/* ---------- Home: your money now. Each account and card as a small bank card, four a page, slide for more. A card
   shows its balance (a credit card: what is due and how much of the limit is used) and its last entry; tapping one
   opens Activity with only that account's entries. Cash first, then bank accounts, wallets and credit cards, each A–Z. ---------- */
let ledgerAcct = null;                                              // Activity shows one account (set from a wallet card)
const KIND_WORD = { bank: 'Bank', card: 'Card', cash: 'Cash', wallet: 'Wallet' };
const BANK_HUES = ['#2f6db0', '#5b4bb7', '#3d5fc4', '#7a4fb8', '#2a7fa8'];   // banks: blues and purples (red is for cards, green for cash)
const walletCard = (bal, ents) => {
  const accts = (bal || []).filter(a => a.active !== 0 || Math.abs(a.balance) > 0.5);
  if (!accts.length) return '';
  const last = {};
  ents.filter(e => e.status === 'done').forEach(e => { [e.account_id, e.to_account_id].forEach(id => { if (id && (!last[id] || e.date > last[id].date || (e.date === last[id].date && e.id > last[id].id))) last[id] = e; }); });
  const az = (x, y) => x.name.localeCompare(y.name, 'en', { sensitivity: 'base' });
  const RANK = { cash: 0, bank: 1, wallet: 2, card: 3 };             // cash, then banks, then wallets, then credit cards; each A–Z
  const order = accts.slice().sort((x, y) => ((RANK[x.kind] ?? 2.5) - (RANK[y.kind] ?? 2.5)) || az(x, y));
  const cash = accts.filter(a => a.kind !== 'card').reduce((t, a) => t + a.balance, 0);
  const due = accts.filter(a => a.kind === 'card' && a.balance < 0).reduce((t, a) => t - a.balance, 0);
  const today = App.today(), yest = addDays(today, -1);
  const when = d => (d === today ? 'today' : d === yest ? 'yesterday' : dayLabel(d).replace(/^\w+, /, ''));
  const card = a => {
    const isCard = a.kind === 'card', hue = isCard ? '#c0504f' : a.kind === 'cash' ? '#2f8f6b' : a.kind === 'wallet' ? '#2b8a9a' : BANK_HUES[[...a.name].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % BANK_HUES.length];
    const owe = isCard && a.balance < 0 ? -a.balance : 0;
    const val = isCard ? (owe ? App.inr(owe) + ' due' : a.balance > 0.5 ? App.inr(a.balance) + ' credit' : 'Nothing due') : App.inr(a.balance);
    const l = last[a.id], used = isCard && a.credit_limit > 0 ? Math.round(owe / a.credit_limit * 100) : null;
    const foot = used !== null ? used + '% of ' + App.money(a.credit_limit) + ' used' : l ? 'Last: ' + App.inr(l.amount) + ' ' + (l.category || l.description || '') + ', ' + when(l.date) : '';
    return '<button type="button" class="wl-card" data-wacct="' + a.id + '" style="--c:' + hue + '" aria-label="' + esc(a.name + ', ' + val) + '">' +
      '<span class="k">' + esc((KIND_WORD[a.kind] || 'Account') + (a.last4 ? ' ••' + a.last4 : '')) + '</span><span class="chip" aria-hidden="true"></span>' +
      '<b class="' + (a.balance < -0.5 && !isCard ? 'neg' : '') + '">' + esc(val) + '</b><span class="n">' + esc(a.name) + '</span>' + (foot ? '<span class="f">' + esc(foot) + '</span>' : '') + '</button>';
  };
  const pages = [];
  for (let i = 0; i < order.length; i += 4) pages.push(order.slice(i, i + 4));
  return '<section class="hm-wallet"><div class="ph-cap"><span>Your money now</span><span>' + App.money(cash) + ' in bank and cash' + (due ? ' · ' + App.money(due) + ' due' : '') + '</span></div>' +
    '<div class="wl-pages" data-wpages>' + pages.map(pg => '<div class="wl-page">' + pg.map(card).join('') + '</div>').join('') + '</div>' +
    (pages.length > 1 ? '<div class="wl-dots" aria-hidden="true">' + pages.map((_, i) => '<i' + (i ? '' : ' class="on"') + '></i>').join('') + '</div>' : '') + '</section>';
};
const wireWallet = el => {
  const box = el.querySelector('[data-wpages]'); if (!box) return;
  const dots = [...el.querySelectorAll('.wl-dots i')];
  box.addEventListener('scroll', () => { const k = Math.round(box.scrollLeft / Math.max(1, box.clientWidth)); dots.forEach((d, i) => d.classList.toggle('on', i === k)); }, { passive: true });
  box.addEventListener('click', e => { const c = e.target.closest('[data-wacct]'); if (!c) return; ledgerAcct = Number(c.dataset.wacct); ledgerType = 'all'; location.hash = '#/ledger'; });
};

/* ---------- Home pie: this month's spending by category, by who spent it, or by who it was for ---------- */
const PIE_VIEWS = [['cat', 'Category'], ['by', 'Who spent'], ['for', 'For whom'], ['plan', 'vs budget']];   // Category first and the default; vs budget last
let pieView = store.get('rp.pieView3') || 'cat';
if (!PIE_VIEWS.some(v => v[0] === pieView)) pieView = 'cat';
const pieGroups = (ents, view) => {
  const g = new Map();
  ents.forEach(e => {
    const key = view === 'cat' ? (e.category || 'No category') : view === 'by' ? (e.person || 'Not set') : (e.for_person || 'Family');
    const x = g.get(key) || { label: key, value: 0, rows: [] };
    x.value += e.amount; x.rows.push(e); g.set(key, x);
  });
  let sl = [...g.values()].sort((a, b) => b.value - a.value);
  if (sl.length > 7) { const rest = sl.slice(6); sl = sl.slice(0, 6).concat([{ label: 'Other', other: true, value: rest.reduce((s, x) => s + x.value, 0), rows: rest.flatMap(x => x.rows) }]); }
  return sl;
};
const pieCard = (ents, ym) => {
  const spent = ents.filter(e => e.type === 'expense' && e.status === 'done');
  const sl = pieGroups(spent, pieView), total = sl.reduce((s, x) => s + x.value, 0);
  const col = (s, i) => (s.other ? 'var(--muted)' : (App.PAL || [])[[0, 1, 2, 3, 4, 6, 7][i % 7]] || 'var(--accent)');   // PAL[5] is a second purple: skipped
  const R = 46, SW = 16, C = 2 * Math.PI * R, GAP = sl.length > 1 ? 2 : 0;
  let off = 0;
  const arcs = sl.map((s, i) => {
    const len = s.value / total * C;
    const a = '<circle class="seg" cx="60" cy="60" r="' + R + '" fill="none" stroke="' + col(s, i) + '" stroke-width="' + SW + '" stroke-dasharray="' + Math.max(0.01, len - GAP).toFixed(2) + ' ' + C.toFixed(2) +
      '" stroke-dashoffset="' + (-off).toFixed(2) + '" transform="rotate(-90 60 60)" style="--d:' + (i * 60) + 'ms" data-pk="' + i + '"><title>' + esc(s.label) + ': ' + App.inr(s.value) + '</title></circle>';
    off += len;
    return a;
  }).join('');
  const seg = '<div class="tseg hp-seg" role="radiogroup" aria-label="Group spending by">' + PIE_VIEWS.map(([k, l]) => '<button type="button" role="radio" data-pview="' + k + '" aria-checked="' + (pieView === k) + '">' + l + '</button>').join('') + '</div>';
  const body = pieView === 'plan' ? planView(ents, ym) : !total ? '<div class="hp-empty"><span class="pc-ring"></span><span>No spending in ' + esc(monthName(ym)) + ' yet.</span></div>'
    : '<div class="hp-body"><div class="hp-donut"><svg viewBox="0 0 120 120" role="img" aria-label="' + esc('Spending in ' + monthName(ym) + ' by ' + PIE_VIEWS.find(v => v[0] === pieView)[1].toLowerCase()) + '">' +
      '<circle cx="60" cy="60" r="' + R + '" fill="none" stroke="var(--grid-soft)" stroke-width="' + SW + '"/>' + arcs + '</svg>' +
      '<div class="hp-mid"><b>' + App.money(total) + '</b><span>spent</span></div></div>' +
      '<ul class="hp-leg">' + sl.map((s, i) => '<li><button type="button" data-pk="' + i + '" aria-label="' + esc(s.label + ', ' + App.inr(s.value) + ', ' + Math.round(s.value / total * 100) + '%. Show entries') + '">' +
        '<span class="dot" style="background:' + col(s, i) + '"></span><span class="lbl">' + esc(s.label) + '</span><span class="val">' + App.money(s.value) + '</span><span class="pct">' + Math.round(s.value / total * 100) + '%</span></button></li>').join('') + '</ul></div>';
  return { html: '<article class="ph-card hp-card" data-pie><div class="hd"><div><h3>Spending in ' + esc(monthName(ym)) + '</h3><small>Tap one to see its entries</small></div></div>' + seg + body + '</article>', sl };
};
const showSlice = (s, ym) => {
  const d = App.bsheet({ title: s.label + ' · ' + App.inr(s.value), cls: 'menu', focus: false,
    body: '<p class="mn-who">' + s.rows.length + ' entr' + (s.rows.length === 1 ? 'y' : 'ies') + ' in ' + esc(monthName(ym)) + '</p><div class="ph-list">' + s.rows.map(e => entryRow(e)).join('') + '</div>' });
  d.addEventListener('click', e => { const r = e.target.closest('[data-eid]'); if (r) { const en = s.rows.find(x => String(x.id) === r.dataset.eid); d.close2(); if (en) App.quickAdd({ entry: en }); } });
};
const setupCard = '<div class="ph-card ph-empty">Set up your family and accounts first.<br><a class="btn primary" href="#/welcome">Start setup</a></div>';

/* ---------- usage: which categories / methods / accounts get used most (orders the chips) ---------- */
let usage = null, usageP = null;
const blankUsage = () => ({ cat: {}, meth: {}, lastMeth: {}, lastAcct: {}, forCat: {}, methCat: {}, acctMeth: {} });
const count = (u, e) => {
  if (e.category_id) u.cat[e.category_id] = (u.cat[e.category_id] || 0) + 1;
  if (e.method) { const k = e.type + '|' + e.method; u.meth[k] = (u.meth[k] || 0) + 1; u.lastMeth[e.type] = e.method; }
  if (e.method && e.account_id) { u.lastAcct[e.method] = e.account_id; const m = u.acctMeth[e.method] = u.acctMeth[e.method] || {}; m[e.account_id] = (m[e.account_id] || 0) + 1; }   // UPI mostly from HDFC
  if (e.method && e.category_id) u.methCat[e.category_id] = e.method;   // how this category is usually paid
  if (e.type === 'expense' && e.category_id) u.forCat[e.category_id] = e.for_id || null;   // who it is usually for (null = Family)
};
const loadUsage = () => {
  if (usage) return Promise.resolve(usage);
  if (!usageP) {
    const to = App.today(), from = App.addMonths(to.slice(0, 7), -2) + '-01';   // the last 3 months order the categories
    usageP = App.api.get('/api/ledger?' + App.qs({ from, to })).then(d => {
      const u = blankUsage();
      d.entries.slice().reverse().forEach(e => count(u, e));   // oldest first, so "last" ends on the newest
      usage = u; return u;
    }).catch(() => { usage = blankUsage(); return usage; });
  }
  return usageP;
};

/* ---------- one entry as a row ---------- */
const entryName = e => e.category || e.description || typeLabel(e.type);
const entryRow = (e, { confirm = false } = {}) => {
  const name = entryName(e), sub = [];
  if (e.category && e.description && e.description.toLowerCase() !== e.category.toLowerCase()) sub.push(e.description);
  if (e.person) sub.push(e.person);
  if (e.type === 'expense' && e.for_person) sub.push('for ' + e.for_person);
  if (e.type === 'transfer') sub.push((e.account || '?') + ' → ' + (e.to_account || '?'));
  else if (e.type === 'loan' && e.loan) sub.push(e.loan);
  else if (e.type === 'savings' && e.savings) sub.push(e.savings);
  else if (e.account) sub.push(e.account); else if (e.method) sub.push(e.method);
  const cls = e.type === 'income' ? 'in' : e.type === 'transfer' ? 'mv' : e.type === 'savings' ? 'sav' : '';
  const pend = e.status === 'pending', unsynced = !!(SY() && SY().isPending('entries', e.id));
  return '<div class="ph-row' + (pend ? ' pending' : '') + (unsynced ? ' sy-pend' : '') + '" role="button" tabindex="0" data-eid="' + e.id + '" aria-label="' + esc(name + ', ' + App.inr(e.amount) + (pend ? ', to confirm' : '') + (unsynced ? ', not synced yet' : '')) + '">' +
    '<span class="ic" style="--h:' + App.hue(name) + '">' + App.iconFor(name, e.type) + '</span>' +
    '<span class="nm"><b>' + esc(name) + '</b><span>' + esc(sub.join(' · ')) + '</span></span>' +
    '<span class="am"><span class="amt ' + cls + '">' + (e.type === 'income' ? '+' : '') + App.inr(e.amount) + '</span>' +
    (pend ? (confirm ? '<button type="button" class="ph-confirm" data-confirm="' + e.id + '">Confirm</button>' : '<span class="badge">To confirm</span>') : '') + '</span></div>';
};
const dayLabel = iso => { const [y, m, d] = iso.split('-').map(Number); const dt = new Date(y, m - 1, d); return (iso === App.today() ? 'Today' : DOW[dt.getDay()]) + ', ' + d + ' ' + App.MN[m - 1]; };

/* shared clicks on Home and Ledger: month, add, open a row, confirm */
const wire = (el, entries) => {
  const byId = id => entries.find(x => String(x.id) === String(id));
  el.addEventListener('click', async e => {
    const t = e.target;
    const ms = t.closest('[data-mshift]'); if (ms) return shiftPeriod(Number(ms.dataset.mshift));
    if (t.closest('[data-mpick]')) return openPicker();
    if (t.closest('[data-mnow]')) return setMonth(App.today().slice(0, 7));
    if (t.closest('[data-add]')) return App.quickAdd();
    const qc = t.closest('[data-qcat]'); if (qc) return App.quickAdd({ preset: { type: 'expense', category_id: Number(qc.dataset.qcat) } });
    const cf = t.closest('[data-confirm]');
    if (cf) {
      cf.disabled = true;
      try { await App.api.post('/api/ledger/' + cf.dataset.confirm + '/confirm', {}); App.toast('Confirmed'); App.refresh(); }
      catch (ex) { App.fail(ex); cf.disabled = false; }
      return;
    }
    const row = t.closest('[data-eid]'); if (row) { const en = byId(row.dataset.eid); if (en) App.quickAdd({ entry: en }); }
  });
  el.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-eid]')) { e.preventDefault(); e.target.click(); } });
};

/* Home for a period of several months: where the money went */
const nmOf = ym => (ym && typeof ym === 'object' ? monthsIn(ym) : 1);
const wirePie = (el, ents, pie, ym) => {
  const host = el.querySelector('[data-pie]'); if (!host) return;
  host.addEventListener('click', e => {
    const v = e.target.closest('[data-pview]');
    if (v) { if (v.dataset.pview !== pieView) { pieView = v.dataset.pview; store.set('rp.pieView3', pieView); App.refresh(); } return; }
    const pk = e.target.closest('[data-plk]'); if (pk) { const r = planRows(ents, nmOf(ym))[Number(pk.dataset.plk)]; if (r) showSlice({ label: r.name, value: r.spent, rows: r.rows }, ym); return; }
    const k = e.target.closest('[data-pk]'); if (k && pie.sl[Number(k.dataset.pk)]) showSlice(pie.sl[Number(k.dataset.pk)], ym);
  });
};
const barsCard = (P, done) => {
  const n = monthsIn(P), months = [];
  for (let k = 0; k < n; k++) months.push(App.addMonths(P.from, k));
  const by = {};
  months.forEach(m => { by[m] = { in: 0, out: 0 }; });
  done.forEach(e => { const b = by[e.date.slice(0, 7)]; if (!b) return; if (e.type === 'income') b.in += e.amount; else if (e.type === 'expense') b.out += e.amount; });
  const max = Math.max(1, ...months.map(m => Math.max(by[m].in, by[m].out)));
  const avg = months.reduce((s, m) => s + by[m].out, 0) / n;
  const hi = months.reduce((a, m) => (by[m].out > by[a].out ? m : a), months[0]);
  return '<article class="ph-card pb-card"><div class="hd"><div><h3>Month by month</h3><small>Tap a month to open it</small></div>' +
    '<div class="pb-leg"><span><i class="out"></i>Spent</span><span><i class="in"></i>Money in</span></div></div>' +
    '<div class="pb-chart" style="--n:' + n + '">' +
      (avg > 0 ? '<div class="pb-avg" style="bottom:calc(' + (avg / max * 100).toFixed(1) + '% * .82 + 22px)"><span>avg ' + App.money(avg) + '</span></div>' : '') +
      months.map(m => '<button type="button" class="pb-col' + (m === hi && by[m].out > 0 ? ' hi' : '') + '" data-pm="' + m + '" aria-label="' + esc(monthName(m) + ': spent ' + App.inr(by[m].out) + ', money in ' + App.inr(by[m].in)) + '">' +
        '<span class="pb-bars"><i class="in" style="height:' + (by[m].in / max * 100).toFixed(1) + '%"></i><i class="out" style="height:' + (by[m].out / max * 100).toFixed(1) + '%"></i></span>' +
        (m === hi && by[m].out > 0 ? '<span class="pb-v">' + App.money(by[m].out) + '</span>' : '') +
        '<span class="pb-l">' + (n > 9 ? shortM(m).charAt(0) : shortM(m)) + '</span></button>').join('') + '</div></article>';
};
async function homePeriod(el, P) {
  const data = await App.api.get('/api/ledger?' + App.qs(monthRange()));
  const t = data.totals, ents = data.entries, done = ents.filter(e => e.status === 'done'), n = monthsIn(P);
  const pie = pieCard(ents, P);
  const big = done.filter(e => e.type === 'expense').sort((a, b) => b.amount - a.amount).slice(0, 5);
  el.className = 'ph ph-home';
  el.innerHTML = topBar(monthBar()) +
    '<section class="ph-hero"><div class="lbl"><span>Spent in ' + esc(rangeName(P)) + '</span><span>' + n + ' months</span></div>' +
      '<div class="big">' + App.inr(t.expense) + '</div><div class="note">' + App.inr(t.expense / n) + ' a month on average</div>' +
      '<div class="trio"><div>Money in<b>' + App.money(t.income) + '</b></div><div>Saved<b>' + App.money(t.savings) + '</b></div><div>Loans paid<b>' + App.money(t.loan) + '</b></div></div></section>' +
    barsCard(P, done) + pie.html +
    '<section><div class="ph-cap"><span>Biggest spends</span><a href="#/ledger">See all</a></div>' +
      (big.length ? '<div class="ph-list">' + big.map(e => entryRow(e)).join('') + '</div>' : '<div class="ph-empty">Nothing spent in ' + esc(rangeName(P)) + '.</div>') + '</section>';
  wire(el, ents);
  wirePie(el, ents, pie, P);
  el.querySelector('.pb-chart').addEventListener('click', e => { const b = e.target.closest('[data-pm]'); if (b) setMonth(b.dataset.pm); });
}

/* ================= Home ================= */
/* Safe to spend: what this month can still take after everything already due. Money in (what came in plus income rows
   still to confirm, e.g. a recurring salary; never an income plan, so it stays on the safe side) minus what was spent, bills still to confirm, EMIs and
   savings still due (the plan or the waiting rows, whichever is more) and planned one-offs not spent yet. */
const tally = ents => {
  const z = () => ({ income: 0, expense: 0, savings: 0, loan: 0, transfer: 0 });
  const d = z(), p = z();
  ents.forEach(e => { if (d[e.type] !== undefined) (e.status === 'done' ? d : p)[e.type] += e.amount; });
  return { d, p };
};
const safeToSpend = (ents, P, ones, evs) => {
  const { d, p } = tally(ents), pl = k => (P && P[k + '_plan']) || 0;
  const hasRow = new Set(ents.filter(e => /^one:/.test(e.source_ref || '')).map(e => e.source_ref));
  ones = ones.filter(o => !hasRow.has('one:' + o.id));
  const spentCat = {};
  ents.forEach(e => { if (e.type === 'expense' && e.status === 'done' && e.category_id) spentCat[e.category_id] = (spentCat[e.category_id] || 0) + e.amount; });
  const oneoffs = ones.filter(o => o.type === 'expense')
    .map(o => ({ label: o.description || App.nameOf('categories', o.category_id) || 'Planned one-off', amount: Math.max(0, o.amount - (o.category_id ? spentCat[o.category_id] || 0 : 0)) }))
    .filter(o => o.amount > 0.5);
  const x = {
    income: d.income + p.income, spent: d.expense, bills: p.expense,
    loans: Math.max(pl('loans') - d.loan, p.loan, 0), savings: Math.max(pl('savings') - d.savings, p.savings, 0),
    oneoffs, ones: oneoffs.reduce((s, o) => s + o.amount, 0), plan: pl('spending'),
  };
  x.events = (evs || []).filter(e => e.left > 0.5).map(e => ({ label: e.name, amount: e.left }));
  x.ev = x.events.reduce((s, e) => s + e.amount, 0);
  x.safe = x.income - x.spent - x.bills - x.loans - x.savings - x.ones - x.ev;
  return x;
};
const showSafe = (x, days) => {
  if (App.guide) App.guide.mark('safe');
  const line = (k, v, sign, sub, cls) => '<div class="ph-row hm-why' + (cls ? ' ' + cls : '') + '"><span class="nm"><b>' + k + '</b>' + (sub ? '<span>' + esc(sub) + '</span>' : '') + '</span><span class="am"><span class="amt">' + (sign || '') + App.inr(v) + '</span></span></div>';
  App.bsheet({ title: 'How it is worked out', cls: 'menu', focus: false, body:
    '<div class="ph-list">' + line('Money in this month', x.income, '', 'What came in, plus income rows still to confirm') +
    line('Spent so far', x.spent, '− ') + line('Bills still to confirm', x.bills, '− ', 'Recurring rows not marked paid yet') +
    line('EMIs still due', x.loans, '− ') + line('Savings still to put in', x.savings, '− ', 'Monthly targets and SIPs') +
    (x.ones ? line('Bombs this month', x.ones, '− ', x.oneoffs.map(o => o.label).join(', ')) : '') +
    (x.ev ? line('Events, still to spend', x.ev, '− ', x.events.map(o => o.label).join(', ')) : '') +
    line('Safe to spend', x.safe, '', x.safe > 0 ? App.inr(x.safe / days) + ' a day for the ' + days + ' day' + (days > 1 ? 's' : '') + ' left' : 'Nothing left to spend freely this month', 'tot') + '</div>' +
    '<p class="hint">Plans: spending per category in Family Setup; recurring rows, savings targets, events and bombs under Ahead.</p>' });
};

/* coming up: rows to confirm dated up to a week ahead (late ones first), plus loan payments due with no row yet */
const addDays = (iso, n) => App.ymd(new Date(new Date(iso + 'T00:00:00').getTime() + n * 864e5));
const comingUp = (ents, loans) => {
  const today = App.today(), until = addDays(today, 7);
  const rows = ents.filter(e => e.status === 'pending' && e.date <= until).map(e => ({ e, date: e.date, name: e.source === 'oneoff' ? e.description || entryName(e) : entryName(e), amount: e.amount }));   // a bomb by its own name
  (loans || []).filter(l => l.active !== 0 && l.next_due && l.next_due.date <= until && !ents.some(e => e.type === 'loan' && e.loan_id === l.id && e.date.slice(0, 7) === l.next_due.date.slice(0, 7)))
    .forEach(l => rows.push({ loan: l, date: l.next_due.date, name: l.name + (l.next_due.kind === 'pre_emi' ? ' · interest' : ' · EMI'), amount: l.next_due.amount }));
  return rows.sort((a, b) => a.date.localeCompare(b.date));
};
const whenLabel = iso => { const t = App.today(); if (iso < t) return 'Late · was due ' + dayLabel(iso).replace(/^\w+, /, ''); if (iso === t) return 'Today'; return iso === addDays(t, 1) ? 'Tomorrow' : dayLabel(iso); };
const upCard = items => {
  if (!items.length) return '';
  const row = (r, k) => '<div class="ph-row' + (r.date < App.today() ? ' late' : '') + '" role="button" tabindex="0" ' + (r.e ? 'data-eid="' + r.e.id + '"' : 'data-uploan="' + k + '"') + '>' +
    '<span class="ic" style="--h:' + App.hue(r.name) + '">' + App.iconFor(r.e ? r.name : 'loan', r.e ? r.e.type : 'loan') + '</span>' +
    '<span class="nm"><b>' + esc(r.name) + '</b><span>' + esc(whenLabel(r.date)) + '</span></span>' +
    '<span class="am"><span class="amt">' + App.inr(r.amount) + '</span>' + (r.e ? '<button type="button" class="ph-confirm" data-confirm="' + r.e.id + '">' + (r.e.type === 'income' ? 'Got it' : 'Paid') + '</button>' : '<button type="button" class="ph-confirm" data-uploan="' + k + '">Pay</button>') + '</span></div>';
  const late = items.filter(r => r.date < App.today()).length;
  return '<article class="ph-card hm-up"><div class="hd"><div><h3>Coming up</h3><small>Next 7 days' + (late ? ' · ' + late + ' late' : '') + '</small></div><span class="ph-tag ' + (late ? 'bad' : 'warn') + '">' + items.length + '</span></div>' +
    '<div class="ph-list">' + items.slice(0, 5).map(row).join('') + '</div>' + (items.length > 5 ? '<a class="ph-more" href="#/ledger">' + (items.length - 5) + ' more in Activity</a>' : '') + '</article>';
};

/* the other person's latest entries (last 2 days) */
const tsOf = s => { const t = String(s || ''); if (!t) return 0; return Date.parse(t.replace(' ', 'T') + (/[zZ]$|[+-]\d\d:?\d\d$/.test(t) ? '' : 'Z')) || 0; };
const ago = ms => { const m = Math.max(1, Math.round((Date.now() - ms) / 60000)); return m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + 'h ago' : Math.round(m / 1440) + 'd ago'; };
const feedCard = ents => {
  const me = App.me(); if (!me) return '';
  const since = Date.now() - 2 * 864e5;
  const rows = ents.filter(e => e.person_id && e.person_id !== me.id && e.source !== 'recurring' && tsOf(e.created_at) > since)
    .sort((a, b) => tsOf(b.created_at) - tsOf(a.created_at)).slice(0, 3);
  if (!rows.length) return '';
  return '<div class="hm-feed">' + rows.map(e => '<div class="hm-fd" role="button" tabindex="0" data-eid="' + e.id + '"><span class="av" style="--h:' + App.hue(e.person) + '">' + esc(String(e.person || '?').charAt(0).toUpperCase()) + '</span>' +
    '<span class="tx"><b>' + esc(e.person) + '</b> added ' + App.inr(e.amount) + ' ' + esc(entryName(e)) + '</span><span class="tm">' + ago(tsOf(e.created_at)) + '</span></div>').join('') + '</div>';
};

/* spending vs plan: each expense category's spending against its monthly plan */
const planRows = (ents, nm) => {
  const spent = {};
  ents.forEach(e => { if (e.type === 'expense' && e.status === 'done') { const k = e.category_id || 0; spent[k] = (spent[k] || 0) + e.amount; } });
  return (App.opt.categories || []).filter(c => c.type === 'expense' && (c.active !== 0 || spent[c.id]))
    .map(c => ({ id: c.id, name: c.name, plan: (c.budget || 0) * (nm || 1), spent: spent[c.id] || 0, rows: ents.filter(e => e.type === 'expense' && e.status === 'done' && e.category_id === c.id) }))
    .filter(r => r.plan > 0 || r.spent > 0)
    .sort((a, b) => (b.plan > 0) - (a.plan > 0) || Math.max(b.spent / (b.plan || 1), 0) - Math.max(a.spent / (a.plan || 1), 0) || b.spent - a.spent);
};
const planView = (ents, ym) => {
  const rows = planRows(ents, nmOf(ym));
  if (!rows.length) return '<div class="hp-empty"><span class="pc-ring"></span><span>No spending in ' + esc(monthName(ym)) + ' yet, and no monthly budgets. Set them in Settings → Categories.</span></div>';
  const tp = rows.reduce((s, r) => s + r.plan, 0), ts = rows.reduce((s, r) => s + r.spent, 0);
  return '<div class="hm-plan">' + (tp ? '<div class="hm-plantot"><span>' + App.inr(ts) + ' of ' + App.inr(tp) + ' planned</span><span class="' + (ts > tp ? 'neg' : '') + '">' + (ts > tp ? App.inr(ts - tp) + ' over' : App.inr(tp - ts) + ' left') + '</span></div>' : '') +
    rows.slice(0, 7).map((r, k) => {
      const over = r.plan > 0 && r.spent > r.plan + 0.5, pct = r.plan ? Math.min(100, r.spent / r.plan * 100) : 100;
      return '<button type="button" class="hm-pr' + (over ? ' over' : '') + '" data-plk="' + k + '" aria-label="' + esc(r.name + ': ' + App.inr(r.spent) + (r.plan ? ' of ' + App.inr(r.plan) : '') + '. Show entries') + '">' +
        '<span class="t"><span class="n">' + esc(r.name) + '</span><span class="v">' + App.inr(r.spent) + (r.plan ? '<small> / ' + App.money(r.plan) + '</small>' : '<small> · no budget</small>') + '</span></span>' +
        '<span class="ph-bar' + (r.plan ? '' : ' none') + '"><i style="width:' + pct.toFixed(1) + '%"></i></span></button>';
    }).join('') + (rows.length > 7 ? '<a class="ph-more" href="#/settings?s=categories">All ' + rows.length + ' categories</a>' : '') + '</div>';
};

/* Home before setup: the setup steps (App.SETUP, core/phone-settings.js) as a timeline, each ticked once it is done.
   Each row opens that step: the real page (Family, Accounts, Recurring…) with a setup bar on top. */
/* the family step: you are already in it after the setup code, so it counts once someone else is added, or once
   you said it is just you (kept on this phone) */
App.familyDone = () => { let solo = false; try { solo = localStorage.getItem('rp.familySolo') === '1'; } catch (e) { /* ignore */ }
  return (App.opt.people || []).filter(p => p.active !== 0).length > 1 || solo; };
const TICK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12.5 4 4 8-9"/></svg>';
const stepRows = ok => {
  const next = ok ? ok.indexOf(false) : -1;
  return App.SETUP.map((st, k) => {
    const done = ok && ok[k], nx = k === next;
    return '<a class="st-row' + (done ? ' done' : nx ? ' next' : '') + '" href="' + esc(App.setupHref(st.id)) + '" style="--i:' + k + '"' + (done ? ' aria-label="' + esc(st.t) + ', done"' : '') + '>' +
      '<span class="st-b">' + (done ? TICK : nx ? App.ico(st.ic) : k + 1) + '</span><span class="nm"><b>' + esc(st.t) + '</b><span>' + esc(st.sub) + '</span></span>' +
      (done ? '<span class="st-tag">Done</span>' : nx ? '<span class="st-tag">Next</span>' : '<span class="st-go" aria-hidden="true">›</span>') + '</a>';
  }).join('');
};

App.phonePage('home', {
  title: 'Home',
  async render(el) {
    const P0 = period();
    if (!noSetup() && !isSingle(P0)) return homePeriod(el, P0);
    const ym = P0.from, cur = isSingle(P0) && ym === App.today().slice(0, 7);
    el.className = 'ph ph-home';
    if (noSetup()) {
      const ok = await App.setupStatus();                     // ticks from what is already set up (people, accounts, recurring rows…)
      el.innerHTML = topBar(monthBar(ym)) + '<section class="ph-hero"><div class="lbl"><span>Welcome to RuPeace</span></div><div class="big" style="font-size:26px;white-space:normal;line-height:1.15">Let\'s set up your household</div>' +
        '<div class="note">Two minutes: your family, accounts, salary, regular bills and loans. Home then shows what is safe to spend.</div>' +
        '<a class="btn primary hm-go" href="' + esc(App.setupHref((App.SETUP[ok.indexOf(false)] || App.SETUP[0]).id)) + '">' + (ok.some(Boolean) ? 'Carry on with setup' : 'Start setup') + '</a></section>' +
        '<section><div class="ph-cap"><span>What the setup covers</span><span>' + ok.filter(Boolean).length + ' of ' + ok.length + ' done</span></div><div class="ph-card st-tl">' + stepRows(ok) + '</div></section>';
      wire(el, []);                                   // the month switcher works here too (picker, arrows, this month)
      return;
    }
    const [data, plan, loans, ones, ahead, evl] = await Promise.all([
      App.api.get('/api/ledger?' + App.qs(monthRange())),
      cur ? App.api.get('/api/plan').catch(() => null) : null,
      cur ? App.api.get('/api/loans').catch(() => null) : null,
      cur ? App.api.get('/api/setup/planned_items').catch(() => null) : null,
      cur ? App.api.get('/api/projection').catch(() => null) : null,
      cur ? App.api.get('/api/events').catch(() => null) : null,
    ]);
    const t = data.totals, ents = data.entries, done = ents.filter(e => e.status === 'done');
    const P = cur && plan ? (plan.months || []).find(m => m.when === 'now') : null;
    const days = Number(App.monthEnd(ym + '-01').slice(8)) - Number(App.today().slice(8)) + 1;
    const monthEnd = App.monthEnd(ym + '-01');
    const evThis = ((evl && evl.events) || []).filter(e => e.state !== 'done' && e.start_date <= monthEnd);   // on now, or starting this month
    const x = cur ? safeToSpend(ents, P, ((ones && ones.rows) || []).filter(o => o.month === ym && o.type !== 'income'), evThis) : null;
    const up = cur ? comingUp(ents, loans && loans.loans) : [];
    const pie = pieCard(ents, ym);
    const hero = cur
      ? '<section class="ph-hero hm-safe" data-safe role="button" tabindex="0" aria-label="Safe to spend ' + App.inr(x.safe) + '. How it is worked out"><div class="lbl"><span>' + (x.safe >= 0 ? 'Safe to spend' : 'Short this month') + ' · ' + days + ' day' + (days > 1 ? 's' : '') + ' left</span><span>How? ›</span></div>' +
        '<div class="big' + (x.safe < 0 ? ' neg' : '') + '">' + App.inr(Math.abs(x.safe)) + '</div>' +
        '<div class="note">' + (x.safe > 0 ? App.inr(x.safe / days) + ' a day · after bills, EMIs and savings still due' : 'Bills, EMIs and savings still due are more than what is left') + '</div>' +
        (x.plan > 0 ? '<div class="ph-bar hm-bar' + (x.spent > x.plan ? ' over' : '') + '"><i style="width:' + Math.min(100, x.spent / x.plan * 100).toFixed(1) + '%"></i></div><div class="hm-sub"><span>Spent ' + App.inr(x.spent) + '</span><span>Budget ' + App.inr(x.plan) + '</span></div>'
          : '<div class="trio"><div>In<b>' + App.money(t.income) + '</b></div><div>Spent<b>' + App.money(t.expense) + '</b></div><div>Still due<b>' + App.money(x.bills + x.loans + x.savings + x.ones) + '</b></div></div>') + '</section>'
      : '<section class="ph-hero" aria-label="' + esc(monthName(ym)) + '"><div class="lbl"><span>Left in ' + esc(monthName(ym)) + '</span></div>' +
        '<div class="big' + (t.net < 0 ? ' neg' : '') + '">' + App.inr(t.net) + '</div>' +
        '<div class="note">' + (t.savings ? 'After ' + App.inr(t.savings) + ' put into savings' : 'Money in minus spending and loan payments') + '</div>' +
        '<div class="trio"><div>In<b>' + App.money(t.income) + '</b></div><div>Out<b>' + App.money(t.expense) + '</b></div><div>Loan<b>' + App.money(t.loan) + '</b></div></div></section>';
    el.innerHTML = topBar(monthBar(ym)) + nowRow(ym) + hero + walletCard(data.balances, ents) + '<div data-guide-card></div>' +
      (cur ? aheadCard(ahead) : '') + (SY() ? SY().cardHost() : '') + upCard(up) + feedCard(ents) +
      pie.html +                                                        // no quick categories and no Recent list on Home any more (Activity has them)
      (done.length ? '' : '<div class="ph-empty">Nothing added in ' + esc(monthName(ym)) + ' yet. Tap + to add the first one.</div>');
    wire(el, ents);
    const hs = el.querySelector('[data-safe]');
    if (hs) { hs.onclick = () => showSafe(x, days); hs.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showSafe(x, days); } }; }
    el.addEventListener('click', e => {
      const ul = e.target.closest('[data-uploan]');
      if (ul) { const r = up[Number(ul.dataset.uploan)]; if (r && r.loan) App.quickAdd({ preset: { type: 'loan', loan_id: r.loan.id, loan_part: r.loan.next_due.kind === 'pre_emi' ? 'pre_emi' : 'emi', date: r.date < App.today() ? App.today() : r.date }, amount: Math.round(r.amount) }); }
    });
    wirePie(el, ents, pie, ym);
    wireWallet(el);
    if (data.made) App.toast(data.made + ' recurring row' + (data.made > 1 ? 's' : '') + ' added to confirm');
    loadUsage();
    if (App.guide) App.guide.home(el, ents);
  },
});

/* ================= Ledger: entries grouped by day ================= */
let ledgerType = 'all';
App.phonePage('ledger', {
  title: 'Activity',
  async render(el) {
    const ym = curPeriod();
    const data = await App.api.get('/api/ledger?' + App.qs(monthRange()));
    const t = data.totals;
    const acc = ledgerAcct ? (App.opt.accounts || []).find(a => a.id === ledgerAcct) : null;
    if (ledgerAcct && !acc) ledgerAcct = null;
    const list = data.entries.filter(e => (ledgerType === 'all' || e.type === ledgerType) && (!ledgerAcct || e.account_id === ledgerAcct || e.to_account_id === ledgerAcct));
    const days = [];
    list.forEach(e => { const last = days[days.length - 1]; if (last && last.date === e.date) last.rows.push(e); else days.push({ date: e.date, rows: [e] }); });
    const filt = [['all', 'All']].concat(TYPES).map(([k, l]) => '<button type="button" class="pchip" data-ltype="' + k + '" aria-pressed="' + (ledgerType === k) + '">' + esc(l) + '</button>').join('');
    el.className = 'ph ph-ledger';
    el.innerHTML = topBar(monthBar(ym)) + nowRow(ym) +
      (App.guide ? App.guide.tip('activity', 'Everything added this month, by everyone. Tap a row to change or delete it. Rows marked <b>To confirm</b> come from your recurring bills and salary.') : '') +
      '<div class="ph-sum"><div><div class="k">In</div><div class="v pos">' + App.money(t.income) + '</div></div><div><div class="k">Out</div><div class="v">' + App.money(t.expense + t.savings + t.loan) + '</div></div>' +
      '<div><div class="k">Left</div><div class="v ' + (t.net < 0 ? 'neg' : '') + '">' + App.money(t.net) + '</div></div></div>' +
      (acc ? '<div class="ph-chips"><button type="button" class="pchip" aria-pressed="true" data-noacct>' + App.ico(acc.kind === 'card' ? 'card' : acc.kind === 'cash' ? 'money' : 'bank') + '<span>' + esc(acc.name) + '</span><span aria-hidden="true">✕</span></button></div>' : '') +
      '<div class="ph-chips" aria-label="Show">' + filt + '</div>' +
      (noSetup() ? setupCard : days.length ? '<div class="ph-list">' + days.map(d => {
        const spent = d.rows.filter(e => e.type === 'expense' && e.status === 'done').reduce((s, e) => s + e.amount, 0);
        return '<div class="ph-day"><span>' + dayLabel(d.date) + '</span><span>' + (spent ? 'Spent ' + App.inr(spent) : '') + '</span></div>' + d.rows.map(e => entryRow(e, { confirm: true })).join('');
      }).join('') + '</div>' : '<div class="ph-empty">' + (ledgerType === 'all' ? 'No entries in ' + esc(monthName(ym)) + ' yet. Tap + to add one.' : 'No ' + esc(typeLabel(ledgerType).toLowerCase()) + ' entries in ' + esc(monthName(ym)) + '.') + '</div>') +
      '';
    wire(el, data.entries);
    el.querySelectorAll('.ph-chips').forEach(c => c.addEventListener('click', e => {
      if (e.target.closest('[data-noacct]')) { ledgerAcct = null; return App.refresh(); }
      const b = e.target.closest('[data-ltype]'); if (b) { ledgerType = b.dataset.ltype; App.refresh(); }
    }));
    if (data.made) App.toast(data.made + ' recurring row' + (data.made > 1 ? 's' : '') + ' added to confirm');
    loadUsage();
  },
});

/* ================= Loans (status only) ================= */
const monthLabel = ym => (ym ? App.month(ym) : '—');
App.phonePage('loans', {
  title: 'Loans',
  async render(el) {
    const d = await App.api.get('/api/loans');
    const f = d.family || {}, loans = (d.loans || []).filter(l => l.active !== 0);
    el.className = 'ph ph-loans';
    el.innerHTML = topBar('<div class="ph-title">Loans</div>') +
      (loans.length ? '<section class="ph-hero"><div class="lbl"><span>Still to repay</span></div><div class="big">' + App.money(f.outstanding) + '</div>' +
        '<div class="note">' + (f.next ? 'Next: ' + App.inr(f.next.amount) + ' on ' + App.date(f.next.date) + ' · ' + esc(f.next.loan || '') : 'No payment due') + '</div>' +
        '<div class="trio"><div>Monthly<b>' + App.money(f.monthly) + '</b></div><div>Debt-free<b>' + esc(f.debt_free ? App.month(f.debt_free) : '—') + '</b></div><div>Interest saved<b>' + App.money(f.interest_saved || 0) + '</b></div></div></section>' +
        loans.map(L => {
          const st = String(L.status || ''), tag = st === 'EMI' ? 'good' : st === 'closed' ? 'good' : L.missed ? 'bad' : '';
          const paidPct = L.released > 0 ? Math.min(100, Math.max(0, (1 - L.outstanding / L.released) * 100)) : 0;
          return '<a class="ph-card ph-tap" href="#/settings?s=loan&id=' + L.id + '"><div class="hd"><div><h3>' + esc(L.name) + '</h3><small>' + esc([App.label(L.kind), L.lender, L.rate_now ? L.rate_now + '% a year' : ''].filter(Boolean).join(' · ')) + '</small></div>' +
            '<span class="ph-tag ' + tag + '">' + esc(App.label(st) || '—') + '</span></div>' +
            '<div class="ph-kv"><div><div class="k">Outstanding</div><div class="v">' + App.money(L.outstanding) + '</div></div>' +
            '<div><div class="k">' + (L.next_due && L.next_due.kind === 'pre_emi' ? (L.repay === 'interest' ? 'Interest' : 'Pre-EMI') : 'EMI') + '</div><div class="v">' + App.inr(L.next_due && L.next_due.kind === 'pre_emi' ? L.next_due.amount : L.emi) + '</div></div>' +
            '<div><div class="k">Next due</div><div class="v">' + (L.next_due ? esc(App.date(L.next_due.date)) : '—') + '</div></div>' +
            '<div><div class="k">Loan-free</div><div class="v">' + esc(L.repay === 'interest' && !L.loan_free ? 'Interest only' : monthLabel(L.loan_free_plan || L.loan_free)) + '</div></div></div>' +
            (L.released > 0 ? '<div class="ph-bar" title="Repaid"><i style="width:' + paidPct.toFixed(1) + '%"></i></div><div class="ph-foot"><span>' + Math.round(paidPct) + '% of ' + App.money(L.released) + ' repaid</span>' +
              (L.missed ? '<span class="ph-tag bad">' + L.missed + ' missed</span>' : '') + '</div>'
              : '<div class="ph-foot" style="margin-top:10px"><span>Nothing released yet' + (L.principal ? ' · ' + App.money(L.principal) + ' sanctioned' : '') + '</span></div>') +
            '</a>';
        }).join('')
        : '<div class="ph-card ph-empty">No loans yet. Tap + to add your home, car, personal or gold loan.</div>');
  },
});

/* ================= Savings (status only) ================= */
App.phonePage('savings', {
  title: 'Savings',
  async render(el) {
    const d = await App.api.get('/api/savings');
    const T = d.totals || {}, places = (d.places || []).filter(p => p.active !== 0);
    el.className = 'ph ph-savings';
    el.innerHTML = topBar('<div class="ph-title">Savings</div>') +
      (places.length ? '<section class="ph-hero"><div class="lbl"><span>Worth now</span></div><div class="big">' + App.money(T.value_now) + '</div>' +
        '<div class="note">' + (T.gain ? (T.gain > 0 ? 'Up ' : 'Down ') + App.money(Math.abs(T.gain)) + ' on what went in' + (T.gain_pct ? ' (' + Math.round(T.gain_pct * 10) / 10 + '%)' : '') : App.money(T.put_in_total) + ' put in so far') + '</div>' +
        '<div class="trio"><div>This month<b>' + App.money(T.this_month) + '</b></div><div>Target<b>' + App.money(T.monthly_target) + '</b></div><div>Places<b>' + places.length + '</b></div></div></section>' +
        (d.unlinked && d.unlinked.count ? '<div class="ph-pend" style="cursor:default">' + I.clock + '<span class="sp">' + d.unlinked.count + ' savings entr' + (d.unlinked.count > 1 ? 'ies have' : 'y has') + ' no place picked (' + App.inr(d.unlinked.amount) + ')</span></div>' : '') +
        places.map(p => {
          const tgt = p.monthly_target > 0, pct = tgt ? Math.min(100, p.this_month / p.monthly_target * 100) : 0;
          return '<a class="ph-card ph-tap" href="#/settings?s=place&id=' + p.id + '"><div class="hd"><div><h3>' + esc(p.name) + '</h3><small>' + esc([p.kind_label, p.owner, p.provider].filter(Boolean).join(' · ')) + '</small></div>' +
            (tgt ? '<span class="ph-tag ' + (p.target_met ? 'good' : 'warn') + '">' + (p.target_met ? 'Target met' : 'Below target') + '</span>' : '') + '</div>' +
            '<div class="ph-kv"><div><div class="k">Worth now</div><div class="v">' + App.money(p.value_now) + '</div></div>' +
            '<div><div class="k">Gain</div><div class="v ' + (p.gain > 0 ? 'pos' : p.gain < 0 ? 'neg' : '') + '">' + (p.gain ? App.money(p.gain) : '—') + '</div></div>' +
            '<div><div class="k">Put in</div><div class="v">' + App.money(p.put_in_total) + '</div></div>' +
            '<div><div class="k">Last added</div><div class="v">' + (p.last_added ? esc(App.date(p.last_added)) : '—') + '</div></div></div>' +
            (tgt ? '<div class="ph-bar' + (p.target_met ? ' good' : '') + '"><i style="width:' + pct.toFixed(1) + '%"></i></div><div class="ph-foot"><span>' + App.inr(p.this_month) + ' of ' + App.inr(p.monthly_target) + ' this month</span></div>' : '') +
            '<div class="ph-foot" style="margin-top:6px"><span>' + (p.value_as_of ? 'Value checked ' + esc(App.date(p.value_as_of)) : 'Worth = what was put in (no statement value yet)') + '</span>' + (p.maturity_date ? '<span>Matures ' + esc(App.date(p.maturity_date)) + '</span>' : '') + '</div>' +
            '</a>';
        }).join('')
        : '<div class="ph-card ph-empty">No savings places yet. Tap + to add your mutual funds, PPF, EPF, NPS, FDs and so on.</div>');
  },
});

/* ================= Next 12 months (read-only projection, GET /api/projection) ================= */
const monthWord = (m, first) => (first ? 'Rest of ' + FULL[Number(m.slice(5, 7)) - 1] : App.month(m));
const verdictOf = d => (d.short ? 'Money runs short in ' + App.month(d.short.month) + ' (' + App.inr(-d.short.end) + ')'
  : "You're fine through " + App.month(d.through));
const lowestOf = d => {
  const lo = d.lowest; if (!lo) return '';
  const goal = (lo.events || []).find(e => e.kind === 'goal');
  return lo.end < 0 ? 'Lowest: ' + App.month(lo.month) + ' · short by ' + App.inr(-lo.end)
    : (lo.status === 'tight' ? 'Tightest: ' : 'Lowest: ') + App.month(lo.month) + ' · ' + App.inr(lo.end) + ' left' + (goal ? ' after ' + goal.label : '');
};
/* Home: one card, a sentence and a small line of cash at each month end */
const aheadCard = d => {
  if (!d || !d.months || d.months.length < 2) return '';
  const ends = d.months.map(m => m.end), lo = Math.min(0, ...ends), hi = Math.max(1, ...ends);
  const W = 300, H = 48, X = i => (i / (ends.length - 1) * W).toFixed(1), Y = v => (H - 5 - (v - lo) / ((hi - lo) || 1) * (H - 10)).toFixed(1);
  let k = 0; ends.forEach((v, i) => { if (v < ends[k]) k = i; });
  const bad = !!d.short;
  return '<a class="ph-card hm-ahead" href="#/ahead" aria-label="Next 12 months: ' + esc(verdictOf(d)) + '. Open the month by month view">' +
    '<div class="hd"><div><h3>Next 12 months</h3></div><span class="go" aria-hidden="true">›</span></div>' +
    '<div class="hm-verdict' + (bad ? ' neg' : '') + '">' + esc(verdictOf(d)) + '</div>' +
    '<svg class="hm-spark" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true">' +
      (lo < 0 ? '<line x1="0" x2="' + W + '" y1="' + Y(0) + '" y2="' + Y(0) + '" class="zero"/>' : '') +
      '<polyline points="' + ends.map((v, i) => X(i) + ',' + Y(v)).join(' ') + '"/>' +
      '<circle cx="' + X(k) + '" cy="' + Y(ends[k]) + '" r="4" class="' + (ends[k] < 0 ? 'bad' : 'low') + '"/></svg>' +
    '<div class="hm-low">' + esc(lowestOf(d)) + '</div></a>';
};

let aheadData = null;
const GROUP_ORDER = ['in', 'spend', 'bills', 'loans', 'savings', 'goals'];
const showMonth = m => {
  const rows = m.lines.slice().sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group));
  const line = (label, note, amt, cls) => '<div class="ph-row am-line' + (cls ? ' ' + cls : '') + '"><span class="nm"><b>' + esc(label) + '</b>' + (note ? '<span>' + esc(note) + '</span>' : '') + '</span>' +
    '<span class="am"><span class="amt' + (amt > 0 && cls !== 'edge' ? ' in' : '') + '">' + (cls === 'edge' ? App.inr(amt) : (amt > 0 ? '+' : '−') + App.inr(Math.abs(amt)).replace('−', '')) + '</span></span></div>';
  App.bsheet({ title: monthWord(m.month, m.first), cls: 'menu', focus: false, body:
    (m.status !== 'ok' ? '<div><span class="ph-tag ' + (m.status === 'short' ? 'bad' : 'warn') + '">' + (m.status === 'short' ? 'Short' : 'Tight') + '</span></div>' : '') +
    '<div class="ph-list">' + line(m.first ? 'Today' : 'Start of month', '', m.start, 'edge') +
    rows.map(l => line(l.label, l.note + (l.parts ? ': ' + l.parts.map(p => p.label + ' ' + App.money(p.amount)).join(', ') : ''), l.amount)).join('') +
    line('End of month', '', m.end, 'edge tot') + '</div>' +
    '<p class="hint">Worked out from what is already in the app: balances today, recurring income and bills, loans, savings targets, planned expenses, and your spending over the last 3 months. Nothing to edit here: change a salary, bill, loan or goal where it lives and this follows.</p>' });
};
App.phonePage('ahead', {
  title: 'Next 12 months',
  async render(el) {
    const d = aheadData = await App.api.get('/api/projection');
    if (App.guide) App.guide.mark('ahead');
    const last = d.months[d.months.length - 1];
    el.className = 'ph ph-ahead';
    el.innerHTML = '<div class="ph-top"><a class="ah-back" href="#/home" aria-label="Back to Home">' + I.left + '<span>Next 12 months</span></a>' + App.avatar() + '</div>' +
      (App.guide ? App.guide.tip('ahead', 'Worked out from everything already in the app. Tap a month to see where its number comes from.') : '') +
      '<section class="ph-hero"><div class="lbl"><span>Bank and cash at the end of ' + esc(App.month(last.month)) + '</span></div>' +
      '<div class="big' + (last.end < 0 ? ' neg' : '') + '">' + App.money(last.end) + '</div>' +
      '<div class="note" style="margin:0">From ' + App.money(d.start) + ' today · ' + esc(verdictOf(d)) + '</div></section>' +
      '<article class="ph-card"><div class="hd"><div><h3>Cash at each month end</h3><small>Marked: planned expenses and loans ending</small></div></div><div class="chart ph-chart" data-chart></div></article>' +
      '<section><div class="ph-cap"><span>Month by month</span><span>Tap one to see why</span></div><div class="ph-card ph-list ph-months">' + d.months.map((m, k) => {
        const [y, mo] = m.month.split('-').map(Number);
        const ev = m.events.map(e => e.kind === 'goal' ? e.label + ' ' + App.money(e.amount) : e.label + ' · +' + App.money(e.amount) + ' a month after').join(' · ');
        return '<button type="button" class="ph-row" data-am="' + k + '"><span class="ic" style="--h:var(--accent)">' + App.MN[mo - 1] + '<br>' + String(y).slice(2) + '</span>' +
          '<span class="nm"><b>' + esc(monthWord(m.month, m.first)) + '</b><span>' + esc(ev || 'In ' + App.money(m.in) + ' · out ' + App.money(m.out)) + '</span></span>' +
          '<span class="am"><span class="amt' + (m.end < 0 ? ' neg' : '') + '">' + App.money(m.end) + '</span>' + (m.status !== 'ok' ? '<span class="ph-tag ' + (m.status === 'short' ? 'bad' : 'warn') + '">' + (m.status === 'short' ? 'Short' : 'Tight') + '</span>' : '') + '</span></button>';
      }).join('') + '</div></section>' +
      '<p class="hint" style="text-align:center">Worked out from your balances today, recurring income and bills, loans, savings targets, planned expenses and the last 3 months of spending. Nothing here is edited by hand.</p>';
    el.addEventListener('click', e => { const b = e.target.closest('[data-am]'); if (b) showMonth(d.months[Number(b.dataset.am)]); });
  },
  after(el) {
    const host = el.querySelector('[data-chart]'), d = aheadData;
    if (!host || !d) return;
    const marks = [];
    d.months.forEach(m => m.events.forEach(e => marks.push({ x: m.month, label: e.kind === 'goal' ? e.label : e.label })));
    App.chart(host, { height: 190, series: [{ label: 'Cash at month end', color: 'var(--accent)', points: d.months.map(m => ({ x: m.month, y: m.end })) }],
      marks, refs: d.months.some(m => m.end < 0) ? [{ y: 0, label: 'Zero' }] : [] });
  },
});
App.phonePage('plan', { title: 'Next 12 months', render(el) { location.replace('#/ahead'); el.innerHTML = ''; } });   // old links

/* ================= add / edit sheet: amount, category, and one line for everything else (guessed) ================= */
const listOf = (kind, cur, pick) => (App.opt[kind] || []).filter(x => (x.active !== 0 || String(x.id) === String(cur)) && (!pick || pick(x)));
const parseAmt = s => { const n = Number(String(s || '').replace(/[,₹\s]/g, '')); return isFinite(n) ? n : NaN; };
const SHORT = { expense: 'Expense', income: 'Income', savings: 'Savings', loan: 'Loan', transfer: 'Transfer' };
const KEYS_PAD = ['1', '2', '3', 'del', '4', '5', '6', '+', '7', '8', '9', '=', '.', '0', '00', 'ok'];
const KEY_LABEL = { del: '⌫', ok: '✓' }, KEY_ARIA = { del: 'Delete digit', '.': 'Decimal point', '+': 'Add another amount', '=': 'Add them up', '00': 'Double zero', ok: 'Save' };
const totalOf = s => Math.round(String(s || '').split('+').reduce((t, x) => t + (Number(x) || 0), 0) * 100) / 100;   // "120+200" -> 320
const fmtTyped = s => { if (!s) return '0'; const [i, f] = s.split('.'); return Number(i || 0).toLocaleString('en-IN') + (f !== undefined ? '.' + f : ''); };

/* App.quickAdd({ entry, preset, amount }) — entry: edit / delete / confirm that row; preset: starting values; amount: starting amount. */
App.quickAdd = async ({ entry = null, preset = {}, amount = null, desc: descPreset = '' } = {}) => {
  if (!App.opt) await App.loadOptions();
  App.qaResume = null;
  const edit = !!entry, pending = edit && entry.status === 'pending', today = App.today();
  const people = listOf('people', entry && entry.person_id);
  const me = App.me(), last = Number(store.get('ff.lastBy')) || null;
  const defBy = (me && me.id) || (people.find(p => p.id === last) || {}).id || (people[0] || {}).id || null;
  const KEYS = ['date', 'type', 'category_id', 'person_id', 'method', 'account_id', 'to_account_id', 'loan_id', 'loan_part', 'savings_id', 'for_id', 'event_id'];
  let evs = App.events || [];                                       // Events (Ahead → Events): a spend can be linked to one
  const v = edit ? Object.fromEntries(KEYS.map(k => [k, entry[k] == null || entry[k] === '' ? null : entry[k]]))
    : Object.assign({ date: today, type: 'expense', category_id: null, person_id: defBy, method: null, account_id: null, to_account_id: null, loan_id: null, loan_part: 'emi', savings_id: null, for_id: null, event_id: null }, preset);
  let amt = edit ? String(Math.round(entry.amount * 100) / 100) : amount != null ? String(amount) : '';
  let desc = edit ? entry.description || '' : descPreset || '';
  let u = usage || blankUsage(), showAll = false, busy = false, more = false;
  const touched = {};
  Object.keys(preset).forEach(k => { touched[k] = true; });

  const accountsFor = (method, cur) => listOf('accounts', cur, a => (v.type === 'transfer' ? true : method === 'Credit card' ? a.kind === 'card' : method === 'Cash' ? a.kind === 'cash'
    : method && method !== 'Other' ? a.kind === 'bank' || a.kind === 'wallet' : a.kind !== 'card'));
  const usualAccount = method => {                                    // the account used most with this way of paying
    const opts = accountsFor(method, null), m = (u.acctMeth || {})[method] || {};
    let best = null, n = 0;
    opts.forEach(a => { if ((m[a.id] || 0) > n) { n = m[a.id]; best = a.id; } });
    return best;
  };
  const defAccount = () => {
    const opts = accountsFor(v.method, null);
    if (!opts.length) return null;
    const usual = usualAccount(v.method);
    if (usual) return usual;
    const lastA = u.lastAcct[v.method];
    if (lastA && opts.some(a => a.id === lastA)) return lastA;
    if (v.method === 'Cash') { const c = opts.find(a => a.kind === 'cash'); if (c) return c.id; }
    if (opts.length === 1) return opts[0].id;
    const mine = opts.find(a => a.owner_id && a.owner_id === v.person_id && a.kind !== 'cash');
    return mine ? mine.id : null;
  };
  const evOn = iso => evs.find(e => iso >= e.start_date && iso <= (e.end_date || e.start_date));
  const autoEvent = () => { if (edit || touched.event_id) return; const on = v.type === 'expense' ? evOn(v.date) : null; v.event_id = on ? on.id : null; };
  const evChoices = () => evs.filter(e => e.state !== 'done' || String(e.id) === String(v.event_id));
  const forOf = cid => { const f = u.forCat[cid]; return f && people.some(p => p.id === f) ? f : null; };   // usual "for" of a category
  const fitAccount = () => { if (v.account_id && (!touched.account_id || !accountsFor(v.method, null).some(a => a.id === v.account_id))) v.account_id = null; if (!v.account_id) v.account_id = defAccount(); };
  const fillDefaults = () => {   // after a type change on a new entry
    if (!v.method) v.method = u.lastMeth[v.type] || (v.type === 'income' ? 'Bank transfer' : 'UPI');
    if (v.account_id && !accountsFor(v.method, null).some(a => a.id === v.account_id)) v.account_id = null;
    if (!v.account_id) v.account_id = defAccount();
    if (!v.category_id && v.type !== 'transfer') { const cs = listOf('categories', null, c => c.type === v.type); if (cs.length === 1) v.category_id = cs[0].id; }
    if (v.type === 'loan') { const ls = listOf('loans'); if (!v.loan_id && ls.length === 1) v.loan_id = ls[0].id; if (!v.loan_part) v.loan_part = 'emi'; if (!v.category_id) { const cs = listOf('categories', null, c => c.type === 'loan'); if (cs.length) v.category_id = cs[0].id; } }
    if (v.type === 'savings') { const ss = listOf('savings'); if (!v.savings_id && ss.length === 1) v.savings_id = ss[0].id; if (!v.category_id) { const cs = listOf('categories', null, c => c.type === 'savings'); if (cs.length) v.category_id = cs[0].id; } }
    if (v.type === 'expense' && v.category_id && !touched.for_id) v.for_id = forOf(v.category_id);
    autoEvent();
  };
  /* picking a category on a new entry: who it is usually for, and how it is usually paid */
  const guessFromCategory = () => {
    if (edit || !v.category_id) return;
    if (v.type === 'expense' && !touched.for_id) v.for_id = forOf(v.category_id);
    const m = u.methCat[v.category_id];
    if (m && !touched.method) { v.method = m; fitAccount(); }
  };

  const eq = (a, b) => String(a) === String(b);
  const chip = (k, val, label, on, emoji) => '<button type="button" class="pchip" data-k="' + k + '" data-v="' + esc(val) + '" aria-pressed="' + !!on + '">' + (emoji ? '<span class="e">' + emoji + '</span>' : '') + '<span>' + esc(label) + '</span></button>';
  const sec = (cap, inner) => '<div class="qa-sec"><div class="qa-cap">' + cap + '</div>' + inner + '</div>';
  const nm = (kind, id) => { const x = (App.opt[kind] || []).find(r => eq(r.id, id)); return x ? x.name : ''; };
  const dateWord = iso => (iso === today ? 'Today' : iso === addDays(today, -1) ? 'Yesterday' : dayLabel(iso));

  /* categories: the 7 used most as icon tiles (the picked one always among them), then More (a picker with search) */
  const byUse = t => listOf('categories', v.category_id, c => c.type === t).map((c, i) => ({ c, n: u.cat[c.id] || 0, i })).sort((a, b) => b.n - a.n || a.i - b.i).map(x => x.c);
  const tile = (c, attr) => '<button type="button" class="qa-tile" ' + attr + ' aria-pressed="' + eq(c.id, v.category_id) + '"><span class="i" style="--ic:' + App.hue(c.name) + '">' + App.iconFor(c.name, v.type) + '</span><span class="n">' + esc(c.name) + '</span></button>';
  const drawCats = () => {
    const t = v.type;
    if (t === 'transfer') { catsEl.innerHTML = ''; return; }
    const cats = byUse(t), N = 7;
    let top = cats.length <= N + 1 ? cats : cats.slice(0, N);
    const sel = cats.find(c => eq(c.id, v.category_id));
    if (sel && top.indexOf(sel) < 0) top = top.slice(0, N - 1).concat([sel]);
    const more = cats.length > top.length;
    catsEl.innerHTML = '<div class="qa-grid">' + top.map(c => tile(c, 'data-k="category_id" data-v="' + c.id + '"')).join('') +
      (more ? '<button type="button" class="qa-tile more" data-pickcat><span class="i">' + App.ico('grid') + '</span><span class="n">More</span></button>'
        : top.length < N + 1 ? '<button type="button" class="qa-tile more" data-pickcat><span class="i">' + App.ico('plus') + '</span><span class="n">New</span></button>' : '') + '</div>';
  };
  const cap1 = s => s.charAt(0).toUpperCase() + s.slice(1);          // a new category starts with a capital
  const openPicker = () => {
    const t = v.type, all = byUse(t), az = all.slice().sort((a, b) => a.name.localeCompare(b.name));
    const grid = list => '<div class="qa-grid">' + list.map(c => tile(c, 'data-pc="' + c.id + '"')).join('') + '</div>';
    const p = App.bsheet({ title: 'Pick a category', cls: 'qa cat-pick', focus: false, body:
      '<input type="search" class="cp-q" data-q placeholder="Search, or type a new one" autocomplete="off" enterkeyhint="done">' + '<div data-list></div>' });
    const q = p.querySelector('[data-q]'), list = p.querySelector('[data-list]');
    const draw = () => {
      const s = q.value.trim(), sl = s.toLowerCase();
      if (sl) {
        const hits = az.filter(c => c.name.toLowerCase().indexOf(sl) >= 0);
        list.innerHTML = (hits.length ? grid(hits) : '') + (hits.some(c => c.name.toLowerCase() === sl) ? '' : '<button type="button" class="btn cp-add" data-addcat>+ Add "' + esc(s) + '"</button>');
      } else list.innerHTML = (all.length > 8 ? '<div class="qa-cap">Most used</div>' + grid(all.slice(0, 4)) + '<div class="qa-cap">All · A–Z</div>' : '') + grid(az) +
        '<p class="cp-hint">Type above to find one, or to make a new one.</p>';
    };
    draw();
    q.addEventListener('input', draw);
    const pickIt = id => { v.category_id = id; touched.category_id = true; guessFromCategory(); err.textContent = ''; p.close2(); drawAll(); };
    p.addEventListener('click', async e => {
      const b = e.target.closest('[data-pc]'); if (b) return pickIt(Number(b.dataset.pc));
      if (e.target.closest('[data-addcat]')) { try { pickIt(await App.ensureCategory(cap1(q.value.trim()), t)); } catch (ex) { App.toast(ex.message, true); } }
    });
    q.addEventListener('keydown', async e => { if (e.key === 'Enter') { e.preventDefault(); const s = q.value.trim(); if (!s) return; const hit = az.find(c => c.name.toLowerCase() === s.toLowerCase()); if (hit) pickIt(hit.id); else try { pickIt(await App.ensureCategory(cap1(s), t)); } catch (ex) { App.toast(ex.message, true); } } });
  };
  /* the details: a row of dropdowns under the categories (approved): Paid from, date (the app's calendar), event, for,
     who paid (a small face) and a note. Each opens a short list right there, in the Account page's menu style. */
  let ddEl = null;
  const ddClose = () => { if (ddEl) { ddEl.remove(); ddEl = null; } sumEl.querySelectorAll('.qa-dd.open').forEach(x => x.classList.remove('open')); };
  const ddItem = (val, label, on, sub, ic) => '<button type="button" class="qa-ddi' + (on ? ' on' : '') + (sub ? ' sub' : '') + '" data-dv="' + esc(val) + '">' + (ic || '') + '<span>' + esc(label) + '</span>' + (on ? '<i aria-hidden="true">✓</i>' : '') + '</button>';
  const ddHead = t => '<div class="qa-ddh">' + esc(t) + '</div>';
  const ddOpen = (anchor, html, onPick) => {
    const was = anchor.classList.contains('open'); ddClose(); if (was) return;
    anchor.classList.add('open');
    ddEl = document.createElement('div'); ddEl.className = 'qa-ddm'; ddEl.setAttribute('role', 'menu'); ddEl.innerHTML = html;
    d.appendChild(ddEl);
    const dr = d.getBoundingClientRect(), r = anchor.getBoundingClientRect(), w = ddEl.offsetWidth;
    const below = dr.bottom - r.bottom - 14, above = r.top - dr.top - 14, h = ddEl.scrollHeight;
    ddEl.style.left = Math.max(10, Math.min(r.left - dr.left, dr.width - w - 10)) + 'px';
    if (h <= below || below >= above) { ddEl.style.top = (r.bottom - dr.top + 6) + 'px'; ddEl.style.maxHeight = below + 'px'; }
    else { const hh = Math.min(h, above); ddEl.style.top = (r.top - dr.top - 6 - hh) + 'px'; ddEl.style.maxHeight = above + 'px'; }
    ddEl.addEventListener('click', e => { const it = e.target.closest('[data-dv]'); if (it) onPick(it.dataset.dv, it); });
    const inp = ddEl.querySelector('input'); if (inp) setTimeout(() => inp.focus(), 30);
  };
  const short = n => String(n || '').split(' ')[0];
  const acctLast4 = id => { const a = (App.opt.accounts || []).find(x => eq(x.id, id)); return a && a.kind === 'card' ? a.last4 || '' : ''; };
  const acctMenu = (key, title, skip) => ddHead(title) + listOf('accounts', v[key], a => !skip || !eq(a.id, skip) || eq(a.id, v[key])).map(a => ddItem(String(a.id), a.name + (a.last4 ? ' ••' + a.last4 : ''), eq(a.id, v[key]))).join('');
  const peopleMenu = (key, title, family) => ddHead(title) + (family ? ddItem('', 'Family', v[key] == null, false, App.ico('home')) : '') +
    people.filter(p => p.active !== 0 || eq(p.id, v[key])).map(p => ddItem(String(p.id), p.name, eq(p.id, v[key]))).join('');
  const dd = (key, ic, label, warn) => '<button type="button" class="qa-dd' + (warn ? ' warn' : '') + '" data-dd="' + key + '">' + App.ico(ic) + '<span>' + esc(label) + '</span><em aria-hidden="true">▾</em></button>';
  const drawSum = () => {
    const t = v.type, P = [];
    if (t === 'transfer') { P.push(dd('from', 'card', 'From ' + (short(nm('accounts', v.account_id)) || '?'), !v.account_id)); P.push(dd('to', 'card', 'To ' + (short(nm('accounts', v.to_account_id)) || '?'), !v.to_account_id)); }
    else {
      const inc = t === 'income', srcs = accountsFor(v.method, v.account_id);
      P.push(dd('how', v.method === 'Cash' ? 'money' : 'card', v.method || (inc ? 'Received via' : 'How')));
      if (!(v.method === 'Cash' && srcs.length <= 1) && srcs.length) P.push(dd('src', inc ? 'bank' : 'bank', nm('accounts', v.account_id) ? short(nm('accounts', v.account_id)) + (acctLast4(v.account_id) ? ' ••' + acctLast4(v.account_id) : '') : (inc ? 'Into' : 'From'), !v.account_id));
    }
    if (t === 'loan') P.push(dd('loan', 'bank', (nm('loans', v.loan_id) || 'Which loan') + ' · ' + ((PARTS.find(x => x[0] === v.loan_part) || [])[1] || 'EMI'), !v.loan_id));
    if (t === 'savings') P.push(dd('sav', 'piggy', nm('savings', v.savings_id) || 'Which place', !v.savings_id));
    // the date: the app's own calendar opens straight away (core/datepicker.js), from a box laid over the button
    P.push('<label class="qa-dd qa-date-dd">' + App.ico('calendar') + '<span>' + esc(dateWord(v.date)) + '</span><em aria-hidden="true">▾</em>' +
      App.dateInput(' data-qdate aria-label="Date"', v.date) + '</label>');
    if (t === 'expense') { const ev = evs.find(x => eq(x.id, v.event_id)); P.push(dd('ev', 'paperplane', ev ? ev.name : 'Event')); }
    if (t === 'expense') P.push(dd('for', v.for_id ? 'family' : 'home', v.for_id ? nm('people', v.for_id) : 'Family'));
    if (people.length > 1) P.push('<button type="button" class="qa-face" data-dd="by" aria-label="Paid by ' + esc(nm('people', v.person_id) || 'someone') + '"><span>' + esc((nm('people', v.person_id) || '?').trim().charAt(0).toUpperCase()) + '</span><em aria-hidden="true">▾</em></button>');
    P.push('<button type="button" class="qa-noteb' + (desc ? ' on' : '') + '" data-dd="note" aria-label="' + (desc ? 'Note: ' + esc(desc) : 'Add a note') + '">' + App.ico('scroll') + '</button>');
    ddClose();
    sumEl.innerHTML = P.join('');
    const dq = sumEl.querySelector('[data-qdate]');
    dq.addEventListener('change', () => { const iso = App.toIso(dq.value); if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) { v.date = iso; touched.date = true; autoEvent(); drawSum(); } });
    drawSave();
  };
  const openDd = (key, anchor) => {
    const done = () => { ddClose(); drawSum(); };
    if (key === 'how') {
      const t = v.type, meths = (App.opt.choices.methods || []).map((m, i) => ({ m, n: u.meth[t + '|' + m] || 0, i })).sort((x, y) => y.n - x.n || x.i - y.i).map(x => x.m);
      return ddOpen(anchor, ddHead(t === 'income' ? 'Received via' : 'How you paid') + meths.map(m => ddItem(m, m, v.method === m)).join(''), val => {
        v.method = val; touched.method = true;
        const fits = accountsFor(val, null);                         // the account follows: your usual one for this way of paying
        if (!fits.some(a => eq(a.id, v.account_id)) || !touched.account_id) v.account_id = usualAccount(val) || (fits.length === 1 ? fits[0].id : (fits.find(a => a.owner_id && a.owner_id === v.person_id) || fits[0] || {}).id || null);
        done();
      });
    }
    if (key === 'src') {
      const usual = usualAccount(v.method);
      return ddOpen(anchor, ddHead((v.type === 'income' ? 'Into' : 'From') + (v.method ? ' (' + v.method + ')' : '')) +
        accountsFor(v.method, v.account_id).map(a => ddItem(String(a.id), a.name + (a.last4 && a.kind === 'card' ? ' ••' + a.last4 : ''), eq(a.id, v.account_id), false, '') .replace('</span>', eq(a.id, usual) ? '</span><b class="qa-usual">usually</b>' : '</span>')).join(''),
        val => { v.account_id = Number(val); touched.account_id = true; done(); });
    }
    if (key === 'from') return ddOpen(anchor, acctMenu('account_id', 'From account'), val => { v.account_id = Number(val); if (eq(v.to_account_id, v.account_id)) v.to_account_id = null; touched.account_id = true; done(); });
    if (key === 'to') return ddOpen(anchor, acctMenu('to_account_id', 'To account', v.account_id), val => { v.to_account_id = Number(val); done(); });
    if (key === 'loan') return ddOpen(anchor, ddHead('Loan') + (listOf('loans', v.loan_id).map(l => ddItem('l' + l.id, l.name, eq(l.id, v.loan_id))).join('') || '<div class="qa-ddh">Add a loan first (Ahead → Loans)</div>') +
      ddHead('Part') + PARTS.map(([k, l]) => ddItem('p' + k, l, v.loan_part === k)).join(''), val => { if (val[0] === 'l') v.loan_id = Number(val.slice(1)); else v.loan_part = val.slice(1); done(); });
    if (key === 'sav') return ddOpen(anchor, ddHead('Savings place') + (listOf('savings', v.savings_id).map(x => ddItem(String(x.id), x.name, eq(x.id, v.savings_id))).join('') || '<div class="qa-ddh">Add a savings place first (Ahead → Savings)</div>'), val => { v.savings_id = Number(val); done(); });
    if (key === 'ev') return ddOpen(anchor, ddHead('For an event') + ddItem('', 'None', v.event_id == null) + evChoices().map(x => ddItem(String(x.id), x.name, eq(x.id, v.event_id), false, App.ico('paperplane'))).join('') +
      '<button type="button" class="qa-ddi qa-ddnew" data-dv="new">' + App.ico('plus') + '<span>New event</span></button>', val => {
        if (val === 'new') {                                          // to the Events screen to add it; this entry waits and comes back linked to it
          App.qaResume = { preset: Object.fromEntries(KEYS.filter(k => v[k] != null).map(k => [k, v[k]])), amount: amt || null, desc };
          ddClose(); d.close2();
          location.hash = '#/events';
          setTimeout(() => { if (App.phAdd && App.phAdd.event) App.phAdd.event(); }, 450);
          return;
        }
        v.event_id = val ? Number(val) : null; touched.event_id = true; done();
      });
    if (key === 'for') return ddOpen(anchor, peopleMenu('for_id', 'For whom', true), val => { v.for_id = val ? Number(val) : null; touched.for_id = true; done(); });
    if (key === 'by') return ddOpen(anchor, peopleMenu('person_id', 'Who paid', false), val => { v.person_id = Number(val); touched.person_id = true; done(); });
    if (key === 'note') {
      ddOpen(anchor, ddHead('Note') + '<input type="text" class="qa-ddq" data-desc maxlength="200" placeholder="Optional, e.g. Monthly kirana" value="' + esc(desc) + '" enterkeyhint="done">' +
        '<div class="qa-ddf"><button type="button" class="btn primary" data-dv="ok">Done</button></div>', () => done());
      const i = ddEl && ddEl.querySelector('[data-desc]');
      if (i) { i.addEventListener('input', () => { desc = i.value; }); i.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); done(); } }); }
    }
  };
  const drawSave = () => {
    const b = d && d.querySelector('[data-save]'); if (!b || edit) return;
    const tot = totalOf(amt), cn = v.category_id ? nm('categories', v.category_id) : '';
    b.textContent = tot > 0 ? 'Save · ' + App.inr(tot) + (cn ? ' ' + cn : '') : 'Save';
  };
  const drawDyn = () => {
    const t = v.type;
    let h = '';
    if (t === 'expense') {
      const fors = people.filter(p => p.active !== 0 || eq(p.id, v.for_id));
      h += sec('For', '<div class="ph-wrap">' + chip('for_id', '', 'Family', v.for_id == null, App.ico('home')) + fors.map(p => chip('for_id', p.id, p.name, eq(p.id, v.for_id))).join('') + '</div>');
      const ec = evChoices();
      if (ec.length) h += sec('For an event', '<div class="ph-wrap">' + chip('event_id', '', 'None', v.event_id == null) + ec.map(e => chip('event_id', e.id, e.name, eq(e.id, v.event_id), App.ico('paperplane'))).join('') + '</div>');
    }
    if (t === 'loan') {
      h += sec('Loan', '<div class="ph-wrap">' + (listOf('loans', v.loan_id).map(l => chip('loan_id', l.id, l.name, eq(l.id, v.loan_id))).join('') || '<span class="hint">Add a loan first (Worth → +).</span>') + '</div>');
      h += sec('Part', '<div class="ph-wrap">' + PARTS.map(([k, l]) => chip('loan_part', k, l, v.loan_part === k)).join('') + '</div>');
    }
    if (t === 'savings') h += sec('Savings place', '<div class="ph-wrap">' + (listOf('savings', v.savings_id).map(s => chip('savings_id', s.id, s.name, eq(s.id, v.savings_id))).join('') || '<span class="hint">Add a savings place first (Worth → +).</span>') + '</div>');
    const meths = (App.opt.choices.methods || []).map((m, i) => ({ m, n: u.meth[t + '|' + m] || 0, i })).sort((a, b) => b.n - a.n || a.i - b.i).map(x => x.m);
    if (t !== 'transfer') h += sec('Paid via', '<div class="ph-wrap">' + meths.map(m => chip('method', m, m, v.method === m)).join('') + '</div>');
    const accs = accountsFor(v.method, v.account_id);
    h += sec(t === 'transfer' ? 'From account' : t === 'income' ? 'Into account' : v.method === 'Credit card' ? 'Card' : 'Account', '<div class="ph-wrap">' +
      (accs.map(a => chip('account_id', a.id, a.name + (a.last4 ? ' ••' + a.last4 : ''), eq(a.id, v.account_id))).join('') || '<span class="hint">' + (v.method === 'Credit card' ? 'No credit cards yet: add one in Settings → Accounts and cards.' : 'No accounts yet.') + '</span>') + '</div>');
    if (t === 'transfer') h += sec('To account', '<div class="ph-wrap">' + listOf('accounts', v.to_account_id, a => !eq(a.id, v.account_id) || eq(a.id, v.to_account_id)).map(a => chip('to_account_id', a.id, a.name, eq(a.id, v.to_account_id))).join('') + '</div>');
    const yest = addDays(today, -1);
    h += sec('Date', '<div class="qa-date">' + chip('date', today, 'Today', v.date === today) + chip('date', yest, 'Yesterday', v.date === yest) + App.dateInput(' data-qdate aria-label="Date"', v.date).replace('inputmode="numeric"', 'inputmode="none"') + '</div>');
    h += sec('By', '<div class="ph-wrap">' + people.map(p => chip('person_id', p.id, p.name, eq(p.id, v.person_id))).join('') + '</div>');
    h += sec('Description', '<input type="text" data-desc maxlength="200" placeholder="Optional, e.g. Monthly kirana" value="' + esc(desc) + '">');
    dyn.innerHTML = h;
    dyn.querySelector('[data-qdate]').addEventListener('change', e => { const iso = App.toIso(e.target.value); if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) { v.date = iso; const was = v.event_id; autoEvent(); if (was !== v.event_id) return drawDyn(), drawSum(); dyn.querySelectorAll('[data-k="date"]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === iso))); drawSum(); } });
    dyn.querySelector('[data-desc]').addEventListener('input', e => { desc = e.target.value; });
  };
  const drawAmt = () => {
    const parts = amt.split('+'), many = parts.length > 1;
    amtV.textContent = many ? totalOf(amt).toLocaleString('en-IN', { maximumFractionDigits: 2 }) : fmtTyped(amt);
    amtX.textContent = many ? parts.map(x => (x ? fmtTyped(x) : '…')).join(' + ') : '';
    amtX.hidden = !many;
    amtEl.classList.toggle('empty', !amt);
    drawSave();
  };
  const setMore = on => { more = on; dyn.hidden = !on; keysEl.hidden = on; if (on) drawDyn(); drawSum(); };
  const drawAll = () => { drawCats(); drawSum(); if (more) drawDyn(); };

  const d = App.bsheet({
    title: !edit ? 'New ' + (TYPE_WORD[v.type] || 'entry') : pending ? 'Confirm entry' : 'Edit entry', cls: 'qa qa3', focus: false, dock: !document.querySelector(App.OPEN),
    body: (pending ? '<div class="qa-pendnote">Not confirmed yet' + (entry.source === 'recurring' ? ' (from Recurring)' : entry.source === 'oneoff' ? ' (a bomb: change the amount if it was different)' : '') + '. Change anything that was different, then Confirm.</div>' : '') +
      (edit ? '' : (App.guide ? App.guide.tip('add', 'Type the amount, tap a category, Save. The small buttons under the categories are what the app guessed: tap one to change it.') : '')) +
      '<div class="tseg qa-types" role="radiogroup" aria-label="Type" data-types' + (edit ? '' : ' hidden') + '>' + TYPES.map(([k]) => '<button type="button" role="radio" data-k="type" data-v="' + k + '" aria-checked="' + (v.type === k) + '">' + SHORT[k] + '</button>').join('') + '</div>' +
      '<button type="button" class="qa-big" data-amtbox aria-label="Amount"><span class="cur">₹</span><span data-amtv></span><i class="caret" aria-hidden="true"></i></button>' +
      '<div class="qa-amtx" data-amtx hidden></div>' +
      '<div data-cats></div>' +
      '<div class="qa-ddrow" data-sum role="group" aria-label="Details"></div>' +
      '<div class="qa-more" data-dyn hidden></div>' +
      '<div class="qa-keys qa-keys4" data-keys>' + KEYS_PAD.map(k => '<button type="button" data-key="' + k + '"' + (/^(del|\+|=|ok)$/.test(k) ? ' class="op' + (k === 'ok' ? ' ok' : '') + '"' : '') + ' aria-label="' + (KEY_ARIA[k] || k) + '">' + (KEY_LABEL[k] || k) + '</button>').join('') + '</div>' +
      '<div class="qa-err" role="alert" data-err></div>' +
      '<div class="qa-foot">' + (edit ? '<button type="button" class="btn danger" data-del>Delete</button>' : '') + (pending ? '<button type="button" class="btn" data-save>Save</button><button type="button" class="btn primary" data-confirm-save>Confirm</button>' : '<button type="button" class="btn primary" data-save>' + (edit ? 'Save changes' : 'Save') + '</button>') + '</div>',
  });
  const dyn = d.querySelector('[data-dyn]'), catsEl = d.querySelector('[data-cats]'), sumEl = d.querySelector('[data-sum]'), keysEl = d.querySelector('[data-keys]');
  const amtEl = d.querySelector('[data-amtbox]'), amtV = d.querySelector('[data-amtv]'), amtX = d.querySelector('[data-amtx]'), err = d.querySelector('[data-err]');
  if (!edit) { fillDefaults(); guessFromCategory(); }
  drawAmt(); drawCats(); setMore(more);
  App.api.get('/api/events').then(r => { if (!d.open) return; evs = App.events = (r && r.events) || []; if (!edit) autoEvent(); drawAll(); }).catch(() => {});
  if (!usage) loadUsage().then(x => { if (!d.open) return; u = x; if (!edit && !touched.method) { v.method = null; if (!touched.account_id) v.account_id = null; fillDefaults(); guessFromCategory(); } drawAll(); });

  /* typing the amount: the keypad, or a real keyboard on a laptop */
  const press = k => {
    const last = amt.split('+').pop();
    if (k === 'ok') return save(pending);
    if (k === '00') { press('0'); press('0'); return; }
    if (k === 'del') amt = amt.slice(0, -1);
    else if (k === '+') { if (amt && !/[+.]$/.test(amt)) amt += '+'; }
    else if (k === '=') { const tot = totalOf(amt); amt = tot ? String(tot) : ''; }
    else if (k === '.') { if (!last.includes('.')) amt += (last ? '' : '0') + '.'; }
    else if (/^\d$/.test(k)) {
      const [i, f] = last.split('.');
      if (f !== undefined ? f.length >= 2 : (i || '').replace(/^0+/, '').length >= 9) return;
      amt = last === '0' ? amt.slice(0, -1) + k : amt + k;
    }
    err.textContent = '';
    drawAmt();
  };
  keysEl.addEventListener('click', e => { const b = e.target.closest('[data-key]'); if (b) press(b.dataset.key); });
  d.addEventListener('keydown', e => {
    if (e.target.matches('input, textarea')) return;
    if (/^[\d.+=]$/.test(e.key)) { e.preventDefault(); press(e.key); }
    else if (e.key === 'Backspace') { e.preventDefault(); press('del'); }
    else if (e.key === 'Enter' && !e.target.closest('button')) { e.preventDefault(); save(false); }
  });
  amtEl.onclick = () => { if (more) setMore(false); };
  sumEl.addEventListener('click', e => { const b = e.target.closest('[data-dd]'); if (b) openDd(b.dataset.dd, b); });
  d.addEventListener('pointerdown', e => { if (ddEl && !ddEl.contains(e.target) && !e.target.closest('[data-dd]')) ddClose(); }, true);
  d.querySelector('.bs-body') && d.querySelector('.bs-body').addEventListener('scroll', () => ddClose(), { passive: true });

  d.querySelector('[data-types]').addEventListener('click', e => {
    const b = e.target.closest('[data-k="type"]'); if (!b || b.dataset.v === v.type) return;
    v.type = b.dataset.v; v.category_id = null; showAll = false;
    if (!edit) { v.method = null; if (!touched.for_id) v.for_id = null; }
    fillDefaults();
    d.querySelectorAll('[data-types] [data-k]').forEach(x => x.setAttribute('aria-checked', String(x.dataset.v === v.type)));
    if (v.type === 'transfer' && !more) setMore(true); else drawAll();
  });
  const pick = async e => {
    if (e.target.closest('[data-more]')) { showAll = true; return drawCats(); }
    if (e.target.closest('[data-newcat]')) {
      const r = await App.form({ title: 'New ' + typeLabel(v.type).toLowerCase() + ' category', fields: [{ name: 'name', label: 'Name', required: true, full: true }], submit: 'Add' });
      if (r && r.name.trim()) { try { v.category_id = await App.ensureCategory(r.name.trim(), v.type); showAll = true; drawAll(); } catch (ex) { err.textContent = ex.message; } }
      return;
    }
    const b = e.target.closest('[data-k]'); if (!b || b.dataset.k === 'type') return;
    const k = b.dataset.k, raw = b.dataset.v;
    touched[k] = true;
    v[k] = /_id$/.test(k) ? (raw === '' ? null : Number(raw)) : raw;
    if (k === 'category_id') guessFromCategory();
    if (k === 'date') autoEvent();
    if (k === 'method') fitAccount();
    if (k === 'account_id' && v.to_account_id === v.account_id) v.to_account_id = null;
    err.textContent = '';
    drawAll();
  };
  catsEl.addEventListener('click', e => { if (e.target.closest('[data-pickcat]')) return openPicker(); pick(e); });
  dyn.addEventListener('click', pick);

  const bodyOf = () => ({
    date: v.date, type: v.type, category_id: v.category_id || null, description: desc.trim(), amount: totalOf(amt),
    person_id: v.person_id || null, method: v.type === 'transfer' ? v.method || '' : v.method || '', account_id: v.account_id || null,
    to_account_id: v.type === 'transfer' ? v.to_account_id || null : null,
    loan_id: v.type === 'loan' ? v.loan_id || null : null, loan_part: v.type === 'loan' ? v.loan_part || 'emi' : '',
    savings_id: v.type === 'savings' ? v.savings_id || null : null,
    for_id: v.type === 'expense' ? v.for_id || null : null,
    event_id: v.type === 'expense' ? v.event_id || null : null,
  });
  const check = b => {
    if (!(b.amount > 0)) { if (more) setMore(false); return 'Enter the amount'; }
    if (v.type !== 'transfer' && !b.category_id) return 'Pick a category';
    const open = () => {};                                          // the details are dropdowns on the same screen now
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date || '')) { open(); return 'Pick a date'; }
    if (v.method === 'Credit card' && !b.account_id) { open(); return 'Pick which credit card'; }
    if (v.type === 'transfer' && (!b.account_id || !b.to_account_id)) { open(); return 'Pick both accounts for the transfer'; }
    if (v.type === 'loan' && !b.loan_id && listOf('loans').length > 1) { open(); return 'Pick which loan'; }
    if (v.type === 'savings' && !b.savings_id && listOf('savings').length > 1) { open(); return 'Pick the savings place'; }
    return '';
  };
  const initial = edit ? JSON.stringify(bodyOf()) : '';
  const setBusy = on => { busy = on; d.querySelectorAll('.qa-foot .btn').forEach(x => { x.disabled = on; }); };
  const done = (msg, b) => {
    if (b) { if (b.person_id) store.set('ff.lastBy', b.person_id); if (usage) count(usage, b); }
    d.close2(); App.toast(msg); App.refresh();
  };
  const save = async confirmToo => {
    if (busy) return;
    const b = bodyOf(), problem = check(b);
    err.textContent = problem; if (problem) return;
    setBusy(true);
    try {
      if (!edit) { const r = await App.api.post('/api/ledger', b); if (App.guide) { App.guide.mark('added'); App.guide.saved(r && r.row); } return done('Saved · ' + App.inr(b.amount) + ' ' + (b.type === 'income' ? 'in' : typeLabel(b.type).toLowerCase()), b); }
      if (JSON.stringify(b) !== initial) await App.api.put('/api/ledger/' + entry.id, b);
      if (confirmToo) await App.api.post('/api/ledger/' + entry.id + '/confirm', {});
      done(confirmToo ? 'Confirmed' : 'Saved', b);
    } catch (ex) { err.textContent = ex.message; setBusy(false); }
  };
  d.querySelector('[data-save]').onclick = () => save(false);
  const cs = d.querySelector('[data-confirm-save]'); if (cs) cs.onclick = () => save(true);
  const del = d.querySelector('[data-del]');
  if (del) del.onclick = async () => {
    const skip = entry.source === 'recurring' && pending;
    if (!(await App.confirm(skip ? 'It is skipped for this month only; the recurring row stays for later months.' : entryName(entry) + ' · ' + App.inr(entry.amount) + ' on ' + App.date(entry.date) + ' will be removed.', { okLabel: 'Delete', danger: true, title: 'Delete this entry?' }))) return;
    setBusy(true);
    try { await App.api.del('/api/ledger/' + entry.id); d.close2(); App.toast('Deleted'); App.refresh(); }
    catch (ex) { err.textContent = ex.message; setBusy(false); }
  };
  return d;
};
})();
