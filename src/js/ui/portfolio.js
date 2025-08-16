import { fmt } from '../util/format.js';

export function renderPortfolio(root, ctx) {
  const rows = Object.entries(ctx.state.positions)
    .filter(([, qty]) => qty > 0)
    .map(([sym, qty]) => {
      const a = ctx.assets.find(x => x.sym === sym);
      const basis = ctx.state.costBasis[sym]?.avg || 0;
      const pl = (a.price - basis) * qty;
      const ret = basis ? (pl / (basis * qty)) : 0;
      return { symbol: sym, qty, basis, pl, ret };
    });

  root.innerHTML = `
    <div class="card-head"><strong>Portfolio</strong></div>
    <table class="tbl">
      <thead><tr>
        <th>Sym</th><th>Qty</th><th>Basis</th><th>P/L</th><th>Ret%</th><th></th>
      </tr></thead>
      <tbody>
        ${rows.map(r => `
          <tr data-sym="${r.symbol}">
            <td>${r.symbol}</td>
            <td>${r.qty}</td>
            <td>${fmt(r.basis)}</td>
            <td class="${r.pl >= 0 ? 'up':'down'}">${fmt(r.pl)}</td>
            <td class="${r.ret >= 0 ? 'up':'down'}">${(r.ret*100).toFixed(2)}%</td>
            <td><button class="mini sellall">Sell</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}
