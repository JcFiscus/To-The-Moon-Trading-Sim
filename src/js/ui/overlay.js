export function ensureOverlayRoot(){
  let root = document.getElementById('overlay-root');
  if(!root){
    root = document.createElement('div');
    root.id = 'overlay-root';
    document.body.appendChild(root);
  }
  return root;
}

export function renderOverlay(el){
  ensureOverlayRoot().appendChild(el);
  return () => el.remove();
}
