import { UPGRADES, upgradeCost } from '../core/upgrades.js';
import { fmt } from '../util/format.js';

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
  const sections = [];
  for(const def of UPGRADES){
    if(!tierUnlocked(ctx, def.tier)) continue;
    const bought = ctx.state.upgradePurchases[def.id] || 0;
    const cost = upgradeCost(def, bought);
    const owned = ctx.state.upgrades[def.id];
    const disabled = ctx.day.active || cost > ctx.state.cash || (def.id !== 'leverage' && owned);
    const label = (def.id === 'leverage') ?
      (owned ? `Level ${owned}` : 'Unlock') :
      (owned ? 'Owned' : 'Unlock');
    sections.push(`<div class="section">
      <div class="row" style="justify-content:space-between;">
        <div>${def.name}</div>
        <div class="mini">${fmt(cost)}</div>
      </div>
      <div class="mini">${def.desc}</div>
      <button id="upg-${def.id}" ${disabled?'disabled':''}>${label}</button>
    </div>`);
  }
  if(!sections.length){
    let msg = 'Tier 2 upgrades appear after at least one Tier 1.';
    if(highestTierOwned(ctx) < 1) msg = 'Tier 1 upgrades appear first.';
    root.innerHTML = `<div class="mini">${msg}</div>`;
    return;
  }
  root.innerHTML = `<div class="row" style="justify-content:space-between;">
    <div>Upgrades</div>
    <div class="mini">${ctx.day.active?'Market Open':'After Hours'}</div>
  </div>${sections.join('')}`;

  for(const def of UPGRADES){
    const btn = document.getElementById(`upg-${def.id}`);
    if(!btn) continue;
    btn.addEventListener('click', () => {
      const bought = ctx.state.upgradePurchases[def.id] || 0;
      const cost = upgradeCost(def, bought);
      if(ctx.day.active || ctx.state.cash < cost) return;
      ctx.state.cash -= cost;
      ctx.state.upgradePurchases[def.id] = bought + 1;
      if(def.id === 'leverage'){
        ctx.state.upgrades.leverage = Math.min(def.levels.length, (ctx.state.upgrades.leverage||0) + 1);
      }else{
        ctx.state.upgrades[def.id] = true;
        if(def.id === 'insider') ctx.state.cooldowns.insider = 7;
      }
      if(toast) toast('Upgrade purchased', 'good');
      renderUpgrades(ctx, toast);
    });
  }
}
