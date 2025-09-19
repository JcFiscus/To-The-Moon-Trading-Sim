const STAGE_SELECTOR = "[data-ui-stage]";
const FRAME_SELECTOR = "[data-ui-frame]";
const BODY_SCALE_CLASS = "is-viewport-scaling";

const round = (value) => Math.round(value * 1000) / 1000;

function initViewportScaling() {
  const stage = document.querySelector(STAGE_SELECTOR);
  const frame = document.querySelector(FRAME_SELECTOR);
  if (!stage || !frame) {
    return null;
  }

  const body = document.body;
  const computedStyle = window.getComputedStyle(frame);
  const fallbackWidth =
    Number.parseFloat(computedStyle.getPropertyValue("--ui-base-width")) || frame.offsetWidth || 1480;
  const fallbackHeight =
    Number.parseFloat(computedStyle.getPropertyValue("--ui-base-height")) || frame.offsetHeight || 960;

  let baseWidth = Math.max(fallbackWidth, frame.offsetWidth || 0);
  let baseHeight = Math.max(fallbackHeight, frame.offsetHeight || 0);

  const setBaseDimensions = (width, height) => {
    if (width <= 0 || height <= 0) return;
    baseWidth = Math.max(baseWidth, width, fallbackWidth);
    baseHeight = Math.max(baseHeight, height, fallbackHeight);
    frame.style.setProperty("--ui-base-width", `${baseWidth}px`);
    frame.style.setProperty("--ui-base-height", `${baseHeight}px`);
  };

  setBaseDimensions(baseWidth, baseHeight);

  const applyScale = () => {
    if (baseWidth <= 0 || baseHeight <= 0) return;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const scale = Math.min(1, Math.min(viewportWidth / baseWidth, viewportHeight / baseHeight));
    const scaledWidth = baseWidth * scale;
    const scaledHeight = baseHeight * scale;
    const offsetLeft = Math.max((viewportWidth - scaledWidth) / 2, 0);
    const offsetTop = Math.max((viewportHeight - scaledHeight) / 2, 0);

    frame.style.setProperty("--ui-scale", scale.toFixed(4));
    frame.style.setProperty("--ui-offset-left", `${round(offsetLeft)}px`);
    frame.style.setProperty("--ui-offset-top", `${round(offsetTop)}px`);
  };

  const handleResize = () => {
    applyScale();
  };

  const setupObserver = () => {
    if (typeof ResizeObserver !== "function") return null;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target !== frame) continue;
        const { width, height } = entry.contentRect;
        const nextWidth = Math.round(width);
        const nextHeight = Math.round(height);
        if (!nextWidth || !nextHeight) continue;
        if (nextWidth === Math.round(baseWidth) && nextHeight === Math.round(baseHeight)) continue;
        setBaseDimensions(width, height);
        applyScale();
      }
    });

    observer.observe(frame);
    return observer;
  };

  const observer = setupObserver();

  const activate = () => {
    body.classList.add(BODY_SCALE_CLASS);
    applyScale();
  };

  if (document.readyState === "complete") {
    requestAnimationFrame(activate);
  } else {
    requestAnimationFrame(() => {
      if (document.readyState === "loading") {
        window.addEventListener("load", activate, { once: true });
      } else {
        activate();
      }
    });
  }

  window.addEventListener("resize", handleResize, { passive: true });
  window.addEventListener("orientationchange", handleResize, { passive: true });

  return () => {
    window.removeEventListener("resize", handleResize);
    window.removeEventListener("orientationchange", handleResize);
    observer?.disconnect();
    body.classList.remove(BODY_SCALE_CLASS);
    frame.style.removeProperty("--ui-scale");
    frame.style.removeProperty("--ui-offset-left");
    frame.style.removeProperty("--ui-offset-top");
  };
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initViewportScaling, { once: true });
} else {
  initViewportScaling();
}

export { initViewportScaling };
