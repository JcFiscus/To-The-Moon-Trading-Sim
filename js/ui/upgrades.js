// js/ui/upgrades.js
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

/* Upgrade pack styles. */
#panel-upgrades { padding: 8px; }
.upgrade-card { border: 1px solid #222; padding: 8px; margin: 6px 0; border-radius: 6px; }
.upgrade-title { font-weight: 600; }
.upgrade-desc { font-size: 0.9rem; opacity: 0.8; margin: 4px 0 8px; }
.upgrade-cta { display: flex; justify-content: space-between; align-items: center; }
#insider-banner { position: sticky; top: 0; padding: 6px 8px; border-bottom: 1px solid #333; background: #111; }
#insider-banner.hidden { display: none; }

#ttm-hud { position: fixed; right: 8px; bottom: 8px; z-index: 50; }
#ttm-hud .ttm-hud { background: rgba(0,0,0,0.6); padding: 8px 10px; border: 1px solid #222; border-radius: 6px; font-size: 12px; line-height: 1.3; }
#ttm-hud .ttm-hud div { white-space: nowrap; }
