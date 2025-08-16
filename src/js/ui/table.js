import { buy, sell } from '../core/trading.js';
import { fmt } from '../util/format.js';

const ROW_HEIGHT = 44;

export function renderMarket(root, ctx, { onSelect } = {}) {
  root.innerHTML = `
    <div class="market-head">
      <span class="mh-sym">Asset</span>
      <span class="mh-price">Price</span>
      <span class="mh-chg">Day</span>
      <span class="mh-ticker">Ticker</span>
      <span class="mh-actions">Trade</span>
    </div>
    <ul class="market" role="listbox" aria-label="Assets"></ul>
  `;
  const list = root.querySelector('.market');

  ctx.assets.forEach((a, i) => list.appendChild(makeRow(a, i === 0)));

  function makeRow(asset, selected) {
    const li = document.createElement('li');
    li.className = `asset-row${selected ? ' selected' : ''}`;
    li.setAttribute('role', 'option');
    li.dataset.sym = asset.sym;
    li.style.height = ROW_HEIGHT + 'px';
    const prev = asset.history[asset.history.length - 2] || asset.price;
    const dayCh = asset.price / prev - 1;

    li.innerHTML = `
      <span class="sym">${asset.sym}</span>
      <span class="price">${fmt(asset.price)}</span>
      <span class="chg ${dayCh >= 0 ? 'up' : 'down'}">${(dayCh * 100).toFixed(2)}%</span>
      <span class="ticker"><span class="tape" id="tk-${asset.sym}">${asset.sym} • ${fmt(asset.price)} • FV ${fmt(asset.fair)}</span></span>
      <div class="actions">
        <button class="qty dec" aria-label="Decrease quantity">−</button>
        <input class="qty" type="number" value="10" min="1" step="1" inputmode="numeric" />
        <button class="qty inc" aria-label="Increase quantity">+</button>
        <button class="buy">Buy</button>
        <button class="sell">Sell</button>
      </div>
    `;

    li.addEventListener('click', () => select(asset.sym));
    li.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        onTrade('buy');
      } else if (e.key === 'Enter' && e.shiftKey) {
        onTrade('sell');
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        li.nextElementSibling?.focus();
        li.nextElementSibling?.classList.add('selected');
        li.classList.remove('selected');
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        li.previousElementSibling?.focus();
        li.previousElementSibling?.classList.add('selected');
        li.classList.remove('selected');
      } else if (e.key === 'Escape') {
        li.classList.remove('selected');
      }
    });

    const qtyInput = li.querySelector('input.qty');
    li.querySelector('.dec').onclick = () => qtyInput.stepDown();
    li.querySelector('.inc').onclick = () => qtyInput.stepUp();

    const onTrade = side => {
      const qty = Math.max(1, parseInt(qtyInput.value, 10) || 1);
      if (side === 'buy') buy(ctx, asset.sym, qty);
      else sell(ctx, asset.sym, qty);
    };

    li.querySelector('.buy').onclick = () => onTrade('buy');
    li.querySelector('.sell').onclick = () => onTrade('sell');

    function select(sym) {
      list.querySelectorAll('.asset-row.selected').forEach(r => r.classList.remove('selected'));
      li.classList.add('selected');
      onSelect?.(sym);
      li.focus();
    }

    if (selected) select(asset.sym);
    return li;
  }
}
