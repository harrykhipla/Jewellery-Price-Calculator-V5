import {caratRate} from './price.mjs';

// The silver quote is for 999-fine material, so 925 silver uses 925/999.
export const silverGrades = ['Ag999','Ag990','Ag970','Ag958','Ag925','Ag900','Ag835','Ag800'];
// Store tenths of a fineness point as integer units for rate calculations.
export function silverGrade(raw) {
  const value = String(raw).trim();
  if (!/^\d{1,4}(?:\.\d)?$/.test(value)) return '';
  const fine = Number(value);
  return fine > 0 && fine <= 1000 ? 'Ag' + fine : '';
}
export function isSilver(grade) {
  return typeof grade === 'string' && grade.startsWith('Ag') && silverGrade(grade.slice(2)) === grade;
}
export function metalName(grade) { return isSilver(grade) ? 'Silver' : 'Gold'; }
export function purityLabel(grade) { return isSilver(grade) ? grade.slice(2)+' silver' : grade+'K'; }
export function gradeOption(grade) {
  if (!isSilver(grade)) return purityLabel(grade);
  const fine = grade.slice(2);
  const name = grade === 'Ag925' ? ' · Sterling silver' : grade === 'Ag999' ? ' · Fine silver' : '';
  return fine + ' · ' + (Number(fine) / 10).toFixed(1) + '%' + name;
}
export function gradeRate(base,grade,pricingBasis='purity') {
  if (base === null) return null;
  if (pricingBasis === 'fine' && isSilver(grade)) return base;
  return isSilver(grade) ? (base*BigInt(Math.round(Number(grade.slice(2))*10))+4995n)/9990n : caratRate(base,Number(grade));
}
