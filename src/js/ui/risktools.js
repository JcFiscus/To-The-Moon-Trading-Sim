function loadSaved(){
  try{ return JSON.parse(localStorage.getItem('ttm_risktools')||'null') || null; }catch{ return null; }
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
      <label class="mini"><input type="checkbox" id="rt-enabled"> Enabled</label>
    </div>
    <div class="mini">Presets</div>
    <div class="row preset-row">
      <button class="chip-btn" id="rt-pre-con">Conservative</button>
      <button class="chip-btn" id="rt-pre-bal">Balanced</button>
      <button class="chip-btn" id="rt-pre-agg">Aggressive</button>
    </div>
    <div class="section">
      <div class="mini section-title">Protection</div>
      <div class="statgrid">
        <div class="stat">
          <div class="mini" title="Sell after price falls from peak by this percent">Trailing stop</div>
          <div class="slider"><input id="rt-trailing" type="range" min="0" max="50" step="1"><span class="mini" id="rt-trailing-val"></span></div>
        </div>
        <div class="stat">
          <div class="mini" title="Maximum loss tolerated on a position">Hard stop</div>
          <div class="slider"><input id="rt-hard" type="range" min="0" max="60" step="1"><span class="mini" id="rt-hard-val"></span></div>
        </div>
        <div class="stat">
          <div class="mini" title="Fraction of position sold when a stop triggers">Stop sell fraction</div>
          <div class="slider"><input id="rt-stopfrac" type="range" min="5" max="100" step="5"><span class="mini" id="rt-stopfrac-val"></span></div>
        </div>
      </div>
    </div>
    <div class="section">
      <div class="mini section-title">Take-Profit Ladder</div>
      <div class="statgrid">
        <div class="stat">
          <div class="mini" title="Gain needed to trigger the first take profit">TP1 threshold</div>
          <div class="slider"><input id="rt-tp1" type="range" min="5" max="200" step="5"><span class="mini" id="rt-tp1-val"></span></div>
        </div>
        <div class="stat">
          <div class="mini" title="Percent of position sold at TP1">TP1 sell fraction</div>
          <div class="slider"><input id="rt-tp1f" type="range" min="5" max="100" step="5"><span class="mini" id="rt-tp1f-val"></span></div>
        </div>
        <div class="stat">
          <div class="mini" title="Gain needed to trigger the second take profit">TP2 threshold</div>
          <div class="slider"><input id="rt-tp2" type="range" min="5" max="200" step="5"><span class="mini" id="rt-tp2-val"></span></div>
        </div>
        <div class="stat">
          <div class="mini" title="Percent of position sold at TP2">TP2 sell fraction</div>
          <div class="slider"><input id="rt-tp2f" type="range" min="5" max="100" step="5"><span class="mini" id="rt-tp2f-val"></span></div>
        </div>
        <div class="stat">
          <div class="mini" title="Gain needed to trigger the third take profit">TP3 threshold</div>
          <div class="slider"><input id="rt-tp3" type="range" min="5" max="200" step="5"><span class="mini" id="rt-tp3-val"></span></div>
        </div>
        <div class="stat">
          <div class="mini" title="Percent of position sold at TP3">TP3 sell fraction</div>
          <div class="slider"><input id="rt-tp3f" type="range" min="5" max="100" step="5"><span class="mini" id="rt-tp3f-val"></span></div>
        </div>
      </div>
    </div>
    <div class="section">
      <div class="mini section-title">Exposure cap</div>
      <div class="statgrid">
        <div class="stat">
          <div class="mini" title="Maximum portfolio allocation to a single position">Position cap</div>
          <div class="slider"><input id="rt-cap" type="range" min="5" max="100" step="5"><span class="mini" id="rt-cap-val"></span></div>
        </div>
      </div>
    </div>
    <div class="row" style="justify-content:flex-end;margin-top:8px;">
      <span class="mini" id="rt-summary" style="flex:1"></span>
      <button id="rt-apply" class="accent">Apply</button>
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
    if (toast) {
      toast('Saved', 'good');
    }
  }
  document.getElementById('rt-apply').addEventListener('click', apply);

  ['rt-trailing','rt-hard','rt-stopfrac','rt-cap','rt-tp1','rt-tp1f','rt-tp2','rt-tp2f','rt-tp3','rt-tp3f']
    .forEach(id => {
      const el = byId(id);
      el.addEventListener('input', () => { byId(id+'-val').textContent = el.value + '%'; });
    });

  // Save immediately on toggle/enter
  ['rt-enabled','rt-trailing','rt-hard','rt-stopfrac','rt-cap','rt-tp1','rt-tp1f','rt-tp2','rt-tp2f','rt-tp3','rt-tp3f']
    .forEach(id => byId(id).addEventListener('change', apply));

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
    Object.assign(cfg, presets[p]);
    hydrate();
    apply();
  }
  document.getElementById('rt-pre-con').addEventListener('click', () => setPreset('con'));
  document.getElementById('rt-pre-bal').addEventListener('click', () => setPreset('bal'));
  document.getElementById('rt-pre-agg').addEventListener('click', () => setPreset('agg'));
}
