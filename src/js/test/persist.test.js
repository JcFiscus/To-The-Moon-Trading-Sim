import { save, load, SAVE_VERSION } from '../core/persist.js';
import { createInitialState } from '../core/state.js';
import { ASSET_DEFS } from '../config.js';

test('save and load round trip state and riskTrack', () => {
  const ctx = createInitialState(ASSET_DEFS.slice(0,1));
  ctx.state.cash = 123;
  ctx.riskTrack[ctx.assets[0].sym] = { peak: 100, lastTP: 1, lastRule: 'TP1' };
  const ok = save(ctx.state, ctx.market, ctx.assets, ctx.riskTrack, SAVE_VERSION);
  expect(ok).toBe(true);
  ctx.state.cash = 0;
  ctx.riskTrack = {};
  const loaded = load(ctx, SAVE_VERSION);
  expect(loaded).toBe(true);
  expect(ctx.state.cash).toBe(123);
  expect(ctx.riskTrack[ctx.assets[0].sym].lastRule).toBe('TP1');
});
