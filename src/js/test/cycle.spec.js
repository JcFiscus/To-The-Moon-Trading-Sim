import assert from 'assert';
import { createInitialState } from '../core/state.js';
import { startDay, stepTick, endDay } from '../core/cycle.js';
import { ASSET_DEFS, CFG } from '../config.js';
import { createRNG } from '../util/rng.js';

(function testDaySequence(){
  const cfg = { ...CFG, DAY_TICKS:5, INTRADAY_EVENT_P:0, AH_EVENT_P:0, AH_SUPPLY_EVENT_P:0 };
  const ctx = createInitialState(ASSET_DEFS.slice(0,1));
  const rng = createRNG(1);
  startDay(ctx, cfg);
  assert.strictEqual(ctx.day.active, true);
  assert.strictEqual(ctx.day.ticksLeft, 5);
  stepTick(ctx, cfg, rng);
  assert.strictEqual(ctx.day.ticksLeft, 4);
  const { meta } = endDay(ctx, cfg);
  assert.strictEqual(ctx.day.active, false);
  assert.strictEqual(meta.day, 1);
})();
