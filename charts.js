/* Charts for the app's screens.
   App.PAL: category colours (Home pie) ·
   App.chart(el, { series: [{ label, color, points: [{ x: 'YYYY-MM', y }] }], refs: [{ y, label }], marks: [{ x, label }], height }) */
(function () {
'use strict';
const App = window.App;
const MN = App.MN;
const PAL = ['#7466d4', '#c77aa8', '#3fb58a', '#e0a24f', '#4e9fd1', '#9a7fd8', '#dd7272', '#3aaea3'];
App.PAL = PAL;

App.chart = (host, cfg) => {
  const ymi = s => { const [y, m] = s.split('-').map(Number); return y * 12 + m - 1; };
  const W = Math.max(320, host.clientWidth || 600), H = cfg.height || 260, m = { l: 56, r: 16, t: 22, b: 28 };
  const pts = cfg.series.flatMap(s => s.points.map(p => ({ i: ymi(p.x), v: p.y })));
  if (!pts.length) { host.innerHTML = '<div class="empty">No data</div>'; return; }
  const x0 = Math.min(...pts.map(p => p.i)), x1 = Math.max(...pts.map(p => p.i)), span = x1 - x0;
  let y0 = Math.min(0, ...pts.map(p => p.v)), y1 = Math.max(...pts.map(p => p.v), ...(cfg.refs || []).map(r => r.y));
  const raw = (y1 - y0) / 4 || 1, p10 = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / p10;
  const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p10;
  y0 = Math.floor(y0 / step) * step; y1 = Math.ceil(y1 / step) * step || step;
  const X = i => m.l + (i - x0) / Math.max(1, span) * (W - m.l - m.r);
  const Y = v => m.t + (1 - (v - y0) / (y1 - y0)) * (H - m.t - m.b);
  const smooth = P => {
    if (P.length < 3) return P.map((p, j) => (j ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('');
    let d = 'M' + P[0][0].toFixed(1) + ' ' + P[0][1].toFixed(1);
    for (let j = 1; j < P.length; j++) {
      const [ax, ay] = P[j - 1], [bx, by] = P[j], cx = (ax + bx) / 2;
      d += 'C' + cx.toFixed(1) + ' ' + ay.toFixed(1) + ' ' + cx.toFixed(1) + ' ' + by.toFixed(1) + ' ' + bx.toFixed(1) + ' ' + by.toFixed(1);
    }
    return d;
  };
  const uid = 'g' + Math.random().toString(36).slice(2, 7);
  const colr = (se, k) => se.color || PAL[k];
  let s = '<svg viewBox="0 0 ' + W + ' ' + H + '"><defs>' + cfg.series.map((se, k) =>
    '<linearGradient id="' + uid + k + '" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="' + colr(se, k) + '" stop-opacity=".32"/><stop offset="1" stop-color="' + colr(se, k) + '" stop-opacity="0"/></linearGradient>').join('') + '</defs>';
  for (let v = y0; v <= y1 + step / 2; v += step) {
    s += '<line class="grid" x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + Y(v) + '" y2="' + Y(v) + '"/><text class="tick" x="' + (m.l - 8) + '" y="' + (Y(v) + 4) +
      '" text-anchor="end">' + (Math.abs(v) < step / 2 ? '0' : App.lakh(v, 0).replace('₹', '')) + '</text>';
  }
  for (let i = x0; i <= x1; i++) {
    if (span < 13 || (span < 30 && i % 3 === 0) || (span >= 30 && i % 12 === 0)) {
      const lab = span < 30 ? MN[i % 12] + (i % 12 === 0 || i === x0 ? ' ' + String(Math.floor(i / 12)).slice(2) : '') : String(Math.floor(i / 12));
      s += '<text class="tick" x="' + X(i) + '" y="' + (H - 8) + '" text-anchor="middle">' + lab + '</text>';
    }
  }
  (cfg.refs || []).forEach(r => { s += '<line class="ref" x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + Y(r.y) + '" y2="' + Y(r.y) + '"/><text class="lbl" x="' + (W - m.r) + '" y="' + (Y(r.y) - 5) + '" text-anchor="end">' + App.esc(r.label) + '</text>'; });
  (cfg.marks || []).forEach(k => { const i = ymi(k.x); if (i >= x0 && i <= x1) s += '<line class="ref" x1="' + X(i) + '" x2="' + X(i) + '" y1="' + m.t + '" y2="' + (H - m.b) + '"/><text class="lbl" x="' + (X(i) + 5) + '" y="' + (m.t + 10) + '">' + App.esc(k.label) + '</text>'; });
  cfg.series.forEach((se, k) => {
    const P = se.points.map(p => [X(ymi(p.x)), Y(p.y)]);
    if (!P.length) return;
    const d = smooth(P), base = Y(Math.max(0, y0));
    s += '<path d="' + d + 'L' + P[P.length - 1][0].toFixed(1) + ' ' + base + 'L' + P[0][0].toFixed(1) + ' ' + base + 'Z" fill="url(#' + uid + k + ')"/>';
    s += '<path class="line" d="' + d + '" fill="none" stroke="' + colr(se, k) + '"/>';
    const L = P[P.length - 1];
    s += '<circle cx="' + L[0] + '" cy="' + L[1] + '" r="4.5" fill="' + colr(se, k) + '" stroke="var(--surface)" stroke-width="2"/>';
  });
  s += '<g class="hov" style="display:none"><line class="cross" y1="' + m.t + '" y2="' + (H - m.b) + '"/>' + cfg.series.map((se, k) => '<circle r="5" fill="' + colr(se, k) + '" stroke="var(--surface)" stroke-width="2"/>').join('') + '</g>';
  s += '<rect class="hit" x="' + m.l + '" y="' + m.t + '" width="' + (W - m.l - m.r) + '" height="' + (H - m.t - m.b) + '" fill="transparent"/></svg><div class="tip"></div>';
  host.innerHTML = s;
  const svg = host.querySelector('svg'), hov = host.querySelector('.hov'), tip = host.querySelector('.tip');
  const dots = hov.querySelectorAll('circle'), cross = hov.querySelector('line');
  const move = ev => {
    const rc = svg.getBoundingClientRect();
    let i = Math.round(x0 + ((ev.clientX - rc.left) * W / rc.width - m.l) / (W - m.l - m.r) * span);
    i = Math.max(x0, Math.min(x1, i));
    hov.style.display = ''; cross.setAttribute('x1', X(i)); cross.setAttribute('x2', X(i));
    let h = '<div class="tt">' + MN[i % 12] + ' ' + Math.floor(i / 12) + '</div>';
    cfg.series.forEach((se, k) => {
      const p = se.points.find(q => ymi(q.x) === i);
      if (p) { dots[k].setAttribute('cx', X(i)); dots[k].setAttribute('cy', Y(p.y)); dots[k].style.display = ''; h += '<div class="tr"><span><i style="background:' + colr(se, k) + '"></i>' + App.esc(se.label || '') + '</span><b>' + App.money(p.y) + '</b></div>'; }
      else dots[k].style.display = 'none';
    });
    tip.innerHTML = h; tip.style.display = 'block';
    const tx = X(i) * rc.width / W, tw = tip.offsetWidth;
    tip.style.left = Math.max(0, Math.min(rc.width - tw, tx + (tx > rc.width / 2 ? -tw - 14 : 14))) + 'px';
    tip.style.top = '8px';
  };
  const hit = host.querySelector('.hit');
  hit.addEventListener('pointermove', move);
  hit.addEventListener('pointerdown', move);
  hit.addEventListener('pointerleave', () => { hov.style.display = 'none'; tip.style.display = 'none'; });
};
})();
