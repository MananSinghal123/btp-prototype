/* Headless benchmark: MEVRES against two baselines over many seeded runs.

   Baselines
     Unprotected DEX   searchers sandwich a share of the profitable trades (the sandwich rate)
     Encrypted only    trades are hidden, so nobody sandwiches them, but nothing is auctioned
                       or refunded (ablation: what does the auction add on top of encryption?)

   The report's headline compares MEVRES only with an unprotected DEX whose searcher attacks
   every profitable trade. This script sweeps the sandwich rate so the headline can be read
   against weaker attackers, and adds the encrypted-only ablation.

   Usage (from the prototype folder):
     node bench/benchmark.mjs                  1,000 runs, default parameters (Table 4.1)
     node bench/benchmark.mjs --runs 200       fewer runs
     node bench/benchmark.mjs --rates 1,0.1    custom sandwich rates
     node bench/benchmark.mjs --md out.md      also write the tables to a Markdown file

   Seeds 1..runs are used, as in the report, so every number can be reproduced. */
import {writeFileSync} from "node:fs";
import {simulate} from "../js/simulation.js";

const arg=(name,def)=>{const i=process.argv.indexOf("--"+name);return i>0?process.argv[i+1]:def};
const runs=+arg("runs",1000);
const rates=arg("rates","1,0.5,0.2,0.05").split(",").map(Number);
const mdOut=arg("md",null);

/* Table 4.1 of the report */
const P={x0:5000,pp:3000,fee:.003,nArb:6,sig:.0015,alpha:.9,seed:7};
const S={blocks:300,tpb:2,vol:.0012,med:20000,gas:8};

const mean=a=>a.reduce((s,v)=>s+v,0)/a.length;
const pct=(a,p)=>{const b=[...a].sort((x,y)=>x-y);return b[Math.min(b.length-1,Math.floor(p*b.length))]};
const f1=v=>v.toFixed(1),f0=v=>Math.round(v).toLocaleString("en-US");
const range=(a,f)=>`${f(mean(a))} (${f(pct(a,.05))} – ${f(pct(a,.95))})`;

function runRate(rate){
  const o={costU:[],costE:[],costM:[],lpU:[],lpE:[],lpM:[],sandShare:[],mBeatsU:0,mBeatsE:0,lpMBeatsE:0};
  for(let seed=1;seed<=runs;seed++){
    const R=simulate(P,{...S,seed,sandRate:rate}),n=R.x.length;
    const cU=R.costU[n-1]/R.fair*1e4,cE=R.costE[n-1]/R.fairE*1e4,cM=R.costM[n-1]/R.fair*1e4;
    o.costU.push(cU);o.costE.push(cE);o.costM.push(cM);
    o.lpU.push(R.lpU[n-1]);o.lpE.push(R.lpE[n-1]);o.lpM.push(R.lpM[n-1]);
    o.sandShare.push(R.nSand/R.nTrades*100);
    if(cM<cU)o.mBeatsU++;if(cM<cE)o.mBeatsE++;if(R.lpM[n-1]>R.lpE[n-1])o.lpMBeatsE++;
  }
  return o;
}

const out=[];
const say=s=>{out.push(s);console.log(s)};
say(`# MEVRES benchmark\n\n${runs} runs per setting (seeds 1–${runs}), parameters of Table 4.1. Mean, with 5th–95th percentile range.\n`);

const results=rates.map(rate=>({rate,...runRate(rate)}));

say("## User cost (bps of fair value, lower is better)\n");
say("| Sandwich rate | Trades sandwiched | Unprotected DEX | Encrypted only | MEVRES | MEVRES vs unprotected |");
say("|---|---|---|---|---|---|");
for(const r of results){
  const red=(1-mean(r.costM)/mean(r.costU))*100;
  say(`| ${r.rate*100}% | ${f1(mean(r.sandShare))}% | ${range(r.costU,f1)} | ${range(r.costE,f1)} | ${range(r.costM,f1)} | ${red>=0?"−":"+"}${f1(Math.abs(red))}% |`);
}

/* LP profit does not depend on the sandwich rate in this model: a sandwich takes value from the
   user, and the pool sees the same trade and the same fee either way. One row is enough. */
const r0=results[0];
say("\n## LP profit per run (USDC, higher is better)\n");
say("| Unprotected DEX | Encrypted only | MEVRES |");
say("|---|---|---|");
say(`| ${range(r0.lpU,f0)} | ${range(r0.lpE,f0)} | ${range(r0.lpM,f0)} |`);
say("\nThe same at every sandwich rate: a sandwich moves value from the user to the searcher, not from the pool.");
say("\n## Paired comparison (same seed)\n");
say("| Comparison | Runs where MEVRES is better |");
say("|---|---|");
for(const r of results)say(`| User cost vs unprotected, ${r.rate*100}% sandwich rate | ${r.mBeatsU} of ${runs} |`);
say(`| User cost vs encrypted only | ${r0.mBeatsE} of ${runs} |`);
say(`| LP profit vs encrypted only | ${r0.lpMBeatsE} of ${runs} |`);

if(mdOut){writeFileSync(mdOut,out.join("\n")+"\n");console.log(`\nWrote ${mdOut}`)}
