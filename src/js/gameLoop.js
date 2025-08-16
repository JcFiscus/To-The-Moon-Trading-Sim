import { startDay, stepTick, endDay, enqueueAfterHours } from './core/cycle.js';
import { computeAnalyst } from './core/priceModel.js';
import { evaluateRisk } from './core/risk.js';
import { showSummary, showGameOver } from './ui/modal.js';

export function createGameLoop(ctx, cfg, rng, renderAll, toast, log) {
  let interval = null;
  function start() {
    if (ctx.day.active) return;
    startDay(ctx, cfg, { log, toast });
    for (const a of ctx.assets) a.analyst = computeAnalyst(a, ctx.market, cfg);
    renderAll();
    interval = setInterval(() => {
      stepTick(ctx, cfg, rng, { log, toast });
      if (ctx.gameOver) {
        clearInterval(interval);
        interval = null;
        renderAll();
        showGameOver(() => {
          localStorage.removeItem('ttm_save');
          location.reload();
        });
        return;
      }
      evaluateRisk(ctx, { log, toast });
      renderAll();
      if (ctx.day.ticksLeft <= 0) {
        clearInterval(interval);
        interval = null;
        const summary = endDay(ctx, cfg, { log, toast });
        enqueueAfterHours(ctx, cfg, rng, { log, toast });
        renderAll();
        if (summary.gameOver || ctx.gameOver) {
          showGameOver(() => {
            localStorage.removeItem('ttm_save');
            location.reload();
          });
        } else {
          showSummary(summary, () => {
            start();
          });
        }
      }
    }, 1000);
  }
  return { start };
}
