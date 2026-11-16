import {formatEntry, formatGramRate, readField} from './price.mjs';

const storeKey = 'ogj-market-rates-v1';
const intervals = [30, 60, 120, 240];
export function rateEntry(metal, raw) {
  const clean = raw.trim();
  const digits = clean.replaceAll(',', '');
  const valid = /^(?:\d+|\d{1,3},\d{3}|\d,\d{2},\d{3})$/.test(clean)
    && /^[1-9]\d{5}$/.test(digits);
  return valid ? {decimal:String(Number(digits)), error:''} :
    {decimal:'', error:'Enter exactly six digits, from ₹1,00,000 to ₹9,99,999 per 10 g.'};
}

// Keep the caret beside the same digit as Indian grouping changes.
export function groupRateInput(raw, caret) {
  const digits = raw.replaceAll(',', '');
  if (!/^\d{0,6}$/.test(digits)) return null;
  const tail = digits.slice(-3);
  const head = digits.slice(0, -3);
  const value = head ? head.replace(/(\d)(\d{2})$/, '$1,$2') + ',' + tail : tail;
  const count = raw.slice(0, caret).replaceAll(',', '').length;
  let offset = 0, seen = 0;
  while (offset < value.length && seen < count) {
    if (value[offset++] !== ',') seen++;
  }
  return {value, caret:offset};
}

export function perGram(perTenGrams) {
  if (!perTenGrams) return '';
  const whole = BigInt(perTenGrams);
  const tenth = whole % 10n;
  return String(whole / 10n) + (tenth ? '.' + tenth : '');
}
export function storedRates(raw) {
  try {
    const s = JSON.parse(raw);
    if (!s || !intervals.includes(s.minutes) || !Number.isFinite(s.reviewed) ||
        (s.unit !== undefined && s.unit !== 'kg' && s.unit !== '10g')) return null;
    const result = {unit:'10g',reviewed:s.reviewed,minutes:s.minutes};
    for (const k of ['gold','silver']) {
      if (typeof s[k] !== 'string') return null;
      let input = s[k];
      if (s.unit === 'kg') input = '';
      else if (!s.unit) {
        const old = readField('rate',input);
        input = old.value === null || old.value % 10n !== 0n ? '' : String(old.value / 10n);
      }
      result[k] = rateEntry(k,input).decimal;

    }
    return result;
  } catch { return null; }
}
export function dueAt(record) { return record.reviewed + record.minutes * 60000; }

export function setupRates(onChange) {
  const by = id => document.getElementById(id);
  const editor = by('market-rates'), scan = by('scan-rates');
  const metals = ['gold','silver'];
  const field = k => by('market-'+k);
  const native = window.webkit?.messageHandlers?.printer;
  let record = null, timer, proceed = null, scanning = false, saving = false, started = false;
  let startupPending = false, foreground = true;
  function openEditor() {
    clearTimeout(timer);
    for (const k of metals) {
      field(k).value = record ? formatEntry('rate',record[k]) : '';
      field(k).setAttribute('aria-invalid','false');
      by('market-'+k+'-error').textContent = '';
    }
    by('market-interval').value = String(record?.minutes || 120);
    const complete = Boolean(record?.gold && record?.silver);
    by('market-keep').hidden = !complete;
    by('market-note').textContent = complete ? 'Update the rates per 10 g or keep the existing rates.' : record ? 'Enter a six-digit ₹/10 g rate for each empty field.' : 'Enter six digits per 10 g, for example 1,40,000. The calculator uses rupees per gram.';
    editor.showModal();
  }
  function schedule() {
    clearTimeout(timer);
    if (document.hidden || !foreground || editor.open || scan.open || scanning) return;
    if (startupPending) { startupPending = false; openEditor(); return; }
    if (!record) return;
    const remaining = dueAt(record) - Date.now();
    if (remaining > 0) timer = setTimeout(schedule, Math.min(remaining, 2147483647));
    else if (document.body.dataset.nativeScanner === 'active' || document.querySelector('dialog[open]')) timer = setTimeout(schedule, 1000);
    else openEditor();
  }
  function showScan() {
    for (const k of metals) by('scan-rate-'+k).textContent = formatGramRate(readField('gramRate',perGram(record[k])).value)+'/g';
    scan.showModal();
  }
  async function accept(keep) {
    if (saving) return;
    const next = {unit:'10g', minutes:Number(by('market-interval').value), reviewed:Date.now()};
    let first;
    for (const k of metals) {
      const parsed = rateEntry(k,keep ? record[k] : field(k).value);
      by('market-'+k+'-error').textContent = parsed.error;
      field(k).setAttribute('aria-invalid',String(!!parsed.error));
      if (parsed.error) first ??= field(k);
      next[k] = parsed.decimal;
    }
    if (first) { first.focus(); return; }
    saving = true;
    try {
      const data = JSON.stringify(next);
      if (native) await native.postMessage({op:'saveMarketRates',data});
      else localStorage.setItem(storeKey,data);
    } catch {
      by('tag-notice').textContent = 'Rates are active for this session. The device could not save them for next time.';
    } finally { saving = false; }
    record = next;
    onChange();
    editor.close();
    if (proceed) showScan(); else schedule();
  }
  for (const k of metals) {
    const input = field(k);
    function exceeds(insert) {
      const proposed = input.value.slice(0,input.selectionStart) + insert + input.value.slice(input.selectionEnd);
      if (proposed.replace(/\D/g,'').length <= 6) return false;
      by('market-'+k+'-error').textContent = 'Use exactly six digits per 10 g.';
      return true;
    }
    input.addEventListener('beforeinput', e => { if (e.data && exceeds(e.data)) e.preventDefault(); });
    input.addEventListener('paste', e => { if (e.clipboardData && exceeds(e.clipboardData.getData('text'))) e.preventDefault(); });
    input.addEventListener('input', e => {
      if (e.isComposing) return;
      const end = input.selectionStart ?? input.value.length;
      const formatted = groupRateInput(input.value, end);
      if (formatted && input.value !== formatted.value) {
        input.value = formatted.value;
        let pos = formatted.caret;
        if (e.inputType === 'deleteContentForward' && input.value[pos] === ',') pos++;
        input.setSelectionRange(pos,pos);
      }
      by('market-'+k+'-error').textContent = '';
    });
  }
  by('market-form').onsubmit = e => { e.preventDefault(); accept(false); };
  by('market-keep').onclick = () => accept(true);
  editor.oncancel = e => e.preventDefault();
  by('edit-market-rates').onclick = openEditor;
  by('scan-rates-update').onclick = () => { scan.close(); openEditor(); };
  function cancelScan() { proceed = null; scan.close(); schedule(); }
  by('scan-rates-cancel').onclick = cancelScan;
  scan.oncancel = e => {e.preventDefault(); cancelScan();};
  by('scan-rates-continue').onclick = async () => {
    const run = proceed; proceed = null;
    scan.close(); scanning = true;
    try { if (run) await run(); }
    finally { scanning = false; schedule(); }
  };
  document.addEventListener('visibilitychange',schedule);
  window.addEventListener('ogj-foreground', e => { foreground = e.detail === true; schedule(); });
  window.addEventListener('pageshow',schedule);
  window.addEventListener('pagehide',() => clearTimeout(timer));
  return {
    get(metal) { return perGram(record?.[metal]); },
    async start() {
      if (started) return;
      started = true;
      try {
        record = storedRates(native ? await native.postMessage({op:'loadMarketRates'}) : localStorage.getItem(storeKey));
      } catch { record = null; }
      onChange();
      startupPending = true;
      schedule();
    },
    confirmScan(callback) {
      if (scanning || scan.open || editor.open) return;
      proceed = callback;
      if (record?.gold && record?.silver) showScan(); else openEditor();
    }
  };
}
