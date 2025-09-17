/* To The Moon — Trading Sim (v0.1.2)
   Robust init: run now if DOM is ready, else wait for DOMContentLoaded.
   Keeps News Feed + timed events. Safe canvas guards. */

(function boot() {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }

  function init() {
    // ---------- Utilities ----------
    const $ = (sel) => document.querySelector(sel);
    const fmtMoney = (n) =>
      (n < 0 ? "-$" : "$") +
      Math.abs(n).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
    const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
    const gaussian = () => {
      // Box–Muller
      let u = 0,
        v = 0;
      while (u === 0) u = Math.random();
      while (v === 0) v = Math.random();
      return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    };

    // ---------- Data ----------
    const ASSETS = [
      { id: "MOON", name: "Moon Mineral Co.", start: 50, volatility: 0.02 },
      { id: "STONK", name: "Stonk Industries", start: 35, volatility: 0.03 },
      { id: "DOGE", name: "Dogecoin", start: 0.08, volatility: 0.06 },
      { id: "TSLA", name: "Teslor Motors", start: 240, volatility: 0.018 },
      { id: "BTC", name: "Bitcorn", start: 65000, volatility: 0.03 },
      { id: "ETH", name: "Etheer", start: 3500, volatility: 0.035 }
    ];
    const SAVE_KEY = "ttm_v0_save";

    const mkAssetRuntime = (def) => ({
      id: def.id,
      name: def.name,
      volatility: def.volatility,
      price: def.start,
      prev: def.start,
      changePct: 0,
      history: Array.from(
        { length: 60 },
        (_, i) => def.start * (1 + (i - 59) * 0.0005)
      )
    });

    const initialState = () => ({
      day: 1,
      cash: 10000,
      realized: 0,
      assets: ASSETS.map(mkAssetRuntime),
      positions: {},
      running: false,
      selected: "MOON",
      tick: 0,
      events: [],
      feed: [],
      nextEventId: 1
    });

    let state = load() ?? initialState();
    let timer = null;
    let upgradesConfigured = false;

    // ---------- DOM refs ----------
    const elDay = $("#hud-day");
    const elCash = $("#hud-cash");
    const elEquity = $("#hud-equity");
    const elPL = $("#hud-pl");

    const elStart = $("#btn-start");
    const elEnd = $("#btn-end");
    const elReset = $("#btn-reset");

    const elQtyGlobal = $("#qty-global");
    const elTableBody = $("#market-body");

    const elDetailAsset = $("#detail-asset");
    const elDetailPrice = $("#detail-price");
    const elDetailPosition = $("#detail-position");
    const elDetailTitle = $("#detail-title");
    const elTradeQty = $("#trade-qty");
    const elBuy = $("#btn-buy");
    const elSell = $("#btn-sell");
    const elMsg = $("#messages");

    const elEffects = $("#effects-list");
    const elFeed = $("#feed");

    const chart = $("#chart");
    let ctx = chart && chart.getContext ? chart.getContext("2d") : null;

    const clock = () => `D${state.day} · T${state.tick}`;

    // ---------- Functions ----------
    function parseQty(v) {
      const n = Math.floor(Number(v));
      return isFinite(n) && n > 0 ? n : 1;
    }

    function start() {
      state.running = true;
      if (elStart) elStart.textContent = "Pause";
      clearInterval(timer);
      timer = setInterval(tick, 600);
    }
    function pause() {
      state.running = false;
      if (elStart) elStart.textContent = "Start";
      clearInterval(timer);
      timer = null;
    }

    function tick() {
      state.tick += 1;

      // Random short-lived rumor
      if (Math.random() < 0.04) {
        const a = randomAsset();
        const up = Math.random() < 0.5;
        createEvent({
          label: `${up ? "Rumor surge" : "Short report"} on ${a.id}`,
          kind: up ? "good" : "bad",
          targetId: a.id,
          durationTicks: 24,
          effect: { volMult: 1.6, driftShift: up ? 0.003 : -0.003 }
        });
      }

      cleanupExpiredEvents();
      stepAll(1, 1.0);
      safeRenderAll();
      if (state.tick % 16 === 0) save();
    }
    
    Upgrades.applyBiasOnTick(asset);

    function stepAll(steps = 1, varianceBoost = 1.0) {
      for (let s = 0; s < steps; s++) {
        for (const a of state.assets) {
          a.prev = a.price;
          const mods = getModifiersForAsset(a.id);
          const vol = a.volatility * varianceBoost * mods.volMult;
          const drift = 0.0005 + mods.driftShift;
          const shock = gaussian() * vol;
          const pct = drift + shock;
          const nextPrice = Math.max(0.0001, a.price * (1 + pct));
          const boostFn = window.ttm && window.ttm.insider && window.ttm.insider.applyInsiderBoost;
          a.price = boostFn ? boostFn(state, a.id, nextPrice) : nextPrice;

          a.changePct = ((a.price - a.prev) / a.prev) * 100;

          a.history.push(a.price);
          if (a.history.length > 240) a.history.shift();
        }
      }
    }

    function randomAsset() {
      return state.assets[(Math.random() * state.assets.length) | 0];
    }

    // ----- Events -----
    function createEvent({
      label,
      kind = "neutral",
      targetId = null,
      durationTicks = 0,
      durationDays = 0,
      effect = {}
    }) {
      const id = state.nextEventId++;
      const ev = {
        id,
        label,
        kind,
        targetId,
        effect,
        createdTick: state.tick,
        expiresAtTick: durationTicks ? state.tick + durationTicks : null,
        expiresOnDay: durationDays ? state.day + durationDays : null
      };
      state.events.push(ev);
      logFeed({
        text: label,
        kind,
        targetId,
        effect,
        expiresAtTick: ev.expiresAtTick,
        expiresOnDay: ev.expiresOnDay
      });
      return ev;
    }

    function getModifiersForAsset(assetId) {
      let volMult = 1.0;
      let driftShift = 0.0;
      for (const e of state.events) {
        const applies = e.targetId == null || e.targetId === assetId;
        if (!applies) continue;
        if (e.effect.volMult) volMult *= e.effect.volMult;
        if (e.effect.driftShift) driftShift += e.effect.driftShift;
      }
      return { volMult, driftShift };
    }

    function cleanupExpiredEvents() {
      const now = state.tick;
      state.events = state.events.filter((e) => {
        const tickOK = e.expiresAtTick == null || now < e.expiresAtTick;
        const dayOK = e.expiresOnDay == null || state.day < e.expiresOnDay;
        return tickOK && dayOK;
      });
    }

    function startNewDay() {
      cleanupExpiredEvents();
      logFeed({ text: `Day ${state.day} begins.` });

      if (Math.random() < 0.6) {
        const r = Math.random();
        if (r < 0.25) {
          createEvent({
            label: "Calm markets",
            kind: "good",
            durationDays: 1,
            effect: { volMult: 0.8 }
          });
        } else if (r < 0.5) {
          createEvent({
            label: "Volatility spike",
            kind: "bad",
            durationDays: 1,
            effect: { volMult: 1.4 }
          });
        } else if (r < 0.75) {
          const a = randomAsset();
          createEvent({
            label: `Analyst upgrade on ${a.id}`,
            kind: "good",
            targetId: a.id,
            durationDays: 1,
            effect: { driftShift: 0.002 }
          });
        } else {
          const a = randomAsset();
          createEvent({
            label: `Regulator scrutiny on ${a.id}`,
            kind: "bad",
            targetId: a.id,
            durationDays: 1,
            effect: { driftShift: -0.002 }
          });
        }
      }
    }

    function logFeed(entry) {
      const row = {
        time: clock(),
        text: entry.text,
        kind: entry.kind ?? "neutral",
        targetId: entry.targetId ?? null,
        effect: entry.effect ?? {},
        expiresAtTick: entry.expiresAtTick ?? null,
        expiresOnDay: entry.expiresOnDay ?? null
      };
      state.feed.push(row);
      if (state.feed.length > 60) state.feed.shift();
      renderFeed();
    }

    // ----- Trading -----
    function doBuy(id, qty) {
     const a = findAsset(id);
     const cost = a.price * qty;
   
     const hasMargin = !!(window.ttm && window.ttm.margin);
     const pv = portfolioValue();

     const cost = price * qty;
     const borrowed = Upgrades.maybeBorrow({ cost, cash: state.cash, equity: state.cash + portfolioValue() });
     state.cash += borrowed;
     // proceed with your existing buy logic

   
     if (hasMargin) {
       if (window.ttm.margin.isUnderMaintenance(state, pv)) {
         bumpNews("Buy blocked: maintenance margin breached.");
         return;
       }
       const ok = window.ttm.margin.buyWithMargin(state, cost, pv);
       if (!ok) {
         bumpNews(`Insufficient buying power for ${qty} ${id}.`);
         return;
       }
     } else {
       if (cost > state.cash + 1e-9) {
         bumpNews(`Not enough cash to buy ${qty} ${id}.`);
         return;
       }
       state.cash -= cost;
     }
   
     const p = state.positions[id] || { qty: 0, avgCost: 0 };
     const newQty = p.qty + qty;
     const newCostBasis = (p.avgCost * p.qty + cost) / newQty;
     state.positions[id] = { qty: newQty, avgCost: newCostBasis };
   
     save();
     safeRenderAll();
     selectAsset(id);
     bumpNews(`Bought ${qty} ${id} @ ${formatPrice(a.price)}.`);
   }


    function doSell(id, qty) {
      const p = state.positions[id];
      if (!p || p.qty <= 0) {
        bumpNews(`You don't own ${id}. Imagination doesn’t count as collateral.`);
        return;
      }
      const actualQty = clamp(qty, 1, p.qty);
      const a = findAsset(id);
      const proceeds = a.price * actualQty;
      const profit = (a.price - p.avgCost) * actualQty;

      if (window.ttm && window.ttm.margin) {
        window.ttm.margin.applyProceeds(state, proceeds);
      } else {
        state.cash += proceeds;
      }
      state.realized += profit;

      const leftover = p.qty - actualQty;
      if (leftover <= 0) delete state.positions[id];
      else state.positions[id] = { qty: leftover, avgCost: p.avgCost };

      save();
      safeRenderAll();
      selectAsset(id);
      bumpNews(
        `Sold ${actualQty} ${id} @ ${formatPrice(a.price)} (${
          profit >= 0 ? "+" : ""
        }${fmtMoney(profit)}).`
      );
    }

    function findAsset(id) {
      return state.assets.find((a) => a.id === id);
    }

    // ----- Rendering -----
    function safeRenderAll() {
      try {
        renderAll();
      } catch (err) {
        console.error(err);
        bumpNews("Render error. Recovered.");
      }
    }

    function configureUpgradesIntegration() {
      if (upgradesConfigured) return;
      if (!window.Upgrades || typeof window.Upgrades.configure !== "function") return;
      window.Upgrades.configure({
        getCash: () => state.cash,
        setCash: (value) => {
          state.cash = value;
          save();
          safeRenderAll();
        },
        getEquity: () => state.cash + portfolioValue(),
        listAssetKeys: () =>
          Array.isArray(state.assets) ? state.assets.map((asset) => asset.id) : []
      });
      upgradesConfigured = true;
    }

    function renderAll() {
      renderHUD();
      renderTable();
      renderDetail();
      renderFeed();
    }

    function renderHUD() {
      const holdingsValue = portfolioValue();
      const equity = state.cash + holdingsValue;
      const unrealized = unrealizedPL();

      elDay.textContent = String(state.day);
      elCash.textContent = fmtMoney(state.cash);
      elEquity.textContent = fmtMoney(equity);

      const totalPL = state.realized + unrealized;
      elPL.textContent = `${fmtMoney(totalPL)} (${
        totalPL >= 0 ? "+" : ""
      }${fmtMoney(unrealized).replace("$", "")} unrl)`;
      elPL.classList.remove("pl--good", "pl--bad", "pl--neutral");
      elPL.classList.add(
        totalPL > 0 ? "pl--good" : totalPL < 0 ? "pl--bad" : "pl--neutral"
      );

      if (elStart) elStart.textContent = state.running ? "Pause" : "Start";
    }

    function renderTable() {
      const rows = state.assets
        .map((a) => {
          const pos = state.positions[a.id]?.qty ?? 0;
          const avg = state.positions[a.id]?.avgCost ?? 0;
          const unrl = pos > 0 ? (a.price - avg) * pos : 0;
          const badge =
            a.changePct > 0.001
              ? `<span class="badge badge--good">+${a.changePct.toFixed(
                  2
                )}%</span>`
              : a.changePct < -0.001
              ? `<span class="badge badge--bad">${a.changePct.toFixed(
                  2
                )}%</span>`
              : `<span class="badge badge--neutral">${a.changePct.toFixed(
                  2
                )}%</span>`;
          const isSel = a.id === state.selected;
          return `
        <tr data-id="${a.id}" ${
            isSel
              ? 'style="outline:1px solid #223456; background:rgba(139,92,246,.06)"'
              : ""
          }>
          <td><strong>${a.id}</strong></td>
          <td>${a.name}</td>
          <td class="num">${formatPrice(a.price)}</td>
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
      elTableBody.innerHTML = rows;
    }

    function renderDetail() {
      const a = findAsset(state.selected);
      elDetailTitle.textContent = `Details — ${a.id}`;
      elDetailAsset.textContent = `${a.id} · ${a.name}`;
      elDetailPrice.textContent = formatPrice(a.price);

      const p = state.positions[a.id];
      if (!p) elDetailPosition.textContent = "No position";
      else {
        const unrl = (a.price - p.avgCost) * p.qty;
        elDetailPosition.innerHTML = `${p.qty} @ ${formatPrice(
          p.avgCost
        )} — ${unrl >= 0 ? '<span class="pl--good">' : '<span class="pl--bad">'}${fmtMoney(
          unrl
        )}</span>`;
      }

      renderEffectsForSelected();
      drawChart(a.history);
    }

     function selectAsset(id) {
        if (!id) return;
        state.selected = id;
        // keep the side-panel qty aligned with the global default
        if (elTradeQty) elTradeQty.value = parseQty(elQtyGlobal.value);
        // re-render table highlight and the detail panel
        renderTable();
        renderDetail();
      }


    function renderEffectsForSelected() {
      const id = state.selected;
      const list = state.events.filter(
        (e) => e.targetId == null || e.targetId === id
      );
      if (list.length === 0) {
        elEffects.innerHTML = `<li class="effect"><span class="meta">None</span></li>`;
        return;
      }
      elEffects.innerHTML = list
        .map((e) => {
          const kindTag =
            e.kind === "good"
              ? "tag--good"
              : e.kind === "bad"
              ? "tag--bad"
              : "tag--neutral";
          const tags = [];
          if (e.effect?.volMult && e.effect.volMult !== 1) {
            tags.push(
              `<span class="tag ${
                e.effect.volMult > 1 ? "tag--bad" : "tag--good"
              }">${e.effect.volMult > 1 ? "Vol ↑ x" : "Vol ↓ x"}${e.effect.volMult.toFixed(2)}</span>`
            );
          }
          if (e.effect?.driftShift) {
            tags.push(
              `<span class="tag ${
                e.effect.driftShift > 0 ? "tag--good" : "tag--bad"
              }">Drift ${e.effect.driftShift > 0 ? "+" : ""}${(
                e.effect.driftShift * 100
              ).toFixed(2)}%</span>`
            );
          }
          const ttl = remainingString(e);
          return `<li class="effect">
        <span>${e.label} ${e.targetId ? `(<strong>${e.targetId}</strong>)` : ""}</span>
        <span class="tags">
          <span class="tag ${kindTag}">${e.kind}</span>
          ${tags.join("")}
          <span class="meta">${ttl}</span>
        </span>
      </li>`;
        })
        .join("");
    }

    function renderFeed() {
      if (!elFeed) return;
      const items = state.feed.slice(-30).map((row) => {
        const kindTag =
          row.kind === "good"
            ? "tag--good"
            : row.kind === "bad"
            ? "tag--bad"
            : "tag--neutral";
        const tags = [];
        if (row.targetId)
          tags.push(`<span class="tag ${kindTag}">${row.targetId}</span>`);
        if (row.effect?.volMult && row.effect.volMult !== 1)
          tags.push(
            `<span class="tag ${kindTag}">Vol x${row.effect.volMult.toFixed(
              2
            )}</span>`
          );
        if (row.effect?.driftShift)
          tags.push(
            `<span class="tag ${
              row.effect.driftShift > 0 ? "tag--good" : "tag--bad"
            }">Drift ${row.effect.driftShift > 0 ? "+" : ""}${(
              row.effect.driftShift * 100
            ).toFixed(2)}%</span>`
          );
        const ttl = remainingString(row);
        return `<li>
        <div class="left"><span class="time">${row.time}</span><span>${
          row.text
        }</span></div>
        <div class="right">${tags.join("")}${
          ttl ? `<span class="meta">${ttl}</span>` : ""
        }</div>
      </li>`;
      });
      elFeed.innerHTML = items.join("");
    }

    function remainingString(obj) {
      const parts = [];
      if (obj.expiresOnDay != null) {
        const d = obj.expiresOnDay - state.day;
        if (d > 0) parts.push(`${d}d`);
      }
      if (obj.expiresAtTick != null) {
        const t = obj.expiresAtTick - state.tick;
        if (t > 0) parts.push(`${t}t`);
      }
      return parts.join(" ");
    }

    function drawChart(history) {
      if (!chart || !chart.getContext) return;
      if (!ctx) ctx = chart.getContext("2d");
      const w = chart.width,
        h = chart.height;
      ctx.clearRect(0, 0, w, h);

      ctx.globalAlpha = 1;
      ctx.fillStyle = "#0b1224";
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = "#1f2b46";
      ctx.lineWidth = 1;
      for (let i = 1; i <= 3; i++) {
        const y = (h / 4) * i;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      const min = Math.min(...history);
      const max = Math.max(...history);
      const pad = (max - min) * 0.1 || 1;
      const yMin = min - pad,
        yMax = max + pad;

      ctx.lineWidth = 2;
      ctx.strokeStyle = "#8b5cf6";
      ctx.beginPath();
      history.forEach((v, i) => {
        const x = (i / (history.length - 1)) * (w - 10) + 5;
        const y = h - ((v - yMin) / (yMax - yMin)) * (h - 10) - 5;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }

    // ----- Calculations -----
    function portfolioValue() {
      let sum = 0;
      for (const [id, pos] of Object.entries(state.positions)) {
        const a = findAsset(id);
        sum += pos.qty * a.price;
      }
      return sum;
    }
    function unrealizedPL() {
      let sum = 0;
      for (const [id, pos] of Object.entries(state.positions)) {
        const a = findAsset(id);
        sum += (a.price - pos.avgCost) * pos.qty;
      }
      return sum;
    }
    function formatPrice(p) {
      const abs = Math.abs(p);
      const digits = abs >= 1000 ? 2 : abs >= 1 ? 2 : 4;
      return (
        "$" +
        p.toLocaleString(undefined, {
          minimumFractionDigits: digits,
          maximumFractionDigits: digits
        })
      );
    }

    // ----- Persistence -----
    function save() {
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(state));
      } catch {}
    }
    function load() {
      try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        const defs = Object.fromEntries(ASSETS.map((a) => [a.id, a]));
        data.assets = data.assets.map((a) => {
          const d =
            defs[a.id] ?? { name: a.name, volatility: a.volatility, start: a.price };
          return {
            id: a.id,
            name: d.name,
            volatility: d.volatility,
            price: a.price,
            prev: a.prev ?? a.price,
            changePct: a.changePct ?? 0,
            history:
              Array.isArray(a.history) && a.history.length
                ? a.history.slice(-240)
                : [d.start]
          };
        });
        data.running = false;
        data.events = Array.isArray(data.events) ? data.events : [];
        data.feed = Array.isArray(data.feed) ? data.feed : [];
        data.nextEventId = Number.isFinite(data.nextEventId)
          ? data.nextEventId
          : 1;
        return data;
      } catch {
        return null;
      }
    }

    // ----- UX / bindings -----
    let lastMsgTimeout = null;
    function bumpNews(text) {
      clearTimeout(lastMsgTimeout);
      elMsg.textContent = text;
      lastMsgTimeout = setTimeout(() => {
        elMsg.textContent = "";
      }, 4000);
      logFeed({ text });
    }

    if (elStart) elStart.addEventListener("click", () => (state.running ? pause() : start()));
    if (elEnd)
      elEnd.addEventListener("click", () => {
        bumpNews("Market closed. Overnight risk intensifies. Try not to panic.");
        stepAll(6, 1.8);
        state.day += 1;
        startNewDay();
        save();
        safeRenderAll();
        if (window.Upgrades && typeof window.Upgrades.accrueDailyInterest === "function") {
          window.Upgrades.accrueDailyInterest({
            getCash: () => state.cash,
            setCash: (v) => {
              state.cash = v;
              save();
              safeRenderAll();
            }
          });
        }
      });
    if (elReset)
      elReset.addEventListener("click", () => {
        if (confirm("Reset game and clear local save?")) {
          localStorage.removeItem(SAVE_KEY);
          state = initialState();
          pause();
          safeRenderAll();
          selectAsset(state.selected);
          bumpNews("Fresh start. Your future mistakes haven’t happened yet.");
          logFeed({ text: "New game." });
        }
      });
    if (elTableBody)
      elTableBody.addEventListener("click", (e) => {
     const row = e.target.closest("tr[data-id]");
     if (!row) return;
     const id = row.getAttribute("data-id");
   
     const buyBtn = e.target.closest("[data-buy]");
     const sellBtn = e.target.closest("[data-sell]");
   
     if (buyBtn) { doBuy(id, parseQty(elQtyGlobal.value)); return; }
     if (sellBtn) { doSell(id, parseQty(elQtyGlobal.value)); return; }
   
     // plain row click selects the asset
     selectAsset(id);
   });

    if (elBuy)
      elBuy.addEventListener("click", () =>
        doBuy(state.selected, parseQty(elTradeQty.value))
      );
    if (elSell)
      elSell.addEventListener("click", () =>
        doSell(state.selected, parseQty(elTradeQty.value))
      );

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) pause();
    });

    const ttmGameHandle = window.ttmGame || {};
    Object.defineProperty(ttmGameHandle, "state", {
      get: () => state,
      configurable: true,
      enumerable: true
    });
    ttmGameHandle.portfolioValue = portfolioValue;
    ttmGameHandle.safeRenderAll = safeRenderAll;
    window.ttmGame = ttmGameHandle;

    configureUpgradesIntegration();
    if (!upgradesConfigured) {
      if (document.readyState === "complete") {
        configureUpgradesIntegration();
      } else {
        window.addEventListener("load", configureUpgradesIntegration, { once: true });
      }
    }

    window.dispatchEvent(new CustomEvent("ttm:gameReady", { detail: window.ttmGame }));

    // Initial render
    if (state.feed.length === 0)
      logFeed({ text: "Markets booted. Try not to recreate 2008." });
    safeRenderAll();
    selectAsset(state.selected);
  }
})();
