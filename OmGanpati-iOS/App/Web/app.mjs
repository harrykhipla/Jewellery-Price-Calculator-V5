import {setupRates} from './rates.mjs';
import {silverGrade, silverGrades, isSilver, metalName, purityLabel, gradeOption, gradeRate} from './metals.mjs';
import {resolveStripe} from './tags/stripe-id.mjs';
import { makingLabel, formatGramRate, readField, formatEntry, calculate, money, quantity, netGoldWeight, weightDecimal, stoneCharge, amountDecimal } from "./price.mjs";
import { decodeItem, itemFields, legacyFields, itemFromFields } from "./tags/payload.mjs";
import { labelDetails } from "./tags/label-details.mjs";
import { setupEstimate } from "./estimate.mjs";
import { readHuid } from "./huid/identity.mjs";
import { setupScanner } from "./tags/scanner.mjs";
import { setupMaker } from "./tags/maker.mjs";
import { setupIdentity } from "./huid/fields.mjs";

import { setupEmbellishments } from "./embellishments/editor.mjs";
import { validatedRows } from "./embellishments/model.mjs";

const byId = id => document.getElementById(id);
const form = byId("price-form");
const inputs = [...form.querySelectorAll("input[name]")];
const outputs = [...document.querySelectorAll("[data-amount]")];
const touched = new Set();
const toggle = byId("details-toggle");
const breakdown = byId("breakdown");
const status = byId("status");
const carat = byId("carat");
const customFine = byId("custom-fine");
const selectedGrade = () => carat.value === "custom" ? silverGrade(customFine.value) : carat.value;
const shopRate = byId("shop-rate");
const silverBasis = byId("silver-basis");
const makingBasis = byId("making-basis");
const stoneBasis = byId("stone-basis");
const overrides = new Map();
const goldGrades = [...carat.options].map(option => option.value);
const supportedCarats = new Set([...goldGrades, ...silverGrades]);
const metal = byId("metal");
const drafts = new Map();
let currentMetal = "gold";
const tagNotice = byId("tag-notice");
let announcement;
let scannedNetOnly = null;
const identity = setupIdentity();
const embellishments = setupEmbellishments(() => { scannedNetOnly = null; refresh(); });

const rates = setupRates(() => refresh(false));
byId("rate").readOnly = true;

function changeMetal(next, save = true) {
  if (save) drafts.set(currentMetal, {
    grade: carat.value, fine: customFine.value, gross: byId("gross").value,
    silverBasis:silverBasis.value, makingBasis: makingBasis.value, making: byId("making").value, gst: byId("gst").value, net: scannedNetOnly,
    name: byId("item-name").value, huid: byId("huid").value, embellishments: embellishments.rows()
  });
  currentMetal = next;
  metal.value = next;
  const silver = next === "silver";
  const name = silver ? "Silver" : "Gold";
  const draft = drafts.get(next) || {grade:silver?"Ag925":"24", gross:"", making:"", gst:"", embellishments:[]};
  carat.replaceChildren(...(silver ? silverGrades : goldGrades).map(grade => new Option(gradeOption(grade), grade)));
  if (silver) carat.add(new Option("Custom purity", "custom"));
  makingBasis.value = silver ? draft.makingBasis || "gram" : "percent";
  silverBasis.value = draft.silverBasis || "fine";
  byId("silver-basis-field").hidden = !silver;
  carat.value = draft.grade;
  customFine.value = draft.fine || "";
  for (const key of ["gross","making","gst"]) byId(key).value = draft[key];
  identity.load(draft);
  embellishments.load(draft);
  scannedNetOnly = draft.net ?? null;
  shopRate.value = overrides.get(selectedGrade()) || "";
  document.querySelectorAll("[data-metal]").forEach(node => node.textContent = name);
  document.querySelectorAll("[data-metal-lower]").forEach(node => node.textContent = next);
  document.querySelector('label[for="rate"]').textContent = silver ? "999 silver base rate" : "24K base rate";
  byId("rate-hint").textContent = "Use Update Rate to change the base rate per gram before GST.";
  touched.clear();
}
metal.addEventListener("change", () => { changeMetal(metal.value); refresh(); });
function applyCarat(base, errors) {
  const custom = carat.value === "custom";
  const grade = selectedGrade();
  byId("custom-fine-field").hidden = !custom;
  customFine.disabled = !custom;
  customFine.setAttribute("aria-invalid", String(custom && !grade && !!customFine.value));
  const fineMessage = "Enter fineness from 0.1 to 1000, using up to one decimal place.";
  if (custom) {
    byId("fine-hint").textContent = grade ? Number((Number(grade.slice(2))/10).toFixed(2)) + "% pure silver" : fineMessage;
    if (!grade) errors.push(fineMessage);
  }
  const direct = currentMetal === "silver" && silverBasis.value === "fine";
  const derived = grade ? gradeRate(base, grade, silverBasis.value) : null;
  for (const option of carat.options) {
    const id = option.value;
    if (id === "custom") continue;
    if (direct) { option.textContent = gradeOption(id); continue; }
    const quote = overrides.has(id) ? readField("gramRate", overrides.get(id)).value : gradeRate(base, id);
    option.textContent = gradeOption(id) + (quote === null ? "" : " · " + formatGramRate(quote) + "/g");
  }
  if (direct) shopRate.value = "";
  const baseGrade = direct || grade === "24" || grade === "Ag999";
  byId("applied-label").textContent = direct ? "Applied 999 fine rate per gram" : (grade ? purityLabel(grade) : "Custom silver") + " rate per gram";
  shopRate.readOnly = baseGrade || !grade;
  shopRate.placeholder = derived === null ? "—" : formatGramRate(derived).slice(1);
  const manual = shopRate.value.trim() !== "" && !baseGrade;
  const parsed = manual ? readField("gramRate", shopRate.value) : {value:derived, error:""};
  byId("shop-error").textContent = parsed.error;
  shopRate.setAttribute("aria-invalid", String(Boolean(parsed.error)));
  shopRate.closest(".field").classList.toggle("invalid", Boolean(parsed.error));
  if (parsed.error) errors.push(parsed.error);
  const basis = !grade ? "the custom fineness" : isSilver(grade) ? grade.slice(2) + "/999 of the silver base rate" : grade === "22" ? "92% of 24K" : grade + "/24 of 24K";
  const purityHint = grade === "Ag925" ? "92.5% silver and 7.5% other metals, commonly copper. " :
    grade === "Ag999" ? "99.9% silver, commonly used for coins, bars and bullion. " : "";
  byId("shop-hint").textContent = purityHint + (direct ? "Net silver weight × 999 fine rate." : baseGrade ? "Uses the base rate." :
    manual ? "Shop rate · Clear to use " + basis + "." : basis + " · Edit for your shop rate.");
  return parsed.value;
}

silverBasis.addEventListener("change", () => {
  shopRate.value = overrides.get(selectedGrade()) || "";
  refresh();
});
customFine.addEventListener("input", () => {
  shopRate.value = overrides.get(selectedGrade()) || "";
  refresh();
});
carat.addEventListener("change", () => {
  shopRate.value = overrides.get(selectedGrade()) || "";
  refresh();
});
shopRate.addEventListener("input", () => {
  if (shopRate.value.trim()) overrides.set(selectedGrade(), shopRate.value);
  else overrides.delete(selectedGrade());
  refresh();
});
stoneBasis.addEventListener("change", () => {
  touched.delete("stoneRate");
  refresh();
});

function showFieldError(input, error) {
  byId(input.name + "-error").textContent = error;
  input.setAttribute("aria-invalid", String(Boolean(error)));
  input.closest(".field").classList.toggle("invalid", Boolean(error));
}

makingBasis.addEventListener("change", () => refresh());
function refresh(announce = true) {
  byId("rate").value = formatEntry("gramRate", rates.get(currentMetal));
  const perGram = currentMetal === "silver" && makingBasis.value === "gram";
  byId("making-basis-field").hidden = currentMetal !== "silver";
  byId("making-suffix").textContent = perGram ? "₹ / g" : "%";
  byId("making-unit").textContent = perGram ? "Rupees per net silver gram." : "Percentage of the metal value.";
  const emb = embellishments.read();
  stoneBasis.value = "total";
  const hasWeight = !!byId("gross").value.trim() || emb.items.length > 0 || scannedNetOnly !== null;
  byId("stoneWeight").value = !hasWeight || emb.weight === null ? "" : weightDecimal(emb.weight);
  byId("stone").value = !hasWeight || emb.amount === null ? "" : amountDecimal(emb.amount);
  const rateBasedStones = stoneBasis.value !== "total";
  byId("stone-manual-field").hidden = rateBasedStones;
  byId("stone").disabled = rateBasedStones;
  byId("stone-rate-field").hidden = !rateBasedStones;
  byId("stoneRate").disabled = !rateBasedStones;
  byId("stoneRate").required = rateBasedStones;
  byId("stone-result").hidden = !rateBasedStones;
  const stoneUnit = stoneBasis.value === "carat" ? "ct" : "g";
  byId("stone-rate-unit").textContent = "₹ / " + stoneUnit;
  byId("stoneRate-unit").textContent = "Rupees per " + (stoneBasis.value === "carat" ? "carat." : "gram.");
  const values = {};
  const errors = [];
  for (const input of inputs) {
    if (input.disabled) {
      showFieldError(input, "");
      continue;
    }
    const key = input.name === "rate" ? "gramRate" : input.name;
    const result = readField(key, input.value);
    values[key] = result.value;
    let error = result.error;
    if (result.value === null && !error && touched.has(input.name) && input.required) {
      if (input.name === "rate") error = "Enter the metal rate.";
      else if (input.name === "stoneRate") error = "Enter the diamond/stone rate.";
      else if (scannedNetOnly === null) error = "Enter the gross weight.";
    }
    showFieldError(input, error);
    if (error) errors.push(error);
  }

  values.stoneWeight = emb.weight;
  values.stone = emb.amount;
  errors.push(...emb.errors.map(e => `Embellishment ${e.index + 1}: ${e.message}`));
  const net = netGoldWeight(values.gross, values.stoneWeight);
  if (net.error) net.error = net.error.replace("Stone weight", "Total embellishment weight");
  if (net.error) {
    showFieldError(byId("stoneWeight"), net.error);
    errors.push(net.error);
  }
  values.weight = scannedNetOnly?.value ?? net.value;
  byId("weight").value = values.weight === null ? "" : weightDecimal(values.weight);
  byId("weight-hint").textContent = scannedNetOnly === null
    ? "Gross weight − total embellishment weight" : "Net weight from an older tag. Enter the measured weights for a new label.";
  let stoneFormula = emb.errors.length ? "Check the embellishment rows above." : emb.items.length ? emb.items.map(row => (row.name || row.type) + ": " + money(row.amount)).join(" + ") : "No embellishments";
  if (rateBasedStones) {
    values.stone = scannedNetOnly === null ? stoneCharge(values.stoneWeight, values.stoneRate, stoneBasis.value) : null;
    if (scannedNetOnly !== null) {
      stoneFormula = "Enter gross and stone weights in grams before using a stone rate.";
      errors.push(stoneFormula);
    } else if (values.stone === null) {
      stoneFormula = stoneBasis.value === "carat"
        ? "1 ct = 0.2 g. Enter the stone rate and check the Dia/Stone weight in grams above."
        : "Enter the stone rate per gram and check the Dia/Stone weight above.";
    } else {
      const grams = weightDecimal(values.stoneWeight) + " g";
      const carats = quantity(values.stoneWeight * 5n, "stoneWeight") + " ct";
      stoneFormula = stoneBasis.value === "carat"
        ? grams + " = " + carats + " · " + carats + " × " + money(values.stoneRate) + "/ct"
        : grams + " × " + money(values.stoneRate) + "/g";
      byId("stone").value = formatEntry("stone", amountDecimal(values.stone));
    }
  }
  byId("stone-calculation").textContent = stoneFormula;
  byId("stone-formula").textContent = stoneFormula;
  values.gramRate = applyCarat(values.gramRate, errors);
  values.makingBasis = perGram ? "gram" : "percent";
  const amounts = calculate(values);
  for (const node of outputs) {
    const formatted = !hasWeight ? "—" : money(amounts[node.dataset.amount]);
    node.textContent = formatted;
    if (node.classList.contains("figure")) node.style.setProperty("--characters", formatted.length);
  }
  byId("gold-formula").textContent = amounts.gold === null
    ? (currentMetal === "silver" ? "Silver" : "Gold") + " rate × net metal weight"
    : (currentMetal === "silver" ? "" : purityLabel(selectedGrade()) + " at ") + formatGramRate(values.gramRate) + "/g × " + quantity(values.weight, "weight") + " g";
  byId("making-formula").textContent = perGram
    ? (amounts.makingFee === null ? "Making rate × net silver weight" : "₹" + quantity(values.making,"making") + "/g × " + quantity(values.weight,"weight") + " g")
    : amounts.makingFee === null
    ? "Making % × metal value"
    : quantity(values.making, "making") + "% of " + money(amounts.gold);
  byId("tax-formula").textContent = amounts.tax === null
    ? "GST % × subtotal"
    : quantity(values.gst, "gst") + "% of " + money(amounts.subtotal);
  clearTimeout(announcement);
  if (announce) {
    const message = errors[0] || (amounts.bill === null
      ? (rateBasedStones && values.stoneRate === null ? "Enter the diamond/stone rate to see the full price." : "Enter the metal rate and the piece’s gross weight to see the price.")
      : "Bill with GST " + money(amounts.bill) + ". Price before GST " + money(amounts.subtotal) + ".");
    announcement = setTimeout(() => { status.textContent = message; }, 350);
  }
  return { values, amounts, errors };
}

for (const input of inputs) {
  input.closest(".entry").addEventListener("click", () => input.focus());
  input.addEventListener("input", () => {
    if (input.name === "gross" || input.name === "stoneWeight") scannedNetOnly = null;
    refresh();
  });
  input.addEventListener("focus", () => {
    const key = input.name === "rate" ? "gramRate" : input.name;
    const { decimal, error } = readField(key, input.value);
    if (!error && decimal && input.value !== decimal) input.value = decimal;
    input.select();
  });
  input.addEventListener("blur", () => {
    touched.add(input.name);
    const key = input.name === "rate" ? "gramRate" : input.name;
    const { decimal, error } = readField(key, input.value);
    if (!error) input.value = formatEntry(key, decimal);
    refresh();
  });
  input.addEventListener("keydown", event => {
    if (event.key !== "Enter" || event.isComposing) return;
    event.preventDefault();
    const activeInputs = inputs.filter(field => !field.disabled);
    const index = activeInputs.indexOf(input);
    if (input.name === "rate") carat.focus();
    else if (index + 1 < activeInputs.length) activeInputs[index + 1].focus();
    else input.blur();
  });
}
form.addEventListener("submit", event => event.preventDefault());
form.addEventListener("input", () => { tagNotice.textContent = ""; });
form.addEventListener("change", () => { tagNotice.textContent = ""; });

setupScanner((code, source) => {
  // Validate the entire tag before replacing any values from a previous piece.
  const item = decodeItem(resolveStripe(code), supportedCarats);
  const nextMetal = isSilver(item.carat) ? "silver" : "gold";
  if (currentMetal !== nextMetal) changeMetal(nextMetal);
  silverBasis.value = item.silverBasis || "purity";
  makingBasis.value = item.makingBasis || "percent";
  identity.load(item);
  embellishments.load(item);
  stoneBasis.value = item.stoneBasis || "total";
  byId("stoneRate").value = formatEntry("stoneRate", item.stoneRate || "");
  touched.delete("stoneRate");
  if (isSilver(item.carat) && !silverGrades.includes(item.carat)) {
    carat.value = "custom";
    customFine.value = item.carat.slice(2);
  } else carat.value = item.carat;
  shopRate.value = overrides.get(item.carat) || "";
  scannedNetOnly = item.gross === undefined ? readField("weight", item.weight) : null;
  for (const key of itemFields) byId(key).value = formatEntry(key, item[key] ?? "");
  refresh();
  tagNotice.dataset.error = "false";
  const label = source === "sample" ? "Sample tag scanned" : "Tag scanned";
  tagNotice.textContent = label + " · " + purityLabel(item.carat) + " · " + item.weight + " g net";
}, code => {
  const item = decodeItem(resolveStripe(code), supportedCarats);
  const grade = item.carat;
  const target = isSilver(grade) ? "silver" : "gold";
  const rawBase = rates.get(target);
  const rate = item.silverBasis !== "fine" && overrides.has(grade) ? readField("gramRate", overrides.get(grade)).value
    : gradeRate(readField("gramRate", rawBase).value, grade, item.silverBasis);
  const values = Object.fromEntries(legacyFields.map(key => [key, readField(key, item[key]).value]));
  const totals = calculate({ ...values, gramRate:rate, makingBasis:item.makingBasis });
  return estimateDetails(item, rate, values, totals);
}, action => rates.confirmScan(action));

function estimateDetails(item, rate, values, totals) {
  const name = metalName(item.carat);
  const rows = [["Purity", purityLabel(item.carat)], ["HUID", item.huid || "—"]];
  if (item.gross !== undefined) {
    rows.push(["Gross weight", item.gross + " g"]);
    for (const material of labelDetails(item).materials) {
      rows.push([material.label, material.weight + " · " + material.lines[1]]);
    }
  }
  rows.push(["Net " + name.toLowerCase() + " weight", item.weight + " g"], [name + " rate", rate === null ? "Enter a rate in the calculator" : formatGramRate(rate) + "/g"],
    [name + " value", money(totals.gold)], ["Making (" + makingLabel(item) + ")", money(totals.makingFee)],
    ["Embellishment value", money(values.stone)], ["Price before GST", money(totals.subtotal)], ["GST (" + item.gst + "%)", money(totals.tax)],
    ["Bill with GST", money(totals.bill)]);
  return { name: item.name || "Jewellery", rows, complete: totals.bill !== null };
}

const openEstimate = setupEstimate();
window.openScannedEstimate = snapshot => { if (snapshot?.complete) openEstimate(snapshot); };
byId("open-estimate").disabled = false;
byId("open-estimate").addEventListener("click", () => {
  const {values, amounts, errors} = refresh(false);
  const huid = readHuid(byId("huid").value);
  if (errors.length || amounts.bill === null || huid.error) {
    const field = form.querySelector('[aria-invalid="true"],input:required:placeholder-shown');
    if (field) field.focus();
    tagNotice.dataset.error = "true";
    tagNotice.textContent = huid.error || errors[0] || "Enter the metal rate and gross weight to create an estimate.";
    tagNotice.scrollIntoView({block:"nearest"});
    return;
  }
  const item = {name:byId("item-name").value.trim(), huid:huid.value, carat:selectedGrade(),
    silverBasis:currentMetal === "silver" ? silverBasis.value : undefined, makingBasis:values.makingBasis, weight:weightDecimal(values.weight), making:byId("making").value.trim() ? readField("making",byId("making").value).decimal : "0", gst:quantity(values.gst,"gst")};
  if (scannedNetOnly === null) {
    item.gross = weightDecimal(values.gross);
    item.embellishments = embellishments.rows();
  }
  openEstimate(estimateDetails(item, values.gramRate, values, amounts));
});

setupMaker(() => {
  const details = identity.forTag();
  if (!selectedGrade()) throw Object.assign(new Error("Enter a valid silver fineness."), {field:"custom-fine"});
  const keys = scannedNetOnly === null ? itemFields : legacyFields;
  const fields = Object.fromEntries(keys.map(key => [key, key === "weight" ? scannedNetOnly.decimal : byId(key).value]));
  let detailed;
  try { detailed = validatedRows(embellishments.rows()); }
  catch(error) { error.field = "add-embellishment"; throw error; }
  if (scannedNetOnly === null) { fields.stoneWeight = detailed.weight; fields.stone = detailed.amount; }
  const item = { ...itemFromFields({ ...fields, carat: selectedGrade(), stoneBasis: "total" }, supportedCarats), ...details, silverBasis:currentMetal === "silver" ? silverBasis.value : undefined, makingBasis:makingBasis.value };
  if (scannedNetOnly === null) item.embellishments = detailed.rows;
  return item;
}, error => {
  tagNotice.dataset.error = "true";
  tagNotice.textContent = error.message;
  if (error.field) byId(error.field).focus();
});

toggle.addEventListener("click", () => {
  breakdown.hidden = !breakdown.hidden;
  toggle.setAttribute("aria-expanded", String(!breakdown.hidden));
});

byId("reset").addEventListener("click", () => {
  form.reset();
  drafts.clear();
  overrides.clear();
  changeMetal(currentMetal, false);
  tagNotice.textContent = "";
  touched.clear();
  refresh(false);
  status.textContent = "Item fields cleared.";
});

refresh(false);
rates.start();
byId("open-scanner").disabled = false;
byId("open-maker").disabled = false;
byId("open-continuous").disabled = false;

// Quick actions share the same scanner and tag-maker flow on every screen size.
for (const button of document.querySelectorAll('[data-trigger]')) {
  button.addEventListener('click', () => byId(button.dataset.trigger).click());
  button.disabled = false;
}
