import { getState } from '../core/state.js';
import { fmt } from '../util/format.js';

export function renderChart(root, sym) {
  root.innerHTML = `<canvas id="chart-canvas" aria-label="Price chart for ${sym}"></canvas>`;
}

export function updateDetails(root, sym) {
  const ctx = getState();
  const a = ctx.assets.find(x => x.sym === sym);
  if (!a) return;
  root.innerHTML = `
    <div class="details-grid">
      <div><label>Supply</label><b>${a.supply.toLocaleString()}</b></div>
      <div><label>Market Cap</label><b>${fmt(a.price * a.supply)}</b></div>
      <div><label>Fair Value</label><b>${fmt(a.fair)}</b></div>
      <div><label>Local Demand</label><b>${a.localDemand.toFixed(2)}</b></div>
      <div><label>Tomorrow (μ ± σ)</label><b>${(a.outlook?.mu || 0)} ± ${(a.outlook?.sigma || 0)}</b></div>
      <div><label>Expected Open Gap</label><b>${(a.outlook?.gap || 0)}</b></div>
    </div>
  `;
}
