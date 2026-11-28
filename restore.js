/* Settings → Backup → Restore: load a RuPeace .json backup into the app.
   The file comes from Backup (GET /api/export).
   POST /api/import {version, tables, confirm} replaces everything; confirm: "REPLACE" is needed when data exists. */
(function () {
'use strict';
const LABELS = {
  people: 'Family', accounts: 'Accounts and cards', categories: 'Categories', loans: 'Loans', loan_stages: 'Loan stages',
  loan_rates: 'Loan rate changes', savings_places: 'Savings places', savings_values: 'Savings value checks',
  entries: 'Ledger entries', recurring: 'Recurring rows', planned_items: 'Bombs', events: 'Events', settings: 'Settings',
};
const ORDER = Object.keys(LABELS);
const SKIPPED = { tz_invoices: 'TimeZone invoices are not used in this version' };
const CSS = '<style>' +
  '.mv-pick{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:12px}' +
  '.mv-pick input[type=file]{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}' +
  '.mv-pick .btn{min-height:44px;display:inline-flex;align-items:center}' +
  '.mv-file{color:var(--muted);font-size:13.5px;overflow-wrap:anywhere}' +
  '.mv-table{width:100%;max-width:520px;border-collapse:collapse;margin:12px 0 4px;font-size:14px}' +
  '.mv-table th,.mv-table td{padding:8px 10px;border-bottom:1px solid var(--grid);text-align:left}' +
  '.mv-table th{color:var(--muted);font-weight:600;font-size:12.5px}' +
  '.mv-table td.n,.mv-table th.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}' +
  '.mv-table tr.mv-total td{font-weight:700;border-bottom:0}' +
  '.mv-table tr.mv-skip td{color:var(--muted)}' +
  '.mv-note{color:var(--muted);font-size:13.5px;margin:6px 0 0}' +
  '.mv-warn{color:var(--bad);font-weight:600}' +
  '.mv-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}' +
  '.mv-actions .btn{min-height:44px}' +
  '</style>';

const count = rows => (Array.isArray(rows) ? rows.length : 0);
const fmtN = n => Number(n || 0).toLocaleString('en-IN');

function check(data) {
  if (!data || typeof data !== 'object' || data.version !== 1 || !data.tables || typeof data.tables !== 'object' || Array.isArray(data.tables))
    throw new Error("That file isn't a RuPeace export (it needs \"version\": 1 and \"tables\").");
  const bad = Object.entries(data.tables).find(([, rows]) => !Array.isArray(rows));
  if (bad) throw new Error('That file looks damaged: "' + bad[0] + '" is not a list of rows.');
  if (!ORDER.some(t => count(data.tables[t]))) throw new Error('That file has no rows in it.');
  return data;
}

async function currentCounts() {
  try { const cur = await App.api.get('/api/export'); return cur && cur.tables ? cur.tables : null; }
  catch (e) { return null; }
}

App.settingsTab('move', {
  label: 'Move data', order: 95,
  async render(el) {
    let file = null, data = null, now = null;
    el.innerHTML = CSS + '<div class="card"><h2>Restore a backup</h2>' +
      '<p>Pick a RuPeace backup file (<code>.json</code>) made with <b>Backup</b> above. You will see what is in it before anything changes.</p>' +
      '<div class="mv-pick"><label class="btn primary">Choose a .json file<input type="file" accept=".json,application/json" data-file></label>' +
      '<span class="mv-file" data-name>No file chosen</span></div>' +
      '<div data-preview></div></div>';
    const preview = el.querySelector('[data-preview]'), name = el.querySelector('[data-name]');

    const draw = () => {
      if (!data) { preview.innerHTML = ''; return; }
      const t = data.tables;
      const names = ORDER.concat(Object.keys(t).filter(k => !ORDER.includes(k)));
      const nowTotal = now ? ORDER.reduce((s, k) => s + count(now[k]), 0) : null;
      const has = now ? (count(now.people) + count(now.entries)) > 0 : (App.opt && (App.opt.people || []).length > 0);
      let total = 0;
      const rows = names.map(k => {
        const n = count(t[k]);
        if (!ORDER.includes(k)) {
          if (!n) return '';
          return '<tr class="mv-skip"><td>' + App.esc(App.label(k)) + '</td><td class="n">' + fmtN(n) + '</td>' + (now ? '<td class="n">–</td>' : '') +
            '</tr><tr class="mv-skip"><td colspan="' + (now ? 3 : 2) + '">Skipped: ' + App.esc(SKIPPED[k] || 'not part of this app') + '</td></tr>';
        }
        total += n;
        return '<tr><td>' + App.esc(LABELS[k]) + '</td><td class="n">' + fmtN(n) + '</td>' + (now ? '<td class="n">' + fmtN(count(now[k])) + '</td>' : '') + '</tr>';
      }).join('');
      preview.innerHTML =
        '<table class="mv-table"><thead><tr><th>What</th><th class="n">In the file</th>' + (now ? '<th class="n">Here now</th>' : '') + '</tr></thead><tbody>' + rows +
        '<tr class="mv-total"><td>Total rows</td><td class="n">' + fmtN(total) + '</td>' + (now ? '<td class="n">' + fmtN(nowTotal) + '</td>' : '') + '</tr></tbody></table>' +
        (data.exported ? '<p class="mv-note">File made on ' + App.esc(App.date(String(data.exported))) + '.</p>' : '') +
        (has ? '<p class="mv-note mv-warn">This app already has data. Importing replaces all of it with the file — nothing is merged.</p>'
             : '<p class="mv-note">This app is empty, so the file simply fills it.</p>') +
        '<div class="mv-actions"><button type="button" class="btn ' + (has ? 'danger' : 'primary') + '" data-import>' + (has ? 'Replace everything with this file' : 'Import') + '</button>' +
        '<button type="button" class="btn" data-clear>Choose another file</button></div>';
      preview.querySelector('[data-clear]').onclick = () => { data = null; file = null; name.textContent = 'No file chosen'; el.querySelector('[data-file]').value = ''; draw(); };
      preview.querySelector('[data-import]').onclick = () => go(has, total);
    };

    const go = async (has, total) => {
      let confirm;
      if (has) {
        const ok = await App.form({
          title: 'Replace all data?',
          fields: [{ name: 'word', label: 'Type REPLACE to confirm', full: true,
                     hint: 'Everything now in the app (ledger, loans, savings, settings) is removed and the file\'s ' + fmtN(total) + ' rows take its place.' }],
          submit: 'Replace',
          onSubmit: v => { if (String(v.word).trim() !== 'REPLACE') throw new Error('Type REPLACE in capitals to go ahead.'); return v; },
        });
        if (!ok) return;
        confirm = 'REPLACE';
      } else if (!(await App.confirm('Import ' + fmtN(total) + ' rows from ' + (file ? file.name : 'this file') + '?', { okLabel: 'Import', title: 'Import data' }))) return;
      const btn = preview.querySelector('[data-import]');
      if (btn) { btn.disabled = true; btn.textContent = 'Importing…'; }
      try {
        const res = await App.api.post('/api/import', Object.assign({ version: data.version, tables: data.tables }, confirm ? { confirm } : {}));
        const got = (res && res.imported) || {};
        const n = Object.values(got).reduce((s, x) => s + (Number(x) || 0), 0);
        await App.loadOptions();
        App.toast('Imported ' + fmtN(n) + ' rows');
        data = null; file = null;
        el.querySelector('[data-file]').value = '';
        name.textContent = 'Done: ' + fmtN(n) + ' rows imported. Open the Monthly ledger to check.';
        now = await currentCounts();
        draw();
      } catch (e) {
        App.fail(e);
        if (btn) { btn.disabled = false; btn.textContent = has ? 'Replace everything with this file' : 'Import'; }
      }
    };

    el.querySelector('[data-file]').addEventListener('change', async e => {
      file = e.target.files && e.target.files[0];
      data = null; draw();
      if (!file) { name.textContent = 'No file chosen'; return; }
      name.textContent = file.name + ' · reading…';
      try {
        const text = await file.text();
        let parsed;
        try { parsed = JSON.parse(text); } catch (ex) { throw new Error("That file isn't valid JSON. Pick the .json file the backup made."); }
        data = check(parsed);
        now = await currentCounts();
        name.textContent = file.name;
        draw();
      } catch (ex) {
        name.textContent = file.name;
        preview.innerHTML = '<p class="mv-note mv-warn">' + App.esc(ex.message) + '</p>';
      }
    });
  }
});
})();
