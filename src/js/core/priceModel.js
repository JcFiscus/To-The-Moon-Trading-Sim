import { clamp, rollingAvg } from '../util/math.js';
import { CFG } from '../config.js';

export function riskDrift(market, rng){
  const r = market.risk, theta=0.02, mean=0.20, vol=0.03;
  const dt = 1/CFG.DAY_TICKS;
  const dr = theta*(mean-r)*dt + vol*Math.sqrt(dt)*rng.normal();
  market.risk = clamp(r+dr, 0.05, 1.2);
}
export function demandDrift(market, rng, era=1, prestige=0){
  const d = market.demand, theta=0.01;
  const mean = 1.00 + prestige*0.05 + (era-1)*0.03;
  const vol=0.01; const dt = 1/CFG.DAY_TICKS;
  const dd = theta*(mean-d)*dt + vol*Math.sqrt(dt)*rng.normal();
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
  const cap = cornering ? 10 : CFG.RUN_CAP_MULTIPLE;
  if (multiple <= cap) return growth;
  const excess = multiple / cap;
  const factor = 1 / (1 + Math.pow(excess, 0.9));
  return Math.pow(growth, factor);
}

// Build tomorrow outlook & analyst
export function applyOvernightOutlook(ctx){
  const { market, assets } = ctx;
  const global = market.tomorrow.filter(e=>e.scope==="global");
  const assetEvs = market.tomorrow.filter(e=>e.scope==="asset");

  let gGapMu=0, gGapDem=0, gCarryMu=0, gCarryDem=0, gDays=0;
  for(const ev of global){
    const gapMu = ev.mu*0.5;
    const gapDem = ev.demand*0.5;
    gGapMu += gapMu;
    gGapDem += gapDem;
    gCarryMu += ev.mu - gapMu;
    gCarryDem += ev.demand - gapDem;
    gDays = Math.max(gDays, ev.days||0);
  }

  const perAsset = new Map();
  for(const ev of assetEvs){
    const gapMu = ev.mu*0.5;
    const gapDem = ev.demand*0.5;
    const carryMu = ev.mu - gapMu;
    const carryDem = ev.demand - gapDem;
    const arr = perAsset.get(ev.sym) || [];
    arr.push({gapMu, gapDem, carryMu, carryDem, sigma:ev.sigma, days:ev.days});
    perAsset.set(ev.sym, arr);
    const src = assets.find(a=>a.sym===ev.sym);
    if (src){
      const peers = assets.filter(a=>a.sector===src.sector && a.sym!==ev.sym);
      for(const p of peers){
        const arrN = perAsset.get(p.sym) || [];
        arrN.push({gapMu:0, gapDem:0, carryMu:carryMu/3, carryDem:carryDem/3, sigma:ev.sigma/3, days:ev.days});
        perAsset.set(p.sym, arrN);
      }
    }
  }

  market.lastGmu = gCarryMu; market.lastGdem = gCarryDem;

  for(const a of assets){
    const evs = perAsset.get(a.sym) || [];
    const assetGapMu = evs.reduce((s,e)=>s+e.gapMu,0);
    const assetGapDem = evs.reduce((s,e)=>s+e.gapDem,0);
    const assetCarryMu = evs.reduce((s,e)=>s+e.carryMu,0);
    const assetCarryDem = evs.reduce((s,e)=>s+e.carryDem,0);
    const evVol = evs.reduce((s,e)=>s+Math.abs(e.sigma),0) + Math.abs(gGapMu)*0.5;
    const evDays = evs.reduce((m,e)=>Math.max(m,e.days||0),0);
    const totalDays = Math.max(evDays, gDays);

    // fair drift
    const fairDrift = CFG.FAIR_ACCEL * CFG.DAY_TICKS;
    a.fair *= (1 + fairDrift);

    let valuation = 0;
    const ratio = a.price / a.fair;
    if (ratio > 1.2 || ratio < 0.8){
      valuation = -CFG.MR_K_OVERNIGHT * Math.log(ratio) * CFG.DAY_TICKS;
    }
    const demandTerm = (0.0007*(a.localDemand-1) + 0.0005*(ctx.market.demand-1 + gCarryDem + assetCarryDem)) * CFG.DAY_TICKS;
    const L = x => (1/(1+Math.exp(-CFG.STREAK_FATIGUE_K*x)) - 0.5) * 2;
    const dist = Math.abs(Math.log(Math.max(0.2,a.price)/Math.max(0.2,a.fair)));
    const fatigue = Math.sign(a.streak) * L(Math.abs(a.streak)) * L(dist) * CFG.STREAK_FATIGUE_MAX * CFG.DAY_TICKS;

    const carryMu = gCarryMu + assetCarryMu;
    const carryDem = gCarryDem + assetCarryDem;

    a.evMuCarry = clamp(a.evMuCarry + carryMu, -0.02, 0.02);
    if (carryMu !== 0){
      const d = Math.max(2, Math.min(5, totalDays || 3));
      a.evMuDays = Math.max(a.evMuDays, d);
    }

    if (carryDem !== 0){
      a.evDemandBias = clamp(a.evDemandBias + carryDem, -0.6, 0.6);
      const d = Math.max(2, Math.min(5, totalDays || 3));
      a.evDemandDays = Math.max(a.evDemandDays, d);
      if (carryDem > 0){
        for(const b of assets){ if(b!==a && b.sector !== a.sector) b.evDemandBias = clamp(b.evDemandBias - carryDem*CFG.OPP_COST_SPILL, -0.6,0.6); }
      }
    }

    let mu = a.evMuCarry + valuation - fatigue + demandTerm;
    let sigma = clamp(0.006 + evVol*0.6 + Math.abs(gCarryDem)*0.15, 0.006, 0.10);

    // Moon coin burst dynamics
    if (a.sym === 'MOON') {
      if (!a.moonBurst || a.moonBurst.daysLeft <= 0) {
        if (Math.random() < CFG.MOON_BURST_P) {
          const [dMin,dMax] = CFG.MOON_BURST_DAYS_RANGE;
          const days = Math.floor(dMin + Math.random() * (dMax - dMin + 1));
          const [muMin,muMax] = CFG.MOON_BURST_MU_RANGE;
          const [sigMin,sigMax] = CFG.MOON_BURST_SIGMA_RANGE;
          a.moonBurst = {
            daysLeft: days,
            mu: muMin + Math.random() * (muMax - muMin),
            sigma: sigMin + Math.random() * (sigMax - sigMin)
          };
        } else {
          a.moonBurst = null;
        }
      }
      if (a.moonBurst) {
        mu += a.moonBurst.mu;
        sigma += a.moonBurst.sigma;
        a.moonBurst.daysLeft--;
      }
    }

    if (ctx.state.insiderTip && ctx.state.insiderTip.daysLeft > 0 && ctx.state.insiderTip.sym === a.sym) {
      const tip = ctx.state.insiderTip;
      mu += tip.mu;
      sigma += tip.sigma;
      sigma = clamp(sigma, 0.006, 0.12);
    }
    const gap = clamp( (gGapMu*CFG.DAY_TICKS*0.35) + (assetGapMu*CFG.DAY_TICKS*0.75) + ((gGapDem+assetGapDem)*0.55), -CFG.OPEN_GAP_CAP, CFG.OPEN_GAP_CAP);

    a.daySigma = sigma;
    a.outlook = { mu, sigma, gap };
    a.outlookDetail = { gMu: gCarryMu, evMu: assetCarryMu, evDem: assetCarryDem, valuation, fatigue, demandTerm };
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
  const returns = assets.map(a=>{
    const h=a.history; const look=Math.min(5,h.length-1);
    return look>0 ? (a.price/h[h.length-1-look]-1) : 0;
  });
  const meanRet = returns.reduce((s,x)=>s+x,0)/Math.max(1,returns.length);
  const stdRet = Math.sqrt(returns.reduce((s,x)=>s+(x-meanRet)**2,0)/Math.max(1,returns.length)) || 1e-9;

  for (let i=0; i<assets.length; i++){
    const a = assets[i];
    // small regime nudge
    if (rng() < CFG.REGIME_P) {
      a.regime = { mu:(rng()*0.0022-0.0011), sigma:(rng()*0.012-0.006) };
    }

    // valuation/streak/demand + rotation + intraday events
    let valuation = 0;
    const ratio = a.price / a.fair;
    if (ratio > 1.2 || ratio < 0.8){
      valuation = -CFG.MR_K_BASE * Math.log(ratio) * CFG.DAY_TICKS;
    }
    const L = x => (1/(1+Math.exp(-CFG.STREAK_FATIGUE_K*x)) - 0.5) * 2;
    const dist = Math.abs(Math.log(Math.max(0.2,a.price)/Math.max(0.2,a.fair)));
    const fatigue = Math.sign(a.streak) * L(Math.abs(a.streak)) * L(dist) * CFG.STREAK_FATIGUE_MAX * CFG.DAY_TICKS;
    const z = (returns[i] - meanRet) / stdRet;
    const rotation = -CFG.ROTATION_K * z * market.demand * CFG.DAY_TICKS;
    const demandBias = (0.0006*(market.demand-1) + 0.0005*(a.localDemand-1) + 0.0008*(a.evDemandBias)) * CFG.DAY_TICKS;

    const { mu:emu, sigma:esig } = eventImpactIntraday(market, a.sym);

      let baseMu    = a.mu + a.regime.mu + (a.outlook?.mu||0) + valuation - fatigue + rotation + demandBias + emu;
      let baseSigma = clamp(a.sigma + a.regime.sigma + (a.outlook?.sigma||a.daySigma) + esig, 0.006, 0.12);
      if (ctx.state.insiderTip && ctx.state.insiderTip.sym === a.sym && ctx.state.insiderTip.daysLeft > 0) {
        const tip = ctx.state.insiderTip;
        baseMu += tip.mu;
        baseSigma = clamp(baseSigma + tip.sigma, 0.006, 0.12);
      }
      const dt = 1/CFG.DAY_TICKS;
      const mu = baseMu * dt;
      const sigma = baseSigma * Math.sqrt(dt);

    // liquidity & impact
    a.localDemand += (1 + a.evDemandBias - a.localDemand)*0.03;
    a.impulse *= 0.90;

    // momentum
    const avg = rollingAvg(a.history, Math.min(40, a.history.length-1));
    const momentum = clamp((a.price / avg - 1) * 0.35, -0.07, 0.07) * dt;

    const Z = rng.normal();
    let growth = Math.exp((mu - 0.5*sigma*sigma) + sigma*Z + momentum);
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
