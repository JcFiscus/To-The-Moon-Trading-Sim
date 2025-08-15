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

(function testDebtInterest(){
  const cfg = { ...CFG, DAY_TICKS:0, INTRADAY_EVENT_P:0, AH_EVENT_P:0, AH_SUPPLY_EVENT_P:0,
    DEBT_INTEREST_FREQ:1, DEBT_INTEREST_RATE:0.1, DEBT_NET_THRESHOLD:0.5 };
  const ctx = createInitialState(ASSET_DEFS.slice(0,1));
  ctx.state.cash = 100; ctx.state.debt = 50;
  startDay(ctx, cfg);
  const res = endDay(ctx, cfg);
  assert.strictEqual(Math.round(ctx.state.debt), 55);
  assert.strictEqual(Math.round(res.meta.endNet), 45);
  assert(Math.abs(res.meta.interest - 5) < 1e-6, 'interest amount tracked');
})();

(function testGameOver(){
  const cfg = { ...CFG, DAY_TICKS:0, INTRADAY_EVENT_P:0, AH_EVENT_P:0, AH_SUPPLY_EVENT_P:0,
    DEBT_INTEREST_FREQ:1, DEBT_INTEREST_RATE:0.1, DEBT_NET_THRESHOLD:0.5 };
  const ctx = createInitialState(ASSET_DEFS.slice(0,1));
  ctx.state.cash = 10; ctx.state.debt = 50;
  startDay(ctx, cfg);
  const res = endDay(ctx, cfg);
  assert.strictEqual(res.gameOver, true);
})();

(function testDebtInterestUpgrade(){
  const cfg = { ...CFG, DAY_TICKS:0, INTRADAY_EVENT_P:0, AH_EVENT_P:0, AH_SUPPLY_EVENT_P:0,
    DEBT_INTEREST_FREQ:2, DEBT_INTEREST_RATE:0.1, DEBT_NET_THRESHOLD:0.5 };
  const ctx = createInitialState(ASSET_DEFS.slice(0,1));
  ctx.state.cash = 100; ctx.state.debt = 50; ctx.state.upgrades.debt_rate = true;
  startDay(ctx, cfg); endDay(ctx, cfg); // day1
  startDay(ctx, cfg); endDay(ctx, cfg); // day2
  startDay(ctx, cfg); const res = endDay(ctx, cfg); // day3
  assert(Math.abs(ctx.state.debt - 53.75) < 1e-6, 'reduced rate applied on schedule');
  assert(Math.abs(res.meta.interest - 3.75) < 1e-6, 'meta interest reported');
})();
