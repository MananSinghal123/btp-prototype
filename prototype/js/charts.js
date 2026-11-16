import {esc} from "./util.js";

/* Dependency-free SVG line chart with a hover crosshair. */
function ticks(lo,hi,n=5){if(hi===lo){hi=lo+1}const raw=(hi-lo)/n,m=Math.pow(10,Math.floor(Math.log10(raw))),f=raw/m,step=(f<1.5?1:f<3?2:f<7?5:10)*m,out=[];
  for(let v=Math.floor(lo/step)*step;v<=hi+step*1e-9;v+=step)if(v>=lo-step*1e-9)out.push(Math.abs(v)<step*1e-9?0:v);return{out,lo:Math.min(lo,out[0]),hi:Math.max(hi,out[out.length-1]+0)}}
function lineChart(host,o){
  const W=640,H=o.h||260,m={l:64,r:30,t:16,b:40},all=o.series.flatMap(s=>s.y);
  let lo=Math.min(0,...all),hi=Math.max(0,...all);if(hi-lo<1e-9)hi=lo+1;
  const T=ticks(lo,hi);lo=Math.min(lo,T.out[0]);hi=Math.max(hi,T.out[T.out.length-1]);
  const x0=o.x[0],x1=o.x[o.x.length-1],sx=v=>m.l+(v-x0)/(x1-x0||1)*(W-m.l-m.r),sy=v=>H-m.b-(v-lo)/(hi-lo)*(H-m.t-m.b);
  const xt=ticks(x0,x1,6).out.filter(v=>v>=x0&&v<=x1);
  let g=T.out.map(v=>`<line x1="${m.l}" x2="${W-m.r}" y1="${sy(v)}" y2="${sy(v)}" style="stroke:var(--line)" stroke-width="${v===0?1.5:1}"/><text x="${m.l-8}" y="${sy(v)+4}" text-anchor="end" font-size="11" style="fill:var(--muted)">${o.yFmt(v)}</text>`).join("");
  g+=xt.map(v=>`<text x="${sx(v)}" y="${H-m.b+16}" text-anchor="middle" font-size="11" style="fill:var(--muted)">${(o.xTick||o.xFmt)(v)}</text>`).join("");
  if(o.xTitle)g+=`<text x="${(m.l+W-m.r)/2}" y="${H-6}" text-anchor="middle" font-size="11" style="fill:var(--muted)">${o.xTitle}</text>`;
  (o.marks||[]).forEach((k,i)=>{g+=`<line x1="${sx(k.x)}" x2="${sx(k.x)}" y1="${m.t}" y2="${H-m.b}" style="stroke:var(--muted)" stroke-dasharray="3 3"/><text x="${sx(k.x)+(i?5:-5)}" y="${(m.t+H-m.b)/2}" text-anchor="${i?"start":"end"}" font-size="11" style="fill:var(--ink2)">${k.label}</text>`});
  g+=o.series.map(s=>`<path d="${s.y.map((v,i)=>(i?"L":"M")+sx(o.x[i]).toFixed(1)+" "+sy(v).toFixed(1)).join("")}" fill="none" stroke-width="2" stroke-linejoin="round" style="stroke:${s.color}"/>`).join("");
  g+=`<line id="cx" y1="${m.t}" y2="${H-m.b}" style="stroke:var(--ink2)" visibility="hidden"/>`+o.series.map((s,i)=>`<circle class="pt" r="4.5" stroke-width="2" style="fill:${s.color};stroke:var(--surface)" visibility="hidden"/>`).join("");
  host.innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.series.map(s=>s.name).join(" and "))}">${g}<rect x="${m.l}" y="${m.t}" width="${W-m.l-m.r}" height="${H-m.t-m.b}" fill="transparent"/></svg><div class="tip" hidden></div>`;
  const svg=host.firstChild,tip=host.lastChild,cx=svg.querySelector("#cx"),pts=svg.querySelectorAll(".pt"),tf=o.tipFmt||o.yFmt;
  const move=e=>{const b=svg.getBoundingClientRect(),px=(e.clientX-b.left)/b.width*W,f=(px-m.l)/(W-m.l-m.r),i=Math.max(0,Math.min(o.x.length-1,Math.round(f*(o.x.length-1)))),X=sx(o.x[i]);
    cx.setAttribute("x1",X);cx.setAttribute("x2",X);cx.setAttribute("visibility","visible");
    pts.forEach((p,k)=>{p.setAttribute("cx",X);p.setAttribute("cy",sy(o.series[k].y[i]));p.setAttribute("visibility","visible")});
    tip.innerHTML=`<div class="t">${o.xFmt(o.x[i])}</div>`+o.series.map(s=>`<div><span class="dot" style="background:${s.color}"></span>${s.name} <b class="num">${tf(s.y[i])}</b></div>`).join("");
    tip.hidden=false;const left=X/W*b.width;tip.style.top="8px";if(left>b.width/2){tip.style.left="auto";tip.style.right=(b.width-left+12)+"px"}else{tip.style.right="auto";tip.style.left=(left+12)+"px"}};
  const leave=()=>{tip.hidden=true;cx.setAttribute("visibility","hidden");pts.forEach(p=>p.setAttribute("visibility","hidden"))};
  svg.addEventListener("pointermove",move);svg.addEventListener("pointerdown",move);svg.addEventListener("pointerleave",leave);
}

export {lineChart};
