export function renderAssetNewsTable(ctx){
  const a = ctx.assets.find(x => x.sym === ctx.selected) || ctx.assets[0];
  document.getElementById('newsSymbol').textContent = `${a.sym} — ${a.name}`;
  const cont = document.getElementById('newsTable');
  const list = (ctx.newsByAsset && ctx.newsByAsset[a.sym]) || [];
  cont.innerHTML = '';
  if (!list.length){
    cont.innerHTML = `<div class="mini">No recent news for ${a.sym}.</div>`;
    return;
  }

  const table = document.createElement('table');
  table.innerHTML = '<thead><tr><th>When</th><th>Title</th><th>Type</th><th>Severity</th><th>Effect</th><th>Timing</th></tr></thead>';
  const tbody = document.createElement('tbody');
  for (const rec of list.slice(0,40)){
    const ev = rec.ev;
    const tr = document.createElement('tr');
    const effect = ev.type === 'insider'
      ? (ev.mu >= 0 ? 'Bullish Tip' : 'Bearish Tip')
      : `Bias ${ev.mu>=0?'+':''}${(ev.mu*10000).toFixed(0)}bp, Demand ${ev.demand>=0?'+':''}${(ev.demand*100).toFixed(1)}%, Vol ${ev.sigma>=0?'+':''}${(ev.sigma*100).toFixed(1)}%`;
    tr.innerHTML = `
      <td>${rec.when}</td>
      <td>${ev.scope==='global'?'GLOBAL: ':''}${ev.title}</td>
      <td>${ev.type}</td>
      <td>${ev.severity}</td>
      <td>${effect}</td>
      <td>${ev.timing || 'multi‑day'}</td>`;
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  cont.appendChild(table);
}

