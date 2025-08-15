import { CFG } from '../config.js';

export function renderInsight(ctx){
  const a = ctx.assets.find(x => x.sym === ctx.selected) || ctx.assets[0];
  const line = document.getElementById('analystLine');
  const t=a.analyst?.tone||'Neutral', cls=a.analyst?.cls||'neu', conf=Math.round((a.analyst?.conf||0.5)*100);
  const od=a.outlookDetail||{gMu:0, evMu:0, evDem:0, valuation:0, streakMR:0, demandTerm:0};
  const eventCount = (ctx.market.tomorrow || []).filter(ev => ev.scope === 'global' || ev.sym === a.sym).length;
  const netBias = (od.evMu||0)*CFG.DAY_TICKS*100;
  const detailTip = `Event μ: ${((od.evMu||0)*CFG.DAY_TICKS*100).toFixed(1)}%\nEvent demand: ${((od.evDem||0)*100).toFixed(1)}%\nValuation: ${((od.valuation||0)*100).toFixed(1)}%\nStreak MR: ${((od.streakMR||0)*100).toFixed(1)}%`;
  let summary = `Analyst: <span class="analyst ${cls}">${t}</span>, Confidence: ${conf}%, <span title="${detailTip}">Upcoming events: ${eventCount} (net bias ${(netBias>=0?'+':'') + netBias.toFixed(1)}%)</span>`;
  if (ctx.state.insiderTip && ctx.state.insiderTip.sym === a.sym && ctx.state.insiderTip.daysLeft > 0) {
    const tip = ctx.state.insiderTip;
    summary += ` <span class="tag" title="μ ${(tip.mu*100).toFixed(2)}% σ ${(tip.sigma*100).toFixed(2)}%">Tip ${tip.bias>0?'Bullish':'Bearish'} ${tip.daysLeft}d</span>`;
  }
  line.innerHTML = summary;

  const news = document.getElementById('assetNews');
  const list = (ctx.newsByAsset && ctx.newsByAsset[a.sym]) || [];
  const filtered = list.filter(rec => !rec.ev.requires || rec.ev.requires.every(id => ctx.state.upgrades[id]));
  news.innerHTML = filtered.slice(0,8).map(rec => {
    const ev = rec.ev;
    const maj = ev.severity === 'major' ? 'major' : '';
    const posneg = (ev.mu + ev.demand) >= 0 ? 'pos' : 'neg';
    const icon = ev.scope === 'global' ? '🌐' : '📈';
    const label = ev.scope === 'global' ? 'GLOBAL' : a.sym;
    const days = ev.days ? ` • ${ev.days}d` : '';
    let eff, tip;
    if (ev.type === 'insider') {
      eff = ev.mu >= 0 ? 'Bullish Tip' : 'Bearish Tip';
      tip = eff;
    } else {
      eff = `Bias ${ev.mu>=0?'+':''}${(ev.mu*10000).toFixed(0)}bp • Demand ${ev.demand>=0?'+':''}${(ev.demand*100).toFixed(1)}% • Vol ${ev.sigma>=0?'+':''}${(ev.sigma*100).toFixed(1)}%`;
      tip = `μ ${(ev.mu*10000).toFixed(0)}bp • σ ${(ev.sigma*100).toFixed(1)}% • D ${(ev.demand*100).toFixed(1)}%`;
    }
    return `<div class="news-item">
      <b>${rec.when}</b> — <span>${icon} ${label}: ${ev.title}</span>
      <span class="chip ${maj}">${ev.severity}</span>
      <span class="chip ${posneg}" title="${tip}">${eff}</span>
      <span class="chip">${ev.type}${days}</span>
    </div>`;
  }).join('') || `<div class="news-item mini">No recent asset‑specific news.</div>`;
}
