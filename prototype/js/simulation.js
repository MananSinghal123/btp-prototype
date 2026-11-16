import {rng, gauss} from "./random.js";
import {K, quote, apply} from "./pool.js";
import {bundleValue, rebalValue, secondPrice} from "./auction.js";

/* Market simulation: the same trades hit an unprotected pool and a MEVRES pool. Pure function, no DOM. */
function simulate(P,S){
  const {blocks,tpb,vol,med,gas,seed:simSeed}=S;
  const r=rng(simSeed*7919+P.seed),r2=rng(simSeed*104729+13),rho=P.rho||0;let v=P.pp,U={x:P.x0,y:P.x0*P.pp},Mp={x:U.x,y:U.y};
  const R={x:[],costU:[],costM:[],lpU:[],lpM:[],fair:0,sandU:0,lvrU:0,usersM:0,lpsM:0,arbsM:0,nSand:0,nTrades:0,revU:0,revM:0};
  let cU=0,cM=0,lU=0,lM=0;
  for(let b=1;b<=blocks;b++){
    v*=Math.exp(vol*gauss(r));const U0={...U},s0={...Mp};
    for(let j=0;j<tpb;j++){
      const dir=r()<.5?"X2Y":"Y2X",notional=med*Math.exp(.9*gauss(r)),gross=dir==="X2Y"?notional/v:notional,din=gross*(1-P.fee),tol=.003+.012*r();
      const toUsd=dir==="X2Y"?1:v,fair=dir==="X2Y"?v*gross:gross,feeUsd=fair*P.fee;R.nTrades++;
      const beliefs=Array.from({length:P.nArb},()=>v*(1+P.sig*gauss(r)));
      /* unprotected pool */
      const minU=quote(U0,dir,din)*(1-tol),outU=quote(U,dir,din);
      if(outU<minU)R.revU++;else{let got=outU;const mev=(outU-minU)*toUsd;if(mev>gas){got=minU;R.sandU+=mev;R.nSand++}cU+=fair-got*toUsd;lU+=feeUsd;U=apply(U,dir,din);R.fair+=fair}
      /* MEVRES pool: always quoted and settled from s0 */
      const minM=quote(s0,dir,din)*(1-tol),a=secondPrice(beliefs.map(q=>bundleValue(q,dir,din,minM)));
      if(a.top<=0)R.revM++;else if(r2()<rho){cM+=fair-minM*toUsd;lM+=feeUsd;R.arbsM+=a.top}else{const tv=a.top;cM+=fair-minM*toUsd-P.alpha*a.pay;lM+=feeUsd+(1-P.alpha)*a.pay;R.usersM+=P.alpha*a.pay;R.lpsM+=(1-P.alpha)*a.pay;R.arbsM+=tv-a.pay}
    }
    /* end of block: rebalance to the external price */
    const lvr=rebalValue(v,U);lU-=lvr;R.lvrU+=lvr;U={x:Math.sqrt(K(U)/v),y:Math.sqrt(K(U)*v)};
    const reps=Array.from({length:P.nArb},()=>v*(1+P.sig*gauss(r))),ra=secondPrice(reps.map(q=>rebalValue(q,Mp))),q=reps[ra.w];
    const nx={x:Math.sqrt(K(Mp)/q),y:Math.sqrt(K(Mp)*q)},loss=v*(Mp.x-nx.x)-(nx.y-Mp.y);
    lM+=ra.pay-loss;R.lpsM+=ra.pay;R.arbsM+=ra.top-ra.pay;Mp=nx;
    R.x.push(b);R.costU.push(cU);R.costM.push(cM);R.lpU.push(lU);R.lpM.push(lM);
  }
  return R;
}

export {simulate};
