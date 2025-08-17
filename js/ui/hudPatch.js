// Optional HUD add-on for Debt / Equity / Buying Power, non-invasive.

import { equity, buyingPower } from "../core/margin.js";

function ensureHudContainer() {
  let hud = document.getElementById("ttm-hud");
  if (!hud) {
    hud = document.createElement("div");
    hud.id = "ttm-hud";
    document.body.appendChild(hud);
  }
  if (!document.getElementById("ttm-hud-inner")) {
    hud.innerHTML = `
      <div id="ttm-hud-inner" class="ttm-hud">
        <div>Debt: $<span id="ttm-hud-debt">0.00</span></div>
        <div>Equity: $<span id="ttm-hud-equity">0.00</span></div>
        <div>Buying Power: $<span id="ttm-hud-bp">0.00</span></div>
      </div>
    `;
  }
}

export function renderHudPatch(state, portfolioValue) {
  ensureHudContainer();
  const debt = (state.margin?.debt || 0);
  const eq = equity(state, portfolioValue || 0);
  const bp = buyingPower(state, portfolioValue || 0);

  const d = document.getElementById("ttm-hud-debt");
  const e = document.getElementById("ttm-hud-equity");
  const b = document.getElementById("ttm-hud-bp");
  if (d) d.textContent = debt.toFixed(2);
  if (e) e.textContent = eq.toFixed(2);
  if (b) b.textContent = bp.toFixed(2);
}
