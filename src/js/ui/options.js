import { CFG } from '../config.js';

export function openOptionsDialog(asset, onConfirm){
  const typeRaw = prompt('Option type (call/put)', 'call');
  if (!typeRaw) return;
  const type = typeRaw.toLowerCase() === 'put' ? 'put' : 'call';
  const strike = parseFloat(prompt('Strike', asset.price.toFixed(2)));
  if (isNaN(strike)) return;
  const dte = parseInt(prompt(`DTE (${CFG.OPTIONS_DEFAULT_DTE.join('/')})`, String(CFG.OPTIONS_DEFAULT_DTE[0])), 10);
  if (!dte || dte <= 0) return;
  const qty = parseInt(prompt('Quantity', '1'), 10);
  if (!qty || qty <= 0) return;
  onConfirm({ type, strike, dte, qty });
}
