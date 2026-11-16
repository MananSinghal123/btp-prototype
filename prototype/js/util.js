/* Small DOM and number-formatting helpers. */
const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const nf=(n,d=2)=>Number(n).toLocaleString("en-US",{minimumFractionDigits:d,maximumFractionDigits:d});
const usd=(n,d=2)=>(n<0?"−":"")+"$"+nf(Math.abs(n),d);
const hex=u=>Array.from(u,b=>b.toString(16).padStart(2,"0")).join("");
const short=(h,n=20)=>h.length>2*n?h.slice(0,n)+"…"+h.slice(-n):h;

export {$, esc, nf, usd, hex, short};
