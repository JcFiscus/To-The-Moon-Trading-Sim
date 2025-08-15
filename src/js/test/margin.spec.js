import assert from 'assert';
import { ASSET_DEFS } from '../config.js';
import { createInitialState } from '../core/state.js';
import { buy, sell, checkMargin } from '../core/trading.js';

(function testMarginBuy(){
  const ctx = createInitialState(ASSET_DEFS.slice(0,1));
  ctx.state.cash = 10000;
  buy(ctx, 'H3', 10, { leverage:10 });
  assert.strictEqual(ctx.state.positions['H3'], 0, 'leveraged buy should not affect cash positions');
  assert.strictEqual(ctx.state.marginPositions.length, 1, 'margin lot created');
  const price = ctx.assets[0].price;
  const exposure = 10 * 10;
  const fee = Math.max(ctx.state.minFee, exposure * price * ctx.state.feeRate);
  const expectedCash = 10000 - (10 * price) - fee;
  const expectedDebt = exposure * price - (10 * price);
  assert(Math.abs(ctx.state.cash - expectedCash) < 1e-6, 'cash should reduce by margin and fee');
  assert(Math.abs(ctx.state.debt - expectedDebt) < 1e-6, 'debt should increase by borrowed portion');
})();

(function testMarginSell(){
  const ctx = createInitialState(ASSET_DEFS.slice(0,1));
  ctx.state.cash = 10000;
  buy(ctx, 'H3', 10, { leverage:10 });
  const price = ctx.assets[0].price;
  ctx.assets[0].price = price * 1.1;
  sell(ctx, 'H3', 100);
  assert.strictEqual(ctx.state.marginPositions.length, 0, 'margin lot removed after sell');
  assert.strictEqual(ctx.state.debt, 0, 'debt cleared after sell');
  assert(ctx.state.cash > 10000 - 1, 'cash increased after profitable sell');
})();

(function testLiquidation(){
  const ctx = createInitialState(ASSET_DEFS.slice(0,1));
  ctx.state.cash = 1000;
  buy(ctx, 'H3', 10, { leverage:10 });
  const lot = ctx.state.marginPositions[0];
  ctx.assets[0].price = lot.liqPrice - 0.01;
  checkMargin(ctx);
  assert.strictEqual(ctx.state.marginPositions.length, 0, 'margin lot liquidated');
  assert(ctx.state.debt < 1e-6, 'debt cleared on liquidation');
})();

(function test100xGameOver(){
  const ctx = createInitialState(ASSET_DEFS.slice(0,1));
  ctx.state.cash = 1000;
  buy(ctx, 'H3', 1, { leverage:100 });
  const lot = ctx.state.marginPositions[0];
  ctx.assets[0].price = lot.liqPrice - 0.01;
  checkMargin(ctx);
  assert.strictEqual(ctx.gameOver, true, 'game over on 100x liquidation');
})();

(function testNetWorthGameOver(){
  const ctx = createInitialState(ASSET_DEFS.slice(0,1));
  ctx.state.cash = 0; ctx.state.debt = 100;
  checkMargin(ctx);
  assert.strictEqual(ctx.gameOver, true, 'game over when net worth <= 0');
})();
