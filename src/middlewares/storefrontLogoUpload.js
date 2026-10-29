import fs from "fs-extra";
import multer from "multer";
import path from "path";

// Storefront logo upload (Ecommerce settings). Lands in a temp folder that is NOT served statically; the service
// verifies the real file type from its bytes, then moves it under company_image/<company id>/.
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const storagePath = path.join(process.cwd(), "media-folder/storefront_logo_temp");
    fs.ensureDirSync(storagePath);
    cb(null, storagePath);
  },
  filename: function (req, file, cb) {
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}.upload`);
  },
});

export const storefrontLogoUpload = multer({
  storage,
  limits: { fileSize: 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (![".png", ".jpg", ".jpeg", ".webp"].includes(ext)) {
      return cb(new Error("Logo must be a PNG, JPG or WEBP image."));
    }
    cb(null, true);
  },
}).single("logo");
