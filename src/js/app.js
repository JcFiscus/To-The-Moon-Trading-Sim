// src/js/app.js
import { hydrate, persist, hardReset, netWorth, riskPct } from './core/state.js';
import { renderTable, bindTableHandlers } from './ui/table.js'; // ← removed selectAsset import

let state = hydrate();
let tickTimer = null;
let dayLeft = state.secondsPerDay;

// Elements
const $ = (s) => document.querySelector(s);
const hudDay = $('#hud-day');
const hudTime = $('#hud-time');
const hudCash = $('#hud-cash');
const hudDebt = $('#hud-debt');
const hudAssets = $('#hud-assets');
const hudNet = $('#hud-net');
const hudRisk = $('#hud-risk');
const eodModal = $('#eod-modal');
const eodDay = $('#eod-day');
const eodNetChange = $('#eod-net-change');
const eodBest = $('#eod-best');
const eodWorst = $('#eod-worst');

const btnStart = $('#btn-start');
const btnSave = $('#btn-save');
const btnHelp = $('#btn-help');
const btnContrast = $('#btn-contrast');
const btnHardReset = $('#btn-hard-reset');

const chartCanvas = $('#price-chart');
let lastNet = netWorth(state);

// Safely set textContent when element exists
const setText = (el, txt) => {
  if (el) el.textContent = txt;
};

// --- Utils
const fmtMoney = (n) =>
  (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtCompact = (n) =>
  (n < 0 ? '-$' : '$') +
  Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 2 }).format(Math.abs(n));

// --- Game loop
function startDay() {
  if (tickTimer) return;
  dayLeft = state.secondsPerDay;
  if (btnStart) btnStart.textContent = '⏸ Pause';
  tickTimer = setInterval(tick, 1000);
}

function pauseDay() {
  clearInterval(tickTimer);
  tickTimer = null;
  if (btnStart) btnStart.textContent = '▶ Start Day';
}

function tick() {
  // 1) update prices every second
  randomWalkPrices(state.assets);

  // 2) UI refresh
  refreshHUD();
  renderTable(state, onSelectAsset, onTrade);

  // 3) countdown
  dayLeft -= 1;
  setText(hudTime, `${dayLeft}s`);

  if (dayLeft <= 0) endOfDay();
}

function endOfDay() {
  pauseDay();

  // set prevClose, compute best/worst
  let best = { sym: '', change: -Infinity };
  let worst = { sym: '', change: Infinity };
  for (const a of state.assets) {
    const change = a.price - a.prevClose;
    if (change > best.change) best = { sym: a.sym, change };
    if (change < worst.change) worst = { sym: a.sym, change };
    a.prevClose = a.price;
  }

  const nw = netWorth(state);
  const delta = nw - lastNet;
  lastNet = nw;

  // increment day, autosave
  state.day += 1;
  persist(state);

  // modal summary
  setText(eodDay, state.day);
  setText(eodNetChange, `${delta >= 0 ? '+' : ''}${fmtMoney(delta)} (Net: ${fmtCompact(nw)})`);
  if (eodNetChange) eodNetChange.className = delta >= 0 ? 'pos' : 'neg';
  setText(eodBest, `${best.sym} ${best.change >= 0 ? '▲' : '▼'} ${fmtMoney(best.change)}`);
  setText(eodWorst, `${worst.sym} ${worst.change >= 0 ? '▲' : '▼'} ${fmtMoney(worst.change)}`);

  if (eodModal && typeof eodModal.showModal === 'function') eodModal.showModal();
  else alert(`Day ${state.day} • Net change: ${delta >= 0 ? '+' : ''}${fmtMoney(delta)}`);
}

function refreshHUD() {
  const assetsValue = state.assets.reduce((s, a) => s + a.qty * a.price, 0);
  const nw = netWorth(state);

  setText(hudDay, state.day);
  setText(hudCash, fmtMoney(state.cash));
  setText(hudDebt, fmtMoney(state.debt));
  setText(hudAssets, fmtMoney(assetsValue));
  setText(hudNet, fmtMoney(nw));
  setText(hudRisk, `${riskPct(state)}%`);

  drawChart(chartCanvas, state);
}

// --- Simple price model (Gaussian-ish walk with per-asset volatility)
function randomWalkPrices(arr) {
  for (const a of arr) {
    const drift = 0.000; // neutral drift
    const shock = randn_bm() * a.vol;
    const next = Math.max(0.01, a.price * (1 + drift + shock));
    a.price = round2(next);
  }
}
function randn_bm() {
  // Box–Muller transform
  let u = 1 - Math.random();
  let v = 1 - Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}
const round2 = (n) => Math.round(n * 100) / 100;

// --- Trading API passed into the table
function onTrade(sym, qtyDelta) {
  const a = state.assets.find((x) => x.sym === sym);
  if (!a) return;
  if (qtyDelta > 0) {
    const cost = qtyDelta * a.price;
    if (state.cash >= cost) {
      state.cash -= cost;
      a.qty += qtyDelta;
    }
  } else if (qtyDelta < 0) {
    const sell = Math.min(a.qty, Math.abs(qtyDelta));
    a.qty -= sell;
    state.cash += sell * a.price;
  }
  refreshHUD();
  persist(state);
}

function onSelectAsset(sym) {
  state.selected = sym;
}

// --- Chart (minimal; safe no-op if canvas missing)
function drawChart(canvas, s) {
  if (!canvas || !canvas.getContext) return;
  // Ensure canvas has width; fall back to parent size if needed
  const parentW = canvas.parentElement ? canvas.parentElement.clientWidth : 0;
  const w = canvas.width = Math.max(300, canvas.clientWidth || parentW || 600);
  const h = canvas.height; // preserve the height attribute set in HTML (220)
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, w, h);

  const a = s.assets.find((x) => x.sym === s.selected) || s.assets[0];
  if (!a) return;

  // dashed prev close
  ctx.setLineDash([4, 3]);
  ctx.strokeStyle = 'gray';
  const yClose = h - (a.prevClose / (a.price * 1.25)) * h;
  ctx.beginPath();
  ctx.moveTo(0, yClose);
  ctx.lineTo(w, yClose);
  ctx.stroke();
  ctx.setLineDash([]);

  // current price marker
  ctx.beginPath();
  ctx.arc(w - 10, h - (a.price / (a.price * 1.25)) * h, 3, 0, Math.PI * 2);
  ctx.fillStyle = 'white';
  ctx.fill();
}

// --- Buttons & wiring
btnStart && btnStart.addEventListener('click', () => (tickTimer ? pauseDay() : startDay()));
btnSave && btnSave.addEventListener('click', () => persist(state));
btnHelp &&
  btnHelp.addEventListener('click', () =>
    alert('Buy low, sell high, sip coffee. Days are short; news hits after hours. Autosave at day end.')
  );
btnContrast &&
  btnContrast.addEventListener('click', () => {
    document.documentElement.classList.toggle('high-contrast');
  });
btnHardReset &&
  btnHardReset.addEventListener('click', () => {
    if (confirm('Hard reset and clear local save?')) {
      pauseDay();
      state = hardReset();
      lastNet = netWorth(state);
      refreshHUD();
      renderTable(state, onSelectAsset, onTrade);
    }
  });

// Table event delegation
bindTableHandlers(onSelectAsset, onTrade);

// First paint
refreshHUD();
renderTable(state, onSelectAsset, onTrade);
