import { fmt, pct } from '../util/format.js';
import { showTradeDrawer } from './trade.js';

export function buildMarketTable({ table, assets, onSelect, onBuy, onSell }) {
  table.innerHTML = '';

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  ['Symbol', 'Price', 'Δ', 'Analyst', 'Holdings', 'Value', 'Actions'].forEach(h => {
    const th = document.createElement('th');
    th.textContent = h;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  table.appendChild(tbody);

  // trade drawer rendered in overlay; no inline trade bars

  const rows = [];
  for (const a of assets) {
    const tr = document.createElement('tr');
    tr.dataset.sym = a.sym;
    tr.tabIndex = 0;
    tr.setAttribute('aria-label', `Select ${a.sym}`);

    const symTd = document.createElement('td');
    symTd.title = a.name;
    const symSpan = document.createElement('span');
    symSpan.textContent = a.sym;
    const tipSpan = document.createElement('span');
    tipSpan.id = `tip-${a.sym}`;
    tipSpan.className = 'tip-indicator';
    symTd.append(symSpan, tipSpan);
    tr.appendChild(symTd);

    const priceTd = document.createElement('td');
    priceTd.className = 'price';
    priceTd.id = `p-${a.sym}`;
    tr.appendChild(priceTd);

    const changeTd = document.createElement('td');
    changeTd.className = 'change';
    changeTd.id = `c-${a.sym}`;
    tr.appendChild(changeTd);

    const analystTd = document.createElement('td');
    analystTd.id = `an-${a.sym}`;
    analystTd.innerHTML = '<span class="analyst neu">Neutral</span>';
    tr.appendChild(analystTd);

    const holdingsTd = document.createElement('td');
    holdingsTd.className = 'holdings';
    holdingsTd.id = `h-${a.sym}`;
    holdingsTd.textContent = '0';
    tr.appendChild(holdingsTd);

    const valueTd = document.createElement('td');
    valueTd.className = 'value';
    valueTd.id = `v-${a.sym}`;
    valueTd.textContent = '$0.00';
    tr.appendChild(valueTd);

    const tradeTd = document.createElement('td');
    tradeTd.className = 'trade';

    const tradeBtn = document.createElement('button');
    tradeBtn.className = 'trade-btn';
    tradeBtn.id = `t-${a.sym}`;
    tradeBtn.textContent = 'Trade';
    tradeBtn.setAttribute('aria-label', `Trade ${a.sym}`);
    tradeBtn.addEventListener('click', () => {
      onSelect(a.sym);
      showTradeDrawer(tr.getBoundingClientRect(), {
        symbol: a.sym,
        onBuy: qty => onBuy(a.sym, qty, 1),
        onSell: qty => onSell(a.sym, qty, 1),
        onClose: () => tr.focus()
      });
    });

    tradeTd.appendChild(tradeBtn);
    tr.appendChild(tradeTd);
    tbody.appendChild(tr);

    tr.addEventListener('click', e => {
      if (e.target.tagName === 'BUTTON') return;
      onSelect(a.sym);
    });

    const moveFocus = dir => {
      const idx = rows.indexOf(tr);
      const next = rows[(idx + dir + rows.length) % rows.length];
      next.focus();
      onSelect(next.dataset.sym);
    };

    tr.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        moveFocus(1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        moveFocus(-1);
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        tradeBtn.click();
      }
    });

    rows.push(tr);
  }
}

export function renderMarketTable(ctx) {
  for (const a of ctx.assets) {
    const price = a.price, prev = a.history[a.history.length - 2] || price;
    const d = price / prev - 1;
    const pEl = document.getElementById(`p-${a.sym}`);
    const cEl = document.getElementById(`c-${a.sym}`);
    const hEl = document.getElementById(`h-${a.sym}`);
    const vEl = document.getElementById(`v-${a.sym}`);
    if (pEl) pEl.textContent = fmt(price);
    if (cEl) { cEl.textContent = pct(d); cEl.className = 'change ' + (d >= 0 ? 'up' : 'down'); }
    const margin = (ctx.state.marginPositions || []).filter(l => l.sym === a.sym).reduce((s, l) => s + l.qty, 0);
    const have = (ctx.state.positions[a.sym] || 0) + margin;
    if (hEl) hEl.textContent = have.toLocaleString();
    if (vEl) vEl.textContent = fmt(have * price);

    const badge = document.getElementById(`an-${a.sym}`);
    const t = a.analyst?.tone || 'Neutral', cls = a.analyst?.cls || 'neu';
    const conf = Math.round((a.analyst?.conf || 0.5) * 100);
    if (badge) badge.innerHTML = `<span class="analyst ${cls}">${t}</span> <span class="mini">(${conf}% conf)</span>`;

    const tipEl = document.getElementById(`tip-${a.sym}`);
    if (tipEl) {
      const tip = ctx.state.insiderTip;
      if (tip && tip.sym === a.sym && tip.daysLeft > 0) {
        tipEl.textContent = (tip.bias > 0 ? '⬆' : '⬇') + tip.daysLeft;
        tipEl.className = 'tip-indicator ' + (tip.bias > 0 ? 'bull' : 'bear');
        tipEl.title = `Insider Tip: ${tip.bias > 0 ? 'Bullish' : 'Bearish'} (${tip.daysLeft}d) μ ${(tip.mu * 100).toFixed(2)}% σ ${(tip.sigma * 100).toFixed(2)}%`;
        tipEl.style.display = 'inline';
      } else {
        tipEl.textContent = '';
        tipEl.removeAttribute('title');
        tipEl.style.display = 'none';
        tipEl.className = 'tip-indicator';
      }
    }

    const tr = document.querySelector(`#marketTable tr[data-sym="${a.sym}"]`);
    if (tr) {
      const tip = ctx.state.insiderTip;
      tr.classList.toggle('tipped', tip && tip.sym === a.sym && tip.daysLeft > 0);
      tr.classList.toggle('selected', ctx.selected === a.sym);
      tr.setAttribute('aria-selected', ctx.selected === a.sym);
    }
  }
}

