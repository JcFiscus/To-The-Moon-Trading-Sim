import { CFG, ASSET_DEFS } from './config.js';
import { createRNG } from './util/rng.js';

import { createInitialState } from './core/state.js';
import { startDay, stepTick, endDay, enqueueAfterHours } from './core/cycle.js';
import { computeAnalyst } from './core/priceModel.js';
import { buy, sell } from './core/trading.js';
import { buyOption } from './core/options.js';
import { evaluateRisk } from './core/risk.js';
import { save as saveGame, load as loadGame, SAVE_VERSION } from './core/persist.js';

import { initToaster } from './ui/toast.js';
import { buildMarketTable, renderMarketTable } from './ui/table.js';
import { drawChart } from './ui/chart.js';
import { renderInsight } from './ui/insight.js';
import { renderAssetNewsTable, initNewsControls } from './ui/newsAssets.js';
import { showSummary, showGameOver } from './ui/modal.js';
import { initRiskTools } from './ui/risktools.js';
import { renderPortfolio } from './ui/portfolio.js';
import { renderUpgrades } from './ui/upgrades.js';
import { renderHUD } from './ui/hud.js';

const toast = initToaster();
const log = (msg)=>console.log(msg);

// PRNG seed
const seed = Number(localStorage.getItem('ttm_seed') || Date.now());
localStorage.setItem('ttm_seed', String(seed));
const rng = createRNG(seed);

// Engine state
const ctx = createInitialState(ASSET_DEFS);
ctx.selected = ctx.assets.find(a => !a.isCrypto)?.sym || ctx.assets[0].sym;
ctx.marketTab = 'stocks';
document.getElementById('chartTitle').textContent =
  `${ctx.selected} — ${ctx.assets.find(a => a.sym === ctx.selected).name}`;

// Build market table with modular trading
  function rebuildMarketTable(){
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
      onBuy: (sym, qty, lev) => { buy(ctx, sym, qty, { leverage: lev, log }); renderAll(); },
      onSell: (sym, qty, lev) => { sell(ctx, sym, qty, { leverage: lev, log }); renderAll(); },
      onOption: (sym, opt) => { buyOption(ctx, sym, opt.type, opt.strike, opt.dte, opt.qty, { log }); renderAll(); }
    });
  }
  ctx.rebuildMarketTable = rebuildMarketTable;
  rebuildMarketTable();

  const tabs = document.createElement('div');
  tabs.id = 'marketTabs';
  tabs.className = 'row tabs';
  const card = document.querySelector('.market-col .card');
  card.insertBefore(tabs, document.getElementById('marketTable'));

  function renderTabs(){
    tabs.innerHTML = '';
    const mk = (id,label)=>{
      const btn = document.createElement('button');
      btn.textContent = label;
      if (ctx.marketTab === id) btn.classList.add('accent');
      btn.addEventListener('click', ()=>{ ctx.marketTab = id; renderMarketTable(ctx); renderTabs(); });
      return btn;
    };
    tabs.appendChild(mk('stocks','Stocks'));
    if (ctx.state.upgrades.crypto) tabs.appendChild(mk('crypto','Crypto'));
  }
  ctx.renderMarketTabs = renderTabs;
  renderTabs();

  initNewsControls(ctx);

// Chart type toggle
ctx.chartMode = 'line';
document.getElementById('chartToggle').addEventListener('click', () => {
  ctx.chartMode = ctx.chartMode === 'line' ? 'candles' : 'line';
  document.getElementById('chartToggle').textContent = ctx.chartMode === 'line' ? 'Candles' : 'Line';
  drawChart(ctx);
});

// Controls
document.getElementById('startBtn').addEventListener('click', () => start());
document.getElementById('saveBtn').addEventListener('click', () => {
  saveGame(ctx.state, ctx.market, ctx.assets, SAVE_VERSION);
  log('Save complete.');
});
document.getElementById('resetBtn').addEventListener('click', () => {
  if (!confirm('Hard reset?')) return;
  localStorage.removeItem('ttm_save');
  location.reload();
});

// Load if present
if (loadGame(ctx, SAVE_VERSION)) log('Save loaded.');

// Risk Tools UI
initRiskTools(document.getElementById('riskTools'), ctx, toast);

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
    if (ctx.gameOver) {
      clearInterval(interval); interval = null;
      renderAll();
      showGameOver(() => {
        document.getElementById('overlay').style.display = 'none';
        localStorage.removeItem('ttm_save');
        location.reload();
      });
      return;
    }
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

      if (summary.gameOver || ctx.gameOver) {
        showGameOver(() => {
          document.getElementById('overlay').style.display = 'none';
          localStorage.removeItem('ttm_save');
          location.reload();
        });
      } else {
        // Show summary modal; allow Start Next Day directly
        showSummary(summary, () => {
          document.getElementById('overlay').style.display = 'none';
          start();
        });
      }
    }
  }, 1000);
}

function renderAll() {
  renderHUD(ctx);
  renderMarketTable(ctx);
  drawChart(ctx);
  renderInsight(ctx);
  renderAssetNewsTable(ctx);
  renderPortfolio(ctx);
  renderUpgrades(ctx, toast);
  ctx.renderMarketTabs();
}
ctx.renderAll = renderAll;

// Initial render
document.getElementById('chartTitle').textContent =
  `${ctx.selected} — ${ctx.assets.find(a => a.sym === ctx.selected).name}`;
renderAll();
toast('<b>Summary + Auto‑Risk enabled</b>. Configure risk rules on the right; summary appears at each close.', 'neutral');
