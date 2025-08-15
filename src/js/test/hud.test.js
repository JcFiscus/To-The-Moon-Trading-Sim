import { renderHUD } from '../ui/hud.js';
import { createInitialState } from '../core/state.js';
import { ASSET_DEFS } from '../config.js';

test('renderHUD updates day number', () => {
  document.body.innerHTML = `
    <span id="cash"></span>
    <span id="debt"></span>
    <span id="assets"></span>
    <span id="net"></span>
    <span id="dayNum"></span>
    <span id="dayTimer"></span>
    <span id="riskPct"></span>
  `;
  const ctx = createInitialState(ASSET_DEFS.slice(0,1));
  renderHUD(ctx);
  expect(document.getElementById('dayNum').textContent).toBe('0');
});
