import { initToaster } from './toast.js';
import { buildMarketTable, renderMarketTable } from './table.js';
import { drawChart } from './chart.js';
import { renderInsight } from './insight.js';
import { renderAssetNewsTable, initNewsControls } from './newsAssets.js';
import { renderHUD } from './hud.js';
import { initRiskTools } from './risktools.js';
import { renderPortfolio } from './portfolio.js';
import { renderUpgrades } from './upgrades.js';
import { buy, sell } from '../core/trading.js';
import { buyOption } from '../core/options.js';
import { showHelp } from './modal.js';

export function initUI(ctx, handlers) {
  const { start, save, reset } = handlers;
  const toast = initToaster();
  const log = msg => console.log(msg);

  function rebuildMarketTable() {
    buildMarketTable({
      tbody: document.getElementById('tbody'),
      assets: ctx.assets,
      state: ctx.state,
      onSelect: sym => {
        ctx.selected = sym;
        document.getElementById('chartTitle').textContent = `${sym} — ${ctx.assets.find(a => a.sym === sym).name}`;
        renderAll();
      },
      onBuy: (sym, qty, lev) => {
        buy(ctx, sym, qty, { leverage: lev, log });
        renderAll();
      },
      onSell: (sym, qty, lev) => {
        sell(ctx, sym, qty, { leverage: lev, log });
        renderAll();
      },
      onOption: (sym, opt) => {
        buyOption(ctx, sym, opt.type, opt.strike, opt.dte, opt.qty, { log });
        renderAll();
      }
    });
  }
  ctx.rebuildMarketTable = rebuildMarketTable;
  rebuildMarketTable();

  const tabs = document.createElement('div');
  tabs.id = 'marketTabs';
  tabs.className = 'row tabs';
  const card = document.querySelector('.market-col .card');
  card.insertBefore(tabs, document.getElementById('marketTable'));

  function renderTabs() {
    tabs.innerHTML = '';
    const mk = (id, label) => {
      const btn = document.createElement('button');
      btn.textContent = label;
      if (ctx.marketTab === id) btn.classList.add('accent');
      btn.addEventListener('click', () => {
        ctx.marketTab = id;
        renderMarketTable(ctx);
        renderTabs();
      });
      return btn;
    };
    tabs.appendChild(mk('stocks', 'Stocks'));
    if (ctx.state.upgrades.crypto) tabs.appendChild(mk('crypto', 'Crypto'));
  }
  ctx.renderMarketTabs = renderTabs;
  renderTabs();

  initNewsControls(ctx);

  ctx.chartMode = 'line';
  document.getElementById('chartToggle').addEventListener('click', () => {
    ctx.chartMode = ctx.chartMode === 'line' ? 'candles' : 'line';
    document.getElementById('chartToggle').textContent = ctx.chartMode === 'line' ? 'Candles' : 'Line';
    drawChart(ctx);
  });

  const contrastBtn = document.getElementById('contrastBtn');
  if (contrastBtn) {
    const stored = localStorage.getItem('ttm_contrast') === '1';
    if (stored) document.body.classList.add('high-contrast');
    contrastBtn.setAttribute('aria-pressed', stored);
    contrastBtn.addEventListener('click', () => {
      const on = document.body.classList.toggle('high-contrast');
      contrastBtn.setAttribute('aria-pressed', on);
      localStorage.setItem('ttm_contrast', on ? '1' : '0');
    });
  }

  document.getElementById('startBtn').addEventListener('click', start);
  document.getElementById('saveBtn').addEventListener('click', save);
  document.getElementById('helpBtn').addEventListener('click', showHelp);
  document.getElementById('resetBtn').addEventListener('click', reset);

  initRiskTools(document.getElementById('riskTools'), ctx, toast);

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

  document.getElementById('chartTitle').textContent = `${ctx.selected} — ${ctx.assets.find(a => a.sym === ctx.selected).name}`;
  return { renderAll, toast };
}
