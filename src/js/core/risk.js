import { sell } from './trading.js';

function portfolioValue(ctx){
  let val = ctx.assets.reduce((s,a)=> s + (ctx.state.positions[a.sym]||0)*a.price, 0);
  for (const m of ctx.state.marginPositions || []){
    const a = ctx.assets.find(x => x.sym === m.sym);
    if (a) val += m.qty * a.price;
  }
  return val;
}
function netWorth(ctx){
  return ctx.state.cash + portfolioValue(ctx) - ctx.state.debt;
}

/** Auto‑risk executor: trailing/hard stops, take‑profit ladder, position cap. */
export function evaluateRisk(ctx, hooks){
  const cfg = ctx.state.riskTools || {};
  if (cfg.enabled !== true) return;
  for (const a of ctx.assets){
    const sym = a.sym;
    const have = ctx.state.positions[sym] || 0;
    if (have <= 0) continue;

    const cb = ctx.state.costBasis[sym] || {qty:0, avg:a.price};
    const basis = cb.avg || a.price;

    // tracker with holding age
    const tr = ctx.riskTrack[sym] || { peak: a.price, lastTP: 0, lastRule: '', age: 1 };
    if (tr.age < 1){
      tr.peak = a.price;
      tr.age++;
      ctx.riskTrack[sym] = tr;
      continue; // grace period: ignore first tick after buy
    }
    tr.peak = Math.max(tr.peak, a.price);

    const ret = a.price / basis - 1;               // performance vs basis
    const drawdown = a.price / tr.peak - 1;        // trailing from peak

    let fired = false;

    // HARD STOP (vs basis)
    if (ret <= -(cfg.hardStop || 0)){
      const qty = Math.max(1, Math.ceil(have * (cfg.stopSellFrac || 1)));
      const done = sell(ctx, sym, qty, hooks);
      if (done > 0){
        hooks?.log?.(`Auto‑STOP ${sym}: −${Math.round((cfg.hardStop||0)*100)}% from basis → sold ${done}`);
        tr.peak = a.price; tr.lastTP = 0; tr.lastRule = 'STOP';
        fired = true;
      }
    }

    // TRAILING STOP (vs peak)
    if (!fired && drawdown <= -(cfg.trailing || 0)){
      const qty = Math.max(1, Math.ceil(have * (cfg.stopSellFrac || 1)));
      const done = sell(ctx, sym, qty, hooks);
      if (done > 0){
        hooks?.log?.(`Auto‑TRAIL ${sym}: −${Math.round((cfg.trailing||0)*100)}% from peak → sold ${done}`);
        tr.peak = a.price; tr.lastTP = 0; tr.lastRule = 'TRAIL';
        fired = true;
      }
    }

    // TAKE-PROFIT LADDER (vs basis)
    if (!fired){
      const tps = [
        [cfg.tp1 || 0.2, cfg.tp1Frac || 0.25, 1],
        [cfg.tp2 || 0.4, cfg.tp2Frac || 0.25, 2],
        [cfg.tp3 || 0.8, cfg.tp3Frac || 0.50, 3]
      ];
      for (const [thr, frac, stage] of tps){
        if (ret >= thr && tr.lastTP < stage){
          const qty = Math.max(1, Math.ceil(have * frac));
          const done = sell(ctx, sym, qty, hooks);
          if (done > 0){
            hooks?.log?.(`Auto‑TP ${sym}: +${Math.round(thr*100)}% hit → sold ${done}`);
            tr.lastTP = stage; tr.lastRule = `TP${stage}`; fired = true;
          }
          break; // one ladder step per tick max
        }
      }
    }

    // POSITION CAP (% of net worth)
    if (!fired){
      const net = Math.max(1, netWorth(ctx));
      const cap = (cfg.posCap || 0.35) * net;
      const posVal = have * a.price;
      if (posVal > cap){
        const excess = posVal - cap;
        const qty = Math.max(1, Math.ceil(excess / a.price));
        const done = sell(ctx, sym, qty, hooks);
        if (done > 0){
          hooks?.log?.(`Auto‑CAP ${sym}: trimmed ${done} to keep ≤ ${(cfg.posCap*100).toFixed(0)}% of net`);
          tr.lastRule = 'CAP';
        }
      }
    }

    tr.age++;
    ctx.riskTrack[sym] = tr;
  }
}
