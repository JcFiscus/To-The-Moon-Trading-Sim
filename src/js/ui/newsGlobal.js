import { getState } from '../core/state.js';

export function renderNews(root, { filter = null, limit = 6 } = {}) {
  const ctx = getState();
  let items = [];
  if (filter) {
    items = ctx.newsByAsset[filter] || [];
  } else {
    items = Object.values(ctx.newsByAsset).flat();
  }
  items = items.slice(0, limit);
  root.innerHTML = `
    <div class="card-head">
      <strong>News</strong>
      ${filter ? `<span class="chip">Selected: ${filter}</span>` : ''}
    </div>
    <ul class="news-list">
      ${items.map(n => `
        <li class="news-item">
          <span class="tag ${n.ev?.severity || ''}">${n.ev?.severity || ''}</span>
          <span class="title">${n.ev?.title || ''}</span>
        </li>
      `).join('')}
    </ul>
  `;
}
