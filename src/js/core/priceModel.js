import { clamp, rollingAvg } from '../util/math.js';
import { CFG } from '../config.js';

export function riskDrift(market, rng){
  const r = market.risk, theta=0.02, mean=0.20, vol=0.03;
  const dr = theta*(mean-r) + vol*rng.normal();
  market.risk = clamp(r+dr, 0.05, 1.2);
}
export function demandDrift(market, rng, era=1, prestige=0){
  const d = market.demand, theta=0.01;
  const mean = 1.00 + prestige*0.05 + (era-1)*0.03;
  const vol=0.01; const dd=theta*(mean-d)+vol*rng.normal();
  market.demand = clamp(d+dd, 0.6, 2.0);
}

export function npcFlow(a, rng){
  const h=a.history, n=Math.min(20,h.length-1);
  const ret=(h[h.length-1]-h[h.length-1-n])/Math.max(1e-9,h[h.length-1-n]);
  let mom=clamp(ret*2,-0.1,0.1);
  const fatigue = Math.max(0, Math.abs(a.streak)-4) * CFG.NPC_MOMENTUM_FADE;
  mom = mom>0 ? Math.max(0, mom - fatigue) : Math.min(0, mom + fatigue);
  const noise=rng.normal()*0.008; return mom+noise;
}
export function eventImpactIntraday(market, sym){
  let mu=0, sigma=0;
  for(const ev of market.activeEvents){ if(ev.scope==="global"||ev.sym===sym){ mu+=ev.mu; sigma+=ev.sigma; } }
  return {mu, sigma};
}

export function softRunCap(a, growth, state){
  const multiple = a.price / Math.max(0.01, a.runStart || a.price);
  const ownShare = (state.positions[a.sym] || 0) / a.supply;
  const windowFlow = (a.flowWindow.reduce((s,x)=>s+x,0)) / a.supply;
  const cornering = (ownShare>=0.02) || (windowFlow>=0.01);
  if (multiple <= CFG.RUN_CAP_MULTIPLE || cornering) return growth;
  const excess = multiple / CFG.RUN_CAP_MULTIPLE;
  const factor = 1 / (1 + Math.pow(excess, 0.9));
  return Math.pow(growth, factor);
}

// Build tomorrow outlook & analyst
export function applyOvernightOutlook(ctx){
  const { market, assets } = ctx;
  const global = market.tomorrow.filter(e=>e.scope==="global");
  const assetEvs = market.tomorrow.filter(e=>e.scope==="asset");
  const gMu  = global.reduce((s,e)=>s+e.mu,0);
  const gDem = global.reduce((s,e)=>s+e.demand,0);
  market.lastGmu = gMu; market.lastGdem = gDem;

  for(const a of assets){
    const evs = assetEvs.filter(e=>e.sym===a.sym);
    const evMu   = evs.reduce((s,e)=>s+e.mu,0);
    const evDem  = evs.reduce((s,e)=>s+e.demand,0);
    const evVol  = evs.reduce((s,e)=>s+Math.abs(e.sigma),0) + Math.abs(gMu)*0.5;

    // fair drift
    const fairDrift = CFG.FAIR_DRIFT_BASE;
    a.fair *= (1 + fairDrift);

    const valuation = -CFG.VALUATION_DRAG * Math.log(Math.max(0.2,a.price)/Math.max(0.2,a.fair));
    const streakMR  = (a.streak>=2 && a.price>a.fair*1.15 ? -0.0012 : 0)
                    + (a.streak<=-2 && a.price<a.fair*0.85 ? +0.0012 : 0);
    const demandTerm = 0.0007*(a.localDemand-1) + 0.0005*(ctx.market.demand-1 + gDem + evDem);
    let reversion = 0; let bias="continuation";
    if (a.streak>3 && a.price>a.fair){ reversion = -CFG.STREAK_REVERSION*(a.streak-3); bias="reversion"; }
    if (a.streak<-3 && a.price<a.fair){ reversion = CFG.STREAK_REVERSION*(-a.streak-3); bias="reversion"; }

    const mu    = gMu + evMu + valuation + streakMR + demandTerm + reversion;
    const sigma = clamp(0.006 + evVol*0.6 + Math.abs(gDem)*0.15, 0.006, 0.10);
    const gap   = clamp( (gMu*CFG.DAY_TICKS*0.35) + (evMu*CFG.DAY_TICKS*0.75) + (evDem*0.55), -CFG.OPEN_GAP_CAP, CFG.OPEN_GAP_CAP);

    a.daySigma = sigma;
    a.outlook = { mu, sigma, gap };
    a.outlookDetail = { gMu, evMu, evDem, valuation, streakMR, demandTerm, reversion, bias };

    if (evDem !== 0) {
      a.evDemandBias = clamp(a.evDemandBias + evDem, -0.6, 0.6);
      if (evDem > 0){
        for(const b of assets){ if(b!==a) b.evDemandBias = clamp(b.evDemandBias - evDem*CFG.OPP_COST_SPILL, -0.6, 0.6); }
      }
    }
  }

  market.tomorrow = [];
  market.activeEvents = [];
}

export function applyOpeningGaps(ctx, hooks){
  for (const a of ctx.assets){
    const gap = a.outlook?.gap || 0;
    if (gap !== 0) {
      a.price = Math.max(0.05, a.price * (1 + gap));
      a.history.push(a.price);
      if (hooks?.log) hooks.log(`${a.sym} opens ${gap>=0?'+':''}${Math.round(gap*100)}% on after‑hours news.`);
    }
  }
}

export function updatePrices(ctx, rng){
  const { assets, market, state } = ctx;

  // apply event demand and cross‑asset siphoning once per event
  for(const ev of market.activeEvents){
    if(ev._applied) continue;
    if(ev.scope === "asset"){
      const target = assets.find(x=>x.sym===ev.sym);
      if(target){
        target.localDemand = clamp(target.localDemand + ev.demand, 0.5, 2.5);
        if(ev.demand>0){
          for(const o of assets){ if(o!==target) o.localDemand = clamp(o.localDemand - ev.demand*CFG.OPP_COST_SPILL, 0.5,2.5); }
        }
      }
    } else {
      for(const a of assets){ a.localDemand = clamp(a.localDemand + ev.demand, 0.5,2.5); }
    }
    ev._applied = true;
  }

  // recent performance for capital rotation
  const perfs = assets.map(a=>{ const h=a.history; const look=Math.min(5,h.length-1); return look>0 ? (a.price/h[h.length-1-look]-1) : 0; });
  const avgPerf = perfs.reduce((s,x)=>s+x,0)/Math.max(1,perfs.length);

  for (let i=0; i<assets.length; i++){
    const a = assets[i];
    // small regime nudge
    if (rng() < CFG.REGIME_P) {
      a.regime = { mu:(rng()*0.0022-0.0011), sigma:(rng()*0.012-0.006) };
    }

    // valuation/streak/demand + rotation + intraday events
    const valuation  = -CFG.VALUATION_DRAG * Math.log(Math.max(0.2,a.price)/Math.max(0.2,a.fair));
    const streakMR   = (a.streak>=2 && a.price>a.fair*1.15 ? -0.0012 : 0)
                     + (a.streak<=-2 && a.price<a.fair*0.85 ? +0.0012 : 0);
    const fatigue    = (a.streak>3 && a.price>a.fair ? -CFG.STREAK_FATIGUE*(a.streak-3) : 0)
                     + (a.streak<-3 && a.price<a.fair ? CFG.STREAK_FATIGUE*(-a.streak-3) : 0);
    const rotation   = -CFG.CAPITAL_ROTATION_INTENSITY * (perfs[i] - avgPerf);
    const demandBias = 0.0006*(market.demand-1) + 0.0005*(a.localDemand-1) + 0.0008*(a.evDemandBias);

    const { mu:emu, sigma:esig } = eventImpactIntraday(market, a.sym);

    const baseMu    = a.mu + a.regime.mu + (a.outlook?.mu||0) + valuation + streakMR + fatigue + rotation + demandBias + emu;
    const baseSigma = clamp(a.sigma + a.regime.sigma + (a.outlook?.sigma||a.daySigma) + esig, 0.006, 0.12);

    // liquidity & impact
    a.localDemand += (1 + a.evDemandBias - a.localDemand)*0.03;
    a.impulse *= 0.90;

    // momentum
    const avg = rollingAvg(a.history, Math.min(40, a.history.length-1));
    const momentum = clamp((a.price / avg - 1) * 0.35, -0.07, 0.07);

    const Z = rng.normal();
    let growth = Math.exp((baseMu - 0.5*baseSigma*baseSigma) + baseSigma*Z + momentum);
    const flow = npcFlow(a, rng);
    const depth = clamp(1 + a.k * clamp(flow + a.impulse*0.5, -0.6, 0.6), 0.5, 1.5);
    growth *= depth;

    growth = softRunCap(a, growth, state);

    a.price = Math.max(0.05, a.price * growth);
    a.history.push(a.price); if (a.history.length > 3000) a.history.shift();
  }
}

export function computeAnalyst(a, market){
  const evScore = clamp(((a.outlookDetail?.evMu || 0) * CFG.DAY_TICKS * 25 + (a.outlookDetail?.evDem || 0) * 1.2), -1, 1);
  const valScore = clamp(Math.tanh(Math.log((a.fair+1e-9)/(a.price+1e-9))), -1, 1);
  const streakScore = clamp(a.streak>=2 ? -Math.tanh(a.streak/6) : (a.streak<=-2 ? Math.tanh(-a.streak/6) : 0), -1, 1);
  const macroScore = clamp((market.demand-1) - 0.6*(market.risk-0.2), -1, 1);
  const score = clamp(0.5*evScore + 0.2*valScore + 0.2*streakScore + 0.1*macroScore, -1, 1);

  const sig = a.daySigma || 0.02;
  const alignment = (Math.abs(evScore) + Math.abs(valScore) + Math.abs(streakScore)) / 3;
  const conf = clamp(0.75 - (sig*3.0) - (market.risk-0.2)*0.4 + alignment*0.25, 0.15, 0.92);

  let tone="Neutral", cls="neu";
  if (score > 0.15) { tone="Bullish"; cls="bull"; }
  if (score < -0.15){ tone="Bearish"; cls="bear"; }
  return { tone, cls, score, conf };
}
