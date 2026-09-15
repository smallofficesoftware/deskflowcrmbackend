// Table field with **bold**/*italic* markdown support inside cells — pdfme's
// own `table` plugin (@pdfme/schemas) has no hook for this at all: verified
// by reading its compiled source, cell text is drawn through its own
// self-contained grid/pagination code with zero per-run styling (only
// whole-column/head/body style objects, no inline markdown parsing). This
// is a full reimplementation of the table's DRAWING step, built to reuse as
// much of pdfme's own machinery as possible rather than reinvent it:
//
// - Pagination (row heights, page-split ranges, repeatHead timing) is NOT
//   reimplemented — it's entirely @pdfme/common's doing, driven by
//   @pdfme/schemas' OWN `getDynamicHeightsForTable`/`getDynamicLayoutForTable`
//   (dynamicLayout.js), which fires purely off `schema.type === "table"` —
//   completely independent of which plugin object is registered for that
//   type. As long as our schema keeps `type: "table"` (it does — see
//   buildTemplate.js's tableField()), every existing multi-page
//   itemsTable/statementTable/taskTable keeps paginating exactly as today;
//   this plugin only draws whatever page-slice it's handed. Per-page slicing
//   uses the SAME public `getTableBodyRange()` helper pdfme's own table
//   plugin uses internally (confirmed by reading its source), not a
//   reimplementation of the split-range encoding.
// - Markdown is ALWAYS on for every cell (head + body) — unlike a plain text
//   field's opt-in "Rich text" checkbox (pdfmeFieldSettingsPlugin.ts), table
//   cell content is never free-typed customer data the way a text field's
//   content can be (it's always one of this app's own fixed columns —
//   dates, amounts, remarks built from real records), so there's no
//   literal-asterisk collision risk worth gating behind a toggle. A cell
//   with no `**`/`*` in it renders identically either way; one that does
//   gets the bold/italic the user typed. `fontVariants` (bold/italic font
//   name overrides), if the TABLE schema carries one, is read straight off
//   it and applied to every cell — same field-wide "one setting, whole
//   field" semantics a text field's fontVariants already has.
// - Per-cell text is drawn via the stock `text` plugin's own pdf(), with
//   `textFormat: "inline-markdown"` + `readOnly: true` always — the EXACT
//   same trick richTextPlugin.js already
//   uses for plain text fields (see its own header comment for why
//   readOnly:true is required and safe here: it only flips
//   @pdfme/schemas' internal `isInlineMarkdownTextSchema` check, the VALUE
//   drawn is still whatever this function passes in, verbatim). Without a
//   fontVariants mapping, bold/italic render via pdfme's built-in
//   "synthetic" fallback (faux-bold offset + faux-italic shear) — the same
//   fallback a text field gets when it flips on Rich text without also
//   picking a bold font (see pdfmeFieldSettingsPlugin.ts's own richText
//   toggle, which DOES wire one for "Poppins Bold").
// - Per-cell box (fill + border) reuses customRectanglePlugin.js (this
//   app's own per-side-border rectangle).
// - Row heights are measured with @pdfme/schemas' own public
//   `measureTextHeight()` (same markdown-aware line-wrapping the text
//   plugin itself uses) rather than guessed — this is the ONE thing pdfme's
//   upstream pagination step can't do for us: it measures each cell's RAW
//   string (asterisks and all, markdown-blind) to size the page-level
//   height budget, which is always >= our markdown-aware measurement
//   (stripped text is never wider than its raw markdown source), so the
//   page-level budget this plugin draws into is always generous enough —
//   never the other way around. That's a deliberate, documented
//   approximation (verified empirically, not assumed): it means a cell
//   sitting exactly at a wrap boundary can get a hair more vertical
//   whitespace than strictly needed, never clipped/overflowing content.
//
// Column alignment: read from `columnStyles[colIndex].alignment` (flat,
// keyed by column index) — matching how every template in this codebase
// actually builds columnStyles (see accountStatementTemplate.js's
// `columnStyles[i] = { alignment: c.alignment }`). Note this does NOT match
// how the STOCK table plugin's internals read it (`columnStyles.alignment
// [colIndex]`, nested the other way) — which means today, rendered through
// the stock plugin, those per-column alignment overrides are silently
// ignored (verified by reading the stock source: getTableOptions() builds
// its internal columnStyles from `schema.columnStyles.alignment`, a key our
// templates never set). This plugin reads columnStyles the way every
// template actually writes it, which incidentally fixes that — e.g. the
// right-aligned Credit/Debit/Balance columns in accountStatementTemplate
// now actually render right-aligned.
import { table, text } from "@pdfme/schemas";
import { getTableBodyRange } from "@pdfme/schemas/tables";
import { measureTextHeight } from "@pdfme/schemas/utils";
import { customRectangle } from "./customRectanglePlugin.js";

const CELL_STYLE_DEFAULTS = {
  alignment: "left",
  verticalAlignment: "middle",
  fontSize: 13,
  lineHeight: 1,
  characterSpacing: 0,
  fontColor: "#000000",
  backgroundColor: "",
  borderColor: "#888888",
  borderWidth: 0.1,
  padding: 5,
  minCellHeight: 0,
  fontName: undefined,
};

function toBox(value, fallback) {
  if (value && typeof value === "object") {
    return {
      top: value.top ?? fallback,
      right: value.right ?? fallback,
      bottom: value.bottom ?? fallback,
      left: value.left ?? fallback,
    };
  }
  const n = typeof value === "number" ? value : fallback;
  return { top: n, right: n, bottom: n, left: n };
}

function getBody(value) {
  if (typeof value === "string") {
    try {
      return JSON.parse(value || "[]");
    } catch {
      return [];
    }
  }
  return Array.isArray(value) ? value : [];
}

// columnStyles[colIndex] = { alignment, fontColor, backgroundColor, ... } —
// a flat per-column override, same shape tableField() callers build. Not to
// be confused with the stock plugin's own differently-shaped internal one
// (see the file header comment above).
function resolveCellStyle({ isHead, colIndex, rowIndex, headStyles, bodyStyles, columnStyles }) {
  const section = (isHead ? headStyles : bodyStyles) || {};
  const alternate =
    !isHead && bodyStyles?.alternateBackgroundColor && rowIndex % 2 === 0
      ? { backgroundColor: bodyStyles.alternateBackgroundColor }
      : {};
  const col = columnStyles?.[colIndex] || {};
  const merged = { ...CELL_STYLE_DEFAULTS, ...section, ...alternate, ...col };
  return {
    ...merged,
    borderWidth: toBox(merged.borderWidth, 0.1),
    padding: toBox(merged.padding, 5),
  };
}

// Markdown-aware, wrapping-aware cell height — see the file header comment
// on why this is measured (not guessed) and why it's safe against the
// upstream (markdown-blind) page-height budget. fontVariants, if the table
// schema carries one, comes from its own top-level property — same
// field-wide "one setting, whole field" semantics a text field's
// fontVariants already has, just applied to every cell instead of one.
async function measureCellHeight(rawText, style, width, arg, tableSchema) {
  const schema = {
    type: "text",
    readOnly: true,
    textFormat: "inline-markdown",
    fontVariants: tableSchema.fontVariants,
    fontVariantFallback: tableSchema.fontVariantFallback ?? "synthetic",
    position: { x: 0, y: 0 },
    width,
    height: 0,
    fontSize: style.fontSize,
    lineHeight: style.lineHeight,
    characterSpacing: style.characterSpacing,
    padding: style.padding,
    borderWidth: { top: 0, right: 0, bottom: 0, left: 0 },
    fontName: style.fontName,
  };
  return measureTextHeight({
    value: String(rawText ?? ""),
    schema,
    font: arg.options?.font,
    _cache: arg._cache,
  });
}

async function drawCellBox(arg, box, style) {
  await customRectangle.pdf({
    ...arg,
    schema: {
      ...arg.schema,
      type: "rectangle",
      position: { x: box.x, y: box.y },
      width: box.width,
      height: box.height,
      color: style.backgroundColor || "",
      borderColor: style.borderColor || "",
      borderWidth: style.borderWidth,
      rotate: 0,
      opacity: 1,
    },
  });
}

async function drawCellText(arg, box, style, rawText, tableSchema) {
  await text.pdf({
    ...arg,
    value: String(rawText ?? ""),
    schema: {
      name: "",
      type: "text",
      readOnly: true,
      textFormat: "inline-markdown",
      fontVariants: tableSchema.fontVariants,
      fontVariantFallback: tableSchema.fontVariantFallback ?? "synthetic",
      position: { x: box.x, y: box.y },
      width: box.width,
      height: box.height,
      rotate: 0,
      opacity: 1,
      overflow: "visible",
      strikethrough: false,
      underline: false,
      alignment: style.alignment,
      verticalAlignment: style.verticalAlignment,
      fontSize: style.fontSize,
      lineHeight: style.lineHeight,
      characterSpacing: style.characterSpacing,
      fontColor: style.fontColor,
      fontName: style.fontName,
      backgroundColor: "",
      borderColor: "",
      borderWidth: { top: 0, right: 0, bottom: 0, left: 0 },
      padding: style.padding,
    },
  });
}

// headWidthPercentages is required by every template this app builds
// (tableField() callers always set it) — equal-width fallback only guards
// against a table field added some other way (e.g. a future raw JSON edit)
// that omits it, so this never throws.
function columnWidths(schema) {
  const count = schema.head.length;
  if (count === 0) return [];
  const pct =
    Array.isArray(schema.headWidthPercentages) && schema.headWidthPercentages.length === count
      ? schema.headWidthPercentages
      : schema.head.map(() => 100 / count);
  return pct.map((p) => (p / 100) * schema.width);
}

async function drawRow(arg, { cells, widths, xOffsets, x0, y, styleFor, tableSchema }) {
  const styled = await Promise.all(
    cells.map(async (raw, i) => {
      const style = styleFor(i);
      const height = await measureCellHeight(raw, style, widths[i], arg, tableSchema);
      return { style, height: Math.max(height, style.minCellHeight || 0) };
    }),
  );
  const rowHeight = styled.reduce((max, s) => Math.max(max, s.height), 0);
  for (let i = 0; i < cells.length; i++) {
    const box = { x: x0 + xOffsets[i], y, width: widths[i], height: rowHeight };
    await drawCellBox(arg, box, styled[i].style);
    await drawCellText(arg, box, styled[i].style, cells[i], tableSchema);
  }
  return rowHeight;
}

export const richTable = {
  // ui/propPanel stay 100% stock — the Designer canvas editing experience
  // (dragging, resizing, the field-settings panel, column/content editing)
  // is unaffected by this; only server-side generate() ever calls pdf().
  ui: table.ui,
  propPanel: table.propPanel,
  pdf: async (arg) => {
    const { schema, value } = arg;
    const widths = columnWidths(schema);
    if (widths.length === 0) return;
    const xOffsets = [];
    {
      let x = 0;
      for (const w of widths) {
        xOffsets.push(x);
        x += w;
      }
    }

    const allBody = getBody(value);
    const range = getTableBodyRange(schema);
    const body = range ? allBody.slice(range.start, range.end) : allBody;
    // Same rule createSingleTable (the stock plugin's internal helper) uses:
    // head draws on the first page of this field always, and on every
    // continuation page only if repeatHead is explicitly set.
    const showHead = schema.showHead === false ? false : !schema.__isSplit || schema.repeatHead === true;

    let y = schema.position.y;

    if (showHead) {
      y += await drawRow(arg, {
        cells: schema.head,
        widths,
        xOffsets,
        x0: schema.position.x,
        y,
        styleFor: (colIndex) =>
          resolveCellStyle({
            isHead: true,
            colIndex,
            rowIndex: 0,
            headStyles: schema.headStyles,
            bodyStyles: schema.bodyStyles,
            columnStyles: schema.columnStyles,
          }),
        tableSchema: schema,
      });
    }

    for (let r = 0; r < body.length; r++) {
      const row = widths.map((_, i) => (Array.isArray(body[r]) ? body[r][i] : undefined) ?? "");
      y += await drawRow(arg, {
        cells: row,
        widths,
        xOffsets,
        x0: schema.position.x,
        y,
        styleFor: (colIndex) =>
          resolveCellStyle({
            isHead: false,
            colIndex,
            rowIndex: r,
            headStyles: schema.headStyles,
            bodyStyles: schema.bodyStyles,
            columnStyles: schema.columnStyles,
          }),
        tableSchema: schema,
      });
    }

    // Outer table border (tableStyles) — a single frame around the whole
    // drawn block, separate from each cell's own border.
    if (schema.tableStyles?.borderWidth) {
      await customRectangle.pdf({
        ...arg,
        schema: {
          ...schema,
          type: "rectangle",
          position: schema.position,
          width: schema.width,
          height: y - schema.position.y,
          color: "",
          borderColor: schema.tableStyles.borderColor || "#000000",
          borderWidth: schema.tableStyles.borderWidth,
          rotate: 0,
          opacity: 1,
        },
      });
    }
  },
};
