// Company signature for the salary slip. The slip page prints it and also turns
// the page into a PDF in the browser; an <img> pointing at another origin would
// taint that canvas, so the stored company_sign file is returned as an embedded
// data URL instead of a link.
import fs from "fs";
import path from "path";
import { getCompanyDetailByLoginId } from "../commonServices.js";

const COMPANY_IMAGE_DIR = path.resolve(process.cwd(), "media-folder", "company_image");
const MAX_SIGN_BYTES = 2 * 1024 * 1024;
const MIME_BY_EXT = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
};

// Returns "data:image/...;base64,..." or null when the company has no signature
// or the file is missing/unreadable. Never throws: a slip without a signature
// must still load.
export async function getCompanySignDataUrl(req) {
    try {
        const loginId = req.body?.a_application_login_id || req.user?.id;
        if (!loginId) return null;

        const company = await getCompanyDetailByLoginId(loginId);
        const stored = company?.company_sign;
        if (!stored) return null;

        const filePath = path.resolve(COMPANY_IMAGE_DIR, stored);
        if (!filePath.startsWith(COMPANY_IMAGE_DIR + path.sep)) return null;

        const mime = MIME_BY_EXT[path.extname(filePath).toLowerCase()];
        if (!mime) return null;

        const stat = await fs.promises.stat(filePath);
        if (!stat.isFile() || stat.size > MAX_SIGN_BYTES) return null;

        const buffer = await fs.promises.readFile(filePath);
        return `data:${mime};base64,${buffer.toString("base64")}`;
    } catch (error) {
        console.error("getCompanySignDataUrl:", error.message);
        return null;
    }
}
