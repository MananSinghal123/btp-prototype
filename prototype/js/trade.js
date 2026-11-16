import {rng, gauss} from "./random.js";
import {quote, apply, frontState} from "./pool.js";
import {bundleValue, secondPrice} from "./auction.js";

/* One user trade end to end: bids, winner, bundle states and costs. Pure functions, no DOM. */
function tradeMath(P){
  const pool={x:P.x0,y:P.x0*P.pp},din=P.amt*(1-P.fee),out0=quote(pool,P.dir,din),minOut=out0*(1-P.tol);
  const r=rng(P.seed),beliefs=Array.from({length:P.nArb},()=>P.vext*(1+P.sig*gauss(r)));
  const reports=beliefs.map((b,i)=>i===0?b*(1+P.off):b);
  const values=reports.map(q=>bundleValue(q,P.dir,din,minOut));
  const a=secondPrice(values),s1=frontState(pool,P.dir,din,minOut),s2=apply(s1,P.dir,din);
  const toUsd=P.dir==="X2Y"?1:P.vext,fair=P.dir==="X2Y"?P.vext*P.amt:P.amt;
  return{pool,din,out0,minOut,beliefs,reports,values,...a,filled:a.top>0,s1,s2,toUsd,fair,
    winnerProfit:bundleValue(beliefs[a.w],P.dir,din,minOut)-a.pay,
    costNoMev:fair-out0*toUsd,costUnprot:fair-minOut*toUsd};
}
function a1Utility(P,M,off){
  const q=M.beliefs[0]*(1+off),v=bundleValue(q,P.dir,M.din,M.minOut);let best=-Infinity;
  for(let i=1;i<M.values.length;i++)best=Math.max(best,M.values[i]);
  return v>best&&v>0?bundleValue(M.beliefs[0],P.dir,M.din,M.minOut)-Math.max(0,best):0;
}

export {tradeMath, a1Utility};
