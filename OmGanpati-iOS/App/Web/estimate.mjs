const byId = id => document.getElementById(id);
const shop = "Om Ganpati Jewellers · Sunam";

export function quotation(name, itemRows, issued = new Date()) {
  const zone = {timeZone:"Asia/Kolkata"};
  const day = new Intl.DateTimeFormat("en-GB",{...zone,dateStyle:"long"}).format(issued);
  const date = new Intl.DateTimeFormat("en-IN",{...zone,dateStyle:"medium",timeStyle:"short"}).format(issued) + " IST";
  const title = "Estimate Price Quotation";
  const rows = itemRows.filter(([label]) => label !== "HUID").map(([label,amount]) =>
    [label === "Bill with GST" ? "Final Amount (Inclusive GST)" : label, amount]);
  const disclaimer = ["This quotation is valid only on " + day + ".", "It is not a sales receipt or a GST tax invoice."];
  const text = [shop,title,date,name,"",...rows.map(([label,value]) => label + ": " + value),"",...disclaimer].join("\n");
  return {title,name,date,day,rows,disclaimer,text};
}

export function setupEstimate() {
  const dialog = byId("estimate-dialog"), slip = byId("estimate-slip"), feedback = byId("estimate-feedback");
  const print = byId("estimate-print"), download = byId("estimate-download");
  const whatsapp = byId("estimate-whatsapp"), email = byId("estimate-email");
  const sms = byId("estimate-sms");
  const actions = [print, download, whatsapp, email];
  let token, filename, text, revision = 0;
  function clear() {
    revision++;
    token = filename = text = "";
    for (const button of [...actions,sms]) button.disabled = true;
    slip.replaceChildren();
  }
  async function perform(action) {
    const run = revision;
    try {
      const payload = action === "sms" ? {text} : {token,filename};
      const result = await window.webkit.messageHandlers.printer.postMessage({op:"estimate",action,...payload});
      if (revision === run) feedback.textContent = result || "";
    } catch (error) {
      if (revision === run) feedback.textContent = error.message || "Unable to open this action.";
    }
  }
  for (const [button,action] of [[print,"print"],[download,"save"],[whatsapp,"whatsapp"],[email,"email"],[sms,"sms"]]) {
    button.addEventListener("click",() => perform(action));
  }
  dialog.addEventListener("close", () => { if (!dialog.open) clear(); });

  return async ({name,rows}) => {
    clear();
    const run = revision;
    const quote = quotation(name,rows);
    text = quote.text;
    sms.disabled = false;
    feedback.textContent = "Preparing your PDF…";
    dialog.showModal();
    try {
      filename = "Om-Ganpati-Quotation-"+quote.day.replaceAll(" ","-")+".pdf";
      const prepared = await window.webkit.messageHandlers.printer.postMessage({op:"prepareEstimate",quote});
      if (run !== revision || !dialog.open) return;
      token = prepared;
      const heading=document.createElement("h3"), details=document.createElement("p");
      heading.textContent=shop;
      details.style.whiteSpace="pre-wrap";
      details.textContent=text.slice(shop.length+1);
      slip.replaceChildren(heading,details);
      for (const button of actions) button.disabled = false;
      feedback.textContent = "Choose WhatsApp in the share sheet to send the PDF.";
    } catch (error) {
      if (run === revision) feedback.textContent = "PDF preparation failed. " + (error.message || String(error));
    }
  };
}
