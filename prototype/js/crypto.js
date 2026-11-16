import {hex} from "./util.js";
import {split} from "./shamir.js";

/* Step 1 and Step 3 cryptography: SHA-256 commitment, AES-256-GCM encryption, threshold key shares. */
const cat=(a,b)=>{const o=new Uint8Array(a.length+b.length);o.set(a);o.set(b,a.length);return o};
const sha=async u=>new Uint8Array(await crypto.subtle.digest("SHA-256",u));
const aesKey=raw=>crypto.subtle.importKey("raw",raw,"AES-GCM",false,["encrypt","decrypt"]);
async function seal(tx,n,t){
  const key=crypto.getRandomValues(new Uint8Array(32)),iv=crypto.getRandomValues(new Uint8Array(12)),salt=crypto.getRandomValues(new Uint8Array(32));
  const te=new TextEncoder(),body=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv},await aesKey(key),te.encode(JSON.stringify({tx,r:hex(salt)}))));
  const ct=cat(iv,body);
  return{tx,key,ct,salt,commit:await sha(cat(te.encode(JSON.stringify(tx)),salt)),shares:split(key,n,t+1)};
}
async function open(ct,key){try{const pt=await crypto.subtle.decrypt({name:"AES-GCM",iv:ct.slice(0,12)},await aesKey(key),ct.slice(12));return JSON.parse(new TextDecoder().decode(pt))}catch(e){return null}}

export {cat, sha, seal, open};
