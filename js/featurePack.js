// Bootstraps Margin + Insider + Shop + Persistence, and exposes globals.

import * as upgrades from "./core/upgrades.js";
import * as margin from "./core/margin.js";
import * as insider from "./core/insider.js";
import { renderUpgradeShop } from "./ui/upgrades.js";
import { updateInsiderBanner } from "./ui/insiderBanner.js";
import { renderHudPatch } from "./ui/hudPatch.js";

const { ensureUpgradeState } = upgrades;
const { ensureMarginState, accrueDailyInterest } = margin;
const { ensureInsiderState, maybeScheduleTip, clearIfExpired } = insider;

// --- persistence (localStorage, our slices only) ---
const LS_KEY = "ttm.upgrades.v1";
function loadSlices() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch { return {}; }
}
function saveSlices(state) {
  const snapshot = {
    upgrades: state.upgrades || null,
    margin: state.margin || null,
    insider: state.insider || null,
  };
  try { localStorage.setItem(LS_KEY, JSON.stringify(snapshot)); } catch {}
}

// --- integration helpers ---
function defaultGetPortfolioValue() {
  // Try common globals; fall back to 0.
  const g = window.game || window.Game || window;
  const assets = g.assets || g.market?.assets || [];
  if (!assets || !assets.length) return 0;
  // If positions exist elsewhere, this might diverge. This is only a fallback.
  // Prefer passing getPortfolioValue in init().
  return assets.reduce((s, a) => s + (a.price || 0) * (a.shares || 0), 0);
}
function defaultGetAssetIds() {
  const g = window.game || window.Game || window;
  const assets = g.assets || g.market?.assets || [];
  return Array.isArray(assets) ? assets.map(a => a.id || a.symbol || a.ticker || "ASSET") : [];
}

function tickOnce(state, getPV, getIds) {
  // Interest: accrue once per 60s of real time as a simple stand-in for "daily".
  const now = Date.now();
  if (!state.__ttmInterestAt) state.__ttmInterestAt = now + 60_000;
  if (now >= state.__ttmInterestAt) {
    accrueDailyInterest(state, 1);
    state.__ttmInterestAt = now + 60_000;
  }

  // Insider scheduler + expiry
  maybeScheduleTip(state, now, getIds());
  clearIfExpired(state, now);

  // HUD + banner
  const pv = getPV();
  renderHudPatch(state, pv);
  updateInsiderBanner(state);

  // Persist our slices
  saveSlices(state);
}

// Public API
function exposeGlobals(api) {
  window.ttm = Object.freeze({
    ...api,
    margin: Object.freeze({ ...margin }),
    insider: Object.freeze({ ...insider }),
    upgrades: Object.freeze({ ...upgrades }),
    applyInsiderBoost: insider.applyInsiderBoost,
  });
}

export function init({ state, getPortfolioValue, getAssetIds, onTick } = {}) {
  // Fallback state if none provided, to avoid crashes during setup
  if (!state) {
    state = window.state || (window.state = { cash: 0 });
  }
  window.ttm = { state }; // temp handle for UI callbacks using window.ttm.state

  // Hydrate slices
  const loaded = loadSlices();
  ensureUpgradeState(state);
  ensureMarginState(state);
  ensureInsiderState(state);
  Object.assign(state.upgrades, loaded.upgrades || {});
  Object.assign(state.margin, loaded.margin || {});
  Object.assign(state.insider, loaded.insider || {});

  // Initial UI
  renderUpgradeShop(state);
  updateInsiderBanner(state);
  renderHudPatch(state, (getPortfolioValue || defaultGetPortfolioValue)());

  // Re-render shop on change
  window.addEventListener("ttm:stateChanged", () => {
    renderUpgradeShop(state);
    saveSlices(state);
  });

  // Tick binding
  const getPV = getPortfolioValue || defaultGetPortfolioValue;
  const getIds = getAssetIds || defaultGetAssetIds;

  if (onTick && typeof onTick === "function") {
    // Host loop will call us each tick
    onTick(() => tickOnce(state, getPV, getIds));
  } else {
    // Fallback: our own 1s interval
    setInterval(() => tickOnce(state, getPV, getIds), 1000);
  }

  // Finalize global API
  exposeGlobals({ state });
}

// Auto-init if desired globals exist
if (document.readyState !== "loading") {
  // Do not auto-init if window.__TTM_NO_AUTO__ is set
  if (!window.__TTM_NO_AUTO__) init({});
} else {
  document.addEventListener("DOMContentLoaded", () => {
    if (!window.__TTM_NO_AUTO__) init({});
  });
}
