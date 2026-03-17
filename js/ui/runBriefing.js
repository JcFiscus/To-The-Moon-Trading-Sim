const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export function createRunBriefingController() {
  const root = document.querySelector('[data-module="run-briefing"]');
  if (!root) {
    return { render() {} };
  }

  const titleEl = root.querySelector('[data-field="briefing-title"]');
  const headlineEl = root.querySelector('[data-field="briefing-headline"]');
  const gridEl = root.querySelector('[data-region="briefing-grid"]');

  return {
    render({ title, headline, cards = [] } = {}) {
      if (titleEl) {
        titleEl.textContent = title || "Run Briefing";
      }
      if (headlineEl) {
        headlineEl.textContent = headline || "Core objectives and risk posture will update as the run evolves.";
      }
      if (!gridEl) return;

      const safeCards = Array.isArray(cards) ? cards.slice(0, 4) : [];
      gridEl.innerHTML = safeCards
        .map((card) => {
          const tone = card?.tone ? ` data-tone="${escapeHtml(card.tone)}"` : "";
          const meta = card?.meta ? `<div class="briefing-card__meta">${escapeHtml(card.meta)}</div>` : "";
          return `
            <article class="briefing-card"${tone}>
              <div class="briefing-card__label">${escapeHtml(card?.label || "Status")}</div>
              <div class="briefing-card__value">${escapeHtml(card?.value || "-")}</div>
              ${meta}
            </article>
          `;
        })
        .join("");
    }
  };
}
