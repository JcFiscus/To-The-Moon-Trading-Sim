const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const toneClass = (kind) => {
  if (kind === "good") return "feed__item--good";
  if (kind === "bad") return "feed__item--bad";
  if (kind === "warn") return "feed__item--warn";
  return "feed__item--neutral";
};

const formatEffectTags = (effect) => {
  if (!effect) return "";
  const tags = [];
  if (Number.isFinite(effect.driftShift) && effect.driftShift !== 0) {
    const tone = effect.driftShift > 0 ? "good" : "bad";
    tags.push(`<span class="tag tag--${tone}">Drift ${effect.driftShift > 0 ? "+" : ""}${effect.driftShift.toFixed(3)}</span>`);
  }
  if (Number.isFinite(effect.volMult) && effect.volMult !== 1) {
    const tone = effect.volMult > 1 ? "bad" : "good";
    tags.push(`<span class="tag tag--${tone}">Vol ×${effect.volMult.toFixed(2)}</span>`);
  }
  if (Number.isFinite(effect.liquidityShift) && effect.liquidityShift !== 0) {
    const tone = effect.liquidityShift > 0 ? "good" : "bad";
    tags.push(
      `<span class="tag tag--${tone}">Liq ${effect.liquidityShift > 0 ? "+" : ""}${Math.abs(effect.liquidityShift).toFixed(2)}</span>`
    );
  }
  if (effect.reason) {
    tags.push(`<span class="tag tag--neutral">${escapeHtml(effect.reason)}</span>`);
  }
  return tags.join(" ");
};

export function createNewsFeedController() {
  const root = document.querySelector('[data-module="news"]');
  if (!root) {
    return {
      render() {}
    };
  }

  const listEl = root.querySelector('[data-region="news-list"]');
  const emptyState = root.querySelector('[data-element="news-empty"]');

  return {
    render(feed) {
      if (!listEl) return;
      const entries = Array.isArray(feed) ? feed.slice().reverse() : [];
      if (entries.length === 0) {
        listEl.innerHTML = "";
        if (emptyState) emptyState.classList.remove("is-hidden");
        return;
      }

      const rows = entries
        .map((entry) => {
          const tone = toneClass(entry.kind);
          const tags = formatEffectTags(entry.effect);
          const reason = entry.effect?.description || entry.effect?.detail || "";
          const tooltip = reason ? ` data-tooltip="${escapeHtml(reason)}"` : "";
          const target = entry.targetId ? `<span class="feed__target">${escapeHtml(entry.targetId)}</span>` : "";

          return `
            <li class="feed__item ${tone}"${tooltip}>
              <div class="feed__item-head">
                <span class="feed__time">${escapeHtml(entry.time || "")}</span>
                ${target}
              </div>
              <div class="feed__text">${escapeHtml(entry.text || "")}</div>
              ${tags ? `<div class="feed__tags">${tags}</div>` : ""}
            </li>
          `;
        })
        .join("");

      listEl.innerHTML = rows;
      if (emptyState) emptyState.classList.add("is-hidden");
    }
  };
}
