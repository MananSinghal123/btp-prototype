/* Shamir secret sharing over GF(2^8): split a key into n shares, any k of which rebuild it. */
const EXP=new Uint8Array(512),LOG=new Uint8Array(256);
(()=>{let x=1;for(let i=0;i<255;i++){EXP[i]=x;LOG[x]=i;const xt=((x<<1)^(x&0x80?0x11b:0))&0xff;x^=xt}for(let i=255;i<512;i++)EXP[i]=EXP[i-255]})();
const gmul=(a,b)=>a&&b?EXP[LOG[a]+LOG[b]]:0, gdiv=(a,b)=>a?EXP[LOG[a]+255-LOG[b]]:0;
function split(secret,n,k){const sh=Array.from({length:n},(_,i)=>({x:i+1,y:new Uint8Array(secret.length)}));const co=new Uint8Array(k);
  for(let b=0;b<secret.length;b++){crypto.getRandomValues(co);co[0]=secret[b];for(const s of sh){let acc=0;for(let j=k-1;j>=0;j--)acc=gmul(acc,s.x)^co[j];s.y[b]=acc}}return sh}
function combine(sh){const out=new Uint8Array(sh[0].y.length);for(let b=0;b<out.length;b++){let acc=0;for(let j=0;j<sh.length;j++){let l=1;for(let m=0;m<sh.length;m++)if(m!==j)l=gmul(l,gdiv(sh[m].x,sh[m].x^sh[j].x));acc^=gmul(sh[j].y[b],l)}out[b]=acc}return out}

export {split, combine};
