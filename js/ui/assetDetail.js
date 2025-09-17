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
  const base =
    magnitude < 0.001
      ? "Price steady on the last tick."
      : `Price ${direction} ${magnitude.toFixed(2)}% on the last tick.`;

  const meta = asset.lastTickMeta || {};
  const influences = Array.isArray(meta.influences) ? meta.influences : [];
  const flags = meta.flags || {};

  let driver = "";
  if (influences.length) {
    const strongest = influences.reduce((best, current) => {
      const currentMag = Math.abs(Number(current?.magnitude) || 0);
      const bestMag = Math.abs(Number(best?.magnitude) || 0);
      return currentMag > bestMag ? current : best;
    }, influences[0]);

    if (strongest) {
      const driverLabel = strongest.label || strongest.typeLabel || "market flow";
      const driverTone = pickTone(strongest.magnitude || 0);
      driver = ` Primary driver: <span class="detail-reason__driver detail-reason__driver--${driverTone}">${escapeHtml(
        driverLabel
      )}</span>.`;
      if (strongest.description) {
        driver += ` ${escapeHtml(strongest.description)}`;
      }
    }
  }

  const flagMessages = [];
  if (flags.externalOverride) {
    flagMessages.push("External shock overrode local order flow.");
  }
  if (flags.playerDominant) {
    flagMessages.push("Your trading flow dominated liquidity.");
  }
  if (flags.macroShock) {
    flagMessages.push("Macro turbulence amplified the move.");
  } else if (flags.highVolRegime) {
    flagMessages.push("Elevated volatility regime in effect.");
  }

  const suffix = flagMessages.length ? ` ${flagMessages.join(" ")}` : "";

  return { text: `${base}${driver}${suffix}`, tone };
}

function renderEffects(listEl, state, assetId) {
  if (!listEl) return;
  const events = Array.isArray(state?.events) ? state.events : [];
  const relevant = events.filter((event) => event && (event.targetId == null || event.targetId === assetId));

  if (relevant.length === 0) {
    listEl.innerHTML = '<li class="effect effect--empty">No active timed modifiers.</li>';
    return;
  }

  const rows = relevant
    .map((event) => {
      const tone = event.kind || "neutral";
      const expiryBits = [];
      if (event.expiresOnDay != null) expiryBits.push(`D${event.expiresOnDay}`);
      if (event.expiresAtTick != null) expiryBits.push(`T${event.expiresAtTick}`);
      const expiry = expiryBits.length ? expiryBits.join(" · ") : "—";

      const tags = [];
      if (event.effect?.volMult && event.effect.volMult !== 1) {
        const cls = event.effect.volMult > 1 ? "bad" : "good";
        tags.push(`<span class="tag tag--${cls}">Vol ×${event.effect.volMult.toFixed(2)}</span>`);
      }
      if (event.effect?.driftShift) {
        const cls = event.effect.driftShift > 0 ? "good" : "bad";
        tags.push(`<span class="tag tag--${cls}">Drift ${event.effect.driftShift > 0 ? "+" : ""}${event.effect.driftShift.toFixed(3)}</span>`);
      }
      if (Number.isFinite(event.effect?.liquidityShift) && event.effect.liquidityShift !== 0) {
        const cls = event.effect.liquidityShift > 0 ? "good" : "bad";
        tags.push(`<span class="tag tag--${cls}">Liq ${event.effect.liquidityShift > 0 ? "+" : ""}${Math.abs(event.effect.liquidityShift).toFixed(2)}</span>`);
      }
      if (Number.isFinite(event.effect?.riskShift) && event.effect.riskShift !== 0) {
        const cls = event.effect.riskShift > 0 ? "bad" : "good";
        tags.push(`<span class="tag tag--${cls}">Risk ${event.effect.riskShift > 0 ? "+" : ""}${Math.abs(event.effect.riskShift).toFixed(2)}</span>`);
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

  listEl.innerHTML = rows;
}

function renderDrivers(listEl, asset) {
  if (!listEl) return;
  const meta = asset?.lastTickMeta;
  if (!meta) {
    listEl.innerHTML = '<li class="effect effect--empty">No price drivers yet — wait for the next tick.</li>';
    return;
  }

  const influences = Array.isArray(meta.influences) ? meta.influences : [];
  if (influences.length === 0) {
    listEl.innerHTML = '<li class="effect effect--empty">No major forces moved this asset on the last update.</li>';
    return;
  }

  const extras = [];
  if (meta.flags?.externalOverride) {
    extras.push('<li class="effect"><div class="effect__meta">External shocks overrode your order flow.</div></li>');
  }
  if (meta.flags?.playerDominant) {
    extras.push('<li class="effect"><div class="effect__meta">Your trading flow is steering the price.</div></li>');
  }
  if (meta.flags?.macroShock) {
    extras.push('<li class="effect"><div class="effect__meta">Macro turbulence is amplifying the move.</div></li>');
  } else if (meta.flags?.highVolRegime) {
    extras.push('<li class="effect"><div class="effect__meta">Volatility is running hotter than usual.</div></li>');
  }

  const rows = influences
    .map((influence) => {
      const label = influence.label || influence.typeLabel || "Influence";
      const typeClass = influence.type ? `tag--${influence.type}` : "tag--neutral";
      const magnitude = Number(influence.magnitude) || 0;
      const pct = magnitude * 100;
      const pctLabel = Math.abs(pct) < 0.001 ? "≈0.00%" : `${pct > 0 ? "+" : ""}${pct.toFixed(2)}%`;
      const pctTone = pickTone(magnitude);
      const vol = Number(influence.volMult) || 1;
      const showVol = Math.abs(vol - 1) > 0.05;
      const volTag = showVol ? `<span class="tag ${vol > 1 ? "tag--bad" : "tag--good"}">Vol ×${vol.toFixed(2)}</span>` : "";
      const description = influence.description ? `<div class="effect__meta">${escapeHtml(influence.description)}</div>` : "";

      return `
        <li class="effect">
          <div class="effect__header">
            <span class="tag ${typeClass}">${escapeHtml(influence.typeLabel || influence.type || "Driver")}</span>
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
    .join("");

  listEl.innerHTML = [...extras, rows].join("");
}

function drawChart(canvas, history) {
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const series = Array.isArray(history) ? history : [];
  if (series.length < 2) {
    return;
  }

  const width = canvas.width;
  const height = canvas.height;
  ctx.fillStyle = "#0d1427";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#1f2a47";
  ctx.strokeRect(0, 0, width, height);

  const min = Math.min(...series);
  const max = Math.max(...series);
  const pad = (max - min) * 0.08 || 1;
  const yMin = min - pad;
  const yMax = max + pad;

  ctx.beginPath();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#8b5cf6";
  series.forEach((value, index) => {
    const x = (index / (series.length - 1)) * (width - 12) + 6;
    const y = height - ((value - yMin) / (yMax - yMin)) * (height - 12) - 6;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

export function createAssetDetailController() {
  const root = document.querySelector('[data-module="asset-detail"]');
  if (!root) {
    return {
      render() {}
    };
  }

  const titleEl = root.querySelector('[data-element="detail-title"]');
  const assetEl = root.querySelector('[data-element="detail-asset"]');
  const priceEl = root.querySelector('[data-element="detail-price"]');
  const positionEl = root.querySelector('[data-element="detail-position"]');
  const reasonEl = root.querySelector('[data-element="detail-reason"]');
  const effectsList = root.querySelector('[data-element="effects-list"]');
  const driversList = root.querySelector('[data-element="drivers-list"]');
  const chartCanvas = root.querySelector('[data-element="chart"]');

  return {
    render(state, asset) {
      if (!asset) {
        if (titleEl) titleEl.textContent = "Asset Details";
        if (assetEl) assetEl.textContent = "—";
        if (priceEl) priceEl.textContent = "—";
        if (positionEl) positionEl.textContent = "Select an asset to view holdings.";
        if (reasonEl) {
          reasonEl.textContent = "Select an asset to inspect market context.";
          reasonEl.dataset.tone = "neutral";
        }
        if (effectsList) effectsList.innerHTML = '<li class="effect effect--empty">No asset selected.</li>';
        if (driversList) driversList.innerHTML = '<li class="effect effect--empty">No asset selected.</li>';
        if (chartCanvas) drawChart(chartCanvas, []);
        return;
      }

      if (titleEl) titleEl.textContent = `Details — ${asset.id}`;
      if (assetEl) assetEl.textContent = `${asset.id} · ${asset.name}`;
      if (priceEl) priceEl.textContent = formatPrice(asset.price);

      if (positionEl) {
        const position = state?.positions?.[asset.id];
        if (!position || position.qty <= 0) {
          positionEl.textContent = "No active position.";
        } else {
          const unrl = (asset.price - position.avgCost) * position.qty;
          const tone = pickTone(unrl);
          positionEl.innerHTML = `${position.qty} @ ${formatPrice(position.avgCost)} — <span class="pl--${tone}">${formatMoney(unrl)}</span>`;
        }
      }

      if (reasonEl) {
        const reason = buildReason(asset);
        reasonEl.innerHTML = reason.text;
        reasonEl.dataset.tone = reason.tone;
      }

      renderEffects(effectsList, state, asset.id);
      renderDrivers(driversList, asset);
      drawChart(chartCanvas, asset.history);
    }
  };
}
