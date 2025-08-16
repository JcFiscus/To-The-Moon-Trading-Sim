import { initToaster } from './toast.js';
import { buildMarketTable, renderMarketTable } from './table.js';
import { drawChart, initChart } from './chart.js';
import { renderInsight } from './insight.js';
import { renderAssetNewsTable, initNewsControls } from './newsAssets.js';
import { renderHUD } from './hud.js';
import { initRiskTools } from './risktools.js';
import { renderPortfolio } from './portfolio.js';
import { renderUpgrades } from './upgrades.js';
import { buy, sell } from '../core/trading.js';
import { showHelp } from './modal.js';
import { renderDebug } from './debug.js';

export function initUI(ctx, handlers) {
  const { start, save, reset } = handlers;
  const toast = initToaster();
  const log = msg => console.log(msg);

  function rebuildMarketTable() {
    const assets = ctx.assets.filter(a => ctx.marketTab === 'crypto' ? a.isCrypto && ctx.state.upgrades.crypto : !a.isCrypto);
    buildMarketTable({
      table: document.getElementById('marketTable'),
      assets,
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
      }
    });
  }
  ctx.rebuildMarketTable = rebuildMarketTable;
  rebuildMarketTable();

  const tabs = document.createElement('div');
  tabs.id = 'marketTabs';
  tabs.className = 'row tabs';
  tabs.setAttribute('role', 'tablist');
  const panel = document.querySelector('.market-col .panel');
  panel.insertBefore(tabs, document.getElementById('marketTable'));

  function renderTabs() {
    tabs.innerHTML = '';
    const mk = (id, label) => {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.setAttribute('role', 'tab');
      btn.id = `tab-${id}`;
      btn.setAttribute('aria-controls', 'marketTable');
      btn.setAttribute('aria-selected', ctx.marketTab === id);
      if (ctx.marketTab === id) btn.classList.add('accent');
      btn.addEventListener('click', () => {
        ctx.marketTab = id;
        rebuildMarketTable();
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
  ctx.chartInterval = 'hour';
  initChart(ctx);
  const chartToggle = document.getElementById('chartToggle');
  chartToggle.setAttribute('aria-pressed', false);
  chartToggle.addEventListener('click', () => {
    ctx.chartMode = ctx.chartMode === 'line' ? 'candles' : 'line';
    chartToggle.textContent = ctx.chartMode === 'line' ? 'Candles' : 'Line';
    chartToggle.setAttribute('aria-pressed', ctx.chartMode === 'candles');
    drawChart(ctx);
  });

  const intervalBtns = document.querySelectorAll('#chartIntervals button');
  intervalBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      ctx.chartInterval = btn.dataset.interval;
      intervalBtns.forEach(b => b.setAttribute('aria-pressed', b === btn));
      autoScaleChart();
      drawChart(ctx);
    });
  });

  const zoomSlider = document.getElementById('chartZoomRange');
  if (zoomSlider) {
    zoomSlider.addEventListener('input', () => {
      ctx.chartZoom = parseFloat(zoomSlider.value);
      drawChart(ctx);
    });
  }

  function autoScaleChart(){
    ctx.chartZoom = 1;
    ctx.chartOffset = 0;
    if (zoomSlider) zoomSlider.value = ctx.chartZoom;
  }
  autoScaleChart();

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

  const debugBtn = document.getElementById('debugBtn');
  if (debugBtn) {
    debugBtn.setAttribute('aria-pressed', ctx.state.ui.debug);
    debugBtn.addEventListener('click', () => {
      ctx.state.ui.debug = !ctx.state.ui.debug;
      debugBtn.setAttribute('aria-pressed', ctx.state.ui.debug);
      renderDebug(ctx);
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
    ctx.renderRiskStats?.();
    renderDebug(ctx);
  }
  ctx.renderAll = renderAll;

  document.getElementById('chartTitle').textContent = `${ctx.selected} — ${ctx.assets.find(a => a.sym === ctx.selected).name}`;
  return { renderAll, toast };
}
