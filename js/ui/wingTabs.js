export function initWingTabsController() {
  const nav = document.querySelector("[data-wing-nav]");
  const root = document.querySelector("[data-wing-root]");
  if (!nav || !root) {
    return {
      setActiveWing() {}
    };
  }

  const buttons = Array.from(nav.querySelectorAll("[data-wing-target]"));
  const validWings = new Set(buttons.map((button) => button.getAttribute("data-wing-target")).filter(Boolean));

  const setActiveWing = (wing) => {
    const nextWing = validWings.has(wing) ? wing : "spine";
    root.dataset.activeWing = nextWing;
    buttons.forEach((button) => {
      const active = button.getAttribute("data-wing-target") === nextWing;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  };

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      setActiveWing(button.getAttribute("data-wing-target"));
    });
  });

  setActiveWing(root.dataset.activeWing || "spine");

  return { setActiveWing };
}
