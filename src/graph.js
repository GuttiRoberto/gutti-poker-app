// Graficul „All-in EV” vs. „Câștig/pierdere”, ca în PokerTracker: sume cumulate pe mâini, în ordine cronologică.
// Linia EV = rezultatul real minus norocul cumulat de la all-in-urile cu cărți vizibile.

export const CHART_GEO = { W: 1000, H: 340, L: 10, R: 64, T: 12, B: 30 };

// unit: 'bb' sau 'usd'. Indexul 0 este începutul (0), indexul i este după i mâini.
export function buildSeries(hands, unit) {
  const list = [...hands].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const n = list.length, real = new Float64Array(n + 1), ev = new Float64Array(n + 1);
  let r = 0, l = 0;
  for (let i = 0; i < n; i++) {
    const h = list[i], usd = unit === 'usd';
    r += usd ? h.heroNet / 100 : h.heroNetBb;
    if (h.allin && h.allin.luck != null) l += usd ? h.allin.luck / 100 : h.allin.luck / h.bb;
    real[i + 1] = r; ev[i + 1] = r - l;
  }
  return { n, real, ev, unit };
}

// Indici de desenat: cel mult `max` puncte, mereu cu primul și ultimul.
export function sampleIndexes(n, max = 1200) {
  if (n + 1 <= max) return Array.from({ length: n + 1 }, (_, i) => i);
  const out = [], step = n / (max - 1);
  for (let k = 0; k < max - 1; k++) out.push(Math.round(k * step));
  out.push(n);
  return [...new Set(out)];
}

// Gradații „frumoase” (1, 2, 5 × 10^k) care acoperă [min, max].
export function niceTicks(min, max, count = 5) {
  if (!(max > min)) { max = min + 1; }
  const raw = (max - min) / count, mag = 10 ** Math.floor(Math.log10(raw)), f = raw / mag;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * mag;
  const out = [];
  for (let v = Math.floor(min / step) * step; v <= max + step * 0.999; v += step) out.push(Math.round(v / step) * step);
  return out;
}

const fmtTick = (v, step, unit) => {
  const s = v.toLocaleString('ro-RO', { minimumFractionDigits: step < 1 ? 2 : 0, maximumFractionDigits: step < 1 ? 2 : 0 });
  return unit === 'usd' ? `$${s}` : s;
};

// Desenul ca SVG (fără biblioteci).
export function chartSvg(S, unit) {
  const { W, H, L, R, T, B } = CHART_GEO, n = S.n;
  let min = 0, max = 0;
  for (let i = 0; i <= n; i++) for (const v of [S.real[i], S.ev[i]]) { if (v < min) min = v; if (v > max) max = v; }
  const yt = niceTicks(min, max, 5), y0 = yt[0], y1 = yt[yt.length - 1], ystep = yt.length > 1 ? yt[1] - yt[0] : 1;
  const X = (i) => L + (n ? i / n : 0) * (W - L - R), Y = (v) => T + ((y1 - v) / (y1 - y0)) * (H - T - B);
  const idx = sampleIndexes(n);
  const path = (arr) => idx.map((i, k) => `${k ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(arr[i]).toFixed(1)}`).join('');
  const xt = niceTicks(0, n, 7).filter((v) => v >= 0 && v <= n);
  const grid = yt.map((v) => `<line class="${Math.abs(v) < 1e-9 ? 'zero' : 'grid'}" x1="${L}" x2="${W - R}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/><text x="${W - R + 6}" y="${(Y(v) + 4).toFixed(1)}">${fmtTick(v, ystep, unit)}</text>`).join('');
  const xs = xt.map((v) => `<text x="${X(v).toFixed(1)}" y="${H - 10}" text-anchor="middle">${v.toLocaleString('ro-RO')}</text>`).join('');
  return `<svg id="evChart" class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Grafic: câștig real și All-in EV cumulate pe ${n} mâini">${grid}${xs}` +
    `<path class="l-ev" d="${path(S.ev)}"/><path class="l-real" d="${path(S.real)}"/><line id="evCursor" class="cursor" x1="0" x2="0" y1="${T}" y2="${H - B}" visibility="hidden"/></svg>`;
}
