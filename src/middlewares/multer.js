import fs from "fs-extra";
import multer from "multer";
import path from "path";
import { generateTimeBasedPrefixedUUID } from "../helpers/uuidHelper.js";

const profileStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const storagePath = "media-folder/profile_photo/temp";
    fs.ensureDirSync(storagePath);
    cb(null, storagePath);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});
export const upload = multer({
  storage: profileStorage,
  limits: { fileSize: 1000000 },
  fileFilter: (req, file, cb) => {

    const allowedMimeTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "application/octet-stream",
    ];
    // Allowed extensions
    const allowedExtensions = /jpeg|jpg|png|/;

    const extnameValid = allowedExtensions.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimeTypeValid = allowedMimeTypes.includes(file.mimetype);
    if (mimeTypeValid && extnameValid) {
      cb(null, true); // Accept the file
    } else {
      cb(
        new Error(
          "Invalid file format. Please upload a JPEG, JPG and PNG file."
        )
      );
    }
  },
}).single("image");

const attendanceImageStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const storagePath = path.join(process.cwd(), "media-folder/attendance_images/temp");
    fs.mkdirSync(storagePath, { recursive: true });
    cb(null, storagePath);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

export const attendanceImageUpload = multer({
  storage: attendanceImageStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {

    const allowedMimeTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "application/octet-stream",
    ];
    // Allowed extensions
    const allowedExtensions = /jpeg|jpg|png|/;

    const extnameValid = allowedExtensions.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimeTypeValid = allowedMimeTypes.includes(file.mimetype);
    if (mimeTypeValid && extnameValid) {
      cb(null, true); // Accept the file
    } else {
      cb(
        new Error(
          "Invalid file format. Please upload a JPEG, JPG and PNG file."
        )
      );
    }
  },
}).single("image");

const attachmentStorage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      const storagePath = "media-folder/contact_history_attachment/temp";
      fs.ensureDirSync(storagePath);
      cb(null, storagePath); // Specify the directory to store the file
    } catch (err) {
      cb(err);
    }
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});
const attachmentStorageTaskChat = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      const storagePath = "media-folder/task_history_attachment/temp";
      fs.ensureDirSync(storagePath);
      cb(null, storagePath); // Specify the directory to store the file
    } catch (err) {
      cb(err);
    }
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

export const attachmentUpload = multer({
  storage: attachmentStorage,
  limits: { fileSize: 10000000 },
  fileFilter: (req, file, cb) => {
    const fileTypes =
      /jpeg|jpg|png|pdf|doc|docx|zip|svg|mp4|mkv|mpeg|mpg|txt|xlsx|xls|ppt|pptx|csv|mbp|mop|psd|rar|wasp|ogg|xml|mp4|m4a|wav|heic|mp3/;

    const mimeTypes = [
      "image/jpeg",
      "image/png",
      "image/heic",              // Main HEIC
      "image/heic-sequence",
      "application/pdf",
      "application/msword", // .doc
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
      "application/zip",
      "image/svg+xml",
      "video/mp4",
      "video/x-matroska", // .mkv
      "video/mpeg",
      "text/plain",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
      "application/vnd.ms-excel",
      "application/vnd.ms-powerpoint", // .xls, .ppt
      "application/vnd.openxmlformats-officedocument.presentationml.presentation", // .pptx
      "text/csv", // For .rar, .mbp, .mop, etc.
      "audio/mpeg",
      "audio/ogg",
      "audio/wav",
      "image/vnd.adobe.photoshop",
      "application/xml",
      "text/xml",
      "application/octet-stream",
    ];
    const mimeTypeValid = mimeTypes.includes(file.mimetype);

    // Validate file extension
    const extnameValid = fileTypes.test(
      path.extname(file.originalname).toLowerCase()
    );

    if (mimeTypeValid && extnameValid) {
      return cb(null, true);
    } else {
      const error = new Error(
        "Invalid file format. Please upload a jpeg, jpg, png, pdf, docx, zip, svg, mp4, mkv, mpeg, txt, xlsx, xls, ppt, pptx, csv, mbp, mop, psd, rar, wasp, xml"
      );
      error.status = 400;
      return cb(error, false);
    }
  },
});
export const attachmentUploadTaskChat = multer({
  storage: attachmentStorageTaskChat,
  limits: { fileSize: 10000000 },
  fileFilter: (req, file, cb) => {
    const fileTypes =
      /jpeg|jpg|png|pdf|doc|docx|zip|svg|mp4|mkv|mpeg|mpg|txt|xlsx|xls|ppt|pptx|csv|mbp|mop|psd|rar|wasp|ogg|xml|mp4|m4a|wav|mp3/;

    const mimeTypes = [
      "image/jpeg",
      "image/png",
      "application/pdf",
      "application/msword", // .doc
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
      "application/zip",
      "image/svg+xml",
      "video/mp4",
      "video/x-matroska", // .mkv
      "video/mpeg",
      "text/plain",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
      "application/vnd.ms-excel",
      "application/vnd.ms-powerpoint", // .xls, .ppt
      "application/vnd.openxmlformats-officedocument.presentationml.presentation", // .pptx
      "text/csv", // For .rar, .mbp, .mop, etc.
      "audio/mpeg",
      "audio/ogg",
      "audio/wav",
      "image/vnd.adobe.photoshop",
      "application/xml",
      "text/xml",
      "application/octet-stream",
    ];
    const mimeTypeValid = mimeTypes.includes(file.mimetype);

    // Validate file extension
    const extnameValid = fileTypes.test(
      path.extname(file.originalname).toLowerCase()
    );

    if (mimeTypeValid && extnameValid) {
      return cb(null, true);
    } else {
      const error = new Error(
        "Invalid file format. Please upload a jpeg, jpg, png, pdf, docx, zip, svg, mp4, mkv, mpeg, txt, xlsx, xls, ppt, pptx, csv, mbp, mop, psd, rar, wasp, xml"
      );
      error.status = 400;
      return cb(error, false);
    }
  },
});

const storageExcelSheet = multer.memoryStorage();
export const uploadExcelSheet = multer({
  storage: storageExcelSheet,
  limits: { fileSize: 10 * 1024 * 1024 },
});
const storageExcelSheetProduct = multer.memoryStorage();
export const uploadExcelSheetProduct = multer({
  storage: storageExcelSheetProduct,
  limits: { fileSize: 10 * 1024 * 1024 },
});
const storageExcelSheetPricelist = multer.memoryStorage();
export const uploadExcelSheetPricelist = multer({
  storage: storageExcelSheetPricelist,
  limits: { fileSize: 10 * 1024 * 1024 },
});
const storageExcelSheetTask = multer.memoryStorage();
export const uploadExcelSheetTask = multer({
  storage: storageExcelSheetTask,
  limits: { fileSize: 10 * 1024 * 1024 },
});

const mediaPath = path.join(
  process.cwd(),
  "media-folder",
  "product-images"
);
fs.ensureDirSync(mediaPath);
const productStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, mediaPath);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

export const productUpload = multer({
  storage: productStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "application/octet-stream",
    ];
    const allowedExtensions = /jpeg|jpg|png|/;

    const extname = allowedExtensions.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimetype = allowedMimeTypes.includes(file.mimetype);

    if (mimetype && (extname || file.mimetype === "application/octet-stream")) {
      return cb(null, true);
    } else {
      cb(
        new Error(
          "Only .png, .jpg, .jpeg, or application/octet-stream files are allowed!"
        )
      );
    }
  },
});

const bomPath = path.join(
  process.cwd(),
  "media-folder",
  "product_bom"
);
fs.ensureDirSync(bomPath);

// Storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, bomPath); // folder
  },
  filename: (req, file, cb) => {
    const uniqueName = generateTimeBasedPrefixedUUID("PBOM") + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

// File filter (only PDF allowed)
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    "application/pdf",   // PDFs
    "image/jpeg",
    "image/png",
    "image/jpg",
    "image/webp"
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only PDF and Image files are allowed"), false);
  }
};

export const uploadBOM = multer({
  storage,
  fileFilter
});

const companyStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const storagePath = "media-folder/company_image/temp";
    fs.ensureDirSync(storagePath);
    cb(null, storagePath); // Directory where uploaded files will be stored
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname)); // Unique filename with timestamp
  },
});

export const companyUpload = multer({
  storage: companyStorage,
  fileFilter: (req, file, cb) => {
    const imageMimeTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "application/octet-stream",
    ];
    const imageExtensions = /jpeg|jpg|png/;
    const pdfMimeTypes = ["application/pdf", "application/octet-stream"];
    const pdfExtensions = /pdf/;

    const fileExt = path.extname(file.originalname).toLowerCase();
    const isImage =
      imageMimeTypes.includes(file.mimetype) && imageExtensions.test(fileExt);
    const isPDF =
      pdfMimeTypes.includes(file.mimetype) && pdfExtensions.test(fileExt);
    if (file.fieldname === "header_img") {
      if (!isImage) {
        return cb(
          new Error("Invalid file format. Only PDF allowed for catalog.")
        );
      }
      if (file.size > 25 * 1024 * 1024) {
        return cb(new Error("PDF size exceeds 25MB limit."));
      }
    } else if (file.fieldname === "footer_img") {
      if (!isImage) {
        return cb(
          new Error("Invalid file format. Only PDF allowed for catalog.")
        );
      }
      if (file.size > 25 * 1024 * 1024) {
        return cb(new Error("PDF size exceeds 25MB limit."));
      }
    } else if (file.fieldname === "company_logo") {
      if (!isImage) {
        return cb(
          new Error("Invalid file format. Only PDF allowed for catalog.")
        );
      }
      if (file.size > 25 * 1024 * 1024) {
        return cb(new Error("PDF size exceeds 25MB limit."));
      }
    } else if (file.fieldname === "banner_img_one") {
      if (!isImage) {
        return cb(
          new Error("Invalid file format. Only Image Allowed For Banner.")
        );
      }
      if (file.size > 25 * 1024 * 1024) {
        return cb(new Error("PDF size exceeds 25MB limit."));
      }
    } else if (file.fieldname === "banner_img_two") {
      if (!isImage) {
        return cb(
          new Error("Invalid file format. Only Image Allowed For Banner.")
        );
      }
      if (file.size > 25 * 1024 * 1024) {
        return cb(new Error("PDF size exceeds 25MB limit."));
      }
    } else if (file.fieldname === "catalog_pdf") {
      if (!isPDF) {
        return cb(
          new Error("Invalid file format. Only PDF allowed for catalog.")
        );
      }
      if (file.size > 25 * 1024 * 1024) {
        return cb(new Error("PDF size exceeds 25MB limit."));
      }
    }

    cb(null, true);
  },
});


//
const visitingCardStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const storagePath = "media-folder/visiting_card_image/temp";
    fs.ensureDirSync(storagePath);
    cb(null, storagePath); // Directory where uploaded files will be stored
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname)); // Unique filename with timestamp
  },
});

export const visitingCard = multer({
  storage: visitingCardStorage,
  fileFilter: (req, file, cb) => {
    const imageMimeTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "application/octet-stream",
    ];
    const imageExtensions = /jpeg|jpg|png/;
    const pdfMimeTypes = ["application/pdf", "application/octet-stream"];
    const pdfExtensions = /pdf/;

    const fileExt = path.extname(file.originalname).toLowerCase();
    const isImage =
      imageMimeTypes.includes(file.mimetype) && imageExtensions.test(fileExt);
    const isPDF =
      pdfMimeTypes.includes(file.mimetype) && pdfExtensions.test(fileExt);
    if (file.fieldname === "front") {
      if (!isImage) {
        return cb(
          new Error("Invalid file format. Only PDF allowed for catalog.")
        );
      }
      if (file.size > 25 * 1024 * 1024) {
        return cb(new Error("PDF size exceeds 25MB limit."));
      }
    } else if (file.fieldname === "back") {
      if (!isImage) {
        return cb(
          new Error("Invalid file format. Only PDF allowed for catalog.")
        );
      }
      if (file.size > 25 * 1024 * 1024) {
        return cb(new Error("PDF size exceeds 25MB limit."));
      }
    }

    cb(null, true);
  },
});

const visitStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const storagePath = "media-folder/visit_image";
    fs.ensureDirSync(storagePath);
    cb(null, storagePath);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});


export const visitUpload = multer({
  storage: visitStorage,
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 20,
  },
  fileFilter: (req, file, cb) => {

    const allowedMimeTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",

      "application/pdf",

      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",

      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",

      "text/plain",
      "application/zip",
      "application/x-zip-compressed",
      "application/octet-stream",
    ];

    const allowedExtensions =
      /jpeg|jpg|png|webp|pdf|doc|docx|xls|xlsx|txt|zip/;

    const extnameValid = allowedExtensions.test(
      path.extname(file.originalname).toLowerCase()
    );

    const mimeTypeValid = allowedMimeTypes.includes(file.mimetype);

    if (mimeTypeValid && extnameValid) {
      cb(null, true);
    } else {
      cb(
        new Error(
          "Invalid file format."
        )
      );
    }
  },
}).fields([
  { name: "visit_image", maxCount: 1 },

  { name: "visit_column_attechments_1", maxCount: 1 },
  { name: "visit_column_attechments_2", maxCount: 1 },
  { name: "visit_column_attechments_3", maxCount: 1 },
  { name: "visit_column_attechments_4", maxCount: 1 },
  { name: "visit_column_attechments_5", maxCount: 1 },
]);

const taskStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const storagePath = "media-folder/task_attechment";
    fs.ensureDirSync(storagePath);
    cb(null, storagePath);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

export const taskUpload = multer({
  storage: taskStorage,
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 10,
  },
  fileFilter: (req, file, cb) => {

    const allowedMimeTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",

      "application/pdf",

      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",

      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",

      "text/plain",
      "application/zip",
      "application/x-zip-compressed",
      "application/octet-stream",
    ];

    // Allowed extensions
    const allowedExtensions =
      /jpeg|jpg|png|webp|pdf|doc|docx|xls|xlsx|txt|zip/;

    const extnameValid = allowedExtensions.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimeTypeValid = allowedMimeTypes.includes(file.mimetype);
    if (mimeTypeValid && extnameValid) {
      cb(null, true); // Accept the file
    } else {
      cb(
        new Error(
          "Invalid file format. Please upload a JPEG, JPG and PNG file."
        )
      );
    }
  },
}).fields([
  { name: "task_attechment", maxCount: 1 },

  { name: "task_column_attechments_1", maxCount: 1 },
  { name: "task_column_attechments_2", maxCount: 1 },
  { name: "task_column_attechments_3", maxCount: 1 },
  { name: "task_column_attechments_4", maxCount: 1 },
  { name: "task_column_attechments_5", maxCount: 1 },
]);

const storeStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const storagePath = "media-folder/store_ticket_attachment";
    fs.ensureDirSync(storagePath);
    cb(null, storagePath);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

export const storeUpload = multer({
  storage: storeStorage,
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 10,
  },
  fileFilter: (req, file, cb) => {

    const allowedMimeTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "application/pdf",
      "application/octet-stream",
    ];
    // Allowed extensions
    const allowedExtensions = /jpeg|jpg|png|/;

    const extnameValid = allowedExtensions.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimeTypeValid = allowedMimeTypes.includes(file.mimetype);
    if (mimeTypeValid && extnameValid) {
      cb(null, true); // Accept the file
    } else {
      cb(
        new Error(
          "Invalid file format. Please upload a JPEG, JPG and PNG file."
        )
      );
    }
  },
}).single("task_attechment");

const callHistoryStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const tempDir = path.join("media-folder", "call_recording");
    fs.ensureDirSync(tempDir);
    cb(null, tempDir);
  },
  filename: function (req, file, cb) {
    const safeName = `${Date.now()}_${file.originalname.replace(/\s+/g, "_")}`;
    cb(null, safeName);
  },
});

export const callHistoryUpload = multer({
  storage: callHistoryStorage,
  limits: {
    fileSize: 100 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();

    const allowedTypes = [".mp3", ".m4a", ".wav", ".ogg"];

    if (allowedTypes.includes(ext)) {

      cb(null, true);
    } else {
      cb(new Error(`Only ${allowedTypes.join(", ")} files are allowed`), false);
    }
  },
}).fields([{ name: "call_recording", maxCount: 1000000 }]);


const wpStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const storagePath = "media-folder/whatsapp_chat_media";
    fs.ensureDirSync(storagePath);
    cb(null, storagePath);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname)); // Unique filename with timestamp
  },
});



export const whatsappUpload = multer({
  storage: wpStorage,
  fileFilter: (req, file, cb) => {

    const imageMimeTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "application/octet-stream",
    ];
    const imageExtensions = /jpeg|jpg|png/;
    const pdfMimeTypes = ["application/pdf", "application/octet-stream"];
    const pdfExtensions = /pdf/;

    const fileExt = path.extname(file.originalname).toLowerCase();
    const isImage =
      imageMimeTypes.includes(file.mimetype) && imageExtensions.test(fileExt);
    const isPDF =
      pdfMimeTypes.includes(file.mimetype) && pdfExtensions.test(fileExt);
    if (file.fieldname === "image") {
      if (!isImage) {
        return cb(
          new Error("Invalid file format. Only PDF allowed for catalog.")
        );
      }
      if (file.size > 25 * 1024 * 1024) {
        return cb(new Error("PDF size exceeds 25MB limit."));
      }
    } else if (file.fieldname === "pdf") {
      if (!isPDF) {
        return cb(
          new Error("Invalid file format. Only PDF allowed for catalog.")
        );
      }
      if (file.size > 25 * 1024 * 1024) {
        return cb(new Error("PDF size exceeds 25MB limit."));
      }
    }
    cb(null, true);

  },
})


export const visitingCardUpload = multer({
  storage: companyStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!['.jpg', '.jpeg', '.png'].includes(ext)) {
      return cb(new Error('Only JPG/PNG images allowed'));
    }
    cb(null, true);
  },
});




const orderAttachmentmediaPath = path.join(
  process.cwd(),
  "media-folder",
  "cart_attachment"
);

fs.ensureDirSync(orderAttachmentmediaPath);

const orderAttachmentStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, orderAttachmentmediaPath);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

export const orderAttachmentUpload = multer({
  storage: orderAttachmentStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "application/pdf",
    ];

    // Allowed extensions
    const allowedExtensions = /jpeg|jpg|png|pdf/;

    const extname = allowedExtensions.test(
      path.extname(file.originalname).toLowerCase()
    );

    const mimetype = allowedMimeTypes.includes(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error("Only .png, .jpg, .jpeg, .pdf files are allowed!"));
    }
  },
});


const bulkMailSenderMediaPath = path.join(
  process.cwd(),
  "media-folder",
  "bulk-mail-sender-files"
);
fs.ensureDirSync(bulkMailSenderMediaPath);
const bulkMailSenderStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, bulkMailSenderMediaPath);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

export const bulkemailSenderFromData = multer({
  storage: bulkMailSenderStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "application/pdf",
      "application/octet-stream",
    ];
    const allowedExtensions = /jpeg|jpg|png|pdf|/;

    const extname = allowedExtensions.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimetype = allowedMimeTypes.includes(file.mimetype);

    if (mimetype && (extname || file.mimetype === "application/octet-stream")) {
      return cb(null, true);
    } else {
      cb(
        new Error(
          "Only .png, .jpg, .jpeg, pdf or application/octet-stream files are allowed!"
        )
      );
    }
  },
});


const campaignAttachmentPath = path.join(
  process.cwd(),
  "media-folder",
  "campaign"
);

fs.ensureDirSync(campaignAttachmentPath);

const campaignAttachmentStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, campaignAttachmentPath);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

export const campaignAttachment = multer({
  storage: campaignAttachmentStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "application/pdf",
    ];

    // Allowed extensions
    const allowedExtensions = /jpeg|jpg|png|pdf/;

    const extname = allowedExtensions.test(
      path.extname(file.originalname).toLowerCase()
    );

    const mimetype = allowedMimeTypes.includes(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error("Only .png, .jpg, .jpeg, .pdf files are allowed!"));
    }
  },
});

const whatsappTemplateStaticAttachmentPath = path.join(
  process.cwd(),
  "media-folder",
  "whatsapp-template"
);

fs.ensureDirSync(whatsappTemplateStaticAttachmentPath);

const whatsappTemplateAttachmentStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, whatsappTemplateStaticAttachmentPath);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

export const whatsappTemplateAttachment = multer({
  storage: whatsappTemplateAttachmentStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "application/pdf",
    ];

    // Allowed extensions
    const allowedExtensions = /jpeg|jpg|png|pdf/;

    const extname = allowedExtensions.test(
      path.extname(file.originalname).toLowerCase()
    );

    const mimetype = allowedMimeTypes.includes(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error("Only .png, .jpg, .jpeg, .pdf files are allowed!"));
    }
  },
});

const supportChatStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const tempDir = path.join("media-folder", "task_history_attachment", "temp");
    fs.ensureDirSync(tempDir);
    cb(null, tempDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '_' + Math.floor(Math.random() * 1e9);
    const safeName = `${uniqueSuffix}_${file.originalname.replace(/\s+/g, "_")}`;
    cb(null, safeName);
  },
});

export const supportChatUpload = multer({
  storage: supportChatStorage,
  limits: {
    fileSize: 50 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      "image/jpeg", "image/jpg", "image/png", "image/webp",
      "application/pdf",
      "video/mp4", "video/mpeg", "video/ogg", "video/webm", "video/quicktime",
      "application/octet-stream"
    ];
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExtensions = /jpeg|jpg|png|webp|pdf|mp4|mpeg|ogg|webm|mov/;

    if (allowedMimeTypes.includes(file.mimetype) || allowedExtensions.test(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file format. Only images, PDFs, and videos are allowed."));
    }
  }
}).single("attachment");
