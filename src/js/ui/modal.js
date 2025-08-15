import { fmt } from '../util/format.js';

export function showSummary(summary, onNext){
  const overlay = document.getElementById('overlay');
  const modalContent = document.getElementById('modalContent');
  const modalActions = document.getElementById('modalActions');

  const { rows, meta } = summary;

  const head = `
    <h3>Day ${meta.day} Summary</h3>
    <div class="row" style="justify-content:space-between;">
      <div>Net Worth: <b>${fmt(meta.endNet)}</b>
        <span class="${meta.dNet>=0?'up':'down'}">${meta.dNet>=0?'+':''}${fmt(meta.dNet)}</span></div>
      <div>Change: <b class="${meta.dNet>=0?'up':'down'}">${(meta.dNetPct*100).toFixed(2)}%</b></div>
      <div>Realized: <b class="${meta.realized>=0?'up':'down'}">${fmt(meta.realized)}</b> • Fees: <b>${fmt(meta.fees)}</b></div>
      <div>Winners/Losers:
        <span class="badge">${meta.best.sym} ${(meta.best.priceCh*100).toFixed(1)}%</span>
        <span class="badge">${meta.worst.sym} ${(meta.worst.priceCh*100).toFixed(1)}%</span>
      </div>
    </div>`;

  const table = [`<table><thead><tr>
    <th>Asset</th><th>Start</th><th>End</th><th>Δ%</th>
    <th>Pos (start)</th><th>Pos (end)</th><th>Unrealized Δ</th>
  </tr></thead><tbody>`];
  for (const r of rows){
    table.push(`<tr>
      <td><b>${r.sym}</b> <span class="mini">${r.name}</span></td>
      <td>${fmt(r.sp)}</td><td>${fmt(r.ep)}</td>
      <td class="${r.priceCh>=0?'up':'down'}">${(r.priceCh*100).toFixed(2)}%</td>
      <td>${r.startHold.toLocaleString()} • ${fmt(r.startVal)}</td>
      <td>${r.endHold.toLocaleString()} • ${fmt(r.endVal)}</td>
      <td class="${r.unreal>=0?'up':'down'}">${r.unreal>=0?'+':''}${fmt(r.unreal)}</td>
    </tr>`);
  }
  table.push(`</tbody></table>`);

  modalContent.innerHTML = head + table.join('');
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
