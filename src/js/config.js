export const CFG = {
  START_CASH: 10000,
  DAY_TICKS: 10,

  VALUATION_DRAG: 0.0040,    // strength of log‑valuation mean reversion
  FAIR_DRIFT_BASE: 0.00040,  // baseline growth of fair value
  REGIME_P: 0.0005,

  IMPACT_SCALE: 30,
  DEMAND_IMPULSE_SCALE: 9,
  OPP_COST_SPILL: 0.35,

  RUN_CAP_MULTIPLE: 5.0,     // soft cap for runaway rallies
  FLOW_WINDOW_DAYS: 7,

  STREAK_FATIGUE: 0.0004,    // extra drift per streak day beyond threshold
  STREAK_REVERSION: 0.0008,  // overnight reversion strength when over/under fair
  CAPITAL_ROTATION_INTENSITY: 0.0010, // cross‑asset rotation intensity
  NPC_MOMENTUM_FADE: 0.015,  // NPC momentum decay per extra streak day

  AH_EVENT_P: 0.45,
  AH_SUPPLY_EVENT_P: 0.25,
  INTRADAY_EVENT_P: 0.08,
  INTRADAY_IMPACT_SCALE: 0.55,
  EVENT_DEMAND_DECAY: 0.80,
  OPEN_GAP_CAP: 0.25,

  DEBT_INTEREST_RATE: 0.02,
  DEBT_INTEREST_FREQ: 5,
  DEBT_NET_THRESHOLD: 0.60,

  // Leverage
  LEVERAGE_LEVELS: [1,2,5,10,25,50,100],
  MAINT_REQ_BY_LEV: { 2:0.15, 5:0.20, 10:0.25, 25:0.30, 50:0.35, 100:0.40 },
  LIQUIDATION_FEE_BP: 10,

  // Insider
  INSIDER_MU_RANGE: [0.0006, 0.0012],
  INSIDER_SIGMA_RANGE: [0.004, 0.008],
  INSIDER_DAYS: 5,
  INSIDER_COOLDOWN_DAYS: 7,

  // Options
  OPTIONS_ALLOWED: true,
  OPTIONS_DEFAULT_DTE: [7,14,30],
  OPTIONS_MIN_IV: 0.05,
  OPTIONS_MAX_IV: 1.00,

  // Crypto
  CRYPTO_ENABLED: true,
  MOON_BURST_P: 0.08,
  MOON_BURST_DAYS_RANGE: [2,5],
  MOON_BURST_MU_RANGE: [0.002, 0.006],
  MOON_BURST_SIGMA_RANGE: [0.012, 0.025],

  // Events mix
  EVENT_POSITIVITY_BASELINE: 0.52
};

export const ASSET_DEFS = [
  {sym:"H3",  name:"Helium‑3 Futures",        sector:"Energy",   price:65,  mu:0.0010, sigma:0.022, k:0.0009, supply:1_600_000},
  {sym:"QNTM",name:"Quantum Chip Index",      sector:"Tech",     price:120, mu:0.0012, sigma:0.027, k:0.0010, supply:1_000_000},
  {sym:"DMX", name:"Dark Matter Extractors",  sector:"Materials",price:42,  mu:0.0006, sigma:0.030, k:0.0012, supply:2_500_000},
  {sym:"MWR", name:"Mars Water Rights",       sector:"Infra",    price:88,  mu:0.0008, sigma:0.018, k:0.0007, supply:1_200_000},
  {sym:"SOL", name:"Solar Sail Conglom.",     sector:"Aero",     price:51,  mu:0.0009, sigma:0.028, k:0.0010, supply:1_700_000},
  {sym:"NNC", name:"NeuroNet Cloud",          sector:"AI",       price:93,  mu:0.0013, sigma:0.032, k:0.0009, supply:900_000},
  {sym:"GAT", name:"Gate Array Prototypes",   sector:"Exotic",   price:24,  mu:0.0016, sigma:0.040, k:0.0015, supply:3_400_000},
  {sym:"CYB", name:"CyberDefense Mesh",       sector:"Security", price:79,  mu:0.0010, sigma:0.023, k:0.0011, supply:1_400_000}
];
