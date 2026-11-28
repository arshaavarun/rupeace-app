/* Themed date picker for every <input data-date> (text box showing dd-mm-yyyy).
   Tap the box to pick from the calendar (no phone keyboard: inputmode none), or type a date with a real keyboard. The input fires "change" with the new text.
   App.toIso('17-11-2026') -> '2026-11-17' ('' if blank, the text itself if it isn't a date). */
(function () {
'use strict';
const App = window.App;
const MN = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const pad = n => String(n).padStart(2, '0');
App.toIso = s => {
  s = String(s || '').trim();
  if (!s) return '';
  let m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s);
  if (m) return m[3] + '-' + pad(m[2]) + '-' + pad(m[1]);
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? s : s;
};
App.dateInput = (attrs, iso, extra) => '<input type="text" data-date inputmode="none" autocomplete="off" placeholder="dd-mm-yyyy" value="' + App.esc(App.dmy(iso)) + '"' + (attrs || '') + (extra || '') + '>';

let pop = null, input = null, view = null, quietUntil = 0, quietEl = null;   // quietUntil: focus given back after a pick must not open it again
const close = () => { if (pop) { pop.remove(); pop = null; input = null; } };
function draw() {
  const sel = App.toIso(input.value), today = App.today();
  const y = view.getFullYear(), mo = view.getMonth();
  const first = new Date(y, mo, 1), start = new Date(y, mo, 1 - first.getDay());
  let cells = '';
  for (let k = 0; k < 42; k++) {
    const d = new Date(start); d.setDate(start.getDate() + k);
    const iso = App.ymd(d);
    cells += '<button type="button" data-d="' + iso + '" class="' + [d.getMonth() !== mo ? 'out' : '', iso === today ? 'today' : '', iso === sel ? 'sel' : ''].join(' ') + '">' + d.getDate() + '</button>';
  }
  pop.innerHTML = '<div class="dp-head"><button type="button" data-nav="-12" aria-label="Previous year">«</button><button type="button" data-nav="-1" aria-label="Previous month">‹</button>' +
    '<span>' + MN[mo] + ' ' + y + '</span><button type="button" data-nav="1" aria-label="Next month">›</button><button type="button" data-nav="12" aria-label="Next year">»</button></div>' +
    '<div class="dp-dow"><span>Su</span><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span></div>' +
    '<div class="dp-grid">' + cells + '</div>' +
    '<div class="dp-foot"><button type="button" data-clear>Clear</button><button type="button" data-today>Today</button></div>';
}
function place() {
  const r = input.getBoundingClientRect();
  const h = pop.offsetHeight, w = pop.offsetWidth;
  const left = Math.max(8, Math.min(r.left, innerWidth - w - 8));
  const top = r.bottom + 6 + h > innerHeight - 8 ? Math.max(8, r.top - h - 6) : r.bottom + 6;
  pop.style.left = left + 'px'; pop.style.top = top + 'px';
  /* Inside a sheet that is still sliding in (or anything else that moves it), "fixed" is measured from the sheet, not
     the screen, and the calendar landed off-screen, where a tap closed the sheet. Measure where it really is and move
     it by the difference, so it always sits by its box. */
  const p = pop.getBoundingClientRect(), dx = p.left - left, dy = p.top - top;
  if (Math.abs(dx) > 1 || Math.abs(dy) > 1) { pop.style.left = (left - dx) + 'px'; pop.style.top = (top - dy) + 'px'; }
}
function open(el) {
  if (input === el && pop) return;
  if (el === quietEl && Date.now() < quietUntil) return;      // only the box just picked stays shut
  close();
  input = el;
  const iso = App.toIso(el.value);
  view = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(iso + 'T00:00:00') : new Date(App.today() + 'T00:00:00');
  view.setDate(1);
  pop = document.createElement('div');
  pop.className = 'dp';
  pop.addEventListener('mousedown', e => e.preventDefault());   // keep focus in the input
  pop.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || !input) return;
    if (b.dataset.nav) { view.setMonth(view.getMonth() + Number(b.dataset.nav)); draw(); return; }
    let iso = null;
    if (b.dataset.d) iso = b.dataset.d;
    if (b.dataset.today !== undefined) iso = App.today();
    if (b.dataset.clear !== undefined) iso = '';
    if (iso === null) return;
    const el2 = input;
    el2.value = iso ? App.dmy(iso) : '';
    close();
    el2.dispatchEvent(new Event('change', { bubbles: true }));
    quietUntil = Date.now() + 700; quietEl = el2;                               // a picked date closes the calendar; the focus that follows does not reopen it
    el2.focus();
  });
  (el.closest('dialog') || document.body).appendChild(pop);   // inside a modal dialog it must live in the dialog (top layer)
  draw(); place();
  setTimeout(() => { if (pop) place(); }, 260); setTimeout(() => { if (pop) place(); }, 600);   // after a sheet's slide-in
}
document.addEventListener('focusin', e => { const el = e.target.closest && e.target.closest('input[data-date]'); if (el) open(el); else if (pop && !pop.contains(e.target)) close(); });
document.addEventListener('mousedown', e => { if (pop && !pop.contains(e.target) && e.target !== input) close(); }, true);
document.addEventListener('click', e => { const el = e.target.closest && e.target.closest('input[data-date]'); if (el && !pop) open(el); });
document.addEventListener('keydown', e => {
  if (!pop) return;
  if (e.key === 'Escape') { close(); return; }
  if (e.key === 'Tab') close();
}, true);
document.addEventListener('input', e => {     // typing a full date moves the calendar to it
  if (!pop || e.target !== input) return;
  const iso = App.toIso(input.value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) { view = new Date(iso + 'T00:00:00'); view.setDate(1); draw(); }
});
window.addEventListener('scroll', () => { if (pop) place(); }, true);
window.addEventListener('resize', () => { if (pop) place(); });   // a phone keyboard coming or going must not close it
})();
