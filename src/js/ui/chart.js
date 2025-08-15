import { fmt } from '../util/format.js';
import { CFG } from '../config.js';

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
  [min, (min+max)/2, max].forEach(v=> c.fillText(fmt(v), w-80, y(v)-2));

  // day boundaries + x labels
  c.globalAlpha=0.25; c.strokeStyle="#223043";
  for(let di=0; di<a.dayBounds.length; di++){
    const ix = a.dayBounds[di];
    if(ix<off) continue;
    const rel = ix-off;
    const x = rel*(w/(data.length-1));
    c.beginPath(); c.moveTo(x,0); c.lineTo(x,h); c.stroke();
    c.fillStyle="#8aa3bf"; c.font="10px ui-monospace,monospace"; c.textAlign='center';
    c.fillText(String(di+1), x, h-16);
  }
  c.textAlign='left';
  c.globalAlpha=1;

  // axis titles
  c.fillStyle="#8aa3bf"; c.font="12px ui-monospace,monospace"; c.textAlign='center';
  c.fillText('Time (days)', w/2, h-2);
  c.save();
  c.translate(12, h/2);
  c.rotate(-Math.PI/2);
  c.fillText('Price', 0, 0);
  c.restore();
  c.textAlign='left';

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
      const open = data[i-1];
      const close = data[i];
      const high = Math.max(open, close);
      const low = Math.min(open, close);
      const cx = (i-0.5)*step;
      c.strokeStyle = close>=open?"#8ad7a0":"#ff6b6b";
      c.beginPath();
      c.moveTo(cx, y(high));
      c.lineTo(cx, y(low));
      c.stroke();
      const top = y(high);
      let bottom = y(low);
      if(Math.abs(top-bottom)<1) bottom = top+1;
      c.fillStyle = close>=open?"#8ad7a0":"#ff6b6b";
      c.fillRect(cx-bodyW/2, top, bodyW, bottom-top);
    }
  } else {
    // price line
    c.lineWidth=2; c.strokeStyle="#8ad7a0"; c.beginPath();
    data.forEach((v,i)=>{ const px=i*(w/(data.length-1)),py=y(v); if(i===0) c.moveTo(px,py); else c.lineTo(px,py); }); c.stroke();
  }

  // moving average
  const window = CFG.PRICE_MA_DAYS * CFG.DAY_TICKS;
  const ma=[]; let sum=0;
  for(let i=0;i<data.length;i++){
    sum+=data[i];
    if(i>=window) sum-=data[i-window];
    const denom = i<window ? i+1 : window;
    ma.push(sum/denom);
  }
  if(ma.length>window){
    c.lineWidth=1; c.strokeStyle="#5aa1f0"; c.beginPath();
    ma.forEach((v,i)=>{ const px=i*(w/(data.length-1)), py=y(v); if(i===0) c.moveTo(px,py); else c.lineTo(px,py); });
    c.stroke();
  }

  // prev close
  const last=data[data.length-1];
  const prevClose=a.dayBounds.length? (a.history[(a.dayBounds[a.dayBounds.length-1]-1)] || last) : last;
  c.setLineDash([4,3]); c.strokeStyle="#3b556e"; c.beginPath();
  c.moveTo(0,y(prevClose)); c.lineTo(w,y(prevClose)); c.stroke(); c.setLineDash([]);
  c.fillStyle="#cbd5e1";
  c.fillText(`${a.sym} ${fmt(last)}  (prev ${fmt(prevClose)})`, 8, 16);
}
