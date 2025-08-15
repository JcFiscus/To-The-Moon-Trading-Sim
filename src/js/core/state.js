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
    { sym: 'LUNA', name: 'LunaTech', price: 25, prevClose: 25, vol: 0.03, analyst: 'B', qty: 0 },
    { sym: 'SOLR', name: 'SolRing',  price: 48, prevClose: 48, vol: 0.025, analyst: 'A', qty: 0 },
    { sym: 'CRTR', name: 'CraterCo', price: 12, prevClose: 12, vol: 0.05, analyst: 'C', qty: 0 },
    { sym: 'APLO', name: 'Apollo',   price: 90, prevClose: 90, vol: 0.02, analyst: 'B', qty: 0 }
  ],
  selected: 'LUNA',
};

export function clone(obj) {
  return structuredClone ? structuredClone(obj) : JSON.parse(JSON.stringify(obj));
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
  // Simple forward migration path
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
