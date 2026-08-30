// Rectangle field with an independent border width per side (top/right/
// bottom/left), instead of pdfme's built-in `rectangle` plugin which only
// supports ONE uniform borderWidth number applied to all 4 sides at once.
//
// Mirrors the exact technique @pdfme/schemas' own Table "cell" plugin uses
// for its per-side cell borders (verified by reading its compiled source —
// not exported publicly, so reimplemented here): draw the fill via the
// stock `rectangle` plugin with its own border disabled, then draw each
// border side as its own thin filled strip via the stock `line` plugin
// (which already skips rendering when width/height is 0 or color is unset —
// that's what makes "only one border" work, just leave the other 3 sides
// at width 0).
//
// `type` stays "rectangle" (same key `pluginMap.rectangle` is registered
// under in generateDocument.js) so existing templates keep working
// unchanged — old templates with a plain numeric `borderWidth` are
// normalized to an all-sides box on the fly by toBoxDimension() below.
import { line, rectangle } from "@pdfme/schemas";

function toBoxDimension(value) {
  if (value && typeof value === "object") {
    return {
      top: value.top ?? 0,
      right: value.right ?? 0,
      bottom: value.bottom ?? 0,
      left: value.left ?? 0,
    };
  }
  const n = typeof value === "number" ? value : 0;
  return { top: n, right: n, bottom: n, left: n };
}

async function renderBorderSide(arg, position, width, height, color) {
  await line.pdf({
    ...arg,
    schema: { ...arg.schema, type: "line", position, width, height, color },
  });
}

export const customRectangle = {
  // ui/propPanel are never actually invoked server-side (no browser, no
  // Designer here) — but @pdfme/common's generate() validates every
  // registered plugin against its full Plugin schema before running, and
  // throws "expected nonoptional, received undefined" if ui/propPanel are
  // missing. Keeping the stock ones is enough to satisfy that check.
  ui: rectangle.ui,
  propPanel: rectangle.propPanel,
  pdf: async (arg) => {
    const { schema } = arg;
    const { position, width, height } = schema;
    const borderWidth = toBoxDimension(schema.borderWidth);

    // Fill only — border sides are drawn separately below so each can have
    // its own width (rectangle.pdf's own borderWidth is a single number).
    await rectangle.pdf({
      ...arg,
      schema: { ...schema, type: "rectangle", borderWidth: 0, borderColor: "" },
    });

    await Promise.all([
      renderBorderSide(arg, { x: position.x, y: position.y }, width, borderWidth.top, schema.borderColor),
      renderBorderSide(
        arg,
        { x: position.x + width - borderWidth.right, y: position.y },
        borderWidth.right,
        height,
        schema.borderColor,
      ),
      renderBorderSide(
        arg,
        { x: position.x, y: position.y + height - borderWidth.bottom },
        width,
        borderWidth.bottom,
        schema.borderColor,
      ),
      renderBorderSide(arg, { x: position.x, y: position.y }, borderWidth.left, height, schema.borderColor),
    ]);
  },
};
