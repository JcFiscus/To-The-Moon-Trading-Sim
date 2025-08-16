import { fmt, fmtBig } from '../util/format.js';
import { CFG } from '../config.js';

// Simplified chart and details renderer for single-screen layout

export function renderChart(root, ctx, sym) {
  root.innerHTML = `<canvas id="chart-canvas" aria-label="Price chart for ${sym}"></canvas>`;
  // Placeholder: chart drawing handled elsewhere
}

export function updateDetails(root, ctx, sym) {
  const a = ctx.assets.find(x => x.sym === sym);
  if (!a) return;
  root.innerHTML = `
    <div class="details-grid">
      <div><label>Supply</label><b>${a.supply?.toLocaleString()}</b></div>
      <div><label>Market Cap</label><b>${fmtMoney(a.supply * a.price)}</b></div>
      <div><label>Fair Value</label><b>${fmtMoney(a.fair)}</b></div>
      <div><label>Local Demand</label><b>${a.localDemand.toFixed(2)}</b></div>
      <div><label>Tomorrow (μ ± σ)</label><b>${(a.outlook?.mu || 0).toFixed(2)}% ± ${(a.outlook?.sigma || 0).toFixed(2)}%</b></div>
      <div><label>Expected Open Gap</label><b>${(a.outlook?.gap || 0).toFixed(2)}%</b></div>
    </div>
  `;
}

function fmtMoney(v) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v || 0);
}

// Legacy drawChart retained for tests
export function drawChart(ctx) {
  const a = ctx.assets.find(x => x.sym === ctx.selected) || ctx.assets[0];
  const canvas = document.getElementById('chart');
  const parent = canvas?.parentElement;
  if (!canvas || !parent) return;
  canvas.width = parent.clientWidth;
  canvas.height = parent.clientHeight;
  canvas.setAttribute('aria-label', `${a.sym} price chart`);
  const c = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  c.clearRect(0, 0, w, h);

  const baseViewMap = {
    hour: CFG.DAY_TICKS,
    day: CFG.DAY_TICKS * 14,
    week: CFG.DAY_TICKS * 7 * 8,
    month: CFG.DAY_TICKS * 30 * 12
  };
  const baseView = baseViewMap[ctx.chartInterval] || CFG.DAY_TICKS;
  const view = Math.max(1, Math.floor(baseView / (ctx.chartZoom || 1)));
  const maxOffset = Math.max(0, a.history.length - view);
  ctx.chartOffset = Math.min(Math.max(0, ctx.chartOffset || 0), maxOffset);
  const startIdx = Math.max(0, a.history.length - view - ctx.chartOffset);
  const data = a.history.slice(startIdx, startIdx + view);

  const min = Math.min(...data), max = Math.max(...data);
  const pad = (max - min) * 0.12 + 1e-6;
  const ymin = min - pad, ymax = max + pad;
  const y = v => h - ((v - ymin) / ((ymax - ymin) || 1)) * h;
  const step = w / ((data.length - 1) || 1);

  // grid
  c.globalAlpha = 0.15; c.strokeStyle = '#2a3646'; c.lineWidth = 1;
  for (let i = 0; i <= 4; i++) { const gy = Math.round(i * (h / 4)) + .5; c.beginPath(); c.moveTo(0, gy); c.lineTo(w, gy); c.stroke(); }
  c.globalAlpha = 1;

  // y labels
  c.fillStyle = '#8aa3bf'; c.font = '12px ui-monospace,monospace';
  [min, (min + max) / 2, max].forEach(v => c.fillText(fmt(v), w - 80, y(v) - 2));

  // day boundaries (only for ≥1D views)
  if (ctx.chartInterval !== 'hour') {
    c.globalAlpha = 0.25; c.strokeStyle = '#223043';
    for (const ix of a.dayBounds) {
      if (ix <= startIdx || ix >= startIdx + data.length) continue;
      const rel = ix - startIdx;
      const x = rel * step;
      c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke();
    }
    c.globalAlpha = 1;
  }

  const segments = [];
  const sizeMap = {
    hour: 1,
    day: CFG.DAY_TICKS,
    week: CFG.DAY_TICKS * 5,
    month: CFG.DAY_TICKS * 22
  };
  const segSize = sizeMap[ctx.chartInterval] || 1;
  for (let i = 0; i < data.length; i += segSize) {
    const slice = data.slice(i, i + segSize);
    if (slice.length === 0) continue;
    const open = slice[0];
    const close = slice[slice.length - 1];
    const high = Math.max(...slice);
    const low = Math.min(...slice);
    segments.push({ start: i, end: i + slice.length, open, close, high, low });
  }

  const segStep = w / (segments.length || 1);

  if (ctx.chartMode === 'candles') {
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const cx = (i + 0.5) * segStep;
      const bodyW = Math.max(1, segStep * 0.6);
      const color = seg.close >= seg.open ? '#8ad7a0' : '#ff6b6b';
      c.strokeStyle = color;
      c.beginPath(); c.moveTo(cx, y(seg.high)); c.lineTo(cx, y(seg.low)); c.stroke();
      let top = y(Math.max(seg.open, seg.close));
      let bottom = y(Math.min(seg.open, seg.close));
      if (Math.abs(top - bottom) < 1) bottom = top + 1;
      c.fillStyle = color;
      c.fillRect(cx - bodyW / 2, top, bodyW, bottom - top);
    }
  } else {
    // price line
    c.lineWidth = 2; c.strokeStyle = '#8ad7a0'; c.beginPath();
    data.forEach((v, i) => { const px = i * step, py = y(v); if (i === 0) c.moveTo(px, py); else c.lineTo(px, py); }); c.stroke();
  }

  // moving average
  const ma = [];
  for (let i = 0; i < data.length; i++) {
    const s = Math.max(0, i - 6);
    const slice = data.slice(s, i + 1);
    ma.push(slice.reduce((x, y) => x + y, 0) / slice.length);
  }
  if (ma.length > 6) {
    c.lineWidth = 1; c.strokeStyle = '#5aa1f0'; c.beginPath();
    ma.forEach((v, i) => { const px = i * step, py = y(v); if (i === 0) c.moveTo(px, py); else c.lineTo(px, py); }); c.stroke();
  }

  // prev close
  const last = data[data.length - 1];
  const prevClose = a.dayBounds.length ? (a.history[(a.dayBounds[a.dayBounds.length - 1] - 1)] || last) : last;
  c.setLineDash([4, 3]); c.strokeStyle = '#3b556e'; c.beginPath(); c.moveTo(0, y(prevClose)); c.lineTo(w, y(prevClose)); c.stroke();
  c.setLineDash([]);
  c.fillStyle = '#cbd5e1'; c.fillText(`${a.sym} ${fmt(last)}  (prev ${fmt(prevClose)})`, 8, 16);

  ctx._chartState = { data, step, segStep, off: startIdx, maxOffset, segments };

  // stats panel (minimal for tests)
  const stats = document.getElementById('chartStats');
  if (stats) stats.innerHTML = '';
}
