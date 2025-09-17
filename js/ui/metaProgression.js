import { META_CURRENCY_SYMBOL } from "../core/metaProgression.js";

const refs = {};
const handlers = {
  onStartRun: null,
  onResumeRun: null,
  onPurchaseUpgrade: null,
  onClose: null
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatMoney = (value) =>
  `$${Number(value || 0).toLocaleString(undefined, {
    maximumFractionDigits: 0
  })}`;

const formatCurrency = (value) =>
  `${Number(value || 0).toLocaleString()} ${META_CURRENCY_SYMBOL}`;

function ensureRefs() {
  if (refs.layer) return true;
  refs.layer = document.getElementById("meta-layer");
  if (!refs.layer) return false;
  refs.dialog = refs.layer.querySelector(".meta-dialog");
  refs.balance = document.getElementById("meta-balance");
  refs.summary = document.getElementById("meta-summary");
  refs.history = document.getElementById("meta-history");
  refs.upgrades = document.getElementById("meta-upgrades");
  refs.start = document.getElementById("btn-meta-start");
  refs.resume = document.getElementById("btn-meta-resume");
  refs.close = document.getElementById("btn-meta-close");
  return true;
}

function renderSummary(summary, meta) {
  if (!refs.summary) return;
  const lifetime = meta?.lifetime || {};
  const lifetimeStats = [
    { label: "Runs Completed", value: lifetime.runs ?? 0 },
    { label: "Best Net Worth", value: formatMoney(lifetime.bestNetWorth ?? 0) },
    { label: "Total Profit", value: formatMoney(lifetime.totalProfit ?? 0) },
    { label: "Research Earned", value: formatCurrency(lifetime.totalMeta ?? 0) }
  ];

  let html = "<h3>Last Run</h3>";
  if (summary) {
    const stats = [
      { label: "Outcome", value: summary.label },
      { label: "Days Survived", value: summary.days ?? 0 },
      { label: "Net Worth", value: formatMoney(summary.netWorth ?? 0) },
      { label: "Realized P&L", value: formatMoney(summary.realized ?? 0) },
      { label: "Trades", value: summary.trades ?? 0 },
      { label: "Peak Net Worth", value: formatMoney(summary.maxNetWorth ?? 0) }
    ];
    html += '<ul class="meta-stats">';
    for (const item of stats) {
      html += `<li><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.value)}</strong></li>`;
    }
    html += "</ul>";
    html += `<div class="meta-reward">Research Earned: <strong>${escapeHtml(
      `${summary.metaReward ?? 0} ${META_CURRENCY_SYMBOL}`
    )}</strong></div>`;
  } else {
    html += '<div class="empty">Complete a run to unlock research insights.</div>';
  }

  html += '<div class="meta-divider"></div><h3>Lifetime</h3><ul class="meta-stats">';
  for (const item of lifetimeStats) {
    html += `<li><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.value)}</strong></li>`;
  }
  html += "</ul>";
  refs.summary.innerHTML = html;
}

function renderHistory(history) {
  if (!refs.history) return;
  let html = "<h3>Run History</h3>";
  if (!history || history.length === 0) {
    html += '<div class="empty">No completed runs yet.</div>';
  } else {
    html += '<ul class="meta-history-list">';
    history.slice(0, 5).forEach((entry) => {
      html += `<li><span>${escapeHtml(entry.label)}</span><span>${escapeHtml(
        formatMoney(entry.netWorth ?? 0)
      )}</span></li>`;
    });
    html += "</ul>";
  }
  refs.history.innerHTML = html;
}

function renderUpgrades(upgrades) {
  if (!refs.upgrades) return;
  let html = "<h3>Meta Upgrades</h3>";
  if (!upgrades || upgrades.length === 0) {
    html += '<div class="empty">No upgrades available.</div>';
  } else {
    html += '<div class="meta-upgrade-grid">';
    upgrades.forEach((upgrade) => {
      const locked = upgrade.locked;
      const maxed = upgrade.level >= upgrade.maxLevel;
      const disabled = maxed || locked || !upgrade.canAfford;
      const classes = ["meta-upgrade-card"];
      if (locked) classes.push("locked");
      if (maxed) classes.push("maxed");
      html += `<div class="${classes.join(" ")}">`;
      html += `<h4>${escapeHtml(upgrade.name)} <span class="meta-upgrade-level">L${upgrade.level}/${upgrade.maxLevel}</span></h4>`;
      html += `<p>${escapeHtml(upgrade.description)}</p>`;
      if (upgrade.preview) {
        html += `<p class="meta-upgrade-preview">${escapeHtml(upgrade.preview)}</p>`;
      }
      html += '<div class="meta-upgrade-meta">';
      if (!maxed && upgrade.nextCost != null) {
        html += `<span>Cost: ${escapeHtml(`${upgrade.nextCost} ${META_CURRENCY_SYMBOL}`)}</span>`;
      } else if (maxed) {
        html += "<span>Max level reached</span>";
      }
      if (upgrade.requirement && upgrade.requirement.length) {
        html += `<span>Req: ${escapeHtml(upgrade.requirement)}</span>`;
      }
      html += "</div>";
      html += '<div class="meta-upgrade-actions">';
      html += `<button class="btn btn-primary" data-upgrade-id="${escapeHtml(upgrade.id)}" ${
        disabled ? "disabled" : ""
      }>${escapeHtml(maxed ? "Maxed" : locked ? "Locked" : "Purchase")}</button>`;
      html += "</div>";
      html += "</div>";
    });
    html += "</div>";
  }
  refs.upgrades.innerHTML = html;
}

export function initMetaLayer({ onStartRun, onResumeRun, onPurchaseUpgrade, onClose } = {}) {
  if (!ensureRefs()) return;
  handlers.onStartRun = onStartRun;
  handlers.onResumeRun = onResumeRun;
  handlers.onPurchaseUpgrade = onPurchaseUpgrade;
  handlers.onClose = onClose;

  if (refs.start) {
    refs.start.addEventListener("click", () => {
      handlers.onStartRun && handlers.onStartRun();
    });
  }
  if (refs.resume) {
    refs.resume.addEventListener("click", () => {
      handlers.onResumeRun && handlers.onResumeRun();
    });
  }
  if (refs.close) {
    refs.close.addEventListener("click", () => {
      hideMetaLayer();
      handlers.onClose && handlers.onClose();
    });
  }
  if (refs.layer) {
    refs.layer.addEventListener("click", (event) => {
      if (event.target === refs.layer) {
        hideMetaLayer();
        handlers.onClose && handlers.onClose();
      }
    });
  }
  if (refs.upgrades) {
    refs.upgrades.addEventListener("click", (event) => {
      const button = event.target.closest("[data-upgrade-id]");
      if (!button || button.disabled) return;
      const id = button.getAttribute("data-upgrade-id");
      handlers.onPurchaseUpgrade && handlers.onPurchaseUpgrade(id);
    });
  }
  hideMetaLayer();
}

export function updateMetaLayer({ meta, upgrades, summary, history, allowResume, canStart }) {
  if (!ensureRefs()) return;
  if (refs.balance) refs.balance.textContent = formatCurrency(meta?.currency ?? 0);
  renderSummary(summary, meta);
  renderHistory(history);
  renderUpgrades(upgrades);
  if (refs.start) refs.start.disabled = !canStart;
  if (refs.resume) refs.resume.style.display = allowResume ? "inline-flex" : "none";
}

export function showMetaLayer() {
  if (!ensureRefs()) return;
  refs.layer.classList.add("show");
  refs.layer.setAttribute("aria-hidden", "false");
}

export function hideMetaLayer() {
  if (!ensureRefs()) return;
  refs.layer.classList.remove("show");
  refs.layer.setAttribute("aria-hidden", "true");
}

