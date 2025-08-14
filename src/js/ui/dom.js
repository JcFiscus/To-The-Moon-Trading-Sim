export const qs = (sel, el=document) => el.querySelector(sel);
export const qsa = (sel, el=document) => [...el.querySelectorAll(sel)];
export function el(tag, props={}, ...children){
  const n = document.createElement(tag);
  Object.entries(props).forEach(([k,v]) => {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  });
  for (const c of children) n.append(c);
  return n;
}
