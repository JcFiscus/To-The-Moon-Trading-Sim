// src/js/core/margin.js
// Margin mechanics that any trading code can call.

import { hasUpgrade, UPGRADE_IDS } from "./upgrades.js";

export const MARGIN_PARAMS = Object.freeze({
  maxLeverage: 2.0,   // 2× buying power
  apr: 0.10,          // 10% simple APR, accrued daily
  maintenance: 0.25,  // 25% of position market value
});

// Adds: state.margin = { debt:number, interestAccrued:number }
export function ensureMarginState(state) {
  if (!state.margin) state.margin = { debt: 0, interestAccrued: 0 };
  return state;
}

// Equity = cash + portfolio - debt
export function equity(state, portfolioValue) {
  ensureMarginState(state);
  return (state.cash || 0) + (portfolioValue || 0) - (state.margin.debt || 0);
}

// Buying power depends on upgrade and current debt.
export function buyingPower(state, portfolioValue) {
  ensureMarginState(state);
  if (!hasUpgrade(state, UPGRADE_IDS.MARGIN)) return state.cash;
  const eq = equity(state, portfolioValue);
  const extra = Math.max(0, eq * (MARGIN_PARAMS.maxLeverage - 1));
  return (state.cash || 0) + extra - (state.margin.debt || 0);
}

// Use this instead of directly subtracting cash on BUY orders.
// cost = price * qty, portfolioValue is current mark-to-market of open positions.
export function buyWithMargin(state, cost, portfolioValue) {
  ensureMarginState(state);
  const bp = buyingPower(state, portfolioValue);
  if (cost > bp) return false;

  const need = Math.max(0, cost - state.cash);
  if (need > 0) {
    state.margin.debt += need;
    state.cash = 0;
  } else {
    state.cash -= cost;
  }
  return true;
}

// Always call this on SELL proceeds first.
export function applyProceeds(state, proceeds) {
  ensureMarginState(state);
  const pay = Math.min(proceeds, state.margin.debt);
  state.margin.debt -= pay;
  state.cash += (proceeds - pay);
}

// Accrue daily interest (call once per in-game day).
export function accrueDailyInterest(state, days = 1) {
  ensureMarginState(state);
  if (state.margin.debt <= 0) return 0;
  const daily = MARGIN_PARAMS.apr / 365;
  const interest = state.margin.debt * daily * days;
  state.margin.debt += interest;
  state.margin.interestAccrued += interest;
  return interest;
}

// Maintenance check. If true, disable further buys and prompt the player to sell.
export function isUnderMaintenance(state, portfolioValue) {
  const eq = equity(state, portfolioValue);
  const req = MARGIN_PARAMS.maintenance * (portfolioValue || 0);
  return eq < req;
}
