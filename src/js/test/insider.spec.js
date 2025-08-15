import assert from 'assert';
import { CFG, ASSET_DEFS } from '../config.js';
import { createInitialState } from '../core/state.js';
import { startDay, endDay } from '../core/cycle.js';
import { applyOvernightOutlook } from '../core/priceModel.js';

(function testInsiderWindow(){
  const cfg = { ...CFG, INTRADAY_EVENT_P:0, AH_EVENT_P:0, AH_SUPPLY_EVENT_P:0 };
  const ctx = createInitialState(ASSET_DEFS.slice(0,1));
  ctx.state.insiderTip = { sym: ctx.assets[0].sym, daysLeft: CFG.INSIDER_DAYS, mu:0.001, sigma:0.005, bias:1 };
  ctx.state.cooldowns.insider = CFG.INSIDER_COOLDOWN_DAYS;
  const initialCd = ctx.state.cooldowns.insider;
  startDay(ctx, cfg);
  assert.strictEqual(ctx.state.upgrades.insider, true, 'insider active at start');
  endDay(ctx, cfg);
  assert.strictEqual(ctx.state.cooldowns.insider, initialCd - 1, 'cooldown decremented');
  for(let d=1; d<CFG.INSIDER_DAYS; d++){
    startDay(ctx, cfg); endDay(ctx, cfg);
  }
  startDay(ctx, cfg);
  assert.strictEqual(ctx.state.upgrades.insider, false, 'insider inactive after days');
  endDay(ctx, cfg);
})();

(function testInsiderBias(){
  const baseCtx = createInitialState(ASSET_DEFS.slice(0,1));
  applyOvernightOutlook(baseCtx);
  const baseMu = baseCtx.assets[0].outlook.mu;
  const ctx = createInitialState(ASSET_DEFS.slice(0,1));
  ctx.state.insiderTip = { sym: ctx.assets[0].sym, daysLeft: CFG.INSIDER_DAYS, mu:-0.001, sigma:0.005, bias:-1 };
  applyOvernightOutlook(ctx);
  const mu = ctx.assets[0].outlook.mu;
  assert(Math.abs((mu - baseMu) - ctx.state.insiderTip.mu * CFG.INSIDER_EFFECT_MULT) < 1e-9, 'tip mu applied with multiplier');
})();
