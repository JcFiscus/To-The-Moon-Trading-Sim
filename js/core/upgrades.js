// js/core/upgrades.js
// Simple, framework-free upgrade engine.
// State shape added: state.upgrades = { owned: { [id]: 1 }, cashSpent: number }

export const UPGRADE_IDS = {
  MARGIN: "margin",
  INSIDER: "insider",
};

export const UPGRADE_DEF = {
  [UPGRADE_IDS.MARGIN]: {
    id: UPGRADE_IDS.MARGIN,
    name: "Margin Account",
    price: 25000,
    desc:
      "Unlock 2× buying power. 10% APR interest applied daily on borrowed funds. 25% maintenance margin.",
  },
  [UPGRADE_IDS.INSIDER]: {
    id: UPGRADE_IDS.INSIDER,
    name: "Insider Wire",
    price: 50000,
    desc:
      "Periodic, reliable buy-signal on one asset. Tip window 8s. Positive drift for a few ticks.",
  },
};

export function ensureUpgradeState(state) {
  if (!state.upgrades) state.upgrades = { owned: {}, cashSpent: 0 };
  return state;
}

export function hasUpgrade(state, id) {
  return !!(state.upgrades && state.upgrades.owned && state.upgrades.owned[id]);
}

export function canAfford(state, id) {
  const def = UPGRADE_DEF[id];
  return state.cash >= def.price && !hasUpgrade(state, id);
}

export function purchaseUpgrade(state, id) {
  ensureUpgradeState(state);
  const def = UPGRADE_DEF[id];
  if (!def) return false;
  if (hasUpgrade(state, id)) return false;
  if (state.cash < def.price) return false;
  state.cash -= def.price;
  state.upgrades.owned[id] = 1;
  state.upgrades.cashSpent += def.price;
  return true;
}

/**
 * Ensure upgrade state exists within the engine and surface the helper API
 * that feature packs expect. Does not add any automatic behaviour beyond
 * hydrating the state slice.
 */
export function registerUpgrades(engine) {
  if (!engine || typeof engine.update !== "function") {
    throw new Error("registerUpgrades requires a game engine instance");
  }

  engine.update((state) => {
    ensureUpgradeState(state);
  }, { save: false, render: false });

  return {
    ensureUpgradeState,
    hasUpgrade,
    canAfford,
    purchaseUpgrade,
    UPGRADE_IDS,
    UPGRADE_DEF
  };
}
