const toNumber = (value, fallback = 0) => (Number.isFinite(value) ? value : fallback);

function portfolioValueFromState(state = {}) {
  const assets = Array.isArray(state.assets) ? state.assets : [];
  const positions = state.positions && typeof state.positions === "object" ? state.positions : {};
  let sum = 0;
  for (const asset of assets) {
    if (!asset || typeof asset.id !== "string") continue;
    const position = positions[asset.id];
    if (!position || !Number.isFinite(position.qty) || position.qty <= 0) continue;
    const price = Number.isFinite(asset.price) ? asset.price : 0;
    sum += position.qty * price;
  }
  return sum;
}

function unrealizedFromState(state = {}) {
  const assets = Array.isArray(state.assets) ? state.assets : [];
  const positions = state.positions && typeof state.positions === "object" ? state.positions : {};
  let sum = 0;
  for (const asset of assets) {
    if (!asset || typeof asset.id !== "string") continue;
    const position = positions[asset.id];
    if (!position || !Number.isFinite(position.qty) || position.qty <= 0) continue;
    const price = Number.isFinite(asset.price) ? asset.price : 0;
    const avgCost = Number.isFinite(position.avgCost) ? position.avgCost : 0;
    sum += (price - avgCost) * position.qty;
  }
  return sum;
}

export function createDailySnapshot(state = {}) {
  const day = Number.isFinite(state.day) ? state.day : 1;
  const tick = Number.isFinite(state.tick) ? state.tick : 0;
  const cash = toNumber(state.cash, 0);
  const realized = toNumber(state.realized, 0);
  const portfolio = portfolioValueFromState(state);
  const netWorth = cash + portfolio;
  const unrealized = unrealizedFromState(state);
  const positions = state.positions && typeof state.positions === "object" ? state.positions : {};
  const assets = Array.isArray(state.assets) ? state.assets : [];

  const priceBaselines = {};
  const positionBaselines = {};
  const assetSnapshots = {};

  for (const asset of assets) {
    if (!asset || typeof asset.id !== "string") continue;
    const price = toNumber(asset.price, 0);
    priceBaselines[asset.id] = price;
    const position = positions[asset.id];
    const qty = position && Number.isFinite(position.qty) ? position.qty : 0;
    const avgCost = position && Number.isFinite(position.avgCost) ? position.avgCost : 0;
    positionBaselines[asset.id] = { qty, avgCost };
    const startValue = qty * price;
    const startUnrealized = qty * (price - avgCost);
    assetSnapshots[asset.id] = {
      id: asset.id,
      startPrice: price,
      startQty: qty,
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

  return {
    day,
    startTick: tick,
    startCash: cash,
    startPortfolioValue: portfolio,
    startNetWorth: netWorth,
    startRealized: realized,
    startUnrealized: unrealized,
    currentNetWorth: netWorth,
    netWorthDelta: 0,
    realizedDelta: 0,
    unrealizedDelta: 0,
    endCash: cash,
    endPortfolioValue: portfolio,
    lastUpdatedTick: tick,
    lastUpdatedDay: day,
    lastTradeTick: null,
    lastTradeDay: null,
    priceBaselines,
    positionBaselines,
    assets: assetSnapshots,
    trades: {
      total: 0,
      buy: 0,
      sell: 0,
      volume: 0,
      notional: 0
    },
    feedCheckpoint: Array.isArray(state.feed) ? state.feed.length : 0,
    notes: []
  };
}

export function normalizeDailyStats(rawStats, state = {}) {
  const base = createDailySnapshot(state);
  if (!rawStats || typeof rawStats !== "object") {
    return base;
  }

  const normalized = {
    ...base,
    day: Number.isFinite(rawStats.day) ? rawStats.day : base.day,
    startTick: Number.isFinite(rawStats.startTick) ? rawStats.startTick : base.startTick,
    startCash: Number.isFinite(rawStats.startCash) ? rawStats.startCash : base.startCash,
    startPortfolioValue: Number.isFinite(rawStats.startPortfolioValue)
      ? rawStats.startPortfolioValue
      : base.startPortfolioValue,
    startNetWorth: Number.isFinite(rawStats.startNetWorth) ? rawStats.startNetWorth : base.startNetWorth,
    startRealized: Number.isFinite(rawStats.startRealized) ? rawStats.startRealized : base.startRealized,
    startUnrealized: Number.isFinite(rawStats.startUnrealized) ? rawStats.startUnrealized : base.startUnrealized,
    currentNetWorth: Number.isFinite(rawStats.currentNetWorth) ? rawStats.currentNetWorth : base.currentNetWorth,
    netWorthDelta: Number.isFinite(rawStats.netWorthDelta) ? rawStats.netWorthDelta : base.netWorthDelta,
    realizedDelta: Number.isFinite(rawStats.realizedDelta) ? rawStats.realizedDelta : base.realizedDelta,
    unrealizedDelta: Number.isFinite(rawStats.unrealizedDelta) ? rawStats.unrealizedDelta : base.unrealizedDelta,
    endCash: Number.isFinite(rawStats.endCash) ? rawStats.endCash : base.endCash,
    endPortfolioValue: Number.isFinite(rawStats.endPortfolioValue)
      ? rawStats.endPortfolioValue
      : base.endPortfolioValue,
    lastUpdatedTick: Number.isFinite(rawStats.lastUpdatedTick) ? rawStats.lastUpdatedTick : base.lastUpdatedTick,
    lastUpdatedDay: Number.isFinite(rawStats.lastUpdatedDay) ? rawStats.lastUpdatedDay : base.lastUpdatedDay,
    lastTradeTick: Number.isFinite(rawStats.lastTradeTick) ? rawStats.lastTradeTick : base.lastTradeTick,
    lastTradeDay: Number.isFinite(rawStats.lastTradeDay) ? rawStats.lastTradeDay : base.lastTradeDay,
    trades: {
      total: Number.isFinite(rawStats.trades?.total) ? rawStats.trades.total : 0,
      buy: Number.isFinite(rawStats.trades?.buy) ? rawStats.trades.buy : 0,
      sell: Number.isFinite(rawStats.trades?.sell) ? rawStats.trades.sell : 0,
      volume: Number.isFinite(rawStats.trades?.volume) ? rawStats.trades.volume : 0,
      notional: Number.isFinite(rawStats.trades?.notional) ? rawStats.trades.notional : 0
    },
    feedCheckpoint: Number.isFinite(rawStats.feedCheckpoint)
      ? Math.max(0, rawStats.feedCheckpoint)
      : base.feedCheckpoint,
    notes: Array.isArray(rawStats.notes) ? rawStats.notes.slice(-20) : []
  };

  normalized.priceBaselines = { ...base.priceBaselines };
  if (rawStats.priceBaselines && typeof rawStats.priceBaselines === "object") {
    for (const [key, value] of Object.entries(rawStats.priceBaselines)) {
      if (Number.isFinite(value)) {
        normalized.priceBaselines[key] = value;
      }
    }
  }

  normalized.positionBaselines = {};
  for (const [key, value] of Object.entries(base.positionBaselines || {})) {
    normalized.positionBaselines[key] = {
      qty: Number.isFinite(value?.qty) ? value.qty : 0,
      avgCost: Number.isFinite(value?.avgCost) ? value.avgCost : 0
    };
  }
  if (rawStats.positionBaselines && typeof rawStats.positionBaselines === "object") {
    for (const [key, value] of Object.entries(rawStats.positionBaselines)) {
      if (!normalized.positionBaselines[key]) {
        normalized.positionBaselines[key] = { qty: 0, avgCost: 0 };
      }
      if (value && typeof value === "object") {
        if (Number.isFinite(value.qty)) normalized.positionBaselines[key].qty = value.qty;
        if (Number.isFinite(value.avgCost)) normalized.positionBaselines[key].avgCost = value.avgCost;
      }
    }
  }

  normalized.assets = {};
  for (const [id, entry] of Object.entries(base.assets || {})) {
    normalized.assets[id] = { ...entry };
  }
  if (rawStats.assets && typeof rawStats.assets === "object") {
    for (const [id, entry] of Object.entries(rawStats.assets)) {
      if (!entry || typeof entry !== "object") continue;
      if (!normalized.assets[id]) {
        normalized.assets[id] = {
          id,
          startPrice: normalized.priceBaselines[id] ?? 0,
          startQty: normalized.positionBaselines[id]?.qty ?? 0,
          startValue: 0,
          currentValue: 0,
          startUnrealized: 0,
          currentUnrealized: 0,
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
      const target = normalized.assets[id];
      if (Number.isFinite(entry.startPrice)) target.startPrice = entry.startPrice;
      if (Number.isFinite(entry.startQty)) target.startQty = entry.startQty;
      if (Number.isFinite(entry.startValue)) target.startValue = entry.startValue;
      if (Number.isFinite(entry.currentValue)) target.currentValue = entry.currentValue;
      if (Number.isFinite(entry.startUnrealized)) target.startUnrealized = entry.startUnrealized;
      if (Number.isFinite(entry.currentUnrealized)) target.currentUnrealized = entry.currentUnrealized;
      if (Number.isFinite(entry.unrealizedChange)) target.unrealizedChange = entry.unrealizedChange;
      if (Number.isFinite(entry.trades)) target.trades = entry.trades;
      if (Number.isFinite(entry.buyVolume)) target.buyVolume = entry.buyVolume;
      if (Number.isFinite(entry.sellVolume)) target.sellVolume = entry.sellVolume;
      if (Number.isFinite(entry.tradedQty)) target.tradedQty = entry.tradedQty;
      if (Number.isFinite(entry.buyNotional)) target.buyNotional = entry.buyNotional;
      if (Number.isFinite(entry.sellNotional)) target.sellNotional = entry.sellNotional;
      if (Number.isFinite(entry.realizedDelta)) target.realizedDelta = entry.realizedDelta;
      if (Number.isFinite(entry.netQtyChange)) target.netQtyChange = entry.netQtyChange;
      if (Number.isFinite(entry.endQty)) target.endQty = entry.endQty;
      if (Number.isFinite(entry.priceChange)) target.priceChange = entry.priceChange;
      if (Number.isFinite(entry.priceChangePct)) target.priceChangePct = entry.priceChangePct;
      if (Number.isFinite(entry.lastPrice)) target.lastPrice = entry.lastPrice;
      if (entry.lastTradeSide) target.lastTradeSide = entry.lastTradeSide;
      if (Number.isFinite(entry.lastTradePrice)) target.lastTradePrice = entry.lastTradePrice;
    }
  }

  return normalized;
}

export function summarizeDay({ snapshot, state, feed } = {}) {
  const currentState = state || {};
  const normalized = normalizeDailyStats(snapshot, currentState);
  const assets = Array.isArray(currentState.assets) ? currentState.assets : [];
  const positions = currentState.positions && typeof currentState.positions === "object" ? currentState.positions : {};

  const cash = toNumber(currentState.cash, 0);
  const realized = toNumber(currentState.realized, 0);
  const portfolio = portfolioValueFromState(currentState);
  const netWorth = cash + portfolio;
  const unrealized = unrealizedFromState(currentState);

  const assetSummaries = [];
  let bestAsset = null;
  let worstAsset = null;

  for (const asset of assets) {
    if (!asset || typeof asset.id !== "string") continue;
    const entry = normalized.assets[asset.id] || {};
    const baselinePrice = Number.isFinite(entry.startPrice)
      ? entry.startPrice
      : Number.isFinite(normalized.priceBaselines?.[asset.id])
        ? normalized.priceBaselines[asset.id]
        : toNumber(asset.price, 0);
    const endPrice = Number.isFinite(asset.price) ? asset.price : baselinePrice;
    const baselineQty = Number.isFinite(entry.startQty)
      ? entry.startQty
      : Number.isFinite(normalized.positionBaselines?.[asset.id]?.qty)
        ? normalized.positionBaselines[asset.id].qty
        : 0;
    const currentQty = Number.isFinite(positions?.[asset.id]?.qty) ? positions[asset.id].qty : 0;
    const avgCostStart = Number.isFinite(normalized.positionBaselines?.[asset.id]?.avgCost)
      ? normalized.positionBaselines[asset.id].avgCost
      : 0;
    const avgCostCurrent = Number.isFinite(positions?.[asset.id]?.avgCost)
      ? positions[asset.id].avgCost
      : avgCostStart;
    const priceChange = endPrice - baselinePrice;
    const pctChange = baselinePrice !== 0 ? (priceChange / baselinePrice) * 100 : 0;
    const startValue = Number.isFinite(entry.startValue) ? entry.startValue : baselineQty * baselinePrice;
    const endValue = Number.isFinite(entry.currentValue) ? entry.currentValue : currentQty * endPrice;
    const startUnrealized = Number.isFinite(entry.startUnrealized)
      ? entry.startUnrealized
      : baselineQty * (baselinePrice - avgCostStart);
    const endUnrealized = Number.isFinite(entry.currentUnrealized)
      ? entry.currentUnrealized
      : currentQty * (endPrice - avgCostCurrent);
    const assetSummary = {
      id: asset.id,
      name: asset.name,
      startPrice: baselinePrice,
      endPrice,
      priceChange,
      priceChangePct: pctChange,
      startQty: baselineQty,
      endQty: currentQty,
      netQtyChange: currentQty - baselineQty,
      trades: Number.isFinite(entry.trades) ? entry.trades : 0,
      buyVolume: Number.isFinite(entry.buyVolume) ? entry.buyVolume : 0,
      sellVolume: Number.isFinite(entry.sellVolume) ? entry.sellVolume : 0,
      tradedQty: Number.isFinite(entry.tradedQty)
        ? entry.tradedQty
        : (Number.isFinite(entry.buyVolume) ? entry.buyVolume : 0) + (Number.isFinite(entry.sellVolume) ? entry.sellVolume : 0),
      buyNotional: Number.isFinite(entry.buyNotional) ? entry.buyNotional : 0,
      sellNotional: Number.isFinite(entry.sellNotional) ? entry.sellNotional : 0,
      realizedDelta: Number.isFinite(entry.realizedDelta) ? entry.realizedDelta : 0,
      startValue,
      endValue,
      valueChange: endValue - startValue,
      startUnrealized,
      endUnrealized,
      unrealizedChange: Number.isFinite(entry.unrealizedChange)
        ? entry.unrealizedChange
        : endUnrealized - startUnrealized,
      lastTradeSide: entry.lastTradeSide ?? null,
      lastTradePrice: Number.isFinite(entry.lastTradePrice) ? entry.lastTradePrice : null
    };
    assetSummaries.push(assetSummary);
    if (!bestAsset || assetSummary.priceChangePct > bestAsset.priceChangePct) {
      bestAsset = assetSummary;
    }
    if (!worstAsset || assetSummary.priceChangePct < worstAsset.priceChangePct) {
      worstAsset = assetSummary;
    }
  }

  const feedSource = Array.isArray(feed) ? feed : Array.isArray(currentState.feed) ? currentState.feed : [];
  const checkpoint = Number.isFinite(normalized.feedCheckpoint) ? normalized.feedCheckpoint : 0;
  const notableEvents = [];
  if (Array.isArray(normalized.notes) && normalized.notes.length) {
    for (const note of normalized.notes.slice(-5)) {
      notableEvents.push({ text: note, kind: "note", time: null, targetId: null });
    }
  }
  for (const entry of feedSource.slice(checkpoint)) {
    if (!entry || typeof entry !== "object") continue;
    const kind = typeof entry.kind === "string" ? entry.kind : "neutral";
    if (kind === "neutral") continue;
    notableEvents.push({
      text: typeof entry.text === "string" ? entry.text : "",
      kind,
      time: entry.time ?? null,
      targetId: entry.targetId ?? null
    });
    if (notableEvents.length >= 10) break;
  }

  return {
    day: normalized.day,
    startNetWorth: normalized.startNetWorth,
    endNetWorth: netWorth,
    netChange: netWorth - normalized.startNetWorth,
    startCash: normalized.startCash,
    endCash: cash,
    startPortfolioValue: normalized.startPortfolioValue,
    endPortfolioValue: portfolio,
    realizedDelta: realized - normalized.startRealized,
    unrealizedDelta: unrealized - normalized.startUnrealized,
    trades: {
      total: Number.isFinite(normalized.trades.total) ? normalized.trades.total : 0,
      buy: Number.isFinite(normalized.trades.buy) ? normalized.trades.buy : 0,
      sell: Number.isFinite(normalized.trades.sell) ? normalized.trades.sell : 0,
      volume: Number.isFinite(normalized.trades.volume) ? normalized.trades.volume : 0,
      notional: Number.isFinite(normalized.trades.notional) ? normalized.trades.notional : 0
    },
    bestAsset: bestAsset ? { ...bestAsset } : null,
    worstAsset: worstAsset ? { ...worstAsset } : null,
    notableEvents,
    assets: assetSummaries,
    snapshot: normalized
  };
}

export const __testables__ = {
  portfolioValueFromState,
  unrealizedFromState
};
