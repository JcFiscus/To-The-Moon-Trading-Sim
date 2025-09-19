const STAGE_SELECTOR = "[data-ui-stage]";
const FRAME_SELECTOR = "[data-ui-frame]";
const BODY_SCALE_CLASS = "is-viewport-scaling";
const ROOT_SCALE_VAR = "--ui-scale";
const SCALE_PRECISION = 4;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const toNumber = (value, fallback) => {
  if (value == null) return fallback;
  const parsed = Number.parseFloat(typeof value === "string" ? value.trim() : value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const round = (value, precision = 3) => {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
};

const getViewportBox = () => {
  const visualViewport = window.visualViewport;
  if (visualViewport) {
    return { width: visualViewport.width, height: visualViewport.height };
  }

  return { width: window.innerWidth, height: window.innerHeight };
};

const round = (value) => Math.round(value * 1000) / 1000;

function initViewportScaling() {
  const stage = document.querySelector(STAGE_SELECTOR);
  const frame = document.querySelector(FRAME_SELECTOR);
  if (!stage || !frame) {
    return null;
  }

  const body = document.body;
  const root = document.documentElement;
  const rootStyle = window.getComputedStyle(root);
  const frameStyle = window.getComputedStyle(frame);
  const initialRect = frame.getBoundingClientRect();

  const fallbackWidth = toNumber(
    frameStyle.getPropertyValue("--ui-base-width"),
    initialRect.width || frame.offsetWidth || 1480
  );
  const fallbackHeight = toNumber(
    frameStyle.getPropertyValue("--ui-base-height"),
    initialRect.height || frame.offsetHeight || 960
  );

  const resolvedMinScale = toNumber(
    frameStyle.getPropertyValue("--ui-min-scale"),
    toNumber(rootStyle.getPropertyValue("--ui-min-scale"), 0.6)
  );
  const resolvedMaxScale = toNumber(
    frameStyle.getPropertyValue("--ui-max-scale"),
    toNumber(rootStyle.getPropertyValue("--ui-max-scale"), 2)
  );

  const minScale = clamp(resolvedMinScale || 0.6, 0.2, 10);
  const maxScale = Math.max(minScale, resolvedMaxScale || minScale);

  let baseWidth = Math.max(fallbackWidth, round(initialRect.width || fallbackWidth, 1));
  let baseHeight = Math.max(fallbackHeight, round(initialRect.height || fallbackHeight, 1));
  let baseSynced = false;

  const setBaseDimensions = (width, height) => {
    if (!width || !height) return;
    const normalizedWidth = Math.max(fallbackWidth, round(width, 1));
    const normalizedHeight = Math.max(fallbackHeight, round(height, 1));
    if (Math.abs(normalizedWidth - baseWidth) < 1 && Math.abs(normalizedHeight - baseHeight) < 1 && baseSynced) {
      return;
    }

    baseWidth = normalizedWidth;
    baseHeight = normalizedHeight;
    frame.style.setProperty("--ui-base-width", `${baseWidth}px`);
    frame.style.setProperty("--ui-base-height", `${baseHeight}px`);
    baseSynced = true;
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
    const { width: viewportWidth, height: viewportHeight } = getViewportBox();
    if (!viewportWidth || !viewportHeight) return;

    let scale = Math.min(viewportWidth / baseWidth, viewportHeight / baseHeight);
    if (!Number.isFinite(scale) || scale <= 0) {
      scale = 1;
    }

    scale = clamp(scale, minScale, maxScale);

    if (baseWidth <= 0 || baseHeight <= 0) return;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const scale = Math.min(1, Math.min(viewportWidth / baseWidth, viewportHeight / baseHeight));
    const scaledWidth = baseWidth * scale;
    const scaledHeight = baseHeight * scale;
    const offsetLeft = Math.max((viewportWidth - scaledWidth) / 2, 0);
    const offsetTop = Math.max((viewportHeight - scaledHeight) / 2, 0);
    const scaleValue = scale.toFixed(SCALE_PRECISION);

    frame.style.setProperty("--ui-scale", scaleValue);
    frame.style.setProperty("--ui-offset-left", `${round(offsetLeft)}px`);
    frame.style.setProperty("--ui-offset-top", `${round(offsetTop)}px`);
    root.style.setProperty(ROOT_SCALE_VAR, scaleValue);

    frame.style.setProperty("--ui-scale", scale.toFixed(4));
    frame.style.setProperty("--ui-offset-left", `${round(offsetLeft)}px`);
    frame.style.setProperty("--ui-offset-top", `${round(offsetTop)}px`);
  };

  const handleResize = () => {
    applyScale();
  };

  const observer =
    typeof ResizeObserver === "function"
      ? new ResizeObserver((entries) => {
          for (const entry of entries) {
            if (entry.target !== frame) continue;
            const { width, height } = entry.contentRect;
            if (!width || !height) continue;
            setBaseDimensions(width, height);
            applyScale();
          }
        })
      : null;

  observer?.observe(frame);

  const visualViewport = window.visualViewport;
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
  } else if (document.readyState === "interactive") {
    activate();
  } else {
    window.addEventListener("load", activate, { once: true });
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
  window.addEventListener("fullscreenchange", handleResize);
  window.addEventListener("pageshow", applyScale);
  visualViewport?.addEventListener("resize", handleResize, { passive: true });
  visualViewport?.addEventListener("scroll", handleResize, { passive: true });

  return () => {
    window.removeEventListener("resize", handleResize);
    window.removeEventListener("orientationchange", handleResize);
    window.removeEventListener("fullscreenchange", handleResize);
    window.removeEventListener("pageshow", applyScale);
    visualViewport?.removeEventListener("resize", handleResize);
    visualViewport?.removeEventListener("scroll", handleResize);
    observer?.disconnect();
    body.classList.remove(BODY_SCALE_CLASS);
    frame.style.removeProperty("--ui-scale");
    frame.style.removeProperty("--ui-offset-left");
    frame.style.removeProperty("--ui-offset-top");
    frame.style.removeProperty("--ui-base-width");
    frame.style.removeProperty("--ui-base-height");
    root.style.removeProperty(ROOT_SCALE_VAR);
  };
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initViewportScaling, { once: true });
} else {
  initViewportScaling();
}

export { initViewportScaling };
