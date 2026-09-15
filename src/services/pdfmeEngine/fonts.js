// pdfme has no "Bold" toggle on text fields — bold is a separate font FILE
// picked by name from the Font Name dropdown. Loaded from backend/public/fonts
// (the real app's actual brand font set, already used by the EJS pipeline)
// instead of the POC's own bundled fonts/ dir — real branding, no Roboto
// fallback since the real app doesn't ship a Roboto font at all.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONTS_DIR = path.join(__dirname, "..", "..", "..", "public", "fonts");

export function loadFonts() {
  return {
    Poppins: {
      data: fs.readFileSync(path.join(FONTS_DIR, "Poppins-Regular.ttf")),
      fallback: true,
    },
    "Poppins Bold": {
      data: fs.readFileSync(path.join(FONTS_DIR, "Poppins-Bold.ttf")),
    },
    "Poppins SemiBold": {
      data: fs.readFileSync(path.join(FONTS_DIR, "Poppins-SemiBold.ttf")),
    },
    // Poppins has no Devanagari/Gujarati glyphs — Hindi/Gujarati text in a
    // field needs one of these picked as that field's own Font Name (pdfme
    // has no automatic per-glyph font fallback within one field). Variable
    // TTFs (Google Fonts ships no static instance for either family
    // anymore) — fontkit (pdf-lib's embedder) reads their default/base
    // outlines directly, no axis instancing needed for embedding.
    "Noto Sans Devanagari": {
      data: fs.readFileSync(path.join(FONTS_DIR, "NotoSansDevanagari-Regular.ttf")),
    },
    "Noto Sans Gujarati": {
      data: fs.readFileSync(path.join(FONTS_DIR, "NotoSansGujarati-Regular.ttf")),
    },
  };
}

// Single shared instance — every pdfmeEngine generator file used to call
// loadFonts() independently at its own module scope, each one re-reading
// all 5 font files off disk again (loadFonts() itself has no caching).
// ESM module caching makes this genuinely load-once: the first import of
// this file runs loadFonts() here, every later `import { fontMap } from
// "./fonts.js"` across the whole process reuses that same object.
export const fontMap = loadFonts();
