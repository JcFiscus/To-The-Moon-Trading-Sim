import { CFG } from '../config.js';

export function renderInsight(ctx) {
  const a = ctx.assets.find(x => x.sym === ctx.selected) || ctx.assets[0];
  const summaryEl = document.getElementById('analystLine');
  const upcomingEl = document.getElementById('assetNews');

  const tone = a.analyst?.tone || 'Neutral';
  const cls = a.analyst?.cls || 'neu';
  const conf = Math.round((a.analyst?.conf || 0.5) * 100);
  const od = a.outlookDetail || { gMu: 0, evMu: 0, evDem: 0, valuation: 0, streakMR: 0, demandTerm: 0 };
  const eventCount = (ctx.market.tomorrow || []).filter(ev => ev.scope === 'global' || ev.sym === a.sym).length;
  const netBias = (od.evMu || 0) * CFG.DAY_TICKS * 100;

  summaryEl.innerHTML = `Analyst: <span class="analyst ${cls}">${tone}</span> • Conf: ${conf}% • Next: ${(netBias >= 0 ? '+' : '')}${netBias.toFixed(1)}% bias (${eventCount} events)`;

  if (ctx.state.insiderTip && ctx.state.insiderTip.sym === a.sym && ctx.state.insiderTip.daysLeft > 0) {
    const tip = ctx.state.insiderTip;
    const tipLine = document.createElement('div');
    tipLine.className = 'mini';
    tipLine.textContent = `Tip active: ${(tip.mu >= 0 ? '+' : '')}${(tip.mu * 10000).toFixed(0)}bp, ${(tip.sigma >= 0 ? '+' : '')}${(tip.sigma * 100).toFixed(1)}% σ (${tip.daysLeft}d left)`;
    summaryEl.appendChild(tipLine);
  }

  const list = (ctx.newsByAsset && ctx.newsByAsset[a.sym]) || [];
  const filtered = list.filter(rec => !rec.ev.requires || rec.ev.requires.every(id => ctx.state.upgrades[id]));
  upcomingEl.innerHTML = '';

  const renderItems = items => {
    for (const rec of items) {
      const ev = rec.ev;
      const div = document.createElement('div');
      div.className = 'news-item';
      const bias = (ev.mu + ev.demand) * 100;
      const badge = document.createElement('span');
      badge.className = 'chip ' + (bias >= 0 ? 'pos' : 'neg');
      badge.textContent = `${bias >= 0 ? '+' : ''}${bias.toFixed(1)}%`;
      div.innerHTML = `<span>${rec.when}</span> • <span>${ev.title}</span> • `;
      div.appendChild(badge);
      upcomingEl.appendChild(div);
    }
  };

  const top = filtered.slice(0, 3);
  renderItems(top);

  if (filtered.length > 3) {
    const moreBtn = document.createElement('button');
    moreBtn.className = 'chip-btn';
    moreBtn.textContent = 'More…';
    moreBtn.addEventListener('click', () => {
      renderItems(filtered.slice(3));
      moreBtn.remove();
    });
    upcomingEl.appendChild(moreBtn);
  }

  if (filtered.length === 0) {
    upcomingEl.innerHTML = '<div class="news-item mini">No recent asset‑specific news.</div>';
  }
}

