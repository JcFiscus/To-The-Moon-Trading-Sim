import { fmt, pct } from '../util/format.js';
import { CFG } from '../config.js';
import { openOptionsDialog } from './options.js';

export function buildMarketTable({ tbody, assets, state, onSelect, onBuy, onSell, onOption }){
  tbody.innerHTML = '';
  for (const a of assets){
    const tr = document.createElement('tr'); tr.dataset.sym = a.sym; if (a.isCrypto) tr.dataset.crypto = '1';
    tr.tabIndex = 0;
    tr.setAttribute('aria-label', `Select ${a.sym}`);
    tr.innerHTML = `
      <td><b>${a.sym}</b> <span class="mini">• ${a.name}</span></td>
      <td class="price" id="p-${a.sym}"></td>
      <td class="change" id="c-${a.sym}"></td>
      <td id="an-${a.sym}"><span class="analyst neu">Neutral</span></td>
      <td class="holdings" id="h-${a.sym}">0</td>
      <td class="value" id="v-${a.sym}">$0.00</td>
      <td class="trade">
        <div class="trade-inputs">
          <input class="qty" type="number" min="0" step="1" value="10" id="q-${a.sym}" />
          <button class="chip-btn" id="max-${a.sym}" title="Set max quantity">MAX</button>
          <button class="chip-btn" id="half-${a.sym}" title="Set half quantity">HALF</button>
          ${state.upgrades.leverage>0 ? `<select class="lev" id="lv-${a.sym}" title="Leverage multiplier"></select>` : `<span class="lock" id="lv-${a.sym}" title="Unlock Leverage in Upgrades">\uD83D\uDD12</span>`}
        </div>
        <div class="mini" id="f-${a.sym}"></div>
        <div class="trade-buttons">
          <button class="accent" id="b-${a.sym}" disabled>Buy</button>
          <button class="bad" id="s-${a.sym}" disabled>Sell</button>
          ${state.upgrades.options ? `<button class="accent" id="o-${a.sym}">Opt</button>` : ''}
        </div>
      </td>`;
    tbody.appendChild(tr);
    tr.addEventListener('click', (e) => {
      const tag = e.target.tagName;
      if (tag === 'BUTTON' || tag === 'INPUT' || tag === 'SELECT') return;
      if (e.target.classList.contains('qty')) return;
      onSelect(a.sym);
    });
    tr.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onSelect(a.sym);
      }
    });
    const qtyInput = document.getElementById(`q-${a.sym}`);
    const feeEl = document.getElementById(`f-${a.sym}`);
    const buyBtn = document.getElementById(`b-${a.sym}`);
    const sellBtn = document.getElementById(`s-${a.sym}`);

    const calcMax = () => {
      const price = a.price;
      let qty = Math.floor((state.cash - state.minFee) / price);
      if (qty < 0) qty = 0;
      const levSel = state.upgrades.leverage>0 ? document.getElementById(`lv-${a.sym}`) : null;
      const lev = levSel ? parseInt(levSel.value,10) : 1;
      while (qty > 0) {
        const fee = Math.max(state.minFee, qty * price * state.feeRate);
        const cost = qty * price * (lev>1?1/lev:1) + fee;
        if (cost <= state.cash) break;
        qty--;
      }
      const margin = (state.marginPositions||[]).filter(l=>l.sym===a.sym).reduce((s,l)=>s+l.qty,0);
      const have = (state.positions[a.sym] || 0) + margin;
      return Math.max(qty, have);
    };

    const updateControls = () => {
      let qty = parseInt(qtyInput.value,10);
      if (isNaN(qty) || qty < 0) qty = 0;
      qtyInput.value = qty;
      const price = a.price;
      const fee = qty > 0 ? Math.max(state.minFee, qty*price*state.feeRate) : 0;
      feeEl.textContent = qty>0 ? `Fee ${fmt(fee)}` : '';
      buyBtn.disabled = qty < 1;
      sellBtn.disabled = qty < 1;
    };

    qtyInput.addEventListener('input', updateControls);
    updateControls();

    document.getElementById(`max-${a.sym}`).addEventListener('click', () => {
      qtyInput.value = calcMax();
      updateControls();
    });
    document.getElementById(`half-${a.sym}`).addEventListener('click', () => {
      qtyInput.value = Math.floor(calcMax()/2);
      updateControls();
    });

    if (state.upgrades.leverage>0) {
      const sel = document.getElementById(`lv-${a.sym}`);
      const levels = CFG.LEVERAGE_LEVELS.slice(0, state.upgrades.leverage+1);
      const last = state.ui?.lastLev?.[a.sym] || 1;
      for (const lv of levels) {
        const opt = document.createElement('option');
        opt.value = lv; opt.textContent = lv+'x';
        if (lv === last) opt.selected = true;
        sel.appendChild(opt);
      }
      sel.addEventListener('change', (e)=>{ state.ui.lastLev[a.sym] = parseInt(e.target.value,10); updateControls(); });
    }

    buyBtn.addEventListener('click', () => {
      const qty = parseInt(qtyInput.value||'0',10);
      if (qty < 1) return;
      const lev = state.upgrades.leverage>0 ? parseInt(document.getElementById(`lv-${a.sym}`).value,10) : 1;
      onBuy(a.sym, qty, lev);
    });
    sellBtn.addEventListener('click', () => {
      const qty = parseInt(qtyInput.value||'0',10);
      if (qty < 1) return;
      const lev = state.upgrades.leverage>0 ? parseInt(document.getElementById(`lv-${a.sym}`).value,10) : 1;
      onSell(a.sym, qty, lev);
    });
    if (state.upgrades.options) {
      document.getElementById(`o-${a.sym}`).addEventListener('click', () => {
        openOptionsDialog(a, (opt) => { onOption && onOption(a.sym, opt); });
      });
    }
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
    const margin = (ctx.state.marginPositions||[]).filter(l=>l.sym===a.sym).reduce((s,l)=>s+l.qty,0);
    const have = (ctx.state.positions[a.sym] || 0) + margin;
    if (hEl) hEl.textContent = have.toLocaleString();
    if (vEl) vEl.textContent = fmt(have * price);

    const badge = document.getElementById(`an-${a.sym}`);
    const t = a.analyst?.tone || 'Neutral', cls = a.analyst?.cls || 'neu';
    const conf = Math.round((a.analyst?.conf || 0.5) * 100);
    if (badge) badge.innerHTML = `<span class="analyst ${cls}">${t}</span> <span class="mini">(${conf}% conf)</span>`;

    const tr = document.querySelector(`tr[data-sym="${a.sym}"]`);
    if (tr) {
      if (a.isCrypto) {
        tr.style.display = (ctx.state.upgrades.crypto && ctx.marketTab === 'crypto') ? '' : 'none';
      } else {
        tr.style.display = (ctx.marketTab === 'crypto') ? 'none' : '';
      }
    }
  }
}
