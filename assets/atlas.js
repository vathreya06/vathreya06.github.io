/* Interactive spatial map. The portfolio's original graph remains the source of truth. */
(() => {
  'use strict';
  const api = window.portfolioMap;
  const stage = document.getElementById('atlas-stage');
  if (!api || !stage) return;
  const canvas = stage.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) { location.replace('map.html' + location.hash); return; }
  const labels = document.getElementById('atlas-labels');
  const picker = document.getElementById('atlas-picker');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const groupNames = ['Coursework', 'Skills', 'Projects', 'Experience'];
  const groupVars = ['course', 'skill', 'project', 'experience'];
  const desktopCenters = [[-3.8, .7, -.7], [-1.2, -.5, 1.1], [1.7, .95, -.7], [4.0, -.05, .8]];
  const mobileCenters = [[-1.3, 1.8, -.4], [1.4, 1.8, .4], [-1.3, -1.05, .5], [1.4, -1.05, -.4]];
  let centers=desktopCenters;
  const featured = new Set(['logic','micro','pcb','safety','rc','esp','bci','alu','stone','trimas']);
  const shortLabels = {'circuits':'Circuits & Systems','lab':'Circuits Lab','logic':'Digital Logic','analysis':'EE Analysis','business':'Business Minor','electronic':'Electronic Circuits','electronicslab':'Electronics Lab','fields':'Fields & Waves','ethics':'Ethics','micro':'Microprocessors','cprogram':'Programming in C','requirements':'Requirements & Changes','software':'Application Development'};
  const points = [];
  const byId = new Map();
  const buttons = new Map();
  let width=0, height=0, yaw=-.16, pitch=.48, zoom=1;
  let selected=api.getSelection(), frame=0, pointer=null, inView=true;
  let palette, themeDirty=true;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
  const rgba=(hex,a)=>{const h=hex.trim().replace('#','');const full=h.length===3?h.split('').map(x=>x+x).join(''):h;return `rgba(${parseInt(full.slice(0,2),16)},${parseInt(full.slice(2,4),16)},${parseInt(full.slice(4,6),16)},${a})`;};

  groupNames.forEach((group,g)=>{
    const list=api.nodes.filter(n=>n.group===group);
    const optionGroup=document.createElement('optgroup');optionGroup.label=group;picker.append(optionGroup);
    list.forEach((node,i)=>{
      const angle=i/list.length*Math.PI*2-.9;
      const radius=list.length>6?1.05:1.08;
      const p=[centers[g][0]+Math.cos(angle)*radius,centers[g][1]+Math.sin(angle)*.72,centers[g][2]+Math.sin(angle)*.65+(i%2?.3:-.2)];
      const entry={...node,p,g,index:i,total:list.length};points.push(entry);byId.set(node.id,entry);
      const b=document.createElement('button');b.type='button';b.className='atlas-node';b.dataset.atlasNode=node.id;b.setAttribute('aria-label',`${node.label}, ${group}. Show connections.`);b.setAttribute('aria-pressed','false');
      const text=document.createElement('span');text.className='atlas-node-label';text.textContent=shortLabels[node.id]||node.label;b.append(text);labels.append(b);buttons.set(node.id,b);
      const select=()=>api.select(api.getPinned()===node.id?null:node.id);
      b.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();e.stopPropagation();select();});
      b.addEventListener('click',e=>{if(e.detail===0)select();});
      b.addEventListener('focus',()=>{api.preview(node.id);requestDraw();});
      b.addEventListener('blur',()=>api.preview(null));
      const opt=document.createElement('option');opt.value=node.id;opt.textContent=node.label;optionGroup.append(opt);
    });
  });
  document.getElementById('atlas-count').textContent=`${points.length} nodes · ${api.edges.length} connections`;
  picker.addEventListener('change',()=>api.select(picker.value||null));
  const startingPoints=['logic','pcb','rc','stone'];
  document.querySelectorAll('[data-atlas-group]').forEach((b,i)=>b.addEventListener('click',()=>api.select(startingPoints[i])));

  function readPalette(){
    const s=getComputedStyle(document.documentElement);
    palette={ink:s.getPropertyValue('--ink').trim(),muted:s.getPropertyValue('--muted').trim(),line:s.getPropertyValue('--line').trim(),paper:s.getPropertyValue('--paper').trim(),colors:groupVars.map(v=>s.getPropertyValue('--'+v).trim())};
    buttons.forEach((b,id)=>b.style.setProperty('--atlas-color',palette.colors[byId.get(id).g]));
    document.querySelectorAll('[data-atlas-group]').forEach((b,i)=>b.style.setProperty('--atlas-color',palette.colors[i]));
    themeDirty=false;
  }
  function project(p){
    const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
    const x=p[0]*cy+p[2]*sy,z=-p[0]*sy+p[2]*cy;
    const y=p[1]*cp-z*sp,depth=p[1]*sp+z*cp;
    const perspective=12/(12+depth);
    const scale=Math.min(width/(width<600?5.4:12.2),height/6.4)*zoom;
    return {x:width*.5+x*scale*perspective,y:height*.51-y*scale*perspective,z:depth,k:perspective};
  }
  function line3(list,color,lineWidth=1,close=false,fill=null){
    ctx.beginPath();list.forEach((p,i)=>{const q=project(p);i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y);});if(close)ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill();}ctx.strokeStyle=color;ctx.lineWidth=lineWidth;ctx.stroke();
  }
  function curvePoint(a,b,t){
    const p=mix(a,b,t);p[1]+=Math.sin(t*Math.PI)*(.34+Math.abs(a[0]-b[0])*.055);return p;
  }
  function draw(now){
    frame=0;if(document.getElementById('home').hidden||!inView)return;
    if(themeDirty)readPalette();
    ctx.clearRect(0,0,width,height);
    const active=new Set(selected?[selected,...api.edges.filter(e=>e.a===selected||e.b===selected).flatMap(e=>[e.a,e.b])]:[]);
    // A perspective drafting grid gives the floating constellations a spatial reference.
    for(let x=-6;x<=6;x+=.5)line3([[x,-1.4,-2.6],[x,-1.4,2.6]],rgba(palette.ink,x%1===0?.055:.025),.7);
    for(let z=-2.5;z<=2.5;z+=.5)line3([[-6,-1.4,z],[6,-1.4,z]],rgba(palette.ink,z%1===0?.055:.025),.7);
    centers.forEach((c,g)=>{
      const groupActive=!selected||points.some(n=>n.g===g&&active.has(n.id));
      const ring=[];const factor=width<600?.62:1;for(let i=0;i<=64;i++){const a=i/64*Math.PI*2;ring.push([c[0]+Math.cos(a)*1.32*factor,c[1]-.85,c[2]+Math.sin(a)*1.05*factor]);}
      line3(ring,rgba(palette.colors[g],groupActive?.27:.09),.8,true,rgba(palette.colors[g],groupActive?.045:.012));
      const inner=ring.map(p=>[c[0]+(p[0]-c[0])*.72,p[1],c[2]+(p[2]-c[2])*.72]);line3(inner,rgba(palette.colors[g],.12),.6);
      const hub=project([c[0],c[1]+1.18,c[2]]);
      ctx.font='9px monospace';ctx.fillStyle=rgba(palette.colors[g],groupActive?.95:.3);ctx.textAlign='center';ctx.fillText(`0${g+1}  ${groupNames[g].toUpperCase()}`,hub.x,hub.y);
      const pin=project([c[0],c[1]+1.02,c[2]]);ctx.beginPath();ctx.moveTo(hub.x,hub.y+7);ctx.lineTo(pin.x,pin.y);ctx.strokeStyle=rgba(palette.colors[g],.3);ctx.stroke();
    });
    api.edges.forEach(e=>{
      const a=byId.get(e.a),b=byId.get(e.b),lit=selected&&(e.a===selected||e.b===selected);
      const route=[];for(let i=0;i<=22;i++)route.push(curvePoint(a.p,b.p,i/22));
      line3(route,rgba(lit?palette.colors[byId.get(selected).g]:palette.ink,lit?.7:selected?.035:.13),lit?1.5:.65);
      if(lit&&!reduced.matches){const t=(now/3200)%1,q=project(curvePoint(a.p,b.p,t));ctx.beginPath();ctx.arc(q.x,q.y,2.1,0,Math.PI*2);ctx.fillStyle=palette.colors[byId.get(selected).g];ctx.fill();}
    });
    const projected=points.map(n=>({...n,q:project(n.p)}));
    projected.sort((a,b)=>b.q.z-a.q.z).forEach(n=>{
      const lit=!selected||active.has(n.id),r=(n.id===selected?5.3:3.7)*n.q.k;
      const floor=project([n.p[0],centers[n.g][1]-.85,n.p[2]]);
      ctx.beginPath();ctx.moveTo(floor.x,floor.y);ctx.lineTo(n.q.x,n.q.y);ctx.strokeStyle=rgba(palette.colors[n.g],lit?.11:.025);ctx.lineWidth=.65;ctx.stroke();
      ctx.beginPath();ctx.ellipse(floor.x,floor.y,5*n.q.k,1.8*n.q.k,0,0,Math.PI*2);ctx.fillStyle=rgba(palette.colors[n.g],lit?.12:.025);ctx.fill();
      ctx.globalAlpha=lit?1:.2;
      const glow=ctx.createRadialGradient(n.q.x-r*.3,n.q.y-r*.4,.1,n.q.x,n.q.y,r);
      glow.addColorStop(0,palette.paper);glow.addColorStop(.35,palette.colors[n.g]);glow.addColorStop(1,rgba(palette.colors[n.g],.7));ctx.fillStyle=glow;ctx.beginPath();ctx.arc(n.q.x,n.q.y,r,0,Math.PI*2);ctx.fill();
      if(n.id===selected){ctx.beginPath();ctx.arc(n.q.x,n.q.y,r+4,0,Math.PI*2);ctx.strokeStyle=rgba(palette.colors[n.g],.4);ctx.lineWidth=1;ctx.stroke();}
      ctx.globalAlpha=1;
    });
    // Prefer related labels, then featured work; remaining points stay focusable.
    const order=[...projected].sort((a,b)=>(b.id===selected?100:active.has(b.id)?50:featured.has(b.id)?10:0)-(a.id===selected?100:active.has(a.id)?50:featured.has(a.id)?10:0));
    const occupied=[];
    for(const n of order){
      const b=buttons.get(n.id);const eligible=n.id===selected||active.has(n.id)||(!selected&&featured.has(n.id));
      const label=shortLabels[n.id]||n.label;
      const labelWidth=Math.min(width<500?155:190,label.length*(width<500?4.4:5.2)+28);
      let pos={x:n.q.x-14,y:n.q.y-14},hasLabel=false;
      if(eligible){
        const candidates=[{x:n.q.x+7,y:n.q.y-14},{x:n.q.x-labelWidth-7,y:n.q.y-14},{x:n.q.x-labelWidth*.5,y:n.q.y-35},{x:n.q.x-labelWidth*.5,y:n.q.y+9}];
        for(const c of candidates){const box={x:c.x,y:c.y,w:labelWidth,h:28};if(c.x<7||c.x+box.w>width-7||c.y<52||c.y+28>height-47)continue;if(occupied.some(r=>box.x<r.x+r.w+5&&box.x+box.w+5>r.x&&box.y<r.y+r.h+5&&box.y+box.h+5>r.y))continue;pos=c;occupied.push(box);hasLabel=true;break;}
      }
      // Focused points are always labelled, including in dense camera angles.
      if(document.activeElement===b&&!hasLabel){hasLabel=true;pos={x:clamp(n.q.x+7,7,width-labelWidth-7),y:clamp(n.q.y-14,52,height-75)};}
      b.classList.toggle('has-label',hasLabel);b.classList.toggle('is-selected',n.id===selected);b.classList.toggle('is-dim',!!selected&&!active.has(n.id));
      b.setAttribute('aria-pressed',String(n.id===api.getPinned()));b.style.transform=`translate(${pos.x}px,${pos.y}px)`;b.style.zIndex=String(n.id===selected?90:hasLabel?40:50);
      b.style.width=hasLabel?labelWidth+'px':'28px';
      b.style.visibility=n.q.x<0||n.q.x>width||n.q.y<0||n.q.y>height?'hidden':'visible';
    }
    if(selected&&!reduced.matches&&!document.hidden&&inView)frame=requestAnimationFrame(draw);
  }
  function requestDraw(){if(!frame)frame=requestAnimationFrame(draw);}
  function resize(){const r=stage.getBoundingClientRect();if(!r.width)return;width=r.width;height=r.height;centers=width<600?mobileCenters:desktopCenters;points.forEach(n=>{const a=n.index/n.total*Math.PI*2-.9,f=width<600?.62:1;n.p=[centers[n.g][0]+Math.cos(a)*(n.total>6?1.05:1.08)*f,centers[n.g][1]+Math.sin(a)*.72,centers[n.g][2]+(Math.sin(a)*.65+(n.index%2?.3:-.2))*f];});const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);requestDraw();}
  function resetView(){yaw=-.16;pitch=.48;zoom=1;requestDraw();}
  document.getElementById('reset').addEventListener('click',resetView);
  document.getElementById('atlas-zoom-in').addEventListener('click',()=>{zoom=clamp(zoom+.15,.65,1.5);requestDraw();});
  document.getElementById('atlas-zoom-out').addEventListener('click',()=>{zoom=clamp(zoom-.15,.65,1.5);requestDraw();});
  stage.addEventListener('pointerdown',e=>{if(e.target.closest('button')||e.button!==0)return;pointer={id:e.pointerId,x:e.clientX,y:e.clientY};stage.setPointerCapture(e.pointerId);stage.classList.add('dragging');});
  stage.addEventListener('pointermove',e=>{if(!pointer||e.pointerId!==pointer.id)return;const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;yaw+=dx*.006;pitch=clamp(pitch+dy*.004,-.55,1.05);pointer.x=e.clientX;pointer.y=e.clientY;requestDraw();});
  const stop=()=>{pointer=null;stage.classList.remove('dragging');};stage.addEventListener('pointerup',stop);stage.addEventListener('pointercancel',stop);stage.addEventListener('lostpointercapture',stop);
  stage.addEventListener('keydown',e=>{if(e.target!==stage)return;let handled=true;switch(e.key){case'ArrowLeft':yaw-=.12;break;case'ArrowRight':yaw+=.12;break;case'ArrowUp':pitch=clamp(pitch-.1,-.55,1.05);break;case'ArrowDown':pitch=clamp(pitch+.1,-.55,1.05);break;case'+':case'=':zoom=clamp(zoom+.15,.65,1.5);break;case'-':zoom=clamp(zoom-.15,.65,1.5);break;case'Home':resetView();break;default:handled=false;}if(handled){e.preventDefault();requestDraw();}});
  window.addEventListener('portfolio-map-change',()=>{selected=api.getSelection();picker.value=selected||'';document.querySelectorAll('[data-atlas-group]').forEach((b,i)=>b.setAttribute('aria-pressed',String(!!selected&&byId.get(selected).g===i)));requestDraw();});
  window.addEventListener('hashchange',()=>requestAnimationFrame(resize));
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&frame){cancelAnimationFrame(frame);frame=0;}else requestDraw();});
  new ResizeObserver(resize).observe(stage);
  new IntersectionObserver(entries=>{inView=entries[0].isIntersecting;if(!inView&&frame){cancelAnimationFrame(frame);frame=0;}else requestDraw();}).observe(stage);
  new MutationObserver(()=>{themeDirty=true;requestDraw();}).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme','style']});
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{themeDirty=true;requestDraw();});
  reduced.addEventListener('change',requestDraw);
  resize();
})();
