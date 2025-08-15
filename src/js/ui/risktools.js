function loadSaved(){
  try{
    const cfg = JSON.parse(localStorage.getItem('ttm_risktools')||'null') || null;
    if (cfg && typeof cfg.enabled === 'string') cfg.enabled = cfg.enabled === 'true';
    return cfg;
  }catch{ return null; }
}
function save(cfg){
  try {
    localStorage.setItem('ttm_risktools', JSON.stringify(cfg));
  } catch {
    // ignore persistence errors
  }
}

export function initRiskTools(root, ctx, toast){
  // merge saved → ctx.state.riskTools
  const saved = loadSaved();
  if (saved) Object.assign(ctx.state.riskTools, saved);

  const cfg = ctx.state.riskTools;

  root.innerHTML = `
    <div class="row" style="justify-content:space-between;">
      <div>Auto Risk Tools</div>
      <label class="mini" for="rt-enabled" title="Apply configured stops and take-profits automatically">
        <input type="checkbox" id="rt-enabled"> Enabled
      </label>
    </div>
    <div class="mini" id="rt-summary" style="margin-top:4px"></div>
    <label for="rt-preset" class="mini" style="margin-top:8px">Preset</label>
    <select id="rt-preset" class="mini">
      <option value="">Custom</option>
      <option value="con">Conservative</option>
      <option value="bal">Balanced</option>
      <option value="agg">Aggressive</option>
    </select>
    <form id="rt-form">
      <fieldset class="rt-group">
        <legend class="mini section-title">Stops</legend>
        <div class="statgrid">
          <div class="stat">
            <label for="rt-trailing" class="mini" title="Sell after price falls from peak by this percent">Trailing stop</label>
            <div class="slider"><input id="rt-trailing" type="range" min="0" max="50" step="1"><span class="mini" id="rt-trailing-val"></span></div>
          </div>
          <div class="stat">
            <label for="rt-hard" class="mini" title="Maximum loss tolerated on a position">Hard stop</label>
            <div class="slider"><input id="rt-hard" type="range" min="0" max="60" step="1"><span class="mini" id="rt-hard-val"></span></div>
          </div>
          <div class="stat">
            <label for="rt-stopfrac" class="mini" title="Fraction of position sold when a stop triggers">Stop sell fraction</label>
            <div class="slider"><input id="rt-stopfrac" type="range" min="5" max="100" step="5"><span class="mini" id="rt-stopfrac-val"></span></div>
          </div>
        </div>
      </fieldset>
      <fieldset class="rt-group">
        <legend class="mini section-title">Take-Profit Ladder</legend>
        <div class="statgrid">
          <div class="stat">
            <label for="rt-tp1" class="mini" title="Gain needed to trigger the first take profit">TP1 threshold</label>
            <div class="slider"><input id="rt-tp1" type="range" min="5" max="200" step="5"><span class="mini" id="rt-tp1-val"></span></div>
          </div>
          <div class="stat">
            <label for="rt-tp1f" class="mini" title="Percent of position sold at TP1">TP1 sell fraction</label>
            <div class="slider"><input id="rt-tp1f" type="range" min="5" max="100" step="5"><span class="mini" id="rt-tp1f-val"></span></div>
          </div>
          <div class="stat">
            <label for="rt-tp2" class="mini" title="Gain needed to trigger the second take profit">TP2 threshold</label>
            <div class="slider"><input id="rt-tp2" type="range" min="5" max="200" step="5"><span class="mini" id="rt-tp2-val"></span></div>
          </div>
          <div class="stat">
            <label for="rt-tp2f" class="mini" title="Percent of position sold at TP2">TP2 sell fraction</label>
            <div class="slider"><input id="rt-tp2f" type="range" min="5" max="100" step="5"><span class="mini" id="rt-tp2f-val"></span></div>
          </div>
          <div class="stat">
            <label for="rt-tp3" class="mini" title="Gain needed to trigger the third take profit">TP3 threshold</label>
            <div class="slider"><input id="rt-tp3" type="range" min="5" max="200" step="5"><span class="mini" id="rt-tp3-val"></span></div>
          </div>
          <div class="stat">
            <label for="rt-tp3f" class="mini" title="Percent of position sold at TP3">TP3 sell fraction</label>
            <div class="slider"><input id="rt-tp3f" type="range" min="5" max="100" step="5"><span class="mini" id="rt-tp3f-val"></span></div>
          </div>
        </div>
      </fieldset>
      <fieldset class="rt-group">
        <legend class="mini section-title">Exposure cap</legend>
        <div class="statgrid">
          <div class="stat">
            <label for="rt-cap" class="mini" title="Maximum portfolio allocation to a single position">Position cap</label>
            <div class="slider"><input id="rt-cap" type="range" min="5" max="100" step="5"><span class="mini" id="rt-cap-val"></span></div>
          </div>
        </div>
      </fieldset>
      <div class="row" style="justify-content:flex-end;margin-top:8px;">
        <button type="button" id="rt-apply" class="mini">Apply</button>
      </div>
    </form>
    <div class="section">
      <div class="mini section-title">Status</div>
      <table id="rt-stats" class="mini"></table>
    </div>
  `;

  const byId = id => /** @type {HTMLInputElement} */(document.getElementById(id));

  function hydrate(){
    byId('rt-enabled').checked = !!cfg.enabled;
    byId('rt-trailing').value = String(Math.round((cfg.trailing||0.12)*100));
    byId('rt-hard').value     = String(Math.round((cfg.hardStop||0.18)*100));
    byId('rt-stopfrac').value = String(Math.round((cfg.stopSellFrac||1.0)*100));
    byId('rt-cap').value      = String(Math.round((cfg.posCap||0.35)*100));
    byId('rt-tp1').value      = String(Math.round((cfg.tp1||0.20)*100));
    byId('rt-tp1f').value     = String(Math.round((cfg.tp1Frac||0.25)*100));
    byId('rt-tp2').value      = String(Math.round((cfg.tp2||0.40)*100));
    byId('rt-tp2f').value     = String(Math.round((cfg.tp2Frac||0.25)*100));
    byId('rt-tp3').value      = String(Math.round((cfg.tp3||0.80)*100));
    byId('rt-tp3f').value     = String(Math.round((cfg.tp3Frac||0.50)*100));
    ['trailing','hard','stopfrac','cap','tp1','tp1f','tp2','tp2f','tp3','tp3f'].forEach(k=>{
      byId(`rt-${k}-val`).textContent = byId(`rt-${k}`).value + '%';
    });
    updateSummary();
  }
  hydrate();
  hideUnavailable();

  function renderStats(){
    const tbl = document.getElementById('rt-stats');
    if (!tbl) return;
    const tps = [
      [cfg.tp1 || 0.2, 1],
      [cfg.tp2 || 0.4, 2],
      [cfg.tp3 || 0.8, 3]
    ];
    let html = '<tr><th>Sym</th><th>Basis</th><th>Peak</th><th>Ret%</th><th>DD%</th><th>Next TP</th><th>Last</th></tr>';
    for (const a of ctx.assets){
      const sym = a.sym;
      const have = ctx.state.positions[sym] || 0;
      if (have <= 0) continue;
      const cb = ctx.state.costBasis[sym] || {qty:0, avg:a.price};
      const basis = cb.avg || a.price;
      const tr = ctx.riskTrack[sym] || {peak:a.price, lastTP:0, lastRule:''};
      const ret = a.price / basis - 1;
      const draw = a.price / tr.peak - 1;
      const next = tps.find(([, stage]) => stage > (tr.lastTP||0));
      const nextTxt = next ? `${Math.round(next[0]*100)}%` : '—';
      const last = tr.lastRule || '—';
      html += `<tr><td>${sym}</td><td>${basis.toFixed(2)}</td><td>${tr.peak.toFixed(2)}</td><td>${(ret*100).toFixed(1)}%</td><td>${(draw*100).toFixed(1)}%</td><td>${nextTxt}</td><td>${last}</td></tr>`;
    }
    tbl.innerHTML = html;
  }

  ctx.renderRiskStats = renderStats;
  renderStats();

  function apply(){
    cfg.enabled = byId('rt-enabled').checked;
    cfg.trailing = Math.max(0, parseFloat(byId('rt-trailing').value)||0)/100;
    cfg.hardStop = Math.max(0, parseFloat(byId('rt-hard').value)||0)/100;
    cfg.stopSellFrac = Math.min(1, Math.max(0.05, parseFloat(byId('rt-stopfrac').value)||100)/100);
    cfg.posCap = Math.min(1, Math.max(0.05, parseFloat(byId('rt-cap').value)||35)/100);
    cfg.tp1 = Math.max(0, parseFloat(byId('rt-tp1').value)||20)/100;
    cfg.tp1Frac = Math.min(1, Math.max(0.05, parseFloat(byId('rt-tp1f').value)||25)/100);
    cfg.tp2 = Math.max(0, parseFloat(byId('rt-tp2').value)||40)/100;
    cfg.tp2Frac = Math.min(1, Math.max(0.05, parseFloat(byId('rt-tp2f').value)||25)/100);
    cfg.tp3 = Math.max(0, parseFloat(byId('rt-tp3').value)||80)/100;
    cfg.tp3Frac = Math.min(1, Math.max(0.05, parseFloat(byId('rt-tp3f').value)||50)/100);
    save(cfg);
    updateSummary();
    renderStats();
    if (toast) {
      toast('Saved', 'good');
    }
  }

  ['rt-trailing','rt-hard','rt-stopfrac','rt-cap','rt-tp1','rt-tp1f','rt-tp2','rt-tp2f','rt-tp3','rt-tp3f'].forEach(id => {
    const el = byId(id);
    el.addEventListener('input', () => { byId(id+'-val').textContent = el.value + '%'; });
    el.addEventListener('change', () => { byId('rt-preset').value = ''; });
  });
  byId('rt-enabled').addEventListener('change', () => { byId('rt-preset').value = ''; });
  byId('rt-apply').addEventListener('click', apply);

  function hideUnavailable(){
    if (!ctx.state.upgrades.options){
      root.querySelectorAll('.needs-options').forEach(el => el.style.display = 'none');
    }
    if (!ctx.state.upgrades.crypto){
      root.querySelectorAll('.needs-crypto').forEach(el => el.style.display = 'none');
    }
  }

  function pct(v){ return Math.round(v*100)+'%'; }
  function updateSummary(){
    const txt = cfg.enabled
      ? `TS ${pct(cfg.trailing)} • HS ${pct(cfg.hardStop)} • Cap ${pct(cfg.posCap)} • TP1 ${pct(cfg.tp1)}/${pct(cfg.tp1Frac)} • TP2 ${pct(cfg.tp2)}/${pct(cfg.tp2Frac)} • TP3 ${pct(cfg.tp3)}/${pct(cfg.tp3Frac)}`
      : 'Disabled';
    const el = document.getElementById('rt-summary');
    if (el) el.textContent = txt;
  }

  // Presets
  const presets = {
    con:{ trailing:0.08, hardStop:0.12, stopSellFrac:1, posCap:0.25, tp1:0.15, tp1Frac:0.25, tp2:0.30, tp2Frac:0.25, tp3:0.60, tp3Frac:0.50 },
    bal:{ trailing:0.12, hardStop:0.18, stopSellFrac:1, posCap:0.35, tp1:0.20, tp1Frac:0.25, tp2:0.40, tp2Frac:0.25, tp3:0.80, tp3Frac:0.50 },
    agg:{ trailing:0.20, hardStop:0.25, stopSellFrac:1, posCap:0.50, tp1:0.25, tp1Frac:0.30, tp2:0.50, tp2Frac:0.30, tp3:1.00, tp3Frac:0.50 }
  };
  function setPreset(p){
    byId('rt-preset').value = p;
    Object.assign(cfg, presets[p]);
    hydrate();
    renderStats();
    apply();
  }
  byId('rt-preset').addEventListener('change', e => {
    const val = e.target.value;
    if (val) setPreset(val);
  });
}
