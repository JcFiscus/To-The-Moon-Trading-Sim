import { fmt, pct } from '../util/format.js';
import { CFG } from '../config.js';
import { openOptionsDialog } from './options.js';

export function buildMarketTable({ table, assets, state, onSelect, onBuy, onSell, onOption }) {
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

  const closeAllTradeBars = () => {
    document.querySelectorAll('.trade-bar.open').forEach(bar => {
      bar.classList.remove('open');
      const btn = bar.previousElementSibling;
      if (btn && btn.classList.contains('trade-btn')) {
        btn.setAttribute('aria-expanded', 'false');
      }
    });
  };

  if (!document.body.dataset.tradeListener) {
    document.addEventListener('click', e => {
      if (!e.target.closest('.trade')) closeAllTradeBars();
    });
    document.body.dataset.tradeListener = '1';
  }

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
    tradeBtn.textContent = 'Trade \u25BE';
    tradeBtn.setAttribute('aria-label', `Trade ${a.sym}`);
    tradeBtn.setAttribute('aria-haspopup', 'true');
    tradeBtn.setAttribute('aria-expanded', 'false');

    const tradeBar = document.createElement('div');
    tradeBar.className = 'trade-bar';
    tradeBar.setAttribute('role', 'group');
    tradeBar.setAttribute('aria-label', `Trade actions for ${a.sym}`);

    const qtyId = `q-${a.sym}`;
    const qtyLabel = document.createElement('label');
    qtyLabel.htmlFor = qtyId;
    qtyLabel.textContent = 'Quantity';
    qtyLabel.className = 'sr-only';
    const qtyInput = document.createElement('input');
    qtyInput.className = 'qty';
    qtyInput.type = 'number';
    qtyInput.min = '1';
    qtyInput.step = '1';
    qtyInput.value = '10';
    qtyInput.id = qtyId;
    qtyInput.setAttribute('aria-label', `Quantity for ${a.sym}`);
    tradeBar.append(qtyLabel, qtyInput);

    let levSel;
    if (state.upgrades.leverage > 0) {
      const levId = `lv-${a.sym}`;
      const levLabel = document.createElement('label');
      levLabel.htmlFor = levId;
      levLabel.textContent = 'Leverage';
      levLabel.className = 'sr-only';
      levSel = document.createElement('select');
      levSel.className = 'lev';
      levSel.id = levId;
      levSel.setAttribute('aria-label', `Leverage for ${a.sym}`);
      const levels = CFG.LEVERAGE_LEVELS.slice(0, state.upgrades.leverage + 1);
      const last = state.ui?.lastLev?.[a.sym] || 1;
      levels.forEach(lv => {
        const opt = document.createElement('option');
        opt.value = lv;
        opt.textContent = lv + 'x';
        if (lv === last) opt.selected = true;
        levSel.appendChild(opt);
      });
      levSel.addEventListener('change', e => {
        state.ui.lastLev[a.sym] = parseInt(e.target.value, 10);
      });
      tradeBar.append(levLabel, levSel);
    } else {
      const lock = document.createElement('span');
      lock.className = 'lock';
      lock.id = `lv-${a.sym}`;
      lock.setAttribute('aria-label', 'Unlock leverage in Upgrades');
      lock.textContent = '\uD83D\uDD12';
      tradeBar.appendChild(lock);
    }

    const buyBtn = document.createElement('button');
    buyBtn.className = 'accent';
    buyBtn.id = `b-${a.sym}`;
    buyBtn.textContent = 'Buy';
    buyBtn.setAttribute('aria-label', `Buy ${a.sym}`);
    tradeBar.appendChild(buyBtn);

    const buyMaxBtn = document.createElement('button');
    buyMaxBtn.className = 'accent';
    buyMaxBtn.id = `bm-${a.sym}`;
    buyMaxBtn.textContent = 'Max';
    buyMaxBtn.setAttribute('aria-label', `Buy max ${a.sym}`);
    tradeBar.appendChild(buyMaxBtn);

    const sellBtn = document.createElement('button');
    sellBtn.className = 'bad';
    sellBtn.id = `s-${a.sym}`;
    sellBtn.textContent = 'Sell';
    sellBtn.setAttribute('aria-label', `Sell ${a.sym}`);
    tradeBar.appendChild(sellBtn);

    let optBtn;
    if (state.upgrades.options) {
      optBtn = document.createElement('button');
      optBtn.className = 'accent';
      optBtn.id = `o-${a.sym}`;
      optBtn.textContent = 'Opt';
      optBtn.setAttribute('aria-label', `Options for ${a.sym}`);
      tradeBar.appendChild(optBtn);
      optBtn.addEventListener('click', () => {
        openOptionsDialog(a, opt => {
          onOption && onOption(a.sym, opt);
        });
      });
    }

    tradeTd.append(tradeBtn, tradeBar);
    tr.appendChild(tradeTd);
    tbody.appendChild(tr);

    const toggleTrade = show => {
      closeAllTradeBars();
      if (show) {
        tradeBar.classList.add('open');
        tradeBtn.setAttribute('aria-expanded', 'true');
        qtyInput.focus();
      } else {
        tradeBar.classList.remove('open');
        tradeBtn.setAttribute('aria-expanded', 'false');
      }
    };

    tradeBtn.addEventListener('click', e => {
      e.stopPropagation();
      onSelect(a.sym);
      const open = tradeBar.classList.contains('open');
      toggleTrade(!open);
    });

    tr.addEventListener('click', e => {
      const tag = e.target.tagName;
      if (['BUTTON', 'INPUT', 'SELECT', 'LABEL'].includes(tag)) return;
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
        onSelect(a.sym);
        toggleTrade(true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeAllTradeBars();
      } else if (e.key === 'Tab' && !e.shiftKey) {
        const first = tr.querySelector('input,select,button');
        if (first) {
          e.preventDefault();
          first.focus();
        }
      }
    });

    const navEls = [qtyInput, levSel, buyBtn, buyMaxBtn, sellBtn, optBtn].filter(Boolean);
    navEls.forEach(el => {
      el.addEventListener('keydown', e => {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          moveFocus(1);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          moveFocus(-1);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          toggleTrade(false);
          tr.focus();
        }
      });
    });

    const getLev = () => (state.upgrades.leverage > 0 ? parseInt(levSel.value, 10) : 1);
    buyBtn.addEventListener('click', () => {
      const qty = parseInt(qtyInput.value || '0', 10);
      const lev = getLev();
      onBuy(a.sym, qty, lev);
    });
    buyMaxBtn.addEventListener('click', () => {
      const price = a.price;
      const lev = getLev();
      let qty = Math.floor((state.cash - state.minFee) / price);
      if (qty < 0) qty = 0;
      while (qty > 0) {
        const exposure = qty * (lev > 1 ? lev : 1);
        const fee = Math.max(state.minFee, exposure * price * state.feeRate);
        const cost = qty * price + fee;
        if (cost <= state.cash) break;
        qty--;
      }
      onBuy(a.sym, qty, lev);
    });
    sellBtn.addEventListener('click', () => {
      const qty = parseInt(qtyInput.value || '0', 10);
      const lev = getLev();
      onSell(a.sym, qty, lev);
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

