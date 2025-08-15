import { CFG } from '../config.js';

export function createInitialState(assetDefs){
  const assets = assetDefs.map(d => ({
    ...d,
    history: Array.from({length:120}, () => d.price),
    dayBounds: [],
    localDemand: 1.0,
    impulse: 0,
    fair: d.price,
    regime: {mu:0, sigma:0},
    streak: 0,
    runStart: d.price,
    flowWindow: [],
    flowToday: 0,
    evDemandBias: 0,
    daySigma: d.sigma,
    outlook: null,
    outlookDetail: null,
    analyst: { tone:"Neutral", cls:"neu", score:0, conf:0.5 }
  }));

  const positions = Object.fromEntries(assets.map(a => [a.sym, 0]));
  const costBasis = Object.fromEntries(assets.map(a => [a.sym, {qty:0, avg:0}]));
  const newsByAsset = Object.fromEntries(assets.map(a => [a.sym, []]));

  const state = {
    cash: CFG.START_CASH, debt: 0,
    positions, costBasis,
    realizedPnL: 0,
    feeRate: 0.001, minFee: 1,
    riskTools: {
      enabled: false,
      trailing: 0.12,     // 12% trailing
      hardStop: 0.18,     // 18% hard
      stopSellFrac: 1.0,  // sell 100% on stop
      tp1: 0.20, tp1Frac: 0.25,
      tp2: 0.40, tp2Frac: 0.25,
      tp3: 0.80, tp3Frac: 0.50,
      posCap: 0.35        // max 35% of net worth in a single asset
    },
    upgrades: { insider:false, leverage:0, debt_rate:false, options:false, crypto:false },
    upgradePurchases: { insider:0, leverage:0, debt_rate:0, options:0, crypto:0 },
    cooldowns: { insider:0 }
  };

  const market = {
    risk: 0.20,
    demand: 1.00,
    activeEvents: [],
    tomorrow: [],
    lastGmu: 0,
    lastGdem: 0
  };

  const day = {
    idx: 0, active:false, ticksLeft:CFG.DAY_TICKS,
    startCash:0, startDebt:0, startNet:0, startPortfolio:0,
    startPrices:{}, startHoldings:{}, feesPaid:0, realized:0, midEventFired:false
  };

  // Misc runtime trackers
  const ctx = { assets, state, market, day, newsByAsset, riskTrack: {} };
  return ctx;
}
