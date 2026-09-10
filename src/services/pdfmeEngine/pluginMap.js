// Single source of truth for @pdfme/generator's `plugins` option — every
// type either Designer's field palette (DocumentDesignerView.tsx,
// frontend-document-designer) or adminpanel's system-gallery editor
// (Editor.tsx) actually offers MUST be registered here. Neither editor
// restricts which field types can be added to which doc type, so a
// generate() call missing even one entry crashes with "Plugin or renderer
// for type X not found" the moment a template actually uses it — this bit
// 7 different generator files independently (accountStatement/
// accountTransaction/taskDueList/shippingLabel/employeeAccountStatement/
// employeeAccountTransaction/generateDocument.js's main cart-doc path) the
// same way, one at a time, before being consolidated here.
//
// generateDocument.js overrides `text` with its own richTextPlugin.js and
// adds date/signature (cart-doc-only extras, not in either editor's
// palette) — everything else imports this as-is.
import * as plugins from "@pdfme/schemas";
import { customRectangle } from "./customRectanglePlugin.js";

export const pluginMap = {
  text: plugins.text,
  table: plugins.table,
  image: plugins.image,
  rectangle: customRectangle,
  ellipse: plugins.ellipse,
  line: plugins.line,
  list: plugins.list,
};
