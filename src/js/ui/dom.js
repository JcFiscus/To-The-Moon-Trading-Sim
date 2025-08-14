// qs(), el(), mount helpers
export const qs = sel => document.querySelector(sel);
export const el = (tag, props = {}) => Object.assign(document.createElement(tag), props);
