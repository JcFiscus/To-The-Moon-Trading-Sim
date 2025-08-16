import { clamp } from '../util/math.js';
import { CFG } from '../config.js';

export const EVENT_POOL = [
  {scope:"global", title:"Solar flare jitters", type:"regulation", mu:+0.0000, sigma:+0.010, demand:-0.07, days:2, severity:"minor", blurb:"Satcom latency spikes; risk surges."},
  {scope:"global", title:"Liquidity wave",      type:"demand",     mu:+0.0008, sigma:-0.004, demand:+0.08, days:3, severity:"major", blurb:"Sovereign rotation lifts all boats."},
  {scope:"global", title:"Margin rules review", type:"regulation", mu:-0.0003, sigma:+0.006, demand:-0.04, days:2, severity:"minor", blurb:"Leverage scrutiny rising."},
  {scope:"global", title:"Bear Market Rumours", type:"sentiment", mu:-0.0015, sigma:+0.008, demand:-0.12, days:6, severity:"major", blurb:"Persistent whispers of downturn."},
  {scope:"global", title:"Regulatory Crackdown", type:"regulation", mu:-0.0013, sigma:+0.010, demand:-0.15, days:7, severity:"major", blurb:"Authorities tighten screws."},
  {scope:"global", title:"Funding Freeze", type:"credit", mu:-0.0011, sigma:+0.012, demand:-0.11, days:6, severity:"major", blurb:"Credit lines evaporate; bids dry up."},
  {scope:"global", title:"Supply Glut", type:"supply", mu:-0.0009, sigma:+0.009, demand:-0.08, days:5, severity:"minor", blurb:"Inventory overhang pressures prices."},
  {scope:"asset", sym:"QNTM", title:"3‑nm breakthrough", type:"tech",     mu:+0.0017, sigma:+0.004, demand:+0.10, days:4, severity:"major", blurb:"Quantum array yields surge."},
  {scope:"asset", sym:"MWR",  title:"Aquifer mapped",    type:"tech",     mu:+0.0013, sigma:-0.003, demand:+0.06, days:3, severity:"minor", blurb:"Stable access lowers risk."},
  {scope:"asset", sym:"GAT",  title:"Prototype implodes",type:"recall",   mu:-0.0022, sigma:+0.013, demand:-0.12, days:2, severity:"major", blurb:"Confidence shaken."},
  {scope:"asset", sym:"H3",   title:"Lunar strike",      type:"tech",     mu:+0.0011, sigma:+0.007, demand:+0.09, days:3, severity:"major", blurb:"New regolith vein found."},
  {scope:"asset", sym:"CYB",  title:"Zero‑day frenzy",   type:"demand",   mu:+0.0010, sigma:+0.010, demand:+0.09, days:2, severity:"minor", blurb:"Urgent cyber spend."},
  {scope:"asset", sym:"SOL",  title:"Sail tear recall",  type:"recall",   mu:-0.0011, sigma:+0.012, demand:-0.10, days:2, severity:"major", blurb:"Retrofit program announced."},
  {scope:"asset", sym:"NNC",  title:"Key Client Loss",   type:"client",   mu:-0.0016, sigma:+0.011, demand:-0.10, days:5, severity:"major", blurb:"Flagship customer defects."},
  {scope:'global', title:'Options expiration gamma squeeze', type:'options_flow', mu:+0.0014, sigma:+0.012, demand:+0.06, days:2, severity:'major', blurb:'Dealer gamma flip fuels upside.', requires:['options']},
  {scope:'asset', sym:'BTC', title:'New exchange listing', type:'crypto_flow', mu:+0.0018, sigma:+0.016, demand:+0.09, days:3, severity:'major', blurb:'Liquidity surge from new venue.', requires:['crypto']},
  {scope:'asset', sym:'ETH', title:'Staking yield spike', type:'crypto_flow', mu:+0.0015, sigma:+0.014, demand:+0.08, days:3, severity:'major', blurb:'Validators flock after upgrade.', requires:['crypto']},
  {scope:'asset', sym:'MOON', title:'Moonshot social buzz', type:'crypto_flow', mu:+0.0025, sigma:+0.020, demand:+0.12, days:2, severity:'major', blurb:'Viral meme drives FOMO.', requires:['crypto']},
  {scope:'asset', sym:'{TIP_SYM}', title:'Whispers on the street', type:'insider', mu:+0.0010, sigma:+0.010, demand:+0.05, days:2, severity:'minor', blurb:'Unusual chatter favors near‑term upside.', requires:['insider']}
];

export function randomEvent(ctx, rng, newsLevel=0){
  let pool = EVENT_POOL.filter(ev => !ev.requires || ev.requires.every(id => ctx.state.upgrades[id]));
  pool = pool.map(ev => {
    if (ev.sym === '{TIP_SYM}' && ctx.state.insiderTip) {
      const tip = ctx.state.insiderTip;
      return { ...ev, sym: tip.sym, mu: ev.mu * tip.bias, demand: ev.demand * tip.bias };
    }
    return ev;
  });
  if (ctx.state.insiderTip && ctx.state.insiderTip.daysLeft > 0) {
    const { sym, bias } = ctx.state.insiderTip;
    const extras = [];
    for (const ev of pool) {
      if (ev.sym === sym && ((bias > 0 && ev.mu > 0) || (bias < 0 && ev.mu < 0))) {
        for (let i = 0; i < (CFG.INSIDER_EVENT_WEIGHT || 5); i++) extras.push(ev);
      }
    }
    pool = pool.concat(extras);
  }
  const base = pool.length ? pool : EVENT_POOL;
  const ev = { ...base[Math.floor(rng() * base.length)] };
  const nScale = 1 + newsLevel * 0.05;
  const sev = ev.severity === 'major' ? 1.75 : 1.0;
  const negBias = rng() < 0.35; // chance of persistent negative shock
  ev.mu    *= nScale * (0.85 + rng()*0.45) * sev;
  ev.sigma *= nScale * (0.75 + rng()*0.60) * sev;
  ev.demand*= nScale * (0.80 + rng()*0.60) * sev;
  ev.mu = clamp(ev.mu, -CFG.EVENT_MU_CAP, CFG.EVENT_MU_CAP);
  ev.sigma = clamp(ev.sigma, -CFG.EVENT_SIGMA_CAP, CFG.EVENT_SIGMA_CAP);
  ev.demand = clamp(ev.demand, -CFG.EVENT_DEMAND_CAP, CFG.EVENT_DEMAND_CAP);
  ev.days   = Math.round(ev.days * (negBias ? (1.5 + rng()*0.7) : (0.8 + rng()*0.6)));
  if (negBias) {
    ev.mu = -Math.abs(ev.mu);
    ev.demand = -Math.abs(ev.demand);
  }
  return ev;
}

export function randomSupplyEvent(assets, rng){
  const a = assets[Math.floor(rng()*assets.length)];
  const up = rng() < 0.5;
  const frac = (0.02 + rng()*0.05) * (up?1:-1);
  a.supply = Math.max(50_000, Math.floor(a.supply*(1+frac)));
  const verb = up ? "Secondary issuance" : "Buyback/retirement";
  return {scope:"asset", sym:a.sym, title:verb, type:"supply", mu:(up?-0.0006:+0.0006), sigma:+0.003, demand:(up?-0.06:+0.06), days:2,
          severity:(Math.abs(frac)>0.05 ? "major":"minor"), blurb:`Supply ${up?"+":""}${Math.round(frac*100)}%.`};
}

export function pushAssetNews(newsByAsset, ev, whenLabel, state, lastEvent){
  if (ev.requires && state && !ev.requires.every(id => state.upgrades[id])) return;
  const targets = ev.scope === 'asset' ? [ev.sym] : null;
  if (targets) {
    newsByAsset[ev.sym] = newsByAsset[ev.sym] || [];
    newsByAsset[ev.sym].unshift({ when: whenLabel, ev, remaining: ev.days || 2 });
    if (newsByAsset[ev.sym].length > 50) newsByAsset[ev.sym].pop();
    if (lastEvent) lastEvent[ev.sym] = ev;
  } else {
    // global → copy into each asset stream
    Object.keys(newsByAsset).forEach(sym => {
      newsByAsset[sym].unshift({ when: whenLabel, ev, remaining: ev.days || 2 });
      if (newsByAsset[sym].length > 50) newsByAsset[sym].pop();
      if (lastEvent) lastEvent[sym] = ev;
    });
  }
}
