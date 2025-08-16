/* To The Moon — Trading Sim (v0)
   Single-file logic. No frameworks. No dependency oopsies. */

(() => {
  // ---------- Utilities ----------
  const $ = (sel) => document.querySelector(sel);
  const fmtMoney = (n) =>
    (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const gaussian = () => {
    // Box–Muller
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  // ---------- Data ----------
  const ASSETS = [
    { id: "MOON", name: "Moon Mineral Co.", start: 50, volatility: 0.020 },
    { id: "STONK", name: "Stonk Industries", start: 35, volatility: 0.030 },
    { id: "DOGE", name: "Dogecoin", start: 0.08, volatility: 0.060 },
    { id: "TSLA", name: "Teslor Motors", start: 240, volatility: 0.018 },
    { id: "BTC", name: "Bitcorn", start: 65000, volatility: 0.030 },
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
    history: Array.from({ length: 60 }, (_, i) => def.start * (1 + (i - 59) * 0.0005)) // gentle slope so the chart isn't flat at boot
  });

  const initialState = () => ({
    day: 1,
    cash: 10000,
    realized: 0,
    assets: ASSETS.map(mkAssetRuntime),
    positions: {}, // id -> { qty, avgCost }
    running: false,
    selected: "MOON",
    tick: 0
  });

  let state = load() ?? initialState();
  let timer = null;

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

  const chart = $("#chart");
  const ctx = chart.getContext("2d");

  // ---------- Init ----------
  renderAll();
  selectAsset(state.selected);

  // ---------- Events ----------
  elStart.addEventListener("click", () => {
    if (state.running) {
      pause();
    } else {
      start();
    }
  });

  elEnd.addEventListener("click", () => {
    // Small "overnight" gap effect
    bumpNews("Market closed. Overnight risk intensifies. Try not to panic.");
    stepAll(6, 1.8); // 6 brisk steps at higher variance to simulate the close/open gap
    state.day += 1;
    save();
    renderAll();
  });

  elReset.addEventListener("click", () => {
    if (confirm("Reset game and clear local save?")) {
      localStorage.removeItem(SAVE_KEY);
      state = initialState();
      pause();
      renderAll();
      selectAsset(state.selected);
      bumpNews("Fresh start. Your future mistakes haven’t happened yet.");
    }
  });

  elTableBody.addEventListener("click", (e) => {
    const row = e.target.closest("tr[data-id]");
    if (!row) return;
    const id = row.getAttribute("data-id");
    selectAsset(id);

    const isBuy = e.target.matches("[data-buy]");
    const isSell = e.target.matches("[data-sell]");
    if (isBuy || isSell) {
      const qty = parseQty(elQtyGlobal.value);
      if (isBuy) doBuy(id, qty);
      else doSell(id, qty);
    }
  });

  elBuy.addEventListener("click", () => doBuy(state.selected, parseQty(elTradeQty.value)));
  elSell.addEventListener("click", () => doSell(state.selected, parseQty(elTradeQty.value)));

  function parseQty(v) {
    const n = Math.floor(Number(v));
    return isFinite(n) && n > 0 ? n : 1;
  }

  // ---------- Game Loop ----------
  function start() {
    state.running = true;
    elStart.textContent = "Pause";
    if (timer) clearInterval(timer);
    timer = setInterval(tick, 600); // gentle pace; not a slot machine
  }
  function pause() {
    state.running = false;
    elStart.textContent = "Start";
    if (timer) { clearInterval(timer); timer = null; }
  }
  function tick() {
    state.tick += 1;
    // Random event sprinkling
    const eventChance = 0.04; // 4% per tick
    const boostId = Math.random() < eventChance ? randomAsset().id : null;
    stepAll(1, 1.0, boostId);
    renderAll();

    // Autosave every ~10s
    if (state.tick % 16 === 0) save();
  }

  function stepAll(steps = 1, varianceBoost = 1.0, boostId = null) {
    for (let s = 0; s < steps; s++) {
      for (const a of state.assets) {
        a.prev = a.price;
        // Geometric-ish random walk
        const vol = a.volatility * varianceBoost;
        const drift = 0.0005; // tiny optimism, because this is a video game
        const shock = gaussian() * vol;
        const isBoost = boostId && boostId === a.id;
        const newsShock = isBoost ? (Math.random() < 0.5 ? -1 : 1) * (0.02 + Math.random() * 0.04) : 0;
        const pct = drift + shock + newsShock;
        a.price = Math.max(0.0001, a.price * (1 + pct));
        a.changePct = ((a.price - a.prev) / a.prev) * 100;

        a.history.push(a.price);
        if (a.history.length > 240) a.history.shift();

        if (isBoost) {
          bumpNews(`${a.id}: ${pct > 0 ? "Good" : "Bad"} rumor hits the tape (${pct > 0 ? "+" : ""}${(pct * 100).toFixed(2)}%)`);
        }
      }
    }
  }

  function randomAsset() {
    return state.assets[(Math.random() * state.assets.length) | 0];
  }

  // ---------- Trading ----------
  function doBuy(id, qty) {
    const a = findAsset(id);
    const cost = a.price * qty;
    if (cost > state.cash + 1e-9) {
      bumpNews(`Not enough cash to buy ${qty} ${id}. Consider being richer.`);
      return;
    }
    state.cash -= cost;

    const p = state.positions[id] || { qty: 0, avgCost: 0 };
    const newQty = p.qty + qty;
    const newCostBasis = (p.avgCost * p.qty + cost) / newQty;
    state.positions[id] = { qty: newQty, avgCost: newCostBasis };

    save();
    renderAll();
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

    state.cash += proceeds;
    state.realized += profit;

    const leftover = p.qty - actualQty;
    if (leftover <= 0) {
      delete state.positions[id];
    } else {
      state.positions[id] = { qty: leftover, avgCost: p.avgCost };
    }

    save();
    renderAll();
    selectAsset(id);
    bumpNews(`Sold ${actualQty} ${id} @ ${formatPrice(a.price)} (${profit >= 0 ? "+" : ""}${fmtMoney(profit)}).`);
  }

  function findAsset(id) {
    return state.assets.find(a => a.id === id);
  }

  // ---------- Rendering ----------
  function renderAll() {
    renderHUD();
    renderTable();
    renderDetail();
  }

  function renderHUD() {
    const holdingsValue = portfolioValue();
    const equity = state.cash + holdingsValue;
    const unrealized = unrealizedPL();

    elDay.textContent = String(state.day);
    elCash.textContent = fmtMoney(state.cash);
    elEquity.textContent = fmtMoney(equity);

    const totalPL = state.realized + unrealized;
    elPL.textContent = `${fmtMoney(totalPL)} (${totalPL >= 0 ? "+" : ""}${fmtMoney(unrealized).replace("$","") } unrl)`;
    elPL.classList.remove("pl--good", "pl--bad", "pl--neutral");
    elPL.classList.add(totalPL > 0 ? "pl--good" : totalPL < 0 ? "pl--bad" : "pl--neutral");

    // Start/Pause label already handled, but protect on reload
    elStart.textContent = state.running ? "Pause" : "Start";
  }

  function renderTable() {
    const rows = state.assets.map(a => {
      const pos = state.positions[a.id]?.qty ?? 0;
      const avg = state.positions[a.id]?.avgCost ?? 0;
      const unrl = pos > 0 ? (a.price - avg) * pos : 0;
      const badge =
        a.changePct > 0.001 ? `<span class="badge badge--good">+${a.changePct.toFixed(2)}%</span>` :
        a.changePct < -0.001 ? `<span class="badge badge--bad">${a.changePct.toFixed(2)}%</span>` :
                               `<span class="badge badge--neutral">${a.changePct.toFixed(2)}%</span>`;
      const isSel = a.id === state.selected;
      return `
        <tr data-id="${a.id}" ${isSel ? 'style="outline:1px solid #223456; background:rgba(139,92,246,.06)"' : ""}>
          <td><strong>${a.id}</strong></td>
          <td>${a.name}</td>
          <td class="num">${formatPrice(a.price)}</td>
          <td class="num">${badge}</td>
          <td class="num">${pos}</td>
          <td class="num">${unrl === 0 ? "—" : (unrl >= 0 ? `<span class="pl--good">${fmtMoney(unrl)}</span>` : `<span class="pl--bad">${fmtMoney(unrl)}</span>`)}</td>
          <td class="num">
            <button class="btn btn-primary" data-buy>Buy</button>
            <button class="btn" data-sell>Sell</button>
          </td>
        </tr>
      `;
    }).join("");
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
      elDetailPosition.innerHTML = `${p.qty} @ ${formatPrice(p.avgCost)} — ${unrl >= 0 ? '<span class="pl--good">' : '<span class="pl--bad">'}${fmtMoney(unrl)}</span>`;
    }

    drawChart(a.history);
  }

  function selectAsset(id) {
    state.selected = id;
    // Keep trade qty synced with global default
    elTradeQty.value = parseQty(elQtyGlobal.value);
    renderTable();
    renderDetail();
  }

  function drawChart(history) {
    const w = chart.width, h = chart.height;
    ctx.clearRect(0,0,w,h);

    // axes-ish background stripes for readability
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#0b1224";
    ctx.fillRect(0,0,w,h);

    ctx.strokeStyle = "#1f2b46";
    ctx.lineWidth = 1;
    for (let i=1;i<=3;i++){
      const y = (h/4)*i;
      ctx.beginPath();
      ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke();
    }

    const min = Math.min(...history);
    const max = Math.max(...history);
    const pad = (max - min) * 0.1 || 1;
    const yMin = min - pad, yMax = max + pad;

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

  // ---------- Calculations ----------
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
    return "$" + p.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }

  // ---------- Persistence ----------
  function save() {
    const payload = {
      ...state,
      // Drop volatile rendering fields if needed (none heavy here)
    };
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
    } catch {}
  }

  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);

      // Hydrate assets array with runtime helpers
      const defs = Object.fromEntries(ASSETS.map(a => [a.id, a]));
      data.assets = data.assets.map(a => {
        const d = defs[a.id] ?? { name: a.name, volatility: a.volatility, start: a.price };
        return {
          id: a.id,
          name: d.name,
          volatility: d.volatility,
          price: a.price,
          prev: a.prev ?? a.price,
          changePct: a.changePct ?? 0,
          history: Array.isArray(a.history) && a.history.length ? a.history.slice(-240) : [d.start]
        };
      });
      data.running = false; // don’t auto-run on load
      return data;
    } catch { return null; }
  }

  // ---------- UX ----------
  let lastMsgTimeout = null;
  function bumpNews(text) {
    clearTimeout(lastMsgTimeout);
    elMsg.textContent = text;
    lastMsgTimeout = setTimeout(() => { elMsg.textContent = ""; }, 4000);
  }

  // Safety: pause loop on tab hide
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pause();
  });
})();
