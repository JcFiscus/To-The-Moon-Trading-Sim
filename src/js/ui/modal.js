import { fmt } from '../util/format.js';
import { CFG } from '../config.js';

export function showSummary(summary, tomorrow, onNext){
  const overlay = document.getElementById('overlay');
  const modalContent = document.getElementById('modalContent');
  const modalActions = document.getElementById('modalActions');

  const { rows, meta } = summary;
  const dNetClass = meta.dNet >= 0 ? 'up' : 'down';
  const realizedClass = meta.realized >= 0 ? 'up' : 'down';

  const header = `
    <h3>Day ${meta.day} Summary</h3>
    <div class="row" style="justify-content:space-between;">
      <div>Net Worth: <b>${fmt(meta.endNet)}</b>
        <span class="${dNetClass}">${meta.dNet>=0?'+':''}${fmt(meta.dNet)}</span></div>
      <div>Change: <b class="${dNetClass}">${(meta.dNetPct*100).toFixed(2)}%</b></div>
      <div>Realized: <b class="${realizedClass}">${fmt(meta.realized)}</b> • Fees: <b>${fmt(meta.fees)}</b></div>
      <div>Winners/Losers:
        <span class="badge">${meta.best.sym} ${(meta.best.priceCh*100).toFixed(1)}%</span>
        <span class="badge">${meta.worst.sym} ${(meta.worst.priceCh*100).toFixed(1)}%</span>
      </div>
    </div>
    ${meta.interest>0?`<div class="mini">Debt interest charged: ${fmt(meta.interest)}</div>`:''}`;

  modalContent.innerHTML = header;

  const table = document.createElement('table');
  table.innerHTML = `<thead><tr>
    <th>Asset</th><th>Start</th><th>End</th><th>Δ%</th>
    <th>Pos (start)</th><th>Pos (end)</th><th>Unrealized Δ</th>
  </tr></thead>`;
  const tbody = document.createElement('tbody');
  for (const r of rows){
    const tr = document.createElement('tr');
    const tdAsset = document.createElement('td');
    tdAsset.innerHTML = `<b>${r.sym}</b> <span class="mini">${r.name}</span>`;
    const tdStart = document.createElement('td');
    tdStart.textContent = fmt(r.sp);
    const tdEnd = document.createElement('td');
    tdEnd.textContent = fmt(r.ep);
    const tdCh = document.createElement('td');
    tdCh.textContent = `${(r.priceCh*100).toFixed(2)}%`;
    tdCh.className = r.priceCh >= 0 ? 'up' : 'down';
    const tdPosStart = document.createElement('td');
    tdPosStart.textContent = `${r.startHold.toLocaleString()} • ${fmt(r.startVal)}`;
    const tdPosEnd = document.createElement('td');
    tdPosEnd.textContent = `${r.endHold.toLocaleString()} • ${fmt(r.endVal)}`;
    const tdUnreal = document.createElement('td');
    tdUnreal.textContent = `${r.unreal>=0?'+':''}${fmt(r.unreal)}`;
    tdUnreal.className = r.unreal >= 0 ? 'up' : 'down';

    tr.appendChild(tdAsset);
    tr.appendChild(tdStart);
    tr.appendChild(tdEnd);
    tr.appendChild(tdCh);
    tr.appendChild(tdPosStart);
    tr.appendChild(tdPosEnd);
    tr.appendChild(tdUnreal);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  modalContent.appendChild(table);

  const rtable = document.createElement('table');
  rtable.innerHTML = `<thead><tr>
    <th>Asset</th><th>Basis</th><th>Peak</th><th>Ret%</th><th>DD%</th><th>Next TP</th><th>Last Rule</th>
  </tr></thead>`;
  const rtbody = document.createElement('tbody');
  for (const r of rows){
    const tr = document.createElement('tr');
    const tdAsset = document.createElement('td'); tdAsset.textContent = r.sym;
    const tdBasis = document.createElement('td'); tdBasis.textContent = fmt(r.basis);
    const tdPeak = document.createElement('td'); tdPeak.textContent = fmt(r.peak);
    const tdRet = document.createElement('td'); tdRet.textContent = `${(r.ret*100).toFixed(1)}%`;
    tdRet.className = r.ret >= 0 ? 'up' : 'down';
    const tdDD = document.createElement('td'); tdDD.textContent = `${(r.draw*100).toFixed(1)}%`;
    tdDD.className = r.draw >= 0 ? 'up' : 'down';
    const tdNext = document.createElement('td'); tdNext.textContent = r.nextTP!=null ? `${Math.round(r.nextTP*100)}%` : '—';
    const tdLast = document.createElement('td'); tdLast.textContent = r.lastRule || '—';
    tr.append(tdAsset, tdBasis, tdPeak, tdRet, tdDD, tdNext, tdLast);
    rtbody.appendChild(tr);
  }
  rtable.appendChild(rtbody);
  modalContent.appendChild(rtable);

  if (tomorrow && tomorrow.length) {
    const sec = document.createElement('div');
    sec.className = 'section';
    sec.innerHTML = '<span class="section-title"><b>Tomorrow\'s Drivers</b></span>';
    const t = document.createElement('table');
    t.innerHTML = '<thead><tr><th>Asset</th><th>Title</th><th>μ</th><th>σ</th><th>Demand</th><th>Gap%</th></tr></thead>';
    const tb = document.createElement('tbody');
    for (const ev of tomorrow) {
      const gap = ((ev.mu||0)*CFG.DAY_TICKS*0.375 + (ev.demand||0)*0.275) * 100;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${ev.sym || 'GLOBAL'}</td>
        <td>${ev.title}</td>
        <td>${(ev.mu*10000).toFixed(0)}bp</td>
        <td>${(ev.sigma*100).toFixed(1)}%</td>
        <td>${(ev.demand*100).toFixed(1)}%</td>
        <td>${gap>=0?'+':''}${gap.toFixed(1)}%</td>`;
      tb.appendChild(tr);
    }
    t.appendChild(tb);
    sec.appendChild(t);
    modalContent.appendChild(sec);
  }

  modalActions.innerHTML = '';
  const nextBtn = document.createElement('button'); nextBtn.className='accent'; nextBtn.textContent='Start Next Day ▶';
  nextBtn.addEventListener('click', onNext);
  const closeBtn = document.createElement('button'); closeBtn.textContent='Close';
  closeBtn.addEventListener('click', ()=> overlay.style.display='none');
  modalActions.appendChild(nextBtn); modalActions.appendChild(closeBtn);
  overlay.style.display = 'flex';
}

export function showGameOver(onReset){
  const overlay = document.getElementById('overlay');
  const modalContent = document.getElementById('modalContent');
  const modalActions = document.getElementById('modalActions');

  modalContent.innerHTML = '<h3>Game Over</h3><div class="mini">Net worth depleted.</div>';
  modalActions.innerHTML = '';
  const resetBtn = document.createElement('button');
  resetBtn.className = 'bad';
  resetBtn.textContent = 'Hard Reset';
  resetBtn.addEventListener('click', onReset);
  modalActions.appendChild(resetBtn);
  overlay.style.display = 'flex';
}

export function showHelp(){
  const overlay = document.getElementById('overlay');
  const modalContent = document.getElementById('modalContent');
  const modalActions = document.getElementById('modalActions');

  modalContent.innerHTML = `<h3>How to Play</h3>
    <div class="mini">News and events shift tomorrow's price by biasing drift (μ) and volatility (σ). Positive news nudges prices up while negative news drags them down; effects fade over time.</div>
    <div class="mini">Margin and leverage let you borrow to magnify exposure. Gains and losses scale with leverage and positions may liquidate if equity falls too low.</div>
    <div class="mini">Debt accrues interest each day. Paying it down or buying Preferred Rates reduces the hit.</div>
    <div class="mini">Auto‑Risk settings automate stops and take‑profits using your configured thresholds and presets.</div>
    <div class="mini">When no news is active, prices tend to revert toward the analyst μ with variation described by σ.</div>`;

  modalActions.innerHTML = '';
  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Close';
  closeBtn.addEventListener('click', () => overlay.style.display = 'none');
  modalActions.appendChild(closeBtn);
  overlay.style.display = 'flex';
}
