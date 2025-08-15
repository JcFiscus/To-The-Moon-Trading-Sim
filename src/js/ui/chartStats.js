import { fmt } from '../util/format.js';

let lastHtml = '';

export function renderChartStats(ctx){
  const a = ctx.assets.find(x => x.sym === ctx.selected) || ctx.assets[0];
  const rows = [
    ['Supply', a.supply.toLocaleString()],
    ['Local Demand', a.localDemand.toFixed(2) + ` (ev ${(a.evDemandBias>=0?'+':'')}${a.evDemandBias.toFixed(2)})`],
    ['Fair Value', fmt(a.fair)],
    ['Tomorrow (μ ± σ)', `${((a.outlook?.mu||0)*100).toFixed(2)}% ± ${((a.outlook?.sigma||a.daySigma||0)*100).toFixed(2)}%`],
    ['Expected Open Gap', `${(a.outlook?.gap||0)>=0?'+':''}${((a.outlook?.gap||0)*100).toFixed(1)}%`]
  ];
  const html = rows.map(([k,v])=>`<div class="stat"><div class="mini">${k}</div><div><b>${v}</b></div></div>`).join('');
  if(html===lastHtml) return;
  lastHtml = html;
  const stats = document.getElementById('chartStats');
  if(stats) stats.innerHTML = html;
}
