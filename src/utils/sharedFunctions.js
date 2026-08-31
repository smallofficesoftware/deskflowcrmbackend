import crypto from "crypto";
import fs from "fs-extra";
import moment from "moment";
import os from "os";
import { Op } from "sequelize";
import { cartModel } from "../models/activities/cartsModel.js";
import companyModel from "../models/company_setup/companyModel.js";
import { customFieldFormModel } from "../models/other_settings/customFieldFormModel.js";
import { CUSTOM_FORM_FEILD_LIMIT } from "./appConstants.js";

export const resSuccess = (payload) => {
  return {
    code: payload?.code || 200,
    ack: 1,
    ack_msg: payload?.ack_msg || "DEFAULT_STATUS_SUCCESS",
    developer_msg: payload?.developer_msg || "working good",
    data: payload?.data || [],
  };
};

export const resError = (payload) => {
  return {
    code: payload?.code || 200,
    ack: payload?.ack || 0,
    status: payload?.status || "DEFAULT_STATUS_ERROR",
    ack_msg: payload?.ack_msg || "UNKNOWN_ERROR_TRY_AGAIN",
    developer_msg: payload?.developer_msg || "goods",
    data: payload?.data || [],
  };
};
export const rescallhistory = (payload) => {
  return {
    code: payload?.code || 200,
    ack: payload?.ack || 2,
    status: payload?.status || "DEFAULT_STATUS_SUCCESS",
    ack_msg: payload?.ack_msg || "DEFAULT_STATUS_SUCCESS",
    developer_msg: payload?.developer_msg || "goods",
    data: payload?.data || [],
  };
};

export const resUnauthorizedAccess = (payload) => {
  return {
    //"UNAUTHORIZED_ACCESS_CODE"
    code: payload?.code || 401,
    status: payload?.status || DEFAULT_STATUS_ERROR,
    message: payload?.message || UNAUTHORIZED_ACCESS_MESSAGE,
    data: payload?.data || null,
  };
};

export const resUnknownError = (payload) => {
  return {
    code: payload?.code || DEFAULT_STATUS_CODE_ERROR,
    status: payload?.status || DEFAULT_STATUS_ERROR,
    message: payload?.message || UNKNOWN_ERROR_TRY_AGAIN,
    data: payload?.data || null,
  };
};

export const resBadRequest = (payload) => {
  return {
    // code: payload?.code || 500,
    // status: payload?.status || "errr",
    // message: payload?.message || "eerr",
    // data: payload?.data || null,
    ack: payload?.ack || 0,
    code: payload?.code || 500,
    // status: payload?.status || "DEFAULT_STATUS_ERROR",
    ack_msg: payload?.ack_msg || "UNKNOWN_ERROR_TRY_AGAIN",
    developer_msg: payload?.developer_msg || "Data base error",
    data: payload?.data || [],
  };
};

export const resNotFound = (payload) => {
  return {
    code: payload?.code || NOT_FOUND_CODE,
    status: payload?.status || DEFAULT_STATUS_ERROR,
    message: payload?.message || NOT_FOUND_MESSAGE,
    data: payload?.data || null,
  };
};
export function compareDate(myDateStr) {
  // Return 0 if input is an invalid placeholder date
  if (myDateStr === "0000-00-00") {
    return 0;
  }

  // Parse input and current date (YYYY-MM-DD format)
  const myDate = new Date(myDateStr);
  const today = new Date();

  // Format both dates to only contain the date part (ignore time)
  const myDateOnly = new Date(myDate.toISOString().split("T")[0]);
  const todayOnly = new Date(today.toISOString().split("T")[0]);

  if (myDateOnly.getTime() === todayOnly.getTime()) {
    return 0; // Equal
  } else if (myDateOnly.getTime() > todayOnly.getTime()) {
    return 1; // myDate is in the future
  } else {
    return 1; // myDate is in the past
  }
}

export function excelDateToJSDate(serial) {
  const excelEpoch = new Date(1899, 11, 30); // Excel's epoch date
  const msPerDay = 24 * 60 * 60 * 1000; // milliseconds in a day

  // Separate date and time parts
  const days = Math.floor(serial); // integer part (date)
  const timeFraction = serial - days; // decimal part (time)

  // Calculate JavaScript date and add time as a fraction of a day
  const jsDate = new Date(
    excelEpoch.getTime() + days * msPerDay + timeFraction * msPerDay
  );

  return jsDate;
}
export function generateMD5(input) {
  return crypto.createHash("md5").update(input).digest("hex");
}

export function generateOTP(length) {
  const characters = "0123456789";
  let otp = "";
  for (let i = 0; i < length; i++) {
    otp += characters[Math.floor(Math.random() * characters.length)];
  }
  return otp;
}

// Email Body Generator
export const generateEmailMessage = ({
  otp,
  userName = "Customer",
  sender = "Deskflow Systems Private Limited",
  additionalMessage = "",
}) => {
  return `
    <p>Dear ${userName},</p>

    <p>
      To verify your email and complete your Deskflow CRM onboarding process, please use the One-Time Password (OTP) given below:
    </p>

    <p>Your OTP: <strong>${otp}</strong></p>

    <p>This OTP is valid for the next <strong>10 minutes</strong>.<br>
    Please do not share it with anyone for security reasons.</p>

    ${additionalMessage
      ? `<p>${additionalMessage}</p>`
      : ""
    }

    <p>If you did not request this verification, please ignore this email.</p>

    <p>For any assistance, feel free to contact us:</p>
    <p>
      Sales: sales@deskflowcrm.com<br>
      Support: support@deskflowcrm.com<br>
      Phone: +91 81600 02447
    </p>

    <p>Thank you for choosing <strong>Deskflow CRM</strong>.</p>

    <p style="font-style: italic;">Warm regards,<br />${sender}</p>
  `;
};

export const generateEmailDeleteAccount = ({
  otp,
  userName = "Customer",
  sender = "Deskflow Systems Private Limited",
  additionalMessage = "",
}) => {
  return `
    <p>Dear ${userName},</p>

    <p>
      If you want to delete your account from Deskflow CRM, please use the One-Time Password (OTP) provided below to confirm your request.
    </p>
 

    <p>Your OTP: <strong>${otp}</strong></p>

    <p>This OTP is valid for the next <strong>10 minutes</strong>.<br>
    Please do not share it with anyone for security reasons.</p>

    ${additionalMessage
      ? `<p>${additionalMessage}</p>`
      : ""
    }

    <p>If you did not request this verification, please ignore this email.</p>

    <p>For any assistance, feel free to contact us:</p>
    <p>
      Sales: sales@deskflowcrm.com<br>
      Support: support@deskflowcrm.com<br>
      Phone: +91 81600 02447
    </p>

    <p>Thank you for choosing <strong>Deskflow CRM</strong>.</p>

    <p style="font-style: italic;">Warm regards,<br />${sender}</p>
  `;
};
export const generateTextWhatsAppOTPMessage = ({
  otp,
  userName = "User",
  sender = "Small Office Pvt. Ltd.",
}) => {
  return `Dear ${userName},\nYour OTP: <strong>${otp}</strong>\n - ${sender}`;
};

export const sanitizeObjectOfNull = (obj) => {
  const sanitized = { ...obj }; // Create a shallow copy of the object
  Object.keys(sanitized).forEach((key) => {
    if (sanitized[key] === null) {
      sanitized[key] = ""; // Replace null with an empty string
    }
  });
  return sanitized;
};

export const formatDateAndTimeCreateDateTime = (dateTime) => {
  return moment(dateTime).format("DD-MM-YYYY HH:mm:ss");
};
export const formatDateAndTimeCreateDateTimeV2 = (dateTime) => {
  return moment(dateTime).format("DD-MM-YYYY hh:mm:ss A");
};
export const formatDateCustom = (dateTime) => {
  return moment(dateTime).format("DD-MM-YYYY");
};

export const formatDateWithoutDash = (dateTime) => {
  return moment(dateTime).format("DDMMYYYY");
};

export const getFinancialYearRangeWise = (date) => {
  const givenDate = new Date(date);
  const year = givenDate.getFullYear();
  const month = givenDate.getMonth() + 1;

  if (month >= 4) {
    return {
      start_date: `${year}-04-01`,
      end_date: `${year + 1}-03-31`,
    };
  } else {
    return {
      start_date: `${year - 1}-04-01`,
      end_date: `${year}-03-31`,
    };
  }
};

// const getFinancialYear = (date) => {
//   const givenDate = new Date(date);
//   const year = givenDate.getFullYear();
//   const month = givenDate.getMonth() + 1;

//   if (month >= 4) {
//     return `${year}-${year + 1}`;
//   } else {
//     return `${year - 1}-${year}`;
//   }
// };

export const getFinancialYear = (date, shortFormat = false) => {
  const givenDate = new Date(date);
  const year = givenDate.getFullYear();
  const month = givenDate.getMonth() + 1;

  let startYear, endYear;

  if (month >= 4) {
    startYear = year;
    endYear = year + 1;
  } else {
    startYear = year - 1;
    endYear = year;
  }

  // flag based format
  if (shortFormat) {
    return `${startYear.toString().slice(-2)}-${endYear
      .toString()
      .slice(-2)}`;
  }

  // default format
  return `${startYear}-${endYear}`;
};


const getFirstPrefix = (value) => {
  if (!value) return null;
  return String(value).split(",")[0].trim();
};

export const getNumberSeries = async (
  company_id,
  order_type_flag,
  date,
  sr_by_prifix,
  req,
  custom_sr_number = null
) => {
  let pattern;
  const is_temp = false;

  const arr = {};
  const companyMasterWhere = {
    isDelete: 0,
    id: company_id,
  };
  // // Fetch prefix from `company_brand_master`
  const prefixResult = await companyModel.findOne({
    attributes: [
      "invoice_prefix",
      "order_prefix",
      "quotation_prefix",
      "purchase_prefix",
      "purchase_ord_prefix",
      "return_sales_invoice_prefix",
      "return_purchase_invoice_prefix",
      "inward_prefix",
      "dispatch_prefix",
      "invoice_series_pattern",
      "order_series_pattern",
      "return_sales_invoice_series_pattern",
      "quotation_series_pattern",
      "purchase_series_pattern",
      "return_purchase_invoice_series_pattern",
      "purchase_ord_series_pattern",
      "inward_series_pattern",
      "dispatch_series_pattern",
      "proforma_invoice_prefix",
      "proforma_invoice_series_pattern",
    ],
    where: companyMasterWhere,
  });
  let prefix;
  if (prefixResult) {
    switch (Number(order_type_flag)) {
      case 1:
        if (sr_by_prifix == null || sr_by_prifix == undefined || sr_by_prifix == '' || sr_by_prifix == ' ') {

          prefix = sr_by_prifix || getFirstPrefix(prefixResult?.dataValues?.quotation_prefix);
        } else {

          prefix = sr_by_prifix || prefixResult?.dataValues?.quotation_prefix;
        }
        pattern = prefixResult?.dataValues?.quotation_series_pattern;
        break;
      case 2:
        if (sr_by_prifix == null || sr_by_prifix == undefined || sr_by_prifix == '' || sr_by_prifix == ' ') {
          prefix = sr_by_prifix || getFirstPrefix(prefixResult?.dataValues?.order_prefix);
        } else {
          prefix = sr_by_prifix || prefixResult?.dataValues?.order_prefix;
        }
        pattern = prefixResult?.dataValues?.order_series_pattern;
        break;
      case 3:
        if (sr_by_prifix == null || sr_by_prifix == undefined || sr_by_prifix == '' || sr_by_prifix == ' ') {
          prefix = sr_by_prifix || getFirstPrefix(prefixResult?.dataValues?.invoice_prefix);
        } else {
          prefix = sr_by_prifix || prefixResult?.dataValues?.invoice_prefix;
        }
        pattern = prefixResult?.dataValues?.invoice_series_pattern;
        break;
      case 4:
        if (sr_by_prifix == null || sr_by_prifix == undefined || sr_by_prifix == '' || sr_by_prifix == ' ') {
          prefix = sr_by_prifix || getFirstPrefix(prefixResult?.dataValues?.purchase_prefix);
        } else {
          prefix = sr_by_prifix || prefixResult?.dataValues?.purchase_prefix;
        }
        pattern = prefixResult?.dataValues?.purchase_series_pattern;
        break;
      case 5:
        if (sr_by_prifix == null || sr_by_prifix == undefined || sr_by_prifix == '' || sr_by_prifix == ' ') {
          prefix = sr_by_prifix || getFirstPrefix(prefixResult?.dataValues?.purchase_ord_prefix);
        } else {
          prefix = sr_by_prifix || prefixResult?.dataValues?.purchase_ord_prefix;
        }
        pattern = prefixResult?.dataValues?.purchase_ord_series_pattern;
        break;
      case 6:
        if (sr_by_prifix == null || sr_by_prifix == undefined || sr_by_prifix == '' || sr_by_prifix == ' ') {
          prefix = sr_by_prifix || getFirstPrefix(prefixResult?.dataValues?.return_sales_invoice_prefix);
        } else {
          prefix = sr_by_prifix || prefixResult?.dataValues?.return_sales_invoice_prefix;
        }
        pattern = prefixResult?.dataValues?.return_sales_invoice_series_pattern;
        break;
      case 7:
        if (sr_by_prifix == null || sr_by_prifix == undefined || sr_by_prifix == '' || sr_by_prifix == ' ') {
          prefix = sr_by_prifix || getFirstPrefix(prefixResult?.dataValues?.return_purchase_invoice_prefix);
        } else {
          prefix = sr_by_prifix || prefixResult?.dataValues?.return_purchase_invoice_prefix;
        }
        pattern = prefixResult?.dataValues?.return_purchase_invoice_series_pattern;
        break;
      case 8:
        if (sr_by_prifix == null || sr_by_prifix == undefined || sr_by_prifix == '' || sr_by_prifix == ' ') {
          prefix = sr_by_prifix || getFirstPrefix(prefixResult?.dataValues?.inward_prefix);
        } else {
          prefix = sr_by_prifix || prefixResult?.dataValues?.inward_prefix;
        }
        pattern = prefixResult?.dataValues?.inward_series_pattern;
        break;
      case 9:
        if (sr_by_prifix == null || sr_by_prifix == undefined || sr_by_prifix == '' || sr_by_prifix == ' ') {
          prefix = sr_by_prifix || getFirstPrefix(prefixResult?.dataValues?.dispatch_prefix);
        } else {
          prefix = sr_by_prifix || prefixResult?.dataValues?.dispatch_prefix;
        }
        pattern = prefixResult?.dataValues?.dispatch_series_pattern;
        break;
      case 12:
        if (sr_by_prifix == null || sr_by_prifix == undefined || sr_by_prifix == '' || sr_by_prifix == ' ') {
          prefix = sr_by_prifix || getFirstPrefix(prefixResult?.dataValues?.proforma_invoice_prefix);
        } else {
          prefix = sr_by_prifix || prefixResult?.dataValues?.proforma_invoice_prefix;
        }
        pattern = prefixResult?.dataValues?.proforma_invoice_series_pattern;
        break;
      default:
        "XXX";
    }
  } else {
    return resError({
      ack_msg: "Prefix is not found",
      developer_msg: "There is no prefix",
    });
  }


  let where = {
    isDelete: 0,
    type: order_type_flag,
    company_masters_id: company_id,
    sr_by_prifix: prefix
  };


  if (is_temp) {
    arr.sr_by_number = 0;
    arr.cart_number = "TEMP/XXXX";
  } else {
    const financialYearDetail = getFinancialYearRangeWise(date);

    const start_date = financialYearDetail?.start_date || null;
    const end_date = financialYearDetail?.end_date || null;

    if (!start_date || !end_date) {
      throw new Error("Invalid financial year details");
    }


    const start = `${start_date} 00:00:00`;
    const end = `${end_date} 23:59:59`;

    where.update_Date_time = {
      [Op.gte]: start,
      [Op.lte]: end,
    };

    const CATModel = cartModel(req.tenantDB);
    const maxSrByNoResult = await CATModel.max("sr_by_number", { where });

    let maxSrByNo = maxSrByNoResult ? maxSrByNoResult + 1 : 1;
    if (custom_sr_number) {
      maxSrByNo = custom_sr_number
    }
    arr.sr_by_no = maxSrByNo;
    arr.sr_by_prifix = prefix;

    const pattern_obj = {
      "1": prefix,
      "2": String(maxSrByNo).padStart(2, "0"),
      "3A": getFinancialYear(date),
      "3a": getFinancialYear(date, true),
    };

    let final_pattern_string = `${prefix}/${String(maxSrByNo).padStart(
      2,
      "0"
    )}/${getFinancialYear(date)}`;

    if (isValid(pattern) && pattern !== "0") {
      final_pattern_string = pattern.replace(
        /3A|3a|1|2/g,
        (match) => pattern_obj[match]
      );
    }

    arr.order_no = final_pattern_string;
  }

  return arr;
};

const orderTypesCustomInquiryList = [
  { id: "1", order_type_display: "number" },
  { id: "2", order_type_display: "text" },
  { id: "3", order_type_display: "text_area" },
  { id: "4", order_type_display: "date" },
  { id: "5", order_type_display: "date_and_time" },
  { id: "6", order_type_display: "time" },
  { id: "7", order_type_display: "switch" },
  { id: "8", order_type_display: "decimal" },
  { id: "9", order_type_display: "dropdown" },
  { id: "10", order_type_display: "radio" },
  { id: "11", order_type_display: "page_text" },
  { id: "12", order_type_display: "page_url" },
  { id: "13", order_type_display: "attechments" },
  { id: "14", order_type_display: "designer_page" },
];



export const getColumnName = async ({ dataType, companyId, formType, req }) => {
  const findDataTypeName =
    orderTypesCustomInquiryList.find(
      (option) => Number(option.id) === Number(dataType)
    )?.order_type_display || "";
  const findDataTypeNameId =
    orderTypesCustomInquiryList.find(
      (option) => Number(option.id) === Number(dataType)
    )?.id || "";

  const CFFModel = customFieldFormModel(req.tenantDB);
  const findColumCount = await CFFModel.findAll({
    where: {
      company_masters_id: companyId,
      data_type: Number(findDataTypeNameId),
      form_type: Number(formType),
      isDelete: 0,
    },
    attributes: ["id", "reference_column_name"],
    raw: true,
  });

  const usedNumbers = new Set(
    findColumCount
      .map(item => {
        const match = item.reference_column_name.match(/_(\d+)$/);
        return match ? match[1] : null;
      })
      .filter(Boolean)
  );

  const firstAvailable = CUSTOM_FORM_FEILD_LIMIT.find(num => !usedNumbers.has(num));


  // return findColumCount.custom_field_form_masters.dataValues
  if (firstAvailable >= 6 || firstAvailable == undefined) {
    return 1;
  } else {
    if (Number(formType) === 1) {
      const findColum = `cntc_column_${findDataTypeName}_${firstAvailable}`;
      return findColum;
    } else if (Number(formType) === 2) {
      const findColum = `column_${findDataTypeName}_${firstAvailable}`;
      return findColum;
    } else if (Number(formType) === 3) {
      const findColum = `visit_column_${findDataTypeName}_${firstAvailable}`;
      return findColum;
    } else if (Number(formType) === 4) {
      const findColum = `products_column_${findDataTypeName}_${firstAvailable}`;
      return findColum;
    } else if (Number(formType) === 5) {
      const findColum = `carts_column_${findDataTypeName}_${firstAvailable}`;
      return findColum;
    } else if (Number(formType) === 6) {
      const findColum = `carts_column_${findDataTypeName}_${firstAvailable}`;
      return findColum;
    } else if (Number(formType) === 7) {
      const findColum = `carts_column_${findDataTypeName}_${firstAvailable}`;
      return findColum;
    } else if (Number(formType) === 8) {
      const findColum = `carts_column_${findDataTypeName}_${firstAvailable}`;
      return findColum;
    } else if (Number(formType) === 9) {
      const findColum = `carts_column_${findDataTypeName}_${firstAvailable}`;
      return findColum;
    } else if (Number(formType) === 10) {
      const findColum = `carts_column_${findDataTypeName}_${firstAvailable}`;
      return findColum;
    } else if (Number(formType) === 11) {
      const findColum = `carts_column_${findDataTypeName}_${firstAvailable}`;
      return findColum;
    } else if (Number(formType) === 12) {
      const findColum = `carts_column_${findDataTypeName}_${firstAvailable}`;
      return findColum;
    } else if (Number(formType) === 13) {
      const findColum = `carts_column_${findDataTypeName}_${firstAvailable}`;
      return findColum;
    } else if (Number(formType) === 14) {
      const findColum = `task_column_${findDataTypeName}_${firstAvailable}`;
      return findColum;
    } else if (Number(formType) === 15) {
      const findColum = `task_column_${findDataTypeName}_${firstAvailable}`;
      return findColum;
    } else if (Number(formType) === 16) {
      const findColum = `carts_column_${findDataTypeName}_${firstAvailable}`;
      return findColum;
    }
  }
};
export const getNetworkDetails = async () => {
  const networkInterfaces = os.networkInterfaces();
  let macAddress = "";
  let ipAddress = "";

  for (const interfaceName in networkInterfaces) {
    const networkInfo = networkInterfaces[interfaceName];

    if (networkInfo) {
      for (const net of networkInfo) {
        if (!net.internal && net.family === "IPv4") {
          macAddress = net.mac;
          ipAddress = net.address;
          return { macAddress, ipAddress };
        }
      }
    }
  }

  return { macAddress: "Not found", ipAddress: "Not found" };
};

export const formatNumber = (number, decimals = 2) => {
  return Number(number).toFixed(decimals);
};
const currencyConfigs = {
  INR: { scales: ["", "Thousand", "Lakh", "Crore"], suffix: "Rupees" },
  USD: { scales: ["", "Thousand", "Million", "Billion"], suffix: "Dollars" },
  EUR: { scales: ["", "Thousand", "Million", "Billion"], suffix: "Euros" },
  GBP: { scales: ["", "Thousand", "Million", "Billion"], suffix: "Pounds" },
  JPY: { scales: ["", "Thousand", "Million", "Billion"], suffix: "Yen" },
};

// export const numberToWordsCurrency = (num, currency) => {
//   const config = currencyConfigs[currency];

//   if (!config) {
//     throw new Error(`Unsupported currency: ${currency}`);
//   }

//   const { scales, suffix, subSuffix = "Paise" } = config; // Add subSuffix like "Paise" or "Cents"

//   const units = [
//     "",
//     "One",
//     "Two",
//     "Three",
//     "Four",
//     "Five",
//     "Six",
//     "Seven",
//     "Eight",
//     "Nine",
//   ];
//   const teens = [
//     "Ten",
//     "Eleven",
//     "Twelve",
//     "Thirteen",
//     "Fourteen",
//     "Fifteen",
//     "Sixteen",
//     "Seventeen",
//     "Eighteen",
//     "Nineteen",
//   ];
//   const tens = [
//     "",
//     "",
//     "Twenty",
//     "Thirty",
//     "Forty",
//     "Fifty",
//     "Sixty",
//     "Seventy",
//     "Eighty",
//     "Ninety",
//   ];

//   const numberToWords = (n) => {
//     if (n === 0) return "";

//     let word = "";
//     const hundreds = Math.floor(n / 100);
//     const remainder = n % 100;
//     const tensValue = Math.floor(remainder / 10);
//     const unitsValue = remainder % 10;

//     if (hundreds > 0) {
//       word += units[hundreds] + " Hundred ";
//     }

//     if (remainder >= 10 && remainder < 20) {
//       word += teens[remainder - 10];
//     } else {
//       if (tensValue > 0) {
//         word += tens[tensValue] + " ";
//       }
//       if (unitsValue > 0) {
//         word += units[unitsValue];
//       }
//     }

//     return word.trim();
//   };

//   // Split integer and fractional part
//   const whole = Math.floor(num);
//   const fraction = Math.round((num - whole) * 100);

//   // Convert whole number
//   const chunks = [];
//   let scaleIndex = 0;
//   let tempWhole = whole;

//   while (tempWhole > 0) {
//     chunks.push(tempWhole % 1000);
//     tempWhole = Math.floor(tempWhole / 1000);
//   }

//   let word = "";
//   for (let i = 0; i < chunks.length; i++) {
//     const chunkWords = numberToWords(chunks[i]);
//     if (chunkWords) {
//       word = chunkWords + (scales[i] ? " " + scales[i] : "") + " " + word;
//     }
//   }

//   let result = word.trim() + ` ${suffix}`;

//   // Add fractional/decimal part (paise, cents, etc.)
//   if (fraction > 0) {
//     result += ` and ${numberToWords(fraction)} ${subSuffix}`;
//   }

//   return result.trim();
// };

export const readFileIfExists = async (filePath1) => {
  try {
    const exists = await fs.pathExists(filePath1);
    if (exists) {
      const data = await fs.readFile(filePath1, "utf8");
      console.log("File Content:", data, filePath1);
      return filePath1;
    } else {
      console.log("File not found:", filePath1);
    }
  } catch (error) {
    console.error("Error reading file:", error);
  }
};

export function parseSession(session) {
  const match = session.match(/^a(\d+)_c(\d+)$/);
  if (!match) return null;
  return {
    a_application_login_id: Number(match[1]),
    company_masters_id: Number(match[2]),
  };
}

export function normalizeToTenDigit(number) {
  if (!number) return null;
  let raw = String(number).trim();
  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }
  if (digits.startsWith("0") && digits.length === 11) {
    digits = digits.slice(1);
  }

  if (digits.length === 10) {
    return `91${digits}`;
  }
  if (digits.length === 12 && digits.startsWith("91")) {
    return digits;
  }

  return digits.length >= 7 ? digits : null;
}

export function sanitizeFileName(input) {
  return input
    .toString()
    .trim()
    .replace(/\./g, '_')            // 🔥 replace DOT with _
    .replace(/[\/\\?%*:|"<>]/g, '_') // remove illegal chars
    .replace(/\s+/g, '_')            // spaces → _
    .replace(/_+/g, '_')             // collapse multiple _
    .replace(/^_+|_+$/g, '')         // trim _
    .toLowerCase();
}

// export function normalizeToTenDigitToCheck(number) {
//   if (!number) return null;

//   // Remove everything except digits
//   let digits = String(number).replace(/\D/g, "");

//   // Remove leading 00 (international prefix)
//   if (digits.startsWith("00")) {
//     digits = digits.slice(2);
//   }

//   // E.164 allows up to 15 digits, minimum usually 6
//   if (digits.length < 6 || digits.length > 15) {
//     return null;
//   }

//   return digits;
// }

function isValidString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidNumber(value) {
  return typeof value === "number" && value !== 0 && !isNaN(value);
}

function isValidArray(value) {
  return Array.isArray(value) && value.length > 0;
}

function isValidObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length > 0;
}

export function isValid(value) {
  if (value == null) return false;

  if (typeof value === "string") return isValidString(value);
  if (typeof value === "number") return isValidNumber(value);
  if (Array.isArray(value)) return isValidArray(value);
  if (typeof value === "object") return isValidObject(value);

  return true;
}

/**
 * Company-wide "is this a duplicate contact?" rule, keyed off
 * company_masters.is_contact_validation (1 = Off, 2 = On).
 *
 * Off (default): a matching mobile number alone is always a duplicate —
 * the existing behavior every contact-creation path had before this flag
 * existed.
 * On: a matching mobile number is only a duplicate if the person name also
 * matches (case/whitespace-insensitive) — lets the same number be reused by
 * a genuinely different person (e.g. a shared reception line), while still
 * catching a literal re-submission of the same contact.
 */
export function isDuplicateContact(isContactValidationFlag, existingName, newName) {
  if (Number(isContactValidationFlag) !== 2) return true;

  const normalize = (name) => String(name || "").trim().toLowerCase();
  const existing = normalize(existingName);
  const incoming = normalize(newName);

  return existing.length > 0 && existing === incoming;
}


export function formatDateTimeValue(value, preserveOffset = true) {
  // Skip invalid or non-string/Date values
  if (!value || (typeof value !== 'string' && !(value instanceof Date))) {
    return value;
  }

  if (!moment(value, moment.ISO_8601, true).isValid()) {
    // Not a valid date, just return the raw value or empty string
    return value;
  }

  // Cached regex patterns for type detection
  const patterns = {
    date: /^\d{4}-\d{2}-\d{2}$/,
    datetime: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?([+-]\d{2}:\d{2}|Z)?$/,
    time: /^\d{2}:\d{2}(:\d{2})?\s*(AM|PM)?$/i
  };

  let m;

  // Parse with Moment.js
  if (typeof value === 'string' && patterns.datetime.test(value)) {
    if (preserveOffset) {
      // Preserve the original offset
      m = moment.parseZone(value);
    } else {
      // Convert to local time zone
      m = moment(value);
    }
  } else {
    m = moment(value);
  }

  // Handle time-only strings
  if (!m.isValid() && typeof value === 'string' && patterns.time.test(value)) {
    m = moment(`1970-01-01T${value}`);
  }

  // Validate
  if (!m.isValid()) {
    return value;
  }

  // Format based on value structure
  if (typeof value === 'string') {
    if (patterns.time.test(value)) {
      return m.format('hh:mm A');
    }
    if (patterns.date.test(value)) {
      return m.format('DD-MM-YYYY');
    }
    if (patterns.datetime.test(value)) {
      return m.format('DD-MM-YYYY hh:mm A');
    }
  }

  // Default: return unchanged if no match
  return value;
}


/**
 * Validate email address
 * @param {string} email - Email string to validate
 * @returns {boolean} - true if valid, false otherwise
 */
export function isValidEmail(email) {
  if (typeof email !== 'string') return false;

  // Trim spaces and lowercase
  email = email.trim().toLowerCase();

  // Disallow numeric-only local part (before '@')
  const emailRegex = /^(?!\d+@)[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;

  return emailRegex.test(email);
}

/*  a function custumform filed to data chatHistory ma add karva mate thay che how to use this  check in contact service  Find (addContactByQR) this and read. - keval */
export function customFormFiledDataAddToChatHistory(req) {
  const fields = [
    { key: "column_number_1", label: "Number 1" },
    { key: "column_number_2", label: "Number 2" },
    { key: "column_number_3", label: "Number 3" },
    { key: "column_number_4", label: "Number 4" },
    { key: "column_number_5", label: "Number 5" },

    { key: "column_text_1", label: "Text 1" },
    { key: "column_text_2", label: "Text 2" },
    { key: "column_text_3", label: "Text 3" },
    { key: "column_text_4", label: "Text 4" },
    { key: "column_text_5", label: "Text 5" },

    { key: "column_text_area_1", label: "Text Area 1" },
    { key: "column_text_area_2", label: "Text Area 2" },
    { key: "column_text_area_3", label: "Text Area 3" },
    { key: "column_text_area_4", label: "Text Area 4" },
    { key: "column_text_area_5", label: "Text Area 5" },

    { key: "column_date_1", label: "Date 1" },
    { key: "column_date_2", label: "Date 2" },
    { key: "column_date_3", label: "Date 3" },
    { key: "column_date_4", label: "Date 4" },
    { key: "column_date_5", label: "Date 5" },

    { key: "column_date_and_time_1", label: "Date & Time 1" },
    { key: "column_date_and_time_2", label: "Date & Time 2" },
    { key: "column_date_and_time_3", label: "Date & Time 3" },
    { key: "column_date_and_time_4", label: "Date & Time 4" },
    { key: "column_date_and_time_5", label: "Date & Time 5" },

    { key: "column_time_1", label: "Time 1" },
    { key: "column_time_2", label: "Time 2" },
    { key: "column_time_3", label: "Time 3" },
    { key: "column_time_4", label: "Time 4" },
    { key: "column_time_5", label: "Time 5" },

    { key: "column_switch_1", label: "Switch 1" },
    { key: "column_switch_2", label: "Switch 2" },
    { key: "column_switch_3", label: "Switch 3" },
    { key: "column_switch_4", label: "Switch 4" },
    { key: "column_switch_5", label: "Switch 5" },

    { key: "column_decimal_1", label: "Decimal 1" },
    { key: "column_decimal_2", label: "Decimal 2" },
    { key: "column_decimal_3", label: "Decimal 3" },
    { key: "column_decimal_4", label: "Decimal 4" },
    { key: "column_decimal_5", label: "Decimal 5" },

    { key: "column_dropdown_1", label: "Dropdown 1" },
    { key: "column_dropdown_2", label: "Dropdown 2" },
    { key: "column_dropdown_3", label: "Dropdown 3" },
    { key: "column_dropdown_4", label: "Dropdown 4" },
    { key: "column_dropdown_5", label: "Dropdown 5" },

    { key: "column_radio_1", label: "Radio 1" },
    { key: "column_radio_2", label: "Radio 2" },
    { key: "column_radio_3", label: "Radio 3" },
    { key: "column_radio_4", label: "Radio 4" },
    { key: "column_radio_5", label: "Radio 5" },
  ];

  let html = "";

  fields.forEach(f => {
    const value = req.body[f.key];

    if (value !== undefined && value !== "" && value !== null) {
      html += `<b>${f.label}:</b> ${value}<br/>`;
    }
  });

  return html;
}

export function generateFileName(prefix = "file") {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  const time = Date.now();
  return `${prefix}_${random}_${time}`;
}

export function isJSON(value) {
  if (typeof value === 'string') {
    try {
      JSON.parse(value);
      return true;
    } catch {
      return false;
    }
  }

  return typeof value === 'object' && value !== null;
}

export const sleep = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

export function isExactPhraseExists(searchText, description) {
  if (!searchText || !description) return false;

  // Escape special regex characters
  const escapedText = searchText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Case-insensitive exact phrase match with word boundaries
  const regex = new RegExp(`\\b${escapedText}\\b`, "i");

  return regex.test(description);
}


export const calculatePackQty = ({
  newQuantity,
  product_inner_qty,
  product_outer_qty,
  isOrderClassification
}) => {

  const innerPack = Number(product_inner_qty) || 1;
  const outerPack = Number(product_outer_qty) || 1;


  let outerQty = 0;
  let innerQty = 0;
  let looseQty = 0;

  // -----------------------------
  // CASE 2 → ONLY INNER
  // -----------------------------
  if (isOrderClassification == 2) {
    console.log("only innner");
    innerQty = Math.floor(newQuantity / innerPack);
    looseQty = newQuantity - innerQty * innerPack;
  }

  // -----------------------------
  // CASE 3 → ONLY OUTER
  // -----------------------------
  else if (isOrderClassification == 3) {
    console.log("only Outtter");
    outerQty = Math.floor(newQuantity / outerPack);
    looseQty = newQuantity - outerQty * outerPack;
  }

  // -----------------------------
  // CASE 4 → INNER + OUTER
  // -----------------------------
  else if (isOrderClassification == 4) {
    console.log("INNER + OUTER");
    outerQty = Math.floor(newQuantity / outerPack);

    const remaining = newQuantity - outerQty * outerPack;

    innerQty = Math.floor(remaining / innerPack);

    const used = (outerQty * outerPack) + (innerQty * innerPack);

    looseQty = newQuantity - used;
  }

  return {
    innerQty,
    outerQty,
    looseQty
  };
};

export function generateNumber(baseNumber, lastNumber = null) {
  const base = baseNumber.toString();

  if (lastNumber === null) {
    return Number(base);
  }

  const lastStr = lastNumber.toString();
  const prefix = base.slice(0, 10 - lastStr.length);

  return Number(prefix + lastStr);
}

/* export const parseDate = (dateStr) => {
  const formats = [
    "DD/MM/YYYY hh:mm:ss A",
    "DD/MM/YYYY HH:mm:ss",
    "MM/DD/YYYY hh:mm:ss A",
    "YYYY-MM-DDTHH:mm:ss.SSSZ",
    "YYYY-MM-DD HH:mm:ss",
  ];

  const m = moment(dateStr, formats, true); // strict parsing

  if (!m.isValid()) {
    console.error("Invalid date:", dateStr);
    return null;
  }

  return m.format("YYYY-MM-DD HH:mm:ss"); // DB format
}; */

export const parseDate = (dateStr) => {
  if (!dateStr) return null;

  const value = String(dateStr).trim();

  // Handle Google Sheets / Excel serial numbers
  if (!isNaN(value) && value.includes(".")) {
    const excelDate = moment("1899-12-30").add(Number(value), "days");

    return excelDate.isValid()
      ? excelDate.format("YYYY-MM-DD HH:mm:ss")
      : null;
  }

  const formats = [
    // 12 hour formats
    "DD/MM/YYYY hh:mm:ss A",
    "DD/MM/YYYY h:mm:ss A",
    "D/M/YYYY hh:mm:ss A",
    "D/M/YYYY h:mm:ss A",

    // 24 hour formats
    "DD/MM/YYYY HH:mm:ss",
    "D/M/YYYY HH:mm:ss",
    "DD/M/YYYY HH:mm:ss",
    "D/MM/YYYY HH:mm:ss",

    // ISO
    "YYYY-MM-DDTHH:mm:ss.SSSZ",
    "YYYY-MM-DD HH:mm:ss",
  ];

  const m = moment(value, formats, true);

  if (!m.isValid()) {
    console.error("Invalid date:", value);
    return null;
  }

  return m.format("YYYY-MM-DD HH:mm:ss");
};

export function generateDateRange(start, end) {
  const startDate = new Date(start);
  const endDate = new Date(end);

  const dateRange = [];
  const currentDate = new Date(startDate);

  while (currentDate <= endDate) {
    dateRange.push(currentDate.toISOString().split('T')[0]);

    currentDate.setDate(currentDate.getDate() + 1);
  }

  return dateRange;
}
