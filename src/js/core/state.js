import { CFG } from '../config.js';

/** Initialize market, state, and assets from asset definitions. */
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

  const state = {
    cash: CFG.START_CASH, debt: 0,
    positions: Object.fromEntries(assets.map(a => [a.sym, 0])),
    feeRate: 0.001, minFee: 1
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

  return { assets, state, market, day };
}
