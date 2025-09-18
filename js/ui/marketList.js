const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatMoney = (value) => {
  const absolute = Math.abs(Number(value) || 0);
  return `${value < 0 ? "-" : ""}$${absolute.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
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

const pickTone = (value) => {
  if (value > 0.0001) return "good";
  if (value < -0.0001) return "bad";
  return "neutral";
};

export function createMarketListController({
  onSelectAsset,
  onDefaultQtyChange,
  parseQty
} = {}) {
  const root = document.querySelector('[data-module="market"]');
  if (!root) {
    return {
      render() {},
      setDefaultQty() {}
    };
  }

  const tableBody = root.querySelector('[data-region="market-body"]');
  const emptyState = root.querySelector('[data-element="market-empty"]');
  const qtyInput = root.querySelector('[data-element="default-qty"]');

  let lastSelectedId = null;

  const coerceQty = (value) => {
    if (typeof parseQty === "function") return parseQty(value);
    const numeric = Math.floor(Number(value));
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 1;
  };

  if (qtyInput && typeof onDefaultQtyChange === "function") {
    qtyInput.addEventListener("change", () => {
      const qty = coerceQty(qtyInput.value);
      qtyInput.value = String(qty);
      onDefaultQtyChange(qty);
    });
  }

  if (tableBody) {
    tableBody.addEventListener("click", (event) => {
      const row = event.target.closest("tr[data-id]");
      if (!row) return;
      const id = row.getAttribute("data-id");
      if (id && typeof onSelectAsset === "function") {
        onSelectAsset(id);
      }
    });
  }

  function renderRow(asset, state) {
    const positions = state.positions || {};
    const position = positions[asset.id] || { qty: 0, avgCost: 0 };
    const qty = Number(position.qty) || 0;
    const avg = Number(position.avgCost) || 0;
    const unrealized = qty > 0 ? (asset.price - avg) * qty : 0;
    const change = Number(asset.changePct) || 0;
    const tone = pickTone(change);
    const badge = `<span class="badge badge--${tone}">${change >= 0 ? "+" : ""}${change.toFixed(2)}%</span>`;
    const plTone = pickTone(unrealized);
    const hasPosition = qty > 0;
    const qtyLabel = hasPosition ? qty.toLocaleString() : "—";
    const positionMeta = hasPosition ? `Avg ${formatPrice(avg)}` : "No holdings";
    const holdBadge = hasPosition ? '<span class="ticker__status">Held</span>' : "";
    const plDisplay = hasPosition ? `<span class="pl--${plTone}">${formatMoney(unrealized)}</span>` : "—";

    return `
      <tr data-id="${escapeHtml(asset.id)}" ${asset.id === lastSelectedId ? "data-selected=\"true\"" : ""} data-has-position="${hasPosition}">
        <td class="ticker${hasPosition ? " ticker--held" : ""}">
          <span class="ticker__symbol">${escapeHtml(asset.id)}</span>
          ${holdBadge}
        </td>
        <td class="name">${escapeHtml(asset.name)}</td>
        <td class="num">${formatPrice(asset.price)}</td>
        <td class="change">${badge}</td>
        <td class="position${hasPosition ? " position--active" : ""}">
          <span class="position__qty">${qtyLabel}</span>
          <span class="position__meta">${positionMeta}</span>
        </td>
        <td class="num pl-cell">${plDisplay}</td>
      </tr>
    `;
  }

  return {
    render(state) {
      if (!tableBody) return;
      const assets = Array.isArray(state?.assets) ? state.assets : [];
      lastSelectedId = state?.selected ?? null;

      if (assets.length === 0) {
        tableBody.innerHTML = "";
        if (emptyState) emptyState.classList.remove("is-hidden");
        return;
      }

      const rows = assets.map((asset) => renderRow(asset, state)).join("");
      tableBody.innerHTML = rows;
      if (emptyState) emptyState.classList.add("is-hidden");
    },

    setDefaultQty(value) {
      if (!qtyInput) return;
      const qty = coerceQty(value);
      qtyInput.value = String(qty);
    }
  };
}
