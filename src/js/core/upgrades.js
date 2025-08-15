export const UPGRADES = [
  { id:'insider', tier:1, name:'Insider Info (Weekly Tip)',
    baseCost:1500, costScale:1.25,
    kind:'consumable',
    desc:'Weekly paid tip pre-biases next week on a chosen asset.',
    tip:'Choose an asset for a short-lived drift/volatility bias. Works once per purchase.',
    effect:'bias_mu_sigma',
    profitPotential:'Low–Moderate' },

  { id:'leverage', tier:2, name:'Leverage Access',
    baseCost:4000, costScale:1.35,
    levels:[2,5,10,25,50,100],
    desc:'Borrow to amplify exposure; risk of liquidation.',
    tip:'Unlock margin trading. Higher levels magnify gains and losses and may trigger forced sells.',
    profitPotential:'High' },

  { id:'debt_rate', tier:2, name:'Preferred Rates',
    baseCost:3000, costScale:1.3,
    desc:'Reduce debt interest schedule / rate.',
    tip:'Lowers daily interest charged on outstanding debt.',
    profitPotential:'Low–Moderate' },

  { id:'options', tier:3, name:'Options Trading',
    baseCost:6500, costScale:1.4,
    desc:'Buy/sell simple options; access to option-driven events.',
    tip:'Adds calls and puts with limited expiry that can hedge or speculate.',
    profitPotential:'High' },

  { id:'crypto', tier:3, name:'Crypto Markets',
    baseCost:8000, costScale:1.45,
    desc:'Unlock crypto assets and moonshot coin dynamics.',
    tip:'Adds highly volatile coins with unique events and price swings.',
    profitPotential:'Very High' }
];

export function upgradeCost(def, times){
  return Math.floor(def.baseCost * (def.costScale ** times));
}
