// Print layout of a form submission (plan items K1, K3). Pure module: it
// decides how a form's fields are grouped into printed blocks and where each
// block goes on the page. Both the default pdfme template
// (pdfmeEngine/formSubmissionTemplate.js) and the values that fill it
// (pdfmeEngine/formSubmissionGenerate.js) use printBlocks(), so the block names
// always line up.
//
//   text block      a heading (section-header, optional) and the lines under it
//                   inputs: blk_<n>_title, blk_<n>_body
//   question table  a table of numbered questions + answers
//                   inputs: <key>_qtable_heading, <key>_qtable
//   repeater        a table of the entered rows
//                   inputs: <key>_heading, <key>_table       (same names as before)
//   approvals       who signed off each stage           inputs: approvals_body
//
// Form settings (published_settings_json):
//   print: { empty_fields: "dash" | "line" | "hide" }   how an unanswered field prints
//     dash  "Company: -"    line  "Company: __________" (a line to write on)    hide  left out
// A field hidden by a "show only when" rule is never printed.

import crypto from "crypto";
import { LAYOUT_TYPES } from "./formBuilderDdlBuilder.js";
import { evaluateVisibility } from "./formBuilderConditions.js";

export const LAYOUT_TAG_PREFIX = "fb-print-2:";
export const EMPTY_FIELD_MODES = ["dash", "line", "hide"];

// pdfme page geometry used by the default template, in mm.
export const PAGE = { width: 210, height: 297, left: 10, contentWidth: 190 };
const TEXT_LINE_MM = 4.6; // one 9pt line with some breathing room
const CHARS_PER_LINE = 88; // at 9pt across 190 mm
const TITLE_HEIGHT = 7;
const BLOCK_GAP = 3;
const TABLE_ROW_MM = 8;
const TABLE_HEAD_MM = 9;

export function emptyModeOf(settingsJson) {
  let parsed = settingsJson;
  if (typeof settingsJson === "string") {
    try {
      parsed = JSON.parse(settingsJson);
    } catch {
      parsed = null;
    }
  }
  const mode = parsed?.print?.empty_fields;
  return EMPTY_FIELD_MODES.includes(mode) ? mode : "dash";
}

// Fields grouped into printed blocks, in form order.
export function printBlocks(fields) {
  const blocks = [];
  let current = null;
  let textIndex = 0;
  const flush = () => {
    current = null;
  };
  const textBlock = (title = null) => {
    current = { kind: "text", index: textIndex++, title, fields: [] };
    blocks.push(current);
    return current;
  };

  for (const field of Array.isArray(fields) ? fields : []) {
    if (!field || typeof field !== "object") continue;
    if (field.type === "section-header") {
      textBlock(field.label || field.key || "");
      continue;
    }
    if (field.type === "question-table") {
      flush();
      blocks.push({ kind: "qtable", field });
      continue;
    }
    if (field.type === "repeater") {
      flush();
      blocks.push({ kind: "repeater", field });
      continue;
    }
    if (!current) textBlock(null);
    current.fields.push(field);
  }
  return blocks;
}

// Short id of everything the default layout depends on. A stored template
// that carries this tag was generated (not hand-edited) and is rebuilt when
// the tag no longer matches the form.
export function layoutSignature(fields) {
  const parts = printBlocks(fields).map((b) => {
    if (b.kind === "text") return ["t", b.title, b.fields.map((f) => `${f.key}:${f.type}:${f.label}`)];
    if (b.kind === "qtable") {
      return ["q", b.field.key, b.field.label, (b.field.questions || []).length, (b.field.answer_columns || []).map((c) => c.label || c.key)];
    }
    return ["r", b.field.key, b.field.label, (b.field.columns || []).map((c) => `${c.key}:${c.type}:${c.label}`)];
  });
  return crypto.createHash("md5").update(JSON.stringify(parts)).digest("hex").slice(0, 10);
}

// Rough number of printed lines for a text block's fields, generous so
// pdfme's shrink-to-fit rarely has to work hard.
export function estimateTextLines(block) {
  let lines = 0;
  for (const f of block.fields) {
    if (f.type === "instruction") {
      const text = String(f.content || "").replace(/<[^>]*>/g, "");
      lines += Math.max(1, text.split("\n").reduce((n, l) => n + Math.max(1, Math.ceil(l.length / CHARS_PER_LINE)), 0));
    } else if (f.type === "textarea" || f.type === "address") lines += 3;
    else lines += 1;
  }
  return Math.max(lines, 1);
}

export function tableHeightFor(rowCount) {
  return TABLE_HEAD_MM + Math.max(rowCount, 1) * TABLE_ROW_MM;
}

// Place the blocks on pages. `top` / `bottom`: usable y range of a page (mm).
// Returns [{ items: [{ block, y, height, titleHeight? }] }], one entry per page.
//   - a text block moves to the next page when it doesn't fit;
//   - a question table has a known row count, so it is sized exactly;
//   - a repeater's row count is unknown: the first fills the rest of its page,
//     later ones each start a page of their own.
export function planPages(blocks, { top, bottom, firstTop = top }) {
  const pages = [{ items: [] }];
  let y = firstTop;
  let repeaterSeen = false;
  const page = () => pages[pages.length - 1];
  const newPage = () => {
    pages.push({ items: [] });
    y = top;
  };
  const usable = bottom - top;

  for (const block of blocks) {
    if (block.kind === "text") {
      const titleHeight = block.title ? TITLE_HEIGHT : 0;
      const bodyHeight = block.fixedHeight ? block.fixedHeight : block.fields.length ? estimateTextLines(block) * TEXT_LINE_MM + 2 : 0;
      const total = titleHeight + bodyHeight;
      if (total === 0) continue;
      if (y + total > bottom && page().items.length > 0) newPage();
      const height = Math.min(total, usable);
      page().items.push({ block, y, height, titleHeight, bodyHeight: Math.max(height - titleHeight, 0) });
      y += height + BLOCK_GAP;
    } else if (block.kind === "qtable") {
      const rows = (block.field.questions || []).length;
      const height = Math.min(tableHeightFor(rows), usable - 8);
      if (y + 8 + height > bottom && page().items.length > 0) newPage();
      page().items.push({ block, y, height, titleHeight: 8 });
      y += 8 + height + BLOCK_GAP;
    } else if (block.kind === "repeater") {
      if (repeaterSeen && page().items.length > 0) newPage();
      else if (bottom - y < 40 && page().items.length > 0) newPage();
      const height = Math.max(bottom - y - 8, 20);
      page().items.push({ block, y, height, titleHeight: 8 });
      repeaterSeen = true;
      y = bottom + 1; // the table takes the rest of the page
    }
  }
  return pages;
}

// ---------- Values ----------

// A stored row as the answers the condition rules expect (multi-select and
// question tables are stored as JSON text).
export function answersFromStoredRow(fields, row) {
  const answers = { ...(row || {}) };
  for (const f of fields) {
    if (typeof answers[f.key] === "string" && (f.type === "multi-select" || f.type === "question-table")) {
      try {
        answers[f.key] = JSON.parse(answers[f.key]);
      } catch {
        /* leave as text */
      }
    }
  }
  return answers;
}

// Fields to print for this stored row: those hidden by a "show only when"
// rule are dropped (K3).
export function printableFields(fields, row) {
  const answers = answersFromStoredRow(fields, row);
  const visible = evaluateVisibility(fields, answers);
  return fields.filter((f) => !f.key || visible.has(f.key));
}

const LINE = "______________________________";

// The printed line for one field. `value` is the display value (labels
// already resolved). Returns a string, or null to leave it out.
export function lineForField(field, value, emptyMode = "dash") {
  if (field.type === "instruction") {
    const text = field.content ? String(field.content).replace(/<[^>]*>/g, "").trim() : "";
    return text || null;
  }
  if (LAYOUT_TYPES.has(field.type)) return null;
  const name = field.label || field.key;
  const empty = value == null || value === "";
  if (empty) {
    if (emptyMode === "hide") return null;
    return emptyMode === "line" ? `${name}: ${LINE}` : `${name}: -`;
  }
  return field.type === "question-table" ? `${name}:\n${value}` : `${name}: ${value}`;
}
