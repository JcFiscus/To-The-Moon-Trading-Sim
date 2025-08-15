import { fmt } from '../util/format.js';
import { clamp } from '../util/math.js';

const last = {};

function portfolioValue(ctx) {
  let v = 0;
  for (const a of ctx.assets) v += (ctx.state.positions[a.sym] || 0) * a.price;
  for (const m of ctx.state.marginPositions) {
    const a = ctx.assets.find(x => x.sym === m.sym);
    if (a) v += m.qty * a.price;
  }
  return v;
}

function netWorth(ctx, pv) { return ctx.state.cash + pv - ctx.state.debt; }

function updatePill(id, val, formatter) {
  const el = document.getElementById(id);
  if (!el) return;
  const prev = last[id];
  el.textContent = formatter(val);
  el.classList.remove('up', 'down');
  if (prev !== undefined) {
    if (val > prev) el.classList.add('up');
    else if (val < prev) el.classList.add('down');
  }
  last[id] = val;
}

export function renderHUD(ctx) {
  document.getElementById('dayNum').textContent = ctx.day.idx;
  document.getElementById('dayTimer').textContent = ctx.day.active
    ? String(ctx.day.ticksLeft).padStart(2, '0') + 's'
    : '\u2014s';

  const assets = portfolioValue(ctx);
  const net = netWorth(ctx, assets);

  updatePill('cash', ctx.state.cash, fmt);
  updatePill('debt', ctx.state.debt, fmt);
  updatePill('assets', assets, fmt);
  updatePill('net', net, fmt);

  const riskPct = clamp((ctx.market.risk - 0.05) / 1.15 * 100, 0, 100);
  updatePill('riskPct', riskPct, v => Math.round(v) + '%');
}
