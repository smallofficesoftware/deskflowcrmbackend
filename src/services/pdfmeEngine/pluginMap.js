// Single source of truth for @pdfme/generator's `plugins` option — every
// type either Designer's field palette (DocumentDesignerView.tsx,
// frontend-document-designer) or adminpanel's system-gallery editor
// (Editor.tsx) actually offers MUST be registered here, and every generator
// in this directory imports this EXACT map, unmodified — no per-file
// overrides. A generate() call missing even one entry crashes with "Plugin
// or renderer for type X not found" the moment a template actually uses
// it; per-file overrides are exactly how that kept happening one file at a
// time before this existed.
//
// text uses richTextPlugin.js (bold/italic inline markdown), not the
// plain @pdfme/schemas text plugin — same reasoning as
// rectangle/date/signature below, just registered once instead of
// generateDocument.js/formSubmissionGenerate.js each doing their own
// `{ ...pluginMap, text: richText }` override.
// table uses richTablePlugin.js (same bold/italic markdown support, inside
// cells) — see that file's header comment for how it reuses pdfme's own
// pagination/text-rendering machinery instead of reimplementing it.
import * as plugins from "@pdfme/schemas";
import { customRectangle } from "./customRectanglePlugin.js";
import { richTable } from "./richTablePlugin.js";
import { richText } from "./richTextPlugin.js";

export const pluginMap = {
  text: richText,
  table: richTable,
  image: plugins.image,
  rectangle: customRectangle,
  ellipse: plugins.ellipse,
  line: plugins.line,
  list: plugins.list,
  date: plugins.date,
  signature: plugins.signature,
};
