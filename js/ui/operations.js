import { summarizeOperations } from "../core/operations.js";

const formatMoney = (value) => {
  const amount = Number.isFinite(value) ? value : 0;
  return `$${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
};

const progressLabel = (contract) => {
  const progress = Number.isFinite(contract?.progressQty) ? contract.progressQty : 0;
  const target = Number.isFinite(contract?.targetQty) ? contract.targetQty : 0;
  return `${Math.min(progress, target)}/${target}`;
};

export function createOperationsController({ onClaim } = {}) {
  const root = document.querySelector('[data-module="operations"]');
  if (!root) {
    return { render() {} };
  }

  const summaryEl = root.querySelector('[data-region="operations-summary"]');
  const listEl = root.querySelector('[data-region="operations-list"]');
  const emptyEl = root.querySelector('[data-element="operations-empty"]');

  const claim = (contractId) => {
    if (!contractId || typeof onClaim !== "function") return;
    onClaim(contractId);
  };

  const renderContract = (contract, { claimable = false } = {}) => {
    const article = document.createElement("article");
    article.className = `operation-card${claimable ? " operation-card--claimable" : ""}`;

    const sideLabel = contract.side === "either" ? "BUY/SELL" : contract.side.toUpperCase();
    const progress = Number.isFinite(contract.targetQty) && contract.targetQty > 0
      ? Math.min(100, Math.round(((contract.progressQty || 0) / contract.targetQty) * 100))
      : 0;

    article.innerHTML = `
      <header class="operation-card__header">
        <div>
          <p class="operation-card__eyebrow">${sideLabel} · ${contract.assetId}</p>
          <h4>${contract.label}</h4>
        </div>
        <div class="operation-card__reward">${formatMoney(contract.rewardCash)} · +${contract.rewardRep} REP</div>
      </header>
      <div class="operation-card__progress">
        <span>Flow ${progressLabel(contract)}</span>
        <span>DUE D${contract.dueDay}</span>
      </div>
      <div class="operation-card__bar"><span style="width:${progress}%;"></span></div>
    `;

    if (claimable) {
      const actions = document.createElement("div");
      actions.className = "operation-card__actions";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn btn-primary";
      button.textContent = "Claim Reward";
      button.addEventListener("click", () => claim(contract.id));
      actions.appendChild(button);
      article.appendChild(actions);
    }

    return article;
  };

  return {
    render(state) {
      const summary = summarizeOperations(state);
      if (summaryEl) {
        summaryEl.innerHTML = `
          <div class="operations-pill">REP <strong>${summary.reputation}</strong></div>
          <div class="operations-pill">ACTIVE <strong>${summary.activeCount}</strong></div>
          <div class="operations-pill">READY <strong>${summary.readyToClaim}</strong></div>
          <div class="operations-pill">COMPLETED <strong>${summary.completed}</strong></div>
          <div class="operations-pill">FAILED <strong>${summary.failed}</strong></div>
        `;
      }

      if (!listEl) return;
      listEl.querySelectorAll('.operation-card').forEach((node) => node.remove());

      const claimable = summary.claimableContracts || [];
      const active = summary.activeContracts || [];

      const hasAny = claimable.length + active.length > 0;
      if (emptyEl) {
        emptyEl.style.display = hasAny ? "none" : "block";
      }

      claimable.forEach((contract) => {
        listEl.appendChild(renderContract(contract, { claimable: true }));
      });
      active.forEach((contract) => {
        listEl.appendChild(renderContract(contract));
      });
    }
  };
}
