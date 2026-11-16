import {linkedCode} from './stripe-id.mjs';
import {setupTemplate} from './template-editor.mjs';
import {encodeItem} from './payload.mjs';
import {makingLabel,money,readField} from '../price.mjs';
import {purityLabel} from '../metals.mjs';
import {writeSymbol} from './write-symbol.mjs';
import {labelDetails} from './label-details.mjs';
import {setupPrinter} from '../printing/panel.mjs';
import {rasterizeLabel} from '../printing/label-command.mjs';

const byId=id=>document.getElementById(id);
function dataURL(blob){
  return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Could not read the label image.'));reader.readAsDataURL(blob)});
}
export function setupMaker(getItem,reportError) {
  const dialog=byId('make-dialog'),preview=byId('tag-preview'),paper=byId('tag-print-sheet');
  const save=byId('save-tag'),print=byId('browser-print-tag'),feedback=byId('make-feedback');
  const pageSelect=byId('tag-page'),pageControl=byId('tag-page-control');
  const pageStyle=document.createElement('style');document.head.append(pageStyle);
  let item,revision=0,imageURLs=[],pages=[],busy=false;
  const template=setupTemplate(render);
  const printer=setupPrinter(async reverse=>{
    const current=pages;
    if(!current.length)throw Error('Wait for the tag preview.');
    return Promise.all(current.map(page=>rasterizeLabel(page.blob,{format:'custom',reverse})));
  },working=>{
    busy=working;byId('custom-editor').disabled=working;
    byId('stripe-companion').disabled=working;
    print.disabled=working || !pages.length;
  });
  printer.setLayout('custom');
  function releaseImages(){
    pages=[];imageURLs.forEach(url=>URL.revokeObjectURL(url));imageURLs=[];
    paper.replaceChildren();pageControl.hidden=true;
  }
  function selectPage(){
    const index=Number(pageSelect.value)||0;
    preview.src=imageURLs[index];template.showPage(index);
    preview.alt='Custom jewellery tag '+(index+1)+' of '+imageURLs.length;
    save.href=imageURLs[index];
    save.download='OmGanpati-'+purityLabel(item.carat)+'-'+item.weight+'g-'+byId('cw').value+'x'+byId('ch').value+'mm-'+(index+1)+'.png';
  }
  pageSelect.addEventListener('change',selectPage);
  async function render(){
    if(!dialog.open)return;
    const run=++revision,bar=template.isBar();
    byId('stripe-companion-option').hidden=!bar;
    releaseImages();print.disabled=true;printer.setReady(false,'Preparing the template…');pageStyle.textContent='';
    document.body.classList.remove('printing-tag');preview.hidden=true;
    save.removeAttribute('href');save.setAttribute('aria-disabled','true');
    feedback.dataset.error='false';feedback.textContent='Preparing your tag…';
    try {
      const text=encodeItem(item);
      byId('label-data').textContent=text;
      byId('tag-item').textContent=item.name+' · '+purityLabel(item.carat);
      byId('tag-weights').textContent=(item.gross!==undefined?'Gross '+item.gross+' g · Less '+item.stoneWeight+' g · ':'')+'Net '+item.weight+' g';
      byId('tag-charges').textContent='Making '+makingLabel(item)+' · Embellishments '+money(readField('stone',item.stone).value)+' · GST '+item.gst+'%';
      byId('tag-embellishments').textContent='';
      if(item.gross===undefined)throw Error('Enter gross and embellishment weights in the calculator to create a tag.');
      byId('tag-embellishments').textContent=labelDetails(item).materials.map(m=>m.lines.join(' · ')).join('\n');
      const symbol=bar?{...await writeSymbol(linkedCode(text),'stripe-label'),striped:true}:await writeSymbol(text,'qr');
      if(run!==revision)return;
      // Render once at the printer's native 8 dots/mm. Both print routes
      // consume these exact pages, including edits which have not been saved.
      const labels=await template.render(symbol,item,8);
      if(run!==revision)return;
      if(bar && byId('stripe-companion').checked){
        const full=await writeSymbol(text,'qr');
        const {widthMM:w,heightMM:h}=labels[0];
        const {rotate,margin}=template.geometry(w,h);
        const safeW=rotate?w:w-2*margin,safeH=rotate?h-2*margin:h;
        const dots=Math.floor((Math.min(safeW,safeH)-1)*8/full.modules);
        if(dots<1)throw Error('Increase the template size to fit the companion QR.');
        const canvas=document.createElement('canvas');canvas.width=Math.round(w*8);canvas.height=Math.round(h*8);
        const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);
        const img=new Image();img.src=await dataURL(full.blob);await img.decode();ctx.imageSmoothingEnabled=false;
        const n=dots*full.modules;ctx.drawImage(img,Math.round((canvas.width-n)/2),Math.round((canvas.height-n)/2),n,n);
        const blob=await new Promise(r=>canvas.toBlob(r));if(!blob)throw Error('Could not export companion QR.');
        labels.push({blob,widthMM:w,heightMM:h});
      }
      if(run!==revision)return;
      pageStyle.textContent='@page { size: '+labels[0].widthMM+'mm '+labels[0].heightMM+'mm; margin:0 }';
      imageURLs=labels.map(label=>URL.createObjectURL(label.blob));
      pageSelect.replaceChildren(...labels.map((_,i)=>new Option('Label '+(i+1)+' of '+labels.length,String(i))));
      pageControl.hidden=labels.length===1;pageSelect.value=String(Math.min(template.pageIndex(),labels.length-1));selectPage();
      const sheets=labels.map((label,i)=>{
        const image=new Image();image.src=imageURLs[i];image.className='print-tag-page';
        image.style.setProperty('--symbol-width',label.widthMM+'mm');return image;
      });
      paper.replaceChildren(...sheets);await Promise.all([preview.decode(),...sheets.map(image=>image.decode())]);
      if(run!==revision)return;
      pages=labels;preview.hidden=false;save.removeAttribute('aria-disabled');print.disabled=busy;
      const blocked=labels.find(l=>l.blocker);
      printer.setReady(!blocked,blocked?.blocker);
      byId('print-tag').textContent=labels.length>1?'Print '+labels.length+'-label set':'Print tag';
      document.body.classList.add('printing-tag');
      feedback.textContent=blocked?.blocker||labels.find(l=>l.warning)?.warning||labels.length+' label(s) per set.';
    }catch(error){
      if(run!==revision)return;
      feedback.dataset.error='true';feedback.textContent=error.message||'Could not prepare the tag.';
      printer.setReady(false,feedback.textContent);
    }
  }
  byId('open-maker').addEventListener('click',()=>{
    try{item=getItem()}catch(error){reportError(error);return}
    dialog.showModal();printer.open();render();
  });
  byId('stripe-companion').addEventListener('change',render);
  print.addEventListener('click',async()=>{
    if(print.disabled)return;
    const bridge=window.webkit?.messageHandlers?.printer;
    if(!bridge){window.print();return}
    const labels=pages;print.disabled=true;
    try{
      const images=await Promise.all(labels.map(l=>dataURL(l.blob)));
      await bridge.postMessage({op:'printCustomTag',width:labels[0].widthMM,height:labels[0].heightMM,images});
    }catch(e){feedback.dataset.error='true';feedback.textContent=e.message||String(e)}
    finally{print.disabled=busy||!pages.length}
  });
  dialog.addEventListener('close',()=>{
    if(dialog.open)return;
    revision++;releaseImages();printer.close();printer.setReady(false);pageStyle.textContent='';
    document.body.classList.remove('printing-tag');
  });
}
