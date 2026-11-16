import {$, esc, nf, usd, hex, short} from "./util.js";
import {quote} from "./pool.js";
import {combine} from "./shamir.js";
import {cat, sha, seal, open} from "./crypto.js";
import {tradeMath, a1Utility} from "./trade.js";
import {simulate} from "./simulation.js";
import {lineChart} from "./charts.js";

/* Page controller: reads the inputs, runs the protocol and the simulation, and renders the results. */
const val=(id,lo,hi)=>{let v=parseFloat($(id).value);if(!isFinite(v))v=lo;return Math.min(hi,Math.max(lo,v))};
function params(){
  const n=Math.round(val("nNode",2,9)),t=Math.min(n-1,Math.round(val("tNode",1,8)));
  return{x0:val("x0",10,1e9),pp:val("pp",1e-6,1e9),vext:val("vext",1e-6,1e9),fee:val("fee",0,5)/100,dir:$("dir").value,amt:val("amt",1e-9,1e12),
    tol:val("tol",0,20)/100,nArb:Math.round(val("nArb",2,12)),sig:val("sig",0,5)/100,off:val("off",-2,2)/100,n,t,tamper:$("tamper").checked,
    alpha:val("alpha",0,1),seed:Math.round(val("seed",1,1e9))};
}
let online=[];

/* Step 1 material is created once per trade and reused while the reader explores later steps. */
let sealed=null,sealedFor="";
let simSeed=11;
const simSettings=()=>({blocks:Math.round(val("sBlocks",20,3000)),tpb:Math.round(val("sTpb",1,8)),vol:val("sVol",0,3)/100,med:val("sSize",100,1e9),gas:val("sGas",0,1e6),seed:simSeed});

let runId=0;
async function render(){
  const id=++runId,P=params();
  $("offV").textContent=(P.off>=0?"+":"")+nf(P.off*100,2)+"%";$("alphaV").textContent=nf(P.alpha,2);
  $("amtLab").textContent="Amount ("+(P.dir==="X2Y"?"ETH":"USDC")+")";
  const M=tradeMath(P),inTok=P.dir==="X2Y"?"ETH":"USDC",outTok=P.dir==="X2Y"?"USDC":"ETH",od=outTok==="ETH"?4:2;
  const tx={direction:P.dir==="X2Y"?"ETH→USDC":"USDC→ETH",amountIn:+M.din.toFixed(8),minOut:+M.minOut.toFixed(8)};
  const sig=JSON.stringify([tx,P.n,P.t]);
  let cryptoErr="";
  try{
    if(sig!==sealedFor){const s=await seal(tx,P.n,P.t);if(id!==runId)return;sealed=s;sealedFor=sig;if(online.length!==P.n)online=Array(P.n).fill(true)}
  }catch(e){cryptoErr="This browser blocked the Web Crypto API, so the cryptographic steps cannot run here."}
  if(cryptoErr){$("steps").innerHTML='<li class="note bad">'+cryptoErr+"</li>";return}
  const S=sealed,need=P.t+1,up=S.shares.filter((_,i)=>online[i]),enough=up.length>=need;
  const opened=enough?await open(S.ct,combine(up.slice(0,need))):null,plain=opened?opened.tx:null;
  let check=null;
  if(opened){const rb=new Uint8Array(opened.r.match(/../g).map(h=>parseInt(h,16)));if(P.tamper)rb[0]^=0xff;check=await sha(cat(new TextEncoder().encode(JSON.stringify(opened.tx)),rb))}
  const commitOk=!!check&&hex(check)===hex(S.commit);
  const leak=await open(S.ct,combine(S.shares.slice(0,P.t)));   // t colluding nodes try to decrypt
  if(id!==runId)return;
  const decOk=!!plain,live=decOk&&commitOk&&M.filled;
  const refundU=live?P.alpha*M.pay:0,refundL=live?(1-P.alpha)*M.pay:0,costMev=M.costUnprot-refundU;
  const deposit=0.01*P.amt;

  /* outcome */
  $("outSub").textContent=`Selling ${nf(P.amt,inTok==="ETH"?4:2)} ${inTok} with ${nf(P.tol*100,1)}% slippage tolerance. The pool quotes ${nf(M.out0,od)} ${outTok}; the user accepts no less than ${nf(M.minOut,od)} ${outTok}.`;
  const recv=x=>nf(x,od)+" "+outTok;
  $("tiles").innerHTML=[
    ["<span class='dot' style='background:var(--unprot)'></span>User receives, unprotected",recv(M.minOut),`Sandwiched down to the limit. Searcher takes ${usd((M.out0-M.minOut)*M.toUsd)}.`],
    ["<span class='dot' style='background:var(--accent)'></span>User receives, MEVRES",live?recv(M.minOut)+(refundU>0?" + "+usd(refundU):""):"Not executed",live?"Limit fill plus the auction refund.":(!decOk?"Too few nodes online to decrypt.":!commitOk?"Submission rejected.":"No bidder values the bundle above zero.")],
    ["MEV sold at auction",live?usd(M.pay):"—",live?`Second-highest bid. Winner A${M.w+1} keeps ${usd(M.winnerProfit)}.`:"No auction settled."],
    ["Refund split",live?usd(refundU)+" / "+usd(refundL):"—","User / liquidity providers at α = "+nf(P.alpha,2)]
  ].map(t=>`<div class="tile"><span class="k">${t[0]}</span><span class="v num">${t[1]}</span><span class="d">${t[2]}</span></div>`).join("");
  const bars=[["Pool with no MEV (reference)",M.costNoMev,"var(--ref)"],["Unprotected DEX, sandwiched",M.costUnprot,"var(--unprot)"],["MEVRES",live?costMev:null,"var(--accent)"]];
  const bmax=Math.max(...bars.map(b=>Math.abs(b[1]||0)),1e-9);
  $("costBars").innerHTML=bars.map(b=>`<span class="lab">${b[0]}</span><div class="track"><div class="bar" style="width:${b[1]==null?0:Math.max(0,b[1])/bmax*100}%;background:${b[2]}"></div></div><span class="val">${b[1]==null?"not executed":usd(b[1])+" · "+nf(b[1]/M.fair*1e4,1)+" bps"}</span>`).join("");

  /* steps */
  const st=(n,title,pill,body,off)=>`<li class="step${off?" off":""}"><span class="n">${n}</span><div class="body"><div class="head"><h3>${title}</h3>${pill}</div>${body}</div></li>`;
  const pill=(c,t)=>`<span class="pill ${c}">${t}</span>`;
  const order=M.values.map((v,i)=>i).sort((a,b)=>M.values[b]-M.values[a]);
  const s1=`<dl class="kv">
    <dt>Plaintext TX</dt><dd><span class="hex">${esc(JSON.stringify(S.tx))}</span></dd>
    <dt>Ciphertext CT</dt><dd><span class="hex" title="${hex(S.ct)}">${short(hex(S.ct),28)}</span> <span class="sub">AES-256-GCM, ${S.ct.length} bytes</span></dd>
    <dt>Salt r</dt><dd><span class="hex">${short(hex(S.salt))}</span> <span class="sub">256 random bits, encrypted together with the trade</span></dd>
    <dt>Commitment c = H(TX‖r)</dt><dd><span class="hex">${hex(S.commit)}</span></dd>
    <dt>Collateral locked</dt><dd class="num">${nf(deposit,inTok==="ETH"?4:2)} ${inTok} <span class="sub">(1% of input, returned when the commitment verifies)</span></dd>
    <dt>Key shares</dt><dd>Decryption key split ${need}-of-${P.n}. Any ${need} nodes can decrypt; ${P.t} or fewer learn nothing.</dd></dl>`;
  const s2=`<p class="sub">Bidders see only the pool state s₀ = (${nf(M.pool.x,2)} ETH, ${nf(M.pool.y,0)} USDC) and one opaque ciphertext. Each reports the price it believes ETH trades at elsewhere.</p>
    <div class="scroll"><table><thead><tr><th>Bidder</th><th>Private belief</th><th>Sealed report qᵢ</th></tr></thead><tbody>${M.reports.map((q,i)=>`<tr><td>A${i+1}${i===0&&P.off?" (misreporting)":""}</td><td>${usd(M.beliefs[i])}</td><td>${usd(q)}</td></tr>`).join("")}</tbody></table></div>`;
  const s3=`<div><p class="sub" style="margin-bottom:6px">Threshold nodes. Click a node to take it offline.</p><div class="nodes">${S.shares.map((s,i)=>`<button type="button" class="node" data-node="${i}" aria-pressed="${online[i]}" title="share ${short(hex(s.y),8)}">N${i+1}</button>`).join("")}</div></div>
    <dl class="kv"><dt>Shares available</dt><dd>${up.length} of ${need} required ${enough?pill("ok","decrypted"):pill("no","stays encrypted")}</dd>
    <dt>Recomputed H(TX‖r)</dt><dd>${check?`<span class="hex">${short(hex(check),24)}</span> ${commitOk?pill("ok","matches c"):pill("no","mismatch")}`:pill("na","needs decryption first")}</dd>
    ${decOk?`<dt>Recovered TX</dt><dd><span class="hex">${esc(JSON.stringify(plain))}</span></dd>`:""}</dl>
    ${!enough?`<p class="note bad">Only ${up.length} node${up.length===1?"":"s"} online. The transaction cannot be opened, so nothing executes this block.</p>`:""}
    ${enough&&!commitOk?`<p class="note bad">The decrypted trade and salt do not reproduce the commitment. The transaction is rejected and the user's ${nf(deposit,inTok==="ETH"?4:2)} ${inTok} collateral is slashed.</p>`:""}
    ${decOk&&commitOk?`<div class="scroll"><table><thead><tr><th>Rank</th><th>Bidder</th><th>Report</th><th>Bundle value Π(qᵢ)</th><th>Result</th></tr></thead><tbody>${order.map((i,r)=>`<tr class="${r===0&&M.filled?"win":""}"><td>${r+1}</td><td>A${i+1}</td><td>${usd(M.reports[i])}</td><td>${usd(M.values[i])}</td><td>${r===0&&M.filled?"wins, pays "+usd(M.pay):r===1&&M.filled?"sets the price":""}</td></tr>`).join("")}</tbody></table></div>
    ${M.filled?"":`<p class="note bad">No bidder values this bundle above zero at the user's limit, so no auction settles.</p>`}`:""}`;
  const leg=(a,b)=>{const dx=b.x-a.x,dy=b.y-a.y;return dx>0?`sells ${nf(dx,4)} ETH for ${nf(-dy,2)} USDC`:`buys ${nf(-dx,4)} ETH for ${nf(dy,2)} USDC`};
  const row=(l,act,p)=>`<tr><td>${l}</td><td style="text-align:left">${act}</td><td>${nf(p.x,4)}</td><td>${nf(p.y,2)}</td><td>${usd(p.y/p.x)}</td></tr>`;
  const s4=live?`<div class="scroll"><table><thead><tr><th>Leg</th><th style="text-align:left">Action</th><th>Pool ETH</th><th>Pool USDC</th><th>Spot price</th></tr></thead><tbody>
    ${row("s₀","Initial state",M.pool)}${row("FrontRun",`A${M.w+1} ${leg(M.pool,M.s1)}`,M.s1)}${row("TX",`User ${leg(M.s1,M.s2)}`,M.s2)}${row("BackRun",`A${M.w+1} ${leg(M.s2,M.pool)}`,M.pool)}</tbody></table></div>
    <p class="sub">The three legs are one atomic bundle. The pool finishes exactly where it started, so the next user's bundle is unaffected by this one.</p>`:`<p class="sub">Not executed.</p>`;
  const s5=live?`<dl class="kv"><dt>Winner pays pⱼ</dt><dd class="num">${usd(M.pay)}</dd><dt>Refund to user (α·pⱼ)</dt><dd class="num">${usd(refundU)}</dd><dt>To liquidity providers</dt><dd class="num">${usd(refundL)}</dd><dt>Winner's net profit</dt><dd class="num">${usd(M.winnerProfit)} <span class="sub">its true bundle value minus the payment</span></dd></dl>`:`<p class="sub">Nothing to distribute.</p>`;
  $("steps").innerHTML=st(1,"Encrypt and commit",pill("ok","on-chain"),s1)+st(2,"Arbitrageurs bid blind",pill("ok",P.nArb+" sealed bids"),s2)
    +st(3,"Decrypt, verify, pick the winner",decOk&&commitOk?pill("ok","verified"):pill("no","failed"),s3)
    +st(4,"Execute the sandwich bundle",live?pill("ok","atomic"):pill("na","skipped"),s4,!live)+st(5,"Redistribute",live?pill("ok","refunded"):pill("na","skipped"),s5,!live);

  /* incentive chart */
  const xs=[],ys=[];for(let o=-200;o<=200;o+=5){xs.push(o/100);ys.push(a1Utility(P,M,o/10000))}
  const truth=a1Utility(P,M,0),now=a1Utility(P,M,P.off),best=Math.max(...ys);
  lineChart($("icChart"),{x:xs,series:[{name:"A1 profit",color:"var(--accent)",y:ys}],xFmt:v=>(v>0?"+":"")+nf(v,2)+"%",yFmt:v=>usd(v,0),tipFmt:v=>usd(v),xTitle:"A1's report relative to its true belief",
    marks:[{x:0,label:"truthful"},...(P.off?[{x:P.off*100,label:"current"}]:[])],h:230});
  $("icNote").textContent=`Truthful profit ${usd(truth)}. Profit at the current report ${usd(now)}. Best profit anywhere on the grid ${usd(best)}${best<=truth+1e-9?", which the truthful report already achieves.":"."}`;

  /* checks */
  const C=[
    [commitOk,"Commitment binds the user",check?"SHA-256(TX‖r) "+(commitOk?"equals":"differs from")+" the on-chain c":"Cannot be checked until the trade is decrypted"],
    [!leak,`${P.t} colluding node${P.t===1?"":"s"} cannot read the trade`,"Decryption with "+P.t+" share"+(P.t===1?"":"s")+(leak?" succeeded":" fails authentication")],
    [enough,`Liveness with ${need} of ${P.n} nodes`,up.length+" online"],
    [Math.abs(quote(M.s1,P.dir,M.din)-M.minOut)<1e-6*M.minOut,"User filled at exactly the stated minimum","Output from the front-run state equals minOut"],
    [true,"Pool returns to s₀ after the bundle","Back-run restores ("+nf(M.pool.x,2)+", "+nf(M.pool.y,0)+"); bundles are order-independent"],
    [M.pay<=M.top+1e-9,"Winner pays the second-highest bid","Payment "+usd(M.pay)+" ≤ winning value "+usd(M.top)],
    [best<=truth+1e-9,"Truthful bidding is optimal for A1","Checked on 81 reports from −2% to +2%"],
    [!live||Math.abs(refundU+refundL-M.pay)<1e-9,"Every unit paid is refunded","User share + LP share = payment"]
  ];
  $("checks").innerHTML=C.map(c=>`<li class="${c[0]?"y":"x"}"><span class="i">${c[0]?"✓":"✕"}</span><span>${c[1]}<small>${c[2]}</small></span></li>`).join("");
}

function renderSim(){
  const P=params(),R=simulate(P,simSettings()),n=R.x.length,cU=R.costU[n-1],cM=R.costM[n-1],lU=R.lpU[n-1],lM=R.lpM[n-1];
  const bps=c=>R.fair?nf(c/R.fair*1e4,1)+" bps":"—",totU=R.sandU+R.lvrU,totM=R.usersM+R.lpsM+R.arbsM;
  $("simTiles").innerHTML=[
    ["Average user cost",bps(cU)+" → "+bps(cM),"Unprotected → MEVRES, against fair value"],
    ["User cost saved",usd(cU-cM,0),`${nf(R.nSand,0)} of ${nf(R.nTrades,0)} trades were sandwiched on the unprotected pool`],
    ["LP profit",usd(lU,0)+" → "+usd(lM,0),"Fees less arbitrage loss, plus auction refunds"],
    ["Value kept by searchers",(totU?nf(100,0):"0")+"% → "+(totM>0?nf(R.arbsM/totM*100,1):"0")+"%","Share of extractable value not returned. Bidder profit is valued at the bidder's own belief."]
  ].map(t=>`<div class="tile"><span class="k">${t[0]}</span><span class="v num">${t[1]}</span><span class="d">${t[2]}</span></div>`).join("");
  const lg=(el,a,b)=>el.innerHTML=`<span><span class="dot" style="background:var(--unprot)"></span>Unprotected DEX <b>${usd(a,0)}</b></span><span><span class="dot" style="background:var(--accent)"></span>MEVRES <b>${usd(b,0)}</b></span>`;
  lg($("lg1"),cU,cM);lg($("lg2"),lU,lM);
  const o={x:R.x,xFmt:v=>"block "+v,xTick:v=>nf(v,0),yFmt:v=>usd(v,0),xTitle:"Block"};
  lineChart($("ch1"),{...o,series:[{name:"Unprotected DEX",color:"var(--unprot)",y:R.costU},{name:"MEVRES",color:"var(--accent)",y:R.costM}]});
  lineChart($("ch2"),{...o,series:[{name:"Unprotected DEX",color:"var(--unprot)",y:R.lpU},{name:"MEVRES",color:"var(--accent)",y:R.lpM}]});
  const seg=(v,tot,c,t)=>v>0?`<span style="width:${v/tot*100}%;background:var(${c})" title="${t}: ${usd(v,0)}"></span>`:"";
  const big=Math.max(totU,totM,1e-9);
  $("flow").innerHTML=`<div class="flowrow"><span>Unprotected DEX · ${usd(totU,0)} extracted</span><div class="flowbar" style="width:${totU/big*100}%">${seg(totU,totU,"--arbs","Searchers")}</div></div>
    <div class="flowrow"><span>MEVRES · ${usd(totM,0)} auctioned</span><div class="flowbar" style="width:${totM/big*100}%">${seg(R.usersM,totM,"--users","Users")}${seg(R.lpsM,totM,"--lps","Liquidity providers")}${seg(Math.max(0,R.arbsM),totM,"--arbs","Arbitrageurs")}</div></div>`;
  const pc=v=>totM>0?nf(v/totM*100,1)+"%":"—";
  $("flowLg").innerHTML=`<span><span class="dot" style="background:var(--users)"></span>Users <b>${usd(R.usersM,0)}</b> (${pc(R.usersM)})</span><span><span class="dot" style="background:var(--lps)"></span>Liquidity providers <b>${usd(R.lpsM,0)}</b> (${pc(R.lpsM)})</span><span><span class="dot" style="background:var(--arbs)"></span>Searchers and arbitrageurs <b>${usd(R.arbsM,0)}</b> (${pc(R.arbsM)})</span>`
    +(R.revU||R.revM?`<span>Trades that missed their limit: ${R.revU} unprotected, ${R.revM} MEVRES</span>`:"");
}

/* ---------- wiring ---------- */
let simTimer;
const both=()=>{render();clearTimeout(simTimer);simTimer=setTimeout(renderSim,120)};
document.querySelectorAll(".rail input,.rail select").forEach(el=>el.addEventListener("input",both));
$("dir").addEventListener("change",()=>{const P=params(),a=parseFloat($("amt").value)||0;$("amt").value=$("dir").value==="X2Y"?+(a/P.pp).toFixed(4):+(a*P.pp).toFixed(2);$("amt").step=$("dir").value==="X2Y"?1:1000;both()});
$("nNode").addEventListener("input",()=>{online=[]});
$("regen").addEventListener("click",()=>{sealedFor="";render()});
$("steps").addEventListener("click",e=>{const b=e.target.closest("[data-node]");if(!b)return;const i=+b.dataset.node;online[i]=!online[i];render()});
document.querySelectorAll(".simctl input").forEach(el=>el.addEventListener("input",()=>{clearTimeout(simTimer);simTimer=setTimeout(renderSim,150)}));
$("sRun").addEventListener("click",()=>{simSeed++;renderSim()});
render();renderSim();

