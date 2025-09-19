const fmtMoney = (value) => {
  const absolute = Math.abs(Number(value) || 0);
  return `${value < 0 ? "-" : ""}$${absolute.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
};

function toneForValue(value) {
  if (value > 0.0001) return "good";
  if (value < -0.0001) return "bad";
  return "neutral";
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function toneForExposure(percent) {
  if (!Number.isFinite(percent)) return "neutral";
  if (percent >= 130) return "bad";
  if (percent >= 95) return "warn";
  if (percent >= 60) return "good";
  return "neutral";
}

export function createHudController({ onToggleRun, onEndDay, onReset, onOpenMeta, onToggleAutoDay } = {}) {
  const root = document.querySelector('[data-module="hud"]');
  if (!root) {
    return {
      render() {}
    };
  }

  const dayEl = root.querySelector('[data-field="day"]');
  const cashEl = root.querySelector('[data-field="cash"]');
  const equityEl = root.querySelector('[data-field="equity"]');
  const plEl = root.querySelector('[data-field="pl"]');
  const dayTimerEl =
    root.querySelector('[data-field="day-timer"]') ||
    document.querySelector('[data-field="day-timer"]');
  const dayTimerBarEl = dayTimerEl?.querySelector('[data-element="timer-bar"]');
  const dayTimerProgressEl = dayTimerEl?.querySelector('[data-element="timer-progress"]');
  const dayTimerLabelEl = dayTimerEl?.querySelector('[data-element="timer-label"]');
  const autoToggle = root.querySelector('[data-action="toggle-auto-day"]');
  const autoStatus = root.querySelector('[data-field="auto-day-status"]');
  const exposureEl = root.querySelector('[data-field="exposure"]');
  const marketStatusChip = root.querySelector('[data-element="market-status"]');
  const marketStatusText = marketStatusChip?.querySelector('[data-element="market-status-text"]') || marketStatusChip;
  const cycleStatusChip = root.querySelector('[data-element="cycle-status"]');

  const toggleBtn = root.querySelector('[data-action="toggle-run"]');
  const endBtn = root.querySelector('[data-action="end-day"]');
  const resetBtn = root.querySelector('[data-action="reset-run"]');
  const metaBtn = root.querySelector('[data-action="open-meta"]');

  const updateAutoStatus = (isAuto) => {
    const label = isAuto ? "Auto start" : "Manual start";
    if (autoStatus) {
      autoStatus.textContent = label;
    }
    if (cycleStatusChip) {
      const cycleLabel = isAuto ? "Auto launch ready" : "Manual launch";
      cycleStatusChip.textContent = cycleLabel;
      cycleStatusChip.dataset.mode = isAuto ? "auto" : "manual";
      cycleStatusChip.setAttribute("aria-label", cycleLabel);
      cycleStatusChip.setAttribute("title", cycleLabel);
    }
  };

  if (toggleBtn && typeof onToggleRun === "function") {
    toggleBtn.addEventListener("click", () => onToggleRun());
  }
  if (endBtn && typeof onEndDay === "function") {
    endBtn.addEventListener("click", () => onEndDay());
  }
  if (resetBtn && typeof onReset === "function") {
    resetBtn.addEventListener("click", () => onReset());
  }
  if (metaBtn && typeof onOpenMeta === "function") {
    metaBtn.addEventListener("click", () => onOpenMeta());
  }
  if (autoToggle && typeof onToggleAutoDay === "function") {
    autoToggle.addEventListener("change", () => {
      const next = !!autoToggle.checked;
      updateAutoStatus(next);
      onToggleAutoDay(next);
    });
  }

  return {
    render({
      day = 1,
      cash = 0,
      equity = 0,
      totalPL = 0,
      unrealized = 0,
      exposure = 0,
      running = false,
      dayRemainingMs = null,
      dayDurationMs = null,
      autoStartNextDay = false
    } = {}) {
      if (dayEl) dayEl.textContent = String(day);
      if (cashEl) cashEl.textContent = fmtMoney(cash);
      if (equityEl) equityEl.textContent = fmtMoney(equity);
      if (plEl) {
        const tone = toneForValue(totalPL);
        const unrl = fmtMoney(unrealized).replace("$", "");
        plEl.textContent = `${fmtMoney(totalPL)} (${totalPL >= 0 ? "+" : ""}${unrl} unrl)`;
        if (tone === "neutral") {
          delete plEl.dataset.tone;
        } else {
          plEl.dataset.tone = tone;
        }
      }
      if (exposureEl) {
        const ratio = Number.isFinite(exposure) ? exposure : 0;
        const percent = clamp(ratio * 100, 0, 999);
        const decimals = percent >= 100 ? 0 : 1;
        exposureEl.textContent = `${percent.toFixed(decimals)}%`;
        const exposureTone = toneForExposure(percent);
        if (exposureTone === "neutral") {
          delete exposureEl.dataset.tone;
        } else {
          exposureEl.dataset.tone = exposureTone;
        }
      }
      if (toggleBtn) {
        toggleBtn.textContent = running ? "Pause" : "Start";
        toggleBtn.dataset.state = running ? "running" : "idle";
      }
      let isClosing = false;
      if (dayTimerEl) {
        const baseDuration = Number.isFinite(dayDurationMs) && dayDurationMs > 0 ? dayDurationMs : Number(dayTimerEl.dataset.duration) || 10000;
        const remaining = Number.isFinite(dayRemainingMs) ? Math.max(0, dayRemainingMs) : baseDuration;
        const safeDuration = baseDuration > 0 ? baseDuration : remaining || 1;
        const ratio = safeDuration > 0 ? remaining / safeDuration : 0;
        const percent = Math.max(0, Math.min(100, ratio * 100));
        const seconds = remaining / 1000;
        const decimals = seconds < 10 ? 1 : 0;
        isClosing = running && remaining <= 50;

        dayTimerEl.dataset.duration = String(safeDuration);
        dayTimerEl.dataset.state = running ? (isClosing ? "closing" : "running") : "paused";
        if (dayTimerProgressEl) {
          dayTimerProgressEl.style.width = `${percent}%`;
        }
        if (dayTimerBarEl) {
          dayTimerBarEl.setAttribute("aria-valuenow", String(Math.round(percent)));
          const ariaText = !running
            ? "Market paused"
            : isClosing
              ? "Market closing"
              : `${seconds.toFixed(decimals)} seconds remaining`;
          dayTimerBarEl.setAttribute("aria-valuetext", ariaText);
        }
        if (dayTimerLabelEl) {
          if (!running) {
            dayTimerLabelEl.textContent = "Paused";
          } else if (isClosing) {
            dayTimerLabelEl.textContent = "Market closing…";
          } else {
            dayTimerLabelEl.textContent = `${seconds.toFixed(decimals)}s remaining`;
          }
        }
      }
      if (marketStatusChip) {
        const state = running ? (isClosing ? "closing" : "live") : "idle";
        const statusLabel = !running
          ? "Systems idle"
          : isClosing
            ? "Market closing window"
            : "Market live";
        marketStatusChip.dataset.state = state;
        marketStatusChip.setAttribute("aria-label", statusLabel);
        marketStatusChip.setAttribute("title", statusLabel);
        if (marketStatusText) {
          marketStatusText.textContent = statusLabel;
        }
      }
      if (autoToggle) {
        autoToggle.checked = !!autoStartNextDay;
      }
      updateAutoStatus(!!autoStartNextDay);
    }
  };
}
