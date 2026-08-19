import Sequelize from "sequelize";
import {
  formatDateAndTimeCreateDateTime,
  formatDateCustom,
  normalizeToTenDigit,
  resBadRequest,
  resError,
  resSuccess,
  sanitizeObjectOfNull
} from "../../utils/sharedFunctions.js";
// import { formatDateTimeSendDataBase } from "../utils/dateTime.js";

import { randomUUID } from "crypto";
import ejs from "ejs";
import fs from "fs";
import moment from "moment";
import path from "path";
import pdf from "pdf-creator-node";
import { col, fn, Op } from "sequelize";
import XLSX from "xlsx";
import { getTenantDB } from "../../config/dbManager.js";
import { getUserRights } from "../../helpers/rightsHelper.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";
import { accountTransactionsModel } from "../../models/activities/accountTransactionsModel.js";
import { contactMessageHistory } from "../../models/activities/contactMessageHistoryModel.js";
import { contactModel } from "../../models/activities/contactModel.js";
import { paymentTypeModel } from "../../models/activities/paymentTypeModel.js";
import { applicationLoginTypeRightModel } from "../../models/application_login/applicationLoginTypeRightModel.js";
import loginModel from "../../models/application_login/loginModel.js";
import companyModel from "../../models/company_setup/companyModel.js";
import { printSettingModel } from "../../models/company_setup/printSettingModel.js";
import currencyModel from "../../models/configuration/currencyModel.js";
import { cityModel } from "../../models/masters/cityModel.js";
import { countryModel } from "../../models/masters/countryModel.js";
import { stateModel } from "../../models/masters/stateModel.js";
import { __dirnameConstant, EXPORTS_LINK_EXTENDED, PDF_LINK_EXTENDED_Account_TRANSACTION } from '../../utils/appConstants.js';
import { PAGE_ID } from "../../utils/AppEnumeration.js";
import { exportData } from "../../utils/exporter.js";
import { getCompanyByLoginId, getCompanyDetailByLoginId } from "../commonServices.js";
import { sendMultipleNotification } from "../company_setup/thirdPartyIntegrationService.js";

function AccountTransactionformatDateAndTime(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return '';
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function AccountTransactionformatNumber(num) {
  if (num === null || num === undefined) return '';
  return Number(num).toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 0 });
}

function AccountTransactionescapeHtml(string) {
  if (!string) return '';
  return String(string);
}

function AccountTransactionremarkToHtml(remark) {
  if (remark === undefined || remark === null) return '';
  const str = String(remark);
  const escaped = AccountTransactionescapeHtml(str);
  return escaped.replace(/\r\n|\n/g, '<br/>');
}

function AccountTransactionnumberToWordsCurrency(amount) {
  if (amount === null || amount === undefined || Number.isNaN(Number(amount))) return '';
  const num = Number(Math.abs(Number(amount))).toFixed(2);
  const [intPartStr, decPartStr] = String(num).split('.');
  const intPart = parseInt(intPartStr, 10);
  const paise = parseInt(decPartStr || '0', 10);

  const words = convertNumberToWords(intPart);
  const rupeeWord = intPart === 1 ? 'rupee' : 'rupees';
  const paiseWords = paise ? `${convertNumberToWords(paise)} paise` : '';
  const sign = Number(amount) < 0 ? 'minus ' : '';
  const joined = paiseWords ? `${words} ${rupeeWord} and ${paiseWords} only` : `${words} ${rupeeWord} only`;
  return sign + capitalizeFirst(joined);
}

function AccountTransactionconvertNumberToWords(num) {
  if (num === 0) return 'zero';
  const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

  function twoDigit(n) {
    if (n < 20) return ones[n];
    const t = Math.floor(n / 10);
    const o = n % 10;
    return tens[t] + (o ? ' ' + ones[o] : '');
  }

  function threeDigit(n) {
    const h = Math.floor(n / 100);
    const rem = n % 100;
    return (h ? ones[h] + ' hundred' + (rem ? ' ' : '') : '') + (rem ? twoDigit(rem) : '');
  }

  let result = '';
  const crore = Math.floor(num / 10000000);
  num %= 10000000;
  const lakh = Math.floor(num / 100000);
  num %= 100000;
  const thousand = Math.floor(num / 1000);
  num %= 1000;
  const hundredPart = num;

  if (crore) result += (convertSegment(crore) + ' crore ');
  if (lakh) result += (convertSegment(lakh) + ' lakh ');
  if (thousand) result += (convertSegment(thousand) + ' thousand ');
  if (hundredPart) result += (threeDigit(hundredPart) + ' ');

  return result.trim();
}

function AccountTransactionconvertSegment(n) {
  if (n < 100) return (n < 20 ? (['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'][n]) : (['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'][Math.floor(n / 10)] + (n % 10 ? ' ' + ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'][n % 10] : '')));
  return threeDigitLocal(n);
}

function AccountTransactionthreeDigitLocal(n) {
  const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  const h = Math.floor(n / 100);
  const rem = n % 100;
  return (h ? ones[h] + ' hundred' + (rem ? ' ' : '') : '') + (rem ? (rem < 20 ? ones[rem] : tens[Math.floor(rem / 10)] + (rem % 10 ? ' ' + ones[rem % 10] : '')) : '');
}

function AccountTransactioncapitalizeFirst(s) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const getAllAccountTransactions = async (req, res) => {
  try {
    let { ul, ll } = req.body;
    let {
      a_application_login_id,
      contact_master_id,
      searchTerm,
      startDate,
      endDate,
      creditFilter,
      debitFilter,
      orderBy = "DESC",
    } = req.body;
    const { qr_code } = req.query;
    const contact_id = req.query.contact_id || req.params.contact_id;

    // --------------------------------------------------------
    // 1. PUBLIC API MODE: a_application_login_id missing → use qr_code
    // --------------------------------------------------------
    if (!a_application_login_id) {
      if (!qr_code) {
        return resBadRequest({
          developer_msg: "qr_code is required for public API",
          ack_msg: "Invalid access"
        });
      }

      const companyData = await companyModel.findOne({
        where: { qr_code, isDelete: 0 },
        attributes: ["id", "a_application_login_id"],
      });

      if (!companyData) {
        return resBadRequest({
          developer_msg: "Invalid QR Code",
          ack_msg: "Company not found"
        });
      }

      a_application_login_id = companyData.a_application_login_id;
      req.headers["x-tenant-id"] = companyData.a_application_login_id;

      await new Promise((resolve, reject) => {
        tenantMiddleware(req, res, (err) => {
          if (err) return reject(err);
          resolve();
        });
      });
    }

    // --------------------------------------------------------
    // 2. Get company ID by login
    // --------------------------------------------------------
    const findCompanyId = await getCompanyByLoginId(a_application_login_id);

    // --------------------------------------------------------
    // 3. USER RIGHTS (only when internal API)
    // --------------------------------------------------------
    let showAllData = false;
    let showPersonalData = false;

    if (!qr_code) {
      const rights = await getUserRights({
        company_masters_id: findCompanyId.company_masters_id,
        a_application_login_id,
        page_id: PAGE_ID.ACCOUNT_HISTORY,
        tenentId: req.tenantDB
      });

      showAllData = rights.showAllData;
      showPersonalData = rights.showPersonalData;
    }

    // --------------------------------------------------------
    // 4. WHERE CLAUSE
    // --------------------------------------------------------
    let whereClause = {
      company_masters_id: findCompanyId.company_masters_id,
      isDelete: "0",
    };

    // Public API SHOULD ONLY show data for that one login
    if (qr_code) {
      whereClause.a_application_login_id = a_application_login_id;
    }
    // Internal personal rights
    else if (showPersonalData && !showAllData) {
      whereClause.a_application_login_id = a_application_login_id;
    }

    if (contact_master_id) {
      whereClause.contact_masters_id = contact_master_id;
    }

    if (searchTerm) {
      whereClause[Op.or] = [
        { remark: { [Op.like]: `%${searchTerm}%` } },
      ];
    }

    if (startDate && endDate) {
      whereClause[Op.and] = whereClause[Op.and] || [];
      whereClause[Op.and].push(
        Sequelize.where(
          Sequelize.fn("DATE", Sequelize.col("payment_date_time")),
          { [Op.gte]: startDate }
        ),
        Sequelize.where(
          Sequelize.fn("DATE", Sequelize.col("payment_date_time")),
          { [Op.lte]: endDate }
        )
      );
    }

    // --------------------------------------------------------
    // NEW: CREDIT / DEBIT FILTER LOGIC
    // --------------------------------------------------------
    if (creditFilter == 1 && debitFilter != 2) {
      // Only Credit
      whereClause.type = 1;
    } else if (debitFilter == 2 && creditFilter != 1) {
      // Only Debit
      whereClause.type = 2;
    }
    // If both or neither → show all (no extra filter)

    // --------------------------------------------------------
    // 5. Query Transactions
    // --------------------------------------------------------
    const aTModel = accountTransactionsModel(req.tenantDB);
    const acc_payment_type = paymentTypeModel(req.tenantDB);
    const sortDir =
      String(orderBy || "DESC").toUpperCase() === "ASC" ? "ASC" : "DESC";

    const queryOptions = {
      where: whereClause,
      order: [["created_date_time", sortDir]],
    };

    if (ll !== undefined && ul !== undefined) {
      queryOptions.limit = Number(ll);
      queryOptions.offset = Number(ul);
    }

    const accountTransactionResult = await aTModel.findAll(queryOptions);

    const paymentTypes = await acc_payment_type.findAll({
      where: { isDelete: 0 },
      attributes: ["id", "payment_type_name"],   // assuming column is called "name"
      raw: true,
    });

    const paymentTypeMap = new Map(
      paymentTypes.map(pt => [Number(pt.id), pt.payment_type_name || "Unknown"])
    );

    // --------------------------------------------------------
    // 6. BALANCE CALCULATIONS (fixed)
    // --------------------------------------------------------
    let totalAmountCredit = 0;
    let totalAmountDebit = 0;

    accountTransactionResult.forEach((item) => {
      if (item.approve_by_a_application_login_id !== 0) {
        if (Number(item.type) === 1) totalAmountCredit += item.amount || 0;
        if (Number(item.type) === 2) totalAmountDebit += item.amount || 0;
      }
    });

    const closingBalance = totalAmountCredit - totalAmountDebit;

    // --------------------------------------------------------
    // 7. SANITIZE + JOIN USER NAMES
    // --------------------------------------------------------

    let activeTeamList;
    let activeTeamMap;
    if (accountTransactionResult) {
      activeTeamList = await loginModel.findAll(
        {
          where: {
            id: {
              [Op.in]: Sequelize.literal(`(
                    SELECT a_application_login_id
                    FROM company_vs_application_logins
                    WHERE isDelete=0 AND company_masters_id = '${findCompanyId.company_masters_id}'
                  )`)
            },
            isDelete: 0
          },
          attributes: ["username", "id"],
          raw: true
        }
      );
      activeTeamMap = new Map(
        activeTeamList.map(user => [user.id, user.username])
      );
    }
    const accountTransactions = await Promise.all(
      accountTransactionResult.map(async (row) => {
        const json = sanitizeObjectOfNull(row.toJSON());
        const approvedByUser = activeTeamMap.get(Number(json.approve_by_a_application_login_id)) || null;
        const createdByUser = activeTeamMap.get(Number(json.a_application_login_id)) || null;
        const paymentTypeName = paymentTypeMap.get(Number(json.mode)) || null;
        return {
          ...json,
          approve_by_a_application_login_name: approvedByUser || null,
          a_application_login_name: createdByUser || null,
          payment_type_name: paymentTypeName,
          created_date_time: formatDateAndTimeCreateDateTime(json.created_date_time),
          payment_date_time: formatDateAndTimeCreateDateTime(json.payment_date_time),
        };
      })
    );

    // --------------------------------------------------------
    // 8. RESPONSE
    // --------------------------------------------------------
    let contactDetails;
    if (contact_id) {
      contactDetails = await req.models.contact_masters.findOne({
        where: {
          id: contact_id,
          isDelete: 0,
        },
        attributes: ["id", "person_name", "company_name", "mobile_number", "email_id", "address", "shipping_address", "gst_number"]
      });
      if (!contactDetails) {
        contactDetails = null;
      }
    }

    return resSuccess({
      data: {
        item: accountTransactions,
        closingBalance,
        contactDetails
      },
    });

  } catch (e) {
    console.error(e);
    return resBadRequest({
      developer_msg: e.message,
    });
  }
};

export const getAllAccountTransactionsForOnlineStore = async (req, res) => {
  try {
    const { contact_id, qr_code, } = req.params;
    if (!qr_code) {
      return resBadRequest({
        developer_msg: "qr_code is required",
        ack_msg: "Invalid access"
      });
    }
    const companyData = await companyModel.findOne({
      where: { qr_code: qr_code, isDelete: 0 },
      attributes: ["id", "qr_code", "a_application_login_id"]
    });
    if (!companyData) {
      return resError({
        ack_msg: "Company not found",
        developer_msg: `No company found with QR code: ${qr_code}`
      });
    }
    const tenantId = companyData.a_application_login_id;
    const companyId = companyData.id;
    req.headers["x-tenant-id"] = tenantId;
    const tenantDBInfo = await getTenantDB(tenantId, companyId);
    const tenantSequelize = tenantDBInfo.sequelize;
    const contactDetails = await tenantDBInfo.models.contact_masters.findOne({
      where: {
        id: contact_id,
        isDelete: 0,
      },
      attributes: ["id", "person_name", "company_name", "mobile_number", "email_id", "address", "shipping_address", "gst_number"]
    })
    let whereClause = {
      company_masters_id: companyId,
      isDelete: "0",
    };

    // Public API SHOULD ONLY show data for that one login
    if (qr_code) {
      whereClause.a_application_login_id = tenantId;
    }
    // Internal personal rights
    else if (showPersonalData && !showAllData) {
      whereClause.a_application_login_id = tenantId;
    }

    if (contact_id) {
      whereClause.contact_masters_id = contact_id;
    }
    const sortDir =
      String("DESC").toUpperCase() === "ASC" ? "ASC" : "DESC";
    const queryOptions = {
      where: whereClause,
      order: [["created_date_time", sortDir]],
    };
    const accountTransactionResult = await tenantDBInfo.models.account_transactions.findAll(queryOptions);
    let totalAmountCredit = 0;
    let totalAmountDebit = 0;
    accountTransactionResult.forEach((item) => {
      if (item.approve_by_a_application_login_id !== 0) {
        if (Number(item.type) === 1) totalAmountCredit += item.amount || 0;
        if (Number(item.type) === 2) totalAmountDebit += item.amount || 0;
      }
    });
    const closingBalance = totalAmountCredit - totalAmountDebit;

    // --------------------------------------------------------
    // 7. SANITIZE + JOIN USER NAMES
    // --------------------------------------------------------
    const accountTransactions = await Promise.all(
      accountTransactionResult.map(async (row) => {
        const json = sanitizeObjectOfNull(row.toJSON());

        const approvedByUser = await loginModel.findOne({
          where: { id: json.approve_by_a_application_login_id, isDelete: 0 },
          attributes: ["username"],
          raw: true,
        });

        const createdByUser = await loginModel.findOne({
          where: { id: json.a_application_login_id, isDelete: 0 },
          attributes: ["username"],
          raw: true,
        });

        return {
          ...json,
          approve_by_a_application_login_name: approvedByUser?.username || null,
          a_application_login_name: createdByUser?.username || null,
          created_date_time: formatDateAndTimeCreateDateTime(json.created_date_time),
          payment_date_time: formatDateAndTimeCreateDateTime(json.payment_date_time),
        };
      })
    );
    if (tenantSequelize && typeof tenantSequelize.close === 'function') {
      await tenantSequelize.close();
    }
    return resSuccess({
      data: {
        contactDetails,
        closingBalance,
        item: accountTransactions
      },
    });

  } catch (e) {
    console.error(e);
    return resBadRequest({
      developer_msg: e.message,
    });
  }
};

export const accountTransactionById = async (req) => {
  try {
    let { id, a_application_login_id } = req.body;
    const findCompanyId = await getCompanyByLoginId(a_application_login_id);

    let whereClause = {
      id: id,
      company_masters_id: findCompanyId.company_masters_id,
    };

    const aTModel = accountTransactionsModel(req.tenantDB);
    const paymentTypeModelFn = paymentTypeModel(req.tenantDB);
    const countryModelFn = countryModel(req.tenantDB);
    const stateModelFn = stateModel(req.tenantDB);
    const cityModelFn = cityModel(req.tenantDB);

    const accountTransactionResult = await aTModel.findAll({
      where: whereClause,
      order: [["created_date_time", "DESC"]],
    });

    const companyModels = companyModel;

    const companyDetails = await companyModels.findOne({
      where: {
        id: findCompanyId.company_masters_id,
      },
    });

    const totalAmountCredit = accountTransactionResult.reduce(
      (sum, item) =>
        item.approve_by_a_application_login_id !== 0
          ? Number(item.type) === 1
            ? sum + (item.amount || 0)
            : sum
          : sum,
      0
    );
    const totalAmountDebit = accountTransactionResult.reduce(
      (sum, item) =>
        sum + item.approve_by_a_application_login_id !== 0
          ? Number(item.type) === 2
            ? sum + (item.amount || 0)
            : sum
          : sum,
      0
    );

    const closingBalance = totalAmountDebit * -1 + totalAmountCredit;
    const customerModels = contactModel(req.tenantDB);

    if (accountTransactionResult) {
      const accountTransactions = await Promise.all(
        accountTransactionResult.map(async (contactItem) => {
          const sanitized = sanitizeObjectOfNull(contactItem.toJSON());

          const customer_name = await customerModels.findOne({
            where: {
              id: sanitized.contact_masters_id,
            },
            attributes: ["person_name", "company_name", "mobile_number", "country", "state", "city", "pincode", "address"],
          });

          let payment_type_name = null;
          if (sanitized.mode) {
            const paymentType = await paymentTypeModelFn.findOne({
              where: {
                id: sanitized.mode,
              },
              attributes: ["payment_type_name"],
            });
            payment_type_name = paymentType ? paymentType.payment_type_name : null;
          }
          let country_name = null;
          if (customer_name.country) {
            const country = await countryModelFn.findOne({
              where: {
                id: customer_name.country,
              },
              attributes: ["country_name"],
            });
            country_name = country ? country.country_name : null;
          }
          let state_name = null;
          if (customer_name.state) {
            const state = await stateModelFn.findOne({
              where: {
                id: customer_name.state,
              },
              attributes: ["state_name"],
            });
            state_name = state ? state.state_name : null;
          }
          let city_name = null;
          if (customer_name.city) {
            const city = await cityModelFn.findOne({
              where: {
                id: customer_name.city,
              },
              attributes: ["city_name"],
            });
            city_name = city ? city.city_name : null;
          }

          return {
            ...sanitized,
            created_date_time: formatDateAndTimeCreateDateTime(
              sanitized.created_date_time
            ),
            payment_date_time: formatDateAndTimeCreateDateTime(
              sanitized.payment_date_time
            ),
            customer_name: customer_name ? {
              person_name: customer_name.person_name,
              company_name: customer_name.company_name,
              mobile_number: customer_name.mobile_number,
              address: customer_name.address,
              pincode: customer_name.pincode,
              country_name,
              state_name,
              city_name,
            } : null,
            payment_type_name
          };
        })
      );

      return resSuccess({
        data: { item: accountTransactions, closingBalance, companyDetails },
      });
    } else {
      return resError({
        ack_msg: "No AccountTransaction",
        developer_msg: "Data not found",
      });
    }
  } catch (e) {
    console.error(e);

    return resBadRequest({
      developer_msg: e,
    });
  }
};

// const cartToMsgBody = {
//           contact_masters_id: resultCart.dataValues.to_customer_id,
//           a_application_login_id: req.body.a_application_login_id,
//           company_masters_id: findCompanyId.company_masters_id,
//           msg_cart_id: resultCart.dataValues.id,
//           description:
//             `<b>${
//               orderTypesShowList?.find(
//                 (option) =>
//                   Number(option.id) === Number(resultCart.dataValues.type)
//               )?.type || ""
//             } </b>` +
//             "<br>" +
//             (resultCart.dataValues.cart_number
//               ? `#${resultCart.dataValues.cart_number}`
//               : "#XXXXXXXX") +
//             "<br>" +
//             `<b>${
//               resultCart.dataValues.grand_total
//                 ? `${resultCart.dataValues.grand_total}  ${symbolCurrency}`
//                 : ""
//             } </b>` +
//             "<br>" +
//             `${formatDateCustom(resultCart.dataValues.cart_date) || ""}`,

//           created_date_time: formattedDateTime,
//           message_side: 1,
//           message_type_id: 2,
//         };
//         const ContactMSG = contactMessageHistory(req.tenantDB);
//         const contactToMessage = await ContactMSG.create(cartToMsgBody);

export const updateAccountTransaction = async (req, res) => {
  const t = await req.tenantDB.transaction();

  try {
    const {
      approveId,
      a_application_login_id,
      created_date_time,
      approve_by_a_application_login_id,
    } = req.body;

    if (
      !approveId ||
      !a_application_login_id ||
      !created_date_time ||
      !approve_by_a_application_login_id
    ) {
      return resBadRequest({ ack_msg: "Missing required fields" });
    }

    const aTModel = accountTransactionsModel(req.tenantDB);
    const ContactMSG = contactMessageHistory(req.tenantDB);
    const contactModelMaster = contactModel(req.tenantDB);
    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    const acc_payment_type = paymentTypeModel(req.tenantDB);
    if (!findCompanyId) {
      return resError({ ack_msg: "Company not found for login ID" });
    }


    const approveIds = Array.isArray(approveId) ? approveId : [approveId];

    const records = await aTModel.findAll({
      where: {
        id: approveIds,
        [Op.or]: [
          { a_application_login_id },
          { company_masters_id: findCompanyId.company_masters_id },
        ],
        isDelete: 0,
      },
      transaction: t,
    });

    if (!records.length) {
      return resError({ ack_msg: "No valid records found or access denied" });
    }


    await aTModel.update(
      {
        approve_by_a_application_login_id,
        approve_date_time: created_date_time,
      },
      {
        where: { id: approveIds },
        transaction: t,
      }
    );

    const updatedTransactions = await aTModel.findAll({
      where: { id: approveIds },
      transaction: t,
    });

    const now = new Date();
    const formattedDateTime = `${now.getFullYear()}-${String(
      now.getMonth() + 1
    ).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(
      now.getHours()
    ).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(
      now.getSeconds()
    ).padStart(2, "0")}`;

    // const paymentModeList = [
    //   { id: "1", mode_name: "Cash" },
    //   { id: "2", mode_name: "Cheque" },
    //   { id: "3", mode_name: "Online" },
    //   { id: "4", mode_name: "UPI" },
    //   { id: "-1", mode_name: "Other" },
    // ];

    // const getModeName = (modeId) => {
    //   const found = paymentModeList.find((i) => i.id === String(modeId));
    //   return found ? found.mode_name : "Unknown";
    // };
    const paymentTypes = await acc_payment_type.findAll({
      where: { isDelete: 0 },
      attributes: ["id", "payment_type_name"],
      raw: true,
      transaction: t,
    });

    const paymentTypeMap = new Map(
      paymentTypes.map(pt => [Number(pt.id), pt.payment_type_name?.trim() || "Unknown"])
    );
    const usernameLiteral = async (a_application_login_id) => {
      const user = await loginModel.findOne({
        where: { id: a_application_login_id, isDelete: 0 },
        attributes: ["username"],
      });
      return user?.username || null;
    };

    const approverUsername = await usernameLiteral(
      approve_by_a_application_login_id
    );


    for (const updatedTransaction of updatedTransactions) {
      const username = await usernameLiteral(
        updatedTransaction.a_application_login_id
      );

      const transactionTypeLabel =
        updatedTransaction.type === 1
          ? "Credit"
          : updatedTransaction.type === 2
            ? "Debit"
            : "Transaction";
      const paymentTypeName = paymentTypeMap.get(Number(updatedTransaction.mode)) || "Unknown";
      const msgBody = {
        contact_masters_id: updatedTransaction.contact_masters_id,
        a_application_login_id,
        company_masters_id: findCompanyId.company_masters_id,
        msg_account_transaction_id: updatedTransaction.id,
        description:
          `<b>Account History</b><br>` +
          `# ${updatedTransaction.id}<br>` +
          `Payment Type: ${transactionTypeLabel}<br>` +
          `<b>₹${updatedTransaction.amount.toFixed(2) || "0.00"
          } By ${paymentTypeName}</b><br>` +
          `${formatDateCustom(updatedTransaction.payment_date_time) || ""}<br>` +
          (updatedTransaction.remark
            ? `<i>${updatedTransaction.remark}</i><br>`
            : ""),
        created_date_time: formattedDateTime,
        message_side: 1,
        message_type_id: 0,
        application_login_name: username,
      };

      await ContactMSG.create(msgBody, { transaction: t });

      await contactModelMaster.update(
        { is_read_by_a_application_login_id: a_application_login_id },
        { where: { id: updatedTransaction.contact_masters_id }, transaction: t }
      );

      const contactData = await contactModelMaster.findOne({
        where: {
          id: updatedTransaction.contact_masters_id,
          isDelete: 0,
        },
        attributes: ["assinged_to_work_a_application_id"],
      });

      if (contactData && contactData.assinged_to_work_a_application_id) {
        const assignedIds = contactData.assinged_to_work_a_application_id
          .split(",")
          .map((id) => id.trim());

        for (const id of assignedIds) {
          if (id === String(a_application_login_id)) continue;

          const assignedContact = await loginModel.findOne({
            where: { id, isDelete: 0 },
            attributes: [
              "web_refresh_token",
              "android_refresh_token",
              "ios_refresh_token",
            ],
          });

          if (assignedContact) {
            const tokens = [
              assignedContact.web_refresh_token,
              assignedContact.android_refresh_token,
              assignedContact.ios_refresh_token,
            ].filter(Boolean);

            if (tokens.length > 0) {
              await sendMultipleNotification({
                deviceTokens: tokens,
                title: `Transaction #${updatedTransaction.id} Approved`,
                body: `${approverUsername || "Someone"} approved a ${transactionTypeLabel} 
of ₹${updatedTransaction.amount.toFixed(2)} via ${paymentTypeMap.get(Number(updatedTransaction.mode)) || "Unknown"
                  }.`,
              });
            }
          }
        }
      }
    }

    await t.commit();
    return resSuccess({
      ack_msg: "Transactions Approved Successfully",
      data: updatedTransactions.map((t) => t.toJSON()),
    });
  } catch (error) {
    console.error("Update error:", error);
    await t.rollback().catch((rollbackError) => {
      console.error("Rollback error:", rollbackError.message);
    });
    return resBadRequest({ developer_msg: error.message || error });
  }
};

export const createAccountTransaction = async (req, res) => {
  try {
    const {
      contact_masters_id,
      a_application_login_id,
      amount,
      miracle_account_ledger,
      type,
      mode,
      remark,
      payment_date_time,
      auto_reverse_entry
    } = req.body;

    // Validation
    if (!contact_masters_id || !a_application_login_id || !amount) {
      return resError({
        ack_msg: "team_id, a_application_login_id and amount are required"
      });
    }

    const tenantDB = req.tenantDB;
    const accountTransaction = accountTransactionsModel(tenantDB);
    const contact_masters = contactModel(tenantDB);
    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    const contactData = await contact_masters.findOne({
      where: {
        id: contact_masters_id,
        isDelete: "0"
      },
      attributes: ["person_name", "assinged_to_work_a_application_id"]
    });

    if (!contactData) {
      return resError({ ack_msg: "Contact not found" });
    }

    // ====================== RIGHTS CHECK ======================
    let isApproveRight = false;

    const applicationLoginTypeRightModelIntance = applicationLoginTypeRightModel(tenantDB);

    const userRightsList = await applicationLoginTypeRightModelIntance.findOne({
      where: {
        company_masters_id: findCompanyId.company_masters_id,
        a_application_login_id: a_application_login_id,
        isDelete: 0,
        page_id: PAGE_ID.ACCOUNT_HISTORY,
      },
      attributes: ["a_page_id_rights_jason"],
    });

    if (userRightsList?.a_page_id_rights_jason) {
      try {
        const rights = JSON.parse(userRightsList.a_page_id_rights_jason);

        // Check if user has "approve" rights (you can adjust the key name if different)
        if (rights.approve == 1) {
          isApproveRight = true;
        }
      } catch (err) {
        logger.error("Rights JSON parse error:", err);
      }
    }

    const now = new Date();

    const baseData = {
      contact_masters_id,
      a_application_login_id,
      amount,
      mode: mode || 6,
      remark: remark || "",
      payment_date_time: payment_date_time,
      miracle_account_ledger: miracle_account_ledger,
      company_masters_id: findCompanyId.company_masters_id,
      approve_by_a_application_login_id: 0,
      approve_date_time: ""
    };
    if (isApproveRight) {
      baseData.approve_by_a_application_login_id = a_application_login_id;
      baseData.approve_date_time = now;
    }

    let createdItems = [];

    // === Normal Entry ===
    const firstEntry = await accountTransaction.create({
      ...baseData,
      type: Number(type)
    });

    createdItems.push(firstEntry);

    if (auto_reverse_entry === 1) {
      // === Auto Create Opposite Type Entry ===
      const oppositeType = Number(type) === 1 ? 2 : 1;

      const secondEntry = await accountTransaction.create({
        ...baseData,
        type: oppositeType
      });

      createdItems.push(secondEntry);
    }


    if (contactData.assinged_to_work_a_application_id) {

      const assignedToWorkAppIds = contactData.assinged_to_work_a_application_id
        .split(",")
        .map((id) => parseInt(id.trim()))
        .filter((id) => !isNaN(id));

      const assignedMemberTokens = await loginModel.findAll({
        where: {
          id: {
            [Op.in]: assignedToWorkAppIds, // Use Sequelize's IN operator to query multiple IDs
          },
          isDelete: 0,
        },
        attributes: [
          "web_refresh_token",
          "android_refresh_token",
          "ios_refresh_token",
        ],
      });
      // Fetch username of the member who added the transaction
      const assignedMemberTo = await loginModel.findOne({
        where: {
          id: a_application_login_id,
          isDelete: 0,
        },
        attributes: ["username"],
      });
      // Collect all tokens and remove duplicates
      const allTokens = assignedMemberTokens
        .flatMap((tokenObj) => [
          tokenObj.web_refresh_token,
          tokenObj.android_refresh_token,
          tokenObj.ios_refresh_token,
        ])
        .filter((token) => token && token.trim() !== "");
      const uniqueTokens = [...new Set(allTokens)];
      // Send notifications if tokens are found
      if (uniqueTokens.length > 0) {
        try {
          await sendMultipleNotification({
            deviceTokens: uniqueTokens,
            title: `New Account Transaction Added by ${assignedMemberTo.username}
                in ${contactData.person_name}`,
            body: "",
          });

        } catch (notificationError) {
          logger.error(
            "Notification failed (non-critical):",
            notificationError.message
          );
        }
      } else {
        logger.info("No device tokens found for assigned team members.");
      }
    }

    return resSuccess({
      ack_msg: "Account transaction created successfully.",
      data: createdItems
    });
  } catch (error) {
    logger.error("Error in createAccountTransaction:", error);
    return resBadRequest({
      ack_msg: "Failed to create account transaction",
      developer_msg: error.message
    });
  }
};

export const getAccountStatementOfContact = async (req, res) => {
  try {
    const { a_application_login_id, contact_master_id } = req.body;
    if (!a_application_login_id || !contact_master_id) {
      return resBadRequest({
        ack_msg: "Missing a_application_login_id or contact_master_id",
      });
    }

    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    if (!findCompanyId) {
      return resBadRequest({ ack_msg: "Company not found for this login ID" });
    }

    const AccountTransactionModel = accountTransactionsModel(req.tenantDB);
    const ContactMasterModel = contactModel(req.tenantDB);

    // Fetch company currency
    const companyCurrency = await companyModel.findOne({
      where: { id: findCompanyId.company_masters_id, isDelete: 0 },
      attributes: ["currency_id"],
    });

    const currency = await currencyModel.findOne({
      where: { id: companyCurrency?.currency_id, isDelete: 0 },
      attributes: ["id", "symbol"],
    });

    // Fetch contact record for display
    const contactRecord = await ContactMasterModel.findOne({
      where: { isDelete: 0, id: contact_master_id },
      attributes: [
        [
          fn("CONCAT", col("person_name"), " - ", col("mobile_number")),
          "contact_name",
        ],
      ],
      raw: true,
    });

    // Fetch all transactions for that contact
    const transactions = await AccountTransactionModel.findAll({
      where: {
        isDelete: 0,
        company_masters_id: findCompanyId.company_masters_id,
        contact_masters_id: contact_master_id,
      },
      order: [["created_date_time", "DESC"]],
      raw: true,
    });

    // Compute totals
    let total_credit = 0;
    let total_debit = 0;

    transactions.forEach((tx) => {
      if (tx.type === 1) {
        total_credit += parseFloat(tx.amount || 0);
      } else if (tx.type === 2) {
        total_debit += parseFloat(tx.amount || 0);
      }
    });

    const total_outstanding = total_debit - total_credit;

    return resSuccess({
      data: {
        contact_name: contactRecord?.contact_name || "Unknown",
        currency_symbol: currency?.symbol || "",
        transactions,
        totals: {
          total_credit: `${currency?.symbol || ""} ${total_credit.toFixed(2)}`,
          total_debit: `${currency?.symbol || ""} ${total_debit.toFixed(2)}`,
          total_outstanding_amount: `${currency?.symbol || ""} ${Math.abs(
            total_outstanding
          ).toFixed(2)}`,
          outstanding_type: total_outstanding >= 0 ? "Receivable" : "Payable",
        },
      },
      ack_msg: "Data fetched successfully",
    });
  } catch (error) {
    return resBadRequest({
      ack_msg: error.message || "Something went wrong",
    });
  }
};

export const accountPDFv1 = async (req, res) => {
  try {
    const accountTransactionId = req.body.accountTransactionId;
    const AccountTransactionModel = accountTransactionsModel(req.tenantDB);
    const ContactModel = contactModel(req.tenantDB);
    const PaymentTypeModel = paymentTypeModel(req.tenantDB);
    const CountryModel = countryModel(req.tenantDB);
    const StateModel = stateModel(req.tenantDB);
    const CityModel = cityModel(req.tenantDB);
    const accountTransaction = await AccountTransactionModel.findOne({
      where: { id: accountTransactionId, isDelete: 0 },
    });
    // Fetch Contact Details (Basic)
    const contactRaw = await ContactModel.findOne({
      where: {
        id: accountTransaction.contact_masters_id,
        isDelete: 0
      },
      attributes: [
        "id", "person_name", "company_name", "mobile_number",
        "address", "pincode", "country", "state", "city"
      ],
    });

    // Fetch Payment Type Name
    let payment_type_name = null;
    if (accountTransaction.mode) {
      const paymentType = await PaymentTypeModel.findOne({
        where: { id: accountTransaction.mode },
        attributes: ["payment_type_name"],
      });
      payment_type_name = paymentType?.payment_type_name || null;
    }

    // Fetch Country, State, City Names
    let country_name = null;
    let state_name = null;
    let city_name = null;

    if (contactRaw?.country) {
      const country = await CountryModel.findOne({
        where: { id: contactRaw.country },
        attributes: ["country_name"],
      });
      country_name = country?.country_name || null;
    }

    if (contactRaw?.state) {
      const state = await StateModel.findOne({
        where: { id: contactRaw.state },
        attributes: ["state_name"],
      });
      state_name = state?.state_name || null;
    }

    if (contactRaw?.city) {
      const city = await CityModel.findOne({
        where: { id: contactRaw.city },
        attributes: ["city_name"],
      });
      city_name = city?.city_name || null;
    }

    // Prepare final contactDetails object for EJS
    const contactDetails = contactRaw ? {
      person_name: contactRaw.person_name,
      company_name: contactRaw.company_name,
      mobile_number: contactRaw.mobile_number,
      address: contactRaw.address,
      pincode: contactRaw.pincode,
      country_name,
      state_name,
      city_name,
    } : {};
    if (!accountTransaction) {
      return resError({
        ack_msg: "Account Transaction not found.",
        developer_msg: "No account transaction found with the provided ID.",
      });
    }
    const companyDetail = await getCompanyDetailByLoginId(
      accountTransaction.a_application_login_id
    );
    let dynamicPrintView = 1;
    const htmlTemplate = fs.readFileSync(
      path.join(
        __dirnameConstant,
        `../views/account/accountPDFv${dynamicPrintView}.ejs`
      ),
      "utf-8"
    );

    const printSettingModels = printSettingModel(req.tenantDB);

    const printSettings = await printSettingModels.findOne({
      where: {
        type: 12,
        print_version: 1,
        isDelete: 0
      },
      attributes: ["setting_details"]
    });

    const settingDetails = JSON.parse(printSettings?.dataValues?.setting_details || "{}");


    const renderedHtml = ejs.render(htmlTemplate, {
      companyDetails: companyDetail,
      accountTransactions: accountTransaction,
      title: accountTransaction.type === 1 ? "Credit Account Transaction" : "Debit Account Transaction",
      contactDetails,
      payment_type_name,
      currencySymbol: "₹",
      formatNumber: AccountTransactionformatNumber,
      formatDateAndTime: AccountTransactionformatDateAndTime,
      numberToWordsCurrency: AccountTransactionnumberToWordsCurrency,
      remarkToHtml: AccountTransactionremarkToHtml,
      settingDetails: settingDetails
    });
    const uploadDir = path.resolve(
      __dirnameConstant,
      `../../media-folder/accountTransaction/${companyDetail.id.toString()}`
    );
    const filePath = path.join(uploadDir, `account_transaction_${Date.now()}.pdf`);
    const pdfPath = `account_transaction_${Date.now()}.pdf`;
    const fileLinkPath = PDF_LINK_EXTENDED_Account_TRANSACTION + companyDetail.id.toString() + "/" + pdfPath;
    const document = {
      html: renderedHtml,
      data: {},
      path: filePath,
      type: "",
    };
    const options = {
      format: "A5",
      orientation: "portrait",
      border: "10mm",
      footer: {
        height: "5mm",
        contents: {
          default: `<span style="color: #444;">{{page}}</span>/<span>{{pages}}</span>`, // page numbers
        },
      },
    };
    await pdf.create(document, options);
    return resSuccess({
      ack_msg: "Pdf generated",
      data: { fileLinkPath, mobile_number: contactDetails.mobile_number, sessionName: `a${accountTransaction.a_application_login_id}_c${companyDetail.id}` },
    });
    // return resError({
    //   ack_msg: "Something went wrong.",
    //   developer_msg: "Order Id not found.",
    // });
  } catch (error) {
    console.error(error);
    return resBadRequest({ developer_msg: `error ${error}` });
  }
};

export const allAccountTransactionOfContactPDF = async (req, res) => {
  try {
    const { a_application_login_id, contact_master_id, startDate, endDate, creaditFilter, debitFilter } = req.body;
    if (!a_application_login_id || !contact_master_id) {
      return resBadRequest({
        ack_msg: "Missing a_application_login_id or contact_master_id",
      });
    }
    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    if (!findCompanyId) {
      return resBadRequest({ ack_msg: "Company not found for this login ID" });
    }
    const AccountTransactionModel = accountTransactionsModel(req.tenantDB);
    const ContactMasterModel = contactModel(req.tenantDB);
    const companyData = await companyModel.findOne({
      where: {
        id: findCompanyId.company_masters_id,
        isDelete: "0",
      },
      attributes: ["id", "company_name", "address", "company_contact", "company_email", "gst_number", "footer_img", "currency_id", "company_logo", "a_application_login_id"],
    });
    const currency = await currencyModel.findOne({
      where: { id: companyData?.currency_id, isDelete: 0 },
      attributes: ["id", "symbol"],
    });
    const contactData = await ContactMasterModel.findOne({
      where: { isDelete: 0, id: contact_master_id },
      attributes: [
        [
          fn("CONCAT", col("person_name"), " - ", col("mobile_number")),
          "contact_name",
        ],
        "id", "person_name", "company_name", "mobile_number", "email_id", "address", "shipping_address", "gst_number"
      ],
      raw: true,
    });
    const whereClause = {
      isDelete: 0,
      company_masters_id: findCompanyId.company_masters_id,
      contact_masters_id: contact_master_id,
      approve_by_a_application_login_id: { [Op.ne]: 0 }
    };

    // Sirf tab date condition add karo jab startDate aur endDate valid hain
    if (startDate && endDate) {
      // Ensure dates are in YYYY-MM-DD format (or convert if needed)
      whereClause[Op.and] = [
        Sequelize.where(
          Sequelize.fn("DATE", Sequelize.col("payment_date_time")),
          { [Op.gte]: startDate }
        ),
        Sequelize.where(
          Sequelize.fn("DATE", Sequelize.col("payment_date_time")),
          { [Op.lte]: endDate }
        ),
      ];
    }
    // Agar dates nahi hain → koi date filter nahi lagega → all transactions aayengi

    // NEW: Credit / Debit Filter Logic
    if (creaditFilter == 1 && debitFilter != 2) {
      // Only Credit transactions
      whereClause.type = 1;
    } else if (debitFilter == 2 && creaditFilter != 1) {
      // Only Debit transactions
      whereClause.type = 2;
    }
    const transactions = await AccountTransactionModel.findAll({
      where: whereClause,
      order: [["created_date_time", "ASC"]],
      raw: true,
    });
    let running = 0;
    const rowsWithBalance = transactions.map((tx) => {
      const amt = Number(tx.amount || 0);
      if (Number(tx.type) === 1) running += amt;
      if (Number(tx.type) === 2) running -= amt;
      return {
        id: tx.id,
        payment_date: new Date(tx.payment_date_time).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }),
        remark: tx.remark,
        reference: tx.reference_table ? `${tx.reference_table} #${tx.reference_id || ""}` : "-",
        credit: tx.type === 1 ? amt.toLocaleString("en-IN") : "-",
        debit: tx.type === 2 ? amt.toLocaleString("en-IN") : "-",
        balance: running.toLocaleString("en-IN"),
      };
    });

    const totalCredit = transactions.filter(t => t.type === 1).reduce((s, t) => s + Number(t.amount || 0), 0).toLocaleString("en-IN");
    const totalDebit = transactions.filter(t => t.type === 2).reduce((s, t) => s + Number(t.amount || 0), 0).toLocaleString("en-IN");
    const lastRowBalance = rowsWithBalance.length > 0 ? rowsWithBalance[rowsWithBalance.length - 1].balance : "0";

    const fromDate = rowsWithBalance.length > 0 ? rowsWithBalance[0].payment_date : "";
    const toDate = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

    let dynamicPrintView = 1;
    const htmlTemplate = fs.readFileSync(
      path.join(
        __dirnameConstant,
        `../views/account/allAccountTransactionOfContactV${dynamicPrintView}.ejs`
      ),
      "utf-8"
    );

    const printSettingModels = printSettingModel(req.tenantDB);

    const printSettings = await printSettingModels.findOne({
      where: {
        type: 12,
        print_version: 1,
        isDelete: 0
      },
      attributes: ["setting_details"]
    });

    const settingDetails = JSON.parse(printSettings?.dataValues?.setting_details || "{}");

    const renderedHtml = await ejs.render(htmlTemplate,
      {
        companyData,
        contactData,
        rowsWithBalance,
        totalCredit,
        totalDebit,
        lastRowBalance,
        fromDate,
        toDate,
        backendUrl: process.env.BACKEND_OF_SMALL_OFFICE_CRM_END_POINT || "",
        settingDetails: settingDetails,
      });

    const uploadDir = path.resolve(
      __dirnameConstant,
      `../../media-folder/accountTransaction/${companyData.id.toString()}`
    );

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }


    const options = {
      format: "A4",
      orientation: "portrait",
      border: "15mm",
      footer: {
        height: "5mm",
        contents: {
          default: `<span style="color: #444;">{{page}}</span>/<span>{{pages}}</span>`,
        },
      },
    };

    const filePath = path.join(uploadDir, `account_statement_${Date.now()}.pdf`);

    const pdfPath = `${companyData.id.toString()}/account_statement_${Date.now()}.pdf`;


    const document = {
      html: renderedHtml,
      data: {},
      path: filePath,
      type: "",
    };

    const fileLinkPath = PDF_LINK_EXTENDED_Account_TRANSACTION + pdfPath;

    await pdf.create(document, options);

    if (!fs.existsSync(filePath)) {
      console.error("PDF file was not created at:", filePath);
      return resBadRequest({ ack_msg: "Failed to generate PDF file" });
    }

    return resSuccess({
      ack_msg: "Pdf generated",
      data: { fileLinkPath, sessionName: `a${a_application_login_id}_c${companyData.id}`, mobile_number: contactData.mobile_number },
    });
  } catch (error) {
    console.error(error);
    return resBadRequest({ developer_msg: `error ${error}` });
  }
};

export const generateAccountTransactionSampleSheet = async (req, res) => {
  try {
    const { a_application_login_id } = req.body;
    const companyDetail = await getCompanyByLoginId(a_application_login_id);

    const fileName = `sample_account_transaction_sheet_${randomUUID()}`;
    const format = "xlsx";
    const outputDir = `media-folder/exports/account_transactions/${companyDetail.company_masters_id}`;
    const uploadDir = path.resolve(process.cwd(), outputDir);

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const excelColumnDefineArray = {
      client_code: "0001",
      type: "Credit",
      payment_by: "Cash",
      amount: "1000",
      payment_date_time: moment().format("YYYY-MM-DD HH:mm:ss"),
      remark: "Sample account transaction",
    };

    const data = [excelColumnDefineArray];

    const colorColumns = {
      client_code: "FFFF0000",
      type: "FFFF0000",
      payment_by: "FFFF0000",
      amount: "FFFF0000",
    };

    const savedPath = await exportData(data, {
      format,
      fileName,
      columns: null,
      headers: null,
      autoDownload: false,
      outputDir: uploadDir,
      colorColumns,
    });

    const fileUrl = `${EXPORTS_LINK_EXTENDED}account_transactions/${companyDetail.company_masters_id}/${savedPath.file_name}`;

    return resSuccess({
      data: { fileUrl, fileName: savedPath.file_name },
    });
  } catch (error) {
    console.error("generateAccountTransactionSampleSheet Error:", error);
    return resBadRequest({
      ack_msg: "Something went wrong",
      developer_msg: `Error: ${error.message}`,
    });
  }
};

export const importAccountTransactionByExcel = async (req) => {
  try {
    if (!req.file) {
      return resBadRequest({
        ack_msg: "No file uploaded",
        developer_msg: "Please upload an Excel file",
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
    if (!findCompanyId || !findCompanyId.company_masters_id) {
      return resBadRequest({
        ack_msg: "Invalid company ID",
        developer_msg: "Could not retrieve company ID",
      });
    }

    const tenantDB = req.tenantDB;
    const accountTransaction = accountTransactionsModel(tenantDB);
    const contactMaster = contactModel(tenantDB);
    const paymentTypeModelFn = paymentTypeModel(tenantDB);
    const ContactMSG = contactMessageHistory(tenantDB);

    // Check User Approval Rights
    let isApproveRight = false;
    const applicationLoginTypeRightModelIntance = applicationLoginTypeRightModel(tenantDB);
    const userRightsList = await applicationLoginTypeRightModelIntance.findOne({
      where: {
        company_masters_id: findCompanyId.company_masters_id,
        a_application_login_id: a_application_login_id,
        isDelete: 0,
        page_id: PAGE_ID.ACCOUNT_HISTORY,
      },
      attributes: ["a_page_id_rights_jason"],
    });
    if (userRightsList?.a_page_id_rights_jason) {
      try {
        const rights = JSON.parse(userRightsList.a_page_id_rights_jason);
        if (Number(rights.approve) === 1) {
          isApproveRight = true;
        }
      } catch (err) {
        console.error("Rights JSON parse error:", err);
      }
    }

    // Fetch user details for history entry
    const loggedInUser = await loginModel.findOne({
      where: { id: a_application_login_id, isDelete: 0 },
      attributes: ["username"],
    });

    // Load Contacts & Payment Types for lookup
    const contacts = await contactMaster.findAll({
      where: { company_masters_id: findCompanyId.company_masters_id, isDelete: 0 },
      attributes: ["id", "person_name", "company_name", "mobile_number", "client_code"],
      raw: true,
    });

    const paymentTypes = await paymentTypeModelFn.findAll({
      where: {
        isDelete: 0,
        [Op.or]: [
          { company_masters_id: 0 },
          { company_masters_id: findCompanyId.company_masters_id },
        ],
      },
      raw: true,
    });

    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    if (!data || data.length < 2) {
      return resError({
        ack_msg: "No data found in Excel sheet",
        developer_msg: "Excel is empty",
      });
    }

    const headers = data[0].map((c) => (c ? c.toString().trim().toLowerCase() : ""));
    const colIndex = {};
    headers.forEach((col, i) => {
      colIndex[col] = i;
    });

    const rows = data.slice(1);
    let errorRows = [];
    let finalData = [];
    const now = new Date();
    const formattedNowStr = moment(now).format("YYYY-MM-DD HH:mm:ss");

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNumber = i + 2;

      if (!row || row.length === 0 || row.every((c) => c === null || c === undefined || c === "")) {
        continue;
      }

      const rawClientCode = row[colIndex["client_code"]];
      const rawType = row[colIndex["type"]];
      const rawPaymentBy = row[colIndex["payment_by"]] ?? row[colIndex["mode"]];
      const rawAmount = row[colIndex["amount"]];
      const rawPaymentDate = row[colIndex["payment_date_time"]] ?? row[colIndex["payment_date"]];
      const rawRemark = row[colIndex["remark"]];

      // Match Contact by Client Code
      const cleanCode = rawClientCode ? rawClientCode.toString().trim().toLowerCase() : null;
      if (!cleanCode) {
        errorRows.push(`Row ${rowNumber}: Missing client_code`);
        continue;
      }

      let matchedContact = contacts.find((c) => {
        if (cleanCode && c.client_code && c.client_code.toString().trim().toLowerCase() === cleanCode) return true;
        return false;
      });

      if (!matchedContact) {
        errorRows.push(`Row ${rowNumber}: Contact not found for client code '${rawClientCode}'`);
        continue;
      }

      // Validate Type (Credit | Debit)
      if (rawType === undefined || rawType === null || rawType.toString().trim() === "") {
        errorRows.push(`Row ${rowNumber}: Missing type (Must be 'Credit' or 'Debit')`);
        continue;
      }

      const typeStr = rawType.toString().trim().toLowerCase();
      let typeVal = 0;
      if (typeStr === "1" || typeStr === "credit" || typeStr === "cr" || typeStr === "receipt") {
        typeVal = 1;
      } else if (typeStr === "2" || typeStr === "debit" || typeStr === "dr" || typeStr === "payment") {
        typeVal = 2;
      } else {
        errorRows.push(`Row ${rowNumber}: Invalid type '${rawType}'. Must be 'Credit' or 'Debit'`);
        continue;
      }

      // Validate Amount
      const amountVal = Number(rawAmount);
      if (!rawAmount || isNaN(amountVal) || amountVal <= 0) {
        errorRows.push(`Row ${rowNumber}: Invalid amount '${rawAmount}' (Must be greater than 0)`);
        continue;
      }

      // Match Payment Type from Database (payment_by)
      if (!rawPaymentBy || rawPaymentBy.toString().trim() === "") {
        errorRows.push(`Row ${rowNumber}: Missing payment_by`);
        continue;
      }

      const modeStr = rawPaymentBy.toString().trim().toLowerCase();
      const foundPaymentType = paymentTypes.find(
        (pt) => pt.payment_type_name && pt.payment_type_name.toString().trim().toLowerCase() === modeStr
      );

      if (!foundPaymentType) {
        errorRows.push(`Row ${rowNumber}: Invalid payment_by '${rawPaymentBy}'. Payment type not found in system.`);
        continue;
      }

      const modeVal = foundPaymentType.id;
      const paymentTypeName = foundPaymentType.payment_type_name;

      // Format Date
      let paymentDateTime = moment().format("YYYY-MM-DD HH:mm:ss");
      if (rawPaymentDate) {
        if (typeof rawPaymentDate === "number") {
          const parsedDate = XLSX.SSF.parse_date_code(rawPaymentDate);
          paymentDateTime = `${parsedDate.y}-${String(parsedDate.m).padStart(2, "0")}-${String(parsedDate.d).padStart(2, "0")} ${String(parsedDate.H || 0).padStart(2, "0")}:${String(parsedDate.M || 0).padStart(2, "0")}:${String(parsedDate.S || 0).padStart(2, "0")}`;
        } else {
          const parsed = moment(rawPaymentDate.toString().trim(), [
            "YYYY-MM-DD HH:mm:ss",
            "DD-MM-YYYY HH:mm:ss",
            "YYYY-MM-DD",
            "DD-MM-YYYY",
            "DD/MM/YYYY HH:mm:ss",
            "DD/MM/YYYY",
          ]);
          if (parsed.isValid()) {
            paymentDateTime = parsed.format("YYYY-MM-DD HH:mm:ss");
          }
        }
      }

      finalData.push({
        contact_masters_id: matchedContact.id,
        a_application_login_id,
        company_masters_id: findCompanyId.company_masters_id,
        type: typeVal,
        mode: modeVal,
        payment_type_name: paymentTypeName,
        amount: amountVal,
        payment_date_time: paymentDateTime,
        remark: rawRemark ? rawRemark.toString().trim() : "",
        approve_by_a_application_login_id: isApproveRight ? a_application_login_id : 0,
        approve_date_time: isApproveRight ? now : "",
      });
    }

    if (!finalData.length) {
      return resError({
        ack_msg: "No valid transaction data to import",
        developer_msg: errorRows.join("<br/>"),
        data: errorRows.join("<br/>"),
      });
    }

    for (const item of finalData) {
      const createdEntry = await accountTransaction.create({
        contact_masters_id: item.contact_masters_id,
        a_application_login_id: item.a_application_login_id,
        company_masters_id: item.company_masters_id,
        type: item.type,
        mode: item.mode,
        amount: item.amount,
        payment_date_time: item.payment_date_time,
        remark: item.remark,
        approve_by_a_application_login_id: item.approve_by_a_application_login_id,
        approve_date_time: item.approve_date_time,
      });

      // If approved, create message history entry
      if (isApproveRight && createdEntry) {
        const transactionTypeLabel = item.type === 1 ? "Credit" : "Debit";
        const msgBody = {
          contact_masters_id: item.contact_masters_id,
          a_application_login_id,
          company_masters_id: findCompanyId.company_masters_id,
          msg_account_transaction_id: createdEntry.id,
          description:
            `<b>Account History</b><br>` +
            `# ${createdEntry.id}<br>` +
            `Payment Type: ${transactionTypeLabel}<br>` +
            `<b>₹${item.amount.toFixed(2)} By ${item.payment_type_name}</b><br>` +
            `${item.payment_date_time}<br>` +
            (item.remark ? `<i>${item.remark}</i><br>` : ""),
          created_date_time: formattedNowStr,
          message_side: 1,
          message_type_id: 0,
          application_login_name: loggedInUser?.username || null,
        };
        await ContactMSG.create(msgBody);
      }
    }

    return resSuccess({
      ack_msg: `Successfully imported ${finalData.length} account transactions.${isApproveRight ? " All transactions approved automatically." : ""}`,
      data: errorRows.length ? errorRows.join("<br/>") : "",
    });
  } catch (error) {
    console.error("importAccountTransactionByExcel Error:", error);
    return resError({
      ack_msg: "Import failed",
      developer_msg: error.message,
    });
  }
};