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
  const holdSection = rows.length ? `
    <div class="row" style="justify-content:space-between;">
      <div>Portfolio</div>
      <div class="mini">Holdings overview</div>
    </div>
    <table>
      <thead><tr><th>Sym</th><th>Qty</th><th>Avg Cost</th><th>Price</th><th>P/L</th><th>Value</th></tr></thead>
      <tbody>${rows.join('')}</tbody>
    </table>` : '<div class="mini">No holdings.</div>';

  const mRows = [];
  for (const lot of ctx.state.marginPositions){
    const a = ctx.assets.find(x => x.sym === lot.sym);
    if (!a) continue;
    const price = a.price;
    const value = lot.qty * price;
    const pl = (price - lot.entry) * lot.qty;
    mRows.push(`<tr><td>${lot.sym}</td><td>${lot.qty}</td><td>${fmt(lot.entry)}</td><td>${lot.leverage}x</td><td>${fmt(lot.liqPrice)}</td><td>${(lot.maintReq*100).toFixed(0)}%</td><td class="${pl>=0?'up':'down'}">${fmt(pl)}</td><td>${fmt(value)}</td></tr>`);
  }
  const marginSection = (ctx.state.upgrades.leverage>0 || mRows.length) ? (`
    <div class="section">
      <div class="row" style="justify-content:space-between;">
        <div>Margin</div>
        <div class="mini">Leveraged positions</div>
      </div>
      ${mRows.length ? `<table><thead><tr><th>Sym</th><th>Qty</th><th>Entry</th><th>Lev</th><th>Liq Price</th><th>Maint</th><th>P/L</th><th>Value</th></tr></thead><tbody>${mRows.join('')}</tbody></table>` : '<div class="mini">No margin positions.</div>'}
    </div>`):'';

  const oRows = [];
  for (const opt of ctx.state.optionPositions) {
    const a = ctx.assets.find(x => x.sym === opt.sym);
    if (!a) continue;
    const pl = (opt.mark - opt.premium) * opt.qty;
    const val = opt.mark * opt.qty;
    oRows.push(`<tr><td>${opt.sym}</td><td>${opt.type}</td><td>${fmt(opt.strike)}</td><td>${Math.max(0,Math.round(opt.dte))}</td><td>${opt.qty}</td><td>${fmt(opt.premium)}</td><td>${fmt(opt.mark)}</td><td class="${pl>=0?'up':'down'}">${fmt(pl)}</td><td>${fmt(val)}</td></tr>`);
  }
  const optionsSection = (ctx.state.upgrades.options || oRows.length) ? (`
    <div class="section">
      <div class="row" style="justify-content:space-between;">
        <div>Options</div>
        <div class="mini">Options positions</div>
      </div>
      ${oRows.length ? `<table><thead><tr><th>Sym</th><th>Type</th><th>Strike</th><th>DTE</th><th>Qty</th><th>Premium</th><th>Mark</th><th>P/L</th><th>Value</th></tr></thead><tbody>${oRows.join('')}</tbody></table>` : '<div class="mini">No options positions.</div>'}
    </div>`):'';

  root.innerHTML = holdSection + marginSection + optionsSection;
}
