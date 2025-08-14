// Seeded RNG (Mulberry32 / xoshiro)
export function createRng(seed = Date.now()) {
  // TODO: implement seeded RNG
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}
