import {labelDetails} from './label-details.mjs';
const by=id=>document.getElementById(id);
const imageFrom=src=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error('Tag image unavailable.'));image.src=src});
const finite=(n,min,max)=>Number.isFinite(n)&&n>=min&&n<=max;
export function paperGeometry(w,h){
  if(!finite(w,5,200)||!finite(h,5,200)||Math.min(w,h)>58)throw Error('Use 5–200 mm per side with one side at most 58 mm.');
  const rotate=w>58,across=rotate?h:w,margin=Math.max(0,(across-48)/2);
  return {rotate,margin};
}
export function setupTemplate(changed){
  const board=by('design-board'),choice=by('ce'),glyph=by('cg');
  let overrides={},lines=[],boxes=[],images={},layout={},selected='shop',letter=-1,scale=1,pad=0,qrModules=0;
  let presets=new Map(),base='custom',editing='',page=0;
  const code=by('custom-code');
  code.onchange=()=>{page=0;changed()};
  const bridge=window.webkit.messageHandlers.printer;
  const ready=bridge.postMessage({op:'loadTagPresets'}).then(raw=>{
    presets=new Map(JSON.parse(raw||'[]'));options()
  }).catch(()=>{by('cnotice').textContent='Could not load saved presets.'});
  function options(){by('cpick').replaceChildren(...Array.from(presets.keys(),n=>new Option(n,n)))}
  options();
  const current=()=>lines.find(e=>e.id===selected)||lines[0];
  function style(e){return {...e,...overrides[e.id]}}
  function loadFields(){
    const e=current();if(!e)return;
    const line=style(e), single=letter>=0, char=line.chars?.[letter]||{};
    by('cx').value=single?(char.x||0):line.x;by('cy').value=single?(char.y||0):line.y;
    by('cs').value=char.size??line.size;by('cb').checked=char.bold??line.bold??false;by('ci').checked=char.italic??line.italic??false;
    by('ci').disabled=by('cb').disabled=e.type!=='text';glyph.disabled=e.type!=='text';
  }
  function select(id){
    selected=id;letter=-1;choice.value=id;const e=current();
    glyph.replaceChildren(new Option('Whole element','-1'),...Array.from(e?.text||'',(c,i)=>new Option((i+1)+' · '+c,String(i))));
    loadFields();if(layout.w)paintBoard();
  }
  function refresh(){loadFields();changed()}
  function edit(values){
    const e=current();if(!e)return;const prop=overrides[e.id]??={};
    if(letter<0)Object.assign(prop,values);else{const chars=prop.chars??={};Object.assign(chars[letter]??={},values)}
    refresh();
  }
  for(const [id,k] of [['cx','x'],['cy','y'],['cs','size']])by(id).onchange=()=>{
    const n=by(id).valueAsNumber;if(finite(n,k==='size' ? 0.25 : -200,k==='size'?100:200))edit({[k]:n});else loadFields()
  };
  for(const [id,k] of [['ci','italic'],['cb','bold']])by(id).onchange=()=>edit({[k]:by(id).checked});
  for(const b of by('custom-editor').querySelectorAll('[data-move]'))b.onclick=()=>{
    const [x,y]=b.dataset.move.split(',').map(Number),d=Number(by('cstep').value);
    edit({x:Number(by('cx').value)+x*d,y:Number(by('cy').value)+y*d})
  };
  choice.onchange=()=>select(choice.value);glyph.onchange=()=>{letter=Number(glyph.value);loadFields();paintBoard()};
  by('cw').onchange=by('ch').onchange=()=>{changed()};
  by('cstore').onclick=async()=>{await ready;const name=by('cpname').value.trim();try{
    if(!name)throw Error('Enter a preset name.');const w=by('cw').valueAsNumber,h=by('ch').valueAsNumber;paperGeometry(w,h);
    if(presets.has(name)&&name!==editing)throw Error('Choose a new name, or load that saved preset to edit it.');
    const next=new Map(presets);next.set(name,{w,h,base,code:code.value,overrides:JSON.parse(JSON.stringify(overrides))});await bridge.postMessage({op:'saveTagPresets',data:JSON.stringify([...next])});presets=next;editing=name;options();by('cpick').value=name;changed();by('cnotice').textContent='Preset saved.';
  }catch(e){by('cnotice').textContent=e.message}};
  by('cload').onclick=()=>{const n=by('cpick').value,p=presets.get(n);if(!p)return;base=p.base||'legacy';code.value=p.code||(base.endsWith('Bar')?'bar':'qr');editing=n;page=0;by('cw').value=p.w;by('ch').value=p.h;overrides=JSON.parse(JSON.stringify(p.overrides));by('cpname').value=n;letter=-1;glyph.value='-1';changed()};
  let pendingDelete='';
  by('cpick').onchange=()=>{pendingDelete='';by('cdelete').textContent='Delete saved preset'};
  by('cdelete').onclick=async()=>{
    const name=by('cpick').value;if(!presets.has(name))return;
    if(pendingDelete!==name){pendingDelete=name;by('cdelete').textContent='Confirm delete';by('cnotice').textContent='Delete “'+name+'”?';return}
    try{const next=new Map(presets);next.delete(name);await bridge.postMessage({op:'saveTagPresets',data:JSON.stringify([...next])});
      presets=next;options();pendingDelete='';by('cdelete').textContent='Delete saved preset';
      if(editing===name){editing='';by('cpname').value=''}
      by('cnotice').textContent='Preset deleted.';changed();
    }catch(e){by('cnotice').textContent=e.message}
  };
  board.onclick=event=>{const r=board.getBoundingClientRect(),x=((event.clientX-r.left)*board.width/r.width-pad)/scale,y=((event.clientY-r.top)*board.height/r.height-pad)/scale;
    const hit=[...boxes].reverse().find(b=>x>=b.x&&y>=b.y&&x<=b.x+b.w&&y<=b.y+b.h);if(hit)select(hit.id)};
  function draw(ctx,px,editor){
    const {w,h,rotate,margin}=layout;
    ctx.save();ctx.scale(px,px);ctx.fillStyle='white';ctx.fillRect(0,0,w,h);
    if(editor&&margin){ctx.fillStyle='#e5e0e9';if(rotate){ctx.fillRect(0,0,w,margin);ctx.fillRect(0,h-margin,w,margin)}else{ctx.fillRect(0,0,margin,h);ctx.fillRect(w-margin,0,margin,h)}}
    let warning='',blocker='';const hits=[];
    const q=style(lines.find(e=>e.type==='qr'));
    const bar=Boolean(images.striped);
    function box(e,x,y,bw,bh,focused){
      hits.push({id:e.id,x,y,w:bw,h:bh});
      if(x<(rotate?0:margin)-.01||y<(rotate?margin:0)-.01||x+bw>w-(rotate?0:margin)+.01||y+bh>h-(rotate?margin:0)+.01)blocker=e.title+' extends outside the printable area. Move it inside the rulers or increase the tag dimensions.';
      if(e.type!=='qr' && x<q.x+q.size && x+bw>q.x && y<q.y+(bar?4:q.size) && y+bh>q.y)warning=e.title+' overlaps the QR. Move it or resize the code.';
      if(editor&&focused){ctx.strokeStyle='#6941b3';ctx.lineWidth=.15;ctx.strokeRect(x,y,bw,bh)}
    }
    for(const raw of lines){
      const e=style(raw);
      if(e.type==='text'){
        let cursor=e.x;for(const [i,c] of Array.from(e.text).entries()){
          const f={...e,...e.chars?.[i]},x=cursor+(e.chars?.[i]?.x||0),y=e.y+(e.chars?.[i]?.y||0);
          ctx.font=(f.italic?'italic ':'')+(f.bold?'bold ':'')+f.size+'px Arial, sans-serif';ctx.textBaseline='top';ctx.fillStyle='black';
          const m=ctx.measureText(c);ctx.fillText(c,x,y);box(e,x,y,m.width,f.size*1.12,selected===e.id&&(letter===i||letter===-1));cursor+=m.width;
        }
      }else{
        const img=images[e.type],bw=e.size,bh=e.type==='qr'?(bar?4:bw):bw*img.height/img.width;
        const size=e.type==='qr'&&px===8?Math.floor(bw*8/qrModules)*qrModules/8:bw;
        ctx.imageSmoothingEnabled=false;ctx.drawImage(img,Math.round(e.x*px)/px,Math.round(e.y*px)/px,size,e.type==='qr'&&!bar?size:bh);
        box(e,e.x,e.y,bw,bh,selected===e.id);
        if(e.type==='qr'&&Math.floor(bw*8/qrModules)<(bar?2:1))blocker='Increase the code size for thermal printing.';
      }
    }
    ctx.restore();if(editor)boxes=hits;return {warning,blocker};
  }
  function paintBoard(){
    const {w,h}=layout;scale=Math.min(18,1200/Math.max(w,h));pad=32;
    board.width=Math.ceil(w*scale+pad+2);board.height=Math.ceil(h*scale+pad+2);
    const ctx=board.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,board.width,board.height);
    ctx.fillStyle='#362749';ctx.font='11px sans-serif';ctx.fillText('mm',2,14);
    for(let n=0;n<=Math.max(w,h);n++){const pos=pad+n*scale,len=n%5?3:8;
      if(n<=w){ctx.fillRect(pos,pad-len,1,len);if(n%5===0)ctx.fillText(n,pos-3,pad-11)}
      if(n<=h){ctx.fillRect(pad-len,pos,len,1);if(n%5===0)ctx.fillText(n,2,pos+3)}
    }
    ctx.save();ctx.translate(pad,pad);const warn=draw(ctx,scale,true);ctx.restore();return warn;
  }
  let serial=0,logo;
  return {geometry:paperGeometry,pageIndex:()=>page,isBar:()=>code.value==='bar',
    showPage(n){if(layout.groups?.[n]){page=n;lines=layout.groups[page]||layout.groups[0];choice.replaceChildren(...lines.map(e=>new Option(e.title,e.id)));select(lines.some(e=>e.id===selected)?selected:lines[0].id)}},
    async render(symbol,item,px){
    const run=++serial,w=by('cw').valueAsNumber,h=by('ch').valueAsNumber,g=paperGeometry(w,h);
    const url=URL.createObjectURL(symbol.blob);let qr;
    try{logo??=imageFrom('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGUAAABECAYAAACYjPtcAAACS0lEQVR4nO2c23LDIAxEcf//n9OnNr4QDBhJZwnnqdPpWGIXSY5NuiVNXhV/s5lnYcRPdAKG1BiHRNGUFrEljVEzpUdkOWNU+u4IYVXWKlcpT5CpGAVTRoopYQzdFAsR8cZQ+6yHcNS14yvFEmzFEE3xFAtpDM2UCJFwxlD6KkEYiha4SomEsDFSSgxTMGIkSC7RJTv68ckoUUN1iQpuLZ70szJC+6IS1soidoPXLpZtZd4BI9qKXCvzCha9a6WMWTOlHrcZ4+E+ZZdGVysmAMWQPcScDli2L+riSVWXxcoUxOMKY8zWaLETqRVyBjtjZujX+5g968FtopEX81zcXSzpD5ijZgpthki/waTcibTk0RLP6rqjYppcgGxIz/V7YzyNeeBJ+1IwpIfw7tFrCm2GlIjKtTtujymjKiT6VXSJUbl1adVqSni/dWTUxmnWrMWUbzJkj7sxtaYozRAq1Rp6veuO7NGh8yHDbT53lbIq5I2buSVTiIa0CEO+wytq+8kUoiF/UIVu5aPGuQVaGGIlZC5Xz1gjuOR7/gW5QkpsSTf3lE4+WByO9mamjZVS0j/3lWtV8jNH3ZQpUTXl7nZXsVr+266iKbWCkz+nFFEzpUdkFWOmGfRTsjeFvKOetiLy2i4oVMooQckz5pDX2RRa0tQD3iO55JOrFFrSM7O0Xiy6WeXD4nX5YRHOwZRlTCwHD3LvU1ZL8+XypafcLfGqGj+y30JTPDgxC9UHJ5YZMUg9ZvkG1mMWGFmtP82UZUwgnv/MbPGmqPsv0aJpXokCTHAAAAAASUVORK5CYII=');[qr]=await Promise.all([imageFrom(url),logo])}finally{URL.revokeObjectURL(url)}
    if(run!==serial)throw Error('Layout changed.');
    images={qr,logo:await logo,striped:symbol.striped};qrModules=symbol.modules;layout={w,h,...g};
    const detail=labelDetails(item),left=g.rotate?1:g.margin+1,top=g.rotate?g.margin+1:1;
    const row=(id,title,text,x,y,size=1.65)=>({id,title,text,x,y,size,type:'text'});
    lines=[{id:'mark',type:'logo',title:'Hallmark logo',x:left,y:top,size:3.5},
      row('shop','Shop name','Om Ganpati Jewellers',left+4.5,top,1.8),row('city','City','Sunam',left+4.5,top+2.3),
      {id:'qr',type:'qr',title:'QR code',x:Math.max(left,w-(g.rotate?0:g.margin)-17),y:top,size:16},
      ...detail.identity.map((t,i)=>row('field'+i,t.split(':')[0],t,left,top+6+i*2.4)),
      ...detail.materials.flatMap((m,i)=>m.lines.map((t,j)=>row('material'+i+'-'+j,m.label+' · '+(j+1),t,left,top+21+i*4.8+j*2.3)))];
    let groups=[lines];
    if(base!=='legacy'){
      const bar=!!symbol.striped, topEdge=g.rotate?g.margin:0, safeH=h-2*topEdge, short=safeH<20, edge=left, rightEdge=g.rotate?0:g.margin, codeSize=bar?Math.min(44,w-2*edge):Math.min(safeH-1,16);
      const qrLine={id:'qr',type:'qr',title:bar?'Striped barcode':'QR code',x:bar?edge:w-rightEdge-codeSize-.5,y:bar?h-topEdge-4.5:topEdge+.5,size:codeSize};
      const head=[{id:'mark',type:'logo',title:'Hallmark logo',x:edge,y:topEdge+.45,size:2.4},row('shop','Shop name','Om Ganpati Jewellers',edge+3,topEdge+.4,1.5),row('city','City','Sunam',edge+21,topEdge+.4,1.45),qrLine];
      const fieldRows=detail.identity.map((text,i)=>({id:'field'+i,title:text.split(':')[0],text}));
      for(const [i,m] of detail.materials.entries())for(const [j,text] of m.lines.entries())fieldRows.push({id:'material'+i+'-'+j,title:m.label,text});
      const leading=short?1.8:2.1, size=short?1.4:1.55;
      const measure=document.createElement('canvas').getContext('2d');measure.font=size+'px Arial, sans-serif';
      const maxText=bar?w-2*edge:qrLine.x-edge-.5;
      const wrapped=[];
      for(const r of fieldRows){
        let segment='',part=0;
        const emit=()=>{wrapped.push({...r,id:part?r.id+'-part'+part:r.id,text:segment});part++;segment=''};
        for(const c of Array.from(r.text)){if(segment&&measure.measureText(segment+c).width>Math.max(1,maxText))emit();segment+=c}
        if(segment)emit();
      }
      const capacity=Math.max(1,Math.floor(((bar?safeH-4.7:safeH-.25)-3)/leading));
      groups=[];for(let k=0;k<wrapped.length;k+=capacity){
        groups.push([...head,...wrapped.slice(k,k+capacity).map((r,i)=>row(r.id,r.title,r.text,edge,topEdge+3+i*leading,size))]);
      }
    }
    layout.groups=groups;page=Math.min(page,groups.length-1);lines=groups[page];
    choice.replaceChildren(...lines.map(e=>new Option(e.title,e.id)));
    if(!lines.some(e=>e.id===selected))selected='shop';
    choice.value=selected;const chars=Array.from(current().text||'');if(letter>=chars.length)letter=-1;
    glyph.replaceChildren(new Option('Whole element','-1'),...chars.map((c,i)=>new Option((i+1)+' · '+c,String(i))));glyph.value=String(letter);loadFields();
    paintBoard();
    const pages=[];
    try{
      for(const group of groups){
        lines=group;
        const canvas=document.createElement('canvas');canvas.width=Math.round(w*px);canvas.height=Math.round(h*px);
        const {warning,blocker}=draw(canvas.getContext('2d'),px,false);
        const blob=await new Promise(r=>canvas.toBlob(r));if(!blob)throw Error('Could not export the template.');
        pages.push({blob,widthMM:w,heightMM:h,blocker,warning});
        if(run!==serial)throw Error('Layout changed.');
      }
    }finally{if(run===serial)lines=groups[page]||groups[0]}
    return pages;
  }};
}
