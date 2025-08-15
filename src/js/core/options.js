import { clamp } from '../util/math.js';
import { CFG } from '../config.js';

const DAYS_PER_YEAR = 252;

function erf(x){
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const a1 = 0.254829592,
        a2 = -0.284496736,
        a3 = 1.421413741,
        a4 = -1.453152027,
        a5 = 1.061405429,
        p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - ((((a5*t + a4)*t + a3)*t + a2)*t + a1)*t*Math.exp(-x*x);
  return sign * y;
}
function normCdf(x){ return 0.5 * (1 + erf(x / Math.sqrt(2))); }

function priceOptionInternal(S, K, T, sigma, type){
  const vol = clamp(sigma, CFG.OPTIONS_MIN_IV, CFG.OPTIONS_MAX_IV);
  if (T <= 0) {
    return type === 'call' ? Math.max(0, S - K) : Math.max(0, K - S);
  }
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + 0.5 * vol * vol * T) / (vol * sqrtT);
  const d2 = d1 - vol * sqrtT;
  if (type === 'call') {
    return S * normCdf(d1) - K * normCdf(d2);
  } else {
    return K * normCdf(-d2) - S * normCdf(-d1);
  }
}

export function buyOption(ctx, sym, type, strike, dte, qty, opts={}){
  qty = Math.max(1, Math.floor(qty));
  const a = ctx.assets.find(x => x.sym === sym);
  if (!a) return;
  const sigma = a.daySigma || a.sigma;
  const premium = priceOptionInternal(a.price, strike, dte / DAYS_PER_YEAR, sigma, type);
  const cost = premium * qty;
  const fee = Math.max(ctx.state.minFee, cost * ctx.state.feeRate);
  const total = cost + fee;
  if (ctx.state.cash >= total) ctx.state.cash -= total;
  else { const short = total - ctx.state.cash; ctx.state.cash = 0; ctx.state.debt += short; }
  ctx.state.optionPositions.push({
    id: `${sym}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
    sym, type, strike, dte, qty, premium, mark: premium
  });
  ctx.day.feesPaid += fee;
  opts.log?.(`Bought ${qty} ${type} ${sym} ${strike} (${dte}d) premium $${premium.toFixed(2)}`);
}

export function updateOptions(ctx, cfg=CFG){
  for (let i = ctx.state.optionPositions.length - 1; i >= 0; i--) {
    const p = ctx.state.optionPositions[i];
    const a = ctx.assets.find(x => x.sym === p.sym);
    if (!a) { ctx.state.optionPositions.splice(i,1); continue; }
    p.dte -= 1 / cfg.DAY_TICKS;
    if (p.dte <= 1e-6) {
      const intrinsic = p.type === 'call' ? Math.max(0, a.price - p.strike) : Math.max(0, p.strike - a.price);
      const value = intrinsic * p.qty;
      ctx.state.cash += value;
      const realized = (intrinsic - p.premium) * p.qty;
      ctx.state.realizedPnL += realized;
      ctx.day.realized += realized;
      ctx.state.optionPositions.splice(i,1);
      continue;
    }
    const sigma = a.daySigma || a.sigma;
    p.mark = priceOptionInternal(a.price, p.strike, p.dte / DAYS_PER_YEAR, sigma, p.type);
  }
}

export function priceOption(S, K, T, sigma, type){
  return priceOptionInternal(S, K, T, sigma, type);
}
