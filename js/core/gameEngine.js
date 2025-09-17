import { createDailySnapshot, normalizeDailyStats } from "./daySummary.js";

const DEFAULT_SAVE_KEY = "ttm_v0_save";
const DEFAULT_TICK_INTERVAL = 600;
const DEFAULT_AUTOSAVE_TICKS = 16;
const DEFAULT_DAY_DURATION_MS = 10000;

export const ASSET_DEFS = [
  { id: "MOON", name: "Moon Mineral Co.", start: 50, volatility: 0.02 },
  { id: "STONK", name: "Stonk Industries", start: 35, volatility: 0.03 },
  { id: "DOGE", name: "Dogecoin", start: 0.08, volatility: 0.06 },
  { id: "TSLA", name: "Teslor Motors", start: 240, volatility: 0.018 },
  { id: "BTC", name: "Bitcorn", start: 65000, volatility: 0.03 },
  { id: "ETH", name: "Etheer", start: 3500, volatility: 0.035 },
  { id: "SOLAR", name: "HelioGrid Renewables", start: 62, volatility: 0.028, unlock: "global-access" },
  { id: "OILX", name: "Petronova Crude ETN", start: 78, volatility: 0.022, unlock: "global-access" },
  { id: "AIQ", name: "Sentience Systems ETF", start: 142, volatility: 0.026, unlock: "global-access" }
];

export const CORE_ASSET_IDS = ["MOON", "STONK", "DOGE", "TSLA", "BTC", "ETH"];

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

export function createInitialState({
  startingCash = 10000,
  assetIds,
  runConfig,
  dayDurationMs = DEFAULT_DAY_DURATION_MS
} = {}) {
  const chosenIds = Array.isArray(assetIds) && assetIds.length
    ? Array.from(new Set(assetIds))
    : [...CORE_ASSET_IDS];
  const definitions = chosenIds
    .map((id) => ASSET_DEFS.find((item) => item.id === id))
    .filter(Boolean);
  const assets = definitions.length ? definitions.map(mkAssetRuntime) : CORE_ASSET_IDS.map((id) => mkAssetRuntime(ASSET_DEFS.find((item) => item.id === id)));
  const initialSelected = assets[0]?.id ?? CORE_ASSET_IDS[0];
  const now = Date.now();

  const netWorth = Number.isFinite(startingCash) ? startingCash : 10000;

  const state = {
    day: 1,
    cash: startingCash,
    realized: 0,
    assets,
    positions: {},
    recentTrades: [],
    running: false,
    selected: initialSelected,
    tick: 0,
    dayRemainingMs: Number.isFinite(dayDurationMs) ? Math.max(0, dayDurationMs) : DEFAULT_DAY_DURATION_MS,
    events: [],
    feed: [],
    nextEventId: 1,
    pendingEvents: [],
    eventHistory: {},
    nextScenarioId: 1,
    run: {
      id: `${now}`,
      status: "pending",
      startedAt: now,
      config: runConfig
        ? { ...runConfig, assetIds: Array.isArray(runConfig.assetIds) ? [...new Set(runConfig.assetIds)] : [...chosenIds] }
        : { assetIds: [...chosenIds], startingCash },
      stats: {
        maxNetWorth: netWorth,
        minNetWorth: netWorth,
        lastNetWorth: netWorth,
        days: 1,
        trades: 0,
        buyNotional: 0,
        sellNotional: 0,
        maintenanceStrikes: 0
      }
    }
  };
  state.dailyStats = createDailySnapshot(state);
  state.previousDailyStats = null;
  state.lastDaySummary = null;
  return state;
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

function normalizeState(raw, { dayDurationMs = DEFAULT_DAY_DURATION_MS } = {}) {
  if (!raw || typeof raw !== "object") return createInitialState({ dayDurationMs });
  const base = createInitialState({ dayDurationMs });

  const normalizeTrade = (entry) => {
    if (!entry || typeof entry !== "object") return null;
    const qty = Number.isFinite(entry.qty) ? Math.max(0, Math.floor(entry.qty)) : 0;
    if (!qty) return null;
    const price = Number.isFinite(entry.price) ? entry.price : 0;
    const notional = Number.isFinite(entry.notional) ? entry.notional : price * qty;
    const side = entry.side === "sell" ? "sell" : "buy";
    const assetId = typeof entry.assetId === "string" ? entry.assetId : null;
    if (!assetId) return null;
    return {
      assetId,
      side,
      qty,
      price,
      notional,
      tick: Number.isFinite(entry.tick) ? entry.tick : 0,
      day: Number.isFinite(entry.day) ? entry.day : 0
    };
  };

  const state = {
    day: Number.isFinite(raw.day) ? raw.day : base.day,
    cash: Number.isFinite(raw.cash) ? raw.cash : base.cash,
    realized: Number.isFinite(raw.realized) ? raw.realized : base.realized,
    assets: Array.isArray(raw.assets) && raw.assets.length
      ? raw.assets.map(normalizeAsset)
      : base.assets,
    positions: raw.positions && typeof raw.positions === "object" ? { ...raw.positions } : {},
    recentTrades: Array.isArray(raw.recentTrades)
      ? raw.recentTrades
          .map(normalizeTrade)
          .filter(Boolean)
          .slice(-120)
      : [],
    running: false,
    selected: typeof raw.selected === "string" ? raw.selected : base.selected,
    tick: Number.isFinite(raw.tick) ? raw.tick : base.tick,
    dayRemainingMs:
      Number.isFinite(raw.dayRemainingMs) && raw.dayRemainingMs >= 0
        ? Math.min(Math.max(0, raw.dayRemainingMs), Math.max(0, dayDurationMs))
        : base.dayRemainingMs,
    events: Array.isArray(raw.events) ? raw.events.map((event) => ({ ...event })) : [],
    feed: Array.isArray(raw.feed) ? raw.feed.slice(-60).map((entry) => ({ ...entry })) : [],
    nextEventId: Number.isFinite(raw.nextEventId) ? raw.nextEventId : base.nextEventId,
    pendingEvents: Array.isArray(raw.pendingEvents)
      ? raw.pendingEvents
          .map((entry) => {
            if (!entry || typeof entry !== "object") return null;
            const instanceId = Number.isFinite(entry.instanceId) ? entry.instanceId : null;
            const definitionId = typeof entry.definitionId === "string" ? entry.definitionId : null;
            if (instanceId == null || !definitionId) return null;
            return {
              instanceId,
              definitionId,
              label: typeof entry.label === "string" ? entry.label : "Scenario",
              kind: typeof entry.kind === "string" ? entry.kind : "neutral",
              triggeredDay: Number.isFinite(entry.triggeredDay) ? entry.triggeredDay : 0,
              triggeredTick: Number.isFinite(entry.triggeredTick) ? entry.triggeredTick : 0,
              phase: typeof entry.phase === "string" ? entry.phase : "dayStart",
              context: entry.context && typeof entry.context === "object" ? { ...entry.context } : {},
              description: typeof entry.description === "string" ? entry.description : "",
              deadlineDay: Number.isFinite(entry.deadlineDay) ? entry.deadlineDay : null,
              deadlineTick: Number.isFinite(entry.deadlineTick) ? entry.deadlineTick : null,
              defaultChoiceId: typeof entry.defaultChoiceId === "string" ? entry.defaultChoiceId : null
            };
          })
          .filter(Boolean)
      : [],
    eventHistory:
      raw.eventHistory && typeof raw.eventHistory === "object"
        ? Object.fromEntries(
            Object.entries(raw.eventHistory).map(([key, value]) => {
              if (!value || typeof value !== "object") {
                return [key, {
                  count: 0,
                  lastTriggeredDay: null,
                  lastResolvedDay: null,
                  cooldownUntilDay: null,
                  cooldownUntilTick: null,
                  pendingInstance: null,
                  lastChoice: null
                }];
              }
              return [
                key,
                {
                  count: Number.isFinite(value.count) ? value.count : 0,
                  lastTriggeredDay: Number.isFinite(value.lastTriggeredDay) ? value.lastTriggeredDay : null,
                  lastResolvedDay: Number.isFinite(value.lastResolvedDay) ? value.lastResolvedDay : null,
                  cooldownUntilDay: Number.isFinite(value.cooldownUntilDay) ? value.cooldownUntilDay : null,
                  cooldownUntilTick: Number.isFinite(value.cooldownUntilTick) ? value.cooldownUntilTick : null,
                  pendingInstance: Number.isFinite(value.pendingInstance) ? value.pendingInstance : null,
                  lastChoice: typeof value.lastChoice === "string" ? value.lastChoice : null
                }
              ];
            })
          )
        : {},
    nextScenarioId: Number.isFinite(raw.nextScenarioId) ? raw.nextScenarioId : base.nextScenarioId
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

  if (!Array.isArray(state.assets) || state.assets.length === 0) {
    state.assets = CORE_ASSET_IDS.map((id) => {
      const def = ASSET_DEFS.find((item) => item.id === id);
      return mkAssetRuntime(def);
    });
  }

  if (typeof state.selected !== "string" && state.assets.length) {
    state.selected = state.assets[0].id;
  }

  const now = Date.now();
  const rawRun = state.run && typeof state.run === "object" ? state.run : {};
  const configAssetIds = Array.isArray(rawRun?.config?.assetIds) && rawRun.config.assetIds.length
    ? Array.from(new Set(rawRun.config.assetIds.filter((id) => typeof id === "string")))
    : state.assets.map((asset) => asset.id);
  const runConfig = rawRun.config && typeof rawRun.config === "object"
    ? { ...rawRun.config, assetIds: configAssetIds }
    : { assetIds: configAssetIds, startingCash: Number.isFinite(state.cash) ? state.cash : 10000 };
  if (!Number.isFinite(runConfig.startingCash)) {
    runConfig.startingCash = Number.isFinite(state.cash) ? state.cash : 10000;
  }

  state.run = {
    id: typeof rawRun.id === "string" ? rawRun.id : `${now}`,
    status: typeof rawRun.status === "string" ? rawRun.status : "active",
    startedAt: Number.isFinite(rawRun.startedAt) ? rawRun.startedAt : now,
    endedAt: Number.isFinite(rawRun.endedAt) ? rawRun.endedAt : null,
    reason: typeof rawRun.reason === "string" ? rawRun.reason : null,
    config: runConfig,
    stats: rawRun.stats && typeof rawRun.stats === "object" ? { ...rawRun.stats } : {}
  };

  state.dailyStats = normalizeDailyStats(raw.dailyStats, state);
  state.previousDailyStats = raw.previousDailyStats
    ? normalizeDailyStats(raw.previousDailyStats, state)
    : null;
  state.lastDaySummary = raw.lastDaySummary && typeof raw.lastDaySummary === "object"
    ? { ...raw.lastDaySummary }
    : null;

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
  autoSaveTicks = DEFAULT_AUTOSAVE_TICKS,
  dayDurationMs = DEFAULT_DAY_DURATION_MS
} = {}) {
  let currentState = normalizeState(
    providedState ?? loadState({ storageKey }) ?? createInitialState({ dayDurationMs }),
    { dayDurationMs }
  );
  currentState.running = false;

  const dayLengthMs = Number.isFinite(dayDurationMs) && dayDurationMs > 0 ? dayDurationMs : DEFAULT_DAY_DURATION_MS;
  if (!Number.isFinite(currentState.dayRemainingMs)) {
    currentState.dayRemainingMs = dayLengthMs;
  } else {
    currentState.dayRemainingMs = Math.min(Math.max(0, currentState.dayRemainingMs), dayLengthMs);
  }

  const tickHandlers = new Set();
  const dayHandlers = new Set();
  const renderHandlers = new Set();
  const stateHandlers = new Set();

  let timer = null;
  let dayTimer = null;
  let dayTimerExpiresAt = null;

  const context = {
    get state() {
      return currentState;
    },
    requestSave,
    requestRender: renderNow,
    storageKey,
    dayDurationMs: dayLengthMs,
    getDayRemainingMs: () => computeDayRemaining()
  };

  function clampDayRemaining(value) {
    const numeric = Number.isFinite(value) ? value : dayLengthMs;
    return Math.min(dayLengthMs, Math.max(0, numeric));
  }

  function computeDayRemaining() {
    if (dayTimerExpiresAt != null) {
      const remaining = Math.max(0, dayTimerExpiresAt - Date.now());
      currentState.dayRemainingMs = clampDayRemaining(remaining);
      return currentState.dayRemainingMs;
    }
    currentState.dayRemainingMs = clampDayRemaining(currentState.dayRemainingMs);
    return currentState.dayRemainingMs;
  }

  function stopDayTimer({ preserve = true } = {}) {
    if (dayTimer) {
      clearTimeout(dayTimer);
      dayTimer = null;
    }
    if (preserve && dayTimerExpiresAt != null) {
      const remaining = Math.max(0, dayTimerExpiresAt - Date.now());
      currentState.dayRemainingMs = clampDayRemaining(remaining);
    }
    dayTimerExpiresAt = null;
  }

  function setDayTimer(durationMs) {
    const ms = clampDayRemaining(durationMs);
    if (dayTimer) {
      clearTimeout(dayTimer);
      dayTimer = null;
    }
    currentState.dayRemainingMs = ms;
    if (!currentState.running) {
      dayTimerExpiresAt = null;
      return ms;
    }
    const now = Date.now();
    dayTimerExpiresAt = now + ms;
    dayTimer = setTimeout(autoEndDay, Math.max(0, ms));
    return ms;
  }

  function resumeDayTimer() {
    const remaining = computeDayRemaining();
    setDayTimer(remaining);
  }

  function restartDayTimer() {
    setDayTimer(dayLengthMs);
  }

  function autoEndDay() {
    dayTimer = null;
    if (dayTimerExpiresAt != null) {
      const remaining = Math.max(0, dayTimerExpiresAt - Date.now());
      currentState.dayRemainingMs = clampDayRemaining(remaining);
    }
    dayTimerExpiresAt = null;
    currentState.dayRemainingMs = 0;
    notifyState();
    renderNow();
    endDay({ reason: "timer" });
  }

  function safeCall(fn, ...args) {
    try {
      fn(...args);
    } catch (error) {
      console.error(error);
    }
  }

  function notifyState() {
    computeDayRemaining();
    stateHandlers.forEach((handler) => safeCall(handler, currentState, context));
  }

  function renderNow() {
    renderHandlers.forEach((handler) => safeCall(handler, currentState, context));
  }

  function requestSave() {
    saveState(currentState, { storageKey });
  }

  function tickOnce() {
    computeDayRemaining();
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
    resumeDayTimer();
    timer = setInterval(tickOnce, tickInterval);
    computeDayRemaining();
    notifyState();
  }

  function pause() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    currentState.running = false;
    stopDayTimer({ preserve: true });
    computeDayRemaining();
    notifyState();
  }

  function endDay(payload = {}) {
    stopDayTimer({ preserve: false });
    const dayContext = { ...context, ...payload };
    dayHandlers.forEach((handler) => safeCall(handler, currentState, dayContext));
    currentState.dayRemainingMs = dayLengthMs;
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
        currentState = normalizeState(next, { dayDurationMs: dayLengthMs });
      }
    } catch (error) {
      console.error(error);
    }
    if (save) requestSave();
    notifyState();
    if (render) renderNow();
  }

  function setState(nextState, { save = true, render = true } = {}) {
    currentState = normalizeState(nextState, { dayDurationMs: dayLengthMs });
    currentState.dayRemainingMs = clampDayRemaining(currentState.dayRemainingMs);
    if (save) requestSave();
    notifyState();
    if (render) renderNow();
  }

  function reset(newState = createInitialState({ dayDurationMs: dayLengthMs })) {
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
    restartDayTimer,
    getDayRemainingMs: () => computeDayRemaining(),
    isRunning: () => timer != null,
    get storageKey() {
      return storageKey;
    },
    tickInterval,
    autoSaveTicks,
    dayDurationMs: dayLengthMs
  };

  context.engine = engine;
  computeDayRemaining();
  notifyState();

  return engine;
}

export { DEFAULT_SAVE_KEY };
