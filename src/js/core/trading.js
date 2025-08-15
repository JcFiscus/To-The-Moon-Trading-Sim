import { clamp } from '../util/math.js';
import { CFG } from '../config.js';

export function buy(ctx, sym, qty, opts={}){
  qty = Math.max(1, Math.floor(qty));
  const lev = opts.leverage || 1;
  const a = ctx.assets.find(x => x.sym === sym);
  if (!a) return;
  const price = a.price;

  if (lev <= 1){
    const fee = Math.max(ctx.state.minFee, qty * price * ctx.state.feeRate);
    const cost = qty * price + fee;
    if (ctx.state.cash >= cost) {
      ctx.state.cash -= cost;
    } else {
      const short = cost - ctx.state.cash;
      ctx.state.cash = 0; ctx.state.debt += short;
    }
    ctx.state.positions[sym] = (ctx.state.positions[sym] || 0) + qty;
    const cb = ctx.state.costBasis[sym] || {qty:0, avg:0};
    const newQty = cb.qty + qty;
    cb.avg = (cb.qty * cb.avg + qty * price) / Math.max(1, newQty);
    cb.qty = newQty; ctx.state.costBasis[sym] = cb;
    ctx.day.feesPaid += fee;
    const share = qty / a.supply;
    a.localDemand = clamp(a.localDemand + share * 9, 0.5, 2.5);
    for (const o of ctx.assets){ if (o !== a) o.localDemand = clamp(o.localDemand - share * CFG.OPP_COST_SPILL, 0.5, 2.5); }
    a.flowToday += qty;
    opts.log?.(`Bought ${qty} ${sym} @ $${price.toFixed(2)} (+fee $${fee.toFixed(2)})`);
  } else {
    const exposure = qty * lev;
    const fee = Math.max(ctx.state.minFee, exposure * price * ctx.state.feeRate);
    const margin = exposure * price / lev;
    const cost = margin + fee;
    if (ctx.state.cash >= cost) ctx.state.cash -= cost;
    else { const short = cost - ctx.state.cash; ctx.state.cash = 0; ctx.state.debt += short; }
    const borrowed = exposure * price - margin;
    ctx.state.debt += borrowed;
    const maint = CFG.MAINT_REQ_BY_LEV[lev] ?? 0.15;
    const liq = price * ((1 - (1/lev)) / (1 - maint));
    ctx.state.marginPositions.push({
      id:`${sym}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
      sym, qty: exposure, entry:price, leverage:lev, maintReq:maint, liqPrice:liq
    });
    ctx.day.feesPaid += fee;
    const share = exposure / a.supply;
    a.localDemand = clamp(a.localDemand + share * 9, 0.5, 2.5);
    for (const o of ctx.assets){ if (o !== a) o.localDemand = clamp(o.localDemand - share * CFG.OPP_COST_SPILL, 0.5, 2.5); }
    a.flowToday += exposure;
    opts.log?.(`Bought ${exposure} ${sym} @ $${price.toFixed(2)} x${lev} (+fee $${fee.toFixed(2)})`);
  }
}

export function sell(ctx, sym, qty, opts={}){
  qty = Math.max(1, Math.floor(qty));
  const a = ctx.assets.find(x => x.sym === sym);
  if (!a) return 0;
  let remaining = qty;
  let sold = 0;
  // Close margin lots first (LIFO)
  for (let i = ctx.state.marginPositions.length-1; i >=0 && remaining>0; i--){
    const lot = ctx.state.marginPositions[i];
    if (lot.sym !== sym) continue;
    const closeQty = Math.min(lot.qty, remaining);
    const price = a.price;
    const fee = Math.max(ctx.state.minFee, closeQty * price * ctx.state.feeRate);
    const profit = (price - lot.entry) * closeQty;
    const margin = (closeQty / lot.leverage) * lot.entry;
    const borrowed = closeQty * lot.entry - margin;
    const cashAdd = margin + profit - fee;
    ctx.state.cash += cashAdd;
    ctx.state.realizedPnL += profit;
    ctx.day.realized += profit;
    ctx.day.feesPaid += fee;
    ctx.state.debt = Math.max(0, ctx.state.debt - borrowed);
    lot.qty -= closeQty;
    sold += closeQty;
    remaining -= closeQty;
    if (lot.qty <=0) ctx.state.marginPositions.splice(i,1);
    opts.log?.(`Sold ${closeQty} ${sym} @ $${price.toFixed(2)} (margin x${lot.leverage}, realized ${profit>=0?'+':'-'}$${Math.abs(profit).toFixed(2)})`);
  }
  if (remaining>0){
    const have = ctx.state.positions[sym] || 0;
    const sellQty = Math.min(have, remaining);
    if (sellQty){
      const price = a.price;
      const fee = Math.max(ctx.state.minFee, sellQty * price * ctx.state.feeRate);
      const proceeds = sellQty * price - fee;
      ctx.state.positions[sym] = have - sellQty;
      const cb = ctx.state.costBasis[sym] || {qty:0, avg:0};
      const realized = sellQty * (price - cb.avg);
      cb.qty = Math.max(0, cb.qty - sellQty);
      if (cb.qty === 0) cb.avg = 0;
      ctx.state.costBasis[sym] = cb;
      ctx.state.realizedPnL += realized;
      ctx.day.realized += realized;
      ctx.day.feesPaid += fee;
      const pay = Math.min(ctx.state.debt, proceeds);
      ctx.state.debt -= pay; ctx.state.cash += (proceeds - pay);
      sold += sellQty;
      remaining -= sellQty;
      opts.log?.(`Sold ${sellQty} ${sym} @ $${price.toFixed(2)} (realized ${realized>=0?'+':'-'}$${Math.abs(realized).toFixed(2)})`);
    } else {
      opts.log?.(`Cannot sell ${remaining} ${sym}: no holdings`);
    }
  }
  const share = sold / a.supply;
  a.localDemand = clamp(a.localDemand - share * 0.5, 0.5, 2.5);
  a.flowToday -= sold;
  return sold;
}

export function checkMargin(ctx, hooks={}){
  for (let i = ctx.state.marginPositions.length - 1; i >= 0; i--) {
    const lot = ctx.state.marginPositions[i];
    const a = ctx.assets.find(x => x.sym === lot.sym);
    if (!a) continue;
    const price = a.price;
    if (price <= lot.liqPrice) {
      const fee = Math.max(ctx.state.minFee, lot.qty * price * ctx.state.feeRate);
      const IM = 1 / lot.leverage;
      const profit = (price - lot.entry) * lot.qty;
      const liqFee = lot.qty * price * (CFG.LIQUIDATION_FEE_BP / 10000);
      const cashAdd = IM * lot.entry * lot.qty + profit - fee - liqFee;
      ctx.state.cash += cashAdd;
      ctx.state.realizedPnL += profit;
      ctx.day.realized += profit;
      ctx.day.feesPaid += fee + liqFee;
      const borrowed = lot.entry * lot.qty - (IM * lot.entry * lot.qty);
      ctx.state.debt = Math.max(0, ctx.state.debt - borrowed);
      ctx.state.marginPositions.splice(i, 1);
      hooks.log?.(`Liquidated ${lot.qty} ${lot.sym} @ $${price.toFixed(2)} (x${lot.leverage})`);
      if (lot.leverage >= 100) ctx.gameOver = true;
    }
  }
  let port = 0;
  for (const a of ctx.assets) port += (ctx.state.positions[a.sym] || 0) * a.price;
  for (const m of ctx.state.marginPositions) {
    const a = ctx.assets.find(x => x.sym === m.sym);
    if (a) port += m.qty * a.price;
  }
  const net = ctx.state.cash + port - ctx.state.debt;
  if (net <= 0) ctx.gameOver = true;
}
