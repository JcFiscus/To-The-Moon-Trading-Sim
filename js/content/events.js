const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const portfolioValue = (state) => {
  if (!state || !Array.isArray(state.assets)) return 0;
  return state.assets.reduce((sum, asset) => {
    const pos = state.positions?.[asset.id];
    return sum + (pos ? pos.qty * asset.price : 0);
  }, 0);
};

const largestPosition = (state) => {
  if (!state || !state.positions) return null;
  let best = null;
  for (const [assetId, position] of Object.entries(state.positions)) {
    if (!position || position.qty <= 0) continue;
    if (!best || position.qty > best.qty) {
      best = { assetId, qty: position.qty };
    }
  }
  return best;
};

const findAssetName = (state, assetId) => {
  if (!assetId || !Array.isArray(state?.assets)) return assetId;
  return state.assets.find((asset) => asset.id === assetId)?.name ?? assetId;
};

const recentTradeSummary = (state, lookback = 40) => {
  const trades = Array.isArray(state?.recentTrades) ? state.recentTrades.slice(-lookback) : [];
  const summary = new Map();
  for (const trade of trades) {
    if (!trade || typeof trade.assetId !== "string") continue;
    const assetId = trade.assetId;
    const entry = summary.get(assetId) || { buys: 0, sells: 0, qty: 0 };
    if (trade.side === "sell") entry.sells += 1;
    else entry.buys += 1;
    entry.qty += Number.isFinite(trade.qty) ? trade.qty : 0;
    summary.set(assetId, entry);
  }
  return summary;
};

const weightedRandomPick = (entries, random) => {
  const total = entries.reduce((sum, entry) => sum + (entry.weight ?? 1), 0);
  if (total <= 0) return null;
  let roll = random() * total;
  for (const entry of entries) {
    roll -= entry.weight ?? 1;
    if (roll <= 0) return entry;
  }
  return entries[entries.length - 1] ?? null;
};

export const EVENT_DEFINITIONS = [
  {
    id: "liquidity-crunch",
    label: "Liquidity Crunch Looms",
    kind: "bad",
    phase: "dayStart",
    cooldownDays: 4,
    deadlineDays: 1,
    defaultChoiceId: "wait",
    evaluate({ state, random }) {
      if (!state || state.day < 3) return false;
      const equity = portfolioValue(state) + (Number.isFinite(state.cash) ? state.cash : 0);
      if (equity < 6000) return false;
      if (random() > 0.22) return false;
      const stress = clamp(0.5 + random() * 0.6, 0.4, 1.2);
      const description = `Funding desks report ${(stress * 100).toFixed(0)}% of overnight liquidity has frozen.`;
      return {
        context: { stress },
        announcement: "Overnight funding cracks spread — repo desks are hoarding cash.",
        description
      };
    },
    choices: [
      {
        id: "support",
        label: "Backstop dealers ($2,000)",
        description: "Spend $2,000 to inject liquidity and calm credit markets.",
        requirements: ({ state }) => Number.isFinite(state?.cash) && state.cash >= 2000,
        disabledReason: "Need at least $2,000 cash on hand.",
        outcome: {
          kind: "good",
          text: ({ state }) => {
            return "You deploy emergency cash. Dealers breathe and spreads tighten.";
          },
          apply: ({ state }) => {
            state.cash -= 2000;
          },
          effects: [
            {
              label: "Emergency Liquidity",
              kind: "good",
              durationDays: 2,
              effect: { volMult: 0.78, driftShift: 0.0006, liquidityShift: 0.9 }
            }
          ]
        }
      },
      {
        id: "wait",
        label: "Let markets sort it out",
        description: "Do nothing and hope counterparties find a bid.",
        outcome: {
          kind: "bad",
          text: () => "Funding vacuum spreads. Volatility surges as liquidity evaporates.",
          effects: [
            {
              label: "Liquidity Vacuum",
              kind: "bad",
              durationDays: 2,
              effect: { volMult: 1.4, driftShift: -0.0018, liquidityShift: -1.2 }
            }
          ]
        }
      }
    ]
  },
  {
    id: "viral-mania",
    label: "Influencer Frenzy",
    kind: "good",
    phase: "tick",
    cooldownDays: 2,
    deadlineTicks: 36,
    defaultChoiceId: "ride",
    evaluate({ state, random }) {
      if (!state || state.day < 2) return false;
      const summary = recentTradeSummary(state, 60);
      if (summary.size === 0) return false;
      const candidates = [];
      for (const [assetId, info] of summary.entries()) {
        if (info.buys < 4 || info.buys <= info.sells) continue;
        candidates.push({
          assetId,
          weight: info.buys + info.qty * 0.05,
          buys: info.buys
        });
      }
      if (!candidates.length) return false;
      if (random() > 0.04) return false;
      const pick = weightedRandomPick(candidates, random);
      if (!pick) return false;
      const assetName = findAssetName(state, pick.assetId);
      return {
        context: { assetId: pick.assetId, assetName, buys: pick.buys },
        announcement: `${pick.assetId} trends on FinTok as influencers pump the ticker.`,
        description: `${assetName} is everywhere — finfluencers cite ${pick.buys} community buy signals in the last hour.`
      };
    },
    choices: [
      {
        id: "ride",
        label: "Lean into the hype",
        description: ({ context }) => `Let the ${context.assetId} mania run and feed the narrative.`,
        outcome: {
          kind: "good",
          text: ({ context }) => `You let ${context.assetId} mania rip. Retail fever sends it vertical.`,
          effects: [
            {
              label: ({ context }) => `${context.assetId} Viral Hype`,
              kind: "good",
              target: ({ context }) => context.assetId,
              durationTicks: 48,
              effect: { driftShift: 0.004, volMult: 1.25 }
            }
          ],
          extraFeed: ({ context }) => [
            {
              text: `${context.assetId}: Finfluencers throw gasoline on the fire.`,
              kind: "good",
              targetId: context.assetId
            }
          ]
        }
      },
      {
        id: "fade",
        label: "Fade the move (cost $500)",
        description: ({ context }) => `Pay for hedges and lean against the ${context.assetId} spike.`,
        requirements: ({ state }) => Number.isFinite(state?.cash) && state.cash >= 500,
        disabledReason: "Need $500 cash for hedges.",
        outcome: {
          kind: "neutral",
          text: ({ context }) => `You hedge the frenzy in ${context.assetId}. The pop cools, but the crowd stays jittery.`,
          apply: ({ state }) => {
            state.cash -= 500;
          },
          effects: [
            {
              label: ({ context }) => `${context.assetId} Hedged Frenzy`,
              kind: "neutral",
              target: ({ context }) => context.assetId,
              durationTicks: 48,
              effect: { driftShift: -0.001, volMult: 0.9 }
            }
          ],
          extraFeed: ({ context }) => [
            {
              text: `${context.assetId}: Dealers absorb the influencer pump as hedges go on.`,
              kind: "neutral",
              targetId: context.assetId
            }
          ]
        }
      }
    ]
  },
  {
    id: "regulatory-probe",
    label: "Regulators Knock",
    kind: "bad",
    phase: "dayStart",
    cooldownDays: 5,
    deadlineDays: 2,
    defaultChoiceId: "stonewall",
    evaluate({ state, random }) {
      if (!state || state.day < 4) return false;
      const biggest = largestPosition(state);
      if (!biggest || biggest.qty < 60) return false;
      if (random() > 0.28) return false;
      const assetName = findAssetName(state, biggest.assetId);
      return {
        context: { assetId: biggest.assetId, assetName, qty: biggest.qty },
        announcement: `${biggest.assetId} under regulatory scrutiny after unusual flow.`,
        description: `Regulators question suspicious volume in ${assetName}. Cooperate or risk penalties.`
      };
    },
    choices: [
      {
        id: "cooperate",
        label: "Cooperate fully ($1,000)",
        description: ({ context }) => `Pay counsel and open the ${context.assetId} books to calm nerves.`,
        requirements: ({ state }) => Number.isFinite(state?.cash) && state.cash >= 1000,
        disabledReason: "Need $1,000 cash for legal support.",
        outcome: {
          kind: "good",
          text: ({ context }) => `You cooperate with regulators on ${context.assetId}. Confidence drifts back.`,
          apply: ({ state }) => {
            state.cash -= 1000;
          },
          effects: [
            {
              label: ({ context }) => `${context.assetId} Compliance Overdrive`,
              kind: "good",
              target: ({ context }) => context.assetId,
              durationDays: 2,
              effect: { volMult: 0.85, driftShift: 0.0012 }
            }
          ]
        }
      },
      {
        id: "stonewall",
        label: "Stonewall the probe",
        description: ({ context }) => `Refuse to comment and hope ${context.assetId} cools off.`,
        outcome: {
          kind: "bad",
          text: ({ context }) => `You stonewall investigators on ${context.assetId}. Shorts swarm the tape.`,
          effects: [
            {
              label: ({ context }) => `${context.assetId} Regulatory Overhang`,
              kind: "bad",
              target: ({ context }) => context.assetId,
              durationDays: 3,
              effect: { volMult: 1.3, driftShift: -0.0025 }
            }
          ],
          extraFeed: ({ context }) => [
            {
              text: `${context.assetId}: Compliance clouds linger as rumors swirl.`,
              kind: "bad",
              targetId: context.assetId
            }
          ]
        }
      }
    ]
  },
  {
    id: "energy-crunch",
    label: "Energy Supply Shock",
    kind: "bad",
    phase: "dayStart",
    cooldownDays: 6,
    deadlineDays: 1,
    defaultChoiceId: "hedge",
    metaTier: "scenario-lab",
    evaluate({ state, random }) {
      if (!state || state.day < 6) return false;
      const energy = Array.isArray(state?.assets) ? state.assets.find((asset) => asset.id === "OILX") : null;
      if (!energy) return false;
      if (random() > 0.24) return false;
      const severity = clamp(1.25 + random() * 0.55, 1.1, 2.0);
      return {
        context: { severity },
        announcement: "Energy desks warn of a sudden supply shock across crude markets.",
        description: `${energy.name} faces disrupted supply — volatility expected to surge.`
      };
    },
    choices: [
      {
        id: "hedge",
        label: "Deploy hedges ($1,500)",
        description: "Spend $1,500 to cushion the shock and cap volatility.",
        requirements: ({ state }) => Number.isFinite(state?.cash) && state.cash >= 1500,
        disabledReason: "Need $1,500 cash to hedge.",
        outcome: {
          kind: "neutral",
          text: () => "You absorb the supply shock with tactical hedges. Losses contained, but tension lingers.",
          apply: ({ state }) => {
            state.cash -= 1500;
          },
          effects: [
            {
              label: "Energy Hedged Shock",
              kind: "neutral",
              target: () => "OILX",
              durationDays: 3,
              effect: ({ context }) => ({ volMult: 1 + (context.severity - 1) * 0.6, driftShift: -0.0022 })
            },
            {
              label: "Macro Jitters",
              kind: "bad",
              durationDays: 2,
              effect: { driftShift: -0.0006, riskShift: 0.6 }
            }
          ]
        }
      },
      {
        id: "ride",
        label: "Ride it out",
        description: "Accept the turbulence and hope for a quick rebound.",
        outcome: {
          kind: "bad",
          text: () => "You let the shock run its course. Energy markets whipsaw violently.",
          effects: [
            {
              label: "Energy Supply Crisis",
              kind: "bad",
              target: () => "OILX",
              durationDays: 3,
              effect: ({ context }) => ({ volMult: context.severity, driftShift: -0.0035 })
            },
            {
              label: "Inflation Fears",
              kind: "bad",
              durationDays: 2,
              effect: { driftShift: -0.0009, riskShift: 0.9 }
            }
          ],
          extraFeed: () => [
            {
              text: "Energy traders scramble for barrels as supply gaps widen.",
              kind: "bad",
              targetId: "OILX"
            }
          ]
        }
      }
    ]
  },
  {
    id: "global-stimulus",
    label: "Global Stimulus Wave",
    kind: "good",
    phase: "dayStart",
    cooldownDays: 6,
    deadlineDays: 2,
    defaultChoiceId: "deploy",
    metaTier: "scenario-lab",
    evaluate({ state, random }) {
      if (!state || state.day < 4) return false;
      if (portfolioValue(state) < 15000) return false;
      if (random() > 0.22) return false;
      const boost = clamp(0.0008 + random() * 0.0014, 0.0008, 0.0024);
      return {
        context: { boost },
        announcement: "Coordinated fiscal stimulus hits global markets.",
        description: "Central banks flood liquidity while governments unleash relief packages."
      };
    },
    choices: [
      {
        id: "deploy",
        label: "Deploy risk capital",
        description: "Lean into the liquidity wave and scale positions.",
        outcome: {
          kind: "good",
          text: () => "You redeploy rapidly and front-run the stimulus bid.",
          effects: [
            {
              label: "Stimulus Momentum",
              kind: "good",
              durationDays: 3,
              effect: ({ context }) => ({ driftShift: context.boost * 6, liquidityShift: 1.6 })
            }
          ],
          extraFeed: () => [
            {
              text: "Liquidity gushes into risk assets as policymakers over-deliver.",
              kind: "good"
            }
          ]
        }
      },
      {
        id: "hold",
        label: "Stay cautious",
        description: "Let markets reprice while you manage exposure.",
        outcome: {
          kind: "neutral",
          text: () => "You stay measured. Gains still drift higher on stimulus optimism.",
          effects: [
            {
              label: "Measured Participation",
              kind: "neutral",
              durationDays: 3,
              effect: ({ context }) => ({ driftShift: context.boost * 3, liquidityShift: 0.8 })
            }
          ]
        }
      }
    ]
  }
];

export const EVENT_DEFINITION_MAP = new Map(EVENT_DEFINITIONS.map((def) => [def.id, def]));
export const BASE_EVENT_IDS = EVENT_DEFINITIONS.filter((def) => !def.metaTier).map((def) => def.id);
