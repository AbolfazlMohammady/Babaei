(() => {
const canvas=document.querySelector('[data-particle-field]'); if(!canvas)return;
const ctx=canvas.getContext('2d',{alpha:true}); if(!ctx)return;
const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const mobile=window.matchMedia('(max-width:700px)').matches;
let w=0,h=0,dpr=1,particles=[],raf=0,start=performance.now();
const palette=[[44,112,76],[68,145,91],[115,157,112],[171,183,139],[226,218,190]];
const rnd=(a,b)=>a+Math.random()*(b-a);
function make(){return{a:rnd(0,Math.PI*2),r:Math.pow(Math.random(),.72),z:rnd(.15,1),s:rnd(.00024,.00072),o:rnd(.65,1.45),d:rnd(-1,1),p:rnd(0,Math.PI*2),size:rnd(.55,1.75),alpha:rnd(.25,.9),co:rnd(0,palette.length-1)};}
function resize(){const r=canvas.getBoundingClientRect();w=Math.max(1,r.width);h=Math.max(1,r.height);dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.floor(w*dpr);canvas.height=Math.floor(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);const n=reduced?500:(mobile?850:1750);particles=Array.from({length:n},make);}
function col(i,t){const pos=(i+t)%palette.length,a=Math.floor(pos),b=(a+1)%palette.length,m=pos-a,x=palette[a],y=palette[b];return[Math.round(x[0]+(y[0]-x[0])*m),Math.round(x[1]+(y[1]-x[1])*m),Math.round(x[2]+(y[2]-x[2])*m)];}
function draw(now){const time=reduced?0:now-start;ctx.clearRect(0,0,w,h);const g=ctx.createRadialGradient(w*.5,h*.51,0,w*.5,h*.51,Math.max(w,h)*.55);g.addColorStop(0,'rgba(42,104,67,.15)');g.addColorStop(.34,'rgba(24,64,42,.07)');g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);const cx=w*.5,cy=h*.51,scale=Math.min(w,h),shift=(time*.000045)%palette.length;
for(let i=0;i<particles.length;i++){const p=particles[i];if(!reduced){p.z-=p.s*.95*(1+p.r);if(p.z<.06){p.z=1;p.a=rnd(0,Math.PI*2);p.r=Math.pow(Math.random(),.72);}}const z=p.z,pulse=1+Math.sin(time*.0012+p.p)*.045,ring=p.r*(.22+z*.9)*pulse,tw=p.a+time*.00028*p.o+(1-z)*2.4+Math.sin(time*.00045+p.p)*.06, pinch=.52+Math.pow(Math.abs(Math.sin(tw)),.8)*.78,x=cx+Math.cos(tw)*ring*scale*pinch,y=cy+Math.sin(tw)*ring*scale*(.48+z*.26)+Math.sin(time*.0007+p.p)*p.d*7,dist=Math.hypot((x-cx)/scale,(y-cy)/scale),alpha=p.alpha*Math.min(1,dist*7.5)*Math.pow(z,.38);if(alpha<.015)continue;const rgb=col(p.co,shift+p.r*.8),size=p.size*(.55+z*1.65);ctx.fillStyle='rgba('+rgb[0]+','+rgb[1]+','+rgb[2]+','+alpha+')';ctx.fillRect(x,y,size,size);if(i%23===0&&size>1.2){ctx.globalAlpha=alpha*.22;ctx.beginPath();ctx.arc(x,y,size*3.2,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;}}
if(!reduced)raf=requestAnimationFrame(draw);}
const observer=new ResizeObserver(resize);observer.observe(canvas);resize();draw(performance.now());window.addEventListener('pagehide',()=>{cancelAnimationFrame(raf);observer.disconnect();},{once:true});
})();