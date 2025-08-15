import assert from 'assert';
import { CFG, ASSET_DEFS } from '../config.js';
import { createInitialState } from '../core/state.js';
import { startDay } from '../core/cycle.js';
import { randomEvent } from '../core/events.js';
import { createRNG } from '../util/rng.js';

// Moon burst window boosts mu and sigma
{
  const oldP = CFG.MOON_BURST_P;
  CFG.MOON_BURST_P = 0;
  const ctx0 = createInitialState(ASSET_DEFS);
  const moon0 = ctx0.assets.find(a => a.sym === 'MOON');
  startDay(ctx0, { ...CFG, AH_EVENT_P:0, AH_SUPPLY_EVENT_P:0 });
  const baseMu = moon0.outlook.mu;
  const baseSig = moon0.outlook.sigma;

  CFG.MOON_BURST_P = 1;
  const ctx1 = createInitialState(ASSET_DEFS);
  const moon1 = ctx1.assets.find(a => a.sym === 'MOON');
  startDay(ctx1, { ...CFG, AH_EVENT_P:0, AH_SUPPLY_EVENT_P:0 });
  assert(moon1.outlook.mu > baseMu, 'mu should be boosted during burst');
  assert(moon1.outlook.sigma > baseSig, 'sigma should be boosted during burst');
  assert(moon1.moonBurst && moon1.moonBurst.daysLeft >= CFG.MOON_BURST_DAYS_RANGE[0]-1,
    'burst window days set');
  CFG.MOON_BURST_P = oldP;
}

// Crypto events gated by upgrade
{
  const rng = createRNG(123);
  const ctx = createInitialState(ASSET_DEFS);
  ctx.state.upgrades.crypto = false;
  for(let i=0;i<20;i++){
    const ev = randomEvent(ctx, rng);
    assert(!ev.requires || !ev.requires.includes('crypto'), 'no crypto events when locked');
  }
  ctx.state.upgrades.crypto = true;
  let seen = false;
  for(let i=0;i<50;i++){
    const ev = randomEvent(ctx, rng);
    if(ev.requires && ev.requires.includes('crypto')) { seen = true; break; }
  }
  assert(seen, 'crypto events appear when unlocked');
}

console.log('crypto.spec passed');
