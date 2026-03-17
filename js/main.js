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
import { MARGIN_PARAMS, registerMargin, ensureMarginState } from "./core/margin.js";
import { registerInsider, activeTip, ensureInsiderState } from "./core/insider.js";
import { purchaseUpgrade, UPGRADE_DEF, registerUpgrades, ensureUpgradeState } from "./core/upgrades.js";
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
import { createPortfolioLedgerController } from "./ui/portfolioLedger.js";
import { createRunBriefingController } from "./ui/runBriefing.js";
import { initWingTabsController } from "./ui/wingTabs.js";
import { createOperationsController } from "./ui/operations.js";
import {
  ensureOperationsState,
  primeOperationsForDay,
  recordOperationsTrade,
  resolveExpiredContracts,
  claimCompletedContract,
  summarizeOperations
} from "./core/operations.js";

const fmtMoney = (value) =>
  `${value < 0 ? "-" : ""}$${Math.abs(Number(value) || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const parseQty = (value) => {
  const numeric = Math.floor(Number(value));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 1;
};

const formatPrice = (price) => {
  const numeric = Number(price) || 0;
  const abs = Math.abs(numeric);
  const digits = abs >= 1000 ? 2 : abs >= 1 ? 2 : 4;
  return `$${numeric.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  })}`;
};

const clock = (currentState) => `D${currentState.day} | T${currentState.tick}`;
const AUTO_START_KEY = "ttm_auto_next_day";

let engine = null;
let state = null;
let marketModel = null;
let eventSystem = null;
let metaState = createInitialMetaState();
let runHistory = [];
let currentRunConfig = null;
let hasSavedRun = false;
let metaLayerReady = false;
let marginApi = null;
let insiderApi = null;
let upgradesApi = null;

const controllers = {};
let sharedTradeQty = 10;
let lastSelectedAssetId = null;
let autoStartNextDay = loadAutoStartPreference(false);

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

function hasActiveRun() {
  if (!state?.run) return false;
  if (state.run.status === "ended") return false;
  if (state.run.status === "pending" && (state.tick ?? 0) === 0) return false;
  return true;
}

function canStartNewRun() {
  if (!state?.run) return true;
  if (state.run.status === "ended") return true;
  if (state.run.status === "pending" && (state.tick ?? 0) === 0) return true;
  return false;
}

function hydrateStateSlices(snapshot) {
  if (!snapshot) return snapshot;
  ensureUpgradeState(snapshot);
  ensureMarginState(snapshot);
  ensureInsiderState(snapshot);
  ensureOperationsState(snapshot);
  return snapshot;
}

function getDebt(currentState) {
  return Number(currentState?.margin?.debt) || 0;
}

function getEquity(currentState) {
  return (Number(currentState?.cash) || 0) + portfolioValue(currentState) - getDebt(currentState);
}

function createRuntimeSystems(config) {
  marketModel = createMarketModel(config?.market ?? {});
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
    allowedEvents: config?.events?.allowedIds ?? BASE_EVENT_IDS
  });
}

function refreshMetaUI({ allowResume = hasActiveRun(), canStart = canStartNewRun() } = {}) {
  if (!metaLayerReady) return;
  updateMetaLayer({
    meta: metaState,
    upgrades: listMetaUpgrades(metaState),
    summary: metaState?.lastSummary ?? null,
    history: runHistory,
    allowResume,
    canStart
  });
}

function refreshCommandModules(currentState = state) {
  if (!controllers.commandModules || !currentState) return;
  controllers.commandModules.render(currentState, {
    feed: currentState.feed ?? [],
    operations: summarizeOperations(currentState)
  });
}

function buildBriefingPayload(currentState, selectedAsset) {
  const operations = summarizeOperations(currentState);
  const daily = ensureDailyStats(currentState);
  const marketValue = portfolioValue(currentState);
  const debt = getDebt(currentState);
  const buyingPower = marginApi?.buyingPower?.(currentState, marketValue) ?? (currentState.cash || 0);
  const pendingEvents = Array.isArray(currentState?.pendingEvents) ? currentState.pendingEvents : [];
  const macro = selectedAsset?.lastTickMeta?.diagnostics?.macro
    ?? currentState.assets?.[0]?.lastTickMeta?.diagnostics?.macro
    ?? {};
  const tip = activeTip(currentState);
  const urgentContract = operations.claimableContracts?.[0]
    ?? operations.activeContracts?.slice().sort((left, right) => (left.dueDay ?? 0) - (right.dueDay ?? 0))[0]
    ?? null;

  let objectiveValue = "Grow equity and build research credits";
  let objectiveMeta = "No urgent contracts on the board.";
  if (operations.readyToClaim > 0 && operations.claimableContracts?.[0]) {
    const claim = operations.claimableContracts[0];
    objectiveValue = `Claim ${claim.id}`;
    objectiveMeta = `Reward ${fmtMoney(claim.rewardCash)} and +${claim.rewardRep} REP.`;
  } else if (urgentContract) {
    const remaining = Math.max(0, (urgentContract.targetQty || 0) - (urgentContract.progressQty || 0));
    const verb = urgentContract.side === "either" ? "Trade" : urgentContract.side === "buy" ? "Acquire" : "Offload";
    objectiveValue = `${verb} ${urgentContract.assetId}`;
    objectiveMeta = `${remaining} units left before D${urgentContract.dueDay}.`;
  } else if (pendingEvents.length > 0) {
    objectiveValue = `Resolve ${pendingEvents.length} active scenario${pendingEvents.length === 1 ? "" : "s"}`;
    objectiveMeta = pendingEvents[0]?.label || "Active event awaiting your decision.";
  }

  let headline = `Day ${currentState.day} is live. Balance risk, contracts, and timing.`;
  if (tip) {
    headline = `Insider wire is active on ${tip.assetId}. Use the window before it fades.`;
  } else if (pendingEvents.length > 0) {
    headline = `${pendingEvents.length} live scenario${pendingEvents.length === 1 ? "" : "s"} can change the run trajectory.`;
  } else if (operations.readyToClaim > 0) {
    headline = `${operations.readyToClaim} contract reward${operations.readyToClaim === 1 ? "" : "s"} can be claimed immediately.`;
  }

  return {
    title: `Day ${currentState.day} Briefing`,
    headline,
    cards: [
      {
        label: "Primary Objective",
        value: objectiveValue,
        meta: objectiveMeta
      },
      {
        label: "Risk Envelope",
        value: debt > 0 ? `Debt ${fmtMoney(debt)}` : "Cash only posture",
        meta: `Buying power ${fmtMoney(buyingPower)}${marginApi?.isUnderMaintenance?.(currentState, marketValue) ? " | Maintenance pressure elevated." : ""}`
      },
      {
        label: "Macro Regime",
        value: macro.label || "Balanced tape",
        meta: `Volatility ${(Number(macro.volatilityBias) || 1).toFixed(2)}x baseline. Liquidity ${(Number(macro.effectiveLiquidity ?? macro.liquidity) || 0).toFixed(2)}.`
      },
      {
        label: "Trade Tempo",
        value: `${daily?.trades?.total ?? 0} trades today`,
        meta: `Notional ${fmtMoney(daily?.trades?.notional ?? 0)}${tip ? ` | Insider focus ${tip.assetId}` : ""}`
      }
    ]
  };
}

function handleMetaUpgradePurchase(id) {
  if (!id || !metaState) return;
  if (purchaseMetaUpgrade(metaState, id)) {
    saveMetaState(metaState);
    refreshMetaUI({ allowResume: hasActiveRun(), canStart: canStartNewRun() });
    refreshCommandModules();
  } else {
    console.warn("meta upgrade locked or insufficient currency", id);
  }
}

function setupControllers() {
  controllers.trade = createTradeControlsController({
    onBuy: (qty) => {
      if (state?.selected) doBuy(state.selected, qty);
    },
    onSell: (qty) => {
      if (state?.selected) doSell(state.selected, qty);
    },
    onQtyChange: (qty) => {
      sharedTradeQty = parseQty(qty);
      controllers.market?.setDefaultQty(sharedTradeQty);
    },
    parseQty
  });

  controllers.market = createMarketListController({
    onSelectAsset: (id) => setSelected(id),
    onDefaultQtyChange: (qty) => {
      sharedTradeQty = parseQty(qty);
      controllers.trade?.setQty(sharedTradeQty);
    },
    onQuickTrade: (id, side) => {
      const qty = parseQty(sharedTradeQty);
      if (side === "sell") doSell(id, qty);
      else doBuy(id, qty);
    },
    parseQty
  });

  controllers.assetDetail = createAssetDetailController();
  controllers.news = createNewsFeedController();
  controllers.events = createEventQueueController({
    onResolve: (instanceId, choiceId) => {
      if (eventSystem) eventSystem.resolve(instanceId, choiceId);
    }
  });
  controllers.dailySummary = createDailySummaryController();
  controllers.upgrades = createUpgradeShopController({
    onRequestPurchase: (id) => {
      if (!engine || !id) return { success: false };
      let success = false;
      let message = "Unable to purchase upgrade.";
      engine.update((draft) => {
        hydrateStateSlices(draft);
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
      if (engine.isRunning()) engine.pause();
      else engine.start();
    },
    onEndDay: () => {
      if (!engine) return;
      engine.endDay({ overnightSteps: 6, varianceBoost: 1.8, reason: "manual" });
      bumpNews("Market closed. Overnight volatility is now in play.");
    },
    onReset: () => {
      if (!confirm("Reset this run and clear the local save?")) return;
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
      if (state && controllers.hud) {
        controllers.hud.render({
          day: state.day,
          cash: state.cash,
          equity: getEquity(state),
          totalPL: state.realized + unrealizedPL(state),
          unrealized: unrealizedPL(state),
          debt: getDebt(state),
          rep: summarizeOperations(state).reputation,
          exposure: getEquity(state) > 0 ? portfolioValue(state) / getEquity(state) : 0,
          running: engine?.isRunning?.() ?? false,
          dayRemainingMs: state.dayRemainingMs,
          dayDurationMs: engine?.dayDurationMs,
          autoStartNextDay
        });
      }
    }
  });
  controllers.commandModules = createCommandModulesController();
  controllers.portfolio = createPortfolioLedgerController({
    onSelectAsset: (id) => setSelected(id)
  });
  controllers.briefing = createRunBriefingController();
  controllers.operations = createOperationsController({
    onClaim: (contractId) => {
      if (!engine || !contractId) return { success: false };
      let outcome = { success: false };
      engine.update((draft) => {
        const result = claimCompletedContract(draft, contractId);
        if (!result.success) return;
        outcome = result;
        bumpNews(`Contract settled: +${fmtMoney(result.cashReward)} and +${result.repReward} REP.`, {
          state: draft,
          tone: "good"
        });
      }, { save: true });
      return outcome;
    }
  });
  controllers.wingTabs = initWingTabsController();

  controllers.market?.setDefaultQty(sharedTradeQty);
  controllers.trade?.setQty(sharedTradeQty);

  window.__TTM_UI__ = {
    hud: controllers.hud,
    market: controllers.market,
    detail: controllers.assetDetail,
    trade: controllers.trade,
    news: controllers.news,
    upgrades: controllers.upgrades,
    events: controllers.events,
    dailySummary: controllers.dailySummary,
    commandModules: controllers.commandModules,
    portfolio: controllers.portfolio,
    briefing: controllers.briefing
  };
}

function handleStartNewRun() {
  if (!engine || !canStartNewRun()) return;
  engine.pause();

  currentRunConfig = computeRunConfig(metaState);
  createRuntimeSystems(currentRunConfig);
  engine.reset(createInitialState({
    startingCash: currentRunConfig.startingCash,
    assetIds: currentRunConfig.assetIds,
    runConfig: currentRunConfig,
    dayDurationMs: engine.dayDurationMs
  }));
  engine.update((draft) => {
    hydrateStateSlices(draft);
    primeOperationsForDay(draft);
  }, { save: false, render: false });

  state = engine.getState();
  refreshDailyMetrics(state);
  eventSystem.bootstrap(state);
  ensureSelection(state);
  hasSavedRun = false;
  controllers.wingTabs?.setActiveWing?.("spine");
  refreshCommandModules(state);
  refreshMetaUI({ allowResume: hasActiveRun(), canStart: canStartNewRun() });
  hideMetaLayer();
  bumpNews("New run launched. The bridge is clear and your mistakes are still theoretical.");
  pushFeed({ text: "New run launched." });
  engine.render();
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
  const applied = applyRunSummaryToMeta(metaState, summary);
  metaState = applied.meta;
  summary.metaReward = applied.reward;
  runHistory = saveRunSummary(summary);
  saveMetaState(metaState);
  pushFeed({
    text: `Run ended - ${summary.label}.`,
    kind: summary.reason === "bankrupt" || summary.reason === "forced-liquidation" ? "bad" : "neutral"
  });
  engine.clearSave();
  hasSavedRun = false;
  refreshCommandModules(state);
  refreshMetaUI({ allowResume: false, canStart: true });
  engine.render();
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
  currentRunConfig = savedState?.run?.config ?? nextConfig;
  if (!currentRunConfig?.events || !Array.isArray(currentRunConfig.events.allowedIds)) {
    currentRunConfig = {
      ...currentRunConfig,
      events: {
        allowedIds: Array.from(new Set([...(currentRunConfig?.events?.allowedIds ?? []), ...BASE_EVENT_IDS]))
      }
    };
  }

  const initialState = hydrateStateSlices(savedState ?? createInitialState({
    startingCash: currentRunConfig.startingCash,
    assetIds: currentRunConfig.assetIds,
    runConfig: currentRunConfig
  }));

  engine = createGameEngine({ state: initialState });
  upgradesApi = registerUpgrades(engine);
  marginApi = registerMargin(engine);
  insiderApi = registerInsider(engine, {
    getAssetIds: (currentState = engine.getState()) => (currentState.assets || []).map((asset) => asset.id)
  });
  engine.update((draft) => {
    hydrateStateSlices(draft);
    primeOperationsForDay(draft);
  }, { save: false, render: false });
  state = engine.getState();

  createRuntimeSystems(currentRunConfig);
  eventSystem.bootstrap(state);
  ensureSelection(state);
  refreshDailyMetrics(state);
  refreshCommandModules(state);

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
      logFeedEntry(draft, { text: "Markets booted. Trade flow is online." });
    }, { save: false, render: false });
  }

  initMetaLayer({
    onStartRun: handleStartNewRun,
    onResumeRun: () => hideMetaLayer(),
    onPurchaseUpgrade: handleMetaUpgradePurchase,
    onClose: () => hideMetaLayer()
  });
  metaLayerReady = true;
  refreshMetaUI({ allowResume: hasActiveRun(), canStart: canStartNewRun() });
  if (!hasSavedRun || state.run?.status === "ended") {
    showMetaLayer();
  }

  exposeEngine();
  engine.render();

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) engine.pause();
  });
}

function renderAll(currentState) {
  const marketValue = portfolioValue(currentState);
  const debt = getDebt(currentState);
  const equity = getEquity(currentState);
  const unrealized = unrealizedPL(currentState);
  const totalPL = (currentState.realized || 0) + unrealized;
  const exposure = equity > 0 ? marketValue / equity : 0;
  const operations = summarizeOperations(currentState);

  controllers.hud?.render({
    day: currentState.day,
    cash: currentState.cash,
    equity,
    totalPL,
    unrealized,
    debt,
    rep: operations.reputation,
    exposure,
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
  controllers.operations?.render(currentState);
  controllers.portfolio?.render(currentState);
  controllers.briefing?.render(buildBriefingPayload(currentState, asset));
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
    showMessage("Render error recovered.", "warn");
  }
}

function showMessage(text, tone = "info") {
  controllers.trade?.showMessage(text, tone);
}

function bumpNews(text, { state: inlineState, tone = "info" } = {}) {
  showMessage(text, tone);
  const entry = {
    text,
    kind: tone === "good" ? "good" : tone === "bad" ? "bad" : tone === "warn" ? "warn" : "neutral"
  };
  if (inlineState) {
    logFeedEntry(inlineState, entry);
  } else {
    pushFeed(entry);
  }
}

function recordTrade(currentState, { id, side, qty, price, realized = 0 }) {
  if (!currentState || !id || !Number.isFinite(qty) || qty <= 0) return;
  if (!Array.isArray(currentState.recentTrades)) currentState.recentTrades = [];

  const units = Math.max(1, Math.floor(qty));
  const safePrice = Number.isFinite(price) ? price : 0;
  currentState.recentTrades.push({
    assetId: id,
    side: side === "sell" ? "sell" : "buy",
    qty: units,
    price: safePrice,
    notional: safePrice * units,
    tick: Number.isFinite(currentState.tick) ? currentState.tick : 0,
    day: Number.isFinite(currentState.day) ? currentState.day : 0
  });

  recordOperationsTrade(currentState, { id, side, qty: units });
  recordTradeStats(currentState, { side, qty: units, price: safePrice, notional: safePrice * units });
  trackDailyTrade(currentState, { id, side, qty: units, price: safePrice, realized });
  refreshDailyMetrics(currentState);

  if (currentState.recentTrades.length > 200) {
    currentState.recentTrades.splice(0, currentState.recentTrades.length - 200);
  }
}

function decayRecentTrades(currentState, sequence) {
  if (!currentState) return;
  const threshold = Math.floor(Number.isFinite(sequence) ? sequence : currentState.tick ?? 0) - 360;
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
  eventSystem?.onTick(currentState);
  cleanupExpiredEvents(currentState);
  stepAll(currentState, 1, 1);

  const metrics = updateRunStats(currentState);
  const marketValue = Number.isFinite(metrics.portfolioValue) ? metrics.portfolioValue : portfolioValue(currentState);
  const debt = Number.isFinite(metrics.debt) ? metrics.debt : getDebt(currentState);
  const maintenanceRequirement = marketValue * (MARGIN_PARAMS?.maintenance ?? 0.25);
  const underMaintenance = debt > 0 && metrics.netWorth < maintenanceRequirement;
  noteMaintenanceStrike(currentState, underMaintenance);
  refreshDailyMetrics(currentState);

  const outcome = evaluateEndCondition(currentState, { netWorth: metrics.netWorth });
  if (outcome) {
    completeRun(outcome);
  }
}

function handleDayEnd(currentState, context = {}) {
  const failedContracts = resolveExpiredContracts(currentState);
  if (failedContracts > 0) {
    logFeedEntry(currentState, {
      text: `${failedContracts} contract${failedContracts === 1 ? "" : "s"} expired before settlement.`,
      kind: "warn"
    });
  }

  const overnightSteps = Number.isFinite(context.overnightSteps) ? context.overnightSteps : 6;
  const varianceBoost = Number.isFinite(context.varianceBoost) ? context.varianceBoost : 1.8;
  stepAll(currentState, overnightSteps, varianceBoost);
  refreshDailyMetrics(currentState);

  currentState.previousDailyStats = normalizeDailyStats(currentState.dailyStats, currentState);
  const summary = summarizeDay({ snapshot: currentState.previousDailyStats, state: currentState });
  currentState.lastDaySummary = summary ? { ...summary } : null;

  if (summary) {
    const tone = summary.netChange > 0 ? "good" : summary.netChange < 0 ? "bad" : "neutral";
    logFeedEntry(currentState, {
      text: `Day ${summary.day} closed ${summary.netChange >= 0 ? "+" : ""}${fmtMoney(summary.netChange)}. Realized ${summary.realizedDelta >= 0 ? "+" : ""}${fmtMoney(summary.realizedDelta)}, unrealized ${summary.unrealizedDelta >= 0 ? "+" : ""}${fmtMoney(summary.unrealizedDelta)}.`,
      kind: tone
    });
  }

  const wasRunning = engine?.isRunning?.() ?? false;
  engine?.pause();

  let advanced = false;
  const continueToNextDay = () => {
    if (advanced) return;
    advanced = true;

    let outcome = null;
    const advanceState = (draft) => {
      draft.day += 1;
      startNewDay(draft);
      primeOperationsForDay(draft);
      refreshDailyMetrics(draft);

      const metrics = updateRunStats(draft, { dayTick: true });
      const marketValue = Number.isFinite(metrics.portfolioValue) ? metrics.portfolioValue : portfolioValue(draft);
      const debt = Number.isFinite(metrics.debt) ? metrics.debt : getDebt(draft);
      const maintenanceRequirement = marketValue * (MARGIN_PARAMS?.maintenance ?? 0.25);
      const underMaintenance = debt > 0 && metrics.netWorth < maintenanceRequirement;
      noteMaintenanceStrike(draft, underMaintenance);
      outcome = evaluateEndCondition(draft, { netWorth: metrics.netWorth });
    };

    if (engine) {
      engine.update((draft) => {
        hydrateStateSlices(draft);
        advanceState(draft);
      }, { save: true });
    } else {
      advanceState(currentState);
    }

    if (outcome) {
      completeRun(outcome);
      return;
    }

    if (engine) {
      engine.restartDayTimer?.();
      if (autoStartNextDay && wasRunning) {
        engine.start();
      }
    }

    refreshCommandModules(engine ? engine.getState() : currentState);
  };

  if (controllers.dailySummary?.show) {
    controllers.dailySummary.show(summary ? { ...summary } : null, {
      onDismiss: continueToNextDay,
      onLaunchNextDay: continueToNextDay
    });
  } else {
    continueToNextDay();
  }
}

function doBuy(id, qty) {
  if (!engine || !id || qty <= 0) return;
  engine.update((draft) => {
    hydrateStateSlices(draft);
    const asset = findAsset(draft, id);
    if (!asset) return;

    const cost = asset.price * qty;
    const marketValue = portfolioValue(draft);
    if (marginApi?.isUnderMaintenance?.(draft, marketValue)) {
      bumpNews("Buy blocked: maintenance margin breached.", { state: draft, tone: "warn" });
      return;
    }

    const ok = marginApi?.buyWithMargin?.(draft, cost, marketValue);
    if (!ok) {
      bumpNews(`Insufficient buying power for ${qty} ${id}.`, { state: draft, tone: "warn" });
      return;
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
  if (!engine || !id || qty <= 0) return;
  engine.update((draft) => {
    hydrateStateSlices(draft);
    const position = draft.positions[id];
    if (!position || position.qty <= 0) {
      bumpNews("You do not hold that asset.", { state: draft, tone: "warn" });
      return;
    }

    const actualQty = clamp(qty, 1, position.qty);
    const asset = findAsset(draft, id);
    if (!asset) return;

    const proceeds = asset.price * actualQty;
    const profit = (asset.price - position.avgCost) * actualQty;
    marginApi?.applyProceeds?.(draft, proceeds);
    draft.realized += profit;

    const leftover = position.qty - actualQty;
    if (leftover <= 0) delete draft.positions[id];
    else draft.positions[id] = { qty: leftover, avgCost: position.avgCost };

    recordTrade(draft, { id, side: "sell", qty: actualQty, price: asset.price, realized: profit });
    draft.selected = id;
    bumpNews(`Sold ${actualQty} ${id} @ ${formatPrice(asset.price)} (${profit >= 0 ? "+" : ""}${fmtMoney(profit)}).`, {
      state: draft,
      tone: profit >= 0 ? "good" : "warn"
    });
  });
}

function setSelected(id) {
  if (!engine || !id) return;
  engine.update((draft) => {
    draft.selected = id;
  }, { save: false });
}

function findAsset(currentState, id) {
  return currentState?.assets?.find((asset) => asset.id === id) || null;
}

function cleanupExpiredEvents(currentState) {
  currentState.events = (currentState.events || []).filter((event) => {
    const tickOk = event.expiresAtTick == null || currentState.tick < event.expiresAtTick;
    const dayOk = event.expiresOnDay == null || currentState.day < event.expiresOnDay;
    return tickOk && dayOk;
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
  eventSystem?.onDayStart(currentState);
  currentState.dailyStats = createDailySnapshot(currentState);
  refreshDailyMetrics(currentState);
  pushFeed({ text: `Day ${currentState.day} begins.` }, { state: currentState });
}

function stepAll(currentState, steps = 1, varianceBoost = 1) {
  if (!currentState || !Array.isArray(currentState.assets)) return;
  const baseTick = Number.isFinite(currentState.tick) ? currentState.tick : 0;

  for (let stepIndex = 0; stepIndex < steps; stepIndex += 1) {
    const sequence = baseTick + (steps > 1 ? stepIndex + 1 : 1);
    decayRecentTrades(currentState, sequence);

    for (let index = 0; index < currentState.assets.length; index += 1) {
      const asset = currentState.assets[index];
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
          assetCount: currentState.assets.length,
          isOvernight: steps > 1
        }
      });

      const computedNext = Number.isFinite(result.nextPrice) ? result.nextPrice : asset.price;
      const nextPrice = Math.max(0.0001, insiderApi?.applyInsiderBoost?.(currentState, asset.id, computedNext) ?? computedNext);
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

      if (Array.isArray(result.news)) {
        result.news.forEach((item) => {
          if (!item?.text) return;
          logFeedEntry(currentState, {
            text: item.text,
            kind: item.kind ?? "neutral",
            targetId: item.targetId !== undefined ? item.targetId : asset.id,
            effect: item.effect ?? {}
          });
        });
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
  engine?.update((draft) => {
    logFeedEntry(draft, entry);
  }, { save: entry.save ?? true });
}

function portfolioValue(currentState) {
  let sum = 0;
  for (const [id, position] of Object.entries(currentState?.positions || {})) {
    const asset = findAsset(currentState, id);
    if (!asset) continue;
    sum += position.qty * asset.price;
  }
  return sum;
}

function unrealizedPL(currentState) {
  let sum = 0;
  for (const [id, position] of Object.entries(currentState?.positions || {})) {
    const asset = findAsset(currentState, id);
    if (!asset) continue;
    sum += (asset.price - position.avgCost) * position.qty;
  }
  return sum;
}

function ensureDailyStats(currentState) {
  if (!currentState) return null;
  currentState.dailyStats = normalizeDailyStats(currentState.dailyStats, currentState);
  return currentState.dailyStats;
}

function ensureDailyAssetEntry(currentState, assetId, daily = ensureDailyStats(currentState)) {
  if (!daily || !assetId) return null;
  if (!daily.priceBaselines) daily.priceBaselines = {};
  if (!daily.positionBaselines) daily.positionBaselines = {};
  if (!daily.assets) daily.assets = {};

  if (!daily.assets[assetId]) {
    const asset = findAsset(currentState, assetId);
    const position = currentState.positions?.[assetId];
    const safePrice = Number.isFinite(daily.priceBaselines?.[assetId]) ? daily.priceBaselines[assetId] : Number(asset?.price) || 0;
    const safeQty = Number.isFinite(daily.positionBaselines?.[assetId]?.qty) ? daily.positionBaselines[assetId].qty : Number(position?.qty) || 0;
    const safeAvgCost = Number.isFinite(daily.positionBaselines?.[assetId]?.avgCost) ? daily.positionBaselines[assetId].avgCost : Number(position?.avgCost) || 0;

    daily.priceBaselines[assetId] = safePrice;
    daily.positionBaselines[assetId] = { qty: safeQty, avgCost: safeAvgCost };
    daily.assets[assetId] = {
      id: assetId,
      startPrice: safePrice,
      startQty: safeQty,
      startValue: safeQty * safePrice,
      currentValue: safeQty * safePrice,
      startUnrealized: safeQty * (safePrice - safeAvgCost),
      currentUnrealized: safeQty * (safePrice - safeAvgCost),
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
  if (side === "sell") daily.trades.sell = Number.isFinite(daily.trades.sell) ? daily.trades.sell + 1 : 1;
  else daily.trades.buy = Number.isFinite(daily.trades.buy) ? daily.trades.buy + 1 : 1;

  const assetEntry = ensureDailyAssetEntry(currentState, id, daily);
  if (!assetEntry) return;
  assetEntry.trades += 1;
  assetEntry.tradedQty += units;
  if (side === "sell") {
    assetEntry.sellVolume += units;
    assetEntry.sellNotional += notional;
    if (Number.isFinite(realized)) assetEntry.realizedDelta += realized;
  } else {
    assetEntry.buyVolume += units;
    assetEntry.buyNotional += notional;
  }
  assetEntry.lastTradeSide = side === "sell" ? "sell" : "buy";
  if (Number.isFinite(price)) assetEntry.lastTradePrice = price;
  if (Number.isFinite(currentState.tick)) daily.lastTradeTick = currentState.tick;
  if (Number.isFinite(currentState.day)) daily.lastTradeDay = currentState.day;
}

function refreshDailyMetrics(currentState) {
  const daily = ensureDailyStats(currentState);
  if (!daily) return;

  const cash = Number(currentState.cash) || 0;
  const marketValue = portfolioValue(currentState);
  const netWorth = cash + marketValue;
  const realized = Number(currentState.realized) || 0;
  const unrealized = unrealizedPL(currentState);

  if (Number.isFinite(currentState.day)) daily.day = currentState.day;
  daily.currentNetWorth = netWorth;
  daily.netWorthDelta = netWorth - (Number.isFinite(daily.startNetWorth) ? daily.startNetWorth : netWorth);
  daily.realizedDelta = realized - (Number.isFinite(daily.startRealized) ? daily.startRealized : realized);
  daily.unrealizedDelta = unrealized - (Number.isFinite(daily.startUnrealized) ? daily.startUnrealized : unrealized);
  daily.endCash = cash;
  daily.endPortfolioValue = marketValue;
  daily.lastUpdatedTick = Number.isFinite(currentState.tick) ? currentState.tick : daily.lastUpdatedTick ?? 0;
  daily.lastUpdatedDay = Number.isFinite(currentState.day) ? currentState.day : daily.lastUpdatedDay ?? daily.day;

  const positions = currentState.positions && typeof currentState.positions === "object" ? currentState.positions : {};
  for (const asset of currentState.assets ?? []) {
    if (!asset || typeof asset.id !== "string") continue;
    const entry = ensureDailyAssetEntry(currentState, asset.id, daily);
    const startPrice = Number.isFinite(entry.startPrice)
      ? entry.startPrice
      : Number.isFinite(daily.priceBaselines?.[asset.id])
        ? daily.priceBaselines[asset.id]
        : 0;
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
  engine.systems = { marginApi, insiderApi, upgradesApi };
  window.ttmGame = engine;
}
