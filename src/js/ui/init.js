import { initToaster } from './toast.js';
import { buildMarketTable, renderMarketTable } from './table.js';
import { drawChart, initChart } from './chart.js';
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

  function mountLayout() {
    document.getElementById('hud').innerHTML = `
      <div class="brand">🛰️ To‑The‑Moon <small id="version"></small></div>
      <div class="stats">
        <div class="pill"><span class="label">Day</span> <b id="dayNum">0</b> • <span class="kbd" id="dayTimer">—s</span></div>
        <div class="pill"><span class="label">Cash</span> <b id="cash">$0.00</b></div>
        <div class="pill"><span class="label">Debt</span> <b id="debt">$0.00</b></div>
        <div class="pill"><span class="label">Assets</span> <b id="assets">$0.00</b></div>
        <div class="pill"><span class="label">Net</span> <b id="net">$0.00</b></div>
        <div class="pill"><span class="label">Risk</span> <b id="riskPct">0%</b></div>
      </div>`;

    document.getElementById('market').innerHTML = `
      <div class="market-header row">
        <div class="mini">10‑second days • After‑hours news drives tomorrow</div>
        <div class="row">
          <button id="startBtn" class="accent" aria-label="Start day">▶ Start Day</button>
          <button id="saveBtn" aria-label="Save game">Save</button>
          <button id="helpBtn" aria-label="Help">Help</button>
          <button id="contrastBtn" aria-label="Toggle high contrast mode" aria-pressed="false">Contrast</button>
          <button id="debugBtn" aria-label="Toggle debug info" aria-pressed="false">Debug</button>
          <button id="resetBtn" class="bad" aria-label="Hard reset game">Hard Reset</button>
        </div>
      </div>
      <table id="marketTable" aria-label="Market data table"></table>`;

    document.getElementById('panel-chart').innerHTML = `
      <div class="row" style="justify-content:space-between;">
        <div class="row" style="align-items:center;">
          <span>Chart: <b id="chartTitle"></b></span>
          <button id="chartToggle" aria-label="Toggle chart type">Candles</button>
          <div id="chartIntervals" class="row">
            <button class="chip-btn" data-interval="hour" aria-pressed="true">1H</button>
            <button class="chip-btn" data-interval="day" aria-pressed="false">1D</button>
            <button class="chip-btn" data-interval="week" aria-pressed="false">1W</button>
            <button class="chip-btn" data-interval="month" aria-pressed="false">1M</button>
          </div>
          <input type="range" id="chartZoomRange" min="1" max="100" value="1" aria-label="Chart zoom" />
        </div>
        <div class="row">
          <span class="tag">Prev close = dashed</span>
          <span class="tag">Boundaries = day ends</span>
        </div>
      </div>
      <div class="chart-wrap"><canvas id="chart" width="820" height="300" role="img" aria-label="Asset price chart"></canvas><div id="chartTooltip" class="chart-tooltip" role="tooltip"></div></div>
      <div class="statgrid" id="chartStats"></div>`;

    document.getElementById('panel-news').innerHTML = `
      <div class="row" style="justify-content:space-between;">
        <div>News & Events — <b id="newsSymbol"></b></div>
        <div class="row" style="align-items:center;">
          <div class="mini">Follow the selected asset</div>
          <button id="majorOnly" class="chip-btn" aria-pressed="false" aria-label="Show major news only">Major</button>
          <button id="newsCollapse" class="chip-btn" aria-label="Collapse news panel" aria-expanded="true">Collapse</button>
        </div>
      </div>
      <div id="newsPanel">
        <div id="newsScroll"><div id="newsTable"></div></div>
      </div>`;
  }
  mountLayout();

  const detailTabs = document.querySelectorAll('#details [role=tab]');
  detailTabs.forEach(btn => {
    btn.addEventListener('click', () => {
      detailTabs.forEach(b => {
        const on = b === btn;
        b.setAttribute('aria-selected', String(on));
        const panel = document.getElementById(`panel-${b.dataset.tab}`);
        if (panel) panel.hidden = !on;
      });
    });
  });

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
  tabs.className = 'row market-tabs';
  tabs.setAttribute('role', 'tablist');
  const panel = document.getElementById('market');
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

  initRiskTools(document.getElementById('panel-risk'), ctx, toast);

  function renderAll() {
    renderHUD(ctx);
    renderMarketTable(ctx);
    drawChart(ctx);
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
