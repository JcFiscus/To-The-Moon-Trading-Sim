import { createGameEngine, createInitialState } from "./core/gameEngine.js";
import { createMarketModel } from "./core/marketModel.js";

const DOM = {};
let engine = null;
let state = null;
let chartCtx = null;
let lastMsgTimeout = null;
let upgradesConfigured = false;
const marketModel = createMarketModel();

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

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}

function init() {
  cacheDom();
  chartCtx = DOM.chart && DOM.chart.getContext ? DOM.chart.getContext("2d") : null;

  engine = createGameEngine();
  state = engine.getState();

  ensureSelection(state);

  engine.onStateChange((nextState) => {
    state = nextState;
    updateControls(nextState);
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

  setupListeners();
  configureUpgradesIntegration();

  exposeEngine();
  window.dispatchEvent(new CustomEvent("ttm:gameReady", { detail: engine }));
}

function cacheDom() {
  const $ = (sel) => document.querySelector(sel);

  DOM.day = $("#hud-day");
  DOM.cash = $("#hud-cash");
  DOM.equity = $("#hud-equity");
  DOM.pl = $("#hud-pl");

  DOM.startBtn = $("#btn-start");
  DOM.endBtn = $("#btn-end");
  DOM.resetBtn = $("#btn-reset");

  DOM.qtyGlobal = $("#qty-global");
  DOM.marketBody = $("#market-body");

  DOM.detailAsset = $("#detail-asset");
  DOM.detailPrice = $("#detail-price");
  DOM.detailPosition = $("#detail-position");
  DOM.detailTitle = $("#detail-title");
  DOM.tradeQty = $("#trade-qty");
  DOM.buyBtn = $("#btn-buy");
  DOM.sellBtn = $("#btn-sell");
  DOM.message = $("#messages");

  DOM.effectsList = $("#effects-list");
  DOM.driversList = $("#drivers-list");
  DOM.feed = $("#feed");

  DOM.chart = $("#chart");
}

function setupListeners() {
  if (DOM.startBtn) {
    DOM.startBtn.addEventListener("click", () => {
      if (engine.isRunning()) {
        engine.pause();
      } else {
        engine.start();
      }
    });
  }

  if (DOM.endBtn) {
    DOM.endBtn.addEventListener("click", () => {
      engine.endDay({ overnightSteps: 6, varianceBoost: 1.8 });
      bumpNews("Market closed. Overnight risk intensifies. Try not to panic.");
    });
  }

  if (DOM.resetBtn) {
    DOM.resetBtn.addEventListener("click", () => {
      if (!confirm("Reset game and clear local save?")) return;
      engine.clearSave();
      engine.reset(createInitialState());
      state = engine.getState();
      ensureSelection(state);
      bumpNews("Fresh start. Your future mistakes haven’t happened yet.");
      pushFeed({ text: "New game." });
    });
  }

  if (DOM.marketBody) {
    DOM.marketBody.addEventListener("click", (event) => {
      const row = event.target.closest("tr[data-id]");
      if (!row) return;
      const id = row.getAttribute("data-id");
      const buyBtn = event.target.closest("[data-buy]");
      const sellBtn = event.target.closest("[data-sell]");
      if (buyBtn) {
        doBuy(id, parseQty(DOM.qtyGlobal?.value));
        return;
      }
      if (sellBtn) {
        doSell(id, parseQty(DOM.qtyGlobal?.value));
        return;
      }
      setSelected(id);
    });
  }

  if (DOM.buyBtn) {
    DOM.buyBtn.addEventListener("click", () => {
      doBuy(state.selected, parseQty(DOM.tradeQty?.value));
    });
  }

  if (DOM.sellBtn) {
    DOM.sellBtn.addEventListener("click", () => {
      doSell(state.selected, parseQty(DOM.tradeQty?.value));
    });
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) engine.pause();
  });

  window.addEventListener("load", configureUpgradesIntegration, { once: true });
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

function ensureSelection(currentState) {
  if (!currentState.selected && Array.isArray(currentState.assets) && currentState.assets.length) {
    currentState.selected = currentState.assets[0].id;
  }
}

function recordTrade(currentState, { id, side, qty, price }) {
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
  if (Math.random() < 0.04 && currentState.assets.length) {
    const asset = randomAsset(currentState);
    const up = Math.random() < 0.5;
    createEvent(currentState, {
      label: `${up ? "Rumor surge" : "Short report"} on ${asset.id}`,
      kind: up ? "good" : "bad",
      targetId: asset.id,
      durationTicks: 24,
      effect: { volMult: 1.6, driftShift: up ? 0.003 : -0.003 }
    });
  }

  cleanupExpiredEvents(currentState);
  stepAll(currentState, 1, 1.0);
}

function handleDayEnd(currentState, context = {}) {
  const steps = Number.isFinite(context.overnightSteps) ? context.overnightSteps : 6;
  const variance = Number.isFinite(context.varianceBoost) ? context.varianceBoost : 1.8;
  stepAll(currentState, steps, variance);
  currentState.day += 1;
  startNewDay(currentState);

  const accrueInterest = window.Upgrades?.accrueDailyInterest;
  if (typeof accrueInterest === "function") {
    accrueInterest({
      getCash: () => currentState.cash,
      setCash: (value) => {
        currentState.cash = value;
      }
    });
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
        bumpNews("Buy blocked: maintenance margin breached.", { state: draft });
        return;
      }
      const ok = marginApi.buyWithMargin(draft, cost, pv);
      if (!ok) {
        bumpNews(`Insufficient buying power for ${qty} ${id}.`, { state: draft });
        return;
      }
    } else {
      if (cost > draft.cash + 1e-9) {
        bumpNews(`Not enough cash to buy ${qty} ${id}.`, { state: draft });
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

    bumpNews(`Bought ${qty} ${id} @ ${formatPrice(asset.price)}.`, { state: draft });
  });
}

function doSell(id, qty) {
  if (!id || qty <= 0) return;
  engine.update((draft) => {
    const position = draft.positions[id];
    if (!position || position.qty <= 0) {
      bumpNews("You don't own that asset. Imagination doesn’t count as collateral.", { state: draft });
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

    recordTrade(draft, { id, side: "sell", qty: actualQty, price: asset.price });
    draft.selected = id;

    const prefix = profit >= 0 ? "+" : "";
    bumpNews(
      `Sold ${actualQty} ${id} @ ${formatPrice(asset.price)} (${prefix}${fmtMoney(profit)}).`,
      { state: draft }
    );
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

function randomAsset(currentState) {
  if (!currentState.assets || currentState.assets.length === 0) return null;
  return currentState.assets[(Math.random() * currentState.assets.length) | 0];
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
  pushFeed({ text: `Day ${currentState.day} begins.` }, { state: currentState });

  if (Math.random() >= 0.6) return;

  const roll = Math.random();
  if (roll < 0.25) {
    createEvent(currentState, {
      label: "Calm markets",
      kind: "good",
      durationDays: 1,
      effect: { volMult: 0.8 }
    });
  } else if (roll < 0.5) {
    createEvent(currentState, {
      label: "Volatility spike",
      kind: "bad",
      durationDays: 1,
      effect: { volMult: 1.4 }
    });
  } else if (roll < 0.75) {
    const asset = randomAsset(currentState);
    if (!asset) return;
    createEvent(currentState, {
      label: `Analyst upgrade on ${asset.id}`,
      kind: "good",
      targetId: asset.id,
      durationDays: 1,
      effect: { driftShift: 0.002 }
    });
  } else {
    const asset = randomAsset(currentState);
    if (!asset) return;
    createEvent(currentState, {
      label: `Regulator scrutiny on ${asset.id}`,
      kind: "bad",
      targetId: asset.id,
      durationDays: 1,
      effect: { driftShift: -0.002 }
    });
  }
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

function showMessage(text) {
  if (!DOM.message) return;
  clearTimeout(lastMsgTimeout);
  DOM.message.textContent = text;
  lastMsgTimeout = setTimeout(() => {
    DOM.message.textContent = "";
  }, 4000);
}

function bumpNews(text, { state: inlineState } = {}) {
  showMessage(text);
  const entry = { text };
  if (inlineState) {
    logFeedEntry(inlineState, entry);
  } else {
    pushFeed(entry);
  }
}

function safeRender(renderFn) {
  try {
    renderFn();
  } catch (error) {
    console.error(error);
    showMessage("Render error. Recovered.");
  }
}

function renderAll(currentState) {
  renderHUD(currentState);
  renderTable(currentState);
  renderDetail(currentState);
  renderFeed(currentState);
}

function renderHUD(currentState) {
  if (!DOM.day || !DOM.cash || !DOM.equity || !DOM.pl) return;
  const holdingsValue = portfolioValue(currentState);
  const equity = currentState.cash + holdingsValue;
  const unrealized = unrealizedPL(currentState);
  DOM.day.textContent = String(currentState.day);
  DOM.cash.textContent = fmtMoney(currentState.cash);
  DOM.equity.textContent = fmtMoney(equity);

  const totalPL = currentState.realized + unrealized;
  DOM.pl.textContent = `${fmtMoney(totalPL)} (${totalPL >= 0 ? "+" : ""}${fmtMoney(unrealized).replace("$", "")} unrl)`;
  DOM.pl.classList.remove("pl--good", "pl--bad", "pl--neutral");
  DOM.pl.classList.add(totalPL > 0 ? "pl--good" : totalPL < 0 ? "pl--bad" : "pl--neutral");

  updateControls(currentState);
}

function renderTable(currentState) {
  if (!DOM.marketBody) return;
  const rows = currentState.assets
    .map((asset) => {
      const pos = currentState.positions[asset.id]?.qty ?? 0;
      const avg = currentState.positions[asset.id]?.avgCost ?? 0;
      const unrl = pos > 0 ? (asset.price - avg) * pos : 0;
      const badge =
        asset.changePct > 0.001
          ? `<span class="badge badge--good">+${asset.changePct.toFixed(2)}%</span>`
          : asset.changePct < -0.001
          ? `<span class="badge badge--bad">${asset.changePct.toFixed(2)}%</span>`
          : `<span class="badge badge--neutral">${asset.changePct.toFixed(2)}%</span>`;
      const isSelected = asset.id === currentState.selected;
      return `
        <tr data-id="${asset.id}" ${
          isSelected ? 'style="outline:1px solid #223456; background:rgba(139,92,246,.06)"' : ""
        }>
          <td><strong>${asset.id}</strong></td>
          <td>${asset.name}</td>
          <td class="num">${formatPrice(asset.price)}</td>
          <td class="num">${badge}</td>
          <td class="num">${pos}</td>
          <td class="num">${
            unrl === 0
              ? "—"
              : unrl >= 0
              ? `<span class="pl--good">${fmtMoney(unrl)}</span>`
              : `<span class="pl--bad">${fmtMoney(unrl)}</span>`
          }</td>
          <td class="num">
            <button class="btn btn-primary" data-buy>Buy</button>
            <button class="btn" data-sell>Sell</button>
          </td>
        </tr>
      `;
    })
    .join("");
  DOM.marketBody.innerHTML = rows;
}

function renderDetail(currentState) {
  const asset = findAsset(currentState, currentState.selected);
  if (!asset) return;
  if (DOM.detailTitle) DOM.detailTitle.textContent = `Details — ${asset.id}`;
  if (DOM.detailAsset) DOM.detailAsset.textContent = `${asset.id} · ${asset.name}`;
  if (DOM.detailPrice) DOM.detailPrice.textContent = formatPrice(asset.price);

  if (DOM.detailPosition) {
    const position = currentState.positions[asset.id];
    if (!position) {
      DOM.detailPosition.textContent = "No position";
    } else {
      const unrl = (asset.price - position.avgCost) * position.qty;
      const cls = unrl >= 0 ? "pl--good" : "pl--bad";
      DOM.detailPosition.innerHTML = `${position.qty} @ ${formatPrice(position.avgCost)} — <span class="${cls}">${fmtMoney(unrl)}</span>`;
    }
  }

  renderEffectsForSelected(currentState);
  renderDriversForSelected(currentState);
  drawChart(asset.history);

  if (DOM.tradeQty && DOM.qtyGlobal) {
    DOM.tradeQty.value = parseQty(DOM.qtyGlobal.value);
  }
}

function renderEffectsForSelected(currentState) {
  if (!DOM.effectsList) return;
  const id = currentState.selected;
  const list = currentState.events.filter((event) => event.targetId == null || event.targetId === id);
  if (list.length === 0) {
    DOM.effectsList.innerHTML = '<li class="effect"><span class="meta">None</span></li>';
    return;
  }

  DOM.effectsList.innerHTML = list
    .map((event) => {
      const kindTag =
        event.kind === "good" ? "tag--good" : event.kind === "bad" ? "tag--bad" : "tag--neutral";
      const tags = [];
      if (event.effect?.volMult && event.effect.volMult !== 1) {
        const cls = event.effect.volMult > 1 ? "tag--bad" : "tag--good";
        const label = event.effect.volMult > 1 ? "Vol ↑ x" : "Vol ↓ x";
        tags.push(`<span class="tag ${cls}">${label}${event.effect.volMult.toFixed(2)}</span>`);
      }
      if (event.effect?.driftShift) {
        const cls = event.effect.driftShift > 0 ? "tag--good" : "tag--bad";
        const arrow = event.effect.driftShift > 0 ? "Drift ↑ " : "Drift ↓ ";
        tags.push(`<span class="tag ${cls}">${arrow}${event.effect.driftShift.toFixed(3)}</span>`);
      }
      const expiry = [];
      if (event.expiresAtTick != null) expiry.push(`T${event.expiresAtTick}`);
      if (event.expiresOnDay != null) expiry.push(`D${event.expiresOnDay}`);
      const expiryLabel = expiry.length ? expiry.join(" · ") : "—";
      return `
        <li class="effect">
          <div class="effect__header">
            <span class="tag ${kindTag}">${event.kind}</span>
            <strong>${event.label}</strong>
          </div>
          <div class="effect__meta">Expires ${expiryLabel}</div>
          <div class="effect__tags">${tags.join(" ")}</div>
        </li>
      `;
    })
    .join("");
}

function renderDriversForSelected(currentState) {
  if (!DOM.driversList) return;
  const asset = findAsset(currentState, currentState.selected);
  if (!asset || !asset.lastTickMeta) {
    DOM.driversList.innerHTML = '<li class="effect"><span class="meta">No price drivers yet — make a move or wait for the next tick.</span></li>';
    return;
  }

  const influences = Array.isArray(asset.lastTickMeta.influences) ? asset.lastTickMeta.influences : [];
  if (influences.length === 0) {
    DOM.driversList.innerHTML = '<li class="effect"><span class="meta">No major forces moved this asset on the last update.</span></li>';
    return;
  }

  const flags = asset.lastTickMeta.flags || {};
  const metaMessages = [];
  if (flags.externalOverride) {
    metaMessages.push('<li class="effect"><div class="effect__meta">External shocks overrode your order flow.</div></li>');
  }
  if (flags.playerDominant) {
    metaMessages.push('<li class="effect"><div class="effect__meta">Your trading flow is steering the price for now.</div></li>');
  }
  if (flags.macroShock) {
    metaMessages.push('<li class="effect"><div class="effect__meta">Macro regime turbulence is amplifying moves.</div></li>');
  }
  if (flags.highVolRegime && !flags.macroShock) {
    metaMessages.push('<li class="effect"><div class="effect__meta">Volatility is running hotter than usual.</div></li>');
  }

  const rows = influences
    .map((influence) => {
      const label = influence.label ?? "Influence";
      const typeClass = influence.type ? `tag--${influence.type}` : "tag--neutral";
      const typeLabel = influence.typeLabel ?? (influence.type ? influence.type[0].toUpperCase() + influence.type.slice(1) : "Driver");
      const magnitudePct = Number.isFinite(influence.magnitude) ? influence.magnitude * 100 : 0;
      const magnitudeClass =
        magnitudePct > 0.001 ? "tag--good" : magnitudePct < -0.001 ? "tag--bad" : "tag--neutral";
      const magnitudeLabel =
        Math.abs(magnitudePct) < 0.001 ? "≈0.00%" : `${magnitudePct > 0 ? "+" : ""}${magnitudePct.toFixed(2)}%`;
      const volMult = Number.isFinite(influence.volMult) ? influence.volMult : 1;
      const showVol = Math.abs(volMult - 1) > 0.05;
      const volTag = showVol
        ? `<span class="tag ${volMult > 1 ? "tag--bad" : "tag--good"}">Vol x${volMult.toFixed(2)}</span>`
        : "";
      const description = influence.description ? influence.description : "";
      return `
        <li class="effect">
          <div class="effect__header">
            <span class="tag ${typeClass}">${typeLabel}</span>
            <strong>${label}</strong>
          </div>
          <div class="effect__meta">${description}</div>
          <div class="effect__tags">
            <span class="tag ${magnitudeClass}">${magnitudeLabel}</span>
            ${volTag}
          </div>
        </li>
      `;
    })
    .join("");

  DOM.driversList.innerHTML = [...metaMessages, rows].join("");
}

function drawChart(history) {
  if (!chartCtx || !history || history.length === 0) return;
  const { width: w, height: h } = chartCtx.canvas;
  chartCtx.clearRect(0, 0, w, h);
  chartCtx.strokeStyle = "#262638";
  chartCtx.lineWidth = 1;
  chartCtx.strokeRect(0, 0, w, h);

  const min = Math.min(...history);
  const max = Math.max(...history);
  const pad = (max - min) * 0.1 || 1;
  const yMin = min - pad;
  const yMax = max + pad;

  chartCtx.lineWidth = 2;
  chartCtx.strokeStyle = "#8b5cf6";
  chartCtx.beginPath();
  history.forEach((value, index) => {
    const x = (index / (history.length - 1)) * (w - 10) + 5;
    const y = h - ((value - yMin) / (yMax - yMin)) * (h - 10) - 5;
    if (index === 0) chartCtx.moveTo(x, y);
    else chartCtx.lineTo(x, y);
  });
  chartCtx.stroke();
}

function renderFeed(currentState) {
  if (!DOM.feed) return;
  DOM.feed.innerHTML = currentState.feed
    .slice()
    .reverse()
    .map((entry) => {
      const kindCls =
        entry.kind === "good" ? "feed__item--good" : entry.kind === "bad" ? "feed__item--bad" : "feed__item--neutral";
      return `
        <li class="feed__item ${kindCls}">
          <span class="feed__time">${entry.time}</span>
          <span class="feed__text">${entry.text}</span>
        </li>
      `;
    })
    .join("");
}

function updateControls(currentState) {
  if (!DOM.startBtn) return;
  DOM.startBtn.textContent = currentState.running ? "Pause" : "Start";
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
