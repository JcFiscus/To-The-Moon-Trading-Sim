const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

const isFiniteNumber = (value) => Number.isFinite(value);

const formatMoney = (value) => {
  if (!isFiniteNumber(value)) return "—";
  const prefix = value < 0 ? "-$" : "$";
  return `${prefix}${Math.abs(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
};

const formatSignedMoney = (value) => {
  if (!isFiniteNumber(value)) return "—";
  const base = formatMoney(value);
  return value > 0 ? `+${base}` : base;
};

const formatPercent = (value) => {
  if (!isFiniteNumber(value)) return "—";
  return `${value.toFixed(2)}%`;
};

const formatSignedPercent = (value) => {
  if (!isFiniteNumber(value)) return "—";
  const base = formatPercent(value);
  return value > 0 ? `+${base}` : base;
};

const formatInteger = (value) => {
  if (!isFiniteNumber(value)) return "—";
  return Math.round(value).toLocaleString();
};

const normalizeKind = (kind) => {
  if (kind === "good" || kind === "bad" || kind === "warn") return kind;
  return "note";
};

const kindLabel = (kind) => {
  if (kind === "good") return "Positive";
  if (kind === "bad") return "Negative";
  if (kind === "warn") return "Warning";
  return "Note";
};

const getFocusable = (dialog) => {
  if (!dialog) return [];
  return Array.from(dialog.querySelectorAll(FOCUSABLE_SELECTOR)).filter((el) => {
    if (!(el instanceof HTMLElement)) return false;
    if (el.hasAttribute("disabled")) return false;
    if (el.getAttribute("aria-hidden") === "true") return false;
    return true;
  });
};

const renderMetrics = (container, summary) => {
  if (!container) return;
  container.innerHTML = "";
  if (!summary) {
    const placeholder = document.createElement("p");
    placeholder.className = "daily-briefing__placeholder";
    placeholder.textContent = "Awaiting telemetry…";
    container.appendChild(placeholder);
    return;
  }

  const metrics = [
    {
      label: "Net Worth",
      value: summary.endNetWorth,
      formatter: formatMoney,
      details: [
        { label: "Δ", value: summary.netChange, formatter: formatSignedMoney },
        { label: "Start", value: summary.startNetWorth, formatter: formatMoney }
      ]
    },
    {
      label: "Realized P&L",
      value: summary.realizedDelta,
      formatter: formatSignedMoney
    },
    {
      label: "Unrealized P&L",
      value: summary.unrealizedDelta,
      formatter: formatSignedMoney
    },
    {
      label: "Cash",
      value: summary.endCash,
      formatter: formatMoney,
      details: [{ label: "Start", value: summary.startCash, formatter: formatMoney }]
    },
    {
      label: "Portfolio Value",
      value: summary.endPortfolioValue,
      formatter: formatMoney,
      details: [
        { label: "Start", value: summary.startPortfolioValue, formatter: formatMoney }
      ]
    },
    {
      label: "Trades",
      value: summary.trades?.total,
      formatter: formatInteger,
      details: [
        { label: "Volume", value: summary.trades?.volume, formatter: formatInteger },
        { label: "Notional", value: summary.trades?.notional, formatter: formatMoney }
      ]
    }
  ];

  for (const metric of metrics) {
    const item = document.createElement("div");
    item.className = "daily-briefing__metric";

    const term = document.createElement("dt");
    term.textContent = metric.label;
    item.appendChild(term);

    const def = document.createElement("dd");
    const primary = document.createElement("strong");
    primary.textContent = metric.formatter(metric.value);
    def.appendChild(primary);

    const details = Array.isArray(metric.details) ? metric.details : [];
    for (const detail of details) {
      if (!detail || !isFiniteNumber(detail.value)) continue;
      const span = document.createElement("span");
      span.className = "daily-briefing__metric-detail";
      span.textContent = `${detail.label} ${detail.formatter(detail.value)}`;
      def.appendChild(span);
    }

    item.appendChild(def);
    container.appendChild(item);
  }
};

const renderAsset = (container, asset, { label, fallback }) => {
  if (!container) return;
  container.innerHTML = "";

  const title = document.createElement("h4");
  title.textContent = label;
  container.appendChild(title);

  if (!asset) {
    const placeholder = document.createElement("p");
    placeholder.className = "daily-briefing__placeholder";
    placeholder.textContent = fallback;
    container.appendChild(placeholder);
    return;
  }

  const name = document.createElement("div");
  name.className = "daily-briefing__asset-name";
  const idPart = asset.id ? `${asset.id}` : "";
  const namePart = asset.name ? ` — ${asset.name}` : "";
  name.textContent = `${idPart}${namePart}`;
  container.appendChild(name);

  const change = document.createElement("div");
  change.className = "daily-briefing__asset-change";
  const valueChangeText = formatSignedMoney(asset.valueChange);
  const pctChangeText = formatSignedPercent(asset.priceChangePct);
  change.textContent = `${valueChangeText} (${pctChangeText})`;
  container.appendChild(change);

  const position = document.createElement("div");
  position.className = "daily-briefing__asset-position";
  position.textContent = `Position ${formatInteger(asset.startQty)} → ${formatInteger(asset.endQty)}`;
  container.appendChild(position);

  if (isFiniteNumber(asset.lastTradePrice)) {
    const last = document.createElement("div");
    last.className = "daily-briefing__asset-last";
    const side = asset.lastTradeSide ? asset.lastTradeSide.toUpperCase() : "TRADE";
    last.textContent = `${side} ${formatMoney(asset.lastTradePrice)}`;
    container.appendChild(last);
  }
};

const renderEvents = (container, events) => {
  if (!container) return;
  container.innerHTML = "";

  const items = Array.isArray(events) ? events.slice(0, 6) : [];
  if (!items.length) {
    const placeholder = document.createElement("li");
    placeholder.className = "daily-briefing__placeholder";
    placeholder.textContent = "No notable signals logged.";
    container.appendChild(placeholder);
    return;
  }

  for (const entry of items) {
    const item = document.createElement("li");
    const tone = normalizeKind(entry?.kind);

    const head = document.createElement("div");
    head.className = "daily-briefing__event-head";

    const badge = document.createElement("span");
    badge.className = `daily-briefing__event-kind daily-briefing__event-kind--${tone}`;
    badge.textContent = kindLabel(tone);
    head.appendChild(badge);

    item.appendChild(head);

    const text = document.createElement("div");
    text.className = "daily-briefing__event-text";
    text.textContent = entry?.text || "No description provided.";
    item.appendChild(text);

    const metaBits = [];
    if (entry?.time) {
      const time = document.createElement("span");
      time.className = "daily-briefing__event-time";
      time.textContent = entry.time;
      metaBits.push(time);
    }
    if (entry?.targetId) {
      const target = document.createElement("span");
      target.className = "daily-briefing__event-target";
      target.textContent = `Target ${entry.targetId}`;
      metaBits.push(target);
    }

    if (metaBits.length) {
      const meta = document.createElement("div");
      meta.className = "daily-briefing__event-meta";
      for (const bit of metaBits) meta.appendChild(bit);
      item.appendChild(meta);
    }

    container.appendChild(item);
  }
};

export function createDailySummaryController(options = {}) {
  const root = document.getElementById("daily-briefing");
  if (!root) {
    return {
      show() {},
      hide() {}
    };
  }

  const dialog = root.querySelector(".daily-briefing__dialog");
  const titleEl = root.querySelector('[data-field="title"]');
  const ledeEl = root.querySelector('[data-field="lede"]');
  const metricsRegion = root.querySelector('[data-region="metrics"]');
  const bestRegion = root.querySelector('[data-region="best"]');
  const worstRegion = root.querySelector('[data-region="worst"]');
  const eventsRegion = root.querySelector('[data-region="events"]');
  const closeButtons = root.querySelectorAll('[data-action="briefing-dismiss"]');
  const nextButton = root.querySelector('[data-action="briefing-next"]');

  const defaults = {
    onDismiss: typeof options.onDismiss === "function" ? options.onDismiss : null,
    onLaunchNextDay: typeof options.onLaunchNextDay === "function" ? options.onLaunchNextDay : null
  };
  let callbacks = { ...defaults };
  let visible = false;
  let lastFocus = null;

  const setCallbacks = (extra = {}) => {
    callbacks = {
      onDismiss: typeof extra.onDismiss === "function" ? extra.onDismiss : defaults.onDismiss,
      onLaunchNextDay:
        typeof extra.onLaunchNextDay === "function" ? extra.onLaunchNextDay : defaults.onLaunchNextDay
    };
  };

  const focusFirstElement = () => {
    const focusable = getFocusable(dialog);
    const target = focusable.find((el) => !el.hasAttribute("data-skip-focus")) || focusable[0] || dialog;
    if (target && typeof target.focus === "function") {
      target.focus({ preventScroll: true });
    }
  };

  const handleClose = (reason) => {
    if (!visible) return;
    hide();
    const handler =
      reason === "next"
        ? callbacks.onLaunchNextDay || callbacks.onDismiss
        : callbacks.onDismiss || callbacks.onLaunchNextDay;
    if (typeof handler === "function") {
      handler(reason);
    }
  };

  const handleKeydown = (event) => {
    if (!visible) return;
    if (event.key === "Tab") {
      const focusable = getFocusable(dialog);
      if (!focusable.length) {
        event.preventDefault();
        return;
      }
      const currentIndex = focusable.indexOf(document.activeElement);
      if (event.shiftKey) {
        if (currentIndex <= 0) {
          event.preventDefault();
          focusable[focusable.length - 1].focus();
        }
      } else if (currentIndex === focusable.length - 1) {
        event.preventDefault();
        focusable[0].focus();
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      handleClose("dismiss");
    }
  };

  const render = (summary) => {
    const payload = summary && typeof summary === "object" ? summary : null;
    if (titleEl) {
      const dayLabel = isFiniteNumber(payload?.day) ? `Day ${payload.day} Briefing` : "Daily Briefing";
      titleEl.textContent = dayLabel;
    }
    if (ledeEl) {
      if (!payload) {
        ledeEl.textContent = "Daily telemetry will appear here once the market closes.";
      } else {
        const netChange = isFiniteNumber(payload.netChange) ? payload.netChange : null;
        const direction =
          netChange == null ? "settled" : netChange > 0 ? "climbed" : netChange < 0 ? "slid" : "held steady";
        const netDeltaText = formatSignedMoney(payload.netChange);
        const endNet = formatMoney(payload.endNetWorth);
        const realized = formatSignedMoney(payload.realizedDelta);
        const unrealized = formatSignedMoney(payload.unrealizedDelta);
        const deltaSuffix = netDeltaText !== "—" ? ` (${netDeltaText})` : "";
        ledeEl.textContent = `Net worth ${direction} to ${endNet}${deltaSuffix}. Realized ${realized}, unrealized ${unrealized}.`;
      }
    }

    renderMetrics(metricsRegion, payload);
    renderAsset(bestRegion, payload?.bestAsset ?? null, {
      label: "Top Performer",
      fallback: "No standout asset logged."
    });
    renderAsset(worstRegion, payload?.worstAsset ?? null, {
      label: "Lagging Asset",
      fallback: "No losses worth noting."
    });
    renderEvents(eventsRegion, payload?.notableEvents ?? []);
  };

  const show = (summary, extraCallbacks = {}) => {
    setCallbacks(extraCallbacks);
    render(summary);
    visible = true;
    lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    root.classList.add("is-open");
    root.setAttribute("aria-hidden", "false");
    document.body.classList.add("has-daily-briefing");
    requestAnimationFrame(() => {
      focusFirstElement();
    });
  };

  const hide = () => {
    if (!visible) return;
    visible = false;
    root.classList.remove("is-open");
    root.setAttribute("aria-hidden", "true");
    document.body.classList.remove("has-daily-briefing");
    if (lastFocus && typeof lastFocus.focus === "function") {
      lastFocus.focus({ preventScroll: true });
    }
  };

  closeButtons.forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      handleClose("dismiss");
    });
  });

  if (nextButton) {
    nextButton.addEventListener("click", (event) => {
      event.preventDefault();
      handleClose("next");
    });
  }

  root.addEventListener("keydown", handleKeydown);

  return {
    show,
    hide,
    isOpen: () => visible
  };
}
