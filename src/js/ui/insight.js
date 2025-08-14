import { CFG } from '../config.js';

export function renderInsight(ctx){
  const a = ctx.assets.find(x => x.sym === ctx.selected) || ctx.assets[0];
  const line = document.getElementById('analystLine');
  const t=a.analyst?.tone||'Neutral', cls=a.analyst?.cls||'neu', conf=Math.round((a.analyst?.conf||0.5)*100);
  const od=a.outlookDetail||{gMu:0, evMu:0, evDem:0, valuation:0, streakMR:0, demandTerm:0};
  line.innerHTML = [
    `<span class="analyst ${cls}">${t}</span>`,
    `<span class="mini">Conf ${conf}%</span>`,
    `<span class="tag">Events μ: ${((od.evMu||0)*CFG.DAY_TICKS*100).toFixed(1)}bp</span>`,
    `<span class="tag">Event demand: ${((od.evDem||0)*100).toFixed(1)}%</span>`,
    `<span class="tag">Valuation: ${((od.valuation||0)*100).toFixed(1)}bp</span>`,
    `<span class="tag">Streak MR: ${((od.streakMR||0)*100).toFixed(1)}bp</span>`
  ].join(' ');

  const news = document.getElementById('assetNews');
  const list = (ctx.newsByAsset && ctx.newsByAsset[a.sym]) || [];
  news.innerHTML = list.slice(0,8).map(rec => {
    const ev = rec.ev;
    const maj = ev.severity === 'major' ? 'major' : '';
    const posneg = (ev.mu + ev.demand) >= 0 ? 'pos' : 'neg';
    const who = ev.scope === 'global' ? 'GLOBAL' : a.sym;
    const days = ev.days ? ` • ${ev.days}d` : '';
    return `<div class="news-item">
      <b>${rec.when}</b> — <span>${who}: ${ev.title}</span>
      <span class="chip ${maj}">${ev.severity}</span>
      <span class="chip ${posneg}">${ev.mu>=0?'+':''}${(ev.mu*10000).toFixed(0)}μ • ${ev.demand>=0?'+':''}${(ev.demand*100).toFixed(1)}% D</span>
      <span class="chip">${ev.type}${days}</span>
    </div>`;
  }).join('') || `<div class="news-item mini">No recent asset‑specific news.</div>`;
}
