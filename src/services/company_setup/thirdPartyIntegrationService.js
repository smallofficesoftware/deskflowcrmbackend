import axios from "axios";
import crypto from "crypto";
import { JSDOM } from "jsdom";
import moment from "moment";
import nodemailer from "nodemailer";
import Razorpay from "razorpay";
import { Sequelize } from "sequelize";
import XLSX from "xlsx";
import admin from "../../helpers/fireBaseConfig.js";
import { createTransporter } from "../../middlewares/nodemailer.js";
import { applicationLoginTypeRightModel } from "../../models/application_login/applicationLoginTypeRightModel.js";
import loginModel from "../../models/application_login/loginModel.js";
import companyModel from "../../models/company_setup/companyModel.js";
import tenantMasterModel from "../../models/configuration/tenantMasterModel.js";
import { categoryModel } from "../../models/product_settings/categoryModel.js";
import { productModel } from "../../models/product_settings/productModel.js";
import { socketConnectionsModel } from "../../models/socketConnectionsModel.js";
import { getCompanyDetailByLoginId } from "../../services/commonServices.js";
import {
  EMAIL_SEND_TO_SUPER_ADMIN_EMAIL_ID,
  JOB_CREATOR_WEBSITE_URL,
  MAIL_SETTING_HOST_NAME,
  MAIL_SETTING_HOST_PORT,
  MAIL_SETTING_HOST_USER_NAME,
  MAIL_SETTING_HOST_USER_PASSWORD,
  RAZORPAY_KEY_ID,
  RAZORPAY_KEY_SECRET,
  SUPER_ADMIN_WHATSAPP_APP_KEY,
  SUPER_ADMIN_WHATSAPP_AUTH_KEY,
  WEBSITE_FROM_ADMIN_MAIL_ID,
  WEBSITE_FROM_ADMIN_MOBILE_NUMBER,
  WPP_CONNECT_CONNECTION_TYPE
} from "../../utils/appConstants.js";
import { PAGE_ID } from "../../utils/AppEnumeration.js";
import {
  resBadRequest,
  resError,
  resSuccess
} from "../../utils/sharedFunctions.js";
import axiosInstanceForWhatsApp from "../../utils/whatsappAxiosInstance.js";
import { getCompanyByLoginId } from "../commonServices.js";

export const addProductByExcelSheet = async (req, res) => {
  // --------------------------------------------------- 1. File & login
  if (!req.file) {
    return resBadRequest({
      ack_msg: "No file uploaded",
      developer_msg: "No file provided in the request",
    });
  }

  const { a_application_login_id } = req.body;
  if (!a_application_login_id) {
    return resBadRequest({
      ack_msg: "Missing authentication details",
      developer_msg: "a_application_login_id is required",
    });
  }

  const findCompanyId = await getCompanyByLoginId(a_application_login_id);
  if (!findCompanyId?.company_masters_id) {
    return resBadRequest({
      ack_msg: "Invalid company ID",
      developer_msg: "Could not retrieve company ID for the provided login ID",
    });
  }

  const formattedDate = moment().format("YYYY-MM-DD HH:mm:ss");

  // --------------------------------------------------- 2. Product-type map
  const productTypeMap = {
    "Packaging Materials": 1,
    "Spare Parts": 2,
    "Tools and Equipment": 3,
    "Raw Material Inventory": 4,
    "Finished Goods": 5,
    "Capital Goods": 6,
    "Work-in-Progress (WIP)": 7,
    "Services and Maintenance": 8,
    "Service Parts": 9,
    Miscellaneous: 10,
    "Inventory Adjustments": 11,
    "Repair Parts": 12,
    Prototype: 13,
    "Returns/Defective Goods": 14,
    Samples: 15,
    "Warranty Parts": 16,
    "Sub-assemblies": 17,
    "Consumable Supplies": 18,
    "Freight and Shipping Materials": 19,
    "Project Materials": 20,
  };

  // --------------------------------------------------- 3. Read Excel
  let workbook, worksheet, data;
  try {
    workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    if (sheetName !== "Sheet1") {
      return resError({
        ack_msg: "Data must be in Sheet1",
        developer_msg: `Invalid sheet name: ${sheetName}. Expected: Sheet1`,
      });
    }
    worksheet = workbook.Sheets[sheetName];
    data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  } catch (e) {
    return resBadRequest({
      ack_msg: "Failed to read Excel file",
      developer_msg: e.message,
    });
  }

  // --------------------------------------------------- 4. Column validation
  const expectedColumns = [
    "category_name",
    "product_types",
    "product_name",
    "product_alias",
    "product_code",
    "product_description",
    "unit_name",
    "weight(gram)",
    "min_stock_quantity",
    "max_stock_quantity",
    "rate",
    "gst",
    "hsn_code",
  ];

  const header = data[0] || [];
  const columnsOk = expectedColumns.every(
    (col, idx) => header[idx] && header[idx].trim() === col
  );

  if (!columnsOk) {
    return resError({
      ack_msg: "Invalid column names or order in Excel file",
      developer_msg: `Expected: ${expectedColumns.join(
        ", "
      )}. Found: ${header.join(", ")}`,
    });
  }

  const rows = data.slice(1);
  if (rows.length === 0) {
    return resError({
      ack_msg: "Excel sheet is empty",
      developer_msg: "No data rows found in Sheet1",
    });
  }

  // --------------------------------------------------- 5. DB models & caches
  const CTproductModel = productModel(req.tenantDB);
  const CTcategoryModel = categoryModel(req.tenantDB);

  const [existingProducts, existingCategories] = await Promise.all([
    CTproductModel.findAll({
      where: {
        isDelete: 0,
        a_application_login_id,
        company_masters_id: findCompanyId.company_masters_id,
      },
    }),
    CTcategoryModel.findAll({
      where: {
        isDelete: 0,
        a_application_login_id,
        company_masters_id: findCompanyId.company_masters_id,
      },
    }),
  ]);

  // Fast look-up caches
  const productNameCache = {};   // {categoryId: Set<lowerCaseName>}
  const productCodeSet = new Set();

  existingProducts.forEach((p) => {
    const lcName = p.product_name.toLowerCase();
    if (!productNameCache[p.category_id]) productNameCache[p.category_id] = new Set();
    productNameCache[p.category_id].add(lcName);

    if (p.product_code) productCodeSet.add(p.product_code.toLowerCase());
  });

  const categoryCache = {};
  existingCategories.forEach((c) => {
    categoryCache[c.category_name.trim().toLowerCase()] = c.id;
  });


  const processedProducts = [];
  const invalidEntries = [];

  for (let i = 0; i < rows.length; i++) {
    const entry = rows[i];
    const rowNumber = i + 2;


    const hasValue = entry.some((cell) => cell != null && cell !== "");
    if (!hasValue) continue;


    const [
      rawCategory,
      rawProdType,
      rawProdName,
      rawAlias,
      rawCode,
      rawDesc,
      rawUnit,
      rawWeight,
      rawMin,
      rawMax,
      rawRate,
      rawGst,
      rawHsn,
    ] = entry;

    if (!rawCategory || !rawProdType || !rawProdName) {
      invalidEntries.push(
        `Row ${rowNumber}: Missing required fields (category_name / product_types / product_name)`
      );
      continue;
    }

    // ---- product type -----------------------------------------------
    const normProdType = String(rawProdType)
      .trim()
      .replace(/\s+/g, " ")
      .split(" ")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");

    const productTypeId = productTypeMap[normProdType];
    if (!productTypeId) {
      invalidEntries.push(
        `Row ${rowNumber}: Invalid product type "${rawProdType}". Allowed: ${Object.keys(
          productTypeMap
        ).join(", ")}`
      );
      continue;
    }

    // ---- category ---------------------------------------------------
    const normCategory = String(rawCategory).trim();
    let categoryId = categoryCache[normCategory.toLowerCase()];

    if (!categoryId) {
      try {
        const newCat = await CTcategoryModel.create({
          company_masters_id: findCompanyId.company_masters_id,
          a_application_login_id,
          category_name: normCategory,
          color: "#4C4C4C",
          created_date_time: formattedDate,
        });
        categoryId = newCat.id;
        categoryCache[normCategory.toLowerCase()] = categoryId;
      } catch (e) {
        invalidEntries.push(`Row ${rowNumber}: Failed to create category – ${e.message}`);
        continue;
      }
    }

    // ---- product name uniqueness (same category) --------------------
    const lcProdName = String(rawProdName).trim().toLowerCase();
    if (
      productNameCache[categoryId] &&
      productNameCache[categoryId].has(lcProdName)
    ) {
      invalidEntries.push(
        `Row ${rowNumber}: Product "${rawProdName}" already exists in category "${normCategory}"`
      );
      continue;
    }

    // ---- product code uniqueness (global) ---------------------------
    const prodCode = rawCode ? String(rawCode).trim() : "";
    if (prodCode) {
      const lcCode = prodCode.toLowerCase();
      if (productCodeSet.has(lcCode)) {
        invalidEntries.push(
          `Row ${rowNumber}: Product code "${prodCode}" already exists in the system`
        );
        continue;
      }

      // also check duplicates **inside the current batch**
      const alreadyInBatch = processedProducts.some(
        (p) => p.product_code?.toLowerCase() === lcCode
      );
      if (alreadyInBatch) {
        invalidEntries.push(
          `Row ${rowNumber}: Duplicate product code "${prodCode}" within the Excel file`
        );
        continue;
      }
    }

    // ---- numeric fields ---------------------------------------------
    const rate = parseFloat(rawRate);
    const gst = parseFloat(rawGst);

    if (isNaN(rate) || isNaN(gst) || rate < 0 || gst < 0) {
      invalidEntries.push(
        `Row ${rowNumber}: Invalid rate (${rawRate}) or gst (${rawGst})`
      );
      continue;
    }

    const netRate = rate + (rate * gst) / 100;

    // ---- build object ------------------------------------------------
    processedProducts.push({
      company_masters_id: findCompanyId.company_masters_id,
      a_application_login_id,
      product_types: productTypeId,
      product_name: String(rawProdName).trim(),
      category_id: categoryId,
      product_alias: rawAlias ? String(rawAlias).trim() : "",
      product_code: prodCode,
      product_description: rawDesc ? String(rawDesc).trim() : "",
      unit: rawUnit ? String(rawUnit).trim() : "",
      weight_or_size: rawWeight ? String(rawWeight).trim() : "",
      min_stock_quantity: rawMin ? parseInt(rawMin, 10) || 0 : 0,
      max_stock_quantity: rawMax ? parseInt(rawMax, 10) || 0 : 0,
      rate,
      GST: gst,
      hsn_code: rawHsn ? String(rawHsn).trim() : "",
      net_rate: netRate,
      created_date_time: formattedDate,
      product_barcode_number: Date.now() + i, // unique per row
    });

    // ---- update caches for next rows --------------------------------
    if (!productNameCache[categoryId]) productNameCache[categoryId] = new Set();
    productNameCache[categoryId].add(lcProdName);
    if (prodCode) productCodeSet.add(prodCode.toLowerCase());
  }

  // --------------------------------------------------- 7. No valid rows?
  if (processedProducts.length === 0) {
    return resError({
      ack_msg: "Product AllReady exists In system",
      developer_msg:
        invalidEntries.length > 0 ? invalidEntries.join("; ") : "All rows were empty or invalid",
    });
  }

  // --------------------------------------------------- 8. Product-limit check
  const userList = await CTproductModel.findAll({
    where: {
      company_masters_id: findCompanyId.company_masters_id,
      a_application_login_id,
      isDelete: 0,
    },
    attributes: ["id"],
  });

  const applicationLoginTypeRightModelIntance = applicationLoginTypeRightModel(req.tenantDB);
  const userRightsList = await applicationLoginTypeRightModelIntance.findAll({
    where: {
      company_masters_id: findCompanyId.company_masters_id,
      page_id: PAGE_ID.PRODUCT,
      isDelete: 0,
    },
    attributes: ["a_application_login_id", "a_page_id_rights_jason"],
  });

  for (const right of userRightsList) {
    try {
      const json = JSON.parse(right.a_page_id_rights_jason || "{}");
      if (typeof json.limit === "number" && json.limit > 0) {
        if (userList.length + processedProducts.length > json.limit) {
          return resError({
            ack_msg: "Your Product Limit Exceeded",
            developer_msg: `Limit ${json.limit} would be exceeded`,
          });
        }
      }
    } catch (e) {
      console.error("JSON parse error for rights:", e);
    }
  }

  // --------------------------------------------------- 9. Bulk insert
  try {
    const created = await CTproductModel.bulkCreate(processedProducts, {
      validate: true,
      individualHooks: true,
    });

    return resSuccess({
      code: 200,
      ack: 1,
      ack_msg: `Successfully imported ${created.length} product(s)${invalidEntries.length ? `. Issues: ${invalidEntries.join("; ")}` : ""
        }`,
      developer_msg:
        invalidEntries.length
          ? `Imported ${created.length} with ${invalidEntries.length} issue(s)`
          : "All products imported successfully",
      data: created.map((c) => c.get({ plain: true })),
    });
  } catch (bulkErr) {
    return resError({
      ack_msg: "Failed to import some products",
      developer_msg: `Bulk create error: ${bulkErr.message}`,
    });
  }
};

export const addPlanByRrazorpay = async (req) => {
  const { companyId, planId, amount } = req.body;

  const razorpay = new Razorpay({
    key_id: `${RAZORPAY_KEY_ID}`,
    key_secret: `${RAZORPAY_KEY_SECRET}`,
  });

  const payment_capture = 1;
  const currency = "INR";
  const currentTimestamp = Date.now();

  const options = {
    amount: parseInt(amount),
    currency,
    receipt: currentTimestamp.toString(),
    payment_capture,
  };

  try {
    const response = await razorpay.orders.create(options);
    return resSuccess({
      data: { item: response },
    });
  } catch (error) {
    console.error("Error reading credentials file:", error.error);

    return resError({
      ack_msg: "something  went wrong",
      developer_msg: `Error ${error.error.description ? error.error.description : error
        }`,
    });
  }
};

export const razorpayPaymentVerify = async (req) => {
  try {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature } =
      req.body;

    const secret = RAZORPAY_KEY_SECRET;
    const generatedSignature = crypto
      .createHmac("sha256", secret)
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest("hex");

    if (generatedSignature === razorpay_signature) {
      return resSuccess();
    } else {
      return resError({
        ack_msg: "Payment is not verfied",
        developer_msg: "Payment is not verfied",
      });
    }
  } catch (error) {
    console.error("Error verifying payment:", error);
    return resBadRequest({ developer_msg: `Error ${error}` });
  }
};
export function htmlToFormat(html) {
  const codes = { BR: "\r\n", STRONG: "*", EM: "_", STRIKE: "~" };
  const dom = new JSDOM(html);
  const { document } = dom.window;
  const body = document.body;

  const dfs = ({ childNodes }) =>
    Array.from(childNodes, (node) => {
      if (node.nodeType === 1) {
        const s = dfs(node);
        const code = codes[node.tagName];
        return code
          ? s.replace(/^(\s*)(?=\S)|(?<=\S)(\s*)$/g, `$1${code}$2`)
          : s;
      } else {
        return node.textContent;
      }
    }).join("");

  return dfs(body);
}

function normalizeIndiaPrefixMinimal(rawNumber) {
  if (!rawNumber) return rawNumber;
  const digits = rawNumber.replace(/\D/g, '');
  return digits.length === 10 ? `91${digits}` : digits;
}

export const addContactByWhatsApps = async (
  req,
  whatsappReqestFlag,
  atteched_file,
  contact_master_number,
  contact_history_message,
  a_application_login_id,
  superAdminWhatsAppKey,
  superAdminWhatsappAuthKey,
  uploadedFile
) => {
  const whatsAppSocket = req.app.get('whatsAppSocket');
  contact_history_message = htmlToFormat(contact_history_message);
  try {
    let whatsAppKey;
    let whatsappAuthKey;
    let recovery_email;
    if (whatsappReqestFlag == "otp") {
      whatsAppKey = superAdminWhatsAppKey;
      whatsappAuthKey = superAdminWhatsappAuthKey;
      let findWhatsappApiKeyFromApplication = await loginModel.findOne({
        where: {
          id: a_application_login_id,
          isDelete: "0",
        },
        attributes: ["id", "recovery_email", "registration_flag"],
      });
      recovery_email =
        findWhatsappApiKeyFromApplication.dataValues.recovery_email;
    } else {
      let findWhatsappApiKeyFromApplicationLogin = await loginModel.findOne({
        where: {
          id: a_application_login_id,
          isDelete: "0",
        },
        attributes: [
          "id",
          "whatsapp_authkey",
          "whatsapp_appkey",
          "recovery_email",
          "registration_flag",
        ],
      });
      whatsAppKey =
        findWhatsappApiKeyFromApplicationLogin.dataValues.whatsapp_appkey;
      whatsappAuthKey =
        findWhatsappApiKeyFromApplicationLogin.dataValues.whatsapp_authkey;
      recovery_email =
        findWhatsappApiKeyFromApplicationLogin.dataValues.recovery_email;
    }
    const company_id = await getCompanyByLoginId(a_application_login_id);
    const whatsappNumber = normalizeIndiaPrefixMinimal(contact_master_number);
    const basePayload = {
      sessionName: `a${company_id.a_application_login_id}_c${company_id.company_masters_id}`,
      numbers: [whatsappNumber],
      text: contact_history_message,
      // type: atteched_file
      //   ? (/\.(jpe?g|jpg|png|gif|webp|bmp|svg|heic)(\?.*)?$/i.test(atteched_file) ? "image" : "document")
      //   : "text",
      caption: contact_history_message,
      mediaUrls: [atteched_file],
    };
    const whatsAppPayload = basePayload;
    // basePayload.type === "document"
    //   ? { ...basePayload, documentFileName: uploadedFile.originalname, options: { mimetype: uploadedFile.mimetype } }
    //   : basePayload;
    if (WPP_CONNECT_CONNECTION_TYPE === "socketIO") {
      const socketConn = await socketConnectionsModel().findOne({
        where: {
          a_application_logins_id: company_id.a_application_login_id,
          company_masters_id: company_id.company_masters_id,
        },
      });
      if (socketConn && socketConn.socket_id && socketConn.socket_id.length > 0) {
        try {
          whatsAppSocket.to(socketConn.socket_id).emit("send-any-message", whatsAppPayload);
        } catch (error) {
          socket.emit("socket-error:send-any-message", {
            message: "Failed to send Message",
            data: whatsAppPayload,
            error: error.message || "Unexpected error",
          });
        }
      }
    } else if (WPP_CONNECT_CONNECTION_TYPE === "api") {
      try {
        const response = await axiosInstanceForWhatsApp.post(`/messages/send-message`, whatsAppPayload);
        return resSuccess({
          ack: 1,
          data: { response: response.data },
          developer_msg: "Message sent to whatsapp successfully",
        });
      } catch (error) {

        console.log("Failed to send message using WPPConnect: ", error?.response.data?.error || error?.response.data?.message);
        return resError({
          data: { error: error?.response.data?.error || error?.response.data?.message },
          developer_msg: "WhatsApp is not connected",
        });
      } finally {
        console.log("hello wppconnect end");
      }
    }
    if (findWhatsappApiKeyFromApplication.dataValues.registration_flag != 2) {
      if (whatsappReqestFlag === "otp") {
        if (recovery_email) {
          const transporter = nodemailer.createTransport({
            host: MAIL_SETTING_HOST_NAME,
            port: MAIL_SETTING_HOST_PORT,
            secure: true,
            auth: {
              user: MAIL_SETTING_HOST_USER_NAME,
              pass: MAIL_SETTING_HOST_USER_PASSWORD,
            },
          });
          transporter.verify(async function (error, success) {
            if (success) {
              try {
                const mailOptions = {
                  from: MAIL_SETTING_HOST_USER_NAME,
                  to: recovery_email,
                  subject: "Your OTP Code",
                  html: `${contact_history_message}`,
                };
                await transporter.sendMail(mailOptions);
              } catch (err) {
                console.error("Error sending email:", err);
              }
            } else {
              console.error("Error  email:", error);
            }
          });
        }
      }
    }
  } catch (error) {
    return resBadRequest({ developer_msg: "WhatsApp is not connected" });
  }
};

export const messageMailSend = async (req) => {
  const { email, subject, message, ccEmail, applicationLoginId, folder } = req;
  const a_application_login_id = applicationLoginId;
  const useGmail = false;
  try {
    // Step 1: Create the transporter
    const transporter = await createTransporter(a_application_login_id);
    // Step 2: Verify the transporter
    try {
      await transporter.verify();
    } catch (error) {
      console.error("Transporter verification failed:", error.message);
      return resBadRequest({
        ack_msg: `${error.message} The email is not verified. Please contact the company administrator for assistance with the email setup.`,
        developer_msg: `${error.message} The email is not verified. Please contact the company administrator for assistance with the email setup.`,
      });

    }

    // Build the basic mail options
    const formattedMessage = Array.isArray(message)
      ? [...new Set(message)].join("") // Remove duplicates and join
      : String(message || "");
    const findCompanyEmail = await getCompanyDetailByLoginId(
      Number(applicationLoginId)
    );
    const findLoginEmail = await loginModel.findOne({
      where: { id: applicationLoginId },
      attributes: ["mail_id_setup"],
    });

    const mailOptions = {
      from:
        findLoginEmail.dataValues !== ""
          ? findLoginEmail.dataValues.mail_id_setup
          : findCompanyEmail.mail_id_setup,
      to: email,
      subject: subject || "",
      html: formattedMessage || "",
    };

    // Conditionally add cc if provided
    if (ccEmail) {
      mailOptions.cc = ccEmail;
    }

    // Conditionally add attachments if a file is uploaded
    if (folder) {
      mailOptions.attachments = [
        {
          filename: folder.originalname,
          path: folder.path,
        },
      ];
    }

    // Step 3: Send the email
    const info = await transporter.sendMail(mailOptions);

    return resSuccess({
      data: info.messageId,
      developer_msg: "Email sent successfully",
    });
  } catch (error) {
    console.error("Error sending email:", error);
    return resBadRequest({
      developer_msg: `Error ${error}`,
    });
  }
};

const sendSingalNotification = async (deviceToken, title, body) => {
  const message = {
    notification: {
      title,
      body,
    },
    token: deviceToken,
    data: {
      tag: tag || `msg_${Date.now()}`,
    },
    webpush: {
      headers: {
        TTL: "3600",
        Urgency: "high",
      },
    },
  };

  try {
    const response = await admin.messaging().send(message);
    return response;
  } catch (error) {
    console.error("Error sending message:", error);
    throw new Error(`Failed to send notification: ${error.message}`);
  }
};

export const sendMultipleNotification = async ({
  deviceTokens,
  title,
  body,
  data,
  notification_modual,
}) => {
  const uniqueDeviceTokens = [...new Set(deviceTokens)];
  const results = [];

  for (const token of uniqueDeviceTokens) {
    const message = {
      token,
      notification: {
        title,
        body,
      },
      data: {
        ...data,
        title: String(title),
        body: String(body),
        notification_modual: String(notification_modual || ""),
        // url: "/support-ticket", // 👈 for redirect
      },
      webpush: {
        headers: {
          TTL: "3600",
          Urgency: "high",
        },
        notification: {
          icon: "https://app.smalloffice.in/favicon.png",
        },
      },
    };

    try {
      const response = await sendWithRetry(message);
      results.push({ token, success: true, response });
    } catch (error) {
      console.error(`❌ Failed for token ${token}`, error.message);
      results.push({ token, success: false, error: error.message });
    }
  }

  return results;
};

const sendWithRetry = async (message, attempt = 1) => {
  try {
    return await admin.messaging().send(message);
  } catch (err) {
    const isNetworkError =
      err?.errorInfo?.code === "messaging/app/network-error" ||
      err?.message?.includes("GOAWAY");

    if (isNetworkError && attempt <= 3) {
      console.warn(` Retry attempt ${attempt}...`);
      await new Promise(res => setTimeout(res, 500 * attempt));
      return sendWithRetry(message, attempt + 1);
    }

    throw err;
  }
};


export const giminiAiChatAPI = async (req, res) => {
  let tenantSequelize = null;

  try {
    const { prompt, execute, a_application_login_id } = req.body;

    // Validate input
    if (!prompt || !a_application_login_id) {
      return resError({
        ack_msg: "No company found for the provided application login ID",
        developer_msg: "No company found for the provided application login ID",
        status: 404,
      });
    }

    const findCompanyId = await getCompanyByLoginId(a_application_login_id);

    // 1. Get tenant DB credentials
    const tenantList = await tenantMasterModel.findAll({
      where: {
        company_masters_id: findCompanyId.company_masters_id,
        isDelete: 0,
      },
      attributes: [
        "db_host",
        "db_user",
        "db_password",
        "db_name",
        "application_login_name",
        "a_application_login_id",
      ],
    });

    // 1. Get tenant DB credentials

    if (!tenantList || tenantList.length === 0) {
      return resError({
        ack_msg: "Tenant not found",
        developer_msg: "Tenant not found",
        status: 404,
      });
    }

    const tenant = tenantList[0].dataValues;

    // 2. Connect to tenant DB dynamically using Sequelize
    tenantSequelize = new Sequelize(
      tenant.db_name,
      tenant.db_user,
      tenant.db_password,
      {
        host: tenant.db_host,
        dialect: "mysql",
        timezone: "+05:30",
        define: { timestamps: false },
        pool: { max: 20, min: 0, acquire: 30000, idle: 10000 },
        logging: false,
      }
    );

    const [schemaData] = await tenantSequelize.query(
      `
      SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = ?
    ORDER BY TABLE_NAME, ORDINAL_POSITION
    `,
      { replacements: [tenant.db_name] }
    );

    const schema = schemaData.reduce(
      (acc, { TABLE_NAME, COLUMN_NAME, COLUMN_TYPE }) => {
        if (!acc[TABLE_NAME]) acc[TABLE_NAME] = [];
        acc[TABLE_NAME].push(`${COLUMN_NAME} ${COLUMN_TYPE}`);
        return acc;
      },
      {}
    );

    const schemaText = Object.entries(schema)
      .map(([table, columns]) => `TABLE ${table}: \n  ${columns.join("\n  ")}`)
      .join("\n\n");

    const promptForGemini = `
Generate MySQL query for: ${prompt}

Database schema:
${schemaText}

Return ONLY the SQL query with no explanations.
    `.trim();

    let query = "";
    const geminiApi = await companyModel.findOne({
      where: {
        a_application_login_id: tenant.a_application_login_id,
        isDelete: 0,
      },
      attributes: ["gimini_appkey"],
    });
    const geminiApiKey =
      geminiApi?.dataValues?.gimini_appkey || process.env.GEMINI_API_KEY;
    if (!geminiApiKey)
      return resError({
        ack_msg: "Gemini API key not found",
        developer_msg: "Gemini API key not found",
        status: 400,
        data: { geminiApiKey },
      });

    try {
      const geminiRes = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
        {
          contents: [{ parts: [{ text: promptForGemini }] }],
        },
        { timeout: 10000 }
      );

      query = geminiRes.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      query = query.replace(/```sql|```/g, "").trim();

    } catch (apiError) {
      console.error("Gemini API error:", apiError);
      const status = apiError.response ? apiError.response.status : 500;
      const errorData = apiError.response
        ? apiError.response.data
        : apiError.message;
      return resError({
        ack_msg: "Gemini API error",
        developer_msg: errorData,
        status: status,
        data: apiError,
      });
    }

    // 5. Execute query if requested
    let results = [];
    if (query && execute) {
      try {
        const lowerQuery = query.trim().toLowerCase();

        // Block dangerous queries
        const forbidden = ["drop", "truncate", "delete from"];
        if (forbidden.some((word) => lowerQuery.includes(word))) {
          return resError({
            ack_msg: "Query contains restricted operations",
            developer_msg: "Query contains restricted operations",
          });
        }

        // Execute query
        results = await tenantSequelize.query(query, {
          type: Sequelize.QueryTypes.SELECT,
        });
      } catch (executionError) {
        console.error("Error executing query:", executionError);
        return resError.json({
          message: "Query execution failed",
          error: executionError.message,
        });
      }
    }

    // 6. Return result
    return resSuccess({
      data: {
        query,
        results,
        tenant: tenant.application_login_name,
      },
    });
  } catch (e) {
    console.error(" Error in giminiAiChatAPI:", e);
    return resError({
      message: "Internal server error",
      error: e.message,
    });
  } finally {
    if (tenantSequelize) {
      await tenantSequelize.close();
      console.log("Closed tenant DB connection");
    }
  }
};

export const ClaudeOfficeWhatsAppOtp = async (otp, mobileNumber) => {

  /*   let data = JSON.stringify({
      "phone_number": `91${mobileNumber}`,
      "whatsapp_phone_number_id": "69ec692b893450d8459cd215",
      "provider": "baileys",
      "connection_id": "69ec692b893450d8459cd215",
      "message": `Dear user\n\nYour OTP: *${otp}*\n\n*Deskflow Systems Pvt. Ltd.*`,
      "messageType": "text"
    });
  
    let config = {
      method: 'post',
      maxBodyLength: Infinity,
      url: 'https://wadmin.smalloffice.in/api/whatsapp/send',
      headers: {
        'Accept': 'application/json',
        'X-API-Key': '073d7bc4f77fda530bf8bb5b95361466d29b64dbd36cf645fd3ad334467411ee',
        'Content-Type': 'application/json',
      },
      data: data
    };
  
    axios.request(config)
      .then((response) => {
        console.log(JSON.stringify(response.data));
      })
      .catch((error) => {
        console.log(error);
      }); */

  try {
    const url = "https://graph.facebook.com/v22.0/827939777072779/messages";
    const accessToken =
      "EAAN61k69Xd0BPyonghHLfW1BffgZAZC4alHlaxR6lm4bpLcS0M799QGCFm0rZCJIIlFmqidlJhjr4xGIiMXRFdCuJmIF2K1wzTji8epm0d8fko4yZAAsLnoebxNv8wasTGF01FSQjZBMmoqBcS1tl8F0U7N1iemoyojSvBlRu528IOJTd8MZB2xmgAzuGUvljorwZDZD";
    const payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: mobileNumber,
      type: "template",
      template: {
        name: "small_office_otp",
        language: {
          code: "en",
        },
        components: [
          {
            type: "body",
            parameters: [
              {
                type: "text",
                text: otp,
              },
            ],
          },
          {
            type: "button",
            sub_type: "url",
            index: "0",
            parameters: [
              {
                type: "text",
                text: otp,
              },
            ],
          },
        ],
      },
    };
    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });
    return resSuccess({
      data: response.data,
    });
  } catch (error) {
    return resError({
      message: "Internal server error",
      error: "Failed to send WhatsApp message",
    });
  }
};

export const toSendMail = async (req) => {
  try {
    if (req.body.request_flag === 1) {
      //book demo form
      const {
        name,
        email,
        business_category,
        contact_number,
        book_date,
        book_time,
        comments,
        agreeToTerms,
      } = req.body;


      try {
        const transporter = await createTransporter();

        try {
          await transporter.verify();
        } catch (error) {
          console.error(
            "Transporter verification failed:",
            error.message,
            error.stack
          );
          return resError({
            ack_msg: "Email server verification failed.",
            developer_msg: `Transporter verification failed: ${error.message}`,
          });
        }

        const senderEmail = EMAIL_SEND_TO_SUPER_ADMIN_EMAIL_ID;
        const businessCategoryObj = {
          SP: "Service Provider",
          TR: "Trader",
          RT: "Retailer",
          MF: "Manufacturer",
        };
        const adminMailOptions = {
          from: senderEmail,
          to: `${WEBSITE_FROM_ADMIN_MAIL_ID}`,
          subject: "Demo Inquiry",
          html: `
        <h3>Demo Inquiry</h3>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Business Category:</strong> ${businessCategoryObj[business_category] || "N/A"
            }</p>
        <p><strong>Contact Number:</strong> ${contact_number || "N/A"}</p>
        <p><strong>Booking Date:</strong> ${book_date || "N/A"}</p>
        <p><strong>Booking Time:</strong> ${book_time || "N/A"}</p>
        <p><strong>Comments:</strong> ${comments || "N/A"}</p>
        <p><strong>Agreed to Terms:</strong> ${agreeToTerms ? "Yes" : "No"}</p>
      `,
        };

        const userMailOptions = {
          from: senderEmail,
          to: email,
          subject: "Demo Booking Inquiry – Deskflow CRM.",
          html: `
    <p>Dear Customer,</p>

    <p>Thank you for booking a demo of <strong>Deskflow CRM</strong>.</p>

    <p>
      Our team will contact you soon to schedule and conduct your demo.  
      We look forward to showing you how Deskflow CRM can support your business operations.
    </p>

    <p>If you need any assistance before the demo, feel free to reach out:</p>
    <p>
      Sales: sales@deskflowcrm.com<br>
      Support: support@deskflowcrm.com<br>
      Phone: +91 81600 02447
    </p>

    <p style="margin-top: 15px;">Warm regards,<br>
    <strong>Deskflow CRM Team</strong></p>
  `,
        };

        const info = await transporter.sendMail(adminMailOptions);
        await transporter.sendMail(userMailOptions);

        return resSuccess({
          data: info.messageId,
          developer_msg: "Email sent successfully",
        });
      } catch (error) {
        return resBadRequest({
          developer_msg: `Error sending email: ${error.message}`,
        });
      }
    } else {
      //Contact Us form
      const {
        name,
        email,
        company_name,
        country,
        contact_number,
        website,
        comments,
        agreeToTerms,
        business_category,
        city,
      } = req.body;


      try {
        const transporter = await createTransporter();

        try {
          await transporter.verify();
        } catch (error) {
          console.error(
            "Transporter verification failed:",
            error.message,
            error.stack
          );
          return resError({
            ack_msg: "Email server verification failed.",
            developer_msg: `Transporter verification failed: ${error.message}`,
          });
        }
        const businessCategoryObj = {
          SP: "Service Provider",
          TR: "Trader",
          RT: "Retailer",
          MF: "Manufacturer",
        };
        const senderEmail = EMAIL_SEND_TO_SUPER_ADMIN_EMAIL_ID;

        const adminMailOptions = {
          from: senderEmail,
          to: `${WEBSITE_FROM_ADMIN_MAIL_ID}`,
          subject: "Contact Form",
          /*  html: `
           <h3>Demo Inquiry</h3>
           <p><strong>Name:</strong> ${name}</p>
           <p><strong>Email:</strong> ${email}</p>
           <p><strong>Company Name:</strong> ${company_name || "N/A"}</p>
           <p><strong>Country:</strong> ${country || "N/A"}</p>
           <p><strong>Contact Number:</strong> ${contact_number || "N/A"}</p>
           <p><strong>Website Link:</strong> ${website || "N/A"}</p>
           <p><strong>Comments:</strong> ${comments || "N/A"}</p>
           <p><strong>Agreed to Terms:</strong> ${agreeToTerms ? "Yes" : "No"}</p>
         `,
           }; */

          html: `
          <h3>Demo Inquiry</h3>
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Contact Number:</strong> ${contact_number || "N/A"}</p>
          <p><strong>Business Name:</strong> ${company_name || "N/A"}</p>
          <p><strong>Business Category:</strong> ${businessCategoryObj[business_category] || "N/A"
            }</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>City:</strong> ${city}</p>
          <p><strong>Comments:</strong> ${comments || "N/A"}</p>
          <p><strong>Agreed to Terms:</strong> ${agreeToTerms ? "Yes" : "No"
            }</p>
        `,
        };

        const userMailOptions = {
          from: senderEmail,
          to: email,
          subject: "Thank you for Inquiry at – Deskflow CRM",
          html: `
    <p>Dear Customer,</p>

    <p>Thank you for your inquiry at <strong>Deskflow CRM</strong>.</p>

    <p>
      Our team will contact you soon to schedule and conduct your demo.  
      We look forward to showing you how Deskflow CRM can support your business operations.
    </p>

    <p>If you need any assistance before the demo, feel free to reach out to us:</p>
    <p>
      Sales: sales@deskflowcrm.com<br>
      Support: support@deskflowcrm.com<br>
      Phone: +91 81600 02447
    </p>

    <p style="margin-top: 15px;">Warm regards,<br>
    <strong>Deskflow CRM Team</strong></p>
  `,
        };


        const info = await transporter.sendMail(adminMailOptions);
        await transporter.sendMail(userMailOptions);

        return resSuccess({
          data: info.messageId,
          developer_msg: "Email sent successfully",
        });
      } catch (error) {
        console.error("Error sending email:", error.message, error.stack);
        return resBadRequest({
          developer_msg: `Error sending email: ${error.message}`,
        });
      }
    }
  } catch (error) {
    resBadRequest({
      ack_msg: `Error: ${error}`,
    });
  }
};

export const toSendWhatsapp = async (req) => {
  try {
    if (req.body.request_flag === 1) {
      //book demo
      const {
        name,
        email,
        business_category,
        contact_number,
        book_date,
        comments,
        agreeToTerms,
      } = req.body;

      try {
        const sendwhatsAppKey = SUPER_ADMIN_WHATSAPP_APP_KEY;
        const sendwhatsappAuthKey = SUPER_ADMIN_WHATSAPP_AUTH_KEY;

        let userResponse = await axios.post(`${JOB_CREATOR_WEBSITE_URL}`, {
          appkey: `${sendwhatsAppKey}`,
          authkey: `${sendwhatsappAuthKey}`,
          to: `${contact_number}`,
          message: `Thank you for booking demo of Small Office CRM, We will contact you soon.`,
        });

        let adminResponse = await axios.post(`${JOB_CREATOR_WEBSITE_URL}`, {
          appkey: sendwhatsAppKey,
          authkey: sendwhatsappAuthKey,
          to: `${WEBSITE_FROM_ADMIN_MOBILE_NUMBER}`,
          message: `Demo Inquiry\n\n Name: ${name}\n Email: ${email}\n Company Name: ${company_name || "N/A"
            }\n Country: ${country || "N/A"}\n Contact Number: ${contact_number || "N/A"
            }\n Website Link: ${website || "N/A"}\n Comments: ${comments || "N/A"
            }\nAgreed to Terms: ${agreeToTerms ? "Yes" : "No"}`,
        });

        return resSuccess({
          data: { item: userResponse.data },
          developer_msg: "Message sent to whatsapp successfully",
        });
      } catch (error) {
        return resBadRequest({
          ack_msg: `Error code: ${error}`,
        });
      }
    } else {
      //Contact Us form
      const {
        name,
        email,
        company_name,
        country,
        contact_number,
        website,
        comments,
        agreeToTerms,
      } = req.body;

      try {
        const sendwhatsAppKey = SUPER_ADMIN_WHATSAPP_APP_KEY;
        const sendwhatsappAuthKey = SUPER_ADMIN_WHATSAPP_AUTH_KEY;

        let userResponse = await axios.post(`${JOB_CREATOR_WEBSITE_URL}`, {
          appkey: `${sendwhatsAppKey}`,
          authkey: `${sendwhatsappAuthKey}`,
          to: `${contact_number}`,
          message: `Thank you for Contact Us, We will contact you soon.`,
        });

        let adminResponse = await axios.post(`${JOB_CREATOR_WEBSITE_URL}`, {
          appkey: sendwhatsAppKey,
          authkey: sendwhatsappAuthKey,
          to: `${WEBSITE_FROM_ADMIN_MOBILE_NUMBER}`,
          message: `Demo Inquiry\n\n Name: ${name}\n Email: ${email}\n Company Name: ${company_name || "N/A"
            }\n Country: ${country || "N/A"}\n Contact Number: ${contact_number || "N/A"
            }\n Website Link: ${website || "N/A"}\n Comments: ${comments || "N/A"
            }\nAgreed to Terms: ${agreeToTerms ? "Yes" : "No"}`,
        });

        return resSuccess({
          data: { item: userResponse.data },
          developer_msg: "Message sent to whatsapp successfully",
        });
      } catch (error) {
        return resBadRequest({
          ack_msg: `Error: ${error}`,
        });
      }
    }
  } catch (error) {
    return resBadRequest({
      ack_msg: `Error: ${error}`,
    });
  }
};
