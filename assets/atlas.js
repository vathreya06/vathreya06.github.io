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
  const degrees=new Map(api.nodes.map(n=>[n.id,api.edges.filter(e=>e.a===n.id||e.b===n.id).length]));
  const search=document.getElementById('atlas-search');
  const localButton=document.getElementById('atlas-local');
  const featured = new Set(['logic','micro','pcb','safety','rc','esp','bci','alu','stone','trimas']);
  const shortLabels = {'circuits':'Circuits & Systems','lab':'Circuits Lab','logic':'Digital Logic','analysis':'EE Analysis','business':'Business Minor','electronic':'Electronic Circuits','electronicslab':'Electronics Lab','fields':'Fields & Waves','ethics':'Ethics','micro':'Microprocessors','cprogram':'Programming in C','requirements':'Requirements & Changes','software':'Application Development'};
  const points = [];
  const byId = new Map();
  const buttons = new Map();
  let width=0, height=0, yaw=-.12, pitch=.12, zoom=1;
  let selected=api.getSelection(), frame=0, pointer=null, inView=true, hoverId=null, query='', local=false;
  let palette, themeDirty=true;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
  const rgba=(hex,a)=>{const h=hex.trim().replace('#','');const full=h.length===3?h.split('').map(x=>x+x).join(''):h;return `rgba(${parseInt(full.slice(0,2),16)},${parseInt(full.slice(2,4),16)},${parseInt(full.slice(4,6),16)},${a})`;};

  groupNames.forEach((group,g)=>{
    const list=api.nodes.filter(n=>n.group===group);
    const optionGroup=document.createElement('optgroup');optionGroup.label=group;picker.append(optionGroup);
    list.forEach((node,i)=>{
      const angle=g*Math.PI/2+i/list.length*.9-2.6;
      const p=[Math.cos(angle)*(2.4+i*.07),Math.sin(angle)*(2.4+i*.07),Math.sin((i+1)*(g+2))*1.1];
      const entry={...node,p,g,index:i,total:list.length};points.push(entry);byId.set(node.id,entry);
      const b=document.createElement('button');b.type='button';b.className='atlas-node';b.dataset.atlasNode=node.id;b.setAttribute('aria-label',`${node.label}, ${group}. Show connections.`);b.setAttribute('aria-pressed','false');
      const text=document.createElement('span');text.className='atlas-node-label';text.textContent=shortLabels[node.id]||node.label;b.append(text);labels.append(b);buttons.set(node.id,b);
      const select=()=>api.select(api.getPinned()===node.id?null:node.id);
      b.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();e.stopPropagation();select();});
      b.addEventListener('click',e=>{if(e.detail===0)select();});
      b.addEventListener('focus',()=>{api.preview(node.id);requestDraw();});
      b.addEventListener('blur',()=>api.preview(null));
      b.addEventListener('pointerenter',()=>{if(!pointer){hoverId=node.id;requestDraw();}});
      b.addEventListener('pointerleave',()=>{hoverId=null;requestDraw();});
      const opt=document.createElement('option');opt.value=node.id;opt.textContent=node.label;optionGroup.append(opt);
    });
  });
  // Settle a small, deterministic force layout once. Links pull related work
  // together; repulsion leaves room to explore the graph without perpetual motion.
  const velocity=points.map(()=>[0,0,0]);
  for(let step=0;step<280;step++){
    const forces=points.map(n=>n.p.map(x=>-x*.012));
    for(let a=0;a<points.length;a++)for(let b=a+1;b<points.length;b++){
      const delta=points[a].p.map((v,k)=>v-points[b].p[k]);const d2=delta.reduce((v,x)=>v+x*x,0)+.18;
      for(let k=0;k<3;k++){const f=delta[k]*.42/d2;forces[a][k]+=f;forces[b][k]-=f;}
    }
    for(const e of api.edges){const a=points.indexOf(byId.get(e.a)),b=points.indexOf(byId.get(e.b));const delta=points[b].p.map((v,k)=>v-points[a].p[k]);const d=Math.hypot(...delta)||1;for(let k=0;k<3;k++){const f=delta[k]/d*(d-1.6)*.075;forces[a][k]+=f;forces[b][k]-=f;}}
    points.forEach((n,i)=>n.p.forEach((v,k)=>{velocity[i][k]=(velocity[i][k]+forces[i][k]*.16)*.8;n.p[k]+=clamp(velocity[i][k],-.15,.15);}));
  }
  const mean=[0,1,2].map(k=>points.reduce((s,n)=>s+n.p[k],0)/points.length);
  points.forEach(n=>n.p=n.p.map((v,k)=>v-mean[k]));
  const extent=Math.max(...points.flatMap(n=>n.p.map(Math.abs)));
  points.forEach(n=>n.p=n.p.map((v,k)=>v/extent*(k===2?1.7:3.7)));
  if(search)search.addEventListener('input',()=>{query=search.value.trim().toLowerCase();if(query)api.select(null);requestDraw();});
  if(localButton){localButton.disabled=!selected;localButton.addEventListener('click',()=>{local=!local;localButton.setAttribute('aria-pressed',String(local));requestDraw();});}
  document.getElementById('atlas-count').textContent=`${points.length} nodes · ${api.edges.length} connections`;
  picker.addEventListener('change',()=>api.select(picker.value||null));
  const startingPoints=['logic','pcb','rc','stone'];
  document.querySelectorAll('[data-atlas-group]').forEach((b,i)=>b.addEventListener('click',()=>api.select(startingPoints[i])));

  function readPalette(){
    const s=getComputedStyle(stage);
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
    const scale=Math.min(width/9.3,height/8.5)*zoom;
    return {x:width*.5+x*scale*perspective,y:height*.51-y*scale*perspective,z:depth,k:perspective};
  }
  function line3(list,color,lineWidth=1,close=false,fill=null){
    ctx.beginPath();list.forEach((p,i)=>{const q=project(p);i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y);});if(close)ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill();}ctx.strokeStyle=color;ctx.lineWidth=lineWidth;ctx.stroke();
  }
  function curvePoint(a,b,t){
    return mix(a,b,t);
  }
  function draw(now){
    frame=0;if(document.getElementById('home').hidden||!inView)return;
    if(themeDirty)readPalette();
    ctx.clearRect(0,0,width,height);
    const focus=selected||hoverId;
    const neighbors=id=>new Set(id?[id,...api.edges.filter(e=>e.a===id||e.b===id).flatMap(e=>[e.a,e.b])]:[]);
    const active=neighbors(focus),labelActive=neighbors(selected);
    const matches=new Set(points.filter(n=>!query||(n.label+' '+n.desc).toLowerCase().includes(query)).map(n=>n.id));
    const visible=n=>(!local||!selected||labelActive.has(n.id));
    document.getElementById('atlas-count').textContent=query?`${matches.size} ${matches.size===1?'match':'matches'} · ${points.length} nodes`:local&&selected?`${labelActive.size} connected nodes · local graph`:`${points.length} nodes · ${api.edges.length} connections`;
    api.edges.forEach(e=>{
      const a=byId.get(e.a),b=byId.get(e.b),lit=focus&&(e.a===focus||e.b===focus);
      if(!visible(a)||!visible(b))return;
      const route=[];for(let i=0;i<=22;i++)route.push(curvePoint(a.p,b.p,i/22));
      line3(route,rgba(lit?palette.colors[byId.get(focus).g]:palette.muted,lit?.7:focus?.06:query?.09:.24),lit?1.1:.65);
    });
    const projected=points.map(n=>({...n,q:project(n.p)}));
    projected.sort((a,b)=>b.q.z-a.q.z).forEach(n=>{
      if(!visible(n))return;
      const lit=(!focus||active.has(n.id))&&matches.has(n.id),r=(3.7+Math.sqrt(degrees.get(n.id))*1.5+(n.id===selected?1:0))*n.q.k;
      ctx.globalAlpha=lit?1:.14;
      ctx.fillStyle=palette.colors[n.g];ctx.beginPath();ctx.arc(n.q.x,n.q.y,r,0,Math.PI*2);ctx.fill();
      if(n.id===selected){ctx.beginPath();ctx.arc(n.q.x,n.q.y,r+5,0,Math.PI*2);ctx.strokeStyle=rgba(palette.colors[n.g],.4);ctx.lineWidth=1;ctx.stroke();}
      ctx.globalAlpha=1;
    });
    // Prefer related labels, then featured work; remaining points stay focusable.
    const order=[...projected].sort((a,b)=>(b.id===selected?100:labelActive.has(b.id)?50:featured.has(b.id)?10:0)-(a.id===selected?100:labelActive.has(a.id)?50:featured.has(a.id)?10:0));
    const occupied=[];
    for(const n of order){
      const b=buttons.get(n.id);const eligible=visible(n)&&(n.id===selected||labelActive.has(n.id)||(!selected&&(query?matches.has(n.id):featured.has(n.id))));
      const label=shortLabels[n.id]||n.label;
      const labelWidth=Math.min(width<500?155:190,label.length*(width<500?4.4:5.2)+28);
      let pos={x:n.q.x-14,y:n.q.y-14},hasLabel=false;
      if(eligible){
        const candidates=[{x:n.q.x+7,y:n.q.y-14},{x:n.q.x-labelWidth-7,y:n.q.y-14},{x:n.q.x-labelWidth*.5,y:n.q.y-35},{x:n.q.x-labelWidth*.5,y:n.q.y+9}];
        for(const c of candidates){const box={x:c.x,y:c.y,w:labelWidth,h:28};if(c.x<7||c.x+box.w>width-7||c.y<52||c.y+28>height-47)continue;if(occupied.some(r=>box.x<r.x+r.w+5&&box.x+box.w+5>r.x&&box.y<r.y+r.h+5&&box.y+box.h+5>r.y))continue;pos=c;occupied.push(box);hasLabel=true;break;}
      }
      // Focused points are always labelled, including in dense camera angles.
      if(document.activeElement===b&&!hasLabel){hasLabel=true;pos={x:clamp(n.q.x+7,7,width-labelWidth-7),y:clamp(n.q.y-14,52,height-75)};}
      b.classList.toggle('has-label',hasLabel);b.classList.toggle('is-selected',n.id===selected);b.classList.toggle('is-dim',(!!focus&&!active.has(n.id))||!matches.has(n.id));
      b.setAttribute('aria-pressed',String(n.id===api.getPinned()));b.style.transform=`translate(${pos.x}px,${pos.y}px)`;b.style.zIndex=String(n.id===selected?90:hasLabel?40:50);
      b.style.width=hasLabel?labelWidth+'px':'28px';
      b.style.visibility=!visible(n)||n.q.x<0||n.q.x>width||n.q.y<0||n.q.y>height?'hidden':'visible';
    }
  }
  function requestDraw(){if(!frame)frame=requestAnimationFrame(draw);}
  function resize(){const r=stage.getBoundingClientRect();if(!r.width)return;width=r.width;height=r.height;const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);requestDraw();}
  function resetView(){yaw=-.12;pitch=.12;zoom=1;query='';local=false;if(search)search.value='';if(localButton)localButton.setAttribute('aria-pressed','false');requestDraw();}
  document.getElementById('reset').addEventListener('click',resetView);
  document.getElementById('atlas-zoom-in').addEventListener('click',()=>{zoom=clamp(zoom+.15,.65,1.5);requestDraw();});
  document.getElementById('atlas-zoom-out').addEventListener('click',()=>{zoom=clamp(zoom-.15,.65,1.5);requestDraw();});
  stage.addEventListener('pointerdown',e=>{if(e.target.closest('button')||e.button!==0)return;pointer={id:e.pointerId,x:e.clientX,y:e.clientY};stage.setPointerCapture(e.pointerId);stage.classList.add('dragging');});
  stage.addEventListener('pointermove',e=>{if(!pointer||e.pointerId!==pointer.id)return;const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;yaw+=dx*.006;pitch=clamp(pitch+dy*.004,-.55,1.05);pointer.x=e.clientX;pointer.y=e.clientY;requestDraw();});
  const stop=()=>{pointer=null;stage.classList.remove('dragging');};stage.addEventListener('pointerup',stop);stage.addEventListener('pointercancel',stop);stage.addEventListener('lostpointercapture',stop);
  stage.addEventListener('keydown',e=>{if(e.target!==stage)return;let handled=true;switch(e.key){case'ArrowLeft':yaw-=.12;break;case'ArrowRight':yaw+=.12;break;case'ArrowUp':pitch=clamp(pitch-.1,-.55,1.05);break;case'ArrowDown':pitch=clamp(pitch+.1,-.55,1.05);break;case'+':case'=':zoom=clamp(zoom+.15,.65,1.5);break;case'-':zoom=clamp(zoom-.15,.65,1.5);break;case'Home':resetView();break;default:handled=false;}if(handled){e.preventDefault();requestDraw();}});
  window.addEventListener('portfolio-map-change',()=>{selected=api.getSelection();picker.value=selected||'';if(localButton){localButton.disabled=!selected;if(!selected){local=false;localButton.setAttribute('aria-pressed','false');}}document.querySelectorAll('[data-atlas-group]').forEach((b,i)=>b.setAttribute('aria-pressed',String(!!selected&&byId.get(selected).g===i)));requestDraw();});
  window.addEventListener('hashchange',()=>requestAnimationFrame(resize));
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&frame){cancelAnimationFrame(frame);frame=0;}else requestDraw();});
  new ResizeObserver(resize).observe(stage);
  new IntersectionObserver(entries=>{inView=entries[0].isIntersecting;if(!inView&&frame){cancelAnimationFrame(frame);frame=0;}else requestDraw();}).observe(stage);
  new MutationObserver(()=>{themeDirty=true;requestDraw();}).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme','style']});
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{themeDirty=true;requestDraw();});
  reduced.addEventListener('change',requestDraw);
  resize();
})();
