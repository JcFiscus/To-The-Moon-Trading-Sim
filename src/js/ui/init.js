import { initToaster } from './toast.js';
import { renderHUD } from './hud.js';
import { renderMarket } from './table.js';
import { renderChart, updateDetails } from './chart.js';
import { renderNews } from './newsGlobal.js';
import { renderPortfolio } from './portfolio.js';

// Mount single-screen layout and wire basic renderers
export function initUI(ctx, handlers = {}) {
  const app = document.getElementById('app');
  app.innerHTML = `
    <header id="hud" class="hud panel"></header>
    <main id="layout" class="layout">
      <aside id="col-left" class="panel col-left" aria-label="Market"></aside>
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

  const toast = initToaster();
  renderHUD(ctx);

  const onSelect = sym => {
    const chartRoot = document.getElementById('chart-root');
    const detailsRoot = document.getElementById('details-root');
    const newsRoot = document.getElementById('news-root');
    renderChart(chartRoot, ctx, sym);
    updateDetails(detailsRoot, ctx, sym);
    renderNews(newsRoot, ctx, { filter: sym });
  };

  renderMarket(document.getElementById('col-left'), ctx, { onSelect });

  const first = ctx.assets[0]?.sym;
  if (first) onSelect(first);

  const portfolioRoot = document.getElementById('portfolio-root');
  renderPortfolio(portfolioRoot, ctx);
  renderNews(document.getElementById('news-root'), ctx, { limit: 6 });

  const renderAll = () => {
    renderHUD(ctx);
    renderPortfolio(portfolioRoot, ctx);
  };

  return { renderAll, toast };
}
