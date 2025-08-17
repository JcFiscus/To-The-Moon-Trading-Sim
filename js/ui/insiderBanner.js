// js/ui/insiderBanner.js
import { activeTip } from "../core/insider.js";

export function updateInsiderBanner(state) {
  const el = document.getElementById("insider-banner");
  if (!el) return;

  const tip = activeTip(state);
  if (!tip) {
    el.classList.add("hidden");
    el.textContent = "";
    return;
  }
  const secs = Math.max(0, Math.ceil((tip.expiresAt - Date.now()) / 1000));
  el.classList.remove("hidden");
  el.textContent = `Insider Tip: ${tip.assetId} expected to rise. ${secs}s left.`;
}
