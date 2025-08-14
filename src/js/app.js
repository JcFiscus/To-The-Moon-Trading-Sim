import { CFG, ASSET_DEFS } from './config.js';
import { createRNG } from './util/rng.js';
import { fmt, pct } from './util/format.js';
import { clamp } from './util/math.js';

import { createInitialState } from './core/state.js';
import { startDay, stepTick, endDay, enqueueAfterHours } from './core/cycle.js';
import { computeAnalyst } from './core/priceModel.js';

import { initToaster } from './ui/toast.js';
import { initGlobalFeed } from './ui/newsGlobal.js';
import { buildMarketTable, renderMarketTable } from './ui/table.js';
import { drawChart } from './ui/chart.js';
import { renderInsight } from './ui/insight.js';

const toast = initToaster();
const { log } = initGlobalFeed(document.getElementById('feed'));

const seed = Number(localStorage.getItem('ttm_seed') || Date.now());
localStorage.setItem('ttm_seed', String(seed));
const rng = createRNG(seed);

// Engine state
const ctx = createInitialState(ASSET_DEFS);

// selection + DOM refs
ctx.selected = ctx.assets[0].sym;
document.getElementById('chartTitle').textContent =
  `${ctx.selected} — ${ctx.assets.find(a => a.sym === ctx.selected).name}`;

// Build table with handlers
buildMarketTable({
  tbody: document.getElementById('tbody'),
  assets: ctx.assets,
  state: ctx.state,
  onSelect: (sym) => {
    ctx.selected = sym;
    document.getElementById('chartTitle').textContent =
      `${sym} — ${ctx.assets.find(a => a.sym === sym).name}`;
    renderAll();
  },
  onBuy: (sym, qty) => {
    // minimalist trading: use cash + simple debt, no margin for baseline
    const a = ctx.assets.find(x => x.sym === sym);
    qty = Math.max(1, Math.floor(qty));
    const price = a.price;
    const fee = Math.max(ctx.state.minFee, qty * price * ctx.state.feeRate);
    const cost = qty * price + fee;

    if (ctx.state.cash >= cost) {
      ctx.state.cash -= cost;
    } else {
      const short = cost - ctx.state.cash;
      ctx.state.cash = 0;
      ctx.state.debt += short;
    }
    ctx.state.positions[sym] = (ctx.state.positions[sym] || 0) + qty;

    // player impact & demand impulse
    const share = qty / a.supply;
    a.localDemand = clamp(a.localDemand + share * CFG.DEMAND_IMPULSE_SCALE, 0.5, 2.5);
    a.flowToday += qty;

    log(`Bought ${qty} ${sym} @ ${fmt(price)} (+fee ${fmt(fee)})`);
    renderAll();
  },
  onSell: (sym, qty) => {
    const a = ctx.assets.find(x => x.sym === sym);
    qty = Math.max(1, Math.floor(qty));
    const have = ctx.state.positions[sym] || 0;
    const sell = Math.min(have, qty);
    if (!sell) { log(`Cannot sell ${qty} ${sym}: no holdings`); return; }
    const proceeds = sell * a.price;
    const fee = Math.max(ctx.state.minFee, sell * a.price * ctx.state.feeRate);
    ctx.state.positions[sym] = have - sell;
    const net = Math.max(0, proceeds - fee);
    // auto-pay debt first
    const pay = Math.min(ctx.state.debt, net);
    ctx.state.debt -= pay; ctx.state.cash += (net - pay);

    // impact
    const share = sell / a.supply;
    a.localDemand = clamp(a.localDemand - share * 0.5, 0.5, 2.5);
    a.flowToday -= sell;

    log(`Sold ${sell} ${sym} @ ${fmt(a.price)} (-fee ${fmt(fee)})`);
    renderAll();
  }
});

// control buttons
document.getElementById('startBtn').addEventListener('click', () => start());
document.getElementById('saveBtn').addEventListener('click', () => {
  localStorage.setItem('ttm_save', JSON.stringify({
    version: 6, state: ctx.state, market: ctx.market,
    assets: ctx.assets.map(a => ({
      ...a,
      history: a.history.slice(-700)
    }))
  }));
  log('Save complete.');
});
document.getElementById('resetBtn').addEventListener('click', () => {
  if (!confirm('Hard reset?')) return;
  localStorage.removeItem('ttm_save');
  location.reload();
});

// load if present
try {
  const raw = localStorage.getItem('ttm_save');
  if (raw) {
    const s = JSON.parse(raw);
    Object.assign(ctx.state, s.state || {});
    Object.assign(ctx.market, s.market || {});
    // merge assets by sym
    for (const a of ctx.assets) {
      const m = (s.assets || []).find(x => x.sym === a.sym);
      if (!m) continue;
      Object.assign(a, m);
      a.history = Array.isArray(m.history) && m.history.length ? m.history : a.history;
    }
    log('Save loaded.');
  }
} catch { /* ignore */ }

// tick loop
let interval = null;
function start() {
  if (ctx.day.active) return;
  startDay(ctx, CFG, { log, toast });

  // recompute analyst (fresh after outlook)
  for (const a of ctx.assets) a.analyst = computeAnalyst(a, ctx.market, CFG);

  renderAll();
  interval = setInterval(() => {
    stepTick(ctx, CFG, rng, { log, toast });
    renderAll();
    if (ctx.day.ticksLeft <= 0) {
      clearInterval(interval); interval = null;
      const summary = endDay(ctx, CFG, { log, toast });
      // queue after-hours for tomorrow (already inside endDay), but we also show global risk/demand
      enqueueAfterHours(ctx, CFG, rng, { log, toast });
      // render once more to show fresh outlook tags in insight (tomorrow's view will appear next start)
      renderAll();
    }
  }, 1000);
}

// rendering
function portfolioValue() {
  let v = 0;
  for (const a of ctx.assets) v += (ctx.state.positions[a.sym] || 0) * a.price;
  return v;
}
function netWorth() {
  return ctx.state.cash + portfolioValue() - ctx.state.debt;
}
function renderHUD() {
  document.getElementById('dayNum').textContent = ctx.day.idx;
  document.getElementById('dayTimer').textContent = ctx.day.active ? String(ctx.day.ticksLeft).padStart(2, '0') + 's' : '—s';
  document.getElementById('cash').textContent = fmt(ctx.state.cash);
  document.getElementById('debt').textContent = fmt(ctx.state.debt);
  document.getElementById('assets').textContent = fmt(portfolioValue());
  document.getElementById('net').textContent = fmt(netWorth());
  document.getElementById('globalRisk').textContent = (ctx.market.risk * 100).toFixed(0) + '%';
  document.getElementById('globalDemand').textContent = ctx.market.demand.toFixed(2);
  const riskPct = clamp((ctx.market.risk - 0.05) / 1.15 * 100, 0, 100);
  document.getElementById('riskPct').textContent = Math.round(riskPct) + '%';
}
function renderAll() {
  renderHUD();
  renderMarketTable(ctx);
  drawChart(ctx);
  renderInsight(ctx);
}

// initial render
document.getElementById('chartTitle').textContent =
  `${ctx.selected} — ${ctx.assets.find(a => a.sym === ctx.selected).name}`;
renderAll();
toast('<b>Modular v6 baseline loaded</b>: per‑asset outlook, analyst, and event‑driven prices.', 'neutral');
