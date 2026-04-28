import { RUN_MODULE_DEFS, computeRunCommandSnapshot, listRunModules } from "../core/runCommand.js";

const MODULE_BY_ID = new Map(RUN_MODULE_DEFS.map((definition) => [definition.id, definition]));

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatMoney = (value) => {
  const amount = Number(value) || 0;
  return `$${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
};

const toneForHeat = (heat) => {
  if (heat >= 95) return "bad";
  if (heat >= 70) return "warn";
  return "good";
};

export function createRunCommandController({ onChooseModule } = {}) {
  const root = document.querySelector('[data-module="run-command"]');
  if (!root) {
    return { render() {} };
  }

  const statusEl = root.querySelector('[data-region="command-status"]');
  const progressEl = root.querySelector('[data-element="command-progress"]');
  const progressLabelEl = root.querySelector('[data-element="command-progress-label"]');
  const choicesEl = root.querySelector('[data-region="command-choices"]');
  const modulesEl = root.querySelector('[data-region="command-modules-owned"]');

  if (choicesEl) {
    choicesEl.addEventListener("click", (event) => {
      const button = event.target.closest("[data-choice-id]");
      if (!button || typeof onChooseModule !== "function") return;
      onChooseModule(button.getAttribute("data-choice-id"));
    });
  }

  const renderChoice = (id, state) => {
    const definition = MODULE_BY_ID.get(id);
    if (!definition) return "";
    const level = Number(state?.command?.modules?.[id]) || 0;
    const nextLevel = Math.min(definition.maxLevel, level + 1);
    return `
      <article class="run-command-choice">
        <div class="run-command-choice__body">
          <span class="run-command-choice__role">${escapeHtml(definition.role)} L${nextLevel}</span>
          <strong>${escapeHtml(definition.name)}</strong>
          <p>${escapeHtml(definition.description)}</p>
          <span>${escapeHtml(definition.effect(nextLevel))}</span>
        </div>
        <button class="btn btn-primary" type="button" data-choice-id="${escapeHtml(id)}">Install</button>
      </article>
    `;
  };

  const renderModule = (module) => {
    if (!module.level) return "";
    return `
      <span class="run-command-module">
        ${escapeHtml(module.name)} <strong>L${module.level}</strong>
      </span>
    `;
  };

  return {
    render(state) {
      if (!state) return;
      const snapshot = computeRunCommandSnapshot(state);
      const heatTone = toneForHeat(snapshot.heatPct);

      if (statusEl) {
        statusEl.innerHTML = `
          <article class="run-command-gauge">
            <span>Target</span>
            <strong>${formatMoney(snapshot.targetNetWorth)}</strong>
            <small>Stage ${snapshot.stage} | ${Math.round(snapshot.progressPct)}%</small>
          </article>
          <article class="run-command-gauge" data-tone="${heatTone}">
            <span>Risk Heat</span>
            <strong>${Math.round(snapshot.heatPct)}%</strong>
            <small>Drawdown ${snapshot.drawdownPct.toFixed(1)}% / ${snapshot.riskBudgetPct.toFixed(0)}%</small>
          </article>
          <article class="run-command-gauge">
            <span>Exposure</span>
            <strong>${Math.round(snapshot.exposurePct)}%</strong>
            <small>Safe band ${snapshot.safeExposurePct.toFixed(0)}%</small>
          </article>
        `;
      }

      if (progressEl) {
        progressEl.style.width = `${Math.min(100, snapshot.progressPct)}%`;
        progressEl.dataset.tone = snapshot.progressPct >= 100 ? "good" : heatTone;
      }
      if (progressLabelEl) {
        progressLabelEl.textContent = `${formatMoney(snapshot.equity)} / ${formatMoney(snapshot.targetNetWorth)}`;
      }

      if (choicesEl) {
        const choices = Array.isArray(snapshot.choices) ? snapshot.choices : [];
        if (choices.length) {
          choicesEl.innerHTML = `
            <div class="run-command-draft__reason">${escapeHtml(snapshot.choiceReason || "Choose a command module.")}</div>
            ${choices.map((id) => renderChoice(id, state)).join("")}
          `;
        } else {
          choicesEl.innerHTML = `
            <div class="run-command-empty">
              Earn drafts by clearing portfolio targets, surviving resupply days, or chaining disciplined trades.
            </div>
          `;
        }
      }

      if (modulesEl) {
        const modules = listRunModules(state).map(renderModule).filter(Boolean);
        modulesEl.innerHTML = modules.length
          ? modules.join("")
          : '<span class="run-command-module run-command-module--empty">No modules installed</span>';
      }
    }
  };
}

