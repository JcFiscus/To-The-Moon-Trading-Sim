import { fmt } from '../util/format.js';

export function renderPortfolio(ctx){
  const root = document.getElementById('portfolio');
  if (!root) return;
  const rows = [];
  for (const a of ctx.assets){
    const qty = ctx.state.positions[a.sym] || 0;
    if (!qty) continue;
    const avg = ctx.state.costBasis[a.sym]?.avg || 0;
    const price = a.price;
    const value = qty * price;
    const pl = (price - avg) * qty;
    rows.push(`<tr>
      <td>${a.sym}</td>
      <td>${qty.toLocaleString()}</td>
      <td>${fmt(avg)}</td>
      <td>${fmt(price)}</td>
      <td class="${pl>=0?'up':'down'}">${fmt(pl)}</td>
      <td>${fmt(value)}</td>
    </tr>`);
  }
  if (!rows.length){
    root.innerHTML = '<div class="mini">No holdings.</div>';
    return;
  }
  root.innerHTML = `
    <div class="row" style="justify-content:space-between;">
      <div>Portfolio</div>
      <div class="mini">Holdings overview</div>
    </div>
    <table>
      <thead><tr><th>Sym</th><th>Qty</th><th>Avg Cost</th><th>Price</th><th>P/L</th><th>Value</th></tr></thead>
      <tbody>${rows.join('')}</tbody>
    </table>`;
}
