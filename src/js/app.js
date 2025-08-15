import { CFG } from './config.js';
import { createStore } from './core/store.js';
import { initUI } from './ui/init.js';
import { createGameLoop } from './gameLoop.js';
import { setupPersistence } from './persistence.js';

const log = msg => console.log(msg);
const store = createStore();
const ctx = store.get();

const persistence = setupPersistence(ctx, log);
let game;

const ui = initUI(ctx, {
  start: () => game.start(),
  save: persistence.save,
  reset: persistence.reset
});

game = createGameLoop(ctx, CFG, store.rng, ui.renderAll, ui.toast, log);

if (persistence.load()) log('Save loaded.');

ui.renderAll();
ui.toast('<b>Summary + Auto‑Risk enabled</b>. Configure risk rules on the right; summary appears at each close.', 'neutral');
