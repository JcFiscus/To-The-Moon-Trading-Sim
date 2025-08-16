import { renderMarket } from './table.js';
import { renderChart, updateDetails } from './chart.js';
import { renderNews } from './newsGlobal.js';
import { renderPortfolio } from './portfolio.js';
import { renderHUD } from './hud.js';
import { getState } from '../core/state.js';

export function initUI({ start, save, reset }) {
  const app = document.getElementById('app');
  app.innerHTML = `
    <header id="hud" class="hud panel"></header>
    <main id="layout" class="layout">
      <aside id="col-left" class="panel col-left" aria-label="Market">
        <div class="market-header row">
          <div class="mini">10‑second days • After‑hours news drives tomorrow</div>
          <div class="row">
            <button id="startBtn" class="accent" aria-label="Start day">▶ Start Day</button>
            <button id="saveBtn" aria-label="Save game">Save</button>
            <button id="resetBtn" class="bad" aria-label="Hard reset game">Hard Reset</button>
          </div>
        </div>
        <div id="market-root"></div>
      </aside>
      <section id="col-center" class="panel col-center" aria-label="Chart and details">
        <div id="chart-root" class="chart-root"></div>
        <div id="details-root" class="details-root" aria-live="polite"></div>
      </section>
      <aside id="col-right" class="panel col-right" aria-label="Portfolio and news">
        <div id="portfolio-root" class="right-card"></div>
        <div id="news-root" class="right-card"></div>
      </aside>
    </main>
  `;

  const state = getState();

  const onSelect = (sym) => {
    state.selected = sym;
    renderChart(document.getElementById('chart-root'), sym);
    updateDetails(document.getElementById('details-root'), sym);
    renderNews(document.getElementById('news-root'), { filter: sym });
  };

  const market = renderMarket(document.getElementById('market-root'), state, { onSelect });

  const first = state.assets[0]?.sym;
  if (first) {
    onSelect(first);
  }

  renderPortfolio(document.getElementById('portfolio-root'), state);
  renderNews(document.getElementById('news-root'), { limit: 6 });
  renderHUD(state);

  document.getElementById('startBtn')?.addEventListener('click', start);
  document.getElementById('saveBtn')?.addEventListener('click', save);
  document.getElementById('resetBtn')?.addEventListener('click', reset);

  function renderAll() {
    renderHUD(state);
    renderPortfolio(document.getElementById('portfolio-root'), state);
    market.update();
  }

  return { renderAll, toast: () => {} };
}
