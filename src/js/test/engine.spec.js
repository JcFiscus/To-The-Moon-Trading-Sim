import assert from 'assert';
import { createRNG } from '../util/rng.js';
import { CFG, ASSET_DEFS } from '../config.js';
import { createInitialState } from '../core/state.js';
import { startDay, stepTick, endDay } from '../core/cycle.js';

function runDays(ctx, days, rng, cfg){
  for(let d=0; d<days; d++){
    startDay(ctx, cfg);
    for(let t=0; t<cfg.DAY_TICKS; t++) stepTick(ctx, cfg, rng);
    endDay(ctx, cfg);
  }
}

(function testMeanReversion(){
  const cfg = { ...CFG, INTRADAY_EVENT_P:0, AH_EVENT_P:0, AH_SUPPLY_EVENT_P:0 };
  const ctx = createInitialState(ASSET_DEFS.slice(0,1));
  const rng = createRNG(1); rng.normal=()=>0;
  const a = ctx.assets[0];
  const start = a.price;
  a.price = start*5; a.fair = start; a.history.fill(a.price);
  runDays(ctx,5,rng,cfg); // 50 ticks
  assert(a.price < start*5, 'price exceeded 500% of start');
  assert(a.price/a.fair < 2, 'price failed to revert toward fair');
})();

(function testRotationDrag(){
  const cfg = { ...CFG, INTRADAY_EVENT_P:0, AH_EVENT_P:0, AH_SUPPLY_EVENT_P:0 };
  const ctx = createInitialState(ASSET_DEFS.slice(0,2));
  const [a0,a1] = ctx.assets;
  a0.history.fill(100); a0.price=100; a0.fair=100;
  a1.history.fill(100); a1.price=100; a1.fair=100;
  a0.history[a0.history.length-6] = 50; // a0 outperforms
  const rng = createRNG(2); rng.normal=()=>0;
  const old = CFG.CAPITAL_ROTATION_INTENSITY; CFG.CAPITAL_ROTATION_INTENSITY = 0.05;
  startDay(ctx,cfg); stepTick(ctx,cfg,rng);
  CFG.CAPITAL_ROTATION_INTENSITY = old;
  assert(a0.price < 100, 'surging asset should face rotation drag');
  assert(a1.price > 100, 'lagging asset should get positive drift');
})();
