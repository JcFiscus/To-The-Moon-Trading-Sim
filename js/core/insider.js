// js/core/insider.js
// Insider tip scheduler + price boost hook.

import { hasUpgrade, UPGRADE_IDS } from "./upgrades.js";

export const INSIDER = Object.freeze({
  minCooldownMs: 60_000,
  maxCooldownMs: 120_000,
  windowMs: 8000,
  rampTicks: 5,
  boostMin: 0.08,  // +8%
  boostMax: 0.15,  // +15%
});

// Adds: state.insider = { nextAt:number, active:{assetId,expiresAt,boost,ticksLeft}|null }
export function ensureInsiderState(state) {
  if (!state.insider) state.insider = { nextAt: 0, active: null };
  return state;
}

export function maybeScheduleTip(state, nowMs, assetIds, rng = Math.random) {
  ensureInsiderState(state);
  if (!hasUpgrade(state, UPGRADE_IDS.INSIDER)) return;
  if (state.insider.active) return;
  if (nowMs < state.insider.nextAt) return;
  if (!assetIds || assetIds.length === 0) return;

  const id = assetIds[Math.floor(rng() * assetIds.length)];
  const boost = INSIDER.boostMin + rng() * (INSIDER.boostMax - INSIDER.boostMin);
  state.insider.active = {
    assetId: id,
    expiresAt: nowMs + INSIDER.windowMs,
    boost,
    ticksLeft: INSIDER.rampTicks,
  };
  state.insider.nextAt =
    nowMs + INSIDER.minCooldownMs + rng() * (INSIDER.maxCooldownMs - INSIDER.minCooldownMs);
}

export function clearIfExpired(state, nowMs) {
  ensureInsiderState(state);
  if (state.insider.active && nowMs >= state.insider.active.expiresAt) {
    state.insider.active = null;
  }
}

export function activeTip(state) {
  return state.insider && state.insider.active ? state.insider.active : null;
}

// Price hook: call this after computing an asset's base price for the tick.
export function applyInsiderBoost(state, assetId, basePrice) {
  if (!state.insider || !state.insider.active) return basePrice;
  const tip = state.insider.active;
  if (tip.assetId !== assetId) return basePrice;
  if (tip.ticksLeft <= 0) return basePrice;

  const step = tip.boost / INSIDER.rampTicks;
  tip.ticksLeft -= 1;
  const p = basePrice * (1 + step);
  // Guarantee no dip during the window
  return Math.max(basePrice, p);
}
