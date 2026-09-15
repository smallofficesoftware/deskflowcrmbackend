// The final resolveDataSources -> fillMissingInputsFromContent ->
// applyTokenSubstitution -> [applyConditionalVisibility] -> generate() ->
// Buffer.from() tail was copy-pasted byte-identical across 7 different
// generator files (accountStatement/accountTransaction/taskDueList/
// shippingLabel/employeeAccountStatement/employeeAccountTransaction/
// contactPrint) — each one only differs in how it builds `template` and
// `rawInputs` before reaching this point. One shared place for it now, same
// reasoning as pluginMap.js/fonts.js's fontMap.
//
// Deliberately NOT in orderInputMapper.js, which only shapes/transforms
// (resolveDataSources etc. themselves) and never calls generate() itself —
// this file is the one place in pdfmeEngine that actually does.
import { generate } from "@pdfme/generator";
import { fontMap } from "./fonts.js";
import { applyConditionalVisibility, applyTokenSubstitution, fillMissingInputsFromContent, resolveDataSources } from "./orderInputMapper.js";
import { pluginMap } from "./pluginMap.js";

// applyVisibility: accountTransaction/employeeAccountTransaction's single-
// record receipt templates never call applyConditionalVisibility at all
// (no visibilityCondition fields defined on their built-in layout to begin
// with) — every other caller here does.
export async function renderPdf(template, rawInputs, { applyVisibility = true } = {}) {
  let resolvedInputs = resolveDataSources(template, rawInputs);
  resolvedInputs = fillMissingInputsFromContent(template, resolvedInputs);
  resolvedInputs = applyTokenSubstitution(template, resolvedInputs);
  const finalTemplate = applyVisibility ? applyConditionalVisibility(template, resolvedInputs) : template;
  const pdfBytes = await generate({ template: finalTemplate, inputs: [resolvedInputs], plugins: pluginMap, options: { font: fontMap } });
  return Buffer.from(pdfBytes);
}
