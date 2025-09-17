import { CORE_ASSET_IDS, ASSET_DEFS } from "./gameEngine.js";
import { BASE_EVENT_IDS } from "../content/events.js";

export const META_STORAGE_KEY = "ttm_v0_meta";
export const META_CURRENCY_SYMBOL = "RC";

const META_ASSET_IDS = ASSET_DEFS.filter((def) => def.unlock === "global-access").map((def) => def.id);
const ADVANCED_EVENT_IDS = ["energy-crunch", "global-stimulus"];

const META_UPGRADES = [
  {
    id: "seed-funding",
    name: "Seed Funding",
    description: "+$2,500 starting cash per level.",
    cost: 25,
    maxLevel: 3,
    requires: [],
    preview(level) {
      return `Starting cash +$${(level * 2500).toLocaleString()}`;
    }
  },
  {
    id: "risk-desk",
    name: "Risk Desk",
    description: "Reduce baseline volatility by 5% per level and add a small positive drift.",
    cost: 40,
    maxLevel: 2,
    requires: [{ id: "seed-funding", level: 1 }],
    preview(level) {
      const reduction = (level * 5).toFixed(0);
      return `Volatility -${reduction}% · Drift boost +${(level * 0.03).toFixed(2)}%`;
    }
  },
  {
    id: "global-access",
    name: "Global Access",
    description: "Unlock renewable, energy and AI asset classes.",
    cost: 60,
    maxLevel: 1,
    requires: [{ id: "seed-funding", level: 2 }],
    preview() {
      return `Adds ${META_ASSET_IDS.join(", ")}`;
    }
  },
  {
    id: "scenario-lab",
    name: "Scenario Lab",
    description: "Unlock advanced macro event arcs with richer rewards.",
    cost: 70,
    maxLevel: 1,
    requires: [{ id: "risk-desk", level: 1 }],
    preview() {
      return "Enables advanced macro scenarios";
    }
  }
];

const getUpgradeDef = (id) => META_UPGRADES.find((def) => def.id === id) || null;

export function createInitialMetaState() {
  return {
    currency: 0,
    lifetime: {
      runs: 0,
      bestNetWorth: 0,
      totalProfit: 0,
      totalMeta: 0
    },
    upgrades: {},
    lastSummary: null
  };
}

export function loadMetaState({ storageKey = META_STORAGE_KEY } = {}) {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return createInitialMetaState();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return createInitialMetaState();
    const meta = createInitialMetaState();
    meta.currency = Number.isFinite(parsed.currency) ? parsed.currency : meta.currency;
    if (parsed.lifetime && typeof parsed.lifetime === "object") {
      meta.lifetime = {
        runs: Number.isFinite(parsed.lifetime.runs) ? parsed.lifetime.runs : 0,
        bestNetWorth: Number.isFinite(parsed.lifetime.bestNetWorth) ? parsed.lifetime.bestNetWorth : 0,
        totalProfit: Number.isFinite(parsed.lifetime.totalProfit) ? parsed.lifetime.totalProfit : 0,
        totalMeta: Number.isFinite(parsed.lifetime.totalMeta) ? parsed.lifetime.totalMeta : 0
      };
    }
    meta.upgrades = parsed.upgrades && typeof parsed.upgrades === "object" ? { ...parsed.upgrades } : {};
    meta.lastSummary = parsed.lastSummary && typeof parsed.lastSummary === "object" ? { ...parsed.lastSummary } : null;
    return meta;
  } catch (error) {
    console.warn("ttm:meta:load", error);
    return createInitialMetaState();
  }
}

export function saveMetaState(meta, { storageKey = META_STORAGE_KEY } = {}) {
  if (!meta) return;
  try {
    localStorage.setItem(storageKey, JSON.stringify(meta));
  } catch (error) {
    console.warn("ttm:meta:save", error);
  }
}

export function getUpgradeLevel(meta, id) {
  if (!meta || !meta.upgrades) return 0;
  const level = meta.upgrades[id];
  return Number.isFinite(level) ? Math.max(0, level) : 0;
}

function upgradeCost(def, level) {
  if (!def) return Infinity;
  const base = Number.isFinite(def.cost) ? def.cost : 0;
  const factor = level + 1;
  return Math.max(0, Math.round(base * factor));
}

function meetsRequirements(meta, def) {
  if (!def?.requires || def.requires.length === 0) return true;
  return def.requires.every((req) => getUpgradeLevel(meta, req.id) >= (req.level ?? 1));
}

export function canPurchaseUpgrade(meta, id) {
  const def = getUpgradeDef(id);
  if (!def) return false;
  const level = getUpgradeLevel(meta, id);
  if (level >= def.maxLevel) return false;
  if (!meetsRequirements(meta, def)) return false;
  return meta.currency >= upgradeCost(def, level);
}

export function purchaseUpgrade(meta, id) {
  const def = getUpgradeDef(id);
  if (!def || !meta) return false;
  const level = getUpgradeLevel(meta, id);
  if (level >= def.maxLevel) return false;
  if (!meetsRequirements(meta, def)) return false;
  const cost = upgradeCost(def, level);
  if (meta.currency < cost) return false;
  meta.currency -= cost;
  meta.upgrades[id] = level + 1;
  return true;
}

function requirementText(def) {
  if (!def.requires || !def.requires.length) return "";
  return def.requires
    .map((req) => `${getUpgradeDef(req.id)?.name ?? req.id} L${req.level ?? 1}`)
    .join(", ");
}

export function listMetaUpgrades(meta) {
  const snapshot = meta ?? createInitialMetaState();
  return META_UPGRADES.map((def) => {
    const level = getUpgradeLevel(snapshot, def.id);
    const maxed = level >= def.maxLevel;
    const locked = !meetsRequirements(snapshot, def);
    const nextCost = maxed ? null : upgradeCost(def, level);
    const preview = !maxed && typeof def.preview === "function" ? def.preview(level + 1) : "";
    return {
      id: def.id,
      name: def.name,
      description: def.description,
      level,
      maxLevel: def.maxLevel,
      locked,
      requirement: requirementText(def),
      nextCost,
      preview,
      canAfford: !maxed && !locked && snapshot.currency >= nextCost
    };
  });
}

export function computeRunConfig(meta) {
  const snapshot = meta ?? createInitialMetaState();
  const seedLevel = getUpgradeLevel(snapshot, "seed-funding");
  const accessLevel = getUpgradeLevel(snapshot, "global-access");
  const riskLevel = getUpgradeLevel(snapshot, "risk-desk");
  const scenarioLevel = getUpgradeLevel(snapshot, "scenario-lab");

  const startingCash = 10000 + seedLevel * 2500;
  const assetIds = Array.from(new Set([
    ...CORE_ASSET_IDS,
    ...(accessLevel > 0 ? META_ASSET_IDS : [])
  ]));

  const volatilityMultiplier = riskLevel > 0 ? Math.pow(0.95, riskLevel) : 1;
  const driftBonus = riskLevel > 0 ? riskLevel * 0.0003 : 0;

  const allowedEvents = new Set(BASE_EVENT_IDS);
  if (scenarioLevel > 0) {
    for (const id of ADVANCED_EVENT_IDS) allowedEvents.add(id);
  }

  return {
    startingCash,
    assetIds,
    market: {
      volatilityMultiplier,
      driftBonus
    },
    events: {
      allowedIds: Array.from(allowedEvents)
    }
  };
}

export function calculateMetaReward(summary) {
  if (!summary) return 0;
  if (Number.isFinite(summary.ticks) && summary.ticks < 2) return 0;
  const netWorth = Number.isFinite(summary.netWorth) ? summary.netWorth : 0;
  const realized = Number.isFinite(summary.realized) ? summary.realized : 0;
  const days = Number.isFinite(summary.days) ? summary.days : 0;
  const base = Math.max(0, Math.floor(netWorth / 5000));
  const profitBonus = Math.max(0, Math.floor(realized / 7500));
  const survivalBonus = Math.max(0, Math.floor(days / 3));
  return base + profitBonus + survivalBonus;
}

export function applyRunSummaryToMeta(meta, summary) {
  const snapshot = meta ?? createInitialMetaState();
  const reward = calculateMetaReward(summary);
  snapshot.currency = Math.max(0, (snapshot.currency || 0) + reward);
  snapshot.lifetime = snapshot.lifetime || { runs: 0, bestNetWorth: 0, totalProfit: 0, totalMeta: 0 };
  snapshot.lifetime.runs = (snapshot.lifetime.runs || 0) + 1;
  const netWorth = Number.isFinite(summary?.netWorth) ? summary.netWorth : 0;
  snapshot.lifetime.bestNetWorth = Math.max(snapshot.lifetime.bestNetWorth || 0, netWorth);
  snapshot.lifetime.totalProfit = (snapshot.lifetime.totalProfit || 0) + (Number.isFinite(summary?.realized) ? summary.realized : 0);
  snapshot.lifetime.totalMeta = (snapshot.lifetime.totalMeta || 0) + reward;
  if (summary) {
    snapshot.lastSummary = { ...summary, metaReward: reward };
  }
  return { meta: snapshot, reward };
}

export function describeMetaUpgrade(id) {
  const def = getUpgradeDef(id);
  return def ? def.description : "";
}

export { META_UPGRADES };
