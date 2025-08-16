import assert from 'assert';
import { drawChart } from '../ui/chart.js';
import { CFG } from '../config.js';

function setup(len, interval) {
  document.body.innerHTML = '<div id="parent"><canvas id="chart"></canvas></div><div id="chartTooltip"></div><div id="chartStats"></div>';
  const canvas = document.getElementById('chart');
  Object.defineProperty(canvas.parentElement, 'clientWidth', { value: 800 });
  Object.defineProperty(canvas.parentElement, 'clientHeight', { value: 300 });
  canvas.getContext = () => ({
    clearRect(){},
    fillText(){},
    beginPath(){},
    moveTo(){},
    lineTo(){},
    stroke(){},
    fillRect(){},
    setLineDash(){},
  });
  const history = Array.from({ length: len }, (_, i) => i + 1);
  const asset = { sym: 'AAA', name: 'Asset', history, dayBounds: [], supply: 1000, localDemand: 1, fair: 1, price: history[history.length - 1] };
  const ctx = { assets: [asset], selected: 'AAA', chartMode: 'candles', chartInterval: interval, chartZoom: 1, chartOffset: 0 };
  drawChart(ctx);
  return ctx._chartState.segments.length;
}

(function testResampleCounts() {
  const len = CFG.DAY_TICKS * 400; // ensure enough data for all views
  assert.strictEqual(setup(len, 'hour'), CFG.DAY_TICKS, '1H should yield DAY_TICKS segments');
  assert.strictEqual(setup(len, 'day'), 14, '1D should group into 14 segments');
  assert.strictEqual(setup(len, 'week'), 12, '1W should group into 12 segments');
  assert.strictEqual(setup(len, 'month'), 17, '1M should group into 17 segments');
})();

console.log('chart.spec passed');
