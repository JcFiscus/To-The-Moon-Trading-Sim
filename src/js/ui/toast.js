export function initToaster(){
  const stack = document.getElementById('toastStack');
  function toast(msg, kind='neutral'){
    const t = document.createElement('div');
    t.className = `toast ${kind}`; t.innerHTML = msg;
    stack.appendChild(t);
    setTimeout(()=>{ if(t && t.parentNode) t.parentNode.removeChild(t); }, 5600);
  }
  return toast;
}
