import { createGameEngine, createInitialState, loadState } from "./core/gameEngine.js";
import { createDailySnapshot, normalizeDailyStats, summarizeDay } from "./core/daySummary.js";
import { createMarketModel } from "./core/marketModel.js";
import { createEventScheduler } from "./core/eventScheduler.js";
import { BASE_EVENT_IDS } from "./content/events.js";
import {
  updateRunStats,
  recordTradeStats,
  noteMaintenanceStrike,
  evaluateEndCondition,
  createRunSummary,
  saveRunSummary,
  loadRunHistory,
  RUN_REASON_LABELS
} from "./core/runSummary.js";
import {
  createInitialMetaState,
  loadMetaState,
  saveMetaState,
  computeRunConfig,
  listMetaUpgrades,
  purchaseUpgrade as purchaseMetaUpgrade,
  applyRunSummaryToMeta
} from "./core/metaProgression.js";
import { initMetaLayer, updateMetaLayer, showMetaLayer, hideMetaLayer } from "./ui/metaProgression.js";
import { MARGIN_PARAMS } from "./core/margin.js";
import { purchaseUpgrade, UPGRADE_DEF } from "./core/upgrades.js";
import { createHudController } from "./ui/hud.js";
import { createMarketListController } from "./ui/marketList.js";
import { createAssetDetailController } from "./ui/assetDetail.js";
import { createTradeControlsController } from "./ui/tradeControls.js";
import { createNewsFeedController } from "./ui/newsFeed.js";
import { createEventQueueController } from "./ui/eventQueue.js";
import { createDailySummaryController } from "./ui/dailySummary.js";
import { createUpgradeShopController } from "./ui/upgrades.js";
import { updateInsiderBanner } from "./ui/insiderBanner.js";
import { createCommandModulesController } from "./ui/commandModules.js";

const fmtMoney = (n) =>
  (n < 0 ? "-$" : "$") +
  Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const parseQty = (value) => {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 1;
};

const formatPrice = (price) => {
  const abs = Math.abs(price);
  const digits = abs >= 1000 ? 2 : abs >= 1 ? 2 : 4;
  return (
    "$" +
    price.toLocaleString(undefined, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    })
  );
};

const clock = (currentState) => `D${currentState.day} · T${currentState.tick}`;

const evaluateMaybeFn = (value, payload) => {
  if (typeof value === "function") {
    try {
      return value(payload);
    } catch (error) {
      console.error(error);
      return null;
    }
  }
  return value;
};

let engine = null;
let state = null;
let upgradesConfigured = false;
let marketModel = null;
let eventSystem = null;
let metaState = createInitialMetaState();
let runHistory = [];
let currentRunConfig = null;
let hasSavedRun = false;
let metaLayerReady = false;

const controllers = {};
let sharedTradeQty = 10;
let lastSelectedAssetId = null;

const AUTO_START_KEY = "ttm_auto_next_day";

function loadAutoStartPreference(defaultValue = false) {
  if (typeof localStorage === "undefined") return defaultValue;
  try {
    const raw = localStorage.getItem(AUTO_START_KEY);
    if (raw === "1") return true;
    if (raw === "0") return false;
  } catch (error) {
    console.warn("ttm:autoStart:load", error);
  }
  return defaultValue;
}

function saveAutoStartPreference(value) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(AUTO_START_KEY, value ? "1" : "0");
  } catch (error) {
    console.warn("ttm:autoStart:save", error);
  }
}

let autoStartNextDay = loadAutoStartPreference(false);

function hasActiveRun() {
  if (!state || !state.run) return false;
  if (state.run.status === "ended") return false;
  if (state.run.status === "pending" && (state.tick ?? 0) === 0) return false;
  return true;
}

function canStartNewRun() {
  if (!state || !state.run) return true;
  if (state.run.status === "ended") return true;
  if (state.run.status === "pending" && (state.tick ?? 0) === 0) return true;
  return false;
}

function refreshMetaUI({ allowResume = hasActiveRun(), canStart = canStartNewRun() } = {}) {
  if (!metaLayerReady) return;
  const upgrades = listMetaUpgrades(metaState);
  const summary = metaState?.lastSummary ?? null;
  updateMetaLayer({
    meta: metaState,
    upgrades,
    summary,
    history: runHistory,
    allowResume,
    canStart
  });
}

function refreshCommandModules(currentState = state) {
  if (!controllers.commandModules || !currentState) return;
  controllers.commandModules.render(currentState, {
    feed: currentState.feed ?? [],
    meta: metaState
  });
}

function handleMetaUpgradePurchase(id) {
  if (!id || !metaState) return;
  if (purchaseMetaUpgrade(metaState, id)) {
    saveMetaState(metaState);
    refreshMetaUI({ allowResume: hasActiveRun(), canStart: canStartNewRun() });
    refreshCommandModules();
  } else {
    console.warn("Upgrade locked or insufficient currency", id);
  }
}

function setupControllers() {
  controllers.trade = createTradeControlsController({
    onBuy: (qty) => {
      if (!state || !state.selected) return;
      doBuy(state.selected, qty);
    },
    onSell: (qty) => {
      if (!state || !state.selected) return;
      doSell(state.selected, qty);
    },
    onQtyChange: (qty) => {
      sharedTradeQty = parseQty(qty);
      controllers.market?.setDefaultQty(sharedTradeQty);
    },
    parseQty
  });

  controllers.market = createMarketListController({
    onSelectAsset: (id) => setSelected(id),
    onQuickBuy: (id, qty) => doBuy(id, qty),
    onQuickSell: (id, qty) => doSell(id, qty),
    onDefaultQtyChange: (qty) => {
      sharedTradeQty = parseQty(qty);
      controllers.trade?.setQty(sharedTradeQty);
    },
    parseQty
  });

  controllers.assetDetail = createAssetDetailController();
  controllers.news = createNewsFeedController();
  controllers.events = createEventQueueController({
    onResolve: (instanceId, choiceId) => {
      if (eventSystem) {
        eventSystem.resolve(instanceId, choiceId);
      }
    }
  });
  controllers.dailySummary = createDailySummaryController();
  controllers.upgrades = createUpgradeShopController({
    onRequestPurchase: (id) => {
      if (!engine || !id) return { success: false };
      let success = false;
      let message = "Unable to purchase upgrade.";
      engine.update((draft) => {
        success = purchaseUpgrade(draft, id);
        if (success) {
          message = `${UPGRADE_DEF[id]?.name || "Upgrade"} unlocked.`;
          bumpNews(message, { state: draft, tone: "good" });
        }
      }, { save: true });
      return { success, message };
    }
  });
  controllers.hud = createHudController({
    onToggleRun: () => {
      if (!engine) return;
      if (engine.isRunning()) {
        engine.pause();
      } else {
        engine.start();
      }
    },
    onEndDay: () => {
      if (!engine) return;
      engine.endDay({ overnightSteps: 6, varianceBoost: 1.8, reason: "manual" });
      bumpNews("Market closed. Overnight risk intensifies. Try not to panic.");
    },
    onReset: () => {
      if (!confirm("Reset game and clear local save?")) return;
      completeRun({ id: "retired", label: RUN_REASON_LABELS.retired });
    },
    onOpenMeta: () => {
      if (!engine) return;
      engine.pause();
      refreshMetaUI({ allowResume: hasActiveRun(), canStart: canStartNewRun() });
      showMetaLayer();
    },
    onToggleAutoDay: (value) => {
      const next = !!value;
      if (next === autoStartNextDay) return;
      autoStartNextDay = next;
      saveAutoStartPreference(autoStartNextDay);
      if (controllers.hud) {
        controllers.hud.render({
          day: state?.day,
          cash: state?.cash,
          equity: state ? state.cash + portfolioValue(state) : 0,
          totalPL: state ? state.realized + unrealizedPL(state) : 0,
          unrealized: state ? unrealizedPL(state) : 0,
          running: engine?.isRunning?.() ?? false,
          dayRemainingMs: state?.dayRemainingMs,
          dayDurationMs: engine?.dayDurationMs,
          autoStartNextDay
        });
      }
    }
  });

  controllers.market?.setDefaultQty(sharedTradeQty);
  controllers.trade?.setQty(sharedTradeQty);

  controllers.commandModules = createCommandModulesController();

  window.__TTM_UI__ = {
    hud: controllers.hud,
    market: controllers.market,
    detail: controllers.assetDetail,
    trade: controllers.trade,
    news: controllers.news,
    upgrades: controllers.upgrades,
    events: controllers.events,
    dailySummary: controllers.dailySummary,
    commandModules: controllers.commandModules
  };
}

function handleStartNewRun() {
  if (!engine || !canStartNewRun()) return;
  engine.pause();
  const config = computeRunConfig(metaState);
  currentRunConfig = config;
  marketModel = createMarketModel(config.market ?? {});
  eventSystem = createEventScheduler({
    engine,
    logFeed: (inlineState, entry) => {
      if (!inlineState) return;
      logFeedEntry(inlineState, entry);
    },
    applyEffect: (inlineState, eventDef) => {
      if (!inlineState || !eventDef) return null;
      return createEvent(inlineState, eventDef);
    },
    random: Math.random,
    allowedEvents: config.events?.allowedIds ?? BASE_EVENT_IDS
  });
  engine.reset(createInitialState({
    startingCash: config.startingCash,
    assetIds: config.assetIds,
    runConfig: config,
    dayDurationMs: engine.dayDurationMs
  }));
  state = engine.getState();
  refreshCommandModules(state);
  refreshDailyMetrics(state);
  eventSystem.bootstrap(state);
  ensureSelection(state);
  engine.render();
  hasSavedRun = false;
  refreshMetaUI({ allowResume: hasActiveRun(), canStart: canStartNewRun() });
  hideMetaLayer();
  bumpNews("Fresh start. Your future mistakes haven’t happened yet.");
  pushFeed({ text: "New run launched." });
}

function completeRun(reason) {
  if (!engine || !state) return;
  if (state.run?.status === "ended") {
    refreshMetaUI({ allowResume: false, canStart: true });
    showMetaLayer();
    return;
  }

  engine.pause();
  const summary = createRunSummary(state, { reason });
  const { meta, reward } = applyRunSummaryToMeta(metaState, summary);
  metaState = meta;
  summary.metaReward = reward;
  runHistory = saveRunSummary(summary);
  saveMetaState(metaState);
  refreshCommandModules(state);
  pushFeed({
    text: `Run ended — ${summary.label}.`,
    kind: summary.reason === "bankrupt" ? "bad" : summary.reason === "forced-liquidation" ? "bad" : "neutral"
  });
  engine.clearSave();
  hasSavedRun = false;
  engine.render();
  refreshMetaUI({ allowResume: false, canStart: true });
  showMetaLayer();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}

function init() {
  setupControllers();

  metaState = loadMetaState();
  runHistory = loadRunHistory();

  const savedState = loadState();
  hasSavedRun = !!savedState;

  const nextConfig = computeRunConfig(metaState);
  const initialState = savedState ??
    createInitialState({
      startingCash: nextConfig.startingCash,
      assetIds: nextConfig.assetIds,
      runConfig: nextConfig
    });

  engine = createGameEngine({ state: initialState });
  state = engine.getState();
  refreshCommandModules(state);
  refreshDailyMetrics(state);

  currentRunConfig = state.run?.config ?? nextConfig;
  if (!currentRunConfig) currentRunConfig = computeRunConfig(metaState);
  if (!currentRunConfig.events || !Array.isArray(currentRunConfig.events.allowedIds)) {
    const allowed = currentRunConfig.events?.allowedIds ?? [];
    currentRunConfig.events = { allowedIds: Array.from(new Set([...allowed, ...BASE_EVENT_IDS])) };
  }

  marketModel = createMarketModel(currentRunConfig.market ?? {});
  eventSystem = createEventScheduler({
    engine,
    logFeed: (inlineState, entry) => {
      if (!inlineState) return;
      logFeedEntry(inlineState, entry);
    },
    applyEffect: (inlineState, eventDef) => {
      if (!inlineState || !eventDef) return null;
      return createEvent(inlineState, eventDef);
    },
    random: Math.random,
    allowedEvents: currentRunConfig.events?.allowedIds ?? BASE_EVENT_IDS
  });
  eventSystem.bootstrap(state);

  ensureSelection(state);

  engine.onStateChange((nextState) => {
    state = nextState;
    refreshDailyMetrics(state);
  });

  engine.onRender((currentState) => {
    safeRender(() => renderAll(currentState));
  });

  engine.onTick(handleTick);
  engine.onDayEnd(handleDayEnd);

  if (!state.feed || state.feed.length === 0) {
    engine.update((draft) => {
      logFeedEntry(draft, { text: "Markets booted. Try not to recreate 2008." });
    }, { save: false });
  }

  engine.render();

  configureUpgradesIntegration();

  initMetaLayer({
    onStartRun: handleStartNewRun,
    onResumeRun: () => {
      hideMetaLayer();
    },
    onPurchaseUpgrade: handleMetaUpgradePurchase,
    onClose: () => hideMetaLayer()
  });
  metaLayerReady = true;
  refreshMetaUI({ allowResume: hasActiveRun(), canStart: canStartNewRun() });
  if (!hasSavedRun || state.run?.status === "ended") {
    showMetaLayer();
  }

  exposeEngine();
  window.dispatchEvent(new CustomEvent("ttm:gameReady", { detail: engine }));

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) engine.pause();
  });

  window.addEventListener("load", configureUpgradesIntegration, { once: true });
}

function renderAll(currentState) {
  const holdingsValue = portfolioValue(currentState);
  const equity = currentState.cash + holdingsValue;
  const unrealized = unrealizedPL(currentState);
  const totalPL = currentState.realized + unrealized;

  controllers.hud?.render({
    day: currentState.day,
    cash: currentState.cash,
    equity,
    totalPL,
    unrealized,
    running: currentState.running,
    dayRemainingMs: currentState.dayRemainingMs,
    dayDurationMs: engine?.dayDurationMs,
    autoStartNextDay
  });

  controllers.market?.render(currentState);

  const asset = findAsset(currentState, currentState.selected);
  controllers.assetDetail?.render(currentState, asset);
  controllers.events?.render(currentState);
  controllers.news?.render(currentState.feed ?? []);
  controllers.upgrades?.render(currentState);
  updateInsiderBanner(currentState);

  const position = asset ? currentState.positions?.[asset.id] : null;
  controllers.trade?.updateSelection({ asset, position });

  if ((asset?.id ?? null) !== lastSelectedAssetId) {
    controllers.trade?.setQty(sharedTradeQty);
    lastSelectedAssetId = asset?.id ?? null;
  }

  refreshCommandModules(currentState);
}

function safeRender(renderFn) {
  try {
    renderFn();
  } catch (error) {
    console.error(error);
    showMessage("Render error. Recovered.");
  }
}

function showMessage(text, tone = "info") {
  controllers.trade?.showMessage(text, tone);
}

function bumpNews(text, { state: inlineState, tone = "info" } = {}) {
  showMessage(text, tone);
  const entry = { text, kind: tone === "good" ? "good" : tone === "bad" ? "bad" : tone === "warn" ? "warn" : "neutral" };
  if (inlineState) {
    logFeedEntry(inlineState, entry);
  } else {
    pushFeed(entry);
  }
}

function recordTrade(currentState, { id, side, qty, price, realized = 0 }) {
  if (!currentState || !id || !Number.isFinite(qty) || qty <= 0) return;
  if (!Array.isArray(currentState.recentTrades)) currentState.recentTrades = [];
  const safePrice = Number.isFinite(price) ? price : 0;
  const units = Math.max(1, Math.floor(qty));
  currentState.recentTrades.push({
    assetId: id,
    side: side === "sell" ? "sell" : "buy",
    qty: units,
    price: safePrice,
    notional: safePrice * units,
    tick: Number.isFinite(currentState.tick) ? currentState.tick : 0,
    day: Number.isFinite(currentState.day) ? currentState.day : 0
  });
  recordTradeStats(currentState, {
    side,
    qty: units,
    price: safePrice,
    notional: safePrice * units
  });
  trackDailyTrade(currentState, { id, side, qty: units, price: safePrice, realized });
  refreshDailyMetrics(currentState);
  if (currentState.recentTrades.length > 200) {
    currentState.recentTrades.splice(0, currentState.recentTrades.length - 200);
  }
}

function decayRecentTrades(currentState, sequence) {
  if (!currentState) return;
  const seq = Number.isFinite(sequence) ? sequence : currentState.tick ?? 0;
  const threshold = Math.floor(seq) - 360;
  const currentDay = Number.isFinite(currentState.day) ? currentState.day : 0;
  if (!Array.isArray(currentState.recentTrades)) {
    currentState.recentTrades = [];
    return;
  }
  currentState.recentTrades = currentState.recentTrades
    .filter((trade) => {
      if (!trade) return false;
      if (trade.tick != null && trade.tick < threshold) return false;
      if (trade.day != null && currentDay - trade.day > 2) return false;
      return trade.qty > 0 && typeof trade.assetId === "string";
    })
    .slice(-200);
}

function handleTick(currentState) {
  if (eventSystem) {
    eventSystem.onTick(currentState);
  }

  cleanupExpiredEvents(currentState);
  stepAll(currentState, 1, 1.0);

  const metrics = updateRunStats(currentState);
  const portfolio = Number.isFinite(metrics.portfolioValue) ? metrics.portfolioValue : portfolioValue(currentState);
  const debt = Number.isFinite(metrics.debt) ? metrics.debt : currentState.margin?.debt ?? 0;
  const maintenanceRequirement = portfolio * (MARGIN_PARAMS?.maintenance ?? 0.25);
  const underMaintenance = debt > 0 && metrics.netWorth < maintenanceRequirement;
  noteMaintenanceStrike(currentState, underMaintenance);
  refreshDailyMetrics(currentState);

  const outcome = evaluateEndCondition(currentState, { netWorth: metrics.netWorth });
  if (outcome) {
    completeRun(outcome);
  }

}

function handleDayEnd(currentState, context = {}) {
  const steps = Number.isFinite(context.overnightSteps) ? context.overnightSteps : 6;
  const variance = Number.isFinite(context.varianceBoost) ? context.varianceBoost : 1.8;
  stepAll(currentState, steps, variance);
  refreshDailyMetrics(currentState);
  currentState.previousDailyStats = normalizeDailyStats(currentState.dailyStats, currentState);
  const daySummary = summarizeDay({ snapshot: currentState.previousDailyStats, state: currentState });
  if (daySummary && typeof daySummary === "object") {
    const { snapshot, ...rest } = daySummary;
    currentState.lastDaySummary = rest;
  } else {
    currentState.lastDaySummary = null;
  }

  const formatSummaryMoney = (value) => {
    if (!Number.isFinite(value)) return "—";
    const prefix = value > 0 ? "+" : "";
    return `${prefix}${fmtMoney(value)}`;
  };

  const summaryPayload = currentState.lastDaySummary;
  if (summaryPayload) {
    const netTone = Number.isFinite(summaryPayload.netChange)
      ? summaryPayload.netChange > 0
        ? "good"
        : summaryPayload.netChange < 0
          ? "bad"
          : "neutral"
      : "neutral";
    const dayLabel = Number.isFinite(summaryPayload.day) ? summaryPayload.day : currentState.day;
    logFeedEntry(currentState, {
      text: `Day ${dayLabel} closed ${formatSummaryMoney(summaryPayload.netChange)} (Realized ${formatSummaryMoney(summaryPayload.realizedDelta)}, Unrealized ${formatSummaryMoney(summaryPayload.unrealizedDelta)}).`,
      kind: netTone
    });
  }

  const wasRunning = engine?.isRunning?.() ?? false;
  if (engine) {
    engine.pause();
  }

  let advanced = false;
  const continueToNextDay = () => {
    if (advanced) return;
    advanced = true;
    let outcome = null;
    const advanceState = (draft) => {
      draft.day += 1;
      startNewDay(draft);

      const accrueInterest = window.Upgrades?.accrueDailyInterest;
      if (typeof accrueInterest === "function") {
        accrueInterest({
          getCash: () => draft.cash,
          setCash: (value) => {
            draft.cash = value;
          }
        });
      }

      refreshDailyMetrics(draft);
      const metrics = updateRunStats(draft, { dayTick: true });
      const portfolio = Number.isFinite(metrics.portfolioValue) ? metrics.portfolioValue : portfolioValue(draft);
      const debt = Number.isFinite(metrics.debt) ? metrics.debt : draft.margin?.debt ?? 0;
      const maintenanceRequirement = portfolio * (MARGIN_PARAMS?.maintenance ?? 0.25);
      const underMaintenance = debt > 0 && metrics.netWorth < maintenanceRequirement;
      noteMaintenanceStrike(draft, underMaintenance);
      return evaluateEndCondition(draft, { netWorth: metrics.netWorth });
    };

    if (engine) {
      engine.update((draft) => {
        outcome = advanceState(draft);
      }, { save: true });
    } else {
      outcome = advanceState(currentState);
    }

    if (outcome) {
      completeRun(outcome);
      return;
    }

    if (engine) {
      if (typeof engine.restartDayTimer === "function") {
        engine.restartDayTimer();
      }
      const shouldAutoLaunch = autoStartNextDay && wasRunning;
      if (shouldAutoLaunch) {
        engine.start();
      }
    }
    refreshCommandModules(engine ? engine.getState() : currentState);
  };

  if (controllers.dailySummary && typeof controllers.dailySummary.show === "function") {
    controllers.dailySummary.show(summaryPayload, {
      onDismiss: continueToNextDay,
      onLaunchNextDay: continueToNextDay
    });
  } else {
    continueToNextDay();
  }
}

function doBuy(id, qty) {
  if (!id || qty <= 0) return;
  engine.update((draft) => {
    const asset = findAsset(draft, id);
    if (!asset) return;

    const cost = asset.price * qty;
    const pv = portfolioValue(draft);
    const marginApi = window.ttm?.margin;

    const borrowed = window.Upgrades?.maybeBorrow?.({
      cost,
      cash: draft.cash,
      equity: draft.cash + pv
    }) ?? 0;
    draft.cash += borrowed;

    if (marginApi) {
      if (marginApi.isUnderMaintenance(draft, pv)) {
        bumpNews("Buy blocked: maintenance margin breached.", { state: draft, tone: "warn" });
        return;
      }
      const ok = marginApi.buyWithMargin(draft, cost, pv);
      if (!ok) {
        bumpNews(`Insufficient buying power for ${qty} ${id}.`, { state: draft, tone: "warn" });
        return;
      }
    } else {
      if (cost > draft.cash + 1e-9) {
        bumpNews(`Not enough cash to buy ${qty} ${id}.`, { state: draft, tone: "warn" });
        return;
      }
      draft.cash -= cost;
    }

    const existing = draft.positions[id] || { qty: 0, avgCost: 0 };
    const newQty = existing.qty + qty;
    const newCostBasis = (existing.avgCost * existing.qty + cost) / newQty;
    draft.positions[id] = { qty: newQty, avgCost: newCostBasis };
    recordTrade(draft, { id, side: "buy", qty, price: asset.price });
    draft.selected = id;

    bumpNews(`Bought ${qty} ${id} @ ${formatPrice(asset.price)}.`, { state: draft, tone: "good" });
  });
}

function doSell(id, qty) {
  if (!id || qty <= 0) return;
  engine.update((draft) => {
    const position = draft.positions[id];
    if (!position || position.qty <= 0) {
      bumpNews("You don't own that asset. Imagination doesn’t count as collateral.", { state: draft, tone: "warn" });
      return;
    }

    const actualQty = clamp(qty, 1, position.qty);
    const asset = findAsset(draft, id);
    if (!asset) return;

    const proceeds = asset.price * actualQty;
    const profit = (asset.price - position.avgCost) * actualQty;

    if (window.ttm?.margin) {
      window.ttm.margin.applyProceeds(draft, proceeds);
    } else {
      draft.cash += proceeds;
    }

    draft.realized += profit;

    const leftover = position.qty - actualQty;
    if (leftover <= 0) {
      delete draft.positions[id];
    } else {
      draft.positions[id] = { qty: leftover, avgCost: position.avgCost };
    }

    recordTrade(draft, { id, side: "sell", qty: actualQty, price: asset.price, realized: profit });
    draft.selected = id;

    const prefix = profit >= 0 ? "+" : "";
    const tone = profit >= 0 ? "good" : "warn";
    bumpNews(`Sold ${actualQty} ${id} @ ${formatPrice(asset.price)} (${prefix}${fmtMoney(profit)}).`, { state: draft, tone });
  });
}

function setSelected(id) {
  if (!id) return;
  engine.update((draft) => {
    draft.selected = id;
  }, { save: false });
}

function findAsset(currentState, id) {
  return currentState.assets?.find((asset) => asset.id === id) || null;
}

function cleanupExpiredEvents(currentState) {
  const nowTick = currentState.tick;
  currentState.events = currentState.events.filter((event) => {
    const tickOK = event.expiresAtTick == null || nowTick < event.expiresAtTick;
    const dayOK = event.expiresOnDay == null || currentState.day < event.expiresOnDay;
    return tickOK && dayOK;
  });
}

function createEvent(currentState, { label, kind = "neutral", targetId = null, durationTicks = 0, durationDays = 0, effect = {} }) {
  const id = currentState.nextEventId++;
  const event = {
    id,
    label,
    kind,
    targetId,
    effect,
    createdTick: currentState.tick,
    expiresAtTick: durationTicks ? currentState.tick + durationTicks : null,
    expiresOnDay: durationDays ? currentState.day + durationDays : null
  };
  currentState.events.push(event);
  pushFeed({
    text: label,
    kind,
    targetId,
    effect,
    expiresAtTick: event.expiresAtTick,
    expiresOnDay: event.expiresOnDay
  }, { state: currentState });
  return event;
}

function startNewDay(currentState) {
  cleanupExpiredEvents(currentState);
  if (eventSystem) {
    eventSystem.onDayStart(currentState);
  }
  currentState.dailyStats = createDailySnapshot(currentState);
  refreshDailyMetrics(currentState);
  pushFeed({ text: `Day ${currentState.day} begins.` }, { state: currentState });
}

function stepAll(currentState, steps = 1, varianceBoost = 1.0) {
  if (!currentState || !Array.isArray(currentState.assets)) return;
  const assets = currentState.assets;
  const baseTick = Number.isFinite(currentState.tick) ? currentState.tick : 0;

  for (let stepIndex = 0; stepIndex < steps; stepIndex++) {
    const sequence = baseTick + (steps > 1 ? stepIndex + 1 : 1);
    decayRecentTrades(currentState, sequence);

    for (let index = 0; index < assets.length; index++) {
      const asset = assets[index];
      if (!asset) continue;

      asset.prev = asset.price;

      const result = marketModel.evaluate({
        asset,
        state: currentState,
        tickContext: {
          varianceBoost,
          stepIndex,
          totalSteps: steps,
          sequence,
          tick: currentState.tick,
          day: currentState.day,
          assetIndex: index,
          assetCount: assets.length,
          isOvernight: steps > 1
        }
      });

      const boostFn = window.ttm?.insider?.applyInsiderBoost;
      const computedNext = Number.isFinite(result.nextPrice) ? result.nextPrice : asset.price;
      const nextPrice = Math.max(0.0001, boostFn ? boostFn(currentState, asset.id, computedNext) : computedNext);

      asset.price = nextPrice;
      asset.changePct = asset.prev > 0 ? ((asset.price - asset.prev) / asset.prev) * 100 : 0;
      if (!Array.isArray(asset.history)) asset.history = [];
      asset.history.push(asset.price);
      if (asset.history.length > 240) asset.history.shift();

      const influences = Array.isArray(result.influences) ? result.influences : [];
      asset.lastTickMeta = {
        influences,
        diagnostics: result.diagnostics || {},
        flags: result.flags || {},
        sequence,
        volatility: result.volatility,
        drift: result.drift,
        shock: result.shock
      };
      asset.lastInfluences = influences;

      if (Array.isArray(result.news) && result.news.length) {
        for (const item of result.news) {
          if (!item || !item.text) continue;
          logFeedEntry(currentState, {
            text: item.text,
            kind: item.kind ?? "neutral",
            targetId: item.targetId !== undefined ? item.targetId : asset.id,
            effect: item.effect ?? {}
          });
        }
      }

      if (window.Upgrades?.applyBiasOnTick) {
        window.Upgrades.applyBiasOnTick(asset);
      }
    }
  }
}

function logFeedEntry(currentState, entry) {
  const row = {
    time: clock(currentState),
    text: entry.text,
    kind: entry.kind ?? "neutral",
    targetId: entry.targetId ?? null,
    effect: entry.effect ?? {},
    expiresAtTick: entry.expiresAtTick ?? null,
    expiresOnDay: entry.expiresOnDay ?? null
  };
  currentState.feed.push(row);
  if (currentState.feed.length > 60) currentState.feed.shift();
}

function pushFeed(entry, { state: inlineState } = {}) {
  if (inlineState) {
    logFeedEntry(inlineState, entry);
    return;
  }
  engine.update((draft) => {
    logFeedEntry(draft, entry);
  }, { save: entry.save ?? true });
}

function portfolioValue(currentState) {
  let sum = 0;
  for (const [id, position] of Object.entries(currentState.positions || {})) {
    const asset = findAsset(currentState, id);
    if (!asset) continue;
    sum += position.qty * asset.price;
  }
  return sum;
}

function unrealizedPL(currentState) {
  let sum = 0;
  for (const [id, position] of Object.entries(currentState.positions || {})) {
    const asset = findAsset(currentState, id);
    if (!asset) continue;
    sum += (asset.price - position.avgCost) * position.qty;
  }
  return sum;
}

function ensureDailyStats(currentState) {
  if (!currentState) return null;
  const normalized = normalizeDailyStats(currentState.dailyStats, currentState);
  currentState.dailyStats = normalized;
  return normalized;
}

function ensureDailyAssetEntry(currentState, assetId, daily = ensureDailyStats(currentState)) {
  if (!daily || !assetId) return null;
  if (!daily.priceBaselines) daily.priceBaselines = {};
  if (!daily.positionBaselines) daily.positionBaselines = {};
  if (!daily.assets) daily.assets = {};

  if (!daily.assets[assetId]) {
    const asset = findAsset(currentState, assetId);
    const position = currentState.positions?.[assetId];
    const baselinePrice = Number.isFinite(daily.priceBaselines?.[assetId])
      ? daily.priceBaselines[assetId]
      : Number.isFinite(asset?.price)
        ? asset.price
        : 0;
    const baselineQty = Number.isFinite(daily.positionBaselines?.[assetId]?.qty)
      ? daily.positionBaselines[assetId].qty
      : Number.isFinite(position?.qty)
        ? position.qty
        : 0;
    const baselineAvgCost = Number.isFinite(daily.positionBaselines?.[assetId]?.avgCost)
      ? daily.positionBaselines[assetId].avgCost
      : Number.isFinite(position?.avgCost)
        ? position.avgCost
        : 0;

    const safePrice = Number.isFinite(baselinePrice) ? baselinePrice : 0;
    const safeQty = Number.isFinite(baselineQty) ? baselineQty : 0;
    const safeAvgCost = Number.isFinite(baselineAvgCost) ? baselineAvgCost : 0;

    daily.priceBaselines[assetId] = safePrice;
    daily.positionBaselines[assetId] = {
      qty: safeQty,
      avgCost: safeAvgCost
    };

    const startValue = safeQty * safePrice;
    const startUnrealized = safeQty * (safePrice - safeAvgCost);

    daily.assets[assetId] = {
      id: assetId,
      startPrice: safePrice,
      startQty: safeQty,
      startValue,
      currentValue: startValue,
      startUnrealized,
      currentUnrealized: startUnrealized,
      unrealizedChange: 0,
      trades: 0,
      buyVolume: 0,
      sellVolume: 0,
      tradedQty: 0,
      buyNotional: 0,
      sellNotional: 0,
      realizedDelta: 0
    };
  }

  const entry = daily.assets[assetId];
  entry.trades = Number.isFinite(entry.trades) ? entry.trades : 0;
  entry.buyVolume = Number.isFinite(entry.buyVolume) ? entry.buyVolume : 0;
  entry.sellVolume = Number.isFinite(entry.sellVolume) ? entry.sellVolume : 0;
  entry.tradedQty = Number.isFinite(entry.tradedQty) ? entry.tradedQty : entry.buyVolume + entry.sellVolume;
  entry.buyNotional = Number.isFinite(entry.buyNotional) ? entry.buyNotional : 0;
  entry.sellNotional = Number.isFinite(entry.sellNotional) ? entry.sellNotional : 0;
  entry.realizedDelta = Number.isFinite(entry.realizedDelta) ? entry.realizedDelta : 0;
  entry.startValue = Number.isFinite(entry.startValue) ? entry.startValue : entry.startQty * entry.startPrice;
  entry.currentValue = Number.isFinite(entry.currentValue) ? entry.currentValue : entry.startValue;
  entry.startUnrealized = Number.isFinite(entry.startUnrealized) ? entry.startUnrealized : 0;
  entry.currentUnrealized = Number.isFinite(entry.currentUnrealized) ? entry.currentUnrealized : entry.startUnrealized;
  entry.unrealizedChange = Number.isFinite(entry.unrealizedChange) ? entry.unrealizedChange : 0;
  entry.netQtyChange = Number.isFinite(entry.netQtyChange) ? entry.netQtyChange : 0;
  return entry;
}

function trackDailyTrade(currentState, { id, side, qty, price, realized = 0 }) {
  const daily = ensureDailyStats(currentState);
  if (!daily || !id || !Number.isFinite(qty) || qty <= 0) return;

  if (!daily.trades || typeof daily.trades !== "object") {
    daily.trades = { total: 0, buy: 0, sell: 0, volume: 0, notional: 0 };
  }

  const units = Math.max(1, Math.floor(qty));
  const notional = Number.isFinite(price) ? price * units : 0;

  daily.trades.total = Number.isFinite(daily.trades.total) ? daily.trades.total + 1 : 1;
  daily.trades.volume = Number.isFinite(daily.trades.volume) ? daily.trades.volume + units : units;
  daily.trades.notional = Number.isFinite(daily.trades.notional) ? daily.trades.notional + notional : notional;
  if (side === "sell") {
    daily.trades.sell = Number.isFinite(daily.trades.sell) ? daily.trades.sell + 1 : 1;
  } else {
    daily.trades.buy = Number.isFinite(daily.trades.buy) ? daily.trades.buy + 1 : 1;
  }

  const assetEntry = ensureDailyAssetEntry(currentState, id, daily);
  if (!assetEntry) return;
  assetEntry.trades += 1;
  assetEntry.tradedQty += units;
  if (side === "sell") {
    assetEntry.sellVolume += units;
    assetEntry.sellNotional += notional;
    if (Number.isFinite(realized)) {
      assetEntry.realizedDelta += realized;
    }
  } else {
    assetEntry.buyVolume += units;
    assetEntry.buyNotional += notional;
  }
  assetEntry.lastTradeSide = side === "sell" ? "sell" : "buy";
  if (Number.isFinite(price)) {
    assetEntry.lastTradePrice = price;
  }

  if (Number.isFinite(currentState.tick)) {
    daily.lastTradeTick = currentState.tick;
  }
  if (Number.isFinite(currentState.day)) {
    daily.lastTradeDay = currentState.day;
  }
}

function refreshDailyMetrics(currentState) {
  const daily = ensureDailyStats(currentState);
  if (!daily) return;

  const cash = Number.isFinite(currentState.cash) ? currentState.cash : 0;
  const portfolio = portfolioValue(currentState);
  const netWorth = cash + portfolio;
  const realized = Number.isFinite(currentState.realized) ? currentState.realized : 0;
  const unrealized = unrealizedPL(currentState);

  if (Number.isFinite(currentState.day)) {
    daily.day = currentState.day;
  }
  daily.currentNetWorth = netWorth;
  daily.netWorthDelta = netWorth - (Number.isFinite(daily.startNetWorth) ? daily.startNetWorth : netWorth);
  daily.realizedDelta = realized - (Number.isFinite(daily.startRealized) ? daily.startRealized : realized);
  daily.unrealizedDelta = unrealized - (Number.isFinite(daily.startUnrealized) ? daily.startUnrealized : unrealized);
  daily.endCash = cash;
  daily.endPortfolioValue = portfolio;
  daily.lastUpdatedTick = Number.isFinite(currentState.tick) ? currentState.tick : daily.lastUpdatedTick ?? 0;
  daily.lastUpdatedDay = Number.isFinite(currentState.day) ? currentState.day : daily.lastUpdatedDay ?? daily.day;

  const positions = currentState.positions && typeof currentState.positions === "object" ? currentState.positions : {};
  for (const asset of currentState.assets ?? []) {
    if (!asset || typeof asset.id !== "string") continue;
    const entry = ensureDailyAssetEntry(currentState, asset.id, daily);
    const startPrice = Number.isFinite(entry.startPrice) ? entry.startPrice : Number.isFinite(daily.priceBaselines?.[asset.id]) ? daily.priceBaselines[asset.id] : 0;
    const position = positions[asset.id];
    const currentQty = Number.isFinite(position?.qty) ? position.qty : 0;
    const currentPrice = Number.isFinite(asset.price) ? asset.price : startPrice;
    const startQty = Number.isFinite(entry.startQty) ? entry.startQty : 0;
    const startAvgCost = Number.isFinite(daily.positionBaselines?.[asset.id]?.avgCost)
      ? daily.positionBaselines[asset.id].avgCost
      : Number.isFinite(position?.avgCost)
        ? position.avgCost
        : 0;
    const currentAvgCost = Number.isFinite(position?.avgCost) ? position.avgCost : startAvgCost;

    entry.endQty = currentQty;
    entry.lastPrice = currentPrice;
    entry.priceChange = currentPrice - startPrice;
    entry.priceChangePct = startPrice !== 0 ? (entry.priceChange / startPrice) * 100 : 0;
    entry.startValue = Number.isFinite(entry.startValue) ? entry.startValue : startQty * startPrice;
    entry.currentValue = currentQty * currentPrice;
    entry.valueChange = entry.currentValue - entry.startValue;
    entry.startUnrealized = Number.isFinite(entry.startUnrealized) ? entry.startUnrealized : startQty * (startPrice - startAvgCost);
    entry.currentUnrealized = currentQty * (currentPrice - currentAvgCost);
    entry.unrealizedChange = entry.currentUnrealized - entry.startUnrealized;
    entry.netQtyChange = currentQty - startQty;
  }
}

function configureUpgradesIntegration() {
  if (upgradesConfigured) return;
  if (!window.Upgrades || typeof window.Upgrades.configure !== "function") return;
  window.Upgrades.configure({
    getCash: () => engine.getState().cash,
    setCash: (value) => {
      engine.update((draft) => {
        draft.cash = value;
      }, { save: true });
    },
    getEquity: () => {
      const current = engine.getState();
      return current.cash + portfolioValue(current);
    },
    listAssetKeys: () => {
      const assets = engine.getState().assets || [];
      return assets.map((asset) => asset.id);
    }
  });
  upgradesConfigured = true;
}

function ensureSelection(currentState) {
  if (!currentState.selected && Array.isArray(currentState.assets) && currentState.assets.length) {
    currentState.selected = currentState.assets[0].id;
  }
}

function exposeEngine() {
  if (!engine) return;
  Object.defineProperty(engine, "state", {
    get() {
      return engine.getState();
    },
    configurable: true,
    enumerable: true
  });
  engine.portfolioValue = (currentState = engine.getState()) => portfolioValue(currentState);
  engine.unrealizedPL = (currentState = engine.getState()) => unrealizedPL(currentState);
  engine.renderAll = () => engine.render();
  engine.pushFeed = (entry) => pushFeed(entry);
  window.ttmGame = engine;
}
