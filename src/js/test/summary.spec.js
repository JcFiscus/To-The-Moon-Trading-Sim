import assert from 'assert';
import { CFG, ASSET_DEFS } from '../config.js';
import { createInitialState } from '../core/state.js';
import { startDay, endDay } from '../core/cycle.js';

(function testSummaryFilters(){
  const cfg = { ...CFG, INTRADAY_EVENT_P:0, AH_EVENT_P:0, AH_SUPPLY_EVENT_P:0 };
  const ctx1 = createInitialState(ASSET_DEFS);
  ctx1.state.positions.H3 = 5;
  ctx1.state.positions.BTC = 2;
  ctx1.state.upgrades.crypto = false;
  startDay(ctx1, cfg);
  const sum1 = endDay(ctx1, cfg);
  assert(sum1.rows.some(r=>r.sym==='H3'), 'held stock included');
  assert(!sum1.rows.some(r=>r.sym==='BTC'), 'crypto excluded when locked');
  assert(!sum1.rows.some(r=>r.sym==='QNTM'), 'unheld asset excluded');

  const ctx2 = createInitialState(ASSET_DEFS);
  ctx2.state.positions.H3 = 5;
  ctx2.state.positions.BTC = 2;
  ctx2.state.upgrades.crypto = true;
  startDay(ctx2, cfg);
  const sum2 = endDay(ctx2, cfg);
  assert(sum2.rows.some(r=>r.sym==='BTC'), 'crypto included when unlocked');

  console.log('summary.spec passed');
})();
