// Builds an olive crown that follows a badge's outline: leaves walk up both sides from the bottom
// and stop at the shape's first high point, so they hug shields, stones, peaks and steles alike.
const fs=require('fs');
const src=fs.readFileSync('bbox.js','utf8');
// reuse the sampler: patch bbox to return its ordered points
const sampler=eval('('+src.match(/function bbox\(d\)\{[\s\S]*?\n\}/)[0].replace('const xs=pts.map','return pts;const xs=pts.map')+')');
const C=32;
function milled(){const p=[];for(let i=0;i<40;i++){const a=i/40*2*Math.PI,r=i%2?26.8:29;p.push((C+r*Math.sin(a)).toFixed(2)+' '+(C-r*Math.cos(a)).toFixed(2));}return 'M'+p.join(' L')+' Z';}
const SH={
  work:'M32 4 A28 28 0 1 1 31.99 4 Z',
  hours:'M32 4 L57 14 H53 V53 H57 V60 H7 V53 H11 V14 H7 Z',
  vol:'M18 7 L44 5 L58 21 L57 44 L41 59 L19 57 L5 39 L7 19 Z',
  streak:'M32 3 C41 14 58 24 58 39 A26 22 0 0 1 6 39 C6 28 15 22 21 10 C24 15 28 18 31 20 C30 14 30 8 32 3 Z',
  pr:'M12 60 V26 A20 20 0 0 1 52 26 V60 Z',
  dist:milled(),
  elev:'M3 58 L21 20 L29 31 L40 6 L61 58 Z',
  explore:'M28 11.34 V7 H36 V11.34 A24 24 0 1 1 28 11.34 Z',
  met1:'M7 12 H57 A5 5 0 0 0 62 17 V47 A5 5 0 0 0 57 52 H7 A5 5 0 0 0 2 47 V17 A5 5 0 0 0 7 12 Z',
  met2:'M10 7 H54 V57 H10 Z',
  plate:'M5 21 C5 11 17 9 23 17 C27 21 37 21 41 17 C47 9 59 11 59 21 V43 C59 53 47 55 41 47 C37 43 27 43 23 47 C17 55 5 53 5 43 Z'
};
function resample(pts,step){ // closed polyline -> evenly spaced points
  const P=pts.concat([pts[0]]);const out=[];let carry=0;
  for(let i=1;i<P.length;i++){const [ax,ay]=P[i-1],[bx,by]=P[i];const L=Math.hypot(bx-ax,by-ay);if(!L)continue;let t=carry;
    while(t<=L){out.push([ax+(bx-ax)*t/L,ay+(by-ay)*t/L]);t+=step;}carry=t-L;}
  return out;
}
const f=n=>n.toFixed(2);
function crown(d,{off=3.2,spacing=10.5,gap=6,len=7.5,topDeg=28}={}){
  const pts=resample(sampler(d),0.5);const n=pts.length;
  const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);const cx=(Math.min(...xs)+Math.max(...xs))/2,cy=(Math.min(...ys)+Math.max(...ys))/2;
  // outward normal, smoothed over neighbours so corners turn gradually
  const K=8;const nrm=pts.map((p,i)=>{const a=pts[(i-K+n)%n],b=pts[(i+K)%n];let tx=b[0]-a[0],ty=b[1]-a[1];const l=Math.hypot(tx,ty)||1;tx/=l;ty/=l;let nx=ty,ny=-tx;if(nx*(p[0]-cx)+ny*(p[1]-cy)<0){nx=-nx;ny=-ny;}return [nx,ny];});
  // start where a ray straight down from the centre leaves the shape
  let s=0,best=-1;pts.forEach((p,i)=>{if(Math.abs(p[0]-cx)<1.5&&p[1]>best){best=p[1];s=i;}});
  let dpath='';const ext={x0:1e9,x1:-1e9,y0:1e9,y1:-1e9};
  [1,-1].forEach(dir=>{
    let travelled=0,next=gap,i=s,minY=1e9,prevY=pts[s][1];
    for(let k=0;k<n/2;k++){
      const j=(i+dir+n)%n;travelled+=Math.hypot(pts[j][0]-pts[i][0],pts[j][1]-pts[i][1]);i=j;const p=pts[i];
      const up=Math.atan2(Math.abs(p[0]-cx),cy-p[1])*180/Math.PI; // 0 = straight up
      if(p[1]<cy&&up<topDeg)break;
      if(p[1]<cy){ if(p[1]<minY)minY=p[1]; else if(p[1]>minY+1.5)break; } // passed a local peak
      if(travelled>=next){
        next+=spacing;const [nx,ny]=nrm[i];const bx=p[0]+nx*off,by=p[1]+ny*off;
        let tx=-ny*dir,ty=nx*dir; if(ty>0&&p[1]<cy){tx=-tx;ty=-ty;}
        // tangent should point the way we're walking
        const a=pts[(i-2*dir+n)%n];const wx=p[0]-a[0],wy=p[1]-a[1];if(tx*wx+ty*wy<0){tx=-tx;ty=-ty;}
        [0.8,0.3].forEach(w=>{let dx=tx*(1-w)+nx*w,dy=ty*(1-w)+ny*w;const l=Math.hypot(dx,dy);dx/=l;dy/=l;
          const qx=bx+dx*len,qy=by+dy*len,mx=(bx+qx)/2,my=(by+qy)/2,ox=-dy*2.4,oy=dx*2.4;
          dpath+='M'+f(bx)+' '+f(by)+' Q'+f(mx+ox)+' '+f(my+oy)+' '+f(qx)+' '+f(qy)+' Q'+f(mx-ox)+' '+f(my-oy)+' '+f(bx)+' '+f(by)+' Z ';
          for(const [X,Y] of [[qx,qy],[mx+ox,my+oy],[mx-ox,my-oy]]){ext.x0=Math.min(ext.x0,X);ext.x1=Math.max(ext.x1,X);ext.y0=Math.min(ext.y0,Y);ext.y1=Math.max(ext.y1,Y);}
        });
      }
    }
  });
  return {d:dpath.trim(),ext};
}
const out={};
for(const k in SH){const r=crown(SH[k]);out[k]=r.d;console.error(k.padEnd(8),'leaves',(r.d.match(/M/g)||[]).length,'extent x',f(r.ext.x0),f(r.ext.x1),'y',f(r.ext.y0),f(r.ext.y1));}
fs.writeFileSync('crowns.json',JSON.stringify(out));
