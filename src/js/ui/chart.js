import { fmt } from '../util/format.js';

export function initChart(ctx){
  const canvas = document.getElementById('chart');
  const tooltip = document.getElementById('chartTooltip');
  ctx.chartZoom = 1;
  ctx.chartOffset = 0;

  window.addEventListener('resize', () => drawChart(ctx));

  let dragging = false;
  let lastX = 0;

  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.1 : 0.9;
    ctx.chartZoom = Math.min(Math.max(1, ctx.chartZoom * factor), 8);
    drawChart(ctx);
  }, { passive: false });

  canvas.addEventListener('mousedown', e => {
    dragging = true;
    lastX = e.clientX;
  });
  window.addEventListener('mouseup', () => { dragging = false; });

  canvas.addEventListener('mousemove', e => {
    const state = ctx._chartState;
    if (!state) return;
    if (dragging) {
      const dx = e.clientX - lastX;
      const pts = Math.round(dx / state.step);
      if (pts !== 0) {
        ctx.chartOffset = Math.min(Math.max(0, ctx.chartOffset - pts), state.maxOffset);
        lastX = e.clientX;
        drawChart(ctx);
      }
    } else {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const idx = Math.min(state.data.length - 1, Math.max(0, Math.round(x / state.step)));
      const price = state.data[idx];
      let html = `t=${state.off + idx} price ${fmt(price)}`;
      if (ctx.chartMode === 'candles' && state.segments) {
        const seg = state.segments.find(s => idx >= s.start && idx < s.end);
        if (seg) {
          html = `t=${state.off + seg.start}<br>O:${fmt(seg.open)} H:${fmt(seg.high)}<br>L:${fmt(seg.low)} C:${fmt(seg.close)}`;
        }
      }
      tooltip.style.display = 'block';
      tooltip.innerHTML = html;
      tooltip.style.left = `${x + 10}px`;
      tooltip.style.top = `${e.clientY - rect.top + 10}px`;
    }
  });

  canvas.addEventListener('mouseleave', () => {
    tooltip.style.display = 'none';
  });
}

export function drawChart(ctx) {
  const a = ctx.assets.find(x => x.sym === ctx.selected) || ctx.assets[0];
  const canvas = document.getElementById('chart');
  const parent = canvas.parentElement;
  canvas.width = parent.clientWidth;
  canvas.height = parent.clientHeight;
  canvas.setAttribute('aria-label', `${a.sym} price chart`);
  const c = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  c.clearRect(0, 0, w, h);

  const view = Math.floor((w / 2) / (ctx.chartZoom || 1));
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

  // day boundaries
  c.globalAlpha = 0.25; c.strokeStyle = '#223043';
  for (const ix of a.dayBounds) {
    if (ix <= startIdx || ix >= startIdx + data.length) continue;
    const rel = ix - startIdx;
    const x = rel * step;
    c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke();
  }
  c.globalAlpha = 1;

  const segments = [];
  const bounds = [...a.dayBounds, a.history.length];
  for (let i = 0; i < bounds.length; i++) {
    const s = i === 0 ? 0 : bounds[i - 1];
    const e = bounds[i];
    if (e <= startIdx || s >= startIdx + data.length) continue;
    const segStart = Math.max(s, startIdx);
    const segEnd = Math.min(e, startIdx + data.length);
    const slice = a.history.slice(segStart, segEnd);
    const open = slice[0];
    const close = slice[slice.length - 1];
    const high = Math.max(...slice);
    const low = Math.min(...slice);
    segments.push({ start: segStart - startIdx, end: segEnd - startIdx, open, close, high, low });
  }

  if (ctx.chartMode === 'candles') {
    for (const seg of segments) {
      const cx = (seg.start + (seg.end - seg.start) / 2) * step;
      const bodyW = Math.max(step, (seg.end - seg.start) * step * 0.6);
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

  ctx._chartState = { data, step, off: startIdx, maxOffset, segments };
  
  // stats panel
  const stats = document.getElementById('chartStats');
  stats.innerHTML = '';
  const rows = [
    ['Supply', a.supply.toLocaleString()],
    ['Local Demand', a.localDemand.toFixed(2) + ` (ev ${(a.evDemandBias >= 0 ? '+' : '')}${a.evDemandBias.toFixed(2)})`],
    ['Fair Value', fmt(a.fair)],
    ['Tomorrow (μ ± σ)', `${((a.outlook?.mu || 0) * 100).toFixed(2)}% ± ${((a.outlook?.sigma || a.daySigma || 0) * 100).toFixed(2)}%`],
    ['Expected Open Gap', `${(a.outlook?.gap || 0) >= 0 ? '+' : ''}${((a.outlook?.gap || 0) * 100).toFixed(1)}%`]
  ];
  for (const [k, v] of rows) {
    const d = document.createElement('div'); d.className = 'stat';
    d.innerHTML = `<div class="mini">${k}</div><div><b>${v}</b></div>`;
    stats.appendChild(d);
  }
}
