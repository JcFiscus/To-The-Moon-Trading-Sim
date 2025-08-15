import assert from 'assert';
import { createInitialState } from '../core/state.js';
import { startDay, endDay, stepTick } from '../core/cycle.js';
import { ASSET_DEFS, CFG } from '../config.js';
import { EVENT_POOL } from '../core/events.js';
import { createRNG } from '../util/rng.js';

(function testAfterHoursPersistence(){
  const cfg = { ...CFG, DAY_TICKS:1, INTRADAY_EVENT_P:0, AH_EVENT_P:0, AH_SUPPLY_EVENT_P:0, FAIR_ACCEL:0, MR_K_OVERNIGHT:0, MR_K_BASE:0, STREAK_FATIGUE_MAX:0, ROTATION_K:0 };
  const ctx = createInitialState(ASSET_DEFS.slice(0,1));
  const ev = {scope:'asset', sym:'H3', mu:-0.002, sigma:0.01, demand:-0.10, days:5, severity:'major'};
  ctx.market.tomorrow.push(ev);
  startDay(ctx, cfg);
  const a = ctx.assets[0];
  assert(a.outlook.gap < 0, 'negative gap');
  assert(a.outlook.mu < 0, 'negative drift day1');
  endDay(ctx, cfg);
  startDay(ctx, cfg);
  assert(ctx.assets[0].outlook.mu < 0, 'drift remains negative day2');
})();

(function testSectorSplash(){
  const cfg = { ...CFG, DAY_TICKS:1, INTRADAY_EVENT_P:0, AH_EVENT_P:0, AH_SUPPLY_EVENT_P:0, FAIR_ACCEL:0, MR_K_OVERNIGHT:0, MR_K_BASE:0, STREAK_FATIGUE_MAX:0, ROTATION_K:0 };
  const defs = ASSET_DEFS.filter(a=>a.sector==='Crypto');
  const ctx = createInitialState(defs);
  const ev = {scope:'asset', sym:'BTC', mu:-0.0015, sigma:0.01, demand:-0.09, days:4, severity:'major'};
  ctx.market.tomorrow.push(ev);
  startDay(ctx, cfg);
  const btc = ctx.assets.find(a=>a.sym==='BTC');
  const eth = ctx.assets.find(a=>a.sym==='ETH');
  const moon = ctx.assets.find(a=>a.sym==='MOON');
  assert(btc.outlook.gap < 0, 'btc gap negative');
  assert(eth.evMuCarry < 0 && moon.evMuCarry < 0, 'peers receive drift');
  const ratio = eth.evMuCarry / btc.evMuCarry;
  assert(ratio > 0.30 && ratio < 0.40, 'neighbor receives ~1/3 intensity');
})();

(function testIntradayGuardrail(){
  const cfg = { ...CFG, DAY_TICKS:1, AH_EVENT_P:0, AH_SUPPLY_EVENT_P:0, INTRADAY_EVENT_P:1, INTRADAY_IMPACT_SCALE:1 };
  const ctx = createInitialState(ASSET_DEFS.slice(0,1));
  const rng = createRNG(1);
  const orig = EVENT_POOL.slice();
  EVENT_POOL.length = 0;
  EVENT_POOL.push({scope:'global', title:'X', mu:-1, sigma:0, demand:-0.2, days:1, severity:'major'});
  startDay(ctx, cfg);
  stepTick(ctx, cfg, rng);
  const ev = ctx.market.activeEvents[0];
  const cap = cfg.OPEN_GAP_CAP/2 + 1e-9;
  assert(Math.abs(ev.mu) <= cap, 'mu capped');
  assert(Math.abs(ev.demand) <= cap, 'demand capped');
  EVENT_POOL.length = 0;
  orig.forEach(e=>EVENT_POOL.push(e));
})();
