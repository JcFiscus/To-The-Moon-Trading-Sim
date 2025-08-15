export function renderAssetNewsTable(ctx){
  const a = ctx.assets.find(x => x.sym === ctx.selected) || ctx.assets[0];
  document.getElementById('newsSymbol').textContent = `${a.sym} — ${a.name}`;
  const cont = document.getElementById('newsTable');
  const list = (ctx.newsByAsset && ctx.newsByAsset[a.sym]) || [];
  if (!list.length){
    cont.innerHTML = `<div class="mini">No recent news for ${a.sym}.</div>`;
    return;
  }
  const rows = [`<table><thead><tr>
    <th>When</th><th>Title</th><th>Type</th><th>Severity</th><th>Effect</th><th>Timing</th>
  </tr></thead><tbody>`];
  for (const rec of list.slice(0,40)){
    const ev = rec.ev;
    const eff = `Bias ${ev.mu>=0?'+':''}${(ev.mu*10000).toFixed(0)}bp • Demand ${ev.demand>=0?'+':''}${(ev.demand*100).toFixed(1)}% • Vol ${ev.sigma>=0?'+':''}${(ev.sigma*100).toFixed(1)}%`;
    const tip = `μ ${(ev.mu*10000).toFixed(0)}bp • σ ${(ev.sigma*100).toFixed(1)}% • D ${(ev.demand*100).toFixed(1)}%`;
    rows.push(`<tr>
      <td>${rec.when}</td>
      <td>${ev.scope==='global'?'GLOBAL: ':''}${ev.title}</td>
      <td>${ev.type}</td>
      <td>${ev.severity}</td>
      <td title="${tip}">${eff}</td>
      <td>${ev.timing || 'multi‑day'}</td>
    </tr>`);
  }
  rows.push(`</tbody></table>`);
  cont.innerHTML = rows.join('');
}
