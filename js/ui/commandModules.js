import { UPGRADE_DEF } from "../core/upgrades.js";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

const formatMoney = (value) => {
  const amount = Number.isFinite(value) ? value : 0;
  return `$${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
};


const getFocusable = (root) => {
  if (!root) return [];
  return Array.from(root.querySelectorAll(FOCUSABLE_SELECTOR)).filter((el) =>
    el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0
  );
};

const summarizeEvent = (event) => {
  if (!event) return "No active scenarios.";
  if (typeof event.label === "string" && event.label.trim()) return event.label;
  if (typeof event.description === "string" && event.description.trim()) return event.description;
  return "Scenario awaiting orders.";
};


export function createCommandModulesController() {
  const root = document.querySelector('[data-module="command-modules"]');
  const dock = document.querySelector('[data-module-dock]');
  if (!root || !dock) {
    return {
      render() {},
      open() {},
      close() {}
    };
  }

  const buttons = Array.from(root.querySelectorAll('[data-module-target]'));
  const buttonMap = new Map(buttons.map((btn) => [btn.getAttribute("data-module-target"), btn]));
  const labelMap = new Map(buttons.map((btn) => [btn.getAttribute("data-module-target"), btn.getAttribute("data-module-label") || btn.textContent?.trim() || "Module"]));

  const moduleTitle = dock.querySelector('[data-module-title]');
  const closeTriggers = dock.querySelectorAll('[data-action="close-modules"]');
  const screens = new Map();
  dock.querySelectorAll('[data-module-screen]').forEach((pane) => {
    const id = pane.getAttribute("data-module-screen");
    if (id) {
      screens.set(id, pane);
    }
  });

  const fields = {
    eventsCount: root.querySelector('[data-field="command-events-count"]'),
    eventsSummary: root.querySelector('[data-field="command-events-summary"]'),
    newsCount: root.querySelector('[data-field="command-news-count"]'),
    newsSummary: root.querySelector('[data-field="command-news-summary"]'),
    upgradesStatus: root.querySelector('[data-field="command-upgrade-status"]'),
    upgradesSummary: root.querySelector('[data-field="command-upgrade-summary"]'),
    operationsStatus: root.querySelector('[data-field="command-operations-status"]'),
    operationsSummary: root.querySelector('[data-field="command-operations-summary"]')
  };

  let openId = null;
  let lastFocus = null;

  const focusPane = (pane) => {
    if (!pane) return;
    const preferred = pane.querySelector('[data-module-focus]');
    if (preferred && typeof preferred.focus === "function") {
      preferred.focus({ preventScroll: true });
      return;
    }
    const focusable = getFocusable(pane);
    if (focusable.length) {
      focusable[0].focus({ preventScroll: true });
    }
  };

  const setActiveScreen = (id) => {
    screens.forEach((pane, key) => {
      const active = key === id;
      pane.classList.toggle("is-active", active);
      pane.setAttribute("aria-hidden", active ? "false" : "true");
    });
  };

  const open = (id) => {
    if (!id || !screens.has(id)) return;
    openId = id;
    lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setActiveScreen(id);
    if (moduleTitle) {
      moduleTitle.textContent = labelMap.get(id) || "Command Module";
    }
    dock.classList.add("is-open");
    dock.setAttribute("aria-hidden", "false");
    document.body.classList.add("has-module-dock");
    requestAnimationFrame(() => {
      focusPane(screens.get(id));
    });
  };

  const close = () => {
    if (!openId) return;
    openId = null;
    dock.classList.remove("is-open");
    dock.setAttribute("aria-hidden", "true");
    document.body.classList.remove("has-module-dock");
    if (lastFocus && typeof lastFocus.focus === "function") {
      lastFocus.focus({ preventScroll: true });
    }
  };

  const handleKeydown = (event) => {
    if (!openId) return;
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === "Tab") {
      if (!screens.has(openId)) return;
      const focusable = getFocusable(dock);
      if (!focusable.length) {
        event.preventDefault();
        return;
      }
      const index = focusable.indexOf(document.activeElement);
      if (event.shiftKey) {
        if (index <= 0) {
          event.preventDefault();
          focusable[focusable.length - 1].focus();
        }
      } else if (index === focusable.length - 1) {
        event.preventDefault();
        focusable[0].focus();
      }
    }
  };

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.getAttribute("data-module-target");
      open(target);
    });
  });

  closeTriggers.forEach((el) => {
    el.addEventListener("click", (event) => {
      event.preventDefault();
      close();
    });
  });

  document.addEventListener("keydown", handleKeydown);

  const updateEventsSummary = (state) => {
    const queue = Array.isArray(state?.pendingEvents) ? state.pendingEvents : [];
    const count = queue.length;
    if (fields.eventsCount) {
      fields.eventsCount.textContent = count ? `${count} active` : "All clear";
    }
    if (fields.eventsSummary) {
      fields.eventsSummary.textContent = summarizeEvent(queue[0]);
    }
    const tile = buttonMap.get("events");
    if (tile) {
      const alerting = queue.some((item) => item?.kind === "bad" || item?.kind === "warn");
      if (alerting) {
        tile.dataset.tone = "alert";
      } else {
        delete tile.dataset.tone;
      }
    }
  };

  const updateNewsSummary = (feed) => {
    const entries = Array.isArray(feed) ? feed : [];
    const latest = entries.length ? entries[entries.length - 1] : null;
    if (fields.newsCount) {
      fields.newsCount.textContent = entries.length ? "Live updates" : "News feed idle";
    }
    if (fields.newsSummary) {
      fields.newsSummary.textContent = latest?.text || "Waiting for market chatter…";
    }
    const tile = buttonMap.get("news");
    if (tile) {
      const tone = latest?.kind;
      if (tone === "bad" || tone === "warn") {
        tile.dataset.tone = "alert";
      } else {
        delete tile.dataset.tone;
      }
    }
  };

  const updateUpgradeSummary = (state) => {
    const tile = buttonMap.get("upgrade-shop");
    const owned = state?.upgrades?.owned && typeof state.upgrades.owned === "object"
      ? Object.keys(state.upgrades.owned).length
      : 0;
    const total = Object.keys(UPGRADE_DEF).length;
    if (fields.upgradesStatus) {
      fields.upgradesStatus.textContent = owned
        ? `${owned}/${total} systems online`
        : "No systems unlocked";
    }
    const upgrades = Object.values(UPGRADE_DEF);
    const ownedSet = new Set(Object.keys(state?.upgrades?.owned || {}));
    const next = upgrades.find((def) => !ownedSet.has(def.id));
    if (fields.upgradesSummary) {
      fields.upgradesSummary.textContent = next
        ? `Next: ${next.name} (${formatMoney(next.price)})`
        : "All upgrades installed.";
    }
    if (tile) {
      const affordable = upgrades.some((def) => !ownedSet.has(def.id) && state?.cash >= def.price);
      if (affordable) {
        tile.dataset.tone = "alert";
      } else {
        delete tile.dataset.tone;
      }
    }
  };

  const updateOperationsSummary = (operations) => {
    const active = Number.isFinite(operations?.activeCount) ? operations.activeCount : 0;
    const claimable = Number.isFinite(operations?.readyToClaim) ? operations.readyToClaim : 0;
    const rep = Number.isFinite(operations?.reputation) ? operations.reputation : 0;

    if (fields.operationsStatus) {
      const parts = [`${active} active`, `${rep} REP`];
      fields.operationsStatus.textContent = parts.join(" · ");
    }

    if (fields.operationsSummary) {
      if (claimable > 0) {
        fields.operationsSummary.textContent = `${claimable} contract${claimable === 1 ? "" : "s"} ready to claim.`;
      } else if (active > 0) {
        fields.operationsSummary.textContent = "Push trade flow to complete contracts before deadlines.";
      } else {
        fields.operationsSummary.textContent = "No contracts assigned";
      }
    }

    const tile = buttonMap.get("operations");
    if (tile) {
      if (claimable > 0) {
        tile.dataset.tone = "alert";
      } else {
        delete tile.dataset.tone;
      }
    }
  };

  return {
    render(state, { feed = [], operations } = {}) {
      updateEventsSummary(state);
      updateNewsSummary(feed);
      updateUpgradeSummary(state);
      updateOperationsSummary(operations);
    },
    open,
    close
  };
}
