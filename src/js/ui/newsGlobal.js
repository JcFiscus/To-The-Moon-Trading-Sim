// Compact news list placeholder
export function renderNews(root, ctx, { filter = null, limit = 6 } = {}) {
  root.innerHTML = `
    <div class="card-head">
      <strong>News</strong>
      ${filter ? `<span class="chip">Selected: ${filter}</span>` : ''}
    </div>
    <ul class="news-list"></ul>
  `;
}
