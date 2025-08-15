import { createRNG } from '../util/rng.js';
import { createInitialState } from './state.js';
import { ASSET_DEFS } from '../config.js';

export function createStore(assetDefs = ASSET_DEFS) {
  const seed = Number(localStorage.getItem('ttm_seed') || Date.now());
  localStorage.setItem('ttm_seed', String(seed));
  const rng = createRNG(seed);
  let ctx = createInitialState(assetDefs);
  ctx.selected = ctx.assets.find(a => !a.isCrypto)?.sym || ctx.assets[0].sym;
  ctx.marketTab = 'stocks';
  function get() {
    return ctx;
  }
  function set(next) {
    ctx = Object.freeze({ ...ctx, ...next });
    return ctx;
  }
  return { get, set, rng };
}
