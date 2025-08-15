import { applyOvernightOutlook, applyOpeningGaps, updatePrices, riskDrift, demandDrift, computeAnalyst } from './priceModel.js';
import { randomEvent, randomSupplyEvent, pushAssetNews } from './events.js';
import { CFG } from '../config.js';
import { checkMargin } from './trading.js';

export function startDay(ctx, cfg=CFG, hooks){
  ctx.day.idx += 1; ctx.day.active = true; ctx.day.ticksLeft = cfg.DAY_TICKS;
  ctx.day.startCash = ctx.state.cash; ctx.day.startDebt = ctx.state.debt;
  // compute start net/portfolio now
  const portStart = ctx.assets.reduce((s,a)=> s + (ctx.state.positions[a.sym]||0)*a.price, 0);
  ctx.day.startPortfolio = portStart;
  ctx.day.startNet = ctx.state.cash + portStart - ctx.state.debt;

  ctx.day.startPrices = {}; ctx.day.startHoldings = {}; ctx.day.midEventFired=false; ctx.day.feesPaid=0; ctx.day.realized=0;
  for (const a of ctx.assets) {
    ctx.day.startPrices[a.sym] = a.price;
    ctx.day.startHoldings[a.sym] = ctx.state.positions[a.sym] || 0;
    a.dayBounds.push(a.history.length);
    a.flowToday = 0;
  }

  applyOvernightOutlook(ctx);
  applyOpeningGaps(ctx, hooks);

  for (const a of ctx.assets) a.analyst = computeAnalyst(a, ctx.market, cfg);
}

export function stepTick(ctx, cfg, rng, hooks){
  riskDrift(ctx.market, rng);
  demandDrift(ctx.market, rng);

  if (!ctx.day.midEventFired && Math.random() < cfg.INTRADAY_EVENT_P){
    const ev = randomEvent(ctx, rng); ev.mu *= cfg.INTRADAY_IMPACT_SCALE; ev.sigma *= cfg.INTRADAY_IMPACT_SCALE;
    ev.timing = 'intraday'; ev.t = cfg.DAY_TICKS * 2;
    ctx.market.activeEvents.push(ev);
    hooks?.log?.(`${ev.scope==='global'?'GLOBAL':ev.sym}: ${ev.title} (intraday) — ${ev.blurb}`);
    pushAssetNews(ctx.newsByAsset, ev, `Day ${ctx.day.idx} (intraday)`);
    ctx.day.midEventFired = true;
  }

  updatePrices(ctx, rng);
  checkMargin(ctx, hooks);
  ctx.market.activeEvents = ctx.market.activeEvents.map(ev => ({...ev, t:(ev.t||10)-1})).filter(ev => ev.t > 0);

  ctx.day.ticksLeft--;
  if (ctx.day.ticksLeft < 0) ctx.day.ticksLeft = 0;
}

export function endDay(ctx, cfg=CFG, hooks){
  ctx.day.active = false;

  const rows=[]; let best=null, worst=null;
  for (const a of ctx.assets){
    const sp = ctx.day.startPrices[a.sym] || a.price;
    const ep = a.price; const change = ep/sp - 1;
    const startHold = ctx.day.startHoldings[a.sym] || 0;
    const endHold   = ctx.state.positions[a.sym] || 0;
    const startVal  = startHold * sp;
    const endVal    = endHold * ep;
    const unreal    = endHold * (ep - sp);

    rows.push({ sym:a.sym, name:a.name, sp, ep, priceCh:change, startHold, endHold, startVal, endVal, unreal });

    a.streak = change>0 ? (a.streak>=0?a.streak+1:1) : (change<0 ? (a.streak<=0?a.streak-1:-1) : a.streak);
    a.flowWindow.push(a.flowToday); if (a.flowWindow.length > cfg.FLOW_WINDOW_DAYS) a.flowWindow.shift();
    if (a.streak <= 0) a.runStart = a.price;
    a.evDemandBias *= cfg.EVENT_DEMAND_DECAY;

    if(!best || change>best.priceCh) best={sym:a.sym,priceCh:change};
    if(!worst || change<worst.priceCh) worst={sym:a.sym,priceCh:change};
  }

  // end-of-day meta
  const endPort = ctx.assets.reduce((s,a)=> s + (ctx.state.positions[a.sym]||0)*a.price, 0);
  let net = ctx.state.cash + endPort - ctx.state.debt;

  const freq = cfg.DEBT_INTEREST_FREQ + (ctx.state.upgrades.debt_rate ? 1 : 0);
  const rate = cfg.DEBT_INTEREST_RATE * (ctx.state.upgrades.debt_rate ? 0.75 : 1);
  const threshold = cfg.DEBT_NET_THRESHOLD * (ctx.state.upgrades.debt_rate ? 1.1 : 1);

  if (ctx.day.idx % freq === 0){
    const ratio = net>0 ? ctx.state.debt / net : Infinity;
    if (ratio > threshold && ctx.state.debt > 0){
      const interest = ctx.state.debt * rate;
      ctx.state.debt += interest;
      hooks?.log?.(`Debt interest ${ (rate*100).toFixed(2) }% applied: +${interest.toFixed(2)}`);
      net -= interest;
    }
  }

  const dNet = net - ctx.day.startNet;
  const dNetPct = (ctx.day.startNet > 0) ? (net/ctx.day.startNet - 1) : 0;

  const meta = {
    day: ctx.day.idx,
    endNet: net,
    startNet: ctx.day.startNet,
    dNet, dNetPct,
    realized: ctx.day.realized, fees: ctx.day.feesPaid,
    best, worst
  };

  const gameOver = net <= 0;
  return { rows, meta, gameOver };
}

export function enqueueAfterHours(ctx, cfg, rng, hooks){
  if (Math.random() < cfg.AH_EVENT_P){
    const ev = randomEvent(ctx, rng); ev.timing = 'afterhours';
    ctx.market.tomorrow.push(ev);
    hooks?.log?.(`${ev.scope==='global'?'GLOBAL':ev.sym} (after‑hours): ${ev.title} — ${ev.blurb}`);
    pushAssetNews(ctx.newsByAsset, ev, `Day ${ctx.day.idx} (after‑hours)`);
  }
  if (Math.random() < cfg.AH_SUPPLY_EVENT_P){
    const sev = randomSupplyEvent(ctx.assets, rng); sev.timing = 'afterhours';
    ctx.market.tomorrow.push(sev);
    hooks?.log?.(`${sev.scope==='global'?'GLOBAL':sev.sym} (after‑hours): ${sev.title} — ${sev.blurb}`);
    pushAssetNews(ctx.newsByAsset, sev, `Day ${ctx.day.idx} (after‑hours)`);
  }
}
