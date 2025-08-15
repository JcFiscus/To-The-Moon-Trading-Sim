import { fmt } from '../util/format.js';

function plCell(value) {
  const td = document.createElement('td');
  td.textContent = fmt(value);
  td.className = value >= 0 ? 'up' : 'down';
  return td;
}

export function renderPortfolio(ctx){
  const root = document.getElementById('portfolio');
  if (!root) return;
  root.innerHTML = '';

  // Holdings
  const holdRows = [];
  for (const a of ctx.assets){
    const qty = ctx.state.positions[a.sym] || 0;
    if (!qty) continue;
    const avg = ctx.state.costBasis[a.sym]?.avg || 0;
    const price = a.price;
    const value = qty * price;
    const pl = (price - avg) * qty;
    holdRows.push({ a, qty, avg, price, value, pl });
  }

  if (holdRows.length){
    const header = document.createElement('div');
    header.className = 'row';
    header.style.justifyContent = 'space-between';
    header.innerHTML = '<div>Portfolio</div><div class="mini">Holdings overview</div>';
    root.appendChild(header);

    const table = document.createElement('table');
    table.innerHTML = '<thead><tr><th>Sym</th><th>Qty</th><th>Avg Cost</th><th>Price</th><th>P/L</th><th>Value</th></tr></thead>';
    const tbody = document.createElement('tbody');
    for (const row of holdRows){
      const tr = document.createElement('tr');
      tr.appendChild(Object.assign(document.createElement('td'),{textContent: row.a.sym}));
      tr.appendChild(Object.assign(document.createElement('td'),{textContent: row.qty.toLocaleString()}));
      tr.appendChild(Object.assign(document.createElement('td'),{textContent: fmt(row.avg)}));
      tr.appendChild(Object.assign(document.createElement('td'),{textContent: fmt(row.price)}));
      tr.appendChild(plCell(row.pl));
      tr.appendChild(Object.assign(document.createElement('td'),{textContent: fmt(row.value)}));
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    root.appendChild(table);
  } else {
    const div = document.createElement('div');
    div.className = 'mini';
    div.textContent = 'No holdings.';
    root.appendChild(div);
  }

  // Margin
  const mRows = [];
  for (const lot of ctx.state.marginPositions){
    const a = ctx.assets.find(x => x.sym === lot.sym);
    if (!a) continue;
    const price = a.price;
    const value = lot.qty * price;
    const pl = (price - lot.entry) * lot.qty;
    mRows.push({ lot, price, value, pl });
  }

  if (ctx.state.upgrades.leverage>0 || mRows.length){
    const section = document.createElement('div');
    section.className = 'section';
    const header = document.createElement('div');
    header.className = 'row';
    header.style.justifyContent = 'space-between';
    header.innerHTML = '<div>Margin</div><div class="mini">Leveraged positions</div>';
    section.appendChild(header);
    if (mRows.length){
      const table = document.createElement('table');
      table.innerHTML = '<thead><tr><th>Sym</th><th>Qty</th><th>Entry</th><th>Lev</th><th>Liq Price</th><th>Maint</th><th>P/L</th><th>Value</th></tr></thead>';
      const tbody = document.createElement('tbody');
      for (const r of mRows){
        const tr = document.createElement('tr');
        tr.appendChild(Object.assign(document.createElement('td'),{textContent: r.lot.sym}));
        tr.appendChild(Object.assign(document.createElement('td'),{textContent: r.lot.qty}));
        tr.appendChild(Object.assign(document.createElement('td'),{textContent: fmt(r.lot.entry)}));
        tr.appendChild(Object.assign(document.createElement('td'),{textContent: r.lot.leverage + 'x'}));
        tr.appendChild(Object.assign(document.createElement('td'),{textContent: fmt(r.lot.liqPrice)}));
        tr.appendChild(Object.assign(document.createElement('td'),{textContent: (r.lot.maintReq*100).toFixed(0)+'%'}));
        tr.appendChild(plCell(r.pl));
        tr.appendChild(Object.assign(document.createElement('td'),{textContent: fmt(r.value)}));
        tbody.appendChild(tr);
      }
      table.appendChild(tbody);
      section.appendChild(table);
    } else {
      const div = document.createElement('div');
      div.className = 'mini';
      div.textContent = 'No margin positions.';
      section.appendChild(div);
    }
    root.appendChild(section);
  }

  // Options
  const oRows = [];
  for (const opt of ctx.state.optionPositions){
    const a = ctx.assets.find(x => x.sym === opt.sym);
    if (!a) continue;
    const pl = (opt.mark - opt.premium) * opt.qty;
    const val = opt.mark * opt.qty;
    oRows.push({ opt, pl, val });
  }

  if (ctx.state.upgrades.options || oRows.length){
    const section = document.createElement('div');
    section.className = 'section';
    const header = document.createElement('div');
    header.className = 'row';
    header.style.justifyContent = 'space-between';
    header.innerHTML = '<div>Options</div><div class="mini">Options positions</div>';
    section.appendChild(header);
    if (oRows.length){
      const table = document.createElement('table');
      table.innerHTML = '<thead><tr><th>Sym</th><th>Type</th><th>Strike</th><th>DTE</th><th>Qty</th><th>Premium</th><th>Mark</th><th>P/L</th><th>Value</th></tr></thead>';
      const tbody = document.createElement('tbody');
      for (const r of oRows){
        const tr = document.createElement('tr');
        tr.appendChild(Object.assign(document.createElement('td'),{textContent: r.opt.sym}));
        tr.appendChild(Object.assign(document.createElement('td'),{textContent: r.opt.type}));
        tr.appendChild(Object.assign(document.createElement('td'),{textContent: fmt(r.opt.strike)}));
        tr.appendChild(Object.assign(document.createElement('td'),{textContent: Math.max(0,Math.round(r.opt.dte))}));
        tr.appendChild(Object.assign(document.createElement('td'),{textContent: r.opt.qty}));
        tr.appendChild(Object.assign(document.createElement('td'),{textContent: fmt(r.opt.premium)}));
        tr.appendChild(Object.assign(document.createElement('td'),{textContent: fmt(r.opt.mark)}));
        tr.appendChild(plCell(r.pl));
        tr.appendChild(Object.assign(document.createElement('td'),{textContent: fmt(r.val)}));
        tbody.appendChild(tr);
      }
      table.appendChild(tbody);
      section.appendChild(table);
    } else {
      const div = document.createElement('div');
      div.className = 'mini';
      div.textContent = 'No options positions.';
      section.appendChild(div);
    }
    root.appendChild(section);
  }
}
