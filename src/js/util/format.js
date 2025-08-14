const units = ["K","M","B","T","Qa","Qi","Sx","Sp","Oc","No","De","Ud","Dd","Td","Qad","Qid"];
export function fmtBig(n, digits=2){
  if(!isFinite(n)) return "∞"; const abs=Math.abs(n), sign=n<0?"-":"";
  if(abs<1e3) return sign+abs.toFixed(digits);
  let u=-1, num=abs; while(num>=1e3 && u<units.length-1){ num/=1e3; u++; }
  return sign+num.toFixed(digits)+(u>=0?units[u]:"");
}
export const fmt = (n) => "$" + fmtBig(n, 2);
export const pct = (x,d=2) => (x>=0?"+":"") + (x*100).toFixed(d) + "%";
