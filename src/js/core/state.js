// src/js/core/state.js
const SAVE_KEY = 'ttm.save.v1';
const SAVE_VERSION = 1;

export const defaults = {
  version: SAVE_VERSION,
  day: 0,
  secondsPerDay: 10,
  cash: 10000, // meaningful starting capital
  debt: 0,
  assets: [
    { sym: 'LUNA', name: 'LunaTech', price: 25, prevClose: 25, vol: 0.03,  analyst: 'B', qty: 0 },
    { sym: 'SOLR', name: 'SolRing',  price: 48, prevClose: 48, vol: 0.025, analyst: 'A', qty: 0 },
    { sym: 'CRTR', name: 'CraterCo', price: 12, prevClose: 12, vol: 0.05,  analyst: 'C', qty: 0 },
    { sym: 'APLO', name: 'Apollo',   price: 90, prevClose: 90, vol: 0.02,  analyst: 'B', qty: 0 }
  ],
  selected: 'LUNA',
};

export function clone(obj) {
  // Guard for older browsers: only use structuredClone if it exists
  if (typeof structuredClone === 'function') return structuredClone(obj);
  return JSON.parse(JSON.stringify(obj));
}

export function hydrate() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return clone(defaults);
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return clone(defaults);
    if (parsed.version !== SAVE_VERSION) return migrate(parsed);
    return mergeDefaults(parsed, defaults);
  } catch {
    return clone(defaults);
  }
}

export function persist(state) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ ...state, version: SAVE_VERSION }));
  } catch {
    // ignore quota errors
  }
}

export function hardReset() {
  localStorage.removeItem(SAVE_KEY);
  return clone(defaults);
}

function migrate(old) {
  const merged = mergeDefaults(old, defaults);
  merged.version = SAVE_VERSION;
  return merged;
}

function mergeDefaults(current, base) {
  const out = { ...base, ...current };
  out.assets = (current.assets || base.assets).map((a, i) => ({
    ...base.assets[i % base.assets.length],
    ...a,
  }));
  return out;
}

export function netWorth(state) {
  return state.cash - state.debt + state.assets.reduce((s, a) => s + a.qty * a.price, 0);
}

export function riskPct(state) {
  const exposure = state.assets.reduce((s, a) => s + Math.abs(a.qty * a.price), 0);
  const net = Math.max(1, netWorth(state)); // avoid /0
  return Math.min(999, Math.round((exposure / net) * 100));
}

// Build the initial game context. This replicates the structure expected by
// tests and other core modules but keeps the game rules unchanged.
export function createInitialState(assetDefs = []) {
  const assets = assetDefs.map(def => ({
    sym: def.sym,
    name: def.name,
    price: def.price,
    fair: def.price,
    mu: def.mu || 0,
    sigma: def.sigma || 0.02,
    k: def.k || 0,
    supply: def.supply || 1_000_000,
    isCrypto: !!def.isCrypto,
    localDemand: 1,
    impulse: 0,
    history: Array(100).fill(def.price),
    dayBounds: [0],
    flowToday: 0,
    flowWindow: [],
    evMuDays: 0,
    evMuCarry: 0,
    evDemandDays: 0,
    evDemandBias: 0,
    regime: { mu: 0, sigma: 0 },
    streak: 0,
    runStart: def.price,
    analyst: { tone: 'Neutral', cls: 'neu', score: 0, conf: 0 },
    daySigma: def.sigma || 0.02,
  }));

  const state = {
    cash: defaults.cash ?? 0,
    debt: 0,
    positions: Object.fromEntries(assetDefs.map(d => [d.sym, 0])),
    costBasis: Object.fromEntries(assetDefs.map(d => [d.sym, { qty: 0, avg: 0 }])),
    marginPositions: [],
    optionPositions: [],
    upgrades: {},
    cooldowns: { insider: 0 },
    riskTools: null,
    minFee: 1,
    feeRate: 0.001,
    realizedPnL: 0,
    insiderTip: null,
  };

  const market = {
    risk: 0.2,
    demand: 1.0,
    activeEvents: [],
    tomorrow: [],
    lastGmu: 0,
    lastGdem: 0,
  };

  const day = {
    idx: 0,
    active: false,
    ticksLeft: 0,
    startCash: 0,
    startDebt: 0,
    startNet: 0,
    startPortfolio: 0,
    startPrices: {},
    startHoldings: {},
    midEventFired: false,
    feesPaid: 0,
    realized: 0,
  };

  const newsByAsset = {};
  for (const a of assets) newsByAsset[a.sym] = [];

  return { state, assets, market, day, newsByAsset, riskTrack: {}, gameOver: false };
}
