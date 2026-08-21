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
  };
}
