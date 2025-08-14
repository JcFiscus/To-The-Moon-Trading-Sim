import { fmt, pct } from '../util/format.js';

export function buildMarketTable({ tbody, assets, state, onSelect, onBuy, onSell }){
  tbody.innerHTML = '';
  for (const a of assets){
    const tr = document.createElement('tr'); tr.dataset.sym = a.sym;
    tr.innerHTML = `
      <td><b>${a.sym}</b> <span class="mini">• ${a.name}</span></td>
      <td class="price" id="p-${a.sym}"></td>
      <td class="change" id="c-${a.sym}"></td>
      <td id="an-${a.sym}"><span class="analyst neu">Neutral</span></td>
      <td class="holdings" id="h-${a.sym}">0</td>
      <td class="value" id="v-${a.sym}">$0.00</td>
      <td>
        <div class="row">
          <input class="qty" type="number" min="1" step="1" value="10" id="q-${a.sym}" />
          <button class="accent" id="b-${a.sym}">Buy</button>
          <button class="bad" id="s-${a.sym}">Sell</button>
        </div>
      </td>`;
    tbody.appendChild(tr);
    tr.addEventListener('click', (e) => {
      if (e.target.tagName === 'BUTTON' || e.target.classList.contains('qty')) return;
      onSelect(a.sym);
    });
    document.getElementById(`b-${a.sym}`).addEventListener('click', () => {
      const qty = parseInt(document.getElementById(`q-${a.sym}`).value || '0', 10);
      onBuy(a.sym, qty);
    });
    document.getElementById(`s-${a.sym}`).addEventListener('click', () => {
      const qty = parseInt(document.getElementById(`q-${a.sym}`).value || '0', 10);
      onSell(a.sym, qty);
    });
  }
}

export function renderMarketTable(ctx){
  for (const a of ctx.assets){
    const price = a.price, prev = a.history[a.history.length-2] || price;
    const d = price/prev - 1;
    const pEl = document.getElementById(`p-${a.sym}`);
    const cEl = document.getElementById(`c-${a.sym}`);
    const hEl = document.getElementById(`h-${a.sym}`);
    const vEl = document.getElementById(`v-${a.sym}`);
    if (pEl) pEl.textContent = fmt(price);
    if (cEl) { cEl.textContent = pct(d); cEl.className = 'change ' + (d>=0?'up':'down'); }
    const have = ctx.state.positions[a.sym] || 0;
    if (hEl) hEl.textContent = have.toLocaleString();
    if (vEl) vEl.textContent = fmt(have * price);

    const badge = document.getElementById(`an-${a.sym}`);
    const t = a.analyst?.tone || 'Neutral', cls = a.analyst?.cls || 'neu';
    const conf = Math.round((a.analyst?.conf || 0.5) * 100);
    if (badge) badge.innerHTML = `<span class="analyst ${cls}">${t}</span> <span class="mini">(${conf}% conf)</span>`;
  }
}
