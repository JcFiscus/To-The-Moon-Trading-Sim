// Mulberry32 + Box-Muller
export function createRNG(seed) {
  let t = seed >>> 0;
  const rand = () => {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ t >>> 15, 1 | t);
    r ^= r + Math.imul(r ^ r >>> 7, 61 | r);
    return ((r ^ r >>> 14) >>> 0) / 4294967296;
  };
  rand.normal = (() => {
    let spare = null;
    return () => {
      if (spare != null) { const v = spare; spare = null; return v; }
      let u=0,v=0,s=0;
      do { u = rand()*2-1; v = rand()*2-1; s = u*u+v*v; } while (s===0||s>=1);
      const mul = Math.sqrt(-2*Math.log(s)/s);
      spare = v*mul; return u*mul;
    };
  })();
  return rand;
}
