const DEFAULT_SAVE_KEY = "ttm_v0_save";
const DEFAULT_TICK_INTERVAL = 600;
const DEFAULT_AUTOSAVE_TICKS = 16;

export const ASSET_DEFS = [
  { id: "MOON", name: "Moon Mineral Co.", start: 50, volatility: 0.02 },
  { id: "STONK", name: "Stonk Industries", start: 35, volatility: 0.03 },
  { id: "DOGE", name: "Dogecoin", start: 0.08, volatility: 0.06 },
  { id: "TSLA", name: "Teslor Motors", start: 240, volatility: 0.018 },
  { id: "BTC", name: "Bitcorn", start: 65000, volatility: 0.03 },
  { id: "ETH", name: "Etheer", start: 3500, volatility: 0.035 }
];

function mkAssetRuntime(def) {
  return {
    id: def.id,
    name: def.name,
    volatility: def.volatility,
    price: def.start,
    prev: def.start,
    changePct: 0,
    history: Array.from({ length: 60 }, (_, i) => def.start * (1 + (i - 59) * 0.0005))
  };
}

export function createInitialState() {
  return {
    day: 1,
    cash: 10000,
    realized: 0,
    assets: ASSET_DEFS.map(mkAssetRuntime),
    positions: {},
    running: false,
    selected: "MOON",
    tick: 0,
    events: [],
    feed: [],
    nextEventId: 1
  };
}

function normalizeAsset(asset = {}) {
  const def = ASSET_DEFS.find((item) => item.id === asset.id);
  const base = def ? mkAssetRuntime(def) : mkAssetRuntime({
    id: asset.id || "ASSET",
    name: asset.name || (def ? def.name : "Unknown"),
    volatility: Number.isFinite(asset.volatility) ? asset.volatility : 0.02,
    start: Number.isFinite(asset.price) ? asset.price : 1
  });

  const price = Number.isFinite(asset.price) ? asset.price : base.price;
  const prev = Number.isFinite(asset.prev) ? asset.prev : price;
  const history = Array.isArray(asset.history) && asset.history.length
    ? asset.history.slice(-240)
    : base.history;

  return {
    id: base.id,
    name: base.name,
    volatility: base.volatility,
    price,
    prev,
    changePct: Number.isFinite(asset.changePct) ? asset.changePct : 0,
    history
  };
}

function normalizeState(raw) {
  if (!raw || typeof raw !== "object") return createInitialState();
  const base = createInitialState();

  const state = {
    day: Number.isFinite(raw.day) ? raw.day : base.day,
    cash: Number.isFinite(raw.cash) ? raw.cash : base.cash,
    realized: Number.isFinite(raw.realized) ? raw.realized : base.realized,
    assets: Array.isArray(raw.assets) && raw.assets.length
      ? raw.assets.map(normalizeAsset)
      : base.assets,
    positions: raw.positions && typeof raw.positions === "object" ? { ...raw.positions } : {},
    running: false,
    selected: typeof raw.selected === "string" ? raw.selected : base.selected,
    tick: Number.isFinite(raw.tick) ? raw.tick : base.tick,
    events: Array.isArray(raw.events) ? raw.events.map((event) => ({ ...event })) : [],
    feed: Array.isArray(raw.feed) ? raw.feed.slice(-60).map((entry) => ({ ...entry })) : [],
    nextEventId: Number.isFinite(raw.nextEventId) ? raw.nextEventId : base.nextEventId
  };

  // Ensure feed entries always have defaults.
  state.feed = state.feed.map((entry) => ({
    time: typeof entry.time === "string" ? entry.time : "",
    text: typeof entry.text === "string" ? entry.text : "",
    kind: typeof entry.kind === "string" ? entry.kind : "neutral",
    targetId: entry.targetId ?? null,
    effect: entry.effect ?? {},
    expiresAtTick: entry.expiresAtTick ?? null,
    expiresOnDay: entry.expiresOnDay ?? null
  }));

  // Guarantee each asset history entry is numeric.
  state.assets = state.assets.map((asset) => ({
    ...asset,
    history: asset.history.map((value) => (Number.isFinite(value) ? value : asset.price))
  }));

  return state;
}

export function saveState(state, { storageKey = DEFAULT_SAVE_KEY } = {}) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
  } catch (error) {
    console.warn("ttm:saveState failed", error);
  }
}

export function loadState({ storageKey = DEFAULT_SAVE_KEY } = {}) {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return normalizeState(parsed);
  } catch (error) {
    console.warn("ttm:loadState failed", error);
    return null;
  }
}

export function createGameEngine({
  state: providedState,
  storageKey = DEFAULT_SAVE_KEY,
  tickInterval = DEFAULT_TICK_INTERVAL,
  autoSaveTicks = DEFAULT_AUTOSAVE_TICKS
} = {}) {
  let currentState = normalizeState(providedState ?? loadState({ storageKey }) ?? createInitialState());
  currentState.running = false;

  const tickHandlers = new Set();
  const dayHandlers = new Set();
  const renderHandlers = new Set();
  const stateHandlers = new Set();

  let timer = null;

  const context = {
    get state() {
      return currentState;
    },
    requestSave,
    requestRender: renderNow,
    storageKey
  };

  function safeCall(fn, ...args) {
    try {
      fn(...args);
    } catch (error) {
      console.error(error);
    }
  }

  function notifyState() {
    stateHandlers.forEach((handler) => safeCall(handler, currentState, context));
  }

  function renderNow() {
    renderHandlers.forEach((handler) => safeCall(handler, currentState, context));
  }

  function requestSave() {
    saveState(currentState, { storageKey });
  }

  function tickOnce() {
    currentState.tick = (currentState.tick ?? 0) + 1;
    tickHandlers.forEach((handler) => safeCall(handler, currentState, context));
    if (autoSaveTicks && currentState.tick % autoSaveTicks === 0) {
      requestSave();
    }
    notifyState();
    renderNow();
  }

  function start() {
    if (timer) clearInterval(timer);
    currentState.running = true;
    timer = setInterval(tickOnce, tickInterval);
    notifyState();
  }

  function pause() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    currentState.running = false;
    notifyState();
  }

  function endDay(payload = {}) {
    const dayContext = { ...context, ...payload };
    dayHandlers.forEach((handler) => safeCall(handler, currentState, dayContext));
    requestSave();
    notifyState();
    renderNow();
  }

  function onTick(handler) {
    if (typeof handler === "function") tickHandlers.add(handler);
    return () => tickHandlers.delete(handler);
  }

  function onDayEnd(handler) {
    if (typeof handler === "function") dayHandlers.add(handler);
    return () => dayHandlers.delete(handler);
  }

  function onRender(handler) {
    if (typeof handler === "function") renderHandlers.add(handler);
    return () => renderHandlers.delete(handler);
  }

  function onStateChange(handler) {
    if (typeof handler === "function") stateHandlers.add(handler);
    return () => stateHandlers.delete(handler);
  }

  function update(mutator, { save = true, render = true } = {}) {
    if (typeof mutator !== "function") return;
    try {
      const next = mutator(currentState);
      if (next && next !== currentState) {
        currentState = normalizeState(next);
      }
    } catch (error) {
      console.error(error);
    }
    if (save) requestSave();
    notifyState();
    if (render) renderNow();
  }

  function setState(nextState, { save = true, render = true } = {}) {
    currentState = normalizeState(nextState);
    if (save) requestSave();
    notifyState();
    if (render) renderNow();
  }

  function reset(newState = createInitialState()) {
    pause();
    setState(newState, { save: true, render: true });
  }

  function clearSave() {
    try {
      localStorage.removeItem(storageKey);
    } catch (error) {
      console.warn("ttm:clearSave failed", error);
    }
  }

  const engine = {
    getState: () => currentState,
    start,
    pause,
    tickOnce,
    endDay,
    onTick,
    onDayEnd,
    onRender,
    onStateChange,
    update,
    setState,
    reset,
    render: renderNow,
    requestSave,
    clearSave,
    isRunning: () => timer != null,
    get storageKey() {
      return storageKey;
    },
    tickInterval,
    autoSaveTicks
  };

  context.engine = engine;
  notifyState();

  return engine;
}

export { DEFAULT_SAVE_KEY };
