import assert from 'assert';
import { createRNG } from '../util/rng.js';
import { CFG, ASSET_DEFS } from '../config.js';
import { createInitialState } from '../core/state.js';
import { startDay, stepTick, endDay } from '../core/cycle.js';
import { EVENT_POOL, randomEvent } from '../core/events.js';

function runDays(ctx, days, rng, cfg){
  for(let d=0; d<days; d++){
    startDay(ctx, cfg);
    for(let t=0; t<cfg.DAY_TICKS; t++) stepTick(ctx, cfg, rng);
    endDay(ctx, cfg);
  }
}

(function testMeanReversion(){
  const cfg = { ...CFG, INTRADAY_EVENT_P:0, AH_EVENT_P:0, AH_SUPPLY_EVENT_P:0 };
  const ctx = createInitialState(ASSET_DEFS.slice(0,1));
  const rng = createRNG(1); rng.normal=()=>0;
  const a = ctx.assets[0];
  const start = a.price;
  a.price = start*5; a.fair = start; a.history.fill(a.price);
  runDays(ctx,5,rng,cfg); // 50 ticks
  assert(a.price < start*5, 'price exceeded 500% of start');
  assert(a.price/a.fair < 2, 'price failed to revert toward fair');
})();

(function testRotationDrag(){
  const cfg = { ...CFG, INTRADAY_EVENT_P:0, AH_EVENT_P:0, AH_SUPPLY_EVENT_P:0 };
  const ctx = createInitialState(ASSET_DEFS.slice(0,2));
  const [a0,a1] = ctx.assets;
  a0.history.fill(100); a0.price=100; a0.fair=100;
  a1.history.fill(100); a1.price=100; a1.fair=100;
  a0.history[a0.history.length-6] = 50; // a0 outperforms
  const rng = createRNG(2); rng.normal=()=>0;
  const old = CFG.ROTATION_K; CFG.ROTATION_K = 0.05;
  startDay(ctx,cfg); stepTick(ctx,cfg,rng);
  CFG.ROTATION_K = old;
  assert(a0.price < 100, 'surging asset should face rotation drag');
  assert(a1.price > 100, 'lagging asset should get positive drift');
})();

(function testEventGating(){
  const ctx = createInitialState(ASSET_DEFS.slice(0,1));
  const rng = createRNG(3);
  const original = EVENT_POOL.slice();
  EVENT_POOL.length = 0;
  EVENT_POOL.push(
    {scope:'global', title:'Base', type:'base', mu:0, sigma:0, demand:0, days:1, severity:'minor'},
    {scope:'global', title:'Opt', type:'options_flow', mu:0, sigma:0, demand:0, days:1, severity:'minor', requires:['options']}
  );
  for(let i=0;i<20;i++){
    const ev = randomEvent(ctx, rng);
    assert.notStrictEqual(ev.type, 'options_flow', 'gated event appeared before unlock');
  }
  ctx.state.upgrades.options = true;
  let seen = false;
  for(let i=0;i<20;i++){
    const ev = randomEvent(ctx, rng);
    if(ev.type === 'options_flow'){ seen = true; break; }
  }
  assert(seen, 'gated event did not appear after unlock');
  EVENT_POOL.length = 0; original.forEach(ev=>EVENT_POOL.push(ev));
})();

(function testPriceDynamics(){
  const cfg = { ...CFG, INTRADAY_EVENT_P:0, AH_EVENT_P:0, AH_SUPPLY_EVENT_P:0 };
  const ctx = createInitialState(ASSET_DEFS.slice(0,3));
  const rng = createRNG(5);
  runDays(ctx,10,rng,cfg);
  let sawDrawdown=false;
  for(const a of ctx.assets){
    const closes=[];
    for(let d=0; d<ctx.day.idx; d++){
      const end = (d+1<ctx.day.idx) ? a.dayBounds[d+1] : a.history.length;
      closes.push(a.history[end-1]);
    }
    let dirChanges=0;
    for(let i=2;i<closes.length;i++){
      const prevDir=Math.sign(closes[i-1]-closes[i-2]);
      const dir=Math.sign(closes[i]-closes[i-1]);
      if(prevDir!==0 && dir!==0 && dir!==prevDir) dirChanges++;
    }
    assert(dirChanges>=2, `${a.sym} lacked direction changes`);
    const ret7 = closes[6]/closes[0]-1;
    assert(Math.abs(ret7)<=2, `${a.sym} 7-day return beyond ±200%`);
    let peak=closes[0], maxDD=0;
    for(let i=1;i<=6;i++){ if(closes[i]>peak) peak=closes[i]; const dd=(peak-closes[i])/peak; if(dd>maxDD) maxDD=dd; }
    if(maxDD>=0.10) sawDrawdown=true;
    const sevenMax=Math.max(...closes.slice(0,7));
    const sevenMin=Math.min(...closes.slice(0,7));
    assert(sevenMax/sevenMin <= CFG.RUN_CAP_MULTIPLE * 1.05, `${a.sym} exceeded run cap`);
  }
  assert(sawDrawdown, 'no asset had 10% pullback');
})();
