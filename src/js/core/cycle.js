import { applyOvernightOutlook, applyOpeningGaps, updatePrices, riskDrift, demandDrift, computeAnalyst } from './priceModel.js';
import { randomEvent, randomSupplyEvent, pushAssetNews } from './events.js';
import { CFG } from '../config.js';

export function startDay(ctx, cfg=CFG, hooks){
  ctx.day.idx += 1; ctx.day.active = true; ctx.day.ticksLeft = cfg.DAY_TICKS;
  ctx.day.startCash = ctx.state.cash; ctx.day.startDebt = ctx.state.debt;
  ctx.day.startPrices = {}; ctx.day.startHoldings = {}; ctx.day.midEventFired=false;
  for (const a of ctx.assets) {
    ctx.day.startPrices[a.sym] = a.price;
    ctx.day.startHoldings[a.sym] = ctx.state.positions[a.sym] || 0;
    a.dayBounds.push(a.history.length);
    a.flowToday = 0;
  }

  // build today's outlook from queued after-hours events, then apply opening gaps
  applyOvernightOutlook(ctx);
  applyOpeningGaps(ctx, hooks);

  // refresh analyst post-outlook
  for (const a of ctx.assets) a.analyst = computeAnalyst(a, ctx.market, cfg);
}

export function stepTick(ctx, cfg, rng, hooks){
  riskDrift(ctx.market, rng);
  demandDrift(ctx.market, rng);

  // rare intraday
  if (!ctx.day.midEventFired && Math.random() < cfg.INTRADAY_EVENT_P){
    const ev = randomEvent(rng); ev.mu *= cfg.INTRADAY_IMPACT_SCALE; ev.sigma *= cfg.INTRADAY_IMPACT_SCALE;
    ev.timing = 'intraday'; ev.t = cfg.DAY_TICKS * 2;
    ctx.market.activeEvents.push(ev);
    hooks?.log?.(`${ev.scope==='global'?'GLOBAL':ev.sym}: ${ev.title} (intraday) — ${ev.blurb}`);
    pushAssetNews(perAssetNews(ctx), ev, `Day ${ctx.day.idx} (intraday)`);
    ctx.day.midEventFired = true;
  }

  updatePrices(ctx, rng);

  // decay intraday events
  ctx.market.activeEvents = ctx.market.activeEvents.map(ev => ({...ev, t:(ev.t||10)-1})).filter(ev => ev.t > 0);

  ctx.day.ticksLeft--;
  if (ctx.day.ticksLeft < 0) ctx.day.ticksLeft = 0;
}

export function endDay(ctx, cfg=CFG, hooks){
  ctx.day.active = false;

  // streaks, flows, decay event bias
  for (const a of ctx.assets){
    const sp = ctx.day.startPrices[a.sym] || a.price;
    const ep = a.price;
    const chg = ep/sp - 1;
    a.streak = chg>0 ? (a.streak>=0?a.streak+1:1) : (chg<0 ? (a.streak<=0?a.streak-1:-1) : a.streak);
    a.flowWindow.push(a.flowToday); if (a.flowWindow.length > cfg.FLOW_WINDOW_DAYS) a.flowWindow.shift();
    if (a.streak <= 0) a.runStart = a.price;
    a.evDemandBias *= cfg.EVENT_DEMAND_DECAY;
  }
}

export function enqueueAfterHours(ctx, cfg, rng, hooks){
  if (Math.random() < cfg.AH_EVENT_P){
    const ev = randomEvent(rng); ev.timing = 'afterhours';
    ctx.market.tomorrow.push(ev);
    hooks?.log?.(`${ev.scope==='global'?'GLOBAL':ev.sym} (after‑hours): ${ev.title} — ${ev.blurb}`);
    pushAssetNews(perAssetNews(ctx), ev, `Day ${ctx.day.idx} (after‑hours)`);
  }
  if (Math.random() < cfg.AH_SUPPLY_EVENT_P){
    const sev = randomSupplyEvent(ctx.assets, rng); sev.timing = 'afterhours';
    ctx.market.tomorrow.push(sev);
    hooks?.log?.(`${sev.scope==='global'?'GLOBAL':sev.sym} (after‑hours): ${sev.title} — ${sev.blurb}`);
    pushAssetNews(perAssetNews(ctx), sev, `Day ${ctx.day.idx} (after‑hours)`);
  }
}

// per-asset news store sits on ctx; create lazily
function perAssetNews(ctx){
  if (!ctx.newsByAsset) {
    ctx.newsByAsset = Object.fromEntries(ctx.assets.map(a => [a.sym, []]));
  }
  return ctx.newsByAsset;
}
