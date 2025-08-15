let showMajorOnly = false;

export function initNewsControls(ctx){
  const collapseBtn = document.getElementById('newsCollapse');
  const majorBtn = document.getElementById('majorOnly');
  const panel = document.getElementById('newsPanel');
  collapseBtn.addEventListener('click', () => {
    const collapsed = panel.classList.toggle('collapsed');
    collapseBtn.textContent = collapsed ? 'Expand' : 'Collapse';
  });
  majorBtn.addEventListener('click', () => {
    showMajorOnly = !showMajorOnly;
    majorBtn.classList.toggle('accent', showMajorOnly);
    renderAssetNewsTable(ctx);
  });
}

export function renderAssetNewsTable(ctx){
  const a = ctx.assets.find(x => x.sym === ctx.selected) || ctx.assets[0];
  document.getElementById('newsSymbol').textContent = `${a.sym} — ${a.name}`;
  const cont = document.getElementById('newsTable');
  let list = (ctx.newsByAsset && ctx.newsByAsset[a.sym]) || [];
  list = list.filter(rec => !rec.ev.requires || rec.ev.requires.every(id => ctx.state.upgrades[id]));
  if (showMajorOnly) list = list.filter(rec => rec.ev.severity === 'major');
  cont.innerHTML = '';
  if (!list.length){
    cont.innerHTML = `<div class="mini">No recent news for ${a.sym}.</div>`;
    return;
  }

  const table = document.createElement('table');
  table.innerHTML = '<thead><tr><th>When</th><th></th><th>Title</th><th>Type</th><th>Severity</th><th>Effect</th><th>Timing</th></tr></thead>';
  const tbody = document.createElement('tbody');
  for (const rec of list.slice(0,40)){
    const ev = rec.ev;
    const tr = document.createElement('tr');
    if (ev.severity === 'major') tr.classList.add('major');
    const scopeIcon = ev.scope === 'global' ? '🌐' : '📈';
    const scopeCls = ev.scope === 'global' ? 'global' : 'asset';
    const effect = ev.type === 'insider'
      ? (ev.mu >= 0 ? 'Bullish Tip' : 'Bearish Tip')
      : `Bias ${ev.mu>=0?'+':''}${(ev.mu*10000).toFixed(0)}bp, Demand ${ev.demand>=0?'+':''}${(ev.demand*100).toFixed(1)}%, Vol${ev.sigma>=0?'+':''}${(ev.sigma*100).toFixed(1)}%`;
    tr.innerHTML = `
      <td>${rec.when}</td>
      <td class="scope ${scopeCls}">${scopeIcon}</td>
      <td>${ev.title}</td>
      <td>${ev.type}</td>
      <td>${ev.severity}</td>
      <td>${effect}</td>
      <td>${ev.timing || 'multi‑day'}</td>`;
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  cont.appendChild(table);
}

