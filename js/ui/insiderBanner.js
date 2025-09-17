import { activeTip } from "../core/insider.js";

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export function updateInsiderBanner(state) {
  const el = document.getElementById("insider-banner");
  if (!el) return;

  const tip = activeTip(state);
  if (!tip) {
    el.classList.add("hidden");
    el.innerHTML = "";
    return;
  }
  const secs = Math.max(0, Math.ceil((tip.expiresAt - Date.now()) / 1000));
  el.classList.remove("hidden");
  el.innerHTML = `
    <span class="insider-banner__label">Insider Wire</span>
    <span class="insider-banner__body">Bias active on <strong>${escapeHtml(tip.assetId)}</strong>. Ride the drift before it fades.</span>
    <span class="insider-banner__timer" aria-live="polite">${secs}s</span>
  `;
}
