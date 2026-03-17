const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

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

const pickTone = (value) => {
  if (value > 0.0001) return "good";
  if (value < -0.0001) return "bad";
  return "neutral";
};

function buildReason(asset) {
  if (!asset) {
    return { text: "Select an asset to inspect market context.", tone: "neutral" };
  }

  const changePct = Number(asset.changePct) || 0;
  const tone = pickTone(changePct);
  const magnitude = Math.abs(changePct);
  const direction = changePct > 0 ? "up" : changePct < 0 ? "down" : "flat";
  const base = magnitude < 0.001
    ? "Price held steady on the last tick."
    : `Price moved ${direction} ${magnitude.toFixed(2)}% on the last tick.`;

  const influences = Array.isArray(asset.lastTickMeta?.influences) ? asset.lastTickMeta.influences : [];
  let driver = "";
  if (influences.length) {
    const strongest = influences.reduce((best, current) => {
      const currentMagnitude = Math.abs(Number(current?.magnitude) || 0);
      const bestMagnitude = Math.abs(Number(best?.magnitude) || 0);
      return currentMagnitude > bestMagnitude ? current : best;
    }, influences[0]);

    if (strongest) {
      const label = strongest.label || strongest.typeLabel || "market flow";
      driver = ` Primary driver: <span class="detail-reason__driver">${escapeHtml(label)}</span>.`;
      if (strongest.description) driver += ` ${escapeHtml(strongest.description)}`;
    }
  }

  const flags = asset.lastTickMeta?.flags || {};
  const notes = [];
  if (flags.externalOverride) notes.push("External catalysts overrode local order flow.");
  if (flags.playerDominant) notes.push("Your recent flow is steering the tape.");
  if (flags.macroShock) notes.push("Macro turbulence is amplifying the move.");
  else if (flags.highVolRegime) notes.push("Volatility is running hot.");

  return {
    text: `${base}${driver}${notes.length ? ` ${notes.join(" ")}` : ""}`,
    tone
  };
}

function renderEffects(listEl, state, assetId) {
  if (!listEl) return;
  const events = Array.isArray(state?.events) ? state.events : [];
  const relevant = events.filter((event) => event && (event.targetId == null || event.targetId === assetId));

  if (relevant.length === 0) {
    listEl.innerHTML = '<li class="effect effect--empty">No active timed modifiers.</li>';
    return;
  }

  listEl.innerHTML = relevant
    .map((event) => {
      const tone = event.kind || "neutral";
      const expiryBits = [];
      if (event.expiresOnDay != null) expiryBits.push(`D${event.expiresOnDay}`);
      if (event.expiresAtTick != null) expiryBits.push(`T${event.expiresAtTick}`);
      const expiry = expiryBits.length ? expiryBits.join(" | ") : "-";

      const tags = [];
      if (event.effect?.volMult && event.effect.volMult !== 1) {
        tags.push(`<span class="tag tag--${event.effect.volMult > 1 ? "bad" : "good"}">Vol x${event.effect.volMult.toFixed(2)}</span>`);
      }
      if (event.effect?.driftShift) {
        tags.push(`<span class="tag tag--${event.effect.driftShift > 0 ? "good" : "bad"}">Drift ${event.effect.driftShift > 0 ? "+" : ""}${event.effect.driftShift.toFixed(3)}</span>`);
      }
      if (Number.isFinite(event.effect?.liquidityShift) && event.effect.liquidityShift !== 0) {
        tags.push(`<span class="tag tag--${event.effect.liquidityShift > 0 ? "good" : "bad"}">Liq ${event.effect.liquidityShift > 0 ? "+" : ""}${Math.abs(event.effect.liquidityShift).toFixed(2)}</span>`);
      }

      return `
        <li class="effect">
          <div class="effect__header">
            <span class="tag tag--${tone}">${escapeHtml(event.kind || "Effect")}</span>
            <strong>${escapeHtml(event.label || "Scenario")}</strong>
          </div>
          <div class="effect__meta">Expires ${escapeHtml(expiry)}</div>
          <div class="effect__tags">${tags.join(" ")}</div>
        </li>
      `;
    })
    .join("");
}

function renderDrivers(listEl, asset) {
  if (!listEl) return;
  const influences = Array.isArray(asset?.lastTickMeta?.influences) ? asset.lastTickMeta.influences : [];
  if (!asset?.lastTickMeta) {
    listEl.innerHTML = '<li class="effect effect--empty">No price drivers yet. Wait for the next tick.</li>';
    return;
  }
  if (influences.length === 0) {
    listEl.innerHTML = '<li class="effect effect--empty">No major forces moved this asset on the last update.</li>';
    return;
  }

  const extras = [];
  if (asset.lastTickMeta.flags?.externalOverride) extras.push("External shocks overrode your order flow.");
  if (asset.lastTickMeta.flags?.playerDominant) extras.push("Your flow is dominating liquidity.");
  if (asset.lastTickMeta.flags?.macroShock) extras.push("Macro turbulence is active.");

  listEl.innerHTML = [
    ...extras.map((text) => `<li class="effect"><div class="effect__meta">${escapeHtml(text)}</div></li>`),
    ...influences.map((influence) => {
      const label = influence.label || influence.typeLabel || "Influence";
      const magnitude = Number(influence.magnitude) || 0;
      const pct = magnitude * 100;
      const pctLabel = `${pct > 0 ? "+" : ""}${pct.toFixed(2)}%`;
      const pctTone = pickTone(magnitude);
      const vol = Number(influence.volMult) || 1;
      const volTag = Math.abs(vol - 1) > 0.05
        ? `<span class="tag tag--${vol > 1 ? "bad" : "good"}">Vol x${vol.toFixed(2)}</span>`
        : "";
      const description = influence.description ? `<div class="effect__meta">${escapeHtml(influence.description)}</div>` : "";
      return `
        <li class="effect">
          <div class="effect__header">
            <span class="tag tag--${escapeHtml(influence.type || "neutral")}">${escapeHtml(influence.typeLabel || influence.type || "Driver")}</span>
            <strong>${escapeHtml(label)}</strong>
          </div>
          ${description}
          <div class="effect__tags">
            <span class="tag tag--${pctTone}">${pctLabel}</span>
            ${volTag}
          </div>
        </li>
      `;
    })
  ].join("");
}

function drawChart(canvas, history) {
  if (!canvas?.getContext) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(320, Math.floor(canvas.clientWidth || canvas.width));
  const height = Math.max(220, Math.floor(canvas.clientHeight || canvas.height));
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const series = Array.isArray(history) ? history : [];
  if (series.length < 2) return;

  const min = Math.min(...series);
  const max = Math.max(...series);
  const pad = (max - min) * 0.08 || 1;
  const yMin = min - pad;
  const yMax = max + pad;

  ctx.strokeStyle = "rgba(97, 215, 255, 0.12)";
  ctx.lineWidth = 1;
  for (let index = 1; index <= 4; index += 1) {
    const y = (height / 5) * index;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "rgba(243, 185, 77, 0.95)");
  gradient.addColorStop(1, "rgba(97, 215, 255, 0.95)");

  ctx.beginPath();
  series.forEach((value, index) => {
    const x = (index / (series.length - 1)) * (width - 24) + 12;
    const y = height - ((value - yMin) / (yMax - yMin)) * (height - 24) - 12;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = gradient;
  ctx.lineWidth = 2.4;
  ctx.stroke();

  ctx.lineTo(width - 12, height - 12);
  ctx.lineTo(12, height - 12);
  ctx.closePath();
  const fill = ctx.createLinearGradient(0, 0, 0, height);
  fill.addColorStop(0, "rgba(97, 215, 255, 0.2)");
  fill.addColorStop(1, "rgba(97, 215, 255, 0)");
  ctx.fillStyle = fill;
  ctx.fill();
}

export function createAssetDetailController() {
  const root = document.querySelector('[data-module="asset-detail"]');
  if (!root) {
    return { render() {} };
  }

  const titleEl = root.querySelector('[data-element="detail-title"]');
  const assetEl = root.querySelector('[data-element="detail-asset"]');
  const priceEl = root.querySelector('[data-element="detail-price"]');
  const changeEl = root.querySelector('[data-element="detail-change"]');
  const positionEl = root.querySelector('[data-element="detail-position"]');
  const regimeEl = root.querySelector('[data-element="detail-regime"]');
  const volatilityEl = root.querySelector('[data-element="detail-volatility"]');
  const reasonEl = root.querySelector('[data-element="detail-reason"]');
  const effectsList = root.querySelector('[data-element="effects-list"]');
  const driversList = root.querySelector('[data-element="drivers-list"]');
  const chartCanvas = root.querySelector('[data-element="chart"]');

  return {
    render(state, asset) {
      if (!asset) {
        if (titleEl) titleEl.textContent = "Asset Detail";
        if (assetEl) assetEl.textContent = "-";
        if (priceEl) priceEl.textContent = "-";
        if (changeEl) changeEl.textContent = "-";
        if (positionEl) positionEl.textContent = "Select an asset to view holdings.";
        if (regimeEl) regimeEl.textContent = "-";
        if (volatilityEl) volatilityEl.textContent = "-";
        if (reasonEl) {
          reasonEl.textContent = "Select an asset to inspect market context.";
          reasonEl.dataset.tone = "neutral";
        }
        if (effectsList) effectsList.innerHTML = '<li class="effect effect--empty">No asset selected.</li>';
        if (driversList) driversList.innerHTML = '<li class="effect effect--empty">No asset selected.</li>';
        drawChart(chartCanvas, []);
        return;
      }

      const changePct = Number(asset.changePct) || 0;
      const changeTone = pickTone(changePct);
      const detailReason = buildReason(asset);
      const position = state?.positions?.[asset.id];
      const macro = asset.lastTickMeta?.diagnostics?.macro || {};
      const volatility = Number(asset.lastTickMeta?.volatility);

      if (titleEl) titleEl.textContent = `Asset Detail - ${asset.id}`;
      if (assetEl) assetEl.textContent = `${asset.id} | ${asset.name}`;
      if (priceEl) priceEl.textContent = formatPrice(asset.price);
      if (changeEl) {
        changeEl.textContent = `${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%`;
        changeEl.className = `pl--${changeTone}`;
      }

      if (positionEl) {
        if (!position || position.qty <= 0) {
          positionEl.textContent = "No active position.";
        } else {
          const unrealized = (asset.price - position.avgCost) * position.qty;
          const tone = pickTone(unrealized);
          positionEl.innerHTML = `${position.qty} @ ${formatPrice(position.avgCost)} | <span class="pl--${tone}">${formatMoney(unrealized)}</span>`;
        }
      }

      if (regimeEl) regimeEl.textContent = macro.label || "Balanced tape";
      if (volatilityEl) volatilityEl.textContent = Number.isFinite(volatility) ? `${(volatility * 100).toFixed(2)}%` : "-";
      if (reasonEl) {
        reasonEl.innerHTML = detailReason.text;
        reasonEl.dataset.tone = detailReason.tone;
      }

      renderEffects(effectsList, state, asset.id);
      renderDrivers(driversList, asset);
      drawChart(chartCanvas, asset.history);
    }
  };
}
