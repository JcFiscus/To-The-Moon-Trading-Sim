export function renderDebug(ctx){
  const panel = document.getElementById('debugPanel');
  if (!panel) return;
  if (!ctx.state.ui?.debug){
    panel.style.display = 'none';
    return;
  }
  panel.style.display = 'block';
  const sym = ctx.selected;
  const lastRule = ctx.riskTrack[sym]?.lastRule || '—';
  const ev = ctx.lastEvent[sym];
  const evTitle = ev ? ev.title : '—';
  panel.innerHTML = `<div class="mini">Last Auto‑Risk: ${lastRule}</div>` +
    `<div class="mini">Last Event: ${evTitle}</div>`;
}
