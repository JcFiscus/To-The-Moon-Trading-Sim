const KEY = 'ttm_save';
export const SAVE_VERSION = 1;

export function save(state, market, assets, version = SAVE_VERSION) {
  try {
    const payload = {
      version,
      state,
      market,
      assets: assets.map(a => ({ ...a, history: a.history.slice(-700) }))
    };
    localStorage.setItem(KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function load(ctx, version = SAVE_VERSION) {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (data.version !== version) return false;
    Object.assign(ctx.state, data.state || {});
    Object.assign(ctx.market, data.market || {});
    for (const a of ctx.assets) {
      const m = (data.assets || []).find(x => x.sym === a.sym);
      if (!m) continue;
      Object.assign(a, m);
      a.history = Array.isArray(m.history) && m.history.length ? m.history : a.history;
    }
    return true;
  } catch {
    return false;
  }
}
