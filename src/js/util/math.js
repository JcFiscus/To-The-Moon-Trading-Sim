export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

export function rollingAvg(arr, win) {
  const n = arr.length; const s = Math.max(0, n - win);
  let sum = 0; for (let i = s; i < n; i++) sum += arr[i];
  return sum / Math.max(1, n - s);
}
