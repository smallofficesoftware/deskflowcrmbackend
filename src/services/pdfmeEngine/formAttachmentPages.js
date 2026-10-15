// Attachment fields ("file" type, one or many files) have no fixed number of
// pictures, so they cannot be a fixed slot in the template. Their images are
// appended after the generated PDF as extra pages instead: a heading per
// field and the pictures in a grid (two per row), non-image files listed by
// name. Works for any template, edited or not.
import { PDFDocument, StandardFonts, rgb } from "@pdfme/pdf-lib";

const MM = 72 / 25.4; // pdf points per mm
const PAGE_W = 210 * MM;
const PAGE_H = 297 * MM;
const MARGIN = 12 * MM;
const CELL_W = 92 * MM;
const CELL_GAP = 6 * MM;
const CELL_H = 68 * MM;
const CAPTION_H = 6 * MM;
export const MAX_IMAGES_PER_FIELD = 12;

// pdf-lib's standard fonts cannot draw characters outside WinAnsi (Gujarati,
// Hindi, ...); keep text to what they can, never throw for a file name.
const safeText = (value) => String(value ?? "").replace(/[^\x20-\x7E -ÿ]/g, "?");

function fitText(font, text, size, maxWidth) {
  let out = safeText(text);
  while (out.length > 4 && font.widthOfTextAtSize(out, size) > maxWidth) out = `${out.slice(0, -4)}...`;
  return out;
}

// groups: [{ label, images: [{ name, mime, bytes }], others: [name], extra }]
// Returns the PDF bytes with the attachment pages appended, or the input
// bytes unchanged when there is nothing to add.
export async function appendAttachmentPages(pdfBytes, { title, groups }) {
  const active = (groups || []).filter((g) => g.images.length > 0 || g.others.length > 0);
  if (active.length === 0) return pdfBytes;

  const doc = await PDFDocument.load(pdfBytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = null;
  let cursor = 0;
  const newPage = (heading) => {
    page = doc.addPage([PAGE_W, PAGE_H]);
    cursor = PAGE_H - MARGIN;
    page.drawText(fitText(bold, title || "Attachments", 11, PAGE_W - 2 * MARGIN), { x: MARGIN, y: cursor - 11, size: 11, font: bold });
    cursor -= 11 + 8 * MM;
    if (heading) {
      page.drawText(fitText(bold, heading, 10, PAGE_W - 2 * MARGIN), { x: MARGIN, y: cursor - 10, size: 10, font: bold, color: rgb(0.1, 0.1, 0.1) });
      cursor -= 10 + 3 * MM;
    }
  };

  for (const group of active) {
    newPage(`${group.label} (attachments)`);
    for (let i = 0; i < group.images.length; i += 2) {
      if (cursor - (CAPTION_H + CELL_H) < MARGIN) newPage(`${group.label} (attachments, continued)`);
      const row = group.images.slice(i, i + 2);
      for (let c = 0; c < row.length; c++) {
        const img = row[c];
        const x = MARGIN + c * (CELL_W + CELL_GAP);
        page.drawText(fitText(font, img.name, 8, CELL_W), { x, y: cursor - 8, size: 8, font, color: rgb(0.25, 0.25, 0.25) });
        try {
          const embedded = img.mime === "image/png" ? await doc.embedPng(img.bytes) : await doc.embedJpg(img.bytes);
          // Fit inside the cell, keep the picture's own proportions.
          const scale = Math.min(CELL_W / embedded.width, CELL_H / embedded.height);
          const w = embedded.width * scale;
          const h = embedded.height * scale;
          page.drawImage(embedded, { x, y: cursor - CAPTION_H - h, width: w, height: h });
        } catch {
          page.drawText("(picture could not be read)", { x, y: cursor - CAPTION_H - 10, size: 8, font });
        }
      }
      cursor -= CAPTION_H + CELL_H + 4 * MM;
    }
    const notes = group.others.map((n) => `File: ${n}`);
    if (group.extra > 0) notes.push(`... and ${group.extra} more picture(s) not shown`);
    for (const note of notes) {
      if (cursor - 6 * MM < MARGIN) newPage(`${group.label} (attachments, continued)`);
      page.drawText(fitText(font, note, 9, PAGE_W - 2 * MARGIN), { x: MARGIN, y: cursor - 9, size: 9, font });
      cursor -= 6 * MM;
    }
  }

  return await doc.save();
}
