// src/js/ui/table.js
const fmtPrice = (n) => '$' + n.toFixed(2);
const fmtQty = (n) => n.toLocaleString();
const fmtVal = (n) =>
  (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
const deltaClass = (d) => (d > 0 ? 'pos' : d < 0 ? 'neg' : '');

export function renderTable(state, onSelect, onTrade) {
  const tbody = document.getElementById('assets-body'); // ← query at render time
  if (!tbody) return;

  tbody.innerHTML = '';
  for (const a of state.assets) {
    const tr = document.createElement('tr');
    tr.dataset.sym = a.sym;

    const delta = a.price - a.prevClose;

    tr.innerHTML = `
      <td class="sym">
        <button class="link select" data-sym="${a.sym}" title="Select ${a.name}">${a.sym}</button>
        <div class="sub">${a.name}</div>
      </td>
      <td class="num">${fmtPrice(a.price)}</td>
      <td class="num ${deltaClass(delta)}">${delta >= 0 ? '▲' : delta < 0 ? '▼' : ''} ${fmtPrice(Math.abs(delta))}</td>
      <td>${a.analyst}</td>
      <td class="num">${fmtQty(a.qty)}</td>
      <td class="num">${fmtVal(a.qty * a.price)}</td>
      <td>
        <div class="trade">
          <button class="btn tiny buy" data-sym="${a.sym}" data-q="1">+1</button>
          <button class="btn tiny buy" data-sym="${a.sym}" data-q="10">+10</button>
          <button class="btn tiny buy" data-sym="${a.sym}" data-q="max">Max</button>
          <button class="btn tiny sell" data-sym="${a.sym}" data-q="-1">Sell</button>
        </div>
      </td>
    `;
    if (state.selected === a.sym) tr.classList.add('selected');
    tbody.appendChild(tr);
  }

  // event delegation (click)
  tbody.onclick = (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;

    if (t.classList.contains('select')) {
      const sym = t.dataset.sym;
      onSelect && onSelect(sym);
      [...tbody.children].forEach((row) => row.classList.toggle('selected', row.dataset.sym === sym));
      return;
    }

    if (t.classList.contains('buy') || t.classList.contains('sell')) {
      const sym = t.dataset.sym;
      const q = t.dataset.q === 'max' ? computeMaxBuy(sym) : parseInt(t.dataset.q, 10);
      onTrade && onTrade(sym, q);
    }
  };

  function computeMaxBuy(sym) {
    const a = state.assets.find((x) => x.sym === sym);
    if (!a) return 0;
    return Math.max(0, Math.floor((state.cash / a.price) * 0.95));
  }
}

export function bindTableHandlers(/* onSelect, onTrade */) {
  // placeholder for future hotkeys / sort wiring
}