// To-The-Moon Trading Sim — Upgrade Store (drop-in)
// Minimal integration hooks:
//  1) After you update each asset price per tick: Upgrades.applyBiasOnTick(asset);
//  2) At day end: Upgrades.accrueDailyInterest({ getCash:()=>state.cash, setCash:v=>{state.cash=v; /*refresh UI*/} });
//  3) In your Buy handler before funds check:
//       const borrowed = Upgrades.maybeBorrow({ cost, cash: state.cash, equity: state.cash + portfolioValue() });
//       state.cash += borrowed;

(() => {
  const $$ = (sel, root=document) => root.querySelector(sel);
  const $$$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  const S = {
    tick: 0,
    margin: {
      tier: 0,                // 0=none,1=1.5x,2=2.0x
      maxLeverage: 1.0,
      ratePerDay: 0.0,        // daily interest on outstanding loan
      loan: 0                 // running principal
    },
    costs: {
      marginT1: 5000,
      marginT2: 25000,
      insiderTip: 2500
    },
    tips: new Map(),          // key -> {ticks, driftPerTick}
    cfg: {
      getCash: null,
      setCash: null,
      getEquity: null,
      listAssetKeys: () => [] // optional for dropdown
    }
  };

  const currency = n => `$${Number(n).toLocaleString(undefined,{maximumFractionDigits:2})}`;

  const Upgrades = {
    // Optional: wire cash/equity accessors so the UI buttons can debit/credit directly.
    configure({ getCash, setCash, getEquity, listAssetKeys }={}) {
      if (typeof getCash === 'function') S.cfg.getCash = getCash;
      if (typeof setCash === 'function') S.cfg.setCash = setCash;
      if (typeof getEquity === 'function') S.cfg.getEquity = getEquity;
      if (typeof listAssetKeys === 'function') S.cfg.listAssetKeys = listAssetKeys;
      Upgrades._refreshUI();
    },

    // Called once per asset per tick AFTER your engine updates price
    applyBiasOnTick(asset) {
      // detect asset key
      const key = asset?.key || asset?.symbol || asset?.id || asset?.name;
      if (!key) return;
      const tip = S.tips.get(key);
      if (!tip || tip.ticks <= 0) return;
      asset.price = Number(asset.price) * (1 + tip.driftPerTick); // gentle push up
      tip.ticks -= 1;
      if (tip.ticks <= 0) S.tips.delete(key);
      S.tick++;
      Upgrades._refreshUI(); // update badges
    },

    // Call once per in-game day
    accrueDailyInterest({ getCash, setCash } = {}) {
      const gc = getCash || S.cfg.getCash;
      const sc = setCash || S.cfg.setCash;
      if (!gc || !sc) return; // cannot apply if cash I/O unknown
      if (S.margin.loan <= 0 || S.margin.ratePerDay <= 0) return;

      const interest = +(S.margin.loan * S.margin.ratePerDay).toFixed(2);
      if (interest <= 0) return;

      let cash = gc();
      if (cash >= interest) {
        cash -= interest;
        sc(cash);
      } else {
        // capitalize unpaid interest
        S.margin.loan += (interest - cash);
        sc(0);
      }
      // Always add interest to principal
      S.margin.loan += interest;
      Upgrades._toast(`Interest charged ${currency(interest)}. Loan ${currency(S.margin.loan)}.`);
      Upgrades._refreshUI();
    },

    // Use inside your Buy handler to cover shortfall via margin
    maybeBorrow({ cost, cash, equity }) {
      if (S.margin.maxLeverage <= 1) return 0;
      const eq = Math.max(0, Number(equity ?? cash ?? 0));
      const maxBorrowNow = Math.max(0, eq * (S.margin.maxLeverage - 1) - S.margin.loan);
      const shortfall = Math.max(0, Number(cost) - Number(cash));
      const borrowed = Math.min(shortfall, maxBorrowNow);
      if (borrowed > 0) S.margin.loan += borrowed;
      Upgrades._refreshUI();
      return borrowed;
    },

    // Store purchases (UI calls these). Safe if cash accessors set.
    buyMarginTier(tier) {
      if (!S.cfg.getCash || !S.cfg.setCash) return Upgrades._toast('Connect cash accessors first.');
      if (tier === 1 && S.margin.tier < 1) {
        if (S.cfg.getCash() < S.costs.marginT1) return Upgrades._toast('Not enough cash.');
        S.cfg.setCash(S.cfg.getCash() - S.costs.marginT1);
        S.margin.tier = 1; S.margin.maxLeverage = 1.5; S.margin.ratePerDay = 0.005;
        Upgrades._toast('Margin Tier 1 enabled. 1.5× leverage, 0.5% daily interest.');
      } else if (tier === 2 && S.margin.tier < 2) {
        if (S.cfg.getCash() < S.costs.marginT2) return Upgrades._toast('Not enough cash.');
        S.cfg.setCash(S.cfg.getCash() - S.costs.marginT2);
        S.margin.tier = 2; S.margin.maxLeverage = 2.0; S.margin.ratePerDay = 0.008;
        Upgrades._toast('Margin Tier 2 enabled. 2.0× leverage, 0.8% daily interest.');
      } else {
        return Upgrades._toast('Already at this tier or higher.');
      }
      Upgrades._refreshUI();
    },

    buyInsiderTip(assetKey) {
      if (!assetKey) return Upgrades._toast('Pick an asset.');
      if (!S.cfg.getCash || !S.cfg.setCash) return Upgrades._toast('Connect cash accessors first.');
      if (S.cfg.getCash() < S.costs.insiderTip) return Upgrades._toast('Not enough cash.');
      S.cfg.setCash(S.cfg.getCash() - S.costs.insiderTip);

      // 20 ticks of +0.35–0.6% drift each tick
      const drift = 0.0035 + Math.random() * 0.0025;
      S.tips.set(assetKey, { ticks: 20, driftPerTick: drift });
      Upgrades._toast(`Insider tip on ${assetKey}: bias active for 20 ticks.`);
      Upgrades._refreshUI();
    },

    getState() {
      return JSON.parse(JSON.stringify({
        tick: S.tick,
        margin: S.margin,
        tips: Array.from(S.tips.entries())
      }));
    },

    // --- UI below (self-contained) ---
    _toast(msg) {
      const el = document.createElement('div');
      el.className = 'upg-toast';
      el.textContent = msg;
      document.body.appendChild(el);
      setTimeout(() => el.classList.add('show'));
      setTimeout(() => { el.classList.remove('show'); el.remove(); }, 2600);
    },

    _refreshUI() {
      const cashEl = $$('#upg-cash');
      if (cashEl && S.cfg.getCash) cashEl.textContent = currency(S.cfg.getCash());
      const tierEl = $$('#upg-tier'); if (tierEl) tierEl.textContent = `T${S.margin.tier} • ${S.margin.maxLeverage.toFixed(1)}×`;
      const loanEl = $$('#upg-loan'); if (loanEl) loanEl.textContent = currency(S.margin.loan);
      const rateEl = $$('#upg-rate'); if (rateEl) rateEl.textContent = `${(S.margin.ratePerDay*100).toFixed(2)}% /day`;
      const tipBadge = $$('#upg-tip-badge');
      if (tipBadge) tipBadge.textContent = `${S.tips.size}`;
      const sel = $$('#upg-asset'); if (sel) {
        // populate asset list once if provider exists
        if (!sel.dataset.filled && S.cfg.listAssetKeys) {
          const keys = S.cfg.listAssetKeys() || [];
          keys.forEach(k => { const o=document.createElement('option'); o.value=k; o.textContent=k; sel.appendChild(o); });
          sel.dataset.filled = '1';
        }
      }
    },

    _injectUI() {
      const css = `
      .upg-fab{position:fixed;right:16px;bottom:16px;z-index:9999;background:#111;color:#fff;border:1px solid #333;border-radius:10px;padding:10px 14px;cursor:pointer;font:600 14px/1 system-ui}
      .upg-panel{position:fixed;right:16px;bottom:60px;z-index:9998;width:340px;background:#0b0b0d;color:#eee;border:1px solid #2a2a30;border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.5);display:none}
      .upg-panel.show{display:block}
      .upg-hdr{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid #222;border-radius:14px 14px 0 0;background:#121217}
      .upg-body{padding:12px}
      .upg-row{display:flex;justify-content:space-between;align-items:center;margin:8px 0}
      .upg-btn{background:#1f6feb;border:0;color:#fff;border-radius:8px;padding:8px 10px;cursor:pointer}
      .upg-btn[disabled]{opacity:.5;cursor:not-allowed}
      .upg-meta{font-size:12px;color:#9aa0a6}
      .upg-tag{display:inline-block;padding:2px 6px;border:1px solid #444;border-radius:6px;font-size:12px;margin-left:6px}
      .upg-field{width:100%;padding:6px 8px;background:#0e0e12;border:1px solid #2b2b33;border-radius:8px;color:#eaecef}
      .upg-grid{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center}
      .upg-toast{position:fixed;left:50%;transform:translateX(-50%);bottom:20px;background:#111;color:#fff;border:1px solid #333;border-radius:10px;padding:10px 14px;opacity:0;transition:opacity .2s,transform .2s;z-index:10000}
      .upg-toast.show{opacity:1;transform:translateX(-50%) translateY(-6px)}
      `;
      const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);

      const fab = document.createElement('button');
      fab.className = 'upg-fab';
      fab.id = 'upg-fab';
      fab.innerHTML = `Upgrade Store <span id="upg-tip-badge" class="upg-tag">0</span>`;
      document.body.appendChild(fab);

      const panel = document.createElement('div');
      panel.className = 'upg-panel';
      panel.id = 'upg-panel';
      panel.innerHTML = `
        <div class="upg-hdr">
          <div><strong>Upgrade Store</strong></div>
          <div class="upg-meta">Cash: <span id="upg-cash">$0.00</span></div>
        </div>
        <div class="upg-body">
          <div class="upg-row">
            <div>
              <div><strong>Margin Account</strong> <span class="upg-tag" id="upg-tier">T0 • 1.0×</span></div>
              <div class="upg-meta">Loan: <span id="upg-loan">$0.00</span> · Rate: <span id="upg-rate">0.00% /day</span></div>
            </div>
          </div>
          <div class="upg-grid">
            <div>T1 1.5×, 0.5%/day <span class="upg-meta">Cost ${currency(S.costs.marginT1)}</span></div>
            <button id="upg-buy-t1" class="upg-btn">Buy T1</button>
          </div>
          <div class="upg-grid">
            <div>T2 2.0×, 0.8%/day <span class="upg-meta">Cost ${currency(S.costs.marginT2)}</span></div>
            <button id="upg-buy-t2" class="upg-btn">Buy T2</button>
          </div>
          <hr style="border:0;border-top:1px solid #222;margin:10px 0">
          <div class="upg-row">
            <div>
              <div><strong>Insider Tip</strong> <span class="upg-meta">Bias +0.35–0.6%/tick for 20 ticks</span></div>
              <div class="upg-meta">Cost ${currency(S.costs.insiderTip)} per tip</div>
            </div>
          </div>
          <div class="upg-grid">
            <select id="upg-asset" class="upg-field">
              <option value="">Select asset…</option>
              <option>MOON</option><option>STAR</option><option>DOGE</option><option>ROCK</option>
            </select>
            <button id="upg-buy-tip" class="upg-btn">Buy tip</button>
          </div>
          <p class="upg-meta" style="margin-top:8px">Hook calls required: applyBiasOnTick per asset tick, accrueDailyInterest per day, maybeBorrow inside Buy.</p>
        </div>
      `;
      document.body.appendChild(panel);

      fab.addEventListener('click', () => panel.classList.toggle('show'));
      $('#upg-buy-t1', panel).addEventListener('click', () => Upgrades.buyMarginTier(1));
      $('#upg-buy-t2', panel).addEventListener('click', () => Upgrades.buyMarginTier(2));
      $('#upg-buy-tip', panel).addEventListener('click', () => {
        const key = $('#upg-asset', panel).value || null;
        Upgrades.buyInsiderTip(key);
      });

      function $(sel, root=document){ return root.querySelector(sel); }
      Upgrades._refreshUI();
    }
  };

  // expose
  window.Upgrades = Upgrades;
  // auto UI
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => Upgrades._injectUI());
  } else {
    Upgrades._injectUI();
  }
})();
