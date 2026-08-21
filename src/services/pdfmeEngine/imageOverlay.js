// pdfme's table plugin has zero image-in-cell support. The itemsTable stays
// 100% text (unchanged, zero risk to its proven rendering/pagination), with
// an empty "image" column reserving the visual space. This module then draws
// each row's product photo as a post-processing pass directly onto the
// ALREADY-GENERATED PDF using pdf-lib, positioned via pdfme's own PUBLIC
// dynamic-layout exports (getDynamicTemplate, getDynamicHeightsForTable,
// getDynamicLayoutSplitRange) — the same math pdfme itself uses to lay out
// and paginate the table — so image placement tracks the real table layout
// on every page it spans, not just page 1.
import { PDFDocument } from "@pdfme/pdf-lib";
import { getDynamicTemplate, getDynamicLayoutSplitRange, mm2pt, pt2mm } from "@pdfme/common";
import { getDynamicLayoutForSchema } from "@pdfme/schemas/dynamicLayout";
import { getDynamicHeightsForTable, TABLE_BODY_SPLIT_UNIT } from "@pdfme/schemas/tables";
import { resolveColumns } from "./tableColumns.js";

const CELL_PADDING_MM = 2;

// Fixed thumbnail box, not "fill the row" — a uniform cap makes every row's
// photo the same consistent thumbnail size, like a real product catalog,
// regardless of the row's actual height or the source image's aspect ratio.
const THUMBNAIL_MAX_MM = 9;

function detectImageFormat(dataUri) {
  if (dataUri.startsWith("data:image/png")) return "png";
  if (dataUri.startsWith("data:image/jpeg") || dataUri.startsWith("data:image/jpg")) return "jpg";
  return null;
}

// A file's real format doesn't always match its extension (sloppy uploads,
// renamed files) — a ".jpg" that's actually PNG bytes makes pdf-lib's
// embedJpg() throw "SOI not found in JPEG" (it can't find the JPEG start-of-
// image marker because the bytes genuinely aren't JPEG). Sniff the real
// magic bytes instead of trusting the extension, for anywhere a data URI
// gets built from a file on disk (orderServices.js's §5 integration,
// documentPrintTemplateServices.js's preview path).
export function sniffImageMime(bytes) {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    return "image/jpeg";
  }
  return null;
}

// itemImages: array of data URIs (or falsy), aligned 1:1 with the table
// field's row order. template/input must be the exact same objects passed
// to generate() for this PDF — position math only matches if they are.
// tableFieldName lets a document with more than one item table run this
// independently per table — the caller loops over every qualifying table
// field and calls this once per name, threading pdfBytes through each call.
export async function overlayItemImages({ pdfBytes, template, tableFieldName = "itemsTable", input, itemImages, fontMap }) {
  const tableSchema = template.schemas[0]?.find((f) => f.name === tableFieldName);
  if (!tableSchema || !itemImages?.some(Boolean)) return pdfBytes;

  const columns = resolveColumns(tableSchema.columnOptions);
  const imgColIndex = columns.findIndex((c) => c.key === "image");
  if (imgColIndex === -1) return pdfBytes;

  const options = { font: fontMap };
  // getDynamicHeightsForTable's returned array is NOT one entry per data
  // row — when showHead is true it's `table.allRows()`, i.e. the head
  // row's own height(s) FIRST, then the body rows.
  const rawHeights = await getDynamicHeightsForTable(input[tableFieldName], {
    schema: tableSchema,
    basePdf: template.basePdf,
    options,
    _cache: new Map(),
  });
  const dataRowCount = JSON.parse(input[tableFieldName]).length;
  const headRowCount = rawHeights.length - dataRowCount;
  const headHeightMm = rawHeights.slice(0, headRowCount).reduce((sum, h) => sum + h, 0);
  const rowHeights = rawHeights.slice(headRowCount);

  const dynTemplate = await getDynamicTemplate({
    template,
    input,
    _cache: new Map(),
    options,
    getDynamicHeights: getDynamicLayoutForSchema,
  });

  const colWidthMm = (columns[imgColIndex].widthPct / 100) * tableSchema.width;
  const colXMm =
    tableSchema.position.x +
    (columns.slice(0, imgColIndex).reduce((sum, c) => sum + c.widthPct, 0) / 100) * tableSchema.width;

  const pdfDoc = await PDFDocument.load(pdfBytes);
  const embedCache = new Map();

  for (let pageIndex = 0; pageIndex < dynTemplate.schemas.length; pageIndex++) {
    const pageTableSchema = dynTemplate.schemas[pageIndex].find((f) => f.name === tableFieldName);
    if (!pageTableSchema) continue;

    const range = getDynamicLayoutSplitRange(pageTableSchema, TABLE_BODY_SPLIT_UNIT);
    const start = range?.start ?? 0;
    const end = range?.end ?? rowHeights.length;

    const page = pdfDoc.getPage(pageIndex);
    const pageHeightPt = page.getHeight();
    let yMm = pageTableSchema.position.y + (pageIndex === 0 && pageTableSchema.showHead ? headHeightMm : 0);

    for (let row = start; row < end; row++) {
      const rowHeightMm = rowHeights[row] ?? 0;
      const dataUri = itemImages[row];
      const format = dataUri && detectImageFormat(dataUri);

      if (format) {
        let embedded = embedCache.get(dataUri);
        if (!embedded) {
          const base64 = dataUri.slice(dataUri.indexOf(",") + 1);
          // Uint8Array.from() (not Buffer.from()) — small Node Buffers are
          // views into a shared pool, and @pdf-lib/upng's PNG decoder reads
          // `.buffer` directly without respecting byteOffset, so a pooled
          // Buffer's raw .buffer includes unrelated neighboring bytes and
          // fails PNG signature validation. Uint8Array.from() copies into a
          // fresh, exactly-sized ArrayBuffer.
          const bytes = Uint8Array.from(Buffer.from(base64, "base64"));
          embedded = format === "png" ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes);
          embedCache.set(dataUri, embedded);
        }

        const availWMm = Math.min(colWidthMm - CELL_PADDING_MM * 2, THUMBNAIL_MAX_MM);
        const availHMm = Math.min(rowHeightMm - CELL_PADDING_MM * 2, THUMBNAIL_MAX_MM);
        if (availWMm > 0 && availHMm > 0) {
          const naturalWMm = pt2mm(embedded.width);
          const naturalHMm = pt2mm(embedded.height);
          const scale = Math.min(availWMm / naturalWMm, availHMm / naturalHMm, 1);
          const drawWMm = naturalWMm * scale;
          const drawHMm = naturalHMm * scale;
          const drawXMm = colXMm + (colWidthMm - drawWMm) / 2;
          const drawYMm = yMm + (rowHeightMm - drawHMm) / 2;
          page.drawImage(embedded, {
            x: mm2pt(drawXMm),
            y: pageHeightPt - mm2pt(drawYMm) - mm2pt(drawHMm),
            width: mm2pt(drawWMm),
            height: mm2pt(drawHMm),
          });
        }
      }

      yMm += rowHeightMm;
    }
  }

  return pdfDoc.save();
}
