const coerceQty = (value, parseQty) => {
  if (typeof parseQty === "function") return parseQty(value);
  const numeric = Math.floor(Number(value));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 1;
};

const clampRisk = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.min(250, Math.round(numeric * 10) / 10);
};

const formatPrice = (price) => {
  const numeric = Number(price) || 0;
  const abs = Math.abs(numeric);
  const digits = abs >= 1000 ? 2 : abs >= 1 ? 2 : 4;
  return `$${numeric.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  })}`;
};

const formatMoney = (value) => {
  const numeric = Number(value) || 0;
  const absolute = Math.abs(numeric);
  return `${numeric < 0 ? "-" : ""}$${absolute.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
};

export function createTradeControlsController({
  onBuy,
  onSell,
  onQtyChange,
  onRiskChange,
  parseQty
} = {}) {
  const root = document.querySelector('[data-module="trade-controls"]');
  if (!root) {
    return {
      setQty() {},
      setRiskPlan() {},
      showMessage() {},
      updateSelection() {}
    };
  }

  const qtyInput = root.querySelector('[data-element="trade-qty"]');
  const stopInput = root.querySelector('[data-element="risk-stop-loss"]');
  const takeInput = root.querySelector('[data-element="risk-take-profit"]');
  const buyBtn = root.querySelector('[data-action="trade-buy"]');
  const sellBtn = root.querySelector('[data-action="trade-sell"]');
  const clearRiskBtn = root.querySelector('[data-action="trade-clear-risk"]');
  const messageEl = root.querySelector('[data-element="trade-message"]');
  const assetLabel = root.querySelector('[data-element="trade-asset"]');
  const positionLabel = root.querySelector('[data-element="trade-position"]');
  const summaryEl = root.querySelector('[data-element="trade-plan-summary"]');

  let lastMessageTimeout = null;

  const readQty = () => coerceQty(qtyInput ? qtyInput.value : 1, parseQty);
  const readRisk = () => ({
    stopLossPct: clampRisk(stopInput ? stopInput.value : 0),
    takeProfitPct: clampRisk(takeInput ? takeInput.value : 0)
  });

  const emitQtyChange = () => {
    if (!qtyInput || typeof onQtyChange !== "function") return;
    const qty = readQty();
    qtyInput.value = String(qty);
    onQtyChange(qty);
  };

  const emitRiskChange = () => {
    if (typeof onRiskChange !== "function") return;
    const next = readRisk();
    if (stopInput && document.activeElement !== stopInput) {
      stopInput.value = String(next.stopLossPct);
    }
    if (takeInput && document.activeElement !== takeInput) {
      takeInput.value = String(next.takeProfitPct);
    }
    onRiskChange(next);
  };

  if (qtyInput) {
    qtyInput.addEventListener("change", emitQtyChange);
    qtyInput.addEventListener("blur", emitQtyChange);
  }

  [stopInput, takeInput].forEach((input) => {
    if (!input) return;
    input.addEventListener("change", emitRiskChange);
    input.addEventListener("blur", emitRiskChange);
  });

  if (buyBtn && typeof onBuy === "function") {
    buyBtn.addEventListener("click", () => onBuy(readQty()));
  }

  if (sellBtn && typeof onSell === "function") {
    sellBtn.addEventListener("click", () => onSell(readQty()));
  }

  if (clearRiskBtn) {
    clearRiskBtn.addEventListener("click", () => {
      if (stopInput) stopInput.value = "0";
      if (takeInput) takeInput.value = "0";
      if (typeof onRiskChange === "function") {
        onRiskChange({ stopLossPct: 0, takeProfitPct: 0 });
      }
    });
  }

  return {
    setQty(value) {
      if (!qtyInput) return;
      qtyInput.value = String(coerceQty(value, parseQty));
    },

    setRiskPlan(plan = {}, { force = false } = {}) {
      const stopLossPct = clampRisk(plan?.stopLossPct);
      const takeProfitPct = clampRisk(plan?.takeProfitPct);

      if (stopInput && (force || document.activeElement !== stopInput)) {
        stopInput.value = String(stopLossPct);
      }
      if (takeInput && (force || document.activeElement !== takeInput)) {
        takeInput.value = String(takeProfitPct);
      }
    },

    showMessage(message, tone = "info") {
      if (!messageEl) return;
      messageEl.textContent = message || "";
      messageEl.dataset.tone = tone;
      messageEl.classList.toggle("is-hidden", !message);
      clearTimeout(lastMessageTimeout);
      if (message) {
        lastMessageTimeout = setTimeout(() => {
          messageEl.textContent = "";
          messageEl.dataset.tone = "info";
          messageEl.classList.add("is-hidden");
        }, 4200);
      }
    },

    updateSelection({ asset, position, plan } = {}) {
      if (assetLabel) {
        assetLabel.textContent = asset ? `${asset.id} | ${asset.name}` : "Select an asset from Market Radar.";
      }

      if (positionLabel) {
        if (!asset) {
          positionLabel.textContent = "No active position.";
        } else if (!position || position.qty <= 0) {
          positionLabel.textContent = "Flat. Exit rules will arm automatically when you enter.";
        } else {
          const unrealized = (asset.price - position.avgCost) * position.qty;
          positionLabel.textContent = `${position.qty} shares at ${formatPrice(position.avgCost)} | Unrealized ${formatMoney(unrealized)}`;
        }
      }

      if (summaryEl) {
        const stopLossPct = clampRisk(plan?.stopLossPct);
        const takeProfitPct = clampRisk(plan?.takeProfitPct);
        if (!asset) {
          summaryEl.textContent = "No automatic exits configured.";
        } else if ((!stopLossPct && !takeProfitPct) || !position || position.qty <= 0) {
          summaryEl.textContent = stopLossPct || takeProfitPct
            ? "Exit rules are saved and will use your next entry price."
            : "No automatic exits configured.";
        } else {
          const parts = [];
          if (stopLossPct > 0) {
            const stopPrice = position.avgCost * (1 - stopLossPct / 100);
            parts.push(`Stop at ${formatPrice(stopPrice)} (-${stopLossPct.toFixed(1)}%)`);
          }
          if (takeProfitPct > 0) {
            const takePrice = position.avgCost * (1 + takeProfitPct / 100);
            parts.push(`Take profit at ${formatPrice(takePrice)} (+${takeProfitPct.toFixed(1)}%)`);
          }
          summaryEl.textContent = parts.join(" | ");
        }
      }

      const disabled = !asset;
      [qtyInput, stopInput, takeInput].forEach((input) => {
        if (!input) return;
        input.disabled = disabled;
      });
      [buyBtn, sellBtn, clearRiskBtn].forEach((button) => {
        if (!button) return;
        button.disabled = disabled;
      });
    }
  };
}
