import { save as saveGame, load as loadGame, SAVE_VERSION } from './core/persist.js';

export function setupPersistence(ctx, log = console.log) {
  function save() {
    saveGame(ctx.state, ctx.market, ctx.assets, ctx.riskTrack, SAVE_VERSION);
    log('Save complete.');
  }
  function load() {
    return loadGame(ctx, SAVE_VERSION);
  }
  function reset() {
    if (!confirm('Hard reset?')) return;
    localStorage.removeItem('ttm_save');
    location.reload();
  }
  return { save, load, reset };
}
