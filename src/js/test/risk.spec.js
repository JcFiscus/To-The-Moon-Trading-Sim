import assert from 'assert';
import { createInitialState } from '../core/state.js';
import { evaluateRisk } from '../core/risk.js';
import { ASSET_DEFS } from '../config.js';
import { buy } from '../core/trading.js';

(function testHardStopPriority(){
  const ctx = createInitialState(ASSET_DEFS.slice(0,1));
  const sym = ctx.assets[0].sym;
  ctx.state.positions[sym] = 10;
  ctx.state.costBasis[sym] = {qty:10, avg:100};
  ctx.assets[0].price = 80;
  ctx.state.riskTools = { enabled:true, hardStop:0.1, trailing:0.05, stopSellFrac:1, posCap:1 };
  const logs=[];
  evaluateRisk(ctx, { log:m=>logs.push(m) });
  assert.strictEqual(ctx.state.positions[sym], 0, 'hard stop sold all');
  assert(logs.some(m=>/Auto.*STOP/.test(m)), 'stop logged');
  assert.strictEqual(ctx.riskTrack[sym].lastRule, 'STOP', 'last rule STOP');
})();

(function testTrailing(){
  const ctx = createInitialState(ASSET_DEFS.slice(0,1));
  const sym = ctx.assets[0].sym;
  ctx.state.positions[sym] = 10;
  ctx.state.costBasis[sym] = {qty:10, avg:100};
  ctx.assets[0].price = 120;
  ctx.state.riskTools = { enabled:true, hardStop:0.3, trailing:0.1, stopSellFrac:1, posCap:1 };
  evaluateRisk(ctx); // set peak
  const logs=[];
  ctx.assets[0].price = 105;
  evaluateRisk(ctx, { log:m=>logs.push(m) });
  assert.strictEqual(ctx.state.positions[sym], 0, 'trailing sold all');
  assert(logs.some(m=>/Auto.*TRAIL/.test(m)), 'trail logged');
  assert.strictEqual(ctx.riskTrack[sym].lastRule, 'TRAIL', 'last rule TRAIL');
})();

(function testTPLadderStage(){
  const ctx = createInitialState(ASSET_DEFS.slice(0,1));
  const sym = ctx.assets[0].sym;
  ctx.state.positions[sym] = 10;
  ctx.state.costBasis[sym] = {qty:10, avg:100};
  ctx.state.riskTools = { enabled:true, tp1:0.1, tp1Frac:0.5, tp2:0.2, tp2Frac:0.5, trailing:1, hardStop:1, posCap:1 };
  const logs=[];
  ctx.assets[0].price = 150;
  evaluateRisk(ctx, { log:m=>logs.push(m) });
  assert.strictEqual(ctx.state.positions[sym], 5, 'tp1 sold half');
  assert.strictEqual(ctx.riskTrack[sym].lastTP, 1, 'stage 1');
  assert(logs.filter(m=>/Auto.*TP/.test(m)).length === 1, 'only one tp log');
  ctx.assets[0].price = 200;
  evaluateRisk(ctx, { log:m=>logs.push(m) });
  assert.strictEqual(ctx.state.positions[sym], 2, 'tp2 sold');
  assert.strictEqual(ctx.riskTrack[sym].lastTP, 2, 'stage 2');
  assert(logs.filter(m=>/Auto.*TP/.test(m)).length === 2, 'two tp logs');
})();

(function testPositionCap(){
  const ctx = createInitialState(ASSET_DEFS.slice(0,1));
  const sym = ctx.assets[0].sym;
  ctx.state.positions[sym] = 10;
  ctx.state.costBasis[sym] = {qty:10, avg:100};
  ctx.state.cash = 0; ctx.state.debt = 0;
  ctx.state.riskTools = { enabled:true, posCap:0.25, trailing:1, hardStop:1 };
  const logs=[];
  evaluateRisk(ctx, { log:m=>logs.push(m) });
  assert.strictEqual(ctx.state.positions[sym], 2, 'trimmed to cap');
  assert(logs.some(m=>/Auto.*CAP/.test(m)), 'cap logged');
  assert.strictEqual(ctx.riskTrack[sym].lastRule, 'CAP', 'last rule CAP');
  logs.length = 0;
  evaluateRisk(ctx, { log:m=>logs.push(m) });
  assert.strictEqual(logs.length, 0, 'no repeat');
})();

(function testGracePeriod(){
  const ctx = createInitialState(ASSET_DEFS.slice(0,1));
  const sym = ctx.assets[0].sym;
  ctx.state.riskTools = { enabled:true, hardStop:0.01, trailing:0.01, tp1:0.01, tp1Frac:1, posCap:1 };
  buy(ctx, sym, 10);
  const before = ctx.state.positions[sym];
  evaluateRisk(ctx); // first tick after buy – should ignore
  assert.strictEqual(ctx.state.positions[sym], before, 'no risk triggers first tick');
  ctx.assets[0].price *= 1.02;
  evaluateRisk(ctx);
  assert(ctx.state.positions[sym] < before, 'triggers after grace period and price move');
})();

console.log('risk.spec passed');
