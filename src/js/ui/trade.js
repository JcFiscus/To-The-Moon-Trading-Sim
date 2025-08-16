import { renderOverlay } from './overlay.js';

export function showTradeDrawer(anchorRect, model){
  const el = document.createElement('div');
  el.className = 'ui-drawer trade-drawer';
  el.setAttribute('role','dialog');
  el.setAttribute('aria-modal','true');
  Object.assign(el.style, { top: '0px', right: '0px', height: '100vh', width: '360px' });

  el.innerHTML = `
    <header class="drawer-header">
      <strong>${model.symbol}</strong>
      <button class="close" aria-label="Close">×</button>
    </header>
    <div class="drawer-body">
      <label>Qty <input type="number" value="10" min="1" step="1" id="trade-qty"></label>
      <div class="btn-row">
        <button id="buy" class="buy">Buy</button>
        <button id="sell" class="sell">Sell</button>
      </div>
      <p class="hint">↵ Enter to submit • Esc to close</p>
    </div>
  `;
  const unmount = renderOverlay(el);

  function close(){
    unmount();
    model.onClose?.();
  }

  el.querySelector('.close').onclick = close;
  el.addEventListener('keydown', e => { if(e.key === 'Escape') close(); });

  const qtyInput = el.querySelector('#trade-qty');
  qtyInput.focus();
  const getQty = () => parseInt(qtyInput.value || '0',10);

  el.querySelector('#buy').onclick = () => { model.onBuy?.(getQty()); close(); };
  el.querySelector('#sell').onclick = () => { model.onSell?.(getQty()); close(); };
}
