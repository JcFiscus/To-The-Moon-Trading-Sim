import { save, load } from '../core/persist.js';
import { createInitialState } from '../core/state.js';
import { ASSET_DEFS } from '../config.js';

test('save and load round trip state', () => {
  const ctx = createInitialState(ASSET_DEFS.slice(0,1));
  ctx.state.cash = 123;
  const ok = save(ctx.state, ctx.market, ctx.assets, 1);
  expect(ok).toBe(true);
  ctx.state.cash = 0;
  const loaded = load(ctx, 1);
  expect(loaded).toBe(true);
  expect(ctx.state.cash).toBe(123);
});
