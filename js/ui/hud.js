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

export function createHudController({ onToggleRun, onEndDay, onReset, onOpenMeta } = {}) {
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

  const toggleBtn = root.querySelector('[data-action="toggle-run"]');
  const endBtn = root.querySelector('[data-action="end-day"]');
  const resetBtn = root.querySelector('[data-action="reset-run"]');
  const metaBtn = root.querySelector('[data-action="open-meta"]');

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

  return {
    render({ day = 1, cash = 0, equity = 0, totalPL = 0, unrealized = 0, running = false } = {}) {
      if (dayEl) dayEl.textContent = String(day);
      if (cashEl) cashEl.textContent = fmtMoney(cash);
      if (equityEl) equityEl.textContent = fmtMoney(equity);
      if (plEl) {
        const tone = toneForValue(totalPL);
        const unrl = fmtMoney(unrealized).replace("$", "");
        plEl.textContent = `${fmtMoney(totalPL)} (${totalPL >= 0 ? "+" : ""}${unrl} unrl)`;
        plEl.dataset.tone = tone;
      }
      if (toggleBtn) {
        toggleBtn.textContent = running ? "Pause" : "Start";
        toggleBtn.dataset.state = running ? "running" : "idle";
      }
    }
  };
}
