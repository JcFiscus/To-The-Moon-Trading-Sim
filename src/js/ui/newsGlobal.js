export function initGlobalFeed(feedEl){
  function log(msg){
    const line = document.createElement('div');
    line.className = 'line';
    const ts = new Date().toLocaleTimeString();
    line.textContent = `[${ts}] ${msg}`;
    feedEl.prepend(line);
    while (feedEl.childElementCount > 200) feedEl.lastElementChild.remove();
  }
  return { log };
}
