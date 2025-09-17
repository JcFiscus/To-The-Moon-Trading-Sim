const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const gaussian = () => {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

const ORDER_FLOW_LOOKBACK = 240;
const TRADE_INTENSITY_NORMALIZER = 300;
const SENTIMENT_DECAY = 0.92;
const SENTIMENT_LIMIT = 3;
const MIN_VOLATILITY = 0.00005;

const REGIME_META = {
  panic: { label: "Panic selling", kind: "bad" },
  turbulent: { label: "Risk-off chop", kind: "bad" },
  frenzy: { label: "Risk-on frenzy", kind: "good" },
  expansion: { label: "Steady expansion", kind: "good" },
  sleepy: { label: "Sleepy drift", kind: "neutral" },
  balanced: { label: "Balanced chop", kind: "neutral" }
};

function classifyRegime({ volatilityBias, drift }) {
  if (volatilityBias > 2.2) return "panic";
  if (volatilityBias > 1.6) return drift >= 0 ? "frenzy" : "turbulent";
  if (volatilityBias < 0.75) return drift >= 0 ? "expansion" : "sleepy";
  return "balanced";
}

export function createMarketModel() {
  const sentiment = new Map();
  const lastNewsAt = new Map();
  const macro = {
    growth: 0,
    liquidity: 0,
    risk: 0,
    volatilityBias: 1,
    drift: 0,
    sentimentShift: 0,
    regime: "balanced",
    label: REGIME_META.balanced.label,
    kind: REGIME_META.balanced.kind,
    lastSequence: -Infinity
  };

  function shouldEmit(key, sequence, interval = 6) {
    const last = lastNewsAt.get(key) ?? -Infinity;
    if (sequence - last >= interval) {
      lastNewsAt.set(key, sequence);
      return true;
    }
    return false;
  }

  function updateMacro(state, sequence) {
    if (!Number.isFinite(sequence)) sequence = state.tick ?? 0;
    if (sequence <= macro.lastSequence + 1e-6) {
      return { ...macro, news: [], regimeChanged: false };
    }

    const stepSpan = clamp(sequence - macro.lastSequence, 1, 8);
    const growthNoise = gaussian() * 0.05 * Math.sqrt(stepSpan);
    const liquidityNoise = gaussian() * 0.04 * Math.sqrt(stepSpan);
    const riskNoise = gaussian() * 0.06 * Math.sqrt(stepSpan);

    macro.growth = clamp(macro.growth * Math.pow(0.96, stepSpan) + growthNoise, -2.5, 2.5);
    const baseLiquidity = clamp(macro.liquidity * Math.pow(0.95, stepSpan) + liquidityNoise, -2.3, 2.3);
    const baseRisk = clamp(macro.risk * Math.pow(0.94, stepSpan) + riskNoise, -2.8, 2.8);

    macro.liquidity = baseLiquidity;
    macro.risk = baseRisk;

    let volEvent = 1;
    let driftEvent = 0;
    let sentimentEvent = 0;
    let liquidityShift = 0;
    let riskShift = 0;
    for (const event of state.events || []) {
      if (event?.targetId != null) continue;
      if (event.effect?.volMult) volEvent *= event.effect.volMult;
      if (event.effect?.driftShift) driftEvent += event.effect.driftShift;
      if (Number.isFinite(event.effect?.liquidityShift)) liquidityShift += event.effect.liquidityShift;
      if (Number.isFinite(event.effect?.riskShift)) riskShift += event.effect.riskShift;
      if (event.kind === "good") sentimentEvent += 0.18;
      else if (event.kind === "bad") sentimentEvent -= 0.18;
    }

    const effectiveLiquidity = clamp(baseLiquidity + liquidityShift, -3.2, 3.2);
    const effectiveRisk = clamp(baseRisk + riskShift, -3.2, 3.2);

    macro.effectiveLiquidity = effectiveLiquidity;
    macro.effectiveRisk = effectiveRisk;

    macro.volatilityBias = clamp(1 + effectiveRisk * 0.35, 0.55, 3.2) * volEvent;
    macro.drift = driftEvent + macro.growth * 0.0007 + effectiveLiquidity * 0.0004;
    macro.sentimentShift = sentimentEvent * 0.4;

    const previousRegime = macro.regime;
    macro.regime = classifyRegime(macro);
    const regimeMeta = REGIME_META[macro.regime] ?? REGIME_META.balanced;
    macro.label = regimeMeta.label;
    macro.kind = regimeMeta.kind;

    macro.lastSequence = sequence;

    const regimeChanged = previousRegime !== macro.regime;
    const news = [];
    if (regimeChanged) {
      news.push({
        text: `Macro regime shifts to ${macro.label}. Volatility ${
          macro.volatilityBias >= 1 ? "elevated" : "cooling"
        } (${macro.volatilityBias.toFixed(2)}x baseline).`,
        kind: macro.kind,
        targetId: null,
        effect: { regime: macro.regime, volMult: macro.volatilityBias }
      });
    }

    return { ...macro, news, regimeChanged };
  }

  function computeOrderFlow(state, assetId, sequence) {
    const trades = Array.isArray(state.recentTrades) ? state.recentTrades : [];
    if (!trades.length) {
      return {
        netQty: 0,
        totalQty: 0,
        pressure: 0,
        intensity: 0,
        netNotional: 0,
        trades: 0
      };
    }

    const minTick = (Number(sequence) || 0) - ORDER_FLOW_LOOKBACK;
    let netQty = 0;
    let totalQty = 0;
    let netNotional = 0;
    let tradeCount = 0;

    for (let index = trades.length - 1; index >= 0; index -= 1) {
      const trade = trades[index];
      if (!trade || trade.assetId !== assetId) continue;
      if (trade.tick != null && trade.tick < minTick) break;

      const direction = trade.side === "sell" ? -1 : 1;
      const qty = Number.isFinite(trade.qty) ? trade.qty : 0;
      const notional = Number.isFinite(trade.notional)
        ? trade.notional
        : (Number.isFinite(trade.price) ? trade.price : 0) * qty;

      netQty += direction * qty;
      totalQty += qty;
      netNotional += direction * notional;
      tradeCount += 1;
    }

    const pressure = totalQty > 0 ? clamp(netQty / (totalQty || 1), -1, 1) : 0;
    const intensity = totalQty > 0 ? clamp(Math.log10(totalQty + 1) / Math.log10(TRADE_INTENSITY_NORMALIZER), 0, 1) : 0;

    return {
      netQty,
      totalQty,
      netNotional,
      pressure,
      intensity,
      trades: tradeCount
    };
  }

  function computeMomentum(asset) {
    if (!asset || !Array.isArray(asset.history) || asset.history.length < 6) return 0;
    const recent = asset.history[asset.history.length - 1];
    const lookback = asset.history[asset.history.length - 6];
    if (!Number.isFinite(recent) || !Number.isFinite(lookback) || lookback === 0) return 0;
    return (recent - lookback) / lookback;
  }

  function computeEventImpact(state, assetId) {
    let drift = 0;
    let volMult = 1;
    let sentimentShift = 0;
    const influences = [];

    for (const event of state.events || []) {
      if (!event || (event.targetId != null && event.targetId !== assetId)) continue;
      if (event.targetId == null) continue;

      const effect = event.effect || {};
      const localDrift = Number.isFinite(effect.driftShift) ? effect.driftShift : 0;
      const localVol = Number.isFinite(effect.volMult) ? effect.volMult : 1;

      drift += localDrift;
      volMult *= localVol;
      if (event.kind === "good") sentimentShift += 0.2;
      else if (event.kind === "bad") sentimentShift -= 0.2;

      influences.push({
        id: `event-${event.id}`,
        label: event.label || "Event",
        type: "event",
        typeLabel: "Event",
        magnitude: localDrift,
        volMult: localVol,
        direction: localDrift === 0 ? 0 : localDrift > 0 ? 1 : -1,
        description: `${event.kind === "good" ? "Bullish" : event.kind === "bad" ? "Bearish" : "Neutral"} catalyst in play.`,
        eventKind: event.kind
      });
    }

    return { drift, volMult, sentimentShift, influences };
  }

  function updateSentimentScore(assetId, delta, sequence) {
    const entry = sentiment.get(assetId) || { score: 0, lastSequence: sequence };
    const elapsed = Number.isFinite(entry.lastSequence) ? Math.max(0, sequence - entry.lastSequence) : 1;
    const decayFactor = Math.pow(SENTIMENT_DECAY, clamp(elapsed, 0, 12));
    entry.score = clamp(entry.score * decayFactor + delta, -SENTIMENT_LIMIT, SENTIMENT_LIMIT);
    entry.lastSequence = sequence;
    sentiment.set(assetId, entry);
    return entry.score;
  }

  function buildInfluences({
    asset,
    orderFlow,
    macroState,
    eventImpact,
    sentimentScore,
    sentimentDrift,
    macroDrift,
    playerDrift,
    baseDrift,
    vol,
    volBase,
    varianceBoost,
    shock
  }) {
    const influences = [];

    if (orderFlow.totalQty > 0) {
      const label = orderFlow.netQty >= 0 ? "Player demand" : "Player supply";
      influences.push({
        id: "player-orderflow",
        label,
        type: "player",
        typeLabel: "Player",
        magnitude: playerDrift,
        direction: playerDrift === 0 ? 0 : playerDrift > 0 ? 1 : -1,
        volMult: 1 + Math.abs(orderFlow.pressure) * 0.25,
        description:
          `Net ${orderFlow.netQty >= 0 ? "buying" : "selling"} ${Math.abs(orderFlow.netQty)} units across ${orderFlow.trades} trade${
            orderFlow.trades === 1 ? "" : "s"
          }.`
      });
    }

    if (Math.abs(sentimentScore) > 0.05 || Math.abs(sentimentDrift) > 0.00005) {
      influences.push({
        id: "sentiment",
        label: sentimentScore >= 0 ? "Bullish sentiment" : "Bearish sentiment",
        type: "sentiment",
        typeLabel: "Sentiment",
        magnitude: sentimentDrift,
        direction: sentimentDrift === 0 ? 0 : sentimentDrift > 0 ? 1 : -1,
        volMult: 1 + Math.min(0.5, Math.abs(sentimentScore) * 0.12),
        description: `Crowd mood score ${sentimentScore.toFixed(2)} influencing drift.`
      });
    }

    if (Math.abs(macroDrift) > 0.00005 || macroState.volatilityBias !== 1) {
      const liqDisplay = Number.isFinite(macroState.effectiveLiquidity)
        ? macroState.effectiveLiquidity
        : macroState.liquidity;
      const riskDisplay = Number.isFinite(macroState.effectiveRisk) ? macroState.effectiveRisk : macroState.risk;
      influences.push({
        id: "macro",
        label: macroState.label,
        type: "macro",
        typeLabel: "Macro",
        magnitude: macroDrift,
        direction: macroDrift === 0 ? 0 : macroDrift > 0 ? 1 : -1,
        volMult: macroState.volatilityBias,
        description: `Growth ${macroState.growth.toFixed(2)}, liquidity ${liqDisplay.toFixed(2)}, risk ${riskDisplay.toFixed(2)}.`
      });
    }

    for (const item of eventImpact.influences) {
      influences.push(item);
    }

    const volRatio = volBase > 0 ? vol / volBase : 1;
    if (Math.abs(volRatio - 1) > 0.05) {
      influences.push({
        id: "volatility",
        label: volRatio > 1 ? "Amplified volatility" : "Dampened volatility",
        type: "volatility",
        typeLabel: "Volatility",
        magnitude: 0,
        direction: volRatio > 1 ? 1 : -1,
        volMult: volRatio,
        description: `Variance at ${(volRatio * varianceBoost).toFixed(2)}x of base.`
      });
    }

    if (Math.abs(baseDrift) > 0.00005) {
      influences.push({
        id: "base",
        label: "Baseline drift",
        type: "baseline",
        typeLabel: "Baseline",
        magnitude: baseDrift,
        direction: baseDrift > 0 ? 1 : baseDrift < 0 ? -1 : 0,
        description: "Slow organic drift built into the simulation."
      });
    }

    if (Math.abs(shock) > 0.0001) {
      influences.push({
        id: "noise",
        label: "Market noise",
        type: "noise",
        typeLabel: "Noise",
        magnitude: shock,
        direction: shock === 0 ? 0 : shock > 0 ? 1 : -1,
        description: "Unexplained randomness from trader chatter."
      });
    }

    return influences;
  }

  function evaluate({ asset, state, tickContext = {} }) {
    if (!asset) {
      return {
        nextPrice: 0,
        pctChange: 0,
        influences: [],
        diagnostics: {},
        news: [],
        flags: {}
      };
    }

    const {
      varianceBoost = 1,
      sequence = (state.tick ?? 0) + 1,
      assetIndex = 0,
      isOvernight = false
    } = tickContext;

    const macroState = updateMacro(state, sequence);
    const orderFlow = computeOrderFlow(state, asset.id, sequence);
    const eventImpact = computeEventImpact(state, asset.id);
    const momentum = computeMomentum(asset);

    const sentimentDelta =
      eventImpact.sentimentShift +
      orderFlow.pressure * 0.6 +
      macroState.sentimentShift +
      clamp(momentum * 3, -0.6, 0.6);

    const sentimentScore = updateSentimentScore(asset.id, sentimentDelta, sequence);
    const sentimentDrift = sentimentScore * 0.0008;
    const sentimentVolMult = 1 + Math.min(0.5, Math.abs(sentimentScore) * 0.12);

    const baseDrift = 0.0002 * (isOvernight ? 0.6 : 1);
    const playerDrift = orderFlow.intensity * orderFlow.pressure * 0.0025;
    const macroDrift = macroState.drift;
    const eventDrift = eventImpact.drift;

    const totalDrift = baseDrift + playerDrift + macroDrift + eventDrift + sentimentDrift;

    const volBase = Math.max(MIN_VOLATILITY, asset.volatility * varianceBoost);
    const orderFlowVol = 1 + Math.abs(orderFlow.pressure) * 0.25;
    const vol = Math.max(
      MIN_VOLATILITY,
      volBase * macroState.volatilityBias * eventImpact.volMult * orderFlowVol * sentimentVolMult
    );

    const shock = gaussian() * vol;
    const pctChange = totalDrift + shock;
    const nextPrice = Math.max(0.0001, asset.price * (1 + pctChange));

    const influences = buildInfluences({
      asset,
      orderFlow,
      macroState,
      eventImpact,
      sentimentScore,
      sentimentDrift,
      macroDrift,
      playerDrift,
      baseDrift,
      vol,
      volBase,
      varianceBoost,
      shock
    });

    const diagnostics = {
      drift: totalDrift,
      shock,
      volatility: vol,
      contributions: {
        base: baseDrift,
        player: playerDrift,
        macro: macroDrift,
        events: eventDrift,
        sentiment: sentimentDrift
      },
      orderFlow,
      macro: macroState,
      sentimentScore,
      momentum,
      eventImpact
    };

    const externalContribution = macroDrift + eventDrift + sentimentDrift;
    const flags = {
      externalOverride:
        Math.abs(externalContribution) > Math.abs(playerDrift) * 1.2 &&
        Math.sign(externalContribution || 0) !== Math.sign(playerDrift || 0) &&
        Math.abs(externalContribution) > 0.00005,
      playerDominant: Math.abs(playerDrift) > Math.abs(externalContribution) * 1.4 && Math.abs(playerDrift) > 0.0001,
      macroShock: macroState.regimeChanged || macroState.volatilityBias > 1.6,
      highVolRegime: vol / volBase > 1.4
    };

    const news = [];

    if (flags.externalOverride && shouldEmit(`override-${asset.id}`, sequence, 6)) {
      const directionText = externalContribution > 0 ? "bullish catalysts overpowered your selling" : "bearish shocks overwhelmed your buying";
      news.push({
        text: `${asset.id}: ${directionText}.`,
        kind: externalContribution > 0 ? "good" : "bad",
        targetId: asset.id,
        effect: { external: externalContribution, player: playerDrift }
      });
    }

    if (flags.playerDominant && shouldEmit(`player-${asset.id}`, sequence, 8)) {
      news.push({
        text: `${asset.id}: Your ${playerDrift > 0 ? "buying" : "selling"} is steering the tape.`,
        kind: playerDrift > 0 ? "good" : "bad",
        targetId: asset.id,
        effect: { player: playerDrift }
      });
    }

    if (assetIndex === 0) {
      for (const item of macroState.news || []) {
        if (!item) continue;
        if (item.effect?.regime && !shouldEmit(`macro-${item.effect.regime}`, sequence, 24)) continue;
        news.push(item);
      }
    }

    return {
      nextPrice,
      pctChange,
      drift: totalDrift,
      shock,
      volatility: vol,
      influences,
      diagnostics,
      news,
      flags
    };
  }

  return { evaluate };
}
