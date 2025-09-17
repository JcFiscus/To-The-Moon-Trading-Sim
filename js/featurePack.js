// Feature pack bootstrap: wires core systems to the shared game engine.

import { registerUpgrades } from "./core/upgrades.js";
import { registerMargin } from "./core/margin.js";
import { registerInsider } from "./core/insider.js";
import { renderUpgradeShop } from "./ui/upgrades.js";
import { updateInsiderBanner } from "./ui/insiderBanner.js";
import { renderHudPatch } from "./ui/hudPatch.js";

function defaultGetPortfolioValue(engine) {
  if (typeof engine?.portfolioValue === "function") {
    return engine.portfolioValue();
  }
  const state = engine?.getState?.();
  if (!state || !Array.isArray(state.assets)) return 0;
  return state.assets.reduce((sum, asset) => {
    const position = state.positions?.[asset.id];
    return sum + (position ? position.qty * asset.price : 0);
  }, 0);
}

function defaultGetAssetIds(engine, state) {
  const snapshot = state ?? engine?.getState?.();
  if (!snapshot || !Array.isArray(snapshot.assets)) return [];
  return snapshot.assets.map((asset) => asset.id);
}

function exposeGlobals(engine, marginApi, insiderApi, upgradesApi) {
  window.ttm = Object.freeze({
    engine,
    margin: Object.freeze({ ...marginApi }),
    insider: Object.freeze({ ...insiderApi }),
    upgrades: Object.freeze({ ...upgradesApi })
  });
}

export function init(engine, {
  getPortfolioValue,
  getAssetIds
} = {}) {
  if (!engine || typeof engine.getState !== "function") {
    throw new Error("featurePack.init requires a game engine instance");
  }

  const portfolioValueFn = typeof getPortfolioValue === "function"
    ? (state) => getPortfolioValue(state ?? engine.getState())
    : (state) => defaultGetPortfolioValue(engine, state);

  const assetIdsFn = typeof getAssetIds === "function"
    ? (state) => getAssetIds(state ?? engine.getState())
    : (state) => defaultGetAssetIds(engine, state);

  const marginApi = registerMargin(engine);
  const insiderApi = registerInsider(engine, {
    getAssetIds: (state) => assetIdsFn(state)
  });
  const upgradesApi = registerUpgrades(engine);

  const renderExtras = (state) => {
    const snapshot = state ?? engine.getState();
    renderUpgradeShop(snapshot);
    updateInsiderBanner(snapshot);
    renderHudPatch(snapshot, portfolioValueFn(snapshot));
  };

  renderExtras(engine.getState());

  const offRender = engine.onRender((currentState) => {
    renderExtras(currentState);
  });

  const offState = engine.onStateChange((currentState) => {
    renderUpgradeShop(currentState);
  });

  exposeGlobals(engine, marginApi, insiderApi, upgradesApi);

  return function cleanup() {
    if (typeof offRender === "function") offRender();
    if (typeof offState === "function") offState();
  };
}

export default { init };
