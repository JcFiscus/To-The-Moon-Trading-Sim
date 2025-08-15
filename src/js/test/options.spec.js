import { strict as assert } from 'assert';
import { createInitialState } from '../core/state.js';
import { CFG, ASSET_DEFS } from '../config.js';
import { buyOption, updateOptions } from '../core/options.js';

function setup(){
  const defs = [ { ...ASSET_DEFS[0] } ];
  defs[0].price = 100; // easier baseline
  return createInitialState(defs);
}

// Call option increases with price
{
  const ctx = setup();
  const sym = ctx.assets[0].sym;
  buyOption(ctx, sym, 'call', 100, 30, 1);
  const mark0 = ctx.state.optionPositions[0].mark;
  ctx.assets[0].price = 120;
  updateOptions(ctx, CFG);
  const mark1 = ctx.state.optionPositions[0].mark;
  assert(mark1 > mark0, 'Call mark should rise with underlying');
}

// Put option increases when price falls
{
  const ctx = setup();
  const sym = ctx.assets[0].sym;
  buyOption(ctx, sym, 'put', 100, 30, 1);
  const mark0 = ctx.state.optionPositions[0].mark;
  ctx.assets[0].price = 80;
  updateOptions(ctx, CFG);
  const mark1 = ctx.state.optionPositions[0].mark;
  assert(mark1 > mark0, 'Put mark should rise when price falls');
}

// Theta decay
{
  const ctx = setup();
  const sym = ctx.assets[0].sym;
  buyOption(ctx, sym, 'call', 100, 10, 1);
  const mark0 = ctx.state.optionPositions[0].mark;
  for(let i=0;i<CFG.DAY_TICKS;i++) updateOptions(ctx, CFG);
  const mark1 = ctx.state.optionPositions[0].mark;
  assert(mark1 < mark0, 'Option mark should decay over time');
}

// Expiry settlement
{
  const ctx = setup();
  const sym = ctx.assets[0].sym;
  buyOption(ctx, sym, 'call', 90, 1, 1);
  const premium = ctx.state.optionPositions[0].premium;
  ctx.assets[0].price = 110;
  for(let i=0;i<CFG.DAY_TICKS;i++) updateOptions(ctx, CFG);
  assert.equal(ctx.state.optionPositions.length, 0, 'Position should expire');
  assert(ctx.state.cash > CFG.START_CASH - premium, 'Intrinsic value credited');
}

console.log('options.spec passed');
