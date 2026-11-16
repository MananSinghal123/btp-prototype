/* Constant-product pool (x*y=k): quoting, swapping, and the front-run state of the sandwich bundle. */
const K=p=>p.x*p.y;
function quote(p,dir,din){return dir==="X2Y"?p.y-K(p)/(p.x+din):p.x-K(p)/(p.y+din)}
function apply(p,dir,din){const k=K(p);return dir==="X2Y"?{x:p.x+din,y:k/(p.x+din)}:{x:k/(p.y+din),y:p.y+din}}
/* state from which the user's swap returns exactly minOut */
function frontState(p,dir,din,minOut){const k=K(p),a=(-din+Math.sqrt(din*din+4*k*din/minOut))/2;return dir==="X2Y"?{x:a,y:k/a}:{x:k/a,y:a}}

export {K, quote, apply, frontState};
