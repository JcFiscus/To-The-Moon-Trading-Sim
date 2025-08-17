// src/js/ui/upgrades.js
// Minimal, DOM-only shop UI. Re-renders on state changes.

import { UPGRADE_DEF, hasUpgrade, canAfford, purchaseUpgrade } from "../core/upgrades.js";

export function renderUpgradeShop(state) {
  const mount = document.getElementById("upgrades");
  if (!mount) return;

  mount.innerHTML = "";
  Object.values(UPGRADE_DEF).forEach((def) => {
    const card = document.createElement("div");
    card.className = "upgrade-card";
    const owned = hasUpgrade(state, def.id);
    const disabled = owned || !canAfford(state, def.id);

    card.innerHTML = `
      <div class="upgrade-title">${def.name}</div>
      <div class="upgrade-desc">${def.desc}</div>
      <div class="upgrade-cta">
        <span class="price">$${def.price.toLocaleString()}</span>
        <button class="buy" data-id="${def.id}" ${disabled ? "disabled" : ""}>
          ${owned ? "Owned" : "Buy"}
        </button>
      </div>
    `;
    mount.appendChild(card);
  });

  mount.onclick = (e) => {
    const btn = e.target.closest("button.buy");
    if (!btn) return;
    const id = btn.getAttribute("data-id");
    if (purchaseUpgrade(state, id)) {
      renderUpgradeShop(state);
      window.dispatchEvent(new CustomEvent("game:stateChanged"));
    }
  };
}
