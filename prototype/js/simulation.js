import {rng, gauss} from "./random.js";
import {K, quote, apply} from "./pool.js";
import {bundleValue, rebalValue, secondPrice} from "./auction.js";

/* Market simulation: the same trades hit three pools. Pure function, no DOM.
   U  unprotected DEX: searchers sandwich a share sandRate of the trades worth more than gas.
   E  encrypted mempool only (ablation): trades are hidden, so nobody sandwiches them, but
      nothing is auctioned or refunded and the end-of-block arbitrageur keeps the LVR.
   M  MEVRES: encrypted, auctioned and refunded.
   E isolates what the auction adds on top of the encryption layer. */
function simulate(P,S){
  const {blocks,tpb,vol,med,gas,seed:simSeed}=S,sandRate=S.sandRate??1;
  const r=rng(simSeed*7919+P.seed),r2=rng(simSeed*104729+13),rho=P.rho||0;
  /* separate stream so sandRate never shifts the trades, prices or beliefs */
  const r3=rng(simSeed*15485863+29);
  let v=P.pp,U={x:P.x0,y:P.x0*P.pp},Mp={x:U.x,y:U.y},E={x:U.x,y:U.y};
  const R={x:[],costU:[],costM:[],costE:[],lpU:[],lpM:[],lpE:[],fair:0,sandU:0,lvrU:0,lvrE:0,revE:0,fairE:0,usersM:0,lpsM:0,arbsM:0,nSand:0,nTrades:0,revU:0,revM:0};
  let cU=0,cM=0,cE=0,lU=0,lM=0,lE=0;
  for(let b=1;b<=blocks;b++){
    v*=Math.exp(vol*gauss(r));const U0={...U},E0={...E},s0={...Mp};
    for(let j=0;j<tpb;j++){
      const dir=r()<.5?"X2Y":"Y2X",notional=med*Math.exp(.9*gauss(r)),gross=dir==="X2Y"?notional/v:notional,din=gross*(1-P.fee),tol=.003+.012*r();
      const toUsd=dir==="X2Y"?1:v,fair=dir==="X2Y"?v*gross:gross,feeUsd=fair*P.fee;R.nTrades++;
      const beliefs=Array.from({length:P.nArb},()=>v*(1+P.sig*gauss(r)));
      /* unprotected pool */
      const minU=quote(U0,dir,din)*(1-tol),outU=quote(U,dir,din);
      if(outU<minU)R.revU++;else{let got=outU;const mev=(outU-minU)*toUsd;if(mev>gas&&r3()<sandRate){got=minU;R.sandU+=mev;R.nSand++}cU+=fair-got*toUsd;lU+=feeUsd;U=apply(U,dir,din);R.fair+=fair}
      /* encrypted mempool only: no outside sandwich, the user gets the pool's own quote, no refund */
      const minE=quote(E0,dir,din)*(1-tol),outE=quote(E,dir,din);
      if(outE<minE)R.revE++;else{cE+=fair-outE*toUsd;lE+=feeUsd;E=apply(E,dir,din);R.fairE+=fair}
      /* MEVRES pool: always quoted and settled from s0 */
      const minM=quote(s0,dir,din)*(1-tol),a=secondPrice(beliefs.map(q=>bundleValue(q,dir,din,minM)));
      if(a.top<=0)R.revM++;else if(r2()<rho){cM+=fair-minM*toUsd;lM+=feeUsd;R.arbsM+=a.top}else{const tv=a.top;cM+=fair-minM*toUsd-P.alpha*a.pay;lM+=feeUsd+(1-P.alpha)*a.pay;R.usersM+=P.alpha*a.pay;R.lpsM+=(1-P.alpha)*a.pay;R.arbsM+=tv-a.pay}
    }
    /* end of block: rebalance to the external price */
    const lvr=rebalValue(v,U);lU-=lvr;R.lvrU+=lvr;U={x:Math.sqrt(K(U)/v),y:Math.sqrt(K(U)*v)};
    const lvrE=rebalValue(v,E);lE-=lvrE;R.lvrE+=lvrE;E={x:Math.sqrt(K(E)/v),y:Math.sqrt(K(E)*v)};
    const reps=Array.from({length:P.nArb},()=>v*(1+P.sig*gauss(r))),ra=secondPrice(reps.map(q=>rebalValue(q,Mp))),q=reps[ra.w];
    const nx={x:Math.sqrt(K(Mp)/q),y:Math.sqrt(K(Mp)*q)},loss=v*(Mp.x-nx.x)-(nx.y-Mp.y);
    lM+=ra.pay-loss;R.lpsM+=ra.pay;R.arbsM+=ra.top-ra.pay;Mp=nx;
    R.x.push(b);R.costU.push(cU);R.costM.push(cM);R.costE.push(cE);R.lpU.push(lU);R.lpM.push(lM);R.lpE.push(lE);
  }
  return R;
}

export {simulate};
