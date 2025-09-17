const RUN_HISTORY_KEY = "ttm_v0_runs";

export const RUN_REASON_LABELS = Object.freeze({
  bankrupt: "Bankrupt",
  "forced-liquidation": "Forced Liquidation",
  retired: "Voluntary Exit",
  completed: "Run Complete"
});

const toNumber = (value, fallback = 0) => (Number.isFinite(value) ? value : fallback);

export function computePortfolioValue(state) {
  if (!state || !Array.isArray(state.assets)) return 0;
  let sum = 0;
  for (const asset of state.assets) {
    if (!asset || typeof asset.id !== "string") continue;
    const position = state.positions?.[asset.id];
    if (!position || !Number.isFinite(position.qty) || position.qty <= 0) continue;
    const price = Number.isFinite(asset.price) ? asset.price : asset.prev ?? 0;
    sum += position.qty * price;
  }
  return sum;
}

export function computeNetWorth(state, portfolioValue) {
  const pv = Number.isFinite(portfolioValue) ? portfolioValue : computePortfolioValue(state);
  const cash = toNumber(state?.cash, 0);
  const debt = toNumber(state?.margin?.debt, 0);
  return cash + pv - debt;
}

export function ensureRunTracker(state) {
  if (!state) return { stats: {} };
  if (!state.run || typeof state.run !== "object") {
    state.run = {
      id: `${Date.now()}`,
      status: "active",
      startedAt: Date.now(),
      stats: {}
    };
  }
  const run = state.run;
  if (typeof run.id !== "string" || !run.id) run.id = `${Date.now()}`;
  if (!Number.isFinite(run.startedAt)) run.startedAt = Date.now();
  if (typeof run.status !== "string") run.status = "active";
  if (!run.stats || typeof run.stats !== "object") run.stats = {};
  const stats = run.stats;
  if (!Number.isFinite(stats.maxNetWorth)) stats.maxNetWorth = computeNetWorth(state);
  if (!Number.isFinite(stats.minNetWorth)) stats.minNetWorth = stats.maxNetWorth;
  if (!Number.isFinite(stats.lastNetWorth)) stats.lastNetWorth = stats.maxNetWorth;
  if (!Number.isFinite(stats.days)) stats.days = Number.isFinite(state?.day) ? state.day : 1;
  if (!Number.isFinite(stats.trades)) stats.trades = 0;
  if (!Number.isFinite(stats.buyNotional)) stats.buyNotional = 0;
  if (!Number.isFinite(stats.sellNotional)) stats.sellNotional = 0;
  if (!Number.isFinite(stats.maintenanceStrikes)) stats.maintenanceStrikes = 0;
  return run;
}

export function recordTradeStats(state, { side, qty, price, notional }) {
  const run = ensureRunTracker(state);
  const stats = run.stats;
  stats.trades += 1;
  const amount = Number.isFinite(notional)
    ? notional
    : Number.isFinite(price) && Number.isFinite(qty)
      ? price * qty
      : 0;
  if (side === "sell") {
    stats.sellNotional += Math.max(0, amount);
  } else {
    stats.buyNotional += Math.max(0, amount);
  }
}

export function updateRunStats(state, { dayTick = false } = {}) {
  const run = ensureRunTracker(state);
  const stats = run.stats;
  if (run.status === "pending") run.status = "active";
  const pv = computePortfolioValue(state);
  const debt = toNumber(state?.margin?.debt, 0);
  const netWorth = computeNetWorth(state, pv);
  stats.lastPortfolioValue = pv;
  stats.lastDebt = debt;
  stats.lastNetWorth = netWorth;
  stats.maxNetWorth = Math.max(stats.maxNetWorth, netWorth);
  stats.minNetWorth = Math.min(stats.minNetWorth, netWorth);
  stats.ticks = (stats.ticks || 0) + 1;
  if (dayTick) stats.days = Math.max(stats.days, Number.isFinite(state?.day) ? state.day : stats.days);
  return { portfolioValue: pv, debt, netWorth };
}

export function noteMaintenanceStrike(state, underMaintenance) {
  const run = ensureRunTracker(state);
  const stats = run.stats;
  if (underMaintenance) {
    stats.maintenanceStrikes = (stats.maintenanceStrikes || 0) + 1;
  } else {
    stats.maintenanceStrikes = 0;
  }
  return stats.maintenanceStrikes;
}

export function evaluateEndCondition(state, { netWorth, maintenanceLimit = 6 } = {}) {
  const run = ensureRunTracker(state);
  const stats = run.stats;
  const worth = Number.isFinite(netWorth) ? netWorth : computeNetWorth(state);
  const pv = Number.isFinite(stats.lastPortfolioValue) ? stats.lastPortfolioValue : computePortfolioValue(state);
  const cash = toNumber(state?.cash, 0);
  if (worth <= 0 || (cash <= 0 && pv <= 0)) {
    return { id: "bankrupt", label: RUN_REASON_LABELS.bankrupt };
  }
  if (stats.maintenanceStrikes >= maintenanceLimit) {
    return { id: "forced-liquidation", label: RUN_REASON_LABELS["forced-liquidation"] };
  }
  return null;
}

export function createRunSummary(state, { reason, metaReward = 0 } = {}) {
  const run = ensureRunTracker(state);
  const stats = run.stats;
  const pv = Number.isFinite(stats.lastPortfolioValue) ? stats.lastPortfolioValue : computePortfolioValue(state);
  const netWorth = Number.isFinite(stats.lastNetWorth) ? stats.lastNetWorth : computeNetWorth(state, pv);
  const debt = Number.isFinite(stats.lastDebt) ? stats.lastDebt : toNumber(state?.margin?.debt, 0);
  const realized = toNumber(state?.realized, 0);
  const reasonId = typeof reason === "object" ? reason?.id : reason;
  const label = typeof reason === "object"
    ? reason.label ?? RUN_REASON_LABELS[reason.id] ?? RUN_REASON_LABELS.completed
    : RUN_REASON_LABELS[reasonId] ?? RUN_REASON_LABELS.completed;

  const summary = {
    id: run.id,
    reason: reasonId ?? "completed",
    label,
    startedAt: run.startedAt,
    endedAt: Date.now(),
    days: Number.isFinite(state?.day) ? state.day : stats.days ?? 0,
    ticks: Number.isFinite(state?.tick) ? state.tick : stats.ticks ?? 0,
    netWorth,
    cash: toNumber(state?.cash, 0),
    portfolioValue: pv,
    debt,
    realized,
    trades: stats.trades || 0,
    buyNotional: stats.buyNotional || 0,
    sellNotional: stats.sellNotional || 0,
    maxNetWorth: stats.maxNetWorth ?? netWorth,
    minNetWorth: stats.minNetWorth ?? netWorth,
    maintenanceStrikes: stats.maintenanceStrikes || 0,
    metaReward
  };

  run.status = "ended";
  run.endedAt = summary.endedAt;
  run.reason = summary.reason;
  run.metaReward = metaReward;

  return summary;
}

export function loadRunHistory({ storageKey = RUN_HISTORY_KEY } = {}) {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("ttm:runHistory:load", error);
    return [];
  }
}

export function saveRunSummary(summary, { storageKey = RUN_HISTORY_KEY, limit = 12 } = {}) {
  if (!summary) return loadRunHistory({ storageKey });
  const history = loadRunHistory({ storageKey });
  history.unshift(summary);
  if (history.length > limit) history.length = limit;
  try {
    localStorage.setItem(storageKey, JSON.stringify(history));
  } catch (error) {
    console.warn("ttm:runHistory:save", error);
  }
  return history;
}

export function clearRunHistory({ storageKey = RUN_HISTORY_KEY } = {}) {
  try {
    localStorage.removeItem(storageKey);
  } catch (error) {
    console.warn("ttm:runHistory:clear", error);
  }
}

export { RUN_HISTORY_KEY };
