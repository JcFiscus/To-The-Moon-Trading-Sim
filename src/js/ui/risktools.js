function loadSaved(){
  try{ return JSON.parse(localStorage.getItem('ttm_risktools')||'null') || null; }catch{ return null; }
}
function save(cfg){ try{ localStorage.setItem('ttm_risktools', JSON.stringify(cfg)); }catch{} }

export function initRiskTools(root, ctx){
  // merge saved → ctx.state.riskTools
  const saved = loadSaved();
  if (saved) Object.assign(ctx.state.riskTools, saved);

  const cfg = ctx.state.riskTools;

  root.innerHTML = `
    <div class="row" style="justify-content:space-between;">
      <div>Auto Risk Tools</div>
      <label class="mini"><input type="checkbox" id="rt-enabled"> Enabled</label>
    </div>
    <div class="statgrid">
      <div class="stat">
        <div class="mini">Trailing stop (%)</div>
        <input id="rt-trailing" type="number" min="0" step="0.01">
      </div>
      <div class="stat">
        <div class="mini">Hard stop (%)</div>
        <input id="rt-hard" type="number" min="0" step="0.01">
      </div>
      <div class="stat">
        <div class="mini">Stop sell fraction (0–1)</div>
        <input id="rt-stopfrac" type="number" min="0.05" max="1" step="0.05">
      </div>
      <div class="stat">
        <div class="mini">Position cap (% of net)</div>
        <input id="rt-cap" type="number" min="0.05" max="1" step="0.05">
      </div>

      <div class="stat">
        <div class="mini">TP1 threshold (%)</div>
        <input id="rt-tp1" type="number" min="0.05" step="0.05">
      </div>
      <div class="stat">
        <div class="mini">TP1 sell fraction (0–1)</div>
        <input id="rt-tp1f" type="number" min="0.05" max="1" step="0.05">
      </div>

      <div class="stat">
        <div class="mini">TP2 threshold (%)</div>
        <input id="rt-tp2" type="number" min="0.05" step="0.05">
      </div>
      <div class="stat">
        <div class="mini">TP2 sell fraction (0–1)</div>
        <input id="rt-tp2f" type="number" min="0.05" max="1" step="0.05">
      </div>

      <div class="stat">
        <div class="mini">TP3 threshold (%)</div>
        <input id="rt-tp3" type="number" min="0.05" step="0.05">
      </div>
      <div class="stat">
        <div class="mini">TP3 sell fraction (0–1)</div>
        <input id="rt-tp3f" type="number" min="0.05" max="1" step="0.05">
      </div>
    </div>
    <div class="row" style="justify-content:flex-end;margin-top:8px;">
      <button id="rt-apply" class="accent">Apply</button>
    </div>
  `;

  // hydrate inputs
  const byId = id => /** @type {HTMLInputElement} */(document.getElementById(id));
  byId('rt-enabled').checked = !!cfg.enabled;
  byId('rt-trailing').value = String((cfg.trailing||0.12).toFixed(2));
  byId('rt-hard').value     = String((cfg.hardStop||0.18).toFixed(2));
  byId('rt-stopfrac').value = String((cfg.stopSellFrac||1.0).toFixed(2));
  byId('rt-cap').value      = String((cfg.posCap||0.35).toFixed(2));
  byId('rt-tp1').value      = String((cfg.tp1||0.20).toFixed(2));
  byId('rt-tp1f').value     = String((cfg.tp1Frac||0.25).toFixed(2));
  byId('rt-tp2').value      = String((cfg.tp2||0.40).toFixed(2));
  byId('rt-tp2f').value     = String((cfg.tp2Frac||0.25).toFixed(2));
  byId('rt-tp3').value      = String((cfg.tp3||0.80).toFixed(2));
  byId('rt-tp3f').value     = String((cfg.tp3Frac||0.50).toFixed(2));

  function apply(){
    cfg.enabled = byId('rt-enabled').checked;
    cfg.trailing = Math.max(0, parseFloat(byId('rt-trailing').value)||0);
    cfg.hardStop = Math.max(0, parseFloat(byId('rt-hard').value)||0);
    cfg.stopSellFrac = Math.min(1, Math.max(0.05, parseFloat(byId('rt-stopfrac').value)||1));
    cfg.posCap = Math.min(1, Math.max(0.05, parseFloat(byId('rt-cap').value)||0.35));
    cfg.tp1 = Math.max(0, parseFloat(byId('rt-tp1').value)||0.2);
    cfg.tp1Frac = Math.min(1, Math.max(0.05, parseFloat(byId('rt-tp1f').value)||0.25));
    cfg.tp2 = Math.max(0, parseFloat(byId('rt-tp2').value)||0.4);
    cfg.tp2Frac = Math.min(1, Math.max(0.05, parseFloat(byId('rt-tp2f').value)||0.25));
    cfg.tp3 = Math.max(0, parseFloat(byId('rt-tp3').value)||0.8);
    cfg.tp3Frac = Math.min(1, Math.max(0.05, parseFloat(byId('rt-tp3f').value)||0.5));
    save(cfg);
  }
  document.getElementById('rt-apply').addEventListener('click', apply);

  // Save immediately on toggle/enter
  ['rt-enabled','rt-trailing','rt-hard','rt-stopfrac','rt-cap','rt-tp1','rt-tp1f','rt-tp2','rt-tp2f','rt-tp3','rt-tp3f']
    .forEach(id => document.getElementById(id).addEventListener('change', apply));
}
