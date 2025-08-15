import { fmt } from '../util/format.js';

export function drawChart(ctx){
  const a = ctx.assets.find(x => x.sym === ctx.selected) || ctx.assets[0];
  const canvas = document.getElementById('chart'); const c = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  c.clearRect(0,0,w,h);
  const data = a.history.slice(-Math.floor(w/2));
  const min = Math.min(...data), max = Math.max(...data);
  const pad = (max-min)*0.12 + 1e-6; const ymin = min-pad, ymax = max+pad;
  const y = v => h - ((v - ymin) / ((ymax - ymin) || 1)) * h;
  const off = a.history.length - data.length;
  const dayStart = a.dayBounds[a.dayBounds.length-1] || 0;
  const relStart = Math.max(0, dayStart - off);
  const step = w/((data.length-1) || 1);

  // grid
  c.globalAlpha=0.15; c.strokeStyle="#2a3646"; c.lineWidth=1;
  for(let i=0;i<=4;i++){ const gy=Math.round(i*(h/4))+.5; c.beginPath(); c.moveTo(0,gy); c.lineTo(w,gy); c.stroke(); }
  c.globalAlpha=1;

  // y labels
  c.fillStyle="#8aa3bf"; c.font="12px ui-monospace,monospace";
  [min, (min + max) / 2, max].forEach(v => c.fillText(fmt(v), w - 80, y(v) - 2));

  // day boundaries
  c.globalAlpha=0.25; c.strokeStyle="#223043";
  for(const ix of a.dayBounds){ if(ix<off) continue; const rel=ix-off; const x=rel*(w/(data.length-1)); c.beginPath(); c.moveTo(x,0); c.lineTo(x,h); c.stroke(); }
  c.globalAlpha=1;

  if (ctx.chartMode === 'candles') {
    // line for previous days
    if (relStart > 0) {
      c.lineWidth = 2; c.strokeStyle = "#8ad7a0"; c.beginPath();
      for(let i=0;i<=relStart;i++){ const px=i*step,py=y(data[i]); if(i===0) c.moveTo(px,py); else c.lineTo(px,py); }
      c.stroke();
    }
    // candles for current day
    const bodyW = step * 0.6;
    for(let i=Math.max(1, relStart+1); i<data.length; i++){
      const open=data[i-1], close=data[i];
      const high=Math.max(open,close), low=Math.min(open,close);
      const cx=(i-0.5)*step;
      c.strokeStyle=close>=open?"#8ad7a0":"#ff6b6b";
      c.beginPath(); c.moveTo(cx, y(high)); c.lineTo(cx, y(low)); c.stroke();
      const top=y(Math.max(open,close));
      let bottom=y(Math.min(open,close));
      if(Math.abs(top-bottom)<1) bottom=top+1;
      c.fillStyle=close>=open?"#8ad7a0":"#ff6b6b";
      c.fillRect(cx-bodyW/2, top, bodyW, bottom-top);
    }
  } else {
    // price line
    c.lineWidth=2; c.strokeStyle="#8ad7a0"; c.beginPath();
    data.forEach((v,i)=>{ const px=i*(w/(data.length-1)),py=y(v); if(i===0) c.moveTo(px,py); else c.lineTo(px,py); }); c.stroke();
  }

  // 7‑day MA (≈ 70 pts on canvas)
  const ma=[]; for(let i=0;i<data.length;i++){ const s=Math.max(0,i-6); const slice=data.slice(s,i+1); ma.push(slice.reduce((x,y)=>x+y,0)/slice.length); }
  if (ma.length>6){ c.lineWidth=1; c.strokeStyle="#5aa1f0"; c.beginPath(); ma.forEach((v,i)=>{ const px=i*(w/(data.length-1)), py=y(v); if(i===0) c.moveTo(px,py); else c.lineTo(px,py); }); c.stroke(); }

  // prev close
  const last=data[data.length-1]; const prevClose=a.dayBounds.length? (a.history[(a.dayBounds[a.dayBounds.length-1]-1)] || last) : last;
  c.setLineDash([4,3]); c.strokeStyle="#3b556e"; c.beginPath(); c.moveTo(0,y(prevClose)); c.lineTo(w,y(prevClose)); c.stroke(); c.setLineDash([]);
  c.fillStyle="#cbd5e1"; c.fillText(`${a.sym} ${fmt(last)}  (prev ${fmt(prevClose)})`, 8, 16);

  // stats panel
  const stats = document.getElementById('chartStats');
  stats.innerHTML = '';
  const rows = [
    ['Supply', a.supply.toLocaleString()],
    ['Local Demand', a.localDemand.toFixed(2) + ` (ev ${(a.evDemandBias>=0?'+':'')}${a.evDemandBias.toFixed(2)})`],
    ['Fair Value', fmt(a.fair)],
    ['Tomorrow (μ ± σ)', `${((a.outlook?.mu||0)*100).toFixed(2)}% ± ${((a.outlook?.sigma||a.daySigma||0)*100).toFixed(2)}%`],
    ['Expected Open Gap', `${(a.outlook?.gap||0)>=0?'+':''}${((a.outlook?.gap||0)*100).toFixed(1)}%`]
  ];
  for(const [k,v] of rows){
    const d = document.createElement('div'); d.className = 'stat';
    d.innerHTML = `<div class="mini">${k}</div><div><b>${v}</b></div>`;
    stats.appendChild(d);
  }
}
