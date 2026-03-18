const RANGE_PRESETS = {
  micro: { label: "5T", points: 12 },
  open: { label: "20T", points: 40 },
  day: { label: "Day", points: 96 },
  run: { label: "Run", points: 240 }
};

const formatMoney = (value) => {
  const numeric = Number(value) || 0;
  const absolute = Math.abs(numeric);
  return `${numeric < 0 ? "-" : ""}$${absolute.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
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

const formatSignedPercent = (value) => `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const toneForValue = (value) => {
  if (value > 0.0001) return "good";
  if (value < -0.0001) return "bad";
  return "neutral";
};

function getSeries(history, rangeId) {
  const preset = RANGE_PRESETS[rangeId] || RANGE_PRESETS.day;
  const source = Array.isArray(history) ? history.filter((value) => Number.isFinite(value)) : [];
  if (!source.length) return [];
  return source.slice(-preset.points);
}

function summarizeSeries(series) {
  if (!Array.isArray(series) || series.length === 0) {
    return {
      min: 0,
      max: 0,
      first: 0,
      last: 0
    };
  }

  return {
    min: Math.min(...series),
    max: Math.max(...series),
    first: Number(series[0]) || 0,
    last: Number(series[series.length - 1]) || 0
  };
}

function buildReason(asset) {
  if (!asset) {
    return { text: "Select an asset to inspect the market.", tone: "neutral" };
  }

  const changePct = Number(asset.changePct) || 0;
  const tone = toneForValue(changePct);
  const direction = changePct > 0 ? "up" : changePct < 0 ? "down" : "flat";
  const magnitude = Math.abs(changePct);
  const base = magnitude < 0.01
    ? "The last tick was mostly flat."
    : `The last tick pushed ${direction} ${magnitude.toFixed(2)}%.`;

  const influences = Array.isArray(asset.lastTickMeta?.influences) ? asset.lastTickMeta.influences : [];
  if (!influences.length) {
    return { text: `${base} No major driver has separated from noise yet.`, tone };
  }

  const strongest = influences.reduce((best, current) => {
    const currentMagnitude = Math.abs(Number(current?.magnitude) || 0);
    const bestMagnitude = Math.abs(Number(best?.magnitude) || 0);
    return currentMagnitude > bestMagnitude ? current : best;
  }, influences[0]);

  const label = strongest?.label || strongest?.typeLabel || "market flow";
  const description = strongest?.description ? ` ${strongest.description}` : "";
  return {
    text: `${base} Main driver: ${label}.${description}`,
    tone
  };
}

function renderPills(container, items, emptyLabel) {
  if (!container) return;
  if (!Array.isArray(items) || items.length === 0) {
    container.innerHTML = `<span class="asset-pill asset-pill--neutral">${escapeHtml(emptyLabel)}</span>`;
    return;
  }

  container.innerHTML = items
    .map((item) => {
      const tone = item?.tone || "neutral";
      const label = item?.label || item?.text || "Signal";
      return `<span class="asset-pill asset-pill--${escapeHtml(tone)}">${escapeHtml(label)}</span>`;
    })
    .join("");
}

function buildEffectPills(state, assetId) {
  const events = Array.isArray(state?.events) ? state.events : [];
  return events
    .filter((event) => event && (event.targetId == null || event.targetId === assetId))
    .slice(0, 4)
    .map((event) => ({
      label: event.label || event.kind || "Effect",
      tone: event.kind || "neutral"
    }));
}

function buildDriverPills(asset) {
  const influences = Array.isArray(asset?.lastTickMeta?.influences) ? asset.lastTickMeta.influences : [];
  if (!influences.length) return [];

  return influences
    .slice()
    .sort((left, right) => Math.abs(Number(right?.magnitude) || 0) - Math.abs(Number(left?.magnitude) || 0))
    .slice(0, 4)
    .map((influence) => ({
      label: influence.label || influence.typeLabel || influence.type || "Driver",
      tone: toneForValue(Number(influence?.magnitude) || 0)
    }));
}

function drawChart(canvas, series) {
  if (!canvas?.getContext) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(320, Math.floor(canvas.clientWidth || canvas.width));
  const height = Math.max(280, Math.floor(canvas.clientHeight || canvas.height));
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const values = Array.isArray(series) ? series.filter((value) => Number.isFinite(value)) : [];
  if (values.length < 2) {
    ctx.fillStyle = "rgba(144, 164, 196, 0.7)";
    ctx.font = '14px "Segoe UI Variable Text", "Segoe UI", sans-serif';
    ctx.fillText("No chart data yet", 16, 28);
    return;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min) * 0.08 || Math.max(0.5, Math.abs(max) * 0.02);
  const yMin = min - pad;
  const yMax = max + pad;
  const plotLeft = 14;
  const plotRight = width - 14;
  const plotTop = 16;
  const plotBottom = height - 16;
  const lineTone = values[values.length - 1] >= values[0] ? "good" : "bad";

  ctx.strokeStyle = "rgba(127, 216, 255, 0.1)";
  ctx.lineWidth = 1;
  for (let row = 0; row < 5; row += 1) {
    const y = plotTop + ((plotBottom - plotTop) / 4) * row;
    ctx.beginPath();
    ctx.moveTo(plotLeft, y);
    ctx.lineTo(plotRight, y);
    ctx.stroke();
  }
  for (let column = 0; column < 5; column += 1) {
    const x = plotLeft + ((plotRight - plotLeft) / 4) * column;
    ctx.beginPath();
    ctx.moveTo(x, plotTop);
    ctx.lineTo(x, plotBottom);
    ctx.stroke();
  }

  const baseline = values[0];
  const baselineY = plotBottom - ((baseline - yMin) / (yMax - yMin)) * (plotBottom - plotTop);
  ctx.strokeStyle = "rgba(242, 180, 79, 0.18)";
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(plotLeft, baselineY);
  ctx.lineTo(plotRight, baselineY);
  ctx.stroke();
  ctx.setLineDash([]);

  const stroke = ctx.createLinearGradient(plotLeft, plotTop, plotRight, plotBottom);
  if (lineTone === "good") {
    stroke.addColorStop(0, "rgba(58, 214, 159, 0.98)");
    stroke.addColorStop(1, "rgba(127, 216, 255, 0.98)");
  } else {
    stroke.addColorStop(0, "rgba(255, 191, 99, 0.98)");
    stroke.addColorStop(1, "rgba(255, 107, 129, 0.98)");
  }

  const fill = ctx.createLinearGradient(0, plotTop, 0, plotBottom);
  if (lineTone === "good") {
    fill.addColorStop(0, "rgba(58, 214, 159, 0.18)");
    fill.addColorStop(1, "rgba(58, 214, 159, 0)");
  } else {
    fill.addColorStop(0, "rgba(255, 107, 129, 0.16)");
    fill.addColorStop(1, "rgba(255, 107, 129, 0)");
  }

  ctx.beginPath();
  values.forEach((value, index) => {
    const x = plotLeft + (index / (values.length - 1)) * (plotRight - plotLeft);
    const y = plotBottom - ((value - yMin) / (yMax - yMin)) * (plotBottom - plotTop);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.lineTo(plotRight, plotBottom);
  ctx.lineTo(plotLeft, plotBottom);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();

  ctx.beginPath();
  values.forEach((value, index) => {
    const x = plotLeft + (index / (values.length - 1)) * (plotRight - plotLeft);
    const y = plotBottom - ((value - yMin) / (yMax - yMin)) * (plotBottom - plotTop);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2.8;
  ctx.stroke();

  const lastValue = values[values.length - 1];
  const lastX = plotRight;
  const lastY = plotBottom - ((lastValue - yMin) / (yMax - yMin)) * (plotBottom - plotTop);
  ctx.fillStyle = lineTone === "good" ? "rgba(58, 214, 159, 1)" : "rgba(255, 107, 129, 1)";
  ctx.beginPath();
  ctx.arc(lastX, lastY, 4, 0, Math.PI * 2);
  ctx.fill();
}

export function createAssetDetailController() {
  const root = document.querySelector('[data-module="asset-detail"]');
  if (!root) {
    return { render() {} };
  }

  const titleEl = root.querySelector('[data-element="detail-title"]');
  const windowEl = root.querySelector('[data-element="detail-window"]');
  const assetEl = root.querySelector('[data-element="detail-asset"]');
  const priceEl = root.querySelector('[data-element="detail-price"]');
  const changeEl = root.querySelector('[data-element="detail-change"]');
  const sessionEl = root.querySelector('[data-element="detail-session"]');
  const positionEl = root.querySelector('[data-element="detail-position"]');
  const rangeEl = root.querySelector('[data-element="detail-range"]');
  const regimeEl = root.querySelector('[data-element="detail-regime"]');
  const volatilityEl = root.querySelector('[data-element="detail-volatility"]');
  const reasonEl = root.querySelector('[data-element="detail-reason"]');
  const effectsList = root.querySelector('[data-element="effects-list"]');
  const driversList = root.querySelector('[data-element="drivers-list"]');
  const chartCanvas = root.querySelector('[data-element="chart"]');
  const rangeButtons = Array.from(root.querySelectorAll("[data-range-button]"));

  let activeRange = "day";
  let lastState = null;
  let lastAsset = null;

  const syncRangeButtons = () => {
    rangeButtons.forEach((button) => {
      const isActive = button.getAttribute("data-range-button") === activeRange;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-selected", isActive ? "true" : "false");
    });
  };

  rangeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const next = button.getAttribute("data-range-button");
      if (!next || next === activeRange) return;
      activeRange = next in RANGE_PRESETS ? next : "day";
      syncRangeButtons();
      if (lastState) {
        render(lastState, lastAsset);
      }
    });
  });

  function render(state, asset) {
    lastState = state || null;
    lastAsset = asset || null;
    syncRangeButtons();

    if (!asset) {
      if (titleEl) titleEl.textContent = "Price Chart";
      if (windowEl) windowEl.textContent = "Choose an asset to begin.";
      if (assetEl) assetEl.textContent = "-";
      if (priceEl) priceEl.textContent = "-";
      if (changeEl) changeEl.textContent = "-";
      if (sessionEl) sessionEl.textContent = "Session change -";
      if (positionEl) positionEl.textContent = "-";
      if (rangeEl) rangeEl.textContent = "-";
      if (regimeEl) regimeEl.textContent = "-";
      if (volatilityEl) volatilityEl.textContent = "-";
      if (reasonEl) {
        reasonEl.textContent = "Select an asset to inspect the market.";
        reasonEl.dataset.tone = "neutral";
      }
      renderPills(driversList, [], "No drivers yet");
      renderPills(effectsList, [], "No active effects");
      drawChart(chartCanvas, []);
      return;
    }

    const preset = RANGE_PRESETS[activeRange] || RANGE_PRESETS.day;
    const series = getSeries(asset.history, activeRange);
    const summary = summarizeSeries(series);
    const changePct = Number(asset.changePct) || 0;
    const tickTone = toneForValue(changePct);
    const sessionStats = state?.dailyStats?.assets?.[asset.id] || {};
    const sessionChangePct = Number(sessionStats.priceChangePct) || 0;
    const sessionTone = toneForValue(sessionChangePct);
    const position = state?.positions?.[asset.id];
    const macro = asset.lastTickMeta?.diagnostics?.macro || {};
    const volatility = Number(asset.lastTickMeta?.volatility);
    const detailReason = buildReason(asset);

    if (titleEl) titleEl.textContent = `${asset.id} Price Chart`;
    if (windowEl) windowEl.textContent = `${preset.label} range | ${series.length} ticks`;
    if (assetEl) assetEl.textContent = `${asset.id} | ${asset.name}`;
    if (priceEl) priceEl.textContent = formatPrice(asset.price);
    if (changeEl) {
      changeEl.textContent = `Last tick ${formatSignedPercent(changePct)}`;
      changeEl.className = `asset-hero__change pl--${tickTone}`;
    }
    if (sessionEl) {
      sessionEl.textContent = `Session ${formatSignedPercent(sessionChangePct)}`;
      sessionEl.className = `asset-hero__session pl--${sessionTone}`;
    }

    if (positionEl) {
      if (!position || position.qty <= 0) {
        positionEl.textContent = "Flat";
      } else {
        const pnl = (asset.price - position.avgCost) * position.qty;
        const pnlTone = toneForValue(pnl);
        positionEl.innerHTML = `${position.qty} @ ${formatPrice(position.avgCost)} | <span class="pl--${pnlTone}">${formatMoney(pnl)}</span>`;
      }
    }

    if (rangeEl) rangeEl.textContent = `${formatPrice(summary.min)} - ${formatPrice(summary.max)}`;
    if (regimeEl) regimeEl.textContent = macro.label || "Balanced tape";
    if (volatilityEl) volatilityEl.textContent = Number.isFinite(volatility) ? `${(volatility * 100).toFixed(2)}%` : "-";
    if (reasonEl) {
      reasonEl.textContent = detailReason.text;
      reasonEl.dataset.tone = detailReason.tone;
    }

    renderPills(driversList, buildDriverPills(asset), "No drivers yet");
    renderPills(effectsList, buildEffectPills(state, asset.id), "No active effects");
    drawChart(chartCanvas, series);
  }

  syncRangeButtons();

  return { render };
}
