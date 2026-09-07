// pdfme's own `text` plugin only enables **bold**/*italic* markdown parsing
// (textFormat: "inline-markdown", the Document Designer's "Rich text"
// toggle — pdfmeFieldSettingsPlugin.ts) for readOnly text fields. Verified
// straight from @pdfme/schemas' compiled source (not exported publicly):
// `isInlineMarkdownTextSchema = (schema) => schema.textFormat ===
// "inline-markdown" && !(schema.type === "text" && schema.readOnly !==
// true)` — for a non-readOnly type:"text" schema this is always false,
// regardless of textFormat.
//
// Every text field this app's designers create is non-readOnly — a
// field's rendered value comes from THIS app's own resolvedInputs pipeline
// (fillMissingInputsFromContent/applyTokenSubstitution in
// generateDocument.js), not pdfme's own readOnly-gated schema.content
// resolution — so the Rich text toggle silently did nothing at render
// time: a field with **word** in it printed the literal asterisks.
//
// Fix: wrap the stock `text` plugin's pdf() so that, only for schemas
// with textFormat:"inline-markdown", the SCHEMA handed to the real
// pdfRender gets readOnly:true — purely to satisfy
// isInlineMarkdownTextSchema's check and unlock markdown parsing. `value`
// itself is untouched: @pdfme/generator's core already resolved it off
// the REAL (non-readOnly) schema before this plugin ever runs, so this
// app's own resolvedInputs value still wins — readOnly:true here never
// reaches the code path that would instead re-derive the value from
// schema.content.
//
// Same "wrap pdf(), keep ui/propPanel stock" technique
// customRectanglePlugin.js already uses for the same reason (server-side
// generate() has no browser, ui/propPanel are never invoked here, just
// required to exist by @pdfme/common's Plugin schema validation).
import { text } from "@pdfme/schemas";

export const richText = {
  ui: text.ui,
  propPanel: text.propPanel,
  pdf: async (arg) => {
    const { schema } = arg;
    if (schema?.textFormat !== "inline-markdown") {
      return text.pdf(arg);
    }
    return text.pdf({ ...arg, schema: { ...schema, readOnly: true } });
  },
};
