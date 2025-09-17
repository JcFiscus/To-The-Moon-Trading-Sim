import {
  UPGRADE_DEF,
  hasUpgrade,
  canAfford,
  purchaseUpgrade,
  ensureUpgradeState
} from "../core/upgrades.js";

const formatMoney = (value) => {
  const numeric = Number(value) || 0;
  return `$${numeric.toLocaleString(undefined, { minimumFractionDigits: 0 })}`;
};

let defaultController = null;

export function createUpgradeShopController({
  root = document.querySelector('[data-module="upgrade-shop"]'),
  onRequestPurchase,
  registerGlobal = true
} = {}) {
  if (!root) {
    return {
      render() {},
      showStatus() {}
    };
  }

  const listEl = root.querySelector('[data-region="upgrade-list"]');
  const statusEl = root.querySelector('[data-element="upgrade-status"]');
  let latestState = null;
  let statusTimeout = null;

  const showStatus = (message, tone = "info") => {
    if (!statusEl) return;
    statusEl.textContent = message || "";
    statusEl.dataset.tone = tone;
    statusEl.classList.toggle("is-hidden", !message);
    clearTimeout(statusTimeout);
    if (message) {
      statusTimeout = setTimeout(() => {
        statusEl.textContent = "";
        statusEl.dataset.tone = "info";
        statusEl.classList.add("is-hidden");
      }, 4000);
    }
  };

  const requestPurchase = (id) => {
    if (!id) return { success: false };
    const handler = typeof onRequestPurchase === "function" ? onRequestPurchase : null;
    if (handler) {
      return handler(id, latestState) || { success: false };
    }
    if (!latestState) return { success: false };
    const success = purchaseUpgrade(latestState, id);
    if (success) {
      return { success: true, message: `${UPGRADE_DEF[id]?.name || "Upgrade"} unlocked.` };
    }
    return { success: false, message: "Unable to purchase upgrade." };
  };

  if (listEl) {
    listEl.addEventListener("click", (event) => {
      const button = event.target.closest("[data-upgrade-id]");
      if (!button) return;
      const id = button.getAttribute("data-upgrade-id");
      const result = requestPurchase(id);
      if (result?.success) {
        showStatus(result.message || "Upgrade unlocked.", "good");
        if (latestState) render(latestState);
        window.dispatchEvent(new CustomEvent("ttm:upgrades:changed", { detail: { id } }));
      } else if (result?.message) {
        showStatus(result.message, "warn");
      } else {
        showStatus("Upgrade locked. Earn more cash first.", "warn");
      }
    });
  }

  const render = (state) => {
    if (!listEl || !state) return;
    ensureUpgradeState(state);
    latestState = state;
    const cards = Object.values(UPGRADE_DEF)
      .map((def) => {
        const owned = hasUpgrade(state, def.id);
        const affordable = canAfford(state, def.id);
        const disabled = owned || !affordable;
        const tone = owned ? "owned" : affordable ? "ready" : "locked";
        const cta = owned ? "Owned" : affordable ? "Buy" : "Insufficient";
        return `
          <article class="upgrade-card upgrade-card--${tone}" data-upgrade-card>
            <div class="upgrade-card__header">
              <h4>${def.name}</h4>
              <span class="upgrade-card__price">${formatMoney(def.price)}</span>
            </div>
            <p class="upgrade-card__desc">${def.desc}</p>
            <div class="upgrade-card__actions">
              <button class="btn ${owned ? "btn-disabled" : "btn-primary"}" data-upgrade-id="${def.id}" ${
                disabled ? "disabled" : ""
              }>${cta}</button>
            </div>
          </article>
        `;
      })
      .join("");

    listEl.innerHTML = cards || '<div class="upgrade-empty">No upgrades available.</div>';
  };

  const controller = {
    render,
    showStatus
  };

  if (registerGlobal) {
    defaultController = controller;
  }

  return controller;
}

export function renderUpgradeShop(state) {
  if (!defaultController) {
    defaultController = createUpgradeShopController({ registerGlobal: true });
  }
  if (defaultController) {
    defaultController.render(state);
  }
}
