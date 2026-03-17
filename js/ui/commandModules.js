import { UPGRADE_DEF } from "../core/upgrades.js";

const formatMoney = (value) => {
  const amount = Number.isFinite(value) ? value : 0;
  return `$${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
};

const summarizeEvent = (event) => {
  if (!event) return "No active scenarios.";
  if (typeof event.label === "string" && event.label.trim()) return event.label;
  if (typeof event.description === "string" && event.description.trim()) return event.description;
  return "Scenario awaiting orders.";
};

export function createCommandModulesController() {
  const root = document.querySelector('[data-module="command-modules"]');
  if (!root) {
    return {
      render() {},
      open() {},
      close() {}
    };
  }

  const buttons = Array.from(root.querySelectorAll('[data-module-target]'));
  const buttonMap = new Map(buttons.map((button) => [button.getAttribute("data-module-target"), button]));
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

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const targetId = button.getAttribute("data-jump-target");
      if (!targetId) return;
      const target = document.getElementById(targetId);
      if (!target) return;
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

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
      tile.dataset.tone = alerting ? "alert" : "";
      if (!alerting) delete tile.dataset.tone;
    }
  };

  const updateNewsSummary = (feed) => {
    const entries = Array.isArray(feed) ? feed : [];
    const latest = entries.length ? entries[entries.length - 1] : null;
    if (fields.newsCount) {
      fields.newsCount.textContent = entries.length ? "Live feed" : "Feed idle";
    }
    if (fields.newsSummary) {
      fields.newsSummary.textContent = latest?.text || "Waiting for market chatter...";
    }

    const tile = buttonMap.get("news");
    if (tile) {
      const tone = latest?.kind;
      const alerting = tone === "bad" || tone === "warn";
      tile.dataset.tone = alerting ? "alert" : "";
      if (!alerting) delete tile.dataset.tone;
    }
  };

  const updateUpgradeSummary = (state) => {
    const tile = buttonMap.get("upgrade-shop");
    const owned = state?.upgrades?.owned && typeof state.upgrades.owned === "object"
      ? Object.keys(state.upgrades.owned).length
      : 0;
    const total = Object.keys(UPGRADE_DEF).length;
    if (fields.upgradesStatus) {
      fields.upgradesStatus.textContent = owned ? `${owned}/${total} online` : "No systems unlocked";
    }

    const upgrades = Object.values(UPGRADE_DEF);
    const ownedSet = new Set(Object.keys(state?.upgrades?.owned || {}));
    const next = upgrades.find((definition) => !ownedSet.has(definition.id));
    if (fields.upgradesSummary) {
      fields.upgradesSummary.textContent = next
        ? `Next: ${next.name} (${formatMoney(next.price)})`
        : "All tactical upgrades installed.";
    }

    if (tile) {
      const affordable = upgrades.some((definition) => !ownedSet.has(definition.id) && state?.cash >= definition.price);
      tile.dataset.tone = affordable ? "alert" : "";
      if (!affordable) delete tile.dataset.tone;
    }
  };

  const updateOperationsSummary = (operations) => {
    const active = Number.isFinite(operations?.activeCount) ? operations.activeCount : 0;
    const claimable = Number.isFinite(operations?.readyToClaim) ? operations.readyToClaim : 0;
    const rep = Number.isFinite(operations?.reputation) ? operations.reputation : 0;

    if (fields.operationsStatus) {
      fields.operationsStatus.textContent = `${active} active | ${rep} REP`;
    }
    if (fields.operationsSummary) {
      if (claimable > 0) {
        fields.operationsSummary.textContent = `${claimable} contract${claimable === 1 ? "" : "s"} ready to claim.`;
      } else if (active > 0) {
        fields.operationsSummary.textContent = "Push trade flow to finish contracts before their deadlines.";
      } else {
        fields.operationsSummary.textContent = "No contracts assigned.";
      }
    }

    const tile = buttonMap.get("operations");
    if (tile) {
      tile.dataset.tone = claimable > 0 ? "alert" : "";
      if (claimable <= 0) delete tile.dataset.tone;
    }
  };

  return {
    render(state, { feed = [], operations } = {}) {
      updateEventsSummary(state);
      updateNewsSummary(feed);
      updateUpgradeSummary(state);
      updateOperationsSummary(operations);
    },
    open() {},
    close() {}
  };
}
