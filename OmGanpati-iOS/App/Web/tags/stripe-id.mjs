// Short numeric identifiers allow Code 128 set C to print at two dots per bar.
const prefix='ogj-striped-tag:';
export function linkedCode(payload,storage=localStorage) {
  const existing=storage.getItem(prefix+payload);
  if(existing && storage.getItem(prefix+existing)===payload)return existing;
  for(let i=0;i<20;i++){
    const random=crypto.getRandomValues(new Uint32Array(2));
    const id='93'+Array.from(random,n=>String(n%1000000).padStart(6,'0')).join('');
    if(storage.getItem(prefix+id)!==null)continue;
    storage.setItem(prefix+id,payload);
    storage.setItem(prefix+payload,id);
    return id;
  }
  throw Error('Could not assign a barcode. Try again.');
}
export function resolveStripe(raw){
  const id=String(raw).trim().replace(/^\]C\d/,'');
  if(!/^93\d{12}$/.test(id))return raw;
  const payload=localStorage.getItem(prefix+id);
  if(!payload)throw Error('This striped tag belongs to another device. Scan the full-data QR if a companion label was printed.');
  return payload;
}
