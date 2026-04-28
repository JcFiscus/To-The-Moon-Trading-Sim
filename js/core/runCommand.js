const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const CHOICE_COUNT = 3;

export const RUN_MODULE_DEFS = [
  {
    id: "loss-control",
    name: "Loss Control Matrix",
    role: "Risk",
    maxLevel: 3,
    description: "Raises drawdown budget and refunds part of stop-loss exits.",
    effect(level) {
      return `Risk budget +${level * 2}% | stop refund ${8 + level * 4}%`;
    }
  },
  {
    id: "momentum-radar",
    name: "Momentum Radar",
    role: "Edge",
    maxLevel: 3,
    description: "Rewards entries into the current session leader with an execution rebate.",
    effect(level) {
      return `Leader entry rebate ${(0.12 + level * 0.08).toFixed(2)}%`;
    }
  },
  {
    id: "syndicate-desk",
    name: "Syndicate Desk",
    role: "Scale",
    maxLevel: 3,
    description: "Boosts contract payouts and reputation so larger trading flow compounds faster.",
    effect(level) {
      return `Contract cash +${level * 25}% | rep +${level}`;
    }
  },
  {
    id: "profit-flywheel",
    name: "Profit Flywheel",
    role: "Scale",
    maxLevel: 3,
    description: "Adds a sponsor bonus to profitable exits, capped per trade.",
    effect(level) {
      return `Profit exit bonus ${level * 4}%`;
    }
  },
  {
    id: "leverage-governor",
    name: "Leverage Governor",
    role: "Safety",
    maxLevel: 3,
    description: "Lets the desk carry more exposure before risk heat spikes.",
    effect(level) {
      return `Safe exposure +${level * 15}% | heat cooling ${level * 8}%`;
    }
  }
];

const MODULE_BY_ID = new Map(RUN_MODULE_DEFS.map((definition) => [definition.id, definition]));

function toFinite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function getStartingCash(state) {
  const configured = state?.run?.config?.startingCash;
  if (Number.isFinite(configured)) return Math.max(1000, configured);
  if (Number.isFinite(state?.cash)) return Math.max(1000, state.cash);
  return 10000;
}

function getNetWorth(state, metrics = {}) {
  if (Number.isFinite(metrics.equity)) return metrics.equity;
  const cash = toFinite(state?.cash, 0);
  const debt = toFinite(state?.margin?.debt, 0);
  const assets = Array.isArray(state?.assets) ? state.assets : [];
  const positions = state?.positions && typeof state.positions === "object" ? state.positions : {};
  const portfolioValue = assets.reduce((sum, asset) => {
    const position = positions[asset?.id];
    if (!position || !Number.isFinite(position.qty) || position.qty <= 0) return sum;
    return sum + position.qty * toFinite(asset?.price, 0);
  }, 0);
  return cash + portfolioValue - debt;
}

function getPortfolioValue(state, metrics = {}) {
  if (Number.isFinite(metrics.portfolioValue)) return metrics.portfolioValue;
  const assets = Array.isArray(state?.assets) ? state.assets : [];
  const positions = state?.positions && typeof state.positions === "object" ? state.positions : {};
  return assets.reduce((sum, asset) => {
    const position = positions[asset?.id];
    if (!position || !Number.isFinite(position.qty) || position.qty <= 0) return sum;
    return sum + position.qty * toFinite(asset?.price, 0);
  }, 0);
}

function normalizeModules(rawModules) {
  const modules = {};
  if (!rawModules || typeof rawModules !== "object") return modules;
  for (const [id, rawLevel] of Object.entries(rawModules)) {
    const definition = MODULE_BY_ID.get(id);
    if (!definition) continue;
    const level = Math.floor(toFinite(rawLevel, 0));
    if (level > 0) modules[id] = clamp(level, 1, definition.maxLevel);
  }
  return modules;
}

function normalizeChoices(rawChoices) {
  if (!Array.isArray(rawChoices)) return [];
  return rawChoices
    .filter((id) => typeof id === "string" && MODULE_BY_ID.has(id))
    .slice(0, CHOICE_COUNT);
}

export function createRunCommandState(state = {}) {
  const start = getStartingCash(state);
  return {
    stage: 1,
    targetNetWorth: Math.round(start * 1.25),
    peakEquity: start,
    drawdownPct: 0,
    heatPct: 0,
    riskBudgetPct: 12,
    safeExposurePct: 85,
    discipline: 0,
    stressStrikes: 0,
    choices: [],
    choiceReason: "",
    modules: {},
    milestones: [],
    lastMilestoneDay: 0
  };
}

export function normalizeRunCommandState(raw, state = {}) {
  const base = createRunCommandState(state);
  if (!raw || typeof raw !== "object") return base;

  const command = {
    ...base,
    stage: Math.max(1, Math.floor(toFinite(raw.stage, base.stage))),
    targetNetWorth: Math.max(1000, toFinite(raw.targetNetWorth, base.targetNetWorth)),
    peakEquity: Math.max(0, toFinite(raw.peakEquity, base.peakEquity)),
    drawdownPct: clamp(toFinite(raw.drawdownPct, 0), 0, 100),
    heatPct: clamp(toFinite(raw.heatPct, 0), 0, 999),
    riskBudgetPct: clamp(toFinite(raw.riskBudgetPct, base.riskBudgetPct), 1, 80),
    safeExposurePct: clamp(toFinite(raw.safeExposurePct, base.safeExposurePct), 10, 250),
    discipline: Math.max(0, Math.floor(toFinite(raw.discipline, 0))),
    stressStrikes: Math.max(0, Math.floor(toFinite(raw.stressStrikes, 0))),
    choices: normalizeChoices(raw.choices),
    choiceReason: typeof raw.choiceReason === "string" ? raw.choiceReason : "",
    modules: normalizeModules(raw.modules),
    milestones: Array.isArray(raw.milestones) ? raw.milestones.slice(-20).map((item) => ({ ...item })) : [],
    lastMilestoneDay: Math.max(0, Math.floor(toFinite(raw.lastMilestoneDay, 0)))
  };

  return command;
}

export function ensureRunCommandState(state) {
  if (!state || typeof state !== "object") return createRunCommandState();
  state.command = normalizeRunCommandState(state.command, state);
  return state.command;
}

export function getRunModuleLevel(state, id) {
  const command = ensureRunCommandState(state);
  return getModuleLevelFromCommand(command, id);
}

function getModuleLevelFromCommand(command, id) {
  return Math.max(0, Math.floor(command?.modules?.[id] || 0));
}

export function listRunModules(state) {
  const command = ensureRunCommandState(state);
  return RUN_MODULE_DEFS.map((definition) => {
    const level = Math.max(0, Math.floor(command.modules[definition.id] || 0));
    return {
      ...definition,
      level,
      maxed: level >= definition.maxLevel,
      preview: definition.effect(Math.min(definition.maxLevel, level + 1))
    };
  });
}

function openChoices(command, reason = "Command upgrade available") {
  const owned = command.modules || {};
  const pool = RUN_MODULE_DEFS
    .filter((definition) => (owned[definition.id] || 0) < definition.maxLevel)
    .map((definition) => definition.id);

  if (!pool.length) {
    command.choices = [];
    command.choiceReason = "";
    return [];
  }

  const seed = command.stage * 17 + command.discipline * 5 + command.stressStrikes * 11 + command.lastMilestoneDay;
  const ranked = pool
    .map((id, index) => ({
      id,
      score: Math.sin(seed + index * 13.37) + Math.cos(seed * 0.41 + index * 5.9)
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, CHOICE_COUNT)
    .map((entry) => entry.id);

  command.choices = ranked;
  command.choiceReason = reason;
  return ranked;
}

export function grantRunCommandChoice(state, reason) {
  const command = ensureRunCommandState(state);
  if (command.choices.length) return command.choices;
  return openChoices(command, reason);
}

export function chooseRunCommandModule(state, id) {
  const command = ensureRunCommandState(state);
  if (!command.choices.includes(id)) return { success: false, message: "Module is not in the current draft." };
  const definition = MODULE_BY_ID.get(id);
  if (!definition) return { success: false, message: "Unknown module." };
  const current = Math.max(0, Math.floor(command.modules[id] || 0));
  if (current >= definition.maxLevel) {
    command.choices = [];
    command.choiceReason = "";
    return { success: false, message: "Module is already at maximum level." };
  }

  command.modules[id] = current + 1;
  command.choices = [];
  command.choiceReason = "";
  return {
    success: true,
    id,
    name: definition.name,
    level: command.modules[id],
    effect: definition.effect(command.modules[id])
  };
}

export function computeRunCommandSnapshot(state, metrics = {}) {
  const command = ensureRunCommandState(state);
  const equity = Math.max(0, getNetWorth(state, metrics));
  const portfolioValue = Math.max(0, getPortfolioValue(state, metrics));
  const debt = toFinite(state?.margin?.debt, 0);
  const peakEquity = Math.max(command.peakEquity || 0, equity);
  const lossLevel = getModuleLevelFromCommand(command, "loss-control");
  const governorLevel = getModuleLevelFromCommand(command, "leverage-governor");
  const riskBudgetPct = 12 + lossLevel * 2;
  const safeExposurePct = 85 + governorLevel * 15;
  const drawdownPct = peakEquity > 0 ? ((peakEquity - equity) / peakEquity) * 100 : 0;
  const exposurePct = equity > 0 ? (portfolioValue / equity) * 100 : 0;
  const debtPct = equity > 0 ? (debt / equity) * 100 : 0;
  const positions = state?.positions && typeof state.positions === "object" ? state.positions : {};
  const plans = state?.tradePlans && typeof state.tradePlans === "object" ? state.tradePlans : {};
  const unplannedPositions = Object.entries(positions).filter(([id, position]) => {
    if (!position || !Number.isFinite(position.qty) || position.qty <= 0) return false;
    const plan = plans[id] || null;
    return !plan || !Number.isFinite(plan.stopLossPct) || plan.stopLossPct <= 0;
  }).length;
  const heatBeforeCooling =
    (riskBudgetPct > 0 ? (drawdownPct / riskBudgetPct) * 58 : 0) +
    Math.max(0, exposurePct - safeExposurePct) * 0.62 +
    Math.max(0, debtPct - 20) * 0.28 +
    unplannedPositions * 9;
  const heatPct = clamp(heatBeforeCooling - governorLevel * 8, 0, 999);
  const targetNetWorth = Math.max(1, command.targetNetWorth || getStartingCash(state) * 1.25);
  const progressPct = clamp((equity / targetNetWorth) * 100, 0, 999);

  return {
    equity,
    portfolioValue,
    debt,
    peakEquity,
    drawdownPct,
    exposurePct,
    debtPct,
    heatPct,
    riskBudgetPct,
    safeExposurePct,
    unplannedPositions,
    targetNetWorth,
    progressPct,
    stage: command.stage,
    discipline: command.discipline,
    stressStrikes: command.stressStrikes,
    choices: [...command.choices],
    choiceReason: command.choiceReason,
    modules: { ...command.modules }
  };
}

export function refreshRunCommandState(state, metrics = {}) {
  const snapshot = computeRunCommandSnapshot(state, metrics);
  const command = ensureRunCommandState(state);
  command.peakEquity = snapshot.peakEquity;
  command.drawdownPct = snapshot.drawdownPct;
  command.heatPct = snapshot.heatPct;
  command.riskBudgetPct = snapshot.riskBudgetPct;
  command.safeExposurePct = snapshot.safeExposurePct;
  if (snapshot.heatPct >= 95) command.stressStrikes += 1;
  else if (snapshot.heatPct < 55) command.stressStrikes = Math.max(0, command.stressStrikes - 1);
  return snapshot;
}

export function isRiskLocked(state, metrics = {}) {
  const snapshot = computeRunCommandSnapshot(state, metrics);
  return snapshot.heatPct >= 100;
}

export function recordRunCommandTrade(state, {
  side,
  notional = 0,
  realized = 0,
  exitType = "manual",
  stopLossPct = 0,
  takeProfitPct = 0,
  sessionLeader = false
} = {}) {
  const command = ensureRunCommandState(state);
  const messages = [];
  let cashBonus = 0;
  let realizedBonus = 0;

  if (side === "buy") {
    if (stopLossPct > 0) {
      command.discipline += takeProfitPct > 0 ? 2 : 1;
      messages.push("Risk plan armed. Discipline telemetry improved.");
    } else {
      command.heatPct = clamp((command.heatPct || 0) + 4, 0, 999);
    }

    const radarLevel = getModuleLevelFromCommand(command, "momentum-radar");
    if (radarLevel > 0 && sessionLeader && notional > 0) {
      const rate = 0.0012 + radarLevel * 0.0008;
      cashBonus = Math.min(notional * rate, 180 * radarLevel);
      messages.push(`Momentum Radar rebate +$${cashBonus.toFixed(2)}.`);
    }
  }

  if (side === "sell") {
    if (realized > 0) {
      const flywheelLevel = getModuleLevelFromCommand(command, "profit-flywheel");
      if (flywheelLevel > 0) {
        realizedBonus = Math.min(realized * (flywheelLevel * 0.04), 500 * flywheelLevel);
        cashBonus += realizedBonus;
        command.discipline += 1;
        messages.push(`Profit Flywheel sponsor bonus +$${realizedBonus.toFixed(2)}.`);
      }
    } else if (realized < 0 && exitType === "stop") {
      const lossLevel = getModuleLevelFromCommand(command, "loss-control");
      if (lossLevel > 0) {
        const refundRate = 0.08 + lossLevel * 0.04;
        realizedBonus = Math.min(Math.abs(realized) * refundRate, 600 * lossLevel);
        cashBonus += realizedBonus;
        command.discipline += 2;
        messages.push(`Loss Control refund +$${realizedBonus.toFixed(2)}.`);
      }
    }
  }

  if (cashBonus > 0) {
    state.cash = toFinite(state.cash, 0) + cashBonus;
    state.realized = toFinite(state.realized, 0) + realizedBonus;
  }

  if (command.discipline >= 8 && !command.choices.length) {
    command.discipline -= 8;
    openChoices(command, "Discipline streak earned a tactical module.");
    messages.push("Discipline streak unlocked a tactical draft.");
  }

  return { cashBonus, realizedBonus, messages };
}

export function applyContractCommandBonus(state, rewardCash = 0, rewardRep = 0) {
  const level = getRunModuleLevel(state, "syndicate-desk");
  if (level <= 0) return { cashBonus: 0, repBonus: 0 };
  const cashBonus = Math.round((Number(rewardCash) || 0) * level * 0.25);
  const repBonus = Math.max(0, Math.floor(level + (Number(rewardRep) || 0) * level * 0.1));
  if (cashBonus > 0) state.cash = toFinite(state.cash, 0) + cashBonus;
  if (state.operations && repBonus > 0) {
    state.operations.reputation = toFinite(state.operations.reputation, 0) + repBonus;
  }
  return { cashBonus, repBonus };
}

export function resolveRunCommandDay(state, metrics = {}) {
  const snapshot = refreshRunCommandState(state, metrics);
  const command = ensureRunCommandState(state);
  const messages = [];

  if (snapshot.progressPct >= 100) {
    const previousTarget = command.targetNetWorth;
    command.stage += 1;
    command.lastMilestoneDay = Number.isFinite(state?.day) ? state.day : command.lastMilestoneDay;
    command.targetNetWorth = Math.max(
      Math.round(previousTarget * 1.55),
      Math.round(snapshot.equity * 1.18)
    );
    const sponsorCash = Math.round(previousTarget * 0.025);
    state.cash = toFinite(state.cash, 0) + sponsorCash;
    command.milestones.push({
      day: Number.isFinite(state?.day) ? state.day : 0,
      target: previousTarget,
      equity: snapshot.equity,
      reward: sponsorCash
    });
    openChoices(command, "Portfolio target cleared. Choose a command module.");
    messages.push(`Target cleared. Sponsor capital +$${sponsorCash.toLocaleString()}.`);
  } else if ((Number.isFinite(state?.day) ? state.day : 1) % 3 === 0 && !command.choices.length) {
    openChoices(command, "Campaign resupply. Choose a command module.");
    messages.push("Campaign resupply opened a tactical draft.");
  }

  if (snapshot.heatPct >= 100) {
    messages.push("Risk heat critical. New buys are locked until exposure, debt, or drawdown cools.");
  } else if (snapshot.heatPct >= 75) {
    messages.push("Risk heat elevated. Stops and reduced exposure will preserve the run.");
  }

  return { snapshot, messages };
}
