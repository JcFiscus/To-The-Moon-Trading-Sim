const formatMoney = (value) => {
  const amount = Number(value) || 0;
  return `${amount < 0 ? "-" : ""}$${Math.abs(amount).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
};

const formatPrice = (value) => {
  const amount = Number(value) || 0;
  const digits = Math.abs(amount) >= 1 ? 2 : 4;
  return `$${amount.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  })}`;
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const toneForValue = (value) => {
  if (value > 0.0001) return "good";
  if (value < -0.0001) return "bad";
  return "neutral";
};

export function createPortfolioLedgerController({ onSelectAsset } = {}) {
  const root = document.querySelector('[data-module="portfolio-ledger"]');
  if (!root) {
    return { render() {} };
  }

  const tableBody = root.querySelector('[data-region="portfolio-body"]');
  const emptyState = root.querySelector('[data-element="portfolio-empty"]');

  if (tableBody && typeof onSelectAsset === "function") {
    tableBody.addEventListener("click", (event) => {
      const row = event.target.closest("tr[data-id]");
      if (!row) return;
      const id = row.getAttribute("data-id");
      if (id) onSelectAsset(id);
    });
  }

  return {
    render(state) {
      if (!tableBody) return;
      const assets = Array.isArray(state?.assets) ? state.assets : [];
      const positions = state?.positions && typeof state.positions === "object" ? state.positions : {};
      const holdings = assets
        .map((asset) => {
          const position = positions[asset.id];
          if (!position || !Number.isFinite(position.qty) || position.qty <= 0) return null;
          const qty = position.qty;
          const avgCost = Number(position.avgCost) || 0;
          const mark = Number(asset.price) || 0;
          const marketValue = qty * mark;
          const pnl = (mark - avgCost) * qty;
          return {
            id: asset.id,
            name: asset.name,
            qty,
            avgCost,
            mark,
            marketValue,
            pnl
          };
        })
        .filter(Boolean);

      const totalValue = holdings.reduce((sum, entry) => sum + entry.marketValue, 0);
      if (holdings.length === 0) {
        tableBody.innerHTML = "";
        if (emptyState) emptyState.classList.remove("is-hidden");
        return;
      }

      holdings.sort((left, right) => right.marketValue - left.marketValue);
      tableBody.innerHTML = holdings
        .map((entry) => {
          const weight = totalValue > 0 ? (entry.marketValue / totalValue) * 100 : 0;
          const tone = toneForValue(entry.pnl);
          const selected = state?.selected === entry.id ? ' data-selected="true"' : "";
          return `
            <tr data-id="${escapeHtml(entry.id)}" data-clickable="true"${selected}>
              <td>
                <div class="ticker">
                  <span class="ticker__symbol">${escapeHtml(entry.id)}</span>
                </div>
              </td>
              <td class="num">${entry.qty.toLocaleString()}</td>
              <td class="num">${formatPrice(entry.avgCost)}</td>
              <td class="num">${formatPrice(entry.mark)}</td>
              <td class="num">${weight.toFixed(weight >= 10 ? 0 : 1)}%</td>
              <td class="num"><span class="pl--${tone}">${formatMoney(entry.pnl)}</span></td>
            </tr>
          `;
        })
        .join("");

      if (emptyState) emptyState.classList.add("is-hidden");
    }
  };
}
