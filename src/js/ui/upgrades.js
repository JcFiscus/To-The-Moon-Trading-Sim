import { UPGRADES, upgradeCost } from '../core/upgrades.js';
import { fmt } from '../util/format.js';
import { CFG } from '../config.js';
import { pushAssetNews } from '../core/events.js';

function highestTierOwned(ctx){
  let t = 0;
  for(const def of UPGRADES){
    const val = ctx.state.upgrades[def.id];
    if(def.id==='leverage' ? val>0 : val){
      if(def.tier>t) t = def.tier;
    }
  }
  return t;
}
function tierUnlocked(ctx, tier){
  if(tier===1) return true;
  return highestTierOwned(ctx) >= tier-1;
}

export function renderUpgrades(ctx, toast){
  const root = document.getElementById('upgrades');
  if(!root) return;
  root.innerHTML = '';
  const header = document.createElement('div');
  header.className = 'row';
  header.style.justifyContent = 'space-between';
  header.innerHTML = `<div>Upgrades</div><div class="mini">${ctx.day.active?'Market Open':'After Hours'}</div>`;
  root.appendChild(header);

  let any = false;
  for(const def of UPGRADES){
    if(!tierUnlocked(ctx, def.tier)) continue;
    any = true;
    const bought = ctx.state.upgradePurchases[def.id] || 0;
    const cost = upgradeCost(def, bought);
    let disabled = false, label = '', reason = '';
    if (def.id === 'insider') {
      const tip = ctx.state.insiderTip;
      const cd = ctx.state.cooldowns.insider || 0;
      disabled = ctx.day.active || cost > ctx.state.cash || tip || cd > 0;
      if(ctx.day.active) reason = 'Market open';
      else if(cost > ctx.state.cash) reason = 'Insufficient cash';
      else if(tip) reason = 'Tip active';
      else if(cd > 0) reason = `Cooldown ${cd}d`;
      label = tip ? `Active ${tip.bias>0?'Bullish':'Bearish'} (${tip.daysLeft}d)` : 'Buy Tip';
    } else {
      const owned = ctx.state.upgrades[def.id];
      disabled = ctx.day.active || cost > ctx.state.cash || (def.id !== 'leverage' && owned);
      if(ctx.day.active) reason = 'Market open';
      else if(cost > ctx.state.cash) reason = 'Insufficient cash';
      else if(def.id !== 'leverage' && owned) reason = 'Already owned';
      label = (def.id === 'leverage') ?
        (owned ? `Level ${owned}` : 'Unlock') :
        (owned ? 'Owned' : 'Unlock');
    }
    const card = document.createElement('div');
    card.className = 'upgrade-card';
    card.innerHTML = `<div class="row" style="justify-content:space-between;"><div>${def.name}</div><div class="mini">${fmt(cost)}</div></div>`;
    const desc = document.createElement('div');
    desc.className = 'mini';
    if(def.tip) desc.title = def.tip;
    desc.textContent = def.desc;
    card.appendChild(desc);
    const btn = document.createElement('button');
    btn.id = `upg-${def.id}`;
    btn.textContent = label;
    btn.disabled = disabled;
    btn.setAttribute('aria-label', `${label} ${def.name} for ${fmt(cost)}`);
    if(reason) btn.title = reason;
    card.appendChild(btn);
    if(disabled && reason){
      const note = document.createElement('div');
      note.className = 'mini';
      note.textContent = reason;
      card.appendChild(note);
    }
    root.appendChild(card);

    btn.addEventListener('click', () => {
      const bought = ctx.state.upgradePurchases[def.id] || 0;
      const cost = upgradeCost(def, bought);
      if (ctx.day.active || ctx.state.cash < cost) return;
      let msg = 'Upgrade purchased';
      if (def.id === 'insider') {
        if (ctx.state.cooldowns.insider > 0 || ctx.state.insiderTip) return;
        const sym = ctx.assets[Math.floor(Math.random()*ctx.assets.length)].sym;
        const bias = Math.random() < 0.5 ? 1 : -1;
        const [muMin, muMax] = CFG.INSIDER_MU_RANGE;
        const [sigMin, sigMax] = CFG.INSIDER_SIGMA_RANGE;
        let mu = (muMin + Math.random() * (muMax - muMin)) * bias;
        let sigma = sigMin + Math.random() * (sigMax - sigMin);
        if (Math.random() < 0.05) {
          mu = (0.2 + Math.random() * 0.8) * bias;
          sigma = 0.15 + Math.random() * 0.35;
        }
        ctx.state.cash -= cost;
        ctx.state.upgradePurchases.insider = bought + 1;
        ctx.state.insiderTip = { sym, daysLeft: CFG.INSIDER_DAYS, mu, sigma, bias };
        ctx.state.cooldowns.insider = CFG.INSIDER_COOLDOWN_DAYS;
        ctx.state.upgrades.insider = true;
        pushAssetNews(ctx.newsByAsset, { scope:'asset', sym, title: bias>0?'Bullish tip':'Bearish tip', type:'insider', mu, sigma, demand:0, days: CFG.INSIDER_DAYS, severity:'minor', blurb: bias>0?'Upward whispers.':'Downward whispers.' }, `Day ${ctx.day.idx} (tip)`, ctx.state);
        msg = `Insider tip (${bias>0?'Bullish':'Bearish'}) purchased`;
      } else {
        ctx.state.cash -= cost;
        ctx.state.upgradePurchases[def.id] = bought + 1;
        if(def.id === 'leverage'){
          ctx.state.upgrades.leverage = Math.min(def.levels.length, (ctx.state.upgrades.leverage||0) + 1);
        }else{
          ctx.state.upgrades[def.id] = true;
        }
      }
      if(toast) toast(msg, 'good');
      if(ctx.rebuildMarketTable) ctx.rebuildMarketTable();
      if(ctx.renderMarketTabs) ctx.renderMarketTabs();
      if(ctx.renderAll) ctx.renderAll();
      else renderUpgrades(ctx, toast);
    });
  }

  if(!any){
    let msg = 'Tier 2 upgrades appear after at least one Tier 1.';
    if(highestTierOwned(ctx) < 1) msg = 'Tier 1 upgrades appear first.';
    const info = document.createElement('div');
    info.className = 'mini';
    info.textContent = msg;
    root.appendChild(info);
  }
}
