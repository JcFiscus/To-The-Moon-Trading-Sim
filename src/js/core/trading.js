import { clamp } from '../util/math.js';
import { CFG } from '../config.js';

export function buy(ctx, sym, qty, hooks){
  qty = Math.max(1, Math.floor(qty));
  const a = ctx.assets.find(x => x.sym === sym);
  if (!a) return;
  const price = a.price;
  const fee = Math.max(ctx.state.minFee, qty * price * ctx.state.feeRate);
  const cost = qty * price + fee;

  if (ctx.state.cash >= cost) {
    ctx.state.cash -= cost;
  } else {
    const short = cost - ctx.state.cash;
    ctx.state.cash = 0;
    ctx.state.debt += short;
  }
  ctx.state.positions[sym] = (ctx.state.positions[sym] || 0) + qty;

  // cost basis
  const cb = ctx.state.costBasis[sym] || {qty:0, avg:0};
  const newQty = cb.qty + qty;
  cb.avg = (cb.qty * cb.avg + qty * price) / Math.max(1, newQty);
  cb.qty = newQty; ctx.state.costBasis[sym] = cb;

  ctx.day.feesPaid += fee;

  // player impact
  const share = qty / a.supply;
  a.localDemand = clamp(a.localDemand + share * 9, 0.5, 2.5);
  for (const o of ctx.assets){ if (o !== a) o.localDemand = clamp(o.localDemand - share * CFG.OPP_COST_SPILL, 0.5, 2.5); }
  a.flowToday += qty;

  hooks?.log?.(`Bought ${qty} ${sym} @ $${price.toFixed(2)} (+fee $${fee.toFixed(2)})`);
}

export function sell(ctx, sym, qty, hooks){
  qty = Math.max(1, Math.floor(qty));
  const a = ctx.assets.find(x => x.sym === sym);
  if (!a) return;
  const have = ctx.state.positions[sym] || 0;
  const sellQty = Math.min(have, qty);
  if (!sellQty) { hooks?.log?.(`Cannot sell ${qty} ${sym}: no holdings`); return 0; }
  const price = a.price;
  const fee = Math.max(ctx.state.minFee, sellQty * price * ctx.state.feeRate);
  const proceeds = sellQty * price - fee;

  ctx.state.positions[sym] = have - sellQty;
  // realized P&L vs cost basis
  const cb = ctx.state.costBasis[sym] || {qty:0, avg:0};
  const realized = sellQty * (price - cb.avg);
  cb.qty = Math.max(0, cb.qty - sellQty);
  if (cb.qty === 0) cb.avg = 0;
  ctx.state.costBasis[sym] = cb;

  ctx.state.realizedPnL += realized;
  ctx.day.realized += realized;
  ctx.day.feesPaid += fee;

  // pay down debt first
  const pay = Math.min(ctx.state.debt, proceeds);
  ctx.state.debt -= pay; ctx.state.cash += (proceeds - pay);

  // impact
  const share = sellQty / a.supply;
  a.localDemand = clamp(a.localDemand - share * 0.5, 0.5, 2.5);
  a.flowToday -= sellQty;

  hooks?.log?.(`Sold ${sellQty} ${sym} @ $${price.toFixed(2)} (realized ${realized>=0?'+':'-'}$${Math.abs(realized).toFixed(2)})`);
  return sellQty;
}
