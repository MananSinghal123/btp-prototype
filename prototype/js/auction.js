/* Bundle valuation and the second-price rule. */
/* value (USDC) of the sandwich bundle to a bidder who prices ETH at q: the pool ends where it began, so the bidder nets the user's flows */
function bundleValue(q,dir,din,minOut){return dir==="X2Y"?q*din-minOut:din-q*minOut}
function rebalValue(q,p){const d=Math.sqrt(q*p.x)-Math.sqrt(p.y);return d*d}
function secondPrice(values){let w=0;for(let i=1;i<values.length;i++)if(values[i]>values[w])w=i;let s=-Infinity;values.forEach((v,i)=>{if(i!==w&&v>s)s=v});return{w,top:values[w],pay:Math.max(0,s)}}

export {bundleValue, rebalValue, secondPrice};
