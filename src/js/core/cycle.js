import { applyOvernightOutlook, applyOpeningGaps, updatePrices, riskDrift, demandDrift, computeAnalyst } from './priceModel.js';
import { randomEvent, randomSupplyEvent, pushAssetNews } from './events.js';
import { CFG } from '../config.js';
import { checkMargin } from './trading.js';
import { updateOptions } from './options.js';
import { clamp } from '../util/math.js';

export function startDay(ctx, cfg=CFG, hooks){
  if (ctx.state.insiderTip && ctx.state.insiderTip.daysLeft > 0) {
    ctx.state.upgrades.insider = true;
  } else {
    ctx.state.upgrades.insider = false;
    ctx.state.insiderTip = null;
  }
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
  if (ctx.state.insiderTip) {
    ctx.state.insiderTip.daysLeft--;
    if (ctx.state.insiderTip.daysLeft <= 0) {
      ctx.state.upgrades.insider = false;
      ctx.state.insiderTip = null;
    }
  }
  applyOpeningGaps(ctx, hooks);

  for (const a of ctx.assets) a.analyst = computeAnalyst(a, ctx.market, cfg);
}

export function stepTick(ctx, cfg, rng, hooks){
  ctx.state.tick = (ctx.state.tick || 0) + 1;
  riskDrift(ctx.market, rng);
  demandDrift(ctx.market, rng);

  if (!ctx.day.midEventFired && Math.random() < cfg.INTRADAY_EVENT_P){
    const ev = randomEvent(ctx, rng); ev.mu *= cfg.INTRADAY_IMPACT_SCALE; ev.sigma *= cfg.INTRADAY_IMPACT_SCALE;
    const cap = cfg.OPEN_GAP_CAP * 0.5;
    ev.mu = clamp(ev.mu, -cap, cap);
    ev.demand = clamp(ev.demand, -cap, cap);
    ev.timing = 'intraday'; ev.t = cfg.DAY_TICKS * 2;
    ctx.market.activeEvents.push(ev);
    hooks?.log?.(`${ev.scope==='global'?'GLOBAL':ev.sym}: ${ev.title} (intraday) — ${ev.blurb}`);
    pushAssetNews(ctx.newsByAsset, ev, `Day ${ctx.day.idx} (intraday)`, ctx.state, ctx.lastEvent);
    ctx.day.midEventFired = true;
  }

  updatePrices(ctx, rng);
  updateOptions(ctx, cfg);
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

    const cb = ctx.state.costBasis[a.sym] || {qty:0, avg:sp};
    const basis = cb.avg || sp;
    const tr = ctx.riskTrack[a.sym] || { peak: ep, lastTP: 0, lastRule: '' };
    const ret = ep / basis - 1;
    const draw = ep / tr.peak - 1;
    const rcfg = ctx.state.riskTools || {};
    const tps = [
      [rcfg.tp1 || 0.2, 1],
      [rcfg.tp2 || 0.4, 2],
      [rcfg.tp3 || 0.8, 3]
    ];
    const next = tps.find(([, stage]) => stage > (tr.lastTP||0));
    const nextTP = next ? next[0] : null;

    // Always update asset trackers
    a.streak = change>0 ? (a.streak>=0?a.streak+1:1) : (change<0 ? (a.streak<=0?a.streak-1:-1) : a.streak);
    a.flowWindow.push(a.flowToday); if (a.flowWindow.length > cfg.FLOW_WINDOW_DAYS) a.flowWindow.shift();
    const span = Math.min(cfg.FLOW_WINDOW_DAYS, a.dayBounds.length);
    const startIdx = a.dayBounds[Math.max(0, a.dayBounds.length - span)] || 0;
    const recentMin = Math.min(...a.history.slice(startIdx));
    a.runStart = recentMin;
    if (a.evMuDays > 0){
      a.evMuCarry *= cfg.EVENT_MU_DECAY;
      a.evMuDays--;
      if (a.evMuDays <= 0) a.evMuCarry = 0;
    }
    if (a.evDemandDays > 0){
      a.evDemandBias *= cfg.EVENT_DEMAND_DECAY;
      a.evDemandDays--;
      if (a.evDemandDays <= 0) a.evDemandBias = 0;
    }

    // Only include positions actually held; gate crypto behind upgrade
    const hadPosition = startHold > 0 || endHold > 0;
    if (hadPosition && (!a.isCrypto || ctx.state.upgrades.crypto)) {
      rows.push({ sym:a.sym, name:a.name, sp, ep, priceCh:change, startHold, endHold, startVal, endVal, unreal, basis, peak:tr.peak, ret, draw, nextTP, lastRule:tr.lastRule });

      if(!best || change>best.priceCh) best={sym:a.sym,priceCh:change};
      if(!worst || change<worst.priceCh) worst={sym:a.sym,priceCh:change};
    }
  }

  if(!best) best={sym:'-',priceCh:0};
  if(!worst) worst={sym:'-',priceCh:0};

  // end-of-day meta
  const endPort = ctx.assets.reduce((s,a)=> s + (ctx.state.positions[a.sym]||0)*a.price, 0);
  let net = ctx.state.cash + endPort - ctx.state.debt;

  const freq = cfg.DEBT_INTEREST_FREQ + (ctx.state.upgrades.debt_rate ? 1 : 0);
  const rate = cfg.DEBT_INTEREST_RATE * (ctx.state.upgrades.debt_rate ? 0.75 : 1);
  const threshold = cfg.DEBT_NET_THRESHOLD * (ctx.state.upgrades.debt_rate ? 1.1 : 1);

  let interest = 0;
  if (ctx.day.idx % freq === 0){
    const ratio = net>0 ? ctx.state.debt / net : Infinity;
    if (ratio > threshold && ctx.state.debt > 0){
      interest = ctx.state.debt * rate;
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
    best, worst,
    interest
  };

  const gameOver = net <= 0;
  if (ctx.state.cooldowns.insider > 0) ctx.state.cooldowns.insider--;
  return { rows, meta, gameOver };
}

export function enqueueAfterHours(ctx, cfg, rng, hooks){
  if (Math.random() < cfg.AH_EVENT_P){
    const ev = randomEvent(ctx, rng); ev.timing = 'afterhours';
    ctx.market.tomorrow.push(ev);
    hooks?.log?.(`${ev.scope==='global'?'GLOBAL':ev.sym} (after‑hours): ${ev.title} — ${ev.blurb}`);
    pushAssetNews(ctx.newsByAsset, ev, `Day ${ctx.day.idx} (after‑hours)`, ctx.state, ctx.lastEvent);
  }
  if (Math.random() < cfg.AH_SUPPLY_EVENT_P){
    const sev = randomSupplyEvent(ctx.assets, rng); sev.timing = 'afterhours';
    ctx.market.tomorrow.push(sev);
    hooks?.log?.(`${sev.scope==='global'?'GLOBAL':sev.sym} (after‑hours): ${sev.title} — ${sev.blurb}`);
    pushAssetNews(ctx.newsByAsset, sev, `Day ${ctx.day.idx} (after‑hours)`, ctx.state, ctx.lastEvent);
  }
}
