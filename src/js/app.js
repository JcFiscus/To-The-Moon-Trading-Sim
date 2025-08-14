import { CFG, ASSET_DEFS } from './config.js';
import { createRNG } from './util/rng.js';
import { fmt } from './util/format.js';
import { clamp } from './util/math.js';

import { createInitialState } from './core/state.js';
import { startDay, stepTick, endDay, enqueueAfterHours } from './core/cycle.js';
import { computeAnalyst } from './core/priceModel.js';
import { buy, sell } from './core/trading.js';
import { evaluateRisk } from './core/risk.js';

import { initToaster } from './ui/toast.js';
import { buildMarketTable, renderMarketTable } from './ui/table.js';
import { drawChart } from './ui/chart.js';
import { renderInsight } from './ui/insight.js';
import { renderAssetNewsTable } from './ui/newsAssets.js';
import { showSummary } from './ui/modal.js';
import { initRiskTools } from './ui/risktools.js';

const toast = initToaster();
const log = (msg)=>console.log(msg);

// PRNG seed
const seed = Number(localStorage.getItem('ttm_seed') || Date.now());
localStorage.setItem('ttm_seed', String(seed));
const rng = createRNG(seed);

// Engine state
const ctx = createInitialState(ASSET_DEFS);
ctx.selected = ctx.assets[0].sym;
document.getElementById('chartTitle').textContent =
  `${ctx.selected} — ${ctx.assets.find(a => a.sym === ctx.selected).name}`;

// Build market table with module trading
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
  onBuy: (sym, qty) => { buy(ctx, sym, qty, { log }); renderAll(); },
  onSell: (sym, qty) => { sell(ctx, sym, qty, { log }); renderAll(); }
});

// Controls
document.getElementById('startBtn').addEventListener('click', () => start());
document.getElementById('saveBtn').addEventListener('click', () => {
  localStorage.setItem('ttm_save', JSON.stringify({
    version: 6, state: ctx.state, market: ctx.market,
    assets: ctx.assets.map(a => ({ ...a, history: a.history.slice(-700) }))
  }));
  log('Save complete.');
});
document.getElementById('resetBtn').addEventListener('click', () => {
  if (!confirm('Hard reset?')) return;
  localStorage.removeItem('ttm_save');
  location.reload();
});

// Load if present
try {
  const raw = localStorage.getItem('ttm_save');
  if (raw) {
    const s = JSON.parse(raw);
    Object.assign(ctx.state, s.state || {});
    Object.assign(ctx.market, s.market || {});
    for (const a of ctx.assets) {
      const m = (s.assets || []).find(x => x.sym === a.sym);
      if (!m) continue;
      Object.assign(a, m);
      a.history = Array.isArray(m.history) && m.history.length ? m.history : a.history;
    }
    log('Save loaded.');
  }
} catch { /* ignore */ }

// Risk Tools UI
initRiskTools(document.getElementById('riskTools'), ctx);

// Tick loop
let interval = null;
function start() {
  if (ctx.day.active) return;
  startDay(ctx, CFG, { log, toast });

  // update analyst after outlook
  for (const a of ctx.assets) a.analyst = computeAnalyst(a, ctx.market, CFG);

  renderAll();
  interval = setInterval(() => {
    stepTick(ctx, CFG, rng, { log, toast });
    // Auto‑Risk after price update
    evaluateRisk(ctx, { log, toast });
    renderAll();

    if (ctx.day.ticksLeft <= 0) {
      clearInterval(interval); interval = null;
      // End day (streaks, flows, decay) and get summary rows/meta
      const summary = endDay(ctx, CFG, { log, toast });
      // Queue after‑hours for tomorrow (but they won't apply until next Start)
      enqueueAfterHours(ctx, CFG, rng, { log, toast });
      renderAll();

      // Show summary modal; allow Start Next Day directly
      showSummary(summary, () => {
        document.getElementById('overlay').style.display = 'none';
        start();
      });
    }
  }, 1000);
}

// Derived values
function portfolioValue() {
  let v = 0;
  for (const a of ctx.assets) v += (ctx.state.positions[a.sym] || 0) * a.price;
  return v;
}
function netWorth() { return ctx.state.cash + portfolioValue() - ctx.state.debt; }

function renderHUD() {
  document.getElementById('dayNum').textContent = ctx.day.idx;
  document.getElementById('dayTimer').textContent = ctx.day.active ? String(ctx.day.ticksLeft).padStart(2, '0') + 's' : '—s';
  document.getElementById('cash').textContent = fmt(ctx.state.cash);
  document.getElementById('debt').textContent = fmt(ctx.state.debt);
  document.getElementById('assets').textContent = fmt(portfolioValue());
  document.getElementById('net').textContent = fmt(netWorth());
  const riskPct = clamp((ctx.market.risk - 0.05) / 1.15 * 100, 0, 100);
  document.getElementById('riskPct').textContent = Math.round(riskPct) + '%';
}
function renderAll() {
  renderHUD();
  renderMarketTable(ctx);
  drawChart(ctx);
  renderInsight(ctx);
  renderAssetNewsTable(ctx);
}

// Initial render
document.getElementById('chartTitle').textContent =
  `${ctx.selected} — ${ctx.assets.find(a => a.sym === ctx.selected).name}`;
renderAll();
toast('<b>Summary + Auto‑Risk enabled</b>. Configure risk rules on the right; summary appears at each close.', 'neutral');
