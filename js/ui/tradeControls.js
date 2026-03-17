const coerceQty = (value, parseQty) => {
  if (typeof parseQty === "function") return parseQty(value);
  const numeric = Math.floor(Number(value));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 1;
};

export function createTradeControlsController({ onBuy, onSell, onQtyChange, parseQty } = {}) {
  const root = document.querySelector('[data-module="trade-controls"]');
  if (!root) {
    return {
      setQty() {},
      showMessage() {},
      updateSelection() {}
    };
  }

  const qtyInput = root.querySelector('[data-element="trade-qty"]');
  const buyBtn = root.querySelector('[data-action="trade-buy"]');
  const sellBtn = root.querySelector('[data-action="trade-sell"]');
  const messageEl = root.querySelector('[data-element="trade-message"]');
  const assetLabel = root.querySelector('[data-element="trade-asset"]');

  let lastMessageTimeout = null;

  const readQty = () => coerceQty(qtyInput ? qtyInput.value : 1, parseQty);

  const emitQtyChange = () => {
    if (!qtyInput || typeof onQtyChange !== "function") return;
    const qty = readQty();
    qtyInput.value = String(qty);
    onQtyChange(qty);
  };

  if (qtyInput) {
    qtyInput.addEventListener("change", emitQtyChange);
    qtyInput.addEventListener("blur", emitQtyChange);
  }

  if (buyBtn && typeof onBuy === "function") {
    buyBtn.addEventListener("click", () => onBuy(readQty()));
  }

  if (sellBtn && typeof onSell === "function") {
    sellBtn.addEventListener("click", () => onSell(readQty()));
  }

  return {
    setQty(value) {
      if (!qtyInput) return;
      qtyInput.value = String(coerceQty(value, parseQty));
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

    updateSelection({ asset, position } = {}) {
      if (!assetLabel) return;
      if (!asset) {
        assetLabel.textContent = "Select an asset from Market Radar.";
        return;
      }
      const qty = position?.qty || 0;
      const suffix = qty > 0 ? ` | Holding ${qty}` : "";
      assetLabel.textContent = `${asset.id} - ${asset.name}${suffix}`;
    }
  };
}
