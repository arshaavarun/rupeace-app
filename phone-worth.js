/* Phone: the Worth tab (net worth, where the money is, when each loan ends), Events (#/events) and Bombs (#/bombs) and the first-run setup guide (#/welcome).
   Uses the same /api routes as everything else; adding things goes through App.phAdd (core/phone-settings.js). */
(function () {
'use strict';
const App = window.App;
const esc = App.esc;
const thisMonth = () => App.today().slice(0, 7);
const top = title => '<div class="ph-top"><div class="ph-title">' + esc(title) + '</div>' + App.avatar() + (App.syncUI && App.sync ? App.syncUI.chipHost() : '') + '</div>';
const tag = (t, cls) => '<span class="ph-tag ' + (cls || '') + '">' + esc(t) + '</span>';
const SVGI = p => '<svg viewBox="0 0 24 24" aria-hidden="true">' + p + '</svg>';
const I = { left: SVGI('<path d="m15 6-6 6 6 6"/>'), plus: SVGI('<path d="M12 5v14M5 12h14"/>'), edit: SVGI('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>') };
const topBar = (left, right) => '<div class="ph-top">' + left + '<span class="ah-right">' + (right || '') + App.avatar() + '</span></div>';   // an Ahead page: title, its +, the photo
const dLabel = iso => { const [y, m, d] = iso.split('-').map(Number); return d + ' ' + App.MN[m - 1].slice(0, 3) + (String(y) !== App.today().slice(0, 4) ? ' ' + y : ''); };
const SAV_ICON = { mutual_fund: App.ico('trend'), stocks: App.ico('trend'), ppf: App.ico('bank'), epf: App.ico('bank'), nps: App.ico('bank'), fd: App.ico('bank'), rd: App.ico('bank'), gold: App.ico('coin'), other: App.ico('piggy') };
const row = ({ href, ic, hue, title, sub, amt, small, smallCls }) => '<a class="ph-row" href="' + href + '"><span class="ic" style="--h:' + hue + '">' + ic + '</span>' +
  '<span class="nm"><b>' + esc(title) + '</b><span>' + esc(sub || '') + '</span></span><span class="am"><span class="amt">' + amt + '</span>' + (small ? '<small class="' + (smallCls || '') + '">' + esc(small) + '</small>' : '') + '</span></a>';

/* ================= Worth ================= */
const goalName = o => o.description || App.nameOf('categories', o.category_id) || 'Planned expense';
/* Worth: wealth only. Net worth, where the money sits, and when each loan ends (approved: W2 with the L3 timeline).
   Planned expenses moved to their own page under Ahead (#/planned). */
const PAL = ['#4e9fd1', '#3fb58a', '#e0a24f', '#c77aa8', '#9a7fd8', '#3aaea3', '#dd7272', '#7466d4'];
const monthsBetween = (a, b) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7));
const shortMonth = ym => App.MN[Number(ym.slice(5, 7)) - 1].slice(0, 3) + ' ' + ym.slice(2, 4);
App.phonePage('worth', {
  title: 'Worth',
  async render(el) {
    const cur = thisMonth();
    const [sv, ln, proj] = await Promise.all([App.api.get('/api/savings'), App.api.get('/api/loans'), App.api.get('/api/projection?months=12').catch(() => null)]);
    const loans = (ln.loans || []).filter(l => l.active !== 0 && l.status !== 'closed');
    const saved = (sv.totals && sv.totals.value_now) || 0, owed = (ln.family && ln.family.outstanding) || 0;
    const bank = proj ? proj.start || 0 : 0;
    const net = bank + saved - owed;
    /* where the money is: bank and cash, then each kind of savings */
    const parts = [['Bank and cash', Math.max(0, bank)]].concat((sv.pie || []).map(p => [p.label, Math.max(0, p.value)])).filter(p => p[1] > 0.5);
    const total = parts.reduce((t, p) => t + p[1], 0);
    const mix = total ? '<article class="ph-card wr-mix"><div class="hd"><div><h3>Where your money is</h3><small>' + App.money(total) + ' in all</small></div></div>' +
      '<div class="wr-bar" role="img" aria-label="' + esc(parts.map(p => p[0] + ' ' + Math.round(p[1] / total * 100) + '%').join(', ')) + '">' +
      parts.map((p, i) => '<i style="width:' + (p[1] / total * 100).toFixed(2) + '%;background:' + PAL[i % PAL.length] + '"></i>').join('') + '</div>' +
      '<div class="wr-leg">' + parts.map((p, i) => '<span style="--c:' + PAL[i % PAL.length] + '"><b>' + esc(p[0]) + '</b> ' + Math.round(p[1] / total * 100) + '% · ' + App.money(p[1]) + '</span>').join('') + '</div></article>' : '';
    /* when each loan ends, on one line from today */
    const ending = loans.filter(l => l.repay !== 'interest' && l.loan_free).sort((x, y) => x.loan_free.localeCompare(y.loan_free));
    const io = loans.filter(l => l.repay === 'interest' || !l.loan_free);
    let tl = '';
    if (loans.length) {
      const last = ending.length ? ending[ending.length - 1].loan_free : cur, span = Math.max(1, monthsBetween(cur, last));
      const pos = ym => 4 + Math.max(0, Math.min(1, monthsBetween(cur, ym) / span)) * 88;
      tl = '<article class="ph-card wr-loans"><div class="hd"><div><h3>When each loan ends</h3><small>' + (ending.length ? 'All clear by ' + esc(App.month(last)) : 'No end dates yet') + ' · ' + App.money(owed) + ' to go</small></div></div>' +
        (ending.length ? '<div class="wr-tl"><span class="wr-line"></span><span class="wr-now" title="Today"></span>' +
          ending.map((l, i) => '<a class="wr-dot" href="#/settings?s=loan&id=' + l.id + '" style="left:' + pos(l.loan_free).toFixed(1) + '%;--c:' + PAL[(i + 6) % PAL.length] + '" aria-label="' + esc(l.name + ', ends ' + App.month(l.loan_free) + ', ' + App.money(l.outstanding) + ' left') + '"></a>' +
            '<span class="wr-lab' + (i % 2 ? ' up' : '') + (pos(l.loan_free) > 70 ? ' r' : pos(l.loan_free) < 22 ? ' l' : '') + '" style="left:' + pos(l.loan_free).toFixed(1) + '%">' + esc(l.name) + ' · ' + esc(shortMonth(l.loan_free)) + '</span>').join('') + '</div>' : '') +
        (io.length ? '<p class="wr-io">' + io.map(l => esc(l.name) + ': ' + (l.repay === 'interest' ? 'interest only' : 'no end date yet') + ', ' + App.money(l.outstanding)).join(' · ') + '</p>' : '') + '</article>';
    }
    el.className = 'ph ph-worth';
    el.innerHTML = top('Worth') +
      (App.guide ? App.guide.tip('worth', 'What you have minus what you owe. Loans, savings, recurring, events and bombs are under Ahead, the last button in the bar.') : '') +
      '<section class="ph-hero"><div class="lbl"><span>Family net worth</span></div><div class="big' + (net < 0 ? ' neg' : '') + '">' + App.money(net) + '</div>' +
      '<div class="note">What you have minus what you owe</div>' +
      '<div class="trio"><div>Bank and cash<b>' + App.money(bank) + '</b></div><div>Savings<b>' + App.money(saved) + '</b></div><div>Loans<b>' + App.money(owed) + '</b></div></div></section>' +
      mix + tl +
      (!mix && !tl ? '<div class="ph-card ph-empty">Add your savings and loans under <b>Ahead</b> (the last button below) to see where your money is and when each loan ends.</div>' : '');
  },
});

/* Planned expenses became Events (budgets) and Bombs (exact one-time amounts); an old link lands on Bombs. */
App.phonePage('planned', { title: 'Bombs', async render(el) { el.className = 'ph'; location.replace('#/bombs'); } });

/* Events (Ahead → Events): a budget for a trip or a festival, and what has been spent on it so far */
App.phonePage('events', {
  title: 'Events',
  async render(el) {
    const { events } = await App.api.get('/api/events');
    App.events = events;
    const dates = ev => { const a = ev.start_date, z = ev.end_date; if (!z || z === a) return dLabel(a);
      return (a.slice(0, 7) === z.slice(0, 7) ? Number(a.slice(8)) : dLabel(a)) + ' – ' + dLabel(z); };
    const card = ev => {
      const pct = ev.budget > 0 ? Math.min(100, ev.spent / ev.budget * 100) : 0, over = ev.over > 0.5;
      const state = ev.state === 'on' ? tag('On now', 'acc') : ev.state === 'coming' ? '' : tag('Done', '');
      return '<button type="button" class="ph-card ev-card' + (ev.state === 'done' ? ' done' : '') + '" data-ev="' + ev.id + '">' +
        '<span class="ev-h"><b>' + esc(ev.name) + '</b>' + state + '</span>' +
        '<span class="ev-d">' + esc(dates(ev)) + ' · budget ' + App.money(ev.budget) + '</span>' +
        '<span class="ph-bar' + (over ? ' over' : ' ev-bar') + '"><i style="width:' + pct.toFixed(1) + '%"></i></span>' +
        '<span class="ev-f"><span>' + (ev.count ? 'Spent ' + App.money(ev.spent) + ' · ' + ev.count + (ev.count > 1 ? ' spends' : ' spend') : 'Nothing spent yet') + '</span>' +
        (over ? tag(App.money(ev.over) + ' over', 'bad') : tag(App.money(ev.left) + ' left', 'good')) + '</span></button>';
    };
    const live = events.filter(e => e.state !== 'done'), past = events.filter(e => e.state === 'done');
    el.className = 'ph ph-events';
    el.innerHTML = topBar('<div class="ph-title">Events</div>', '<button type="button" class="pss-plus" data-newev aria-label="Add an event">' + I.plus + '</button>') +
      (App.guide ? App.guide.tip('events', 'An event is a trip, a festival or a wedding with a rough budget. Spends added during its dates are linked to it, so you see how much is spent and whether you are over or under. What is left of the budget is counted in the months ahead.') : '') +
      (live.length ? live.map(card).join('') : '<div class="ph-card ph-empty">No events yet. Add a trip or a festival with a rough budget: spends during its dates are linked to it, so you can see if you stay within it.</div>') +
      (past.length ? '<details class="pss-hid"><summary>Finished · ' + past.length + '</summary>' + past.map(card).join('') + '</details>' : '');
    el.addEventListener('click', e => {
      if (e.target.closest('[data-newev]')) return App.phAdd && App.phAdd.event();
      const c = e.target.closest('[data-ev]'); if (c) location.hash = '#/events?id=' + c.dataset.ev;
    });
    const id = Number(new URLSearchParams(location.hash.split('?')[1] || '').get('id'));
    if (id) showEvent(el, events.find(x => x.id === id));
  },
});
/* one event: its budget and the spends linked to it */
async function showEvent(el, ev) {
  if (!ev) return;
  const to = ev.end_date && ev.end_date > App.today() ? ev.end_date : App.today();
  const from = addMonthsIso(ev.start_date, -2);
  const data = await App.api.get('/api/ledger?' + App.qs({ from, to: to < ev.start_date ? ev.start_date : to })).catch(() => ({ entries: [] }));
  const rows = (data.entries || []).filter(e => e.event_id === ev.id && e.status === 'done').sort((a, b) => (a.date < b.date ? 1 : -1));
  const over = ev.over > 0.5, pct = ev.budget > 0 ? Math.min(100, ev.spent / ev.budget * 100) : 0;
  el.className = 'ph pss ph-event';
  el.innerHTML = '<div class="ph-top"><div class="pss-tl"><button type="button" class="ph-ib" data-evback aria-label="Back">' + I.left + '</button><div class="ph-title">' + esc(ev.name) + '</div></div>' +
      '<button type="button" class="pss-pill" data-evedit>' + I.edit + 'Edit</button></div>' +
    '<section class="ph-hero"><div class="lbl"><span>' + (over ? 'Over budget by' : 'Left of ' + App.money(ev.budget)) + '</span></div><div class="big' + (over ? ' neg' : '') + '">' + App.money(over ? ev.over : ev.left) + '</div>' +
      '<div class="ph-bar' + (over ? ' over' : ' ev-bar') + '" style="margin-top:10px"><i style="width:' + pct.toFixed(1) + '%"></i></div>' +
      '<div class="note">Spent ' + App.money(ev.spent) + ' of ' + App.money(ev.budget) + '</div></section>' +
    '<article class="ph-card"><div class="hd"><div><h3>Spends</h3><small>Linked to ' + esc(ev.name) + '</small></div></div>' +
      (rows.length ? '<div class="ph-list">' + rows.map(e => '<button type="button" class="ph-row" data-eid="' + e.id + '"><span class="ic" style="--h:' + App.hue(e.category || '') + '">' + App.iconFor(e.category || '', 'expense') + '</span><span class="nm"><b>' + esc(e.description || e.category || 'Spend') + '</b><span>' + esc([e.description ? e.category : '', dLabel(e.date)].filter(Boolean).join(' · ')) + '</span></span><span class="am">' + App.inr(e.amount) + '</span></button>').join('') + '</div>'
        : '<div class="ph-empty" style="padding:12px 4px">No spends linked yet. When you add a spend, pick ' + esc(ev.name) + ' under "For an event" (it is picked for you during its dates).</div>') + '</article>';
  el.onclick = e => {
    if (e.target.closest('[data-evback]')) { location.hash = '#/events'; return; }
    if (e.target.closest('[data-evedit]')) return App.phAdd && App.phAdd.event(ev);
    const r = e.target.closest('[data-eid]'); if (r && App.quickAdd) App.quickAdd({ entry: rows.find(x => String(x.id) === r.dataset.eid) });
  };
}
const addMonthsIso = (iso, k) => { const d = new Date(iso.slice(0, 10) + 'T00:00:00Z'); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + k); return d.toISOString().slice(0, 10); };

/* Bombs (Ahead → Bombs): one exact amount on a date, in or out; on the day it waits on Home to be confirmed */
App.phonePage('bombs', {
  title: 'Bombs',
  async render(el) {
    const cur = thisMonth(), t = App.today();
    const [{ rows }, led] = await Promise.all([App.api.get('/api/setup/planned_items'), App.api.get('/api/ledger?' + App.qs({ from: cur + '-01', to: App.monthEnd(cur + '-01') })).catch(() => ({ entries: [] }))]);
    App.bombs = rows;
    const rowOf = new Map(); (led.entries || []).forEach(e => { if (/^one:/.test(e.source_ref || '')) rowOf.set(e.source_ref, e); });
    const when = x => x.month + '-' + String(Math.max(1, x.day || 1)).padStart(2, '0');
    const item = x => {
      const cat = App.nameOf('categories', x.category_id), inc = x.type === 'income', r = rowOf.get('one:' + x.id);
      const st = r ? (r.status === 'done' ? tag('Confirmed', 'good') : tag('To confirm', 'acc')) : '';
      return '<button type="button" class="ph-row bm-row" data-bomb="' + x.id + '"><span class="ic" style="--h:' + (inc ? '#3fb58a' : '#dd7272') + '">' + App.iconFor(cat || x.description || '', x.type) + '</span>' +
        '<span class="nm"><b>' + esc(x.description || cat || 'Bomb') + '</b><span>' + esc([x.day ? Number(x.day) + ' ' + App.MN[Number(x.month.slice(5, 7)) - 1].slice(0, 3) : '', cat].filter(Boolean).join(' · ')) + '</span></span>' +
        '<span class="am' + (inc ? ' in' : '') + '">' + (inc ? '+' : '') + App.inr(x.amount) + '<small>' + (st || (inc ? 'in' : 'out')) + '</small></span></button>';
    };
    const sorted = rows.slice().sort((a, b) => (when(a) < when(b) ? -1 : when(a) > when(b) ? 1 : a.id - b.id));
    const ahead = sorted.filter(x => x.month >= cur), past = sorted.filter(x => x.month < cur).reverse();
    const byMonth = list => { const g = []; list.forEach(x => { const l = g[g.length - 1]; if (l && l.m === x.month) l.rows.push(x); else g.push({ m: x.month, rows: [x] }); }); return g; };
    const block = g => '<div class="ph-day"><span>' + esc(App.month(g.m)) + '</span></div>' + g.rows.map(item).join('');
    const pend = [...rowOf.values()].filter(e => e.status === 'pending');
    el.className = 'ph ph-bombs';
    el.innerHTML = topBar('<div class="ph-title">Bombs</div>', '<button type="button" class="pss-plus" data-newbomb aria-label="Add a bomb">' + I.plus + '</button>') +
      (App.guide ? App.guide.tip('bombs', 'A bomb is one big amount on a date that you know well: a bonus coming in, a delivery or stamp duty going out. It is counted in the months ahead, and on the day it waits on Home for you to confirm; change the amount then if it was different.') : '') +
      (pend.length ? '<a class="ph-card bm-due" href="#/home"><b>' + pend.length + (pend.length > 1 ? ' bombs are' : ' bomb is') + ' due this month</b><span>Confirm on Home: ' + esc(pend.map(e => e.description).join(', ')) + '</span></a>' : '') +
      (ahead.length ? '<div class="ph-card ph-list">' + byMonth(ahead).map(block).join('') + '</div>' : '<div class="ph-card ph-empty">No bombs yet. Add a big one-time amount you know is coming: a bonus, a delivery, stamp duty, an FD maturing.</div>') +
      (past.length ? '<details class="pss-hid"><summary>Earlier · ' + past.length + '</summary><div class="ph-card ph-list">' + byMonth(past).map(block).join('') + '</div></details>' : '');
    el.addEventListener('click', e => {
      if (e.target.closest('[data-newbomb]')) return App.phAdd && App.phAdd.bomb();
      const b = e.target.closest('[data-bomb]'); if (b && App.phAdd) App.phAdd.bomb(rows.find(x => String(x.id) === b.dataset.bomb));
    });
  },
});

/* ================= first-run setup =================
   Setup is the real pages, one step at a time (App.SETUP in core/phone-settings.js). #/welcome opens the first step
   that is not done yet. */
App.phonePage('welcome', {
  title: 'Set up',
  async render(el) {
    if (!App.opt) await App.loadOptions();
    const ok = await App.setupStatus();
    el.className = 'ph';
    el.innerHTML = '<div class="empty">Opening setup…</div>';
    setTimeout(() => location.replace(App.setupHref((App.SETUP[ok.indexOf(false)] || App.SETUP[0]).id)), 0);
  },
});
})();
