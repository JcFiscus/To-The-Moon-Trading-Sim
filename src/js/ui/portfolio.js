import { sell } from '../core/trading.js';
import { fmt, pct } from '../util/format.js';

// Render simple portfolio table
export function renderPortfolio(root, ctx) {
  const rows = Object.entries(ctx.state.positions)
    .filter(([, qty]) => qty > 0)
    .map(([sym, qty]) => {
      const a = ctx.assets.find(x => x.sym === sym);
      const basis = ctx.state.costBasis[sym]?.avg || 0;
      const pl = (a.price - basis) * qty;
      const ret = basis ? (a.price / basis - 1) : 0;
      return { sym, qty, basis, pl, ret };
    });

  root.innerHTML = `
    <div class="card-head"><strong>Portfolio</strong></div>
    <table class="tbl">
      <thead><tr><th>Sym</th><th>Qty</th><th>Basis</th><th>P/L</th><th>Ret%</th><th></th></tr></thead>
      <tbody>
        ${rows.map(r => `
          <tr data-sym="${r.sym}">
            <td>${r.sym}</td>
            <td>${r.qty}</td>
            <td>${fmt(r.basis)}</td>
            <td class="${r.pl >= 0 ? 'up' : 'down'}">${fmt(r.pl)}</td>
            <td class="${r.ret >= 0 ? 'up' : 'down'}">${pct(r.ret)}</td>
            <td><button class="mini sellall">Sell</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  root.querySelectorAll('.sellall').forEach(btn => {
    const sym = btn.closest('tr').dataset.sym;
    btn.onclick = () => {
      const qty = ctx.state.positions[sym];
      if (qty) sell(ctx, sym, qty);
      renderPortfolio(root, ctx);
    };
  });
}
