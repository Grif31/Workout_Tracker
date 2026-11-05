// Approximate path bounding boxes by sampling every segment.
function bbox(d){
  const toks=d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e-?\d+)?/g);let i=0,cmd='',x=0,y=0,sx=0,sy=0,px=null,py=null;
  const pts=[];const add=(a,b)=>pts.push([a,b]);
  const num=()=>parseFloat(toks[i++]);
  const cubic=(x0,y0,x1,y1,x2,y2,x3,y3)=>{for(let t=0;t<=1;t+=0.02){const u=1-t;add(u*u*u*x0+3*u*u*t*x1+3*u*t*t*x2+t*t*t*x3,u*u*u*y0+3*u*u*t*y1+3*u*t*t*y2+t*t*t*y3);}};
  const quad=(x0,y0,x1,y1,x2,y2)=>{for(let t=0;t<=1;t+=0.02){const u=1-t;add(u*u*x0+2*u*t*x1+t*t*x2,u*u*y0+2*u*t*y1+t*t*y2);}};
  function arc(x1,y1,rx,ry,phi,fa,fs,x2,y2){ // assumes phi=0
    const dx=(x1-x2)/2,dy=(y1-y2)/2;let l=dx*dx/(rx*rx)+dy*dy/(ry*ry);if(l>1){rx*=Math.sqrt(l);ry*=Math.sqrt(l);}
    let s=(fa===fs?-1:1)*Math.sqrt(Math.max(0,(rx*rx*ry*ry-rx*rx*dy*dy-ry*ry*dx*dx)/(rx*rx*dy*dy+ry*ry*dx*dx)));
    const cxp=s*rx*dy/ry,cyp=-s*ry*dx/rx,cx=cxp+(x1+x2)/2,cy=cyp+(y1+y2)/2;
    const ang=(ux,uy,vx,vy)=>Math.atan2(ux*vy-uy*vx,ux*vx+uy*vy);
    const t1=ang(1,0,(dx-cxp)/rx,(dy-cyp)/ry);let dt=ang((dx-cxp)/rx,(dy-cyp)/ry,(-dx-cxp)/rx,(-dy-cyp)/ry);
    if(!fs&&dt>0)dt-=2*Math.PI;if(fs&&dt<0)dt+=2*Math.PI;
    for(let k=0;k<=100;k++){const t=t1+dt*k/100;add(cx+rx*Math.cos(t),cy+ry*Math.sin(t));}
  }
  while(i<toks.length){
    if(/[a-zA-Z]/.test(toks[i]))cmd=toks[i++];
    const r=cmd===cmd.toLowerCase(),C=cmd.toUpperCase();
    if(C==='Z'){x=sx;y=sy;continue;}
    if(C==='M'){let a=num(),b=num();if(r){a+=x;b+=y;}x=a;y=b;sx=a;sy=b;add(x,y);cmd=r?'l':'L';continue;}
    if(C==='L'){let a=num(),b=num();if(r){a+=x;b+=y;}x=a;y=b;add(x,y);continue;}
    if(C==='H'){let a=num();if(r)a+=x;x=a;add(x,y);continue;}
    if(C==='V'){let b=num();if(r)b+=y;y=b;add(x,y);continue;}
    if(C==='C'){let a=[num(),num(),num(),num(),num(),num()];if(r)a=a.map((v,k)=>v+(k%2?y:x));cubic(x,y,...a);px=a[2];py=a[3];x=a[4];y=a[5];continue;}
    if(C==='S'){let a=[num(),num(),num(),num()];if(r)a=a.map((v,k)=>v+(k%2?y:x));const c1x=px!==null?2*x-px:x,c1y=py!==null?2*y-py:y;cubic(x,y,c1x,c1y,...a);px=a[0];py=a[1];x=a[2];y=a[3];continue;}
    if(C==='Q'){let a=[num(),num(),num(),num()];if(r)a=a.map((v,k)=>v+(k%2?y:x));quad(x,y,...a);x=a[2];y=a[3];continue;}
    if(C==='A'){const rx=num(),ry=num(),ph=num(),fa=num(),fs=num();let a=num(),b=num();if(r){a+=x;b+=y;}arc(x,y,rx,ry,ph,fa,fs,a,b);x=a;y=b;continue;}
    throw new Error('cmd '+cmd);
  }
  const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);
  const b={x0:Math.min(...xs),x1:Math.max(...xs),y0:Math.min(...ys),y1:Math.max(...ys)};b.cx=(b.x0+b.x1)/2;b.cy=(b.y0+b.y1)/2;b.w=b.x1-b.x0;b.h=b.y1-b.y0;return b;
}
module.exports=bbox;
const IC={
  work:'M3 4.5h18M5 4.5a1.6 1.6 0 1 0 1.6 1.6M19 4.5a1.6 1.6 0 1 1-1.6 1.6M6 7.5h12M7.5 7.5v10.5M10.5 7.5v10.5M13.5 7.5v10.5M16.5 7.5v10.5M5.5 18h13M4 20.5h16',
  vol:'M12 2.5a7.5 7.5 0 1 0 .01 0zM4.5 10h15M5.6 6.3h12.8M5.6 13.7h12.8M12 2.5c3 2.5 3 12.5 0 15M12 2.5c-3 2.5-3 12.5 0 15M3.5 21.5c1.8-2.2 4.6-3.3 8.5-3.3s6.7 1.1 8.5 3.3',
  streak:'M12 1.5c2.4 2.2 3.8 4 3.8 6a3.8 3.8 0 0 1-7.6 0c0-2 1.4-3.8 3.8-6zM12 5.6c1 1 1.6 1.8 1.6 2.6a1.6 1.6 0 0 1-3.2 0c0-.8.6-1.6 1.6-2.6zM7 11.5h10l-1 2H8zM9 13.5l1.2 8h3.6l1.2-8M9.6 16.5h4.8M10 19h4',
  pr:'M3 19.5c5.5 0 10.5-3.5 13.5-9.5 1-2 2.5-4.5 4.5-6 .3 3-.5 5.5-2 7.5 1 0 2-.3 2.8-.8-.8 2.6-2.8 4.6-5.3 5.6 1 .2 2 .1 2.8-.2-2 2.2-5.3 3.4-9 3.4H3M7 18.6c2.6-.9 5-2.7 6.8-5.2M10.5 19.2c2.4-.6 4.8-2 6.4-3.9M5 19.5c3-2 5.5-5 7-8.5',
  dist:'M2.5 18.5h12.5l5.5 1.4v1.6h-18zM5 18.5l2.2-6.5h3.3M8.7 18.5l1.5-4.5M12 18.5l1-3M7.2 12c0-1.6 1.2-2.6 2.8-2.6h1.5M13.5 11.5c1.8-3.2 5-4.7 8-4-2 .5-3.3 1.4-4.2 2.6 1.3-.2 2.6 0 3.7.6-1.6.2-3 .8-4 1.8 1 0 2 .2 2.8.6-2 .4-4.3.2-6.3-1.6',
  elev:'M3 9l9-5.5 9 5.5zM12 3.5V2M9.5 7.3h5M3.5 9.5h17M4.5 11h15M6 11v7M9.3 11v7M14.7 11v7M18 11v7M4.5 18h15M3.5 19.8h17M2.5 21.5h19',
  explore:'M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2zM12 5.5a6.5 6.5 0 1 0 .01 0zM16.6 7.4l-3.3 4M7.4 16.6l3.3-4M16.6 16.6l-3.3-4M7.4 7.4l3.3 4M12 10.6a1.4 1.4 0 1 0 .01 0z',
  feat:'M13.5 2.5a1.9 1.9 0 1 0 .01 0zM7.5 10l3.5-3 3.5 1.8 2.8 3.4M11 7l-1.6 6 3.8 2.8-1.2 5.7M9.4 13l-3.9 4M13.2 15.8l3.8 1.6M4 21.5h16'
};
const SH={
  work:'M32 4 A28 28 0 1 1 31.99 4 Z',
  vol:'M18 7 L44 5 L58 21 L57 44 L41 59 L19 57 L5 39 L7 19 Z',
  streak:'M32 3 C38 13 54 22 54 38 A22 22 0 0 1 10 38 C10 27 18 22 23 11 C26 16 29 18 31 20 C30 14 30 8 32 3 Z',
  pr:'M12 60 V26 A20 20 0 0 1 52 26 V60 Z',
  elev:'M3 58 L21 20 L29 31 L40 6 L61 58 Z',
  explore:'M11 6 H53 Q58 6 58 11 V53 Q58 58 53 58 H11 Q6 58 6 53 V11 Q6 6 11 6 Z',
  plate:'M5 21 C5 11 17 9 23 17 C27 21 37 21 41 17 C47 9 59 11 59 21 V43 C59 53 47 55 41 47 C37 43 27 43 23 47 C17 55 5 53 5 43 Z',
  feat:'M25 5 H39 V9 C39 12 36 13 36 16 C47 19 53 29 50 41 C47 51 40 56 32 59 C24 56 17 51 14 41 C11 29 17 19 28 16 C28 13 25 12 25 9 Z'
};
if(require.main===module){
  for(const k in IC){const b=bbox(IC[k]);console.log('icon',k.padEnd(8),'x',b.x0.toFixed(1),b.x1.toFixed(1),'y',b.y0.toFixed(1),b.y1.toFixed(1),'c',b.cx.toFixed(2),b.cy.toFixed(2),'w',b.w.toFixed(1),'h',b.h.toFixed(1));}
  for(const k in SH){const b=bbox(SH[k]);console.log('shape',k.padEnd(8),'x',b.x0.toFixed(1),b.x1.toFixed(1),'y',b.y0.toFixed(1),b.y1.toFixed(1),'c',b.cx.toFixed(2),b.cy.toFixed(2));}
}
