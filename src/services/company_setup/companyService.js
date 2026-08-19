import fs from "fs-extra";
import jwt from "jsonwebtoken";
import moment from "moment";
import nodemailer from "nodemailer";
import path from "path";
import Sequelize, { Op } from "sequelize";
import { getTenantDB } from "../../config/dbManager.js";
import { dbConfig } from "../../config/sequelize.js";
import { cartModel } from "../../models/activities/cartsModel.js";
import { contactModel } from "../../models/activities/contactModel.js";
import { reminderMessagesModel } from "../../models/activities/reminderMessagesModel.js";
import { taskManagementModel } from "../../models/activities/taskManagementModel.js";
import applicationLoginHistoriesModel from "../../models/application_login/applicationLoginHistoriesModel.js";
import { applicationLoginTypeRightModel } from "../../models/application_login/applicationLoginTypeRightModel.js";
import applicationPagesModel from "../../models/application_login/applicationPagesModel.js";
import loginModel from "../../models/application_login/loginModel.js";
import categoryModelb2b from "../../models/b2b/categoryModelb2b.js";
import subCategoryModelb2b from "../../models/b2b/subCategoryModelb2b.js";
import companyModel from "../../models/company_setup/companyModel.js";
import companyVsApplicationLoginModel from "../../models/company_setup/companyVsApplicationLoginModel.js";
import companyVsPlansModel from "../../models/configuration/companyVsPlanModel.js";
import planMasterModel from "../../models/configuration/planMasterModel.js";
import planVsPageModel from "../../models/configuration/planVsPageModel.js";
import tenantMasterModel from "../../models/configuration/tenantMasterModel.js";
import { cityModel } from "../../models/masters/cityModel.js";
import { productModel } from "../../models/product_settings/productModel.js";
import websiteBookDemoModel from "../../models/website/websiteBookDemoModel.js";
import websiteContactUsModel from "../../models/website/websiteContactUsModel.js";
import {
  COMPANY_IMG_LINK_EXTENDED,
  ENABLE_TENANT_MIGRATIONS_ON_COMPANY_CREATE,
  JWT_TOKEN_EXPIRES_TIME,
  JWT_TOKEN_SIGNATURE,
  MAIL_SETTING_HOST_NAME,
  MAIL_SETTING_HOST_PORT,
  MAIL_SETTING_HOST_USER_NAME,
  MAIL_SETTING_HOST_USER_PASSWORD,
  MASTER_OTP,
  TENANT_DB_HOST_NAME,
  TENANT_DB_PASSWORD,
  TENANT_DB_USER_NAME,
  WBSITE_LEAD_ASSIGN_ID,
  WEBSITE_LEAD_HANDLE_DB_NAME
} from '../../utils/appConstants.js';

import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";
import { contactMessageHistory } from "../../models/activities/contactMessageHistoryModel.js";
import companyVsSetPrefixModel from "../../models/company_setup/companyVsSetPrefixModel.js";
import companyVsThirdPartyModal from "../../models/company_setup/companyVsThirdPartyModal.js";
import companyVsWhatsappConfigModel from "../../models/company_setup/companyVsWhatsappConfigModel.js";
import refferralCodeMasterModal from "../../models/configuration/refferralCodeMasterModal.js";
import { employeePayrollModel } from "../../models/hr/employeePayrollModel.js";
import logger from "../../utils/logger.js";
import {
  compareDate,
  formatDateAndTimeCreateDateTime,
  generateEmailMessage,
  generateOTP,
  normalizeToTenDigit,
  readFileIfExists,
  resBadRequest,
  resError,
  resSuccess
} from "../../utils/sharedFunctions.js";
import { runTenantMigrationsAndSeeders } from "../../utils/tenantMigrationHelper.js";
import {
  getCompanyByLoginId,
  getCompanyDetailByLoginId,
  loginHistories,
} from "../commonServices.js";
import { toSendMail } from "../company_setup/thirdPartyIntegrationService.js";
import { activationCodeVerifyFromCompany } from "../configuration/activationCodeMasterServices.js";
import { referralCodeVerifyFromCompany } from "../configuration/refferralCodeMasterService.js";


export const getAllCompany = async (req) => {
  let { searchTerm, a_application_login_id, ul, ll } = req.body;

  try {
    let whereClause = {};

    if (searchTerm) {
      whereClause = {
        [Op.and]: [
          {
            [Op.or]: [
              {
                id: {
                  [Op.in]: Sequelize.literal(`
                    (SELECT company_vs_application_logins.company_masters_id
                    FROM company_vs_application_logins
                    WHERE company_vs_application_logins.isDelete = 0 
                    AND company_vs_application_logins.a_application_login_id = ${a_application_login_id})
                  `),
                },
              },
              { a_application_login_id: a_application_login_id },
            ],
          },
          {
            [Op.or]: [
              { company_email: { [Op.like]: "%" + searchTerm + "%" } },
              { company_name: { [Op.like]: "%" + searchTerm + "%" } },
            ],
          },

          { isDelete: "0" },
        ],
      };
    } else {
      whereClause = {
        [Op.or]: [
          {
            id: {
              [Op.in]: Sequelize.literal(`
                (SELECT company_vs_application_logins.company_masters_id
                FROM company_vs_application_logins
                WHERE company_vs_application_logins.isDelete = 0 
                AND company_vs_application_logins.a_application_login_id = ${a_application_login_id})
              `),
            },
          },
          { a_application_login_id: a_application_login_id },
        ],

        isDelete: "0",
      };
    }
    const companyResult = await companyModel.findAll({
      where: whereClause,
      ...(searchTerm
        ? {}
        : { limit: Number(ll) || 10, offset: Number(ul) || 0 }),
      // ...(searchTerm ? {} : { }),
      order: [["s_timestemp", "DESC"]],
      attributes: {
        include: [
          [
            Sequelize.literal(
              `(SELECT company_vs_application_logins.company_flag  FROM company_vs_application_logins WHERE company_vs_application_logins.company_masters_id = company_masters.id AND  company_vs_application_logins.a_application_login_id = ${a_application_login_id} ORDER by id DESC LIMIT 1)`
            ),
            "company_flag",
          ],
        ],
      },
    });

    const planIds = [...new Set(companyResult.map(c => c.plan_id).filter(Boolean))];

    const plans = await planMasterModel.findAll({
      where: { id: { [Op.in]: planIds } },
      attributes: ["id", "plan_name"],
      raw: true
    });

    const planMap = new Map(plans.map(p => [p.id, p.plan_name]));



    const enrichedResult = companyResult.map((user) => {
      const currentDate = new Date();
      const planExpiryDate = new Date(user.plan_expiry_date);

      const normalizedCurrentDate = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth(),
        currentDate.getDate()
      );
      const normalizedPlanExpiryDate = new Date(
        planExpiryDate.getFullYear(),
        planExpiryDate.getMonth(),
        planExpiryDate.getDate()
      );
      const timeDifference =
        normalizedPlanExpiryDate.getTime() - normalizedCurrentDate.getTime();
      const daysUntilExpiry = Math.ceil(timeDifference / (1000 * 60 * 60 * 24));
      const planExpiryFlag =
        normalizedPlanExpiryDate < normalizedCurrentDate ? 1 : 0;

      const expiryCountdown =
        daysUntilExpiry <= 5 && daysUntilExpiry >= 0 ? daysUntilExpiry : null;

      const expiryMsg =
        expiryCountdown !== null
          ? `Your Account will Expire in ${expiryCountdown} Days`
          : "";

      return {
        ...user.toJSON(),
        plan_expiry_flag: planExpiryFlag,
        expiry_msg: expiryMsg,
        plan_name: planMap.get(user.plan_id) || "",
        created_date_time: formatDateAndTimeCreateDateTime(
          user.created_date_time
        ),
        header_img: user.dataValues.header_img
          ? COMPANY_IMG_LINK_EXTENDED + user.dataValues.header_img
          : "",
        footer_img: user.dataValues.footer_img
          ? COMPANY_IMG_LINK_EXTENDED + user.dataValues.footer_img
          : "",
        company_logo: user.dataValues.company_logo
          ? COMPANY_IMG_LINK_EXTENDED + user.dataValues.company_logo
          : "",
        company_sign: user.dataValues.company_sign
          ? COMPANY_IMG_LINK_EXTENDED + user.dataValues.company_sign
          : "",
        company_catalog: user.dataValues.company_catalog
          ? COMPANY_IMG_LINK_EXTENDED + user.dataValues.company_catalog
          : "",
        banner_img_one: user.dataValues.banner_img_one
          ? COMPANY_IMG_LINK_EXTENDED + user.dataValues.banner_img_one
          : "",
        banner_img_two: user.dataValues.banner_img_two
          ? COMPANY_IMG_LINK_EXTENDED + user.dataValues.banner_img_two
          : "",
      };
    });

    const activeCompanyId = req.headers?.["x-company-id"] || req.store?.companyId;
    if (activeCompanyId && enrichedResult.length > 0) {
      const activeNum = Number(activeCompanyId);
      enrichedResult.sort((a, b) => {
        if (a.id === activeNum) return -1;
        if (b.id === activeNum) return 1;
        return 0;
      });
    }

    if (companyResult)
      return resSuccess({
        ack_msg: "Company Fetch Successfully",
        data: { item: enrichedResult },
      });
    else {
      return resError({
        ack_msg: "No company",
        developer_msg: "Data not found",
      });
    }
  } catch (e) {
    return resBadRequest({
      developer_msg: `error ${e.message}`,
    });
    throw e;
  }
};
export const QRCompany = async (req) => {
  let { a_application_login_id, company_masters_id } = req.body || {};
  const activeCompanyHeader = req?.headers?.["x-company-id"];

  try {
    let targetCompanyId = company_masters_id || (activeCompanyHeader ? Number(activeCompanyHeader) : null);

    if (!targetCompanyId) {
      const findCompanyId = await getCompanyByLoginId(a_application_login_id);
      targetCompanyId = findCompanyId?.company_masters_id;
    }

    let whereClause = { isDelete: '0' };
    if (targetCompanyId) {
      whereClause.id = targetCompanyId;
    } else if (a_application_login_id) {
      whereClause.a_application_login_id = a_application_login_id;
    }

    const company = await companyModel.findOne({
      where: whereClause,
      attributes: ["id", "qr_code"],
    });

    if (!company) {
      return resBadRequest({
        developer_msg: "Company not found",
      });
    }
    if (!company.qr_code) {
      const newQrCode = Math.floor(
        100000000000 + Math.random() * 900000000000
      ).toString();

      // Update only this specific company row
      await companyModel.update(
        { qr_code: newQrCode },
        { where: { id: company.id, isDelete: '0' } }
      );

      // Reflect it on the instance so we can return it
      company.qr_code = newQrCode;
    }

    return resSuccess({
      data: { qrCode: company.qr_code },
    });
  } catch (e) {
    return resError({
      ack_msg: "Failed to Generate or fetch QR Code",
      developer_msg: e.message,
    });
  }
};
export const companyDelete = async (req) => {
  let { a_application_login_id, isDelete } = req.body;

  try {
    const companyPayload = {
      isDelete: isDelete ? isDelete : 1,
    };

    const companyResult = await companyModel.update(companyPayload, {
      where: { a_application_login_id: a_application_login_id },
    });

    if (companyResult) {
      const findCompanyId = await companyVsApplicationLoginModel.findOne({
        where: { a_application_login_id: a_application_login_id },
        attributes: ["company_masters_id"],
      });
      const companyId = findCompanyId.dataValues.company_masters_id;
      const companyVsApplicationPayload = {
        isDelete: isDelete | 1,
      };
      const companyDeleteResult = companyVsApplicationLoginModel.update(
        companyVsApplicationPayload,
        {
          where: { company_masters_id: companyId },
        }
      );
      return resSuccess({
        data: { item: companyDeleteResult },
      });
    } else {
      return resError({
        ack_msg: "No company",
        developer_msg: "Data not found",
      });
    }
  } catch (e) {
    return resBadRequest({
      developer_msg: `error ${e.message}`,
    });
  }
};

export const companySendOtpForEmail = async (req) => {
  let { company_id, isDelete } = req.body;

  try {
    const resultCompanyEmail = await companyModel.findOne({
      where: { id: company_id, isDelete: "0" },
      attributes: ["id", "company_email", "a_application_login_id"],
    });

    if (!resultCompanyEmail) {
      return resError({
        ack_msg: "Your emailId is not register",
        developer_msg: "User data not data not found",
      });
    }

    let otp;
    otp = generateOTP(6);
    let contactBody = {
      company_otp: otp,
    };
    const user = await companyModel.update(contactBody, {
      where: { id: company_id, isDelete: "0" },
    });

    if (!user) {
      return resError({
        ack_msg: "User Detail not varified",
        developer_msg: "User data not data not found",
      });
    }

    const company_email = resultCompanyEmail.company_email;
    if (!company_email) {
      return resError({
        ack_msg: "No recovery email found",
        developer_msg: "Recovery email is not set for this user",
      });
    }

    // Create transporter
    let transporter;
    let mailOptions;

    // WhatsApp OTP email configuration
    transporter = nodemailer.createTransport({
      host: MAIL_SETTING_HOST_NAME,
      port: MAIL_SETTING_HOST_PORT,
      secure: true,
      auth: {
        user: MAIL_SETTING_HOST_USER_NAME,
        pass: MAIL_SETTING_HOST_USER_PASSWORD,
      },
    });

    mailOptions = {
      from: MAIL_SETTING_HOST_USER_NAME,
      to: company_email,
      subject: "Deskflow CRM Account Verification OTP",
      html: generateEmailMessage({ otp }) || `Your OTP is: ${otp}`,
    };

    // Verify transporter and send email
    try {
      await transporter.verify();
      const info = await transporter.sendMail(mailOptions);

      return resSuccess({
        ack_msg: "Email sent successfully",
        developer_msg: "",
        // data: { user, info, otp },
      });
    } catch (error) {
      return resError({
        ack_msg: "Failed to send email",
        developer_msg: `Email sending failed: ${error.message}`,
      });
    }
  } catch (error) {
    console.log("companySendOtpForEmail Error", error)
    return resBadRequest({
      developer_msg: `${error}`,
    });
  }
};

export const verifyEmailOtpCompany = async (req, res) => {
  let { company_otp, company_id } = req.body;

  try {
    let checkDuplicate;
    if (!company_otp) {
      return resError({
        ack_msg: "Please write otp",
        developer_msg: "otp is blank",
      });
    }
    if (company_otp == MASTER_OTP) {
      checkDuplicate = {
        id: company_id,
        isDelete: "0",
      };
    } else {
      checkDuplicate = {
        id: company_id,
        company_otp,
        isDelete: "0",
      };
    }
    const user = await companyModel.findOne({
      where: checkDuplicate,
    });
    if (user) {
      const companyBody = {
        is_email_verified: 1,
      };
      const resultCompany = await companyModel.update(companyBody, {
        where: checkDuplicate,
      });
      if (!resultCompany) {
        return resError({
          developer_msg: "Data not match",
        });
      }
      return resSuccess({
        data: resultCompany,
        developer_msg: "Your Email Verified successfully ",
      });
    } else {
      return resError({
        ack_msg: "Please enter valid otp",
        developer_msg: "Data not match",
      });
    }
  } catch (error) {
    return resBadRequest({
      developer_msg: `${error}`,
    });
    throw error;
  }
};

export const companyCreate = async (req, res) => {
  let {
    company_contact,
    company_name,
    company_email,
    a_application_login_id,
    activation_code,
    category_id_b2b,
    sub_category_id_b2b,
    referral_code,
    gst_number
  } = req.body;
  let currentTimestamp = Date.now();


  try {
    if (!company_contact || !company_name) {
      return resError({
        ack_msg: "Name or mobile number is not fill",
        developer_msg: "company contact or company name is blank",
      });
    }
    const checkInvitationKey = await companyModel.findOne({
      where: { invitation_key: currentTimestamp, isDelete: 0 },
      attributes: ["id", "invitation_key"],
    });
    if (!checkInvitationKey) {
      currentTimestamp = Date.now();
    } else {
      currentTimestamp = Date.now();
    }
    const checkDuplication = await companyModel.findOne({
      where: { company_contact, isDelete: 0, a_application_login_id },
      attributes: ["id", "company_contact"],
    });
    const newQrCode = Math.floor(
      100000000000 + Math.random() * 900000000000
    ).toString();
    if (!checkDuplication?.dataValues?.company_contact) {
      if (activation_code && activation_code.trim() !== "") {
        const requestData = {
          activation_code: activation_code.trim(),
          contact_number: company_contact,
          company_name: company_name,
          company_email: company_email,
          invitation_key: currentTimestamp + `a` + a_application_login_id,
          a_application_login_id: a_application_login_id,
          referral_code: referral_code,
          gst_number: gst_number,
          qr_code: newQrCode
        };
        console.log("requestDataforactivation", requestData);

        const createVaiActivationCode = await activationCodeVerifyFromCompany(
          requestData
        );
        return createVaiActivationCode;
      } else {
        const companyBody = {
          company_name: company_name,
          company_contact: company_contact,
          printed_number: company_contact,
          company_email: company_email,
          invoice_prefix: "INV",
          invoice_title: "Invoice",
          invoice_doc_no: "",
          invoice_view_color: "#d3d3d3",
          invoice_view_formate: 1,
          order_prefix: "ORD",
          order_title: "Order",
          order_doc_no: "",
          order_view_color: "#d3d3d3",
          order_view_formate: 1,
          workorder_prefix: "WRD",
          workorder_title: "WorkOrder",
          workorder_doc_no: "",
          workorder_view_color: "#d3d3d3",
          workorder_view_formate: 1,
          quotation_prefix: "QUO",
          quotation_title: "Quotation",
          quotation_doc_no: "",
          quotation_view_color: "#d3d3d3",
          quotation_view_formate: 1,
          proforma_invoice_prefix: "PRF",
          proforma_invoice_title: "Proforma Invoice",
          proforma_invoice_doc_no: "",
          proforma_invoice_view_color: "#d3d3d3",
          proforma_invoice_view_formate: 1,
          purchase_prefix: "PI",
          purchase_title: "Purchase",
          purchase_doc_no: "",
          purchase_view_color: "#d3d3d3",
          purchase_view_formate: 1,
          purchase_ord_prefix: "PO",
          purchase_order_title: "Purchase Order",
          purchase_order_doc_no: "",
          purchase_order_view_color: "#d3d3d3",
          purchase_order_view_formate: 1,
          return_sales_invoice_prefix: "RSI",
          return_sales_invoice_title: "Return Sales Invoice",
          return_sales_invoice_doc_no: "",
          return_sales_invoice_view_color: "#d3d3d3",
          return_sales_invoice_view_formate: 1,
          return_purchase_invoice_prefix: "RPI",
          return_purchase_invoice_title: "Return Purchase Invoice",
          return_purchase_invoice_doc_no: "",
          return_purchase_invoice_view_color: "#d3d3d3",
          return_purchase_invoice_view_formate: 1,
          inward_prefix: "GRN",
          inward_title: "Goods Received Note",
          inward_doc_no: "",
          inward_view_color: "#d3d3d3",
          inward_view_formate: 1,
          dispatch_prefix: "DIS",
          dispatch_title: "Dispatch",
          dispatch_doc_no: "",
          dispatch_view_color: "#d3d3d3",
          dispatch_view_formate: 1,
          in_order_image_view: 1,
          watermark_in_print: 1,
          view_inquiry_form_in_contact: 1,
          same_product_multiple_in_cart: 1,
          is_contact_validation: 1,
          is_strict_check_product_stock: 1,
          is_strict_wharehouse_wise_product_stock_check: 1,
          category_id_b2b: Number(category_id_b2b),
          sub_category_id_b2b: Number(sub_category_id_b2b),
          invitation_key: currentTimestamp + `a` + a_application_login_id,
          a_application_login_id: a_application_login_id,
          plan_id: 0,
          gst_number: gst_number,
          quotation_packing_charge_title: "Packing Forwarding charge",
          quotation_transport_charge_title: "Transport charge",
          quotation_tcs_title: "TCS",
          quotation_tsc_percentage: "0.0001",
          proforma_invoice_packing_charge_title: "Packing Forwarding charge",
          proforma_invoice_transport_charge_title: "Transport charge",
          proforma_invoice_tcs_title: "TCS",
          proforma_invoice_tsc_percentage: "0.0001",
          order_packing_charge_title: "Packing Forwarding charge",
          order_transport_charge_title: "Transport charge",
          order_tcs_title: "TCS",
          order_tsc_percentage: "0.0001",
          sales_invoice_packing_charge_title: "Packing Forwarding charge",
          sales_invoice_transport_charge_title: "Transport charge",
          sales_invoice_tcs_title: "TCS",
          sales_invoice_tsc_percentage: "0.0001",
          return_sales_invoice_packing_charge_title: "Packing Forwarding charge",
          return_sales_invoice_transport_charge_title: "Transport charge",
          return_sales_invoice_tcs_title: "TCS",
          return_sales_invoice_tsc_percentage: "0.0001",
          purchase_order_packing_charge_title: "Packing Forwarding charge",
          purchase_order_transport_charge_title: "Transport charge",
          purchase_order_tcs_title: "TCS",
          purchase_order_tsc_percentage: "0.0001",
          purchase_invoice_packing_charge_title: "Packing Forwarding charge",
          purchase_invoice_transport_charge_title: "Transport charge",
          purchase_invoice_tcs_title: "TCS",
          purchase_invoice_tsc_percentage: "0.0001",
          return_purchase_invoice_packing_charge_title: "Packing Forwarding charge",
          return_purchase_invoice_transport_charge_title: "Transport charge",
          return_purchase_invoice_tcs_title: "TCS",
          return_purchase_invoice_tsc_percentage: "0.0001",
          work_order_packing_charge_title: "Packing Forwarding charge",
          work_order_transport_charge_title: "Transport charge",
          work_order_tcs_title: "TCS",
          work_order_tsc_percentage: "0.0001",
          inward_packing_charge_title: "Packing Forwarding charge",
          inward_transport_charge_title: "Transport charge",
          inward_tcs_title: "TCS",
          inward_tsc_percentage: "0.0001",
          dispatch_packing_charge_title: "Packing Forwarding charge",
          dispatch_transport_charge_title: "Transport charge",
          dispatch_tcs_title: "TCS",
          dispatch_tsc_percentage: "0.0001",
          order_qty_unit: "1",
          purchase_invoice_sr_number_generate_flag: "1",
          return_sales_invoice_sr_number_generate_flag: "1",
          currency_id: 3,
          country_id: 101,
          state_id: 4030,
          qr_code: newQrCode
        };

        if (referral_code && referral_code !== "") {
          const referralData = await referralCodeVerifyFromCompany({
            referral_code,
          });
          if (referralData.ack == 1) {
            companyBody.referral_code_id = referralData.data.referral_code_id;
          } else {
            return resError({
              ack_msg: "Referral code does not match",
              developer_msg: "Invalid referral code",
            });
          }
        }


        const resultCompanyCreate = await companyModel.create(companyBody);
        if (resultCompanyCreate) {
          const companyVsApplicationsBody = {
            company_masters_id: resultCompanyCreate?.dataValues?.id,
            company_flag: 1,
            a_application_login_id: a_application_login_id,
          };
          const resultCompanyVsApplicationLoginCreate =
            await companyVsApplicationLoginModel.create(
              companyVsApplicationsBody
            );
          if (resultCompanyVsApplicationLoginCreate) {
            const tenantDBFind = await tenantMasterModel.findOne({
              where: { isDelete: 0, db_name: WEBSITE_LEAD_HANDLE_DB_NAME },
              attributes: ["a_application_login_id", "company_masters_id"],
            });
            if (!tenantDBFind) {
              return resError({ ack_msg: "Tenant Not Found" });
            }

            const tenantDB = (
              await getTenantDB(
                tenantDBFind.a_application_login_id,
                tenantDBFind.company_masters_id
              )
            ).sequelize;

            const contactModels = contactModel(tenantDB);
            const CTMModel = contactMessageHistory(tenantDB);

            // Comprehensive contact duplication check
            const rawMobile = company_contact ? String(company_contact).trim() : "";
            const normalizedMobile = normalizeToTenDigit(rawMobile);

            const mobileConditions = [];
            if (normalizedMobile) {
              mobileConditions.push({ mobile_number: normalizedMobile });
              mobileConditions.push({ raw_mobile_number: normalizedMobile });
            }
            if (rawMobile) {
              mobileConditions.push({ mobile_number: rawMobile });
              mobileConditions.push({ raw_mobile_number: rawMobile });
            }
            if (normalizedMobile && normalizedMobile.startsWith("91") && normalizedMobile.length === 12) {
              const tenDigit = normalizedMobile.slice(2);
              mobileConditions.push({ mobile_number: tenDigit });
              mobileConditions.push({ raw_mobile_number: tenDigit });
            }

            let contactCreate = null;
            if (mobileConditions.length > 0) {
              contactCreate = await contactModels.findOne({
                where: {
                  [Op.or]: mobileConditions,
                  company_masters_id: tenantDBFind.company_masters_id,
                  isDelete: 0,
                },
              });
            }

            let isNewContact = false;

            if (!contactCreate) {
              isNewContact = true;

              contactCreate = await contactModels.create({
                person_name: company_name,
                email_id: company_email,
                company_name: company_name,
                mobile_number: normalizedMobile || rawMobile || "",
                raw_mobile_number: rawMobile || "",
                contact_status: -1,
                a_application_login_id: tenantDBFind.a_application_login_id,
                company_masters_id: tenantDBFind.company_masters_id,
                assinged_to_work_a_application_id: WBSITE_LEAD_ASSIGN_ID,
                source_type_id: -8,
                is_read_by_a_application_login_id: "",
                is_unread: 1,
              });
            }
            const formatted = moment().format("YYYY-MM-DD HH:mm:ss");
            const messageBody = {
              contact_masters_id: contactCreate.dataValues.id,
              a_application_login_id: tenantDBFind.a_application_login_id,
              company_masters_id: tenantDBFind.company_masters_id,
              description:
                `Title: New Customer Join Our System<br>` +
                `Name: ${company_name || ""}<br>` +
                `Email: ${company_email || ""}<br>` +
                `<b>Mobile No.:</b> <b>${company_contact}</b><br>`,
              created_date_time: formatted,
              message_side: "2",
              message_type_id: "0",
            };

            await CTMModel.create(messageBody);

            return resSuccess({
              data: { item: resultCompanyCreate },
              developer_msg: "Your Company is Created",
            });
          } else {
            return resError({
              developer_msg: "CompanyVsApplicationLogin create issue",
            });
          }
        } else {
          return resError({
            developer_msg: "Company create issue",
          });
        }
      }
    } else {
      return resError({
        ack_msg: "Your Number is already with us",
        developer_msg: "Company Contact is Duplication",
      });
    }
  } catch (error) {
    return resBadRequest({
      developer_msg: `${error.message}`,
    });
  }
};

export const companyPlaneCreate = async (req) => {
  try {
    const {
      company_id,
      plan_number,
      a_application_login_id,
      plan_month,
      application_login_name,
      trail_days,
    } = req.body;
    const formattedDateAndTime = moment().format("YYYY-MM-DD HH:mm:ss");
    let isRenewal = 0;
    let getAllCompanyDetail;
    // const applicationLoginTypeRightModelIntance = applicationLoginTypeRightModel(req.tenantDB);
    let findCompanyId = await getCompanyByLoginId(a_application_login_id);

    if (findCompanyId) {
      getAllCompanyDetail = await companyModel.findOne({
        where: {
          id: findCompanyId.company_masters_id,
          isDelete: "0",
        },
        attributes: ["plan_expiry_date", "plan_id"],
      });
    }

    if (
      getAllCompanyDetail?.dataValues?.plan_expiry_date &&
      getAllCompanyDetail.dataValues.plan_expiry_date !== "" &&
      getAllCompanyDetail.dataValues.plan_expiry_date !== "0000-00-00"
    ) {
      const getdate = compareDate(
        getAllCompanyDetail.dataValues.plan_expiry_date
      );

      if (getdate == 1) {
        isRenewal = 1;
      } else {
        isRenewal = 0;
      }
    }

    let expiryDate;

    if (trail_days !== 0 && isRenewal !== 1) {
      expiryDate = moment().add(trail_days, "days").format("YYYY-MM-DD");
    } else {
      expiryDate = moment().add(plan_month, "months").format("YYYY-MM-DD");
    }

    // Store old plan id before update
    const oldPlanId = getAllCompanyDetail?.dataValues?.plan_id;

    const companyBody = {
      plan_id: plan_number,
      plan_date: moment().format("YYYY-MM-DD"),
      plan_expiry_date: expiryDate,
    };

    const [resultPlanCreate] = await companyModel.update(companyBody, {
      where: { id: findCompanyId.company_masters_id, isDelete: 0 },
    });

    if (!resultPlanCreate) {
      return resError({ developer_msg: "Company Plan creation issue" });
    }

    // Update plan-wise rights if tenant database already exists (upgrade/renewal case)
    try {
      const tenantRecord = await tenantMasterModel.findOne({
        where: {
          company_masters_id: findCompanyId.company_masters_id,
          isDelete: 0,
        },
        attributes: ["id"],
      });

      if (tenantRecord) {
        const tenantDBInfo = await getTenantDB(a_application_login_id, findCompanyId.company_masters_id);
        if (tenantDBInfo?.sequelize) {
          await rightsAdd({
            company_id: findCompanyId.company_masters_id,
            tenantDB: tenantDBInfo.sequelize,
            a_application_login_id,
            plan_number: plan_number
          });
        }
      }
    } catch (rightsErr) {
      console.error("Error adding plan rights in companyPlaneCreate:", rightsErr.message);
    }

    // Skip rights update if renewing SAME plan
    if (oldPlanId && oldPlanId === plan_number) {
      return resSuccess({
        data: { item: resultPlanCreate },
        developer_msg: "Your Plan is renewed, rights unchanged",
      });
    }
    return resSuccess({
      data: { item: resultPlanCreate },
      developer_msg: "Your Plan is Created/Updated and rights refreshed",
    });
  } catch (error) {
    console.error("companyPlaneCreate Error", error);
    return resBadRequest({ developer_msg: `${error}` });
  }
};



export const newCompanyStep = async (req, res) => {
  const { company_id, a_application_login_id, application_login_name } =
    req.body;

  try {
    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    if (!findCompanyId || !findCompanyId.company_masters_id) {
      return resBadRequest({
        ack_msg: "Invalid company ID",
        developer_msg:
          "Could not retrieve company ID for the provided login ID",
      });
    }

    const token = jwt.sign({ a_application_login_id }, JWT_TOKEN_SIGNATURE, {
      expiresIn: JWT_TOKEN_EXPIRES_TIME,
    });

    const checkTentat = await tenantMasterModel.findOne({
      where: {
        company_masters_id: findCompanyId.company_masters_id,
        isDelete: 0,
      },
      attributes: ["id"],
    });

    // ================== RENEW CASE ==================
    if (checkTentat !== null) {

      // Initialize Tenant DB
      req.headers["x-tenant-id"] = a_application_login_id;
      await new Promise((resolve, reject) => {
        tenantMiddleware(req, res, (err) => (err ? reject(err) : resolve()));
      });

      if (!req.tenantDB) {
        return resError(res, { ack_msg: "Tenant DB not initialized" });
      }

      const loginInfo = await companyModel.findOne({
        where: {
          a_application_login_id: a_application_login_id,
          isDelete: "0",
        },
        attributes: ["id", "company_email", "plan_id"],
        order: [["id", "DESC"]],
      });

      // Only call rightsAdd in renew case
      await rightsAdd({
        company_id: findCompanyId.company_masters_id,
        tenantDB: req.tenantDB,
        a_application_login_id,
        plan_number: loginInfo?.plan_id
      });
      const employeePayrollModelInstance = employeePayrollModel(req.tenantDB);

      const existingPayroll = await employeePayrollModelInstance.findOne({
        where: {
          company_masters_id: findCompanyId.company_masters_id,
          a_application_login_id,
          isDelete: 0,
        },
      });

      if (!existingPayroll) {
        await employeePayrollModelInstance.create({
          company_masters_id: findCompanyId.company_masters_id,
          a_application_login_id,
          daily_in_time: "09:00:00",
          daily_out_time: "18:00:00",
          daily_working_hours: "09:00",
          daily_break_hours: "01:00",
          min_present_hours: "08:00",
          half_day_hours: "04:00",
          grace_period: 10,
          compulsary_attendance: 0,
          compulsary_attendance_image: 0,
          week_off_days: 0,
        });
      }
      await loginHistories({ a_application_login_id });

      return resSuccess({
        ack_msg: "Congratulations! Your Plan has been Updated successfully.",
        developer_msg: "",
        data: token,
      });
    }

    // ================== CREATE CASE ==================
    const resultStepCompany = await handleCategoryAction(
      "create",
      a_application_login_id,
      findCompanyId.company_masters_id,
      application_login_name
    );

    if (resultStepCompany.success) {

      req.headers["x-tenant-id"] = a_application_login_id;
      await new Promise((resolve, reject) => {
        tenantMiddleware(req, res, (err) => (err ? reject(err) : resolve()));
      });

      if (!req.tenantDB) {
        return resError(res, { ack_msg: "Tenant DB not initialized" });
      }

      const loginInfo = await companyModel.findOne({
        where: {
          a_application_login_id: a_application_login_id,
          isDelete: "0",
        },
        attributes: ["id", "company_email", "plan_id"],
        order: [["id", "DESC"]],
      });

      await rightsAdd({
        company_id: findCompanyId.company_masters_id,
        tenantDB: req.tenantDB,
        a_application_login_id,
        plan_number: loginInfo?.plan_id
      });

      const employeePayrollModelInstance = employeePayrollModel(req.tenantDB);

      const existingPayroll = await employeePayrollModelInstance.findOne({
        where: {
          company_masters_id: findCompanyId.company_masters_id,
          a_application_login_id,
          isDelete: 0,
        },
      });

      if (!existingPayroll) {
        await employeePayrollModelInstance.create({
          company_masters_id: findCompanyId.company_masters_id,
          a_application_login_id,
          daily_in_time: "09:00:00",
          daily_out_time: "18:00:00",
          daily_working_hours: "09:00",
          daily_break_hours: "01:00",
          min_present_hours: "08:00",
          half_day_hours: "04:00",
          grace_period: 10,
          compulsary_attendance: 0,
          compulsary_attendance_image: 0,
          week_off_days: 0,
        });
      }


      await loginHistories({ a_application_login_id });

      if (loginInfo?.company_email) {
        const company_email = loginInfo.company_email;

        const transporter = nodemailer.createTransport({
          host: MAIL_SETTING_HOST_NAME,
          port: MAIL_SETTING_HOST_PORT,
          secure: true,
          auth: {
            user: MAIL_SETTING_HOST_USER_NAME,
            pass: MAIL_SETTING_HOST_USER_PASSWORD,
          },
        });

        try {
          await transporter.verify();

          const mailOptions = {
            from: MAIL_SETTING_HOST_USER_NAME,
            to: company_email,
            subject: "New Company Creation in Deskflow CRM",
            html: `
    <p>Dear Customer,</p>

    <p>Thank you for choosing <strong>Deskflow CRM</strong>.</p>

    <p>
      We're happy to inform you that your company profile has been successfully created in our system.
    </p>

    <p>
      Our team will now proceed with the initial setup to ensure everything is configured correctly for your business.
      Once the setup is completed, we will share the next steps along with your login details and onboarding schedule.
    </p>

    <p>If you need any assistance in the meantime, please feel free to reach out:</p>

    <p>
      <strong>Sales:</strong> sales@deskflowcrm.com<br>
      <strong>Support:</strong> support@deskflowcrm.com<br>
      <strong>Support Phone:</strong> +91 816 082 9487
    </p>

    <p>We look forward to supporting your business with <strong>Deskflow CRM</strong>.</p>

    <p>Warm regards,<br><strong>Deskflow CRM Team</strong></p>
  `,
          };

          await transporter.sendMail(mailOptions);
        } catch (err) {
          logger.error("Error with email transport or sending:", err);
        }
      }

      return resSuccess({
        ack_msg: "Congratulations! Your company has been created successfully.",
        developer_msg: resultStepCompany.message,
        data: token,
      });

    } else {
      return resError({
        ack_msg:
          "Something went wrong, and your company has not been created yet due to a technical issue. Please retry or Contact To Us for Assistance.",
        developer_msg:
          resultStepCompany.message ||
          resultStepCompany.error ||
          "Database creation failed",
      });
    }

  } catch (error) {
    const errorMessage = error.message || error.toString() || "Unknown error";
    console.error("Error in newCompanyStep:", error);

    return resBadRequest({
      developer_msg: `Error: ${errorMessage}`,
      error_details: error.stack,
    });
  }
};


const executeSQLFile = async (
  dbName,
  sqlFileName,
  applicationId,
  companyId,
  application_login_name
) => {
  let mysqlSequelize = null;

  try {
    logger.info(`Starting database creation for: ${dbName}`);

    const filePath = path.join(
      process.cwd(),
      "new_company_creation_sql/SQL/create-company",
      sqlFileName
    );

    // Check if SQL file exists
    try {
      await fs.access(filePath);
    } catch (fileError) {
      throw new Error(`SQL file not found at: ${filePath}`);
    }

    mysqlSequelize = new Sequelize(
      dbConfig.DB,
      dbConfig.USER,
      dbConfig.PASSWORD,
      {
        host: dbConfig.HOST,
        dialect: dbConfig.dialect,
        timezone: "+05:30",
        define: {
          timestamps: false,
        },
        dialectOptions: {
          multipleStatements: true,
        },
      }
    );

    const formatDateAndTimeCreateDateTime = moment(new Date()).format(
      "YYYY-MM-DD HH:mm:ss"
    );

    let sql = await fs.readFile(filePath, "utf8");
    sql = sql
      .replace(/\$\{dbName\}/g, dbName)
      .replace(/\$\{applicationId\}/g, applicationId)
      .replace(/\$\{companyId\}/g, companyId)
      .replace(/\$\{applicationName\}/g, application_login_name)
      .replace(/\$\{dbHost\}/g, TENANT_DB_HOST_NAME)
      .replace(/\$\{dbUser\}/g, TENANT_DB_USER_NAME)
      .replace(/\$\{dbPassword\}/g, TENANT_DB_PASSWORD)
      .replace(/\$\{createDateTime\}/g, formatDateAndTimeCreateDateTime);

    logger.info(`Executing SQL for database: ${dbName}`);
    await mysqlSequelize.query(sql);
    logger.info(`Main SQL execution completed for database: ${dbName}`);

    const findCompanyDetail = await getCompanyDetailByLoginId(applicationId);
    if (findCompanyDetail) {
      const partialName = `c${findCompanyDetail.category_id_b2b}_s${findCompanyDetail.sub_category_id_b2b}.sql`;
      const directoryPath = path.join(
        process.cwd(),
        "uploads",
        "SQL",
        "create-comp-category-wise",
        partialName
      );

      const findIsElites = await readFileIfExists(directoryPath);
      if (findIsElites) {
        logger.info(`Executing category-specific SQL for database: ${dbName}`);
        let sqlCategoryWiseCompany = await fs.readFile(findIsElites, "utf8");
        sqlCategoryWiseCompany = sqlCategoryWiseCompany
          .replace(/\$\{dbName\}/g, dbName)
          .replace(/\$\{applicationId\}/g, applicationId)
          .replace(/\$\{companyId\}/g, companyId)
          .replace(/\$\{createDateTime\}/g, formatDateAndTimeCreateDateTime);
        await mysqlSequelize.query(sqlCategoryWiseCompany);
        logger.info(`Category-specific SQL execution completed for database: ${dbName}`);
      }
    }

    await mysqlSequelize.close();
    logger.info(`Database creation completed for: ${dbName}`);

    // Check if tenant migrations and seeders should run
    if (ENABLE_TENANT_MIGRATIONS_ON_COMPANY_CREATE) {
      try {
        logger.info(`Running tenant migrations and seeders for database: ${dbName} (enabled by ENABLE_TENANT_MIGRATIONS_ON_COMPANY_CREATE)`);

        const tenantInfo = {
          db_name: dbName,
          db_user: TENANT_DB_USER_NAME,
          db_password: TENANT_DB_PASSWORD,
          db_host: TENANT_DB_HOST_NAME
        };

        const migrationResult = await runTenantMigrationsAndSeeders(tenantInfo);

        if (migrationResult.success) {
          logger.info(`Tenant migrations and seeders completed successfully for: ${dbName}`);
          return {
            success: true,
            message: `Database '${dbName}' created successfully with tables, migrations and seeders applied.`,
            migrationResult: migrationResult
          };
        } else {
          logger.warn(`Database created but migrations/seeders had issues for: ${dbName}`, migrationResult);
          return {
            success: true, // Database was created successfully
            message: `Database '${dbName}' created successfully with tables, but migrations/seeders had issues: ${migrationResult.message}`,
            migrationResult: migrationResult
          };
        }
      } catch (migrationError) {
        const migrationErrorMsg = migrationError.message || migrationError.toString() || "Unknown migration error";
        logger.error("Error running tenant migrations/seeders:", migrationError);
        return {
          success: true, // Database was created successfully
          message: `Database '${dbName}' created successfully with tables, but failed to run migrations/seeders: ${migrationErrorMsg}`,
          migrationError: migrationErrorMsg,
          migrationStack: migrationError.stack
        };
      }
    } else {
      return {
        success: true,
        message: `Database '${dbName}' created successfully with tables. Migrations and seeders skipped (disabled).`,
        migrationSkipped: true
      };
    }
  } catch (error) {

    // Close the connection if it was opened
    if (mysqlSequelize) {
      try {
        await mysqlSequelize.close();
      } catch (closeError) {
        console.error("Error closing sequelize connection:", closeError);
      }
    }

    const errorMessage = error.message || error.toString() || "Unknown error occurred";
    return {
      success: false,
      message: `Failed to execute SQL file: ${errorMessage}`,
      error: errorMessage,
      stack: error.stack
    };
  }
};
const handleCategoryAction = async (
  category,
  applicationId,
  companyId,
  application_login_name
) => {

  switch (category) {
    case "create":
      const dbName = `small_office_a${applicationId}_c${companyId}`;
      return await executeSQLFile(
        dbName,
        "create_company_copy.sql",
        applicationId,
        companyId,
        application_login_name
      );
      break;
    case "main":
      return resError({ developer_msg: "Main category selected." });
      break;
    case "tenet":
      return resError({ developer_msg: "tenet selected" });

      break;
    default:
      return resError({ developer_msg: "Invalid category" });
  }
};

export const companyEdit = async (req) => {
  const {
    company_id,
    company_name,
    company_contact,
    printed_number,
    company_email,
    trade_india_user_id,
    trade_india_profile_id,
    trade_india_key,
    india_mart_api_key,
    whatsapp_authkey,
    whatsapp_appkey,
    chatgpt_appkey,
    gimini_appkey,
    google_lead_sheet_for_faceBook_1,
    google_lead_sheet_for_faceBook_2,
    google_sheet_key_3,
    google_sheet_key_4,
    serp_api_key,
    host_out_going_mail,
    port_mail_setup,
    mail_id_setup,
    password_mail_setup,
    order_prefix,
    order_title,
    order_doc_no,
    order_view_color,
    order_view_formate,

    quotation_prefix,
    quotation_title,
    quotation_doc_no,
    quotation_view_color,
    quotation_view_formate,

    proforma_invoice_prefix,
    proforma_invoice_title,
    proforma_invoice_doc_no,
    proforma_invoice_view_color,
    proforma_invoice_view_formate,

    invoice_prefix,
    invoice_title,
    invoice_doc_no,
    invoice_view_color,
    invoice_view_formate,

    purchase_ord_prefix,
    purchase_order_title,
    purchase_order_doc_no,
    purchase_order_view_color,
    purchase_order_view_formate,

    return_sales_invoice_prefix,
    return_sales_invoice_title,
    return_sales_invoice_doc_no,
    return_sales_invoice_view_color,
    return_sales_invoice_view_formate,

    return_purchase_invoice_prefix,
    return_purchase_invoice_title,
    return_purchase_invoice_doc_no,
    return_purchase_invoice_view_color,
    return_purchase_invoice_view_formate,

    workorder_prefix,
    workorder_title,
    workorder_doc_no,
    workorder_view_color,
    workorder_view_formate,

    purchase_prefix,
    purchase_title,
    purchase_doc_no,
    purchase_view_color,
    purchase_view_formate,
    in_order_image_view,
    watermark_in_print,
    view_inquiry_form_in_contact,
    same_product_multiple_in_cart,
    is_contact_validation,
    is_strict_check_product_stock,
    is_strict_wharehouse_wise_product_stock_check,
    is_email_verified,
    gst_number,
    currency_id,
    address,
    country_id,
    state_id,
    city_id,
    bank_detail,
    terms_and_condition,
    category_id_b2b,
    sub_category_id_b2b,
    pop3_host,
    incoming_port,
    order_qty_unit,
    upi_id,
    upi_name,

    quotation_terms_conditions,
    quotation_remark,
    quotation_note,

    proforma_invoice_terms_conditions,
    proforma_invoice_remark,
    proforma_invoice_note,

    order_terms_conditions,
    order_remark,
    order_note,

    sales_invoice_terms_conditions,
    sales_invoice_remark,
    sales_invoice_note,

    return_sales_invoice_terms_conditions,
    return_sales_invoice_remark,
    return_sales_invoice_note,

    purchase_order_terms_conditions,
    purchase_order_remark,
    purchase_order_note,

    purchase_invoice_terms_conditions,
    purchase_invoice_remark,
    purchase_invoice_note,

    return_purchase_invoice_terms_conditions,
    return_purchase_invoice_remark,
    return_purchase_invoice_note,

    work_order_terms_conditions,
    work_order_remark,
    work_order_note,

    inward_prefix,
    inward_title,
    inward_doc_no,
    inward_view_color,
    inward_view_formate,

    inward_terms_conditions,
    inward_remark,
    inward_note,

    dispatch_prefix,
    dispatch_title,
    dispatch_doc_no,
    dispatch_view_color,
    dispatch_view_formate,

    dispatch_terms_conditions,
    dispatch_remark,
    dispatch_note,

    quotation_packing_charge_title,
    quotation_transport_charge_title,
    quotation_tcs_title,
    quotation_tsc_percentage,

    order_packing_charge_title,
    order_transport_charge_title,
    order_tcs_title,
    order_tsc_percentage,

    sales_invoice_packing_charge_title,
    sales_invoice_transport_charge_title,
    sales_invoice_tcs_title,
    sales_invoice_tsc_percentage,

    return_sales_invoice_packing_charge_title,
    return_sales_invoice_transport_charge_title,
    return_sales_invoice_tcs_title,
    return_sales_invoice_tsc_percentage,

    purchase_order_packing_charge_title,
    purchase_order_transport_charge_title,
    purchase_order_tcs_title,
    purchase_order_tsc_percentage,

    purchase_invoice_packing_charge_title,
    purchase_invoice_transport_charge_title,
    purchase_invoice_tcs_title,
    purchase_invoice_tsc_percentage,

    return_purchase_invoice_packing_charge_title,
    return_purchase_invoice_transport_charge_title,
    return_purchase_invoice_tcs_title,
    return_purchase_invoice_tsc_percentage,

    work_order_packing_charge_title,
    work_order_transport_charge_title,
    work_order_tcs_title,
    work_order_tsc_percentage,

    inward_packing_charge_title,
    inward_transport_charge_title,
    inward_tcs_title,
    inward_tsc_percentage,

    dispatch_packing_charge_title,
    dispatch_transport_charge_title,
    dispatch_tcs_title,
    dispatch_tsc_percentage,
    quotation_effect_last_data_on_new,
    purchase_order_effect_last_data_on_new,
    return_purchase_invoice_effect_last_data_on_new,
    purchase_invoice_effect_last_data_on_new,
    return_sales_invoice_effect_last_data_on_new,
    order_effect_last_data_on_new,
    sales_invoice_effect_last_data_on_new,
    quotation_sr_number_generate_flag,
    order_sr_number_generate_flag,
    sales_invoice_sr_number_generate_flag,
    return_sales_invoice_sr_number_generate_flag,
    purchase_order_sr_number_generate_flag,
    purchase_invoice_sr_number_generate_flag,
    return_purchase_invoice_sr_number_generate_flag,
    inward_sr_number_generate_flag,
    dispatch_sr_number_generate_flag,
    sales_invoice_series_pattern,
    order_series_pattern,
    return_sales_invoice_series_pattern,
    purchase_invoice_series_pattern,
    return_purchase_invoice_series_pattern,
    purchase_order_series_pattern,
    inward_series_pattern,
    dispatch_series_pattern,
    quotation_series_pattern,

    google_sheet_first_name,
    google_sheet_second_name,
    google_sheet_third_name,
    google_sheet_fourth_name,
    proforma_invoice_series_pattern,
    proforma_invoice_effect_last_data_on_new,
    proforma_invoice_sr_number_generate_flag,

  } = req.body;
  console.log("555555555555555555555555555555555555555555555555555555555555555555555555555555555555", req.body);

  const headerImg = req?.files?.header_img?.[0];
  const footerImg = req.files?.footer_img?.[0];
  const companyImg = req.files?.company_logo?.[0];
  const companySign = req.files?.company_sign?.[0];
  const catalogPdf = req.files?.catalog_pdf?.[0];
  const onlineStoreBannerOne = req.files?.banner_img_one?.[0];
  const onlineStoreBannertwo = req.files?.banner_img_two?.[0];

  let directoryPath;

  if (headerImg || footerImg) {
    directoryPath = path.join(
      process.cwd(),
      "media-folder",
      "company_image",
      company_id.toString()
    );
  }
  if (companyImg) {
    directoryPath = path.join(
      process.cwd(),
      "media-folder",
      "company_image",
      company_id.toString()
    );
  }
  if (companySign) {
    directoryPath = path.join(
      process.cwd(),
      "media-folder",
      "company_image",
      company_id.toString()
    );
  }
  if (catalogPdf) {
    directoryPath = path.join(
      process.cwd(),
      "media-folder",
      "company_image",
      company_id.toString()
    );
  }
  if (onlineStoreBannerOne) {
    directoryPath = path.join(
      process.cwd(),
      "media-folder",
      "company_image",
      company_id.toString()
    );
  }
  if (onlineStoreBannertwo) {
    directoryPath = path.join(
      process.cwd(),
      "media-folder",
      "company_image",
      company_id.toString()
    );
  }
  try {
    let convertPathHeader;
    let convertPathFooter;
    let convertPathCompany;
    let convertPathSign;
    let convertPathCatalog;
    let convertPathbannerOne;
    let convertPathbannertwo;

    if (headerImg || footerImg) {
      await fs.mkdirp(directoryPath);
    }
    if (headerImg) {
      const headerFilePath = headerImg.path;
      const headerFileName = path.basename(headerFilePath);
      const headerDestinationPath = path.join(directoryPath, headerFileName);

      await fs.move(headerFilePath, headerDestinationPath);
      convertPathHeader = company_id.toString() + "/" + headerFileName;
    }
    if (onlineStoreBannerOne || onlineStoreBannertwo) {
      await fs.mkdirp(directoryPath);
    }
    if (onlineStoreBannerOne) {
      const bannerOneFilePath = onlineStoreBannerOne.path;
      const bannerOneFileName = path.basename(bannerOneFilePath);
      const bannerOneDestinationPath = path.join(directoryPath, bannerOneFileName);

      await fs.move(bannerOneFilePath, bannerOneDestinationPath);
      convertPathbannerOne = company_id.toString() + "/" + bannerOneFileName;
    }
    if (onlineStoreBannertwo) {
      const bannertwoFilePath = onlineStoreBannertwo.path;
      const bannertwoFileName = path.basename(bannertwoFilePath);
      const bannertwoDestinationPath = path.join(directoryPath, bannertwoFileName);

      await fs.move(bannertwoFilePath, bannertwoDestinationPath);
      convertPathbannertwo = company_id.toString() + "/" + bannertwoFileName;
    }
    if (footerImg) {
      const footerFilePath = footerImg.path;
      const footerFileName = path.basename(footerFilePath);
      const footerDestinationPath = path.join(directoryPath, footerFileName);

      await fs.move(footerFilePath, footerDestinationPath);
      convertPathFooter = company_id.toString() + "/" + footerFileName;
    }

    if (companyImg) {
      await fs.mkdirp(directoryPath);
    }
    if (companyImg) {
      const companyFilePath = companyImg.path;
      const companyFileName = path.basename(companyFilePath);
      const companyDestinationPath = path.join(directoryPath, companyFileName);

      await fs.move(companyFilePath, companyDestinationPath);
      convertPathCompany = company_id.toString() + "/" + companyFileName;
    }
    if (companySign) {
      await fs.mkdirp(directoryPath);
    }
    if (companySign) {
      const companySignFilePath = companySign.path;
      const companySignFileName = path.basename(companySignFilePath);
      const companySignDestinationPath = path.join(
        directoryPath,
        companySignFileName
      );

      await fs.move(companySignFilePath, companySignDestinationPath);
      convertPathSign = company_id.toString() + "/" + companySignFileName;
    }

    if (catalogPdf) {
      await fs.mkdirp(directoryPath);
    }
    if (catalogPdf) {
      const catalogFilePath = catalogPdf.path;
      const catalogFileName = path.basename(catalogFilePath);
      const catalogDestinationPath = path.join(directoryPath, catalogFileName);

      await fs.move(catalogFilePath, catalogDestinationPath);
      convertPathCatalog = company_id.toString() + "/" + catalogFileName;
    }
    const resultUpdateCompany = await companyModel.update(
      {
        company_name: company_name,
        company_logo: "", // If no file, this will be null
        company_sign: convertPathSign, // If no file, this will be null
        company_email: company_email, // If no file, this will be null
        printed_number: printed_number,
        header_img: convertPathHeader,
        footer_img: convertPathFooter,
        banner_img_one: convertPathbannerOne,
        banner_img_two: convertPathbannertwo,
        gst_number: gst_number,
        currency_id: currency_id,
        address: address,
        country_id: country_id,
        state_id: state_id,
        city_id: city_id,
        bank_detail: bank_detail,
        terms_and_condition: terms_and_condition,
        trade_india_user_id: trade_india_user_id,
        trade_india_profile_id: trade_india_profile_id,
        trade_india_key: trade_india_key,
        india_mart_api_key: india_mart_api_key,
        whatsapp_authkey: whatsapp_authkey,
        whatsapp_appkey: whatsapp_appkey,
        gimini_appkey: gimini_appkey,
        chatgpt_appkey: chatgpt_appkey,
        google_lead_sheet_for_faceBook_1: google_lead_sheet_for_faceBook_1,
        google_lead_sheet_for_faceBook_2: google_lead_sheet_for_faceBook_2,
        google_sheet_key_3: google_sheet_key_3,
        google_sheet_key_4: google_sheet_key_4,
        serp_api_key: serp_api_key,
        host_out_going_mail: host_out_going_mail,
        port_mail_setup: port_mail_setup,
        mail_id_setup: mail_id_setup,
        order_prefix: order_prefix,
        order_title: order_title,
        order_doc_no: order_doc_no,
        order_view_color: order_view_color,
        order_view_formate: order_view_formate,

        quotation_prefix: quotation_prefix,
        quotation_title: quotation_title,
        quotation_doc_no: quotation_doc_no,
        quotation_view_color: quotation_view_color,
        quotation_view_formate: quotation_view_formate,

        proforma_invoice_prefix: proforma_invoice_prefix,
        proforma_invoice_title: proforma_invoice_title,
        proforma_invoice_doc_no: proforma_invoice_doc_no,
        proforma_invoice_view_color: proforma_invoice_view_color,
        proforma_invoice_view_formate: proforma_invoice_view_formate,

        invoice_prefix: invoice_prefix,
        invoice_title: invoice_title,
        invoice_doc_no: invoice_doc_no,
        invoice_view_color: invoice_view_color,
        invoice_view_formate: invoice_view_formate,

        purchase_ord_prefix: purchase_ord_prefix,
        purchase_order_title: purchase_order_title,
        purchase_order_doc_no: purchase_order_doc_no,
        purchase_order_view_color: purchase_order_view_color,
        purchase_order_view_formate: purchase_order_view_formate,

        return_sales_invoice_prefix: return_sales_invoice_prefix,
        return_sales_invoice_title: return_sales_invoice_title,
        return_sales_invoice_doc_no: return_sales_invoice_doc_no,
        return_sales_invoice_view_color: return_sales_invoice_view_color,
        return_sales_invoice_view_formate: return_sales_invoice_view_formate,

        return_purchase_invoice_prefix: return_purchase_invoice_prefix,
        return_purchase_invoice_title: return_purchase_invoice_title,
        return_purchase_invoice_doc_no: return_purchase_invoice_doc_no,
        return_purchase_invoice_view_color: return_purchase_invoice_view_color,
        return_purchase_invoice_view_formate: return_purchase_invoice_view_formate,

        workorder_prefix: workorder_prefix,
        workorder_title: workorder_title,
        workorder_doc_no: workorder_doc_no,
        workorder_view_color: workorder_view_color,
        workorder_view_formate: workorder_view_formate,

        is_email_verified: is_email_verified,
        password_mail_setup: password_mail_setup,
        purchase_prefix: purchase_prefix,
        purchase_title: purchase_title,
        purchase_doc_no: purchase_doc_no,
        purchase_view_color: purchase_view_color,
        purchase_view_formate: purchase_view_formate,
        in_order_image_view: in_order_image_view,
        watermark_in_print: watermark_in_print,
        is_contact_validation: is_contact_validation,
        is_strict_check_product_stock: is_strict_check_product_stock,
        is_strict_wharehouse_wise_product_stock_check: is_strict_wharehouse_wise_product_stock_check,
        view_inquiry_form_in_contact: view_inquiry_form_in_contact,
        same_product_multiple_in_cart: same_product_multiple_in_cart,

        category_id_b2b: Number(category_id_b2b),
        sub_category_id_b2b: Number(sub_category_id_b2b),
        company_logo: convertPathCompany,
        company_sign: convertPathSign,
        company_catalog: convertPathCatalog,
        incoming_port: incoming_port,
        pop3_host: pop3_host,

        upi_id: upi_id,
        upi_name: upi_name,


        quotation_terms_conditions: quotation_terms_conditions,
        quotation_remark: quotation_remark,
        quotation_note: quotation_note,

        proforma_invoice_terms_conditions: proforma_invoice_terms_conditions,
        proforma_invoice_remark: proforma_invoice_remark,
        proforma_invoice_note: proforma_invoice_note,

        order_terms_conditions: order_terms_conditions,
        order_remark: order_remark,
        order_note: order_note,

        sales_invoice_terms_conditions: sales_invoice_terms_conditions,
        sales_invoice_remark: sales_invoice_remark,
        sales_invoice_note: sales_invoice_note,

        return_sales_invoice_terms_conditions: return_sales_invoice_terms_conditions,
        return_sales_invoice_remark: return_sales_invoice_remark,
        return_sales_invoice_note: return_sales_invoice_note,

        purchase_order_terms_conditions: purchase_order_terms_conditions,
        purchase_order_remark: purchase_order_remark,
        purchase_order_note: purchase_order_note,

        purchase_invoice_terms_conditions: purchase_invoice_terms_conditions,
        purchase_invoice_remark: purchase_invoice_remark,
        purchase_invoice_note: purchase_invoice_note,

        return_purchase_invoice_terms_conditions: return_purchase_invoice_terms_conditions,
        return_purchase_invoice_remark: return_purchase_invoice_remark,
        return_purchase_invoice_note: return_purchase_invoice_note,

        work_order_terms_conditions: work_order_terms_conditions,
        work_order_remark: work_order_remark,
        work_order_note: work_order_note,

        inward_prefix: inward_prefix,
        inward_title: inward_title,
        inward_doc_no: inward_doc_no,
        inward_view_color: inward_view_color,
        inward_view_formate: inward_view_formate,

        inward_terms_conditions: inward_terms_conditions,
        inward_remark: inward_remark,
        inward_note: inward_note,

        dispatch_prefix: dispatch_prefix,
        dispatch_title: dispatch_title,
        dispatch_doc_no: dispatch_doc_no,
        dispatch_view_color: dispatch_view_color,
        dispatch_view_formate: dispatch_view_formate,

        dispatch_terms_conditions: dispatch_terms_conditions,
        dispatch_remark: dispatch_remark,
        dispatch_note: dispatch_note,

        quotation_packing_charge_title: quotation_packing_charge_title,
        quotation_transport_charge_title: quotation_transport_charge_title,
        quotation_tcs_title: quotation_tcs_title,
        quotation_tsc_percentage: quotation_tsc_percentage,

        order_packing_charge_title: order_packing_charge_title,
        order_transport_charge_title: order_transport_charge_title,
        order_tcs_title: order_tcs_title,
        order_tsc_percentage: order_tsc_percentage,

        sales_invoice_packing_charge_title: sales_invoice_packing_charge_title,
        sales_invoice_transport_charge_title: sales_invoice_transport_charge_title,
        sales_invoice_tcs_title: sales_invoice_tcs_title,
        sales_invoice_tsc_percentage: sales_invoice_tsc_percentage,

        return_sales_invoice_packing_charge_title: return_sales_invoice_packing_charge_title,
        return_sales_invoice_transport_charge_title: return_sales_invoice_transport_charge_title,
        return_sales_invoice_tcs_title: return_sales_invoice_tcs_title,
        return_sales_invoice_tsc_percentage: return_sales_invoice_tsc_percentage,

        purchase_order_packing_charge_title: purchase_order_packing_charge_title,
        purchase_order_transport_charge_title: purchase_order_transport_charge_title,
        purchase_order_tcs_title: purchase_order_tcs_title,
        purchase_order_tsc_percentage: purchase_order_tsc_percentage,

        purchase_invoice_packing_charge_title: purchase_invoice_packing_charge_title,
        purchase_invoice_transport_charge_title: purchase_invoice_transport_charge_title,
        purchase_invoice_tcs_title: purchase_invoice_tcs_title,
        purchase_invoice_tsc_percentage: purchase_invoice_tsc_percentage,

        return_purchase_invoice_packing_charge_title: return_purchase_invoice_packing_charge_title,
        return_purchase_invoice_transport_charge_title: return_purchase_invoice_transport_charge_title,
        return_purchase_invoice_tcs_title: return_purchase_invoice_tcs_title,
        return_purchase_invoice_tsc_percentage: return_purchase_invoice_tsc_percentage,

        work_order_packing_charge_title: work_order_packing_charge_title,
        work_order_transport_charge_title: work_order_transport_charge_title,
        work_order_tcs_title: work_order_tcs_title,
        work_order_tsc_percentage: work_order_tsc_percentage,

        inward_packing_charge_title: inward_packing_charge_title,
        inward_transport_charge_title: inward_transport_charge_title,
        inward_tcs_title: inward_tcs_title,
        inward_tsc_percentage: inward_tsc_percentage,

        dispatch_packing_charge_title: dispatch_packing_charge_title,
        dispatch_transport_charge_title: dispatch_transport_charge_title,
        dispatch_tcs_title: dispatch_tcs_title,
        dispatch_tsc_percentage: dispatch_tsc_percentage,
        order_qty_unit: order_qty_unit,
        quotation_effect_last_data_on_new: quotation_effect_last_data_on_new,
        purchase_order_effect_last_data_on_new: purchase_order_effect_last_data_on_new,
        return_purchase_invoice_effect_last_data_on_new: return_purchase_invoice_effect_last_data_on_new,
        purchase_invoice_effect_last_data_on_new: purchase_invoice_effect_last_data_on_new,
        return_sales_invoice_effect_last_data_on_new: return_sales_invoice_effect_last_data_on_new,
        order_effect_last_data_on_new: order_effect_last_data_on_new,
        sales_invoice_effect_last_data_on_new: sales_invoice_effect_last_data_on_new,
        quotation_sr_number_generate_flag: quotation_sr_number_generate_flag,
        order_sr_number_generate_flag: order_sr_number_generate_flag,
        sales_invoice_sr_number_generate_flag: sales_invoice_sr_number_generate_flag,
        return_sales_invoice_sr_number_generate_flag: return_sales_invoice_sr_number_generate_flag,
        purchase_order_sr_number_generate_flag: purchase_order_sr_number_generate_flag,
        purchase_invoice_sr_number_generate_flag: purchase_invoice_sr_number_generate_flag,
        return_purchase_invoice_sr_number_generate_flag: return_purchase_invoice_sr_number_generate_flag,
        inward_sr_number_generate_flag: inward_sr_number_generate_flag,
        dispatch_sr_number_generate_flag: dispatch_sr_number_generate_flag,
        invoice_series_pattern: sales_invoice_series_pattern,
        order_series_pattern: order_series_pattern,
        return_sales_invoice_series_pattern: return_sales_invoice_series_pattern,
        purchase_series_pattern: purchase_invoice_series_pattern,
        return_purchase_invoice_series_pattern: return_purchase_invoice_series_pattern,
        purchase_ord_series_pattern: purchase_order_series_pattern,
        inward_series_pattern: inward_series_pattern,
        dispatch_series_pattern: dispatch_series_pattern,
        quotation_series_pattern: quotation_series_pattern,
        google_sheet_first_name: google_sheet_first_name,
        google_sheet_second_name: google_sheet_second_name,
        google_sheet_third_name: google_sheet_third_name,
        google_sheet_fourth_name: google_sheet_fourth_name,
        proforma_invoice_series_pattern: proforma_invoice_series_pattern,
        proforma_invoice_effect_last_data_on_new: proforma_invoice_effect_last_data_on_new,
        proforma_invoice_sr_number_generate_flag: proforma_invoice_sr_number_generate_flag,
      },
      {
        where: { id: company_id },
      }
    );
    if (resultUpdateCompany) {
      return resSuccess({
        ack_msg: "Company  updated successfully",
        data: { item: resultUpdateCompany },
      });
    } else {
      return resError();
    }
  } catch (error) {
    return resBadRequest({
      ack_msg: " ",
      developer_msg: `${error.message}`,
    });
  }
};

export const getAllCompanyb2b = async (req) => {
  let { searchTerm } = req.body;

  try {
    let whereClause = {};

    if (searchTerm) {
      whereClause = {
        [Op.and]: [
          {
            [Op.or]: [{ company_name: { [Op.like]: "%" + searchTerm + "%" } }],
          },

          { isDelete: "0" },
        ],
      };
    }
    const companySearchResult = await companyModel.findAll({
      where: whereClause,
      attributes: [
        "id",
        "company_name",
        "company_contact",
        "company_email",
        "company_logo",
      ],
    });
    if (companySearchResult)
      return resSuccess({
        data: { item: companySearchResult },
      });
    else {
      return resError({
        ack_msg: "No  search company",
        developer_msg: "Data not found",
      });
    }
  } catch (e) {
    return resBadRequest({
      developer_msg: `error ${e.message}`,
    });
    throw e;
  }
};

export const deleteCompanyMain = async (req) => {
  let { company_masters_id } = req.body;

  if (!company_masters_id) {
    return resBadRequest({ developer_msg: "Company ID is required" });
  }

  try {
    let tenantCompanyDeleteResult = null;

    const companyDeleteResult = await companyModel.update(
      { isDelete: 1 },
      { where: { id: company_masters_id } }
    );

    if (companyDeleteResult) {
      await companyVsApplicationLoginModel.update(
        { isDelete: 1 },
        { where: { company_masters_id: company_masters_id } }
      );

      tenantCompanyDeleteResult = await tenantMasterModel.update(
        { isDelete: 1 },
        { where: { company_masters_id: company_masters_id } }
      );
    }

    return resSuccess({
      data: { item: tenantCompanyDeleteResult },
      ack_msg: "Company deleted successfully",
    });
  } catch (e) {
    return resBadRequest({
      developer_msg: `Error: ${e.message}`,
    });
  }
};

export const getAllCategoryb2b = async (req) => {
  try {
    const whereClause = {
      isDelete: "0",
    };

    const resultCategory = await categoryModelb2b.findAll({
      where: whereClause,
      order: [["id", "DESC"]],
    });

    const sanitizedCategory =
      resultCategory &&
      resultCategory.map((categoryItem) => {
        return {
          ...categoryItem.dataValues,
        };
      });

    if (resultCategory) {
      return resSuccess({
        data: { item: sanitizedCategory },
      });
    } else {
      return resError({
        ack_msg: "No Category b2b",
        developer_msg: "Data not found",
      });
    }
  } catch (e) {
    return resBadRequest({ developer_msg: `error ${e}` });
  }
};

export const getallSubcategoryb2b = async (req) => {
  try {
    let { category_id } = req.body;

    if (!category_id) {
      return resError({
        ack_msg: "Category Id is not there",
        developer_msg: "Category id is not sent",
      });
    }

    const whereClause = {
      isDelete: "0",
      category_id_b2b: category_id,
    };

    const resultSubcategory = await subCategoryModelb2b.findAll({
      where: whereClause,
      order: [["id", "DESC"]],
    });

    const sanitizedSubCategory =
      resultSubcategory &&
      resultSubcategory.map((subCategoryItem) => {
        return {
          ...subCategoryItem.dataValues,
        };
      });

    if (resultSubcategory) {
      return resSuccess({
        data: { item: sanitizedSubCategory },
      });
    } else {
      return resError({
        ack_msg: "No SubCategory b2b",
        developer_msg: "Data not found",
      });
    }
  } catch (e) {
    return resBadRequest({ developer_msg: `error ${e}` });
  }
};

// export const demoBook = async (req) => {
//   const {
//     name,
//     email,
//     business_category,
//     contact_number,
//     book_date,
//     book_time,
//     comments,
//     agreeToTerms,
//     request_flag,
//   } = req.body;

//   //request_flag 1 ==> Book Demo Form send message to email and whatsapp
//   //request_flag 2 ==> Contact Form send message to email and whatsapp

//   // Validate required fields
//   if (!name || !email) {
//     return resBadRequest({
//       developer_msg: "Missing required fields: name and email are mandatory.",
//     });
//   }

//   const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
//   if (!emailRegex.test(email)) {
//     return resBadRequest({
//       developer_msg: "Invalid email address provided.",
//     });
//   }

//   try {
//     const formattedDate = moment(book_date).format("DD-MM-YYYY");
//     const formattedTime = moment(book_time, [
//       "h:mm A",
//       "HH:mm",
//       "HH:mm:ss",
//     ]).format("HH:mm:ss");
//     const bookDemoBody = {
//       name,
//       email,
//       business_category,
//       contact_number,
//       book_date: formattedDate,
//       book_time: formattedTime,
//       comments,
//       agreeToTerms,
//       created_date_time: Date.now(),
//       request_flag,
//     };

//     if (!contact_number.startsWith("91")) {
//       bookDemoBody.contact_number = "91" + contact_number;
//     } else {
//       // If already in the correct format, keep the number as is
//       bookDemoBody.contact_number = contact_number;
//     }

//     await websiteBookDemoModel.create(bookDemoBody);

//     const sendToMail = await toSendMail({ body: bookDemoBody });
//     // const sendToWhatsapp = await toSendWhatsapp({ body: bookDemoBody });


//     return resSuccess({
//       data: { item: sendToMail },
//       developer_msg: "Demo Booked.",
//     });
//   } catch (error) {
//     logger.error("Error in demoBook:", error.message, error.stack);
//     return resBadRequest({
//       developer_msg: `Error: ${error.message}`,
//     });
//   }
// };

export const demoBook = async (req, res) => {
  const {
    name,
    email,
    business_category,
    contact_number,
    book_date,
    book_time,
    comments,
    agreeToTerms,
    request_flag,
  } = req.body;

  // Validate
  if (!contact_number) {
    return resError({ ack_msg: "contact Number are required." });
  }

  try {
    const formattedDate = moment(book_date).format("YYYY-MM-DD");
    const formattedTime = moment(book_time, ["h:mm A", "HH:mm", "HH:mm:ss"]).format("HH:mm:ss");
    const formatted = moment().format("YYYY-MM-DD HH:mm:ss");
    const contactWithCountryCode = contact_number.startsWith("91")
      ? contact_number
      : "91" + contact_number;

    const bookDemoBody = {
      name,
      email,
      business_category,
      contact_number: contactWithCountryCode,
      book_date: formattedDate,
      book_time: formattedTime,
      comments,
      agreeToTerms,
      created_date_time: Date.now(),
      request_flag,
    };

    // Save Demo Form
    await websiteBookDemoModel.create(bookDemoBody);


    // Get Tenant DB
    const tenantDBFind = await tenantMasterModel.findOne({
      where: { isDelete: 0, db_name: WEBSITE_LEAD_HANDLE_DB_NAME },
      attributes: ["a_application_login_id", "company_masters_id"],
    });

    if (!tenantDBFind) {
      return resError({ ack_msg: "Tenant Not Found" });
    }

    const tenantDB = (await getTenantDB(
      tenantDBFind.a_application_login_id,
      tenantDBFind.company_masters_id
    )).sequelize;

    const contactModels = contactModel(tenantDB);
    const CTMModel = contactMessageHistory(tenantDB);

    const normalizedMobile = normalizeToTenDigit(contact_number);

    let contactCreate = await contactModels.findOne({
      where: {
        mobile_number: normalizedMobile,
        isDelete: 0,
      },
    });

    let isNewContact = false;

    if (!contactCreate) {
      isNewContact = true;
      contactCreate = await contactModels.create({
        person_name: name,
        email_id: email,
        company_name: business_category,
        mobile_number: normalizedMobile,
        contact_status: -1,
        a_application_login_id: tenantDBFind.a_application_login_id,
        company_masters_id: tenantDBFind.company_masters_id,
        assinged_to_work_a_application_id: WBSITE_LEAD_ASSIGN_ID,
        source_type_id: -8
      });

    }
    // return

    const messageBody = {
      contact_masters_id: contactCreate.dataValues.id,
      a_application_login_id: tenantDBFind.a_application_login_id,
      company_masters_id: tenantDBFind.company_masters_id,
      description:
        `Title: Book Demo<br>` +
        `Name: ${name || ""}<br>` +
        `Email: ${email || ""}<br>` +
        `Business Name: ${business_category || ""}<br>` +
        `<b>Mobile No.:</b> <b>${contact_number}</b><br>` +
        `<b>Demo Book DateTime:</b> <b>${formattedDate} ${formattedTime}</b><br>` +
        `Message: ${comments || ""}`,
      created_date_time: formatted,
      message_side: "2",
      message_type_id: "0",
    };


    await CTMModel.create(messageBody);

    return resSuccess({
      data: {
        item: bookDemoBody,
        isNewContact, // Just for debugging – remove in production
      },
      developer_msg: "Demo booked successfully.",
    });


  } catch (error) {
    logger.error("Error in demoBook:", error.message);
    return resBadRequest({ developer_msg: error.message });
  }
};



export const addContactUsData = async (req) => {
  // return req.body;
  const {
    business_category,
    city,
    name,
    email,
    company_name,
    country,
    contact_number,
    // website,
    comments,
    agreeToTerms,
    request_flag,
  } = req.body;
  //request_flag 1 ==> Book Demo Form send message to email and whatsapp
  //request_flag 2 ==> Contact Form send message to email and whatsapp

  try {
    const contactUsBody = {
      name: name,
      email: email,
      company_name: company_name,
      country: country,
      contact_number: contact_number,
      // website: website,
      comments: comments,
      agreeToTerms: agreeToTerms,
      created_date_time: Date.now(),
      request_flag,
      business_category,
      city,
    };


    if (!contact_number.startsWith("91")) {
      contactUsBody.contact_number = "91" + contact_number;
    } else {
      // If already in the correct format, keep the number as is
      contactUsBody.contact_number = contact_number;
    }

    const addContactDetails = await websiteContactUsModel.create(contactUsBody);
    const sendToMail = await toSendMail({ body: contactUsBody });
    // const sendToWhatsapp = await toSendWhatsapp({ body: contactUsBody }); // commendted by dinesh

    const formatted = moment().format("YYYY-MM-DD HH:mm:ss");

    const tenantDBFind = await tenantMasterModel.findOne({
      where: { isDelete: 0, db_name: WEBSITE_LEAD_HANDLE_DB_NAME },
      attributes: ["a_application_login_id", "company_masters_id"],
    });

    if (!tenantDBFind) {
      return resError({ ack_msg: "Tenant Not Found" });
    }

    const tenantDB = (await getTenantDB(
      tenantDBFind.a_application_login_id,
      tenantDBFind.company_masters_id
    )).sequelize;

    const contactModels = contactModel(tenantDB);
    const CTMModel = contactMessageHistory(tenantDB);

    let contactCreate = await contactModels.findOne({
      where: { mobile_number: contact_number },
    });

    let isNewContact = false;

    if (!contactCreate) {
      isNewContact = true;
      contactCreate = await contactModels.create({
        person_name: name,
        email_id: email,
        company_name: company_name,
        mobile_number: normalizeToTenDigit(contact_number),
        contact_status: -1,
        a_application_login_id: tenantDBFind.a_application_login_id,
        company_masters_id: tenantDBFind.company_masters_id,
        assinged_to_work_a_application_id: WBSITE_LEAD_ASSIGN_ID,
        source_type_id: -8
      });

    }
    // return

    const messageBody = {
      contact_masters_id: contactCreate.dataValues.id,
      a_application_login_id: tenantDBFind.a_application_login_id,
      company_masters_id: tenantDBFind.company_masters_id,
      description:
        `Title: Contact Us <br>` +
        `Name: ${name || ""}<br>` +
        `Email: ${email || ""}<br>` +
        `Business Name: ${company_name || ""}<br>` +
        `Business Category: ${business_category || ""}<br>` +
        `City: ${city || ""}<br>` +
        `<b>Mobile No:</b> <b>${contact_number}</b><br>` +
        `<b>Contact DateTime:</b> <b>${formatted}</b><br>` +
        `Message: ${comments || ""}`,
      created_date_time: formatted,
      message_side: "2",
      message_type_id: "0",
    };


    await CTMModel.create(messageBody);

    return resSuccess({
      data: { item: addContactDetails },
      developer_msg: "Contact data added successfully.",
    });
  } catch (error) {
    resBadRequest({
      developer_msg: `error ${error}`,
    });
  }
};

export const getCompanyVsReferralCodeDetail = async (req, res) => {
  const { referralId, masterReferral } = req.body;

  try {
    let whereClause = { isDelete: 0 };

    if (!masterReferral) {
      if (!referralId) {
        return resError({
          ack_msg: "Referral Code is required",
          developer_msg: "Referral Code not provided in request body",
        });
      }
      whereClause.referral_code_id = referralId;
    }

    const companyWiseReferralCodeData = await companyModel.findAll({
      where: whereClause,
      attributes: [
        "id",
        "a_application_login_id",
        "category_id_b2b",
        "sub_category_id_b2b",
        "plan_date",
        "plan_expiry_date",
        "company_email",
        "gst_number",
        "created_date_time",
        "company_name",
        "plan_id",
        "city_id",
      ],
    });

    if (!companyWiseReferralCodeData || companyWiseReferralCodeData.length === 0) {
      return resError({
        ack_msg: "No companies found",
        developer_msg: `No companies found for the given referral`,
      });
    }

    const expired = [];
    const demo = [];
    const paid = [];

    const result = await Promise.all(
      companyWiseReferralCodeData.map(async (company) => {
        const loginData = await loginModel.findOne({
          where: {
            id: company.a_application_login_id,
            isDelete: 0,
          },
          attributes: ["username", "recovery_email", "recovery_mobile"],
        });

        const categoryData = await categoryModelb2b.findOne({
          where: {
            id: company.category_id_b2b,
            isDelete: 0,
          },
          attributes: ["category_name_b2b"],
        });

        const subcategoryData = await subCategoryModelb2b.findOne({
          where: {
            id: company.sub_category_id_b2b,
            isDelete: 0,
          },
          attributes: ["sub_category_name_b2b"],
        });

        const loginOutTime = await applicationLoginHistoriesModel.findOne({
          where: {
            a_application_login_id: company.a_application_login_id,
            isDelete: 0,
          },
          order: [["login_date_time", "DESC"]],
          attributes: ["login_date_time", "logout_date_time"],
        });

        const companyPlanGet = await planMasterModel.findOne({
          where: {
            id: company.plan_id,
            isDelete: 0,
          },
          attributes: ["plan_name"],
        });

        const companyTeamMamber = await companyVsApplicationLoginModel.count({
          where: {
            company_masters_id: company.id,
            company_flag: { [Op.ne]: 1 },
            isDelete: 0,
          },
        });

        const tenantId = company.a_application_login_id;
        const companyMasterId = company.id;
        let tenantDB;
        try {
          tenantDB = (await getTenantDB(tenantId, companyMasterId)).sequelize;
          if (!tenantDB) {
            return null;
          }
        } catch (error) {
          return resError({
            ack_msg: "Tenant Not Found",
            developer_msg: error.message || "Tenant Not Found",
          });
        }

        const reminderMsgModel = reminderMessagesModel(tenantDB);
        const contactModels = contactModel(tenantDB);
        const ProductModels = productModel(tenantDB);
        const TaskModels = taskManagementModel(tenantDB);
        const cityModels = cityModel(tenantDB);
        const cartModels = await cartModel(tenantDB);

        const contactCount = await contactModels.count({
          where: {
            company_masters_id: company.id,
            isDelete: 0,
          },
        });

        const ProductCount = await ProductModels.count({
          where: {
            company_masters_id: company.id,
            isDelete: 0,
          },
        });
        const TaskCount = await TaskModels.count({
          where: {
            company_masters_id: company.id,
            isDelete: 0,
          },
        });

        const reminderCount = await reminderMsgModel.count({
          where: {
            company_masters_id: company.id,
            isDelete: 0,
            is_reminder_app_flag: 0,
          },
        });

        const companyCityGet = await cityModels.findOne({
          where: {
            id: company.city_id,
            isDelete: 0,
          },
          attributes: ["city_name"],
        });

        const companyQuatation = await cartModels.count({
          where: {
            company_masters_id: company.id,
            isDelete: 0,
            type: 1,
          },
        });

        const companyOrder = await cartModels.count({
          where: {
            company_masters_id: company.id,
            isDelete: 0,
            type: 2,
          },
        });

        const isValidDate = (date) => {
          return date && moment(date, 'YYYY-MM-DD', true).isValid();
        };

        const formattedLogoutTime = isValidDate(loginOutTime?.logout_date_time)
          ? moment(loginOutTime.logout_date_time).format('YYYY-MM-DD HH:mm:ss')
          : "";

        const currentDate = moment().startOf('day');
        const expiryDate = isValidDate(company.plan_expiry_date)
          ? moment(company.plan_expiry_date, 'YYYY-MM-DD').startOf('day')
          : null;
        let plan_status = "";
        let plan_status_color = "";

        if (expiryDate && expiryDate.isValid()) {
          const daysDiff = expiryDate.diff(currentDate, 'days');

          if (daysDiff < 0) {
            plan_status = "expired";
            plan_status_color = "red";
            expired.push({
              id: company.id,
              owner_name: loginData?.username || "",
              owner_email: loginData?.recovery_email || "",
              owner_number: loginData?.recovery_mobile || "",
              company_category: categoryData?.category_name_b2b || "",
              company_subcategory: subcategoryData?.sub_category_name_b2b || "",
              plan_purchase_date: moment(company.plan_date).format('YYYY-MM-DD') || "",
              plan_expiry_date: moment(company.plan_expiry_date).format('YYYY-MM-DD') || "",
              created_date_time: moment(company.created_date_time).format('YYYY-MM-DD') || "",
              company_email: company.company_email || "",
              gst_number: company.gst_number || "",
              company_name: company.company_name || "",
              contact_count: contactCount || 0,
              reminder_count: reminderCount || 0,
              login_time: moment(loginOutTime?.login_date_time).format('YYYY-MM-DD HH:mm:ss') || "",
              logout_time: formattedLogoutTime,
              plan_type: companyPlanGet?.plan_name || "",
              company_cityName: companyCityGet?.city_name || "",
              company_team_mamber: companyTeamMamber || 0,
              quatation_count: companyQuatation || 0,
              order_count: companyOrder || 0,
              plan_status,
              plan_status_color,
              product_count: ProductCount || 0,
              task_count: TaskCount || 0,
            });
          } else if (daysDiff <= 7) {
            plan_status = "demo";
            plan_status_color = "orange";
            demo.push({
              id: company.id,
              owner_name: loginData?.username || "",
              owner_email: loginData?.recovery_email || "",
              owner_number: loginData?.recovery_mobile || "",
              company_category: categoryData?.category_name_b2b || "",
              company_subcategory: subcategoryData?.sub_category_name_b2b || "",
              plan_purchase_date: moment(company.plan_date).format('YYYY-MM-DD') || "",
              plan_expiry_date: moment(company.plan_expiry_date).format('YYYY-MM-DD') || "",
              created_date_time: moment(company.created_date_time).format('YYYY-MM-DD') || "",
              company_email: company.company_email || "",
              gst_number: company.gst_number || "",
              company_name: company.company_name || "",
              contact_count: contactCount || 0,
              reminder_count: reminderCount || 0,
              login_time: moment(loginOutTime?.login_date_time).format('YYYY-MM-DD HH:mm:ss') || "",
              logout_time: formattedLogoutTime,
              plan_type: companyPlanGet?.plan_name || "",
              company_cityName: companyCityGet?.city_name || "",
              company_team_mamber: companyTeamMamber || 0,
              quatation_count: companyQuatation || 0,
              order_count: companyOrder || 0,
              plan_status,
              plan_status_color,
              product_count: ProductCount || 0,
              task_count: TaskCount || 0,
            });
          } else if (daysDiff > 7) {
            plan_status = "paid";
            plan_status_color = "green";
            paid.push({
              id: company.id,
              owner_name: loginData?.username || "",
              owner_email: loginData?.recovery_email || "",
              owner_number: loginData?.recovery_mobile || "",
              company_category: categoryData?.category_name_b2b || "",
              company_subcategory: subcategoryData?.sub_category_name_b2b || "",
              plan_purchase_date: moment(company.plan_date).format('YYYY-MM-DD') || "",
              plan_expiry_date: moment(company.plan_expiry_date).format('YYYY-MM-DD') || "",
              created_date_time: moment(company.created_date_time).format('YYYY-MM-DD') || "",
              company_email: company.company_email || "",
              gst_number: company.gst_number || "",
              company_name: company.company_name || "",
              contact_count: contactCount || 0,
              reminder_count: reminderCount || 0,
              login_time: moment(loginOutTime?.login_date_time).format('YYYY-MM-DD HH:mm:ss') || "",
              logout_time: formattedLogoutTime,
              plan_type: companyPlanGet?.plan_name || "",
              company_cityName: companyCityGet?.city_name || "",
              company_team_mamber: companyTeamMamber || 0,
              quatation_count: companyQuatation || 0,
              order_count: companyOrder || 0,
              plan_status,
              plan_status_color,
              product_count: ProductCount || 0,
              task_count: TaskCount || 0,
              a_application_login_id: company.a_application_login_id || "",
            });
          }
        }

        return {
          id: company.id,
          owner_name: loginData?.username || "",
          owner_email: loginData?.recovery_email || "",
          owner_number: loginData?.recovery_mobile || "",
          company_category: categoryData?.category_name_b2b || "",
          company_subcategory: subcategoryData?.sub_category_name_b2b || "",
          plan_purchase_date: moment(company.plan_date).format('YYYY-MM-DD') || "",
          plan_expiry_date: moment(company.plan_expiry_date).format('YYYY-MM-DD') || "",
          created_date_time: moment(company.created_date_time).format('YYYY-MM-DD') || "",
          company_email: company.company_email || "",
          gst_number: company.gst_number || "",
          company_name: company.company_name || "",
          contact_count: contactCount || 0,
          reminder_count: reminderCount || 0,
          login_time: moment(loginOutTime?.login_date_time).format('YYYY-MM-DD HH:mm:ss') || "",
          logout_time: formattedLogoutTime,
          plan_type: companyPlanGet?.plan_name || "",
          company_cityName: companyCityGet?.city_name || "",
          company_team_mamber: companyTeamMamber || 0,
          quatation_count: companyQuatation || 0,
          order_count: companyOrder || 0,
          plan_status,
          plan_status_color,
          product_count: ProductCount || 0,
          task_count: TaskCount || 0,
        };
      })
    );

    return resSuccess({
      code: 200,
      ack: 1,
      ack_msg: "Company Vs Referral Code Data Fetched Successfully",
      developer_msg: "working good",
      data: {
        expired,
        demo,
        paid,
      },
    });
  } catch (error) {
    console.error("Error in getCompanyVsReferralCodeDetail:", error);
    return resError({
      ack_msg: "Failed to retrieve company data",
      developer_msg: error.message || "Unknown error occurred",
    });
  }
};

export const TeamJoinInnerMain = async (req, res) => {
  try {
    const { company_id, team_mobile_number } = req.body;
    // Validate input
    if (!company_id || !team_mobile_number) {
      return resError({
        ack_msg: "Company ID and team mobile number are required",
        developer_msg: "Company ID and team mobile number are required",
      });
    }

    const userList = await companyVsApplicationLoginModel.findAll({
      where: { company_masters_id: company_id, isDelete: 0 },
      attributes: ["company_masters_id", "a_application_login_id"],
    });

    const userCount = userList.length;

    const applicationLoginTypeRightModelIntance = applicationLoginTypeRightModel(req.tenantDB);
    const employeePayrollModelIntance = employeePayrollModel(req.tenantDB);
    const userRightsList = await applicationLoginTypeRightModelIntance.findAll({
      where: {
        company_masters_id: company_id,
        page_id: 34,
        isDelete: 0,
      },
      attributes: ["a_application_login_id", "a_page_id_rights_jason"],
    });

    for (const userRight of userRightsList) {
      try {
        let rightsJson = userRight.dataValues.a_page_id_rights_jason;
        if (typeof rightsJson === "string") {
          try {
            rightsJson = JSON.parse(rightsJson);
            if (typeof rightsJson === "string") {
              rightsJson = JSON.parse(rightsJson);
            }
          } catch (e) {
            rightsJson = {};
          }
        }

        if (typeof rightsJson?.limit === "number") {
          if (rightsJson.limit > 0 && userCount >= rightsJson.limit) {
            return resError({
              ack_msg: "Your Team Member Limit Exceeded",
              developer_msg: `Limit ${rightsJson.limit} reached for Company`,
            });
          }
        }
      } catch (err) {
        logger.error(
          "Error parsing JSON for a_application_login_id:",
          userRight.a_application_login_id,
          err
        );
      }
    }


    // Find team member by mobile number
    const findTeamData = await loginModel.findOne({
      where: {
        [Op.or]: [
          { recovery_mobile: team_mobile_number },
          { recovery_email: team_mobile_number },
        ],
        isDelete: 0,
      },
      attributes: ["id", "username"],
      raw: true,
    });

    if (!findTeamData) {
      return resError({
        ack_msg: "Team member not found with given mobile number",
        developer_msg: "Team member not found with given mobile number",
      });
    }

    // Verify company exists and get plan_id
    const companyMaster = await companyModel.findOne({
      where: { id: company_id, isDelete: "0" },
      attributes: ["id", "plan_id"],
      raw: true,
    });

    if (!companyMaster) {
      return resError({
        ack_msg: "Company not found",
        developer_msg: "Company not found",
      });
    }

    // Check if team member is already associated with the company
    const companyByLoginIdResult = await companyVsApplicationLoginModel.findOne({
      where: {
        a_application_login_id: findTeamData.id,
        company_masters_id: company_id,
        isDelete: 0,
      },
      attributes: ["id", "company_masters_id", "a_application_login_id", "company_flag"],
      raw: true,
    });

    if (companyByLoginIdResult) {
      return resError({
        ack_msg: "Team member is already Join with this company",
        developer_msg: "Team MemBer is All Ready Join",
      });
    }

    // Create company-team member association
    const companyVsApplicationsBody = {
      company_masters_id: company_id,
      company_flag: 2, // Team member role
      a_application_login_id: findTeamData.id,
    };

    const resultCompanyVsApplicationLoginCreate = await companyVsApplicationLoginModel.create(
      companyVsApplicationsBody
    );

    // Fetch all pages
    const allPages = await applicationPagesModel.findAll({
      where: { isDelete: "0" },
      attributes: ["id", "page_name"],
      raw: true,
    });

    // Fetch plan pages for the company's plan_id
    const planPages = await planVsPageModel.findAll({
      where: { plan_id: companyMaster.plan_id, isDelete: "0" },
      attributes: ["page_id", "data_limit"],
      raw: true,
    });

    // Create map of page_id to data_limit
    const planPagesMap = new Map();
    for (const planPage of planPages) {
      planPagesMap.set(planPage.page_id, planPage.data_limit);
    }

    // Fetch existing page rights for this team member and company
    const existingPageRights = await applicationLoginTypeRightModelIntance.findAll({
      where: {
        company_masters_id: company_id,
        a_application_login_id: findTeamData.id,
      },
      attributes: ["page_id"],
      raw: true,
    });

    const existingPageIds = new Set(existingPageRights.map((right) => right.page_id));

    // Prepare page rights for insertion
    const upsertPages = [];
    for (const page of allPages) {
      if (planPagesMap.has(page.id) && !existingPageIds.has(page.id)) {
        const dataLimit = planPagesMap.get(page.id) || 0;
        const pageRights = {
          view: 1,
          add: 1,
          edit: 1,
          delete: 0,
          approve: 0,
          import: 1,
          print: 1,
          share: 1,
          all_data: 0,
          personal: 1,
          limit: dataLimit,
        };

        upsertPages.push({
          a_application_login_id: findTeamData.id,
          company_masters_id: company_id,
          page_id: page.id,
          page_name: page.page_name,
          a_page_id_rights_jason: pageRights,
          created_date_time: new Date(),
        });
      }
    }
    // Bulk create page rights
    if (upsertPages.length > 0) {
      await applicationLoginTypeRightModelIntance.bulkCreate(upsertPages, {
        updateOnDuplicate: ["page_name", "a_page_id_rights_jason", "created_date_time"],
      });
    }
    // Create default payroll settings
    const existingPayroll = await employeePayrollModelIntance.findOne({
      where: {
        company_masters_id: company_id,
        a_application_login_id: findTeamData.id,
        isDelete: 0,
      },
    });

    if (!existingPayroll) {
      await employeePayrollModelIntance.create({
        company_masters_id: company_id,
        a_application_login_id: findTeamData.id,

        daily_in_time: "09:00:00",
        daily_out_time: "18:00:00",
        daily_working_hours: "09:00",
        daily_break_hours: "01:00",
        min_present_hours: "08:00",
        half_day_hours: "04:00",
        grace_period: 10,
        compulsary_attendance: 0,
        compulsary_attendance_image: 0,
        week_off_days: 0,
      });
    }
    // Return success response
    return resSuccess({
      data: { item: resultCompanyVsApplicationLoginCreate },
      developer_msg: "Your Team Member Joined Successfully",
    });
  } catch (error) {
    console.log("TeamJoinInnerMain Error", error)
    return resBadRequest({
      ack_msg: "Error",
      developer_msg: `${error.message}`,
    });
  }
};



export const companyUpdate = async (req, res) => {
  try {

    const {
      company_id,
      company_name,
      company_email,
      gst_number,
      currency_id,
      address,
      country_id,
      state_id,
      city_id,
      bank_detail,
      terms_and_condition,
      category_id_b2b,
      sub_category_id_b2b,
      upi_id,
      upi_name,
    } = req.body;


    const resultUpdateCompanyDetails = await companyModel.update(
      {
        company_name,
        company_email,
        gst_number,
        currency_id,
        address,
        country_id,
        state_id,
        city_id: city_id || null,
        bank_detail,
        terms_and_condition,
        category_id_b2b: category_id_b2b || null,
        sub_category_id_b2b: sub_category_id_b2b || null,
        upi_id: upi_id || null,
        upi_name: upi_name || null,
      },
      {
        where: { id: company_id },
      }
    );

    if (resultUpdateCompanyDetails) {
      return resSuccess({
        ack_msg: "Company updated successfully",
        data: { item: resultUpdateCompanyDetails },
      });
    }
  } catch (error) {
    return resBadRequest({
      ack_msg: " ",
      developer_msg: `${error.message}`,
    });
  }
};

export const mailSetupUpdate = async (req) => {
  const {
    company_id,
    host_out_going_mail,
    port_mail_setup,
    mail_id_setup,
    password_mail_setup,
    pop3_host,
    incoming_port,
  } = req.body;
  try {

    const isExistData = await companyVsThirdPartyModal.findOne({
      where: { company_id: company_id, isDelete: "0" },
      raw: true
    });

    if (isExistData) {
      const resultUpdateMailSetup = await companyVsThirdPartyModal.update(
        {
          host_out_going_mail: host_out_going_mail,
          port_mail_setup: port_mail_setup,
          mail_id_setup: mail_id_setup,
          password_mail_setup: password_mail_setup,
          incoming_port: incoming_port,
          pop3_host: pop3_host,
        },
        {
          where: { company_id: company_id, isDelete: "0" },
        }
      );
      if (resultUpdateMailSetup) {
        return resSuccess({
          ack_msg: "Mail Setup updated successfully",
          data: { item: resultUpdateMailSetup },
        });
      } else {
        return resError();
      }
    } else {
      const resultCreateMailSetup = await companyVsThirdPartyModal.create(
        {
          company_id: company_id,
          host_out_going_mail: host_out_going_mail,
          port_mail_setup: port_mail_setup,
          mail_id_setup: mail_id_setup,
          password_mail_setup: password_mail_setup,
          incoming_port: incoming_port,
          pop3_host: pop3_host,
        },
      );
      if (resultCreateMailSetup) {
        return resSuccess({
          ack_msg: "Mail Setup created successfully",
          data: { item: resultCreateMailSetup },
        });
      } else {
        return resError();
      }
    }

  } catch (error) {
    return resBadRequest({
      ack_msg: " ",
      developer_msg: `${error.message}`,
    });
  }
};

export const mailSetupGet = async (req) => {
  try {
    const {
      company_id
    } = req.body

    const result = await companyVsThirdPartyModal.findOne({
      where: { isDelete: "0", company_id: company_id },
      attributes: [
        "host_out_going_mail",
        "port_mail_setup",
        "mail_id_setup",
        "password_mail_setup",
        "pop3_host",
        "incoming_port"
      ],
    });

    if (result) {
      return resSuccess({
        data: { item: result },
      });
    } else {
      return resError({
        ack_msg: "No mail setup data found",
        developer_msg: "Data not found",
      });
    }
  } catch (e) {
    return resBadRequest({ developer_msg: `error ${e}` });
  }
}

export const thirdPartyUpdate = async (req) => {
  const {
    company_id,
    trade_india_user_id,
    trade_india_profile_id,
    trade_india_key,
    india_mart_api_key,
    whatsapp_authkey,
    whatsapp_appkey,
    chatgpt_appkey,
    gimini_appkey,
    google_lead_sheet_for_faceBook_1,
    google_lead_sheet_for_faceBook_2,
    google_sheet_key_3,
    google_sheet_key_4,
    google_sheet_first_name,
    google_sheet_second_name,
    google_sheet_third_name,
    google_sheet_fourth_name,
    serp_api_key,

  } = req.body;
  try {
    const isExistData = await companyVsThirdPartyModal.findOne(
      {
        where: { company_id: company_id, isDelete: "0" },
        raw: true
      });
    if (isExistData) {
      const resultUpdateThirdParty = await companyVsThirdPartyModal.update(
        {
          trade_india_user_id: trade_india_user_id,
          trade_india_profile_id: trade_india_profile_id,
          trade_india_key: trade_india_key,
          india_mart_api_key: india_mart_api_key,
          whatsapp_authkey: whatsapp_authkey,
          whatsapp_appkey: whatsapp_appkey,
          gimini_appkey: gimini_appkey,
          chatgpt_appkey: chatgpt_appkey,
          google_lead_sheet_for_faceBook_1: google_lead_sheet_for_faceBook_1,
          google_lead_sheet_for_faceBook_2: google_lead_sheet_for_faceBook_2,
          google_sheet_key_3: google_sheet_key_3,
          google_sheet_key_4: google_sheet_key_4,
          google_sheet_first_name,
          google_sheet_second_name,
          google_sheet_third_name,
          google_sheet_fourth_name,
          serp_api_key: serp_api_key,
        },
        {
          where: { company_id: company_id, isDelete: "0" },
        }
      );

      if (resultUpdateThirdParty) {
        return resSuccess({
          ack_msg: "Third Party updated successfully",
          data: { item: resultUpdateThirdParty },
        });
      } else {
        return resError();
      }
    } else {
      const resultCreateThirdParty = await companyVsThirdPartyModal.create(
        {
          company_id: company_id,
          trade_india_user_id: trade_india_user_id,
          trade_india_profile_id: trade_india_profile_id,
          trade_india_key: trade_india_key,
          india_mart_api_key: india_mart_api_key,
          whatsapp_authkey: whatsapp_authkey,
          whatsapp_appkey: whatsapp_appkey,
          gimini_appkey: gimini_appkey,
          chatgpt_appkey: chatgpt_appkey,
          google_lead_sheet_for_faceBook_1: google_lead_sheet_for_faceBook_1,
          google_lead_sheet_for_faceBook_2: google_lead_sheet_for_faceBook_2,
          google_sheet_key_3: google_sheet_key_3,
          google_sheet_key_4: google_sheet_key_4,
          serp_api_key: serp_api_key,
        }
      );

      if (resultCreateThirdParty) {
        return resSuccess({
          ack_msg: "Third Party created successfully",
          data: { item: resultCreateThirdParty },
        });
      } else {
        return resError();
      }
    }
  } catch (error) {
    return resBadRequest({
      ack_msg: " ",
      developer_msg: `${error.message}`,
    });
  }
};

export const thirdPartyGet = async (req) => {
  try {
    const {
      company_id
    } = req.body

    const result = await companyVsThirdPartyModal.findOne({
      where: { isDelete: "0", company_id: company_id },
      attributes: [
        "trade_india_user_id",
        "trade_india_profile_id",
        "trade_india_key",
        "india_mart_api_key",
        "whatsapp_authkey",
        "whatsapp_appkey",
        "chatgpt_appkey",
        "gimini_appkey",
        "google_lead_sheet_for_faceBook_1",
        "google_lead_sheet_for_faceBook_2",
        "google_sheet_key_3",
        "google_sheet_key_4",
        "google_sheet_first_name",
        "google_sheet_second_name",
        "google_sheet_third_name",
        "google_sheet_fourth_name",
        "serp_api_key"
      ],
    });

    if (result) {
      return resSuccess({
        data: { item: result },
      });
    } else {
      return resError({
        ack_msg: "No third party data found",
        developer_msg: "Data not found",
      });
    }
  } catch (e) {
    return resBadRequest({ developer_msg: `error ${e}` });
  }
}

export const setPrefixUpdate = async (req) => {
  const {
    company_id,

    order_prefix,
    order_title,
    order_doc_no,
    order_view_color,
    order_view_formate,

    quotation_prefix,
    quotation_title,
    quotation_doc_no,
    quotation_view_color,
    quotation_view_formate,

    proforma_invoice_prefix,
    proforma_invoice_title,
    proforma_invoice_doc_no,
    proforma_invoice_view_color,
    proforma_invoice_view_formate,

    invoice_prefix,
    invoice_title,
    invoice_doc_no,
    invoice_view_color,
    invoice_view_formate,

    purchase_ord_prefix,
    purchase_order_title,
    purchase_order_doc_no,
    purchase_order_view_color,
    purchase_order_view_formate,

    return_sales_invoice_prefix,
    return_sales_invoice_title,
    return_sales_invoice_doc_no,
    return_sales_invoice_view_color,
    return_sales_invoice_view_formate,

    return_purchase_invoice_prefix,
    return_purchase_invoice_title,
    return_purchase_invoice_doc_no,
    return_purchase_invoice_view_color,
    return_purchase_invoice_view_formate,

    workorder_prefix,
    workorder_title,
    workorder_doc_no,
    workorder_view_color,
    workorder_view_formate,

    purchase_prefix,
    purchase_title,
    purchase_doc_no,
    purchase_view_color,
    purchase_view_formate,

    quotation_terms_conditions,
    quotation_remark,
    quotation_note,

    proforma_invoice_terms_conditions,
    proforma_invoice_remark,
    proforma_invoice_note,

    order_terms_conditions,
    order_remark,
    order_note,

    sales_invoice_terms_conditions,
    sales_invoice_remark,
    sales_invoice_note,

    return_sales_invoice_terms_conditions,
    return_sales_invoice_remark,
    return_sales_invoice_note,

    purchase_order_terms_conditions,
    purchase_order_remark,
    purchase_order_note,

    purchase_invoice_terms_conditions,
    purchase_invoice_remark,
    purchase_invoice_note,

    return_purchase_invoice_terms_conditions,
    return_purchase_invoice_remark,
    return_purchase_invoice_note,

    work_order_terms_conditions,
    work_order_remark,
    work_order_note,

    inward_prefix,
    inward_title,
    inward_doc_no,
    inward_view_color,
    inward_view_formate,

    inward_terms_conditions,
    inward_remark,
    inward_note,

    dispatch_prefix,
    dispatch_title,
    dispatch_doc_no,
    dispatch_view_color,
    dispatch_view_formate,

    dispatch_terms_conditions,
    dispatch_remark,
    dispatch_note,

    quotation_packing_charge_title,
    quotation_transport_charge_title,
    quotation_tcs_title,
    quotation_tsc_percentage,

    order_packing_charge_title,
    order_transport_charge_title,
    order_tcs_title,
    order_tsc_percentage,

    sales_invoice_packing_charge_title,
    sales_invoice_transport_charge_title,
    sales_invoice_tcs_title,
    sales_invoice_tsc_percentage,

    return_sales_invoice_packing_charge_title,
    return_sales_invoice_transport_charge_title,
    return_sales_invoice_tcs_title,
    return_sales_invoice_tsc_percentage,

    purchase_order_packing_charge_title,
    purchase_order_transport_charge_title,
    purchase_order_tcs_title,
    purchase_order_tsc_percentage,

    purchase_invoice_packing_charge_title,
    purchase_invoice_transport_charge_title,
    purchase_invoice_tcs_title,
    purchase_invoice_tsc_percentage,

    return_purchase_invoice_packing_charge_title,
    return_purchase_invoice_transport_charge_title,
    return_purchase_invoice_tcs_title,
    return_purchase_invoice_tsc_percentage,

    work_order_packing_charge_title,
    work_order_transport_charge_title,
    work_order_tcs_title,
    work_order_tsc_percentage,

    inward_packing_charge_title,
    inward_transport_charge_title,
    inward_tcs_title,
    inward_tsc_percentage,

    dispatch_packing_charge_title,
    dispatch_transport_charge_title,
    dispatch_tcs_title,
    dispatch_tsc_percentage,

  } = req.body;

  try {

    const isExistData = await companyVsSetPrefixModel.findOne({
      where: { company_id: company_id, isDelete: "0" },
      raw: true
    });

    if (isExistData) {
      const resultUpdateSetPrefix = await companyVsSetPrefixModel.update(
        {
          order_prefix: order_prefix,
          order_title: order_title,
          order_doc_no: order_doc_no,
          order_view_color: order_view_color,
          order_view_formate: order_view_formate,

          quotation_prefix: quotation_prefix,
          quotation_title: quotation_title,
          quotation_doc_no: quotation_doc_no,
          quotation_view_color: quotation_view_color,
          quotation_view_formate: quotation_view_formate,


          proforma_invoice_prefix: proforma_invoice_prefix,
          proforma_invoice_title: proforma_invoice_title,
          proforma_invoice_doc_no: proforma_invoice_doc_no,
          proforma_invoice_view_color: proforma_invoice_view_color,
          proforma_invoice_view_formate: proforma_invoice_view_formate,


          invoice_prefix: invoice_prefix,
          invoice_title: invoice_title,
          invoice_doc_no: invoice_doc_no,
          invoice_view_color: invoice_view_color,
          invoice_view_formate: invoice_view_formate,

          purchase_ord_prefix: purchase_ord_prefix,
          purchase_order_title: purchase_order_title,
          purchase_order_doc_no: purchase_order_doc_no,
          purchase_order_view_color: purchase_order_view_color,
          purchase_order_view_formate: purchase_order_view_formate,

          return_sales_invoice_prefix: return_sales_invoice_prefix,
          return_sales_invoice_title: return_sales_invoice_title,
          return_sales_invoice_doc_no: return_sales_invoice_doc_no,
          return_sales_invoice_view_color: return_sales_invoice_view_color,
          return_sales_invoice_view_formate: return_sales_invoice_view_formate,

          return_purchase_invoice_prefix: return_purchase_invoice_prefix,
          return_purchase_invoice_title: return_purchase_invoice_title,
          return_purchase_invoice_doc_no: return_purchase_invoice_doc_no,
          return_purchase_invoice_view_color: return_purchase_invoice_view_color,
          return_purchase_invoice_view_formate: return_purchase_invoice_view_formate,

          workorder_prefix: workorder_prefix,
          workorder_title: workorder_title,
          workorder_doc_no: workorder_doc_no,
          workorder_view_color: workorder_view_color,
          workorder_view_formate: workorder_view_formate,

          purchase_prefix: purchase_prefix,
          purchase_title: purchase_title,
          purchase_doc_no: purchase_doc_no,
          purchase_view_color: purchase_view_color,
          purchase_view_formate: purchase_view_formate,

          quotation_terms_conditions: quotation_terms_conditions,
          quotation_remark: quotation_remark,
          quotation_note: quotation_note,

          proforma_invoice_terms_conditions: proforma_invoice_terms_conditions,
          proforma_invoice_remark: proforma_invoice_remark,
          proforma_invoice_note: proforma_invoice_note,

          order_terms_conditions: order_terms_conditions,
          order_remark: order_remark,
          order_note: order_note,

          sales_invoice_terms_conditions: sales_invoice_terms_conditions,
          sales_invoice_remark: sales_invoice_remark,
          sales_invoice_note: sales_invoice_note,

          return_sales_invoice_terms_conditions: return_sales_invoice_terms_conditions,
          return_sales_invoice_remark: return_sales_invoice_remark,
          return_sales_invoice_note: return_sales_invoice_note,

          purchase_order_terms_conditions: purchase_order_terms_conditions,
          purchase_order_remark: purchase_order_remark,
          purchase_order_note: purchase_order_note,

          purchase_invoice_terms_conditions: purchase_invoice_terms_conditions,
          purchase_invoice_remark: purchase_invoice_remark,
          purchase_invoice_note: purchase_invoice_note,

          return_purchase_invoice_terms_conditions: return_purchase_invoice_terms_conditions,
          return_purchase_invoice_remark: return_purchase_invoice_remark,
          return_purchase_invoice_note: return_purchase_invoice_note,

          work_order_terms_conditions: work_order_terms_conditions,
          work_order_remark: work_order_remark,
          work_order_note: work_order_note,

          inward_prefix: inward_prefix,
          inward_title: inward_title,
          inward_doc_no: inward_doc_no,
          inward_view_color: inward_view_color,
          inward_view_formate: inward_view_formate,

          inward_terms_conditions: inward_terms_conditions,
          inward_remark: inward_remark,
          inward_note: inward_note,

          dispatch_prefix: dispatch_prefix,
          dispatch_title: dispatch_title,
          dispatch_doc_no: dispatch_doc_no,
          dispatch_view_color: dispatch_view_color,
          dispatch_view_formate: dispatch_view_formate,

          dispatch_terms_conditions: dispatch_terms_conditions,
          dispatch_remark: dispatch_remark,
          dispatch_note: dispatch_note,

          quotation_packing_charge_title: quotation_packing_charge_title,
          quotation_transport_charge_title: quotation_transport_charge_title,
          quotation_tcs_title: quotation_tcs_title,
          quotation_tsc_percentage: quotation_tsc_percentage,

          order_packing_charge_title: order_packing_charge_title,
          order_transport_charge_title: order_transport_charge_title,
          order_tcs_title: order_tcs_title,
          order_tsc_percentage: order_tsc_percentage,

          sales_invoice_packing_charge_title: sales_invoice_packing_charge_title,
          sales_invoice_transport_charge_title: sales_invoice_transport_charge_title,
          sales_invoice_tcs_title: sales_invoice_tcs_title,
          sales_invoice_tsc_percentage: sales_invoice_tsc_percentage,

          return_sales_invoice_packing_charge_title: return_sales_invoice_packing_charge_title,
          return_sales_invoice_transport_charge_title: return_sales_invoice_transport_charge_title,
          return_sales_invoice_tcs_title: return_sales_invoice_tcs_title,
          return_sales_invoice_tsc_percentage: return_sales_invoice_tsc_percentage,

          purchase_order_packing_charge_title: purchase_order_packing_charge_title,
          purchase_order_transport_charge_title: purchase_order_transport_charge_title,
          purchase_order_tcs_title: purchase_order_tcs_title,
          purchase_order_tsc_percentage: purchase_order_tsc_percentage,

          purchase_invoice_packing_charge_title: purchase_invoice_packing_charge_title,
          purchase_invoice_transport_charge_title: purchase_invoice_transport_charge_title,
          purchase_invoice_tcs_title: purchase_invoice_tcs_title,
          purchase_invoice_tsc_percentage: purchase_invoice_tsc_percentage,

          return_purchase_invoice_packing_charge_title: return_purchase_invoice_packing_charge_title,
          return_purchase_invoice_transport_charge_title: return_purchase_invoice_transport_charge_title,
          return_purchase_invoice_tcs_title: return_purchase_invoice_tcs_title,
          return_purchase_invoice_tsc_percentage: return_purchase_invoice_tsc_percentage,

          work_order_packing_charge_title: work_order_packing_charge_title,
          work_order_transport_charge_title: work_order_transport_charge_title,
          work_order_tcs_title: work_order_tcs_title,
          work_order_tsc_percentage: work_order_tsc_percentage,

          inward_packing_charge_title: inward_packing_charge_title,
          inward_transport_charge_title: inward_transport_charge_title,
          inward_tcs_title: inward_tcs_title,
          inward_tsc_percentage: inward_tsc_percentage,

          dispatch_packing_charge_title: dispatch_packing_charge_title,
          dispatch_transport_charge_title: dispatch_transport_charge_title,
          dispatch_tcs_title: dispatch_tcs_title,
          dispatch_tsc_percentage: dispatch_tsc_percentage,
        },
        {
          where: { company_id: company_id, isDelete: "0" },
        }
      );
      console.log("resultUpdateSetPrefixresultUpdateSetPrefixresultUpdateSetPrefix", resultUpdateSetPrefix);

      if (resultUpdateSetPrefix) {
        return resSuccess({
          ack_msg: "SetPrefix updated successfully",
          data: { item: resultUpdateSetPrefix },
        });
      } else {
        return resError();
      }
    } else {
      const resultCreateSetPrefix = await companyVsSetPrefixModel.create(
        {
          company_id: company_id,
          order_prefix: order_prefix,
          order_title: order_title,
          order_doc_no: order_doc_no,
          order_view_color: order_view_color,
          order_view_formate: order_view_formate,

          quotation_prefix: quotation_prefix,
          quotation_title: quotation_title,
          quotation_doc_no: quotation_doc_no,
          quotation_view_color: quotation_view_color,
          quotation_view_formate: quotation_view_formate,


          proforma_invoice_prefix: proforma_invoice_prefix,
          proforma_invoice_title: proforma_invoice_title,
          proforma_invoice_doc_no: proforma_invoice_doc_no,
          proforma_invoice_view_color: proforma_invoice_view_color,
          proforma_invoice_view_formate: proforma_invoice_view_formate,


          invoice_prefix: invoice_prefix,
          invoice_title: invoice_title,
          invoice_doc_no: invoice_doc_no,
          invoice_view_color: invoice_view_color,
          invoice_view_formate: invoice_view_formate,

          purchase_ord_prefix: purchase_ord_prefix,
          purchase_order_title: purchase_order_title,
          purchase_order_doc_no: purchase_order_doc_no,
          purchase_order_view_color: purchase_order_view_color,
          purchase_order_view_formate: purchase_order_view_formate,

          return_sales_invoice_prefix: return_sales_invoice_prefix,
          return_sales_invoice_title: return_sales_invoice_title,
          return_sales_invoice_doc_no: return_sales_invoice_doc_no,
          return_sales_invoice_view_color: return_sales_invoice_view_color,
          return_sales_invoice_view_formate: return_sales_invoice_view_formate,

          return_purchase_invoice_prefix: return_purchase_invoice_prefix,
          return_purchase_invoice_title: return_purchase_invoice_title,
          return_purchase_invoice_doc_no: return_purchase_invoice_doc_no,
          return_purchase_invoice_view_color: return_purchase_invoice_view_color,
          return_purchase_invoice_view_formate: return_purchase_invoice_view_formate,

          workorder_prefix: workorder_prefix,
          workorder_title: workorder_title,
          workorder_doc_no: workorder_doc_no,
          workorder_view_color: workorder_view_color,
          workorder_view_formate: workorder_view_formate,

          purchase_prefix: purchase_prefix,
          purchase_title: purchase_title,
          purchase_doc_no: purchase_doc_no,
          purchase_view_color: purchase_view_color,
          purchase_view_formate: purchase_view_formate,

          quotation_terms_conditions: quotation_terms_conditions,
          quotation_remark: quotation_remark,
          quotation_note: quotation_note,

          proforma_invoice_terms_conditions: proforma_invoice_terms_conditions,
          proforma_invoice_remark: proforma_invoice_remark,
          proforma_invoice_note: proforma_invoice_note,

          order_terms_conditions: order_terms_conditions,
          order_remark: order_remark,
          order_note: order_note,

          sales_invoice_terms_conditions: sales_invoice_terms_conditions,
          sales_invoice_remark: sales_invoice_remark,
          sales_invoice_note: sales_invoice_note,

          return_sales_invoice_terms_conditions: return_sales_invoice_terms_conditions,
          return_sales_invoice_remark: return_sales_invoice_remark,
          return_sales_invoice_note: return_sales_invoice_note,

          purchase_order_terms_conditions: purchase_order_terms_conditions,
          purchase_order_remark: purchase_order_remark,
          purchase_order_note: purchase_order_note,

          purchase_invoice_terms_conditions: purchase_invoice_terms_conditions,
          purchase_invoice_remark: purchase_invoice_remark,
          purchase_invoice_note: purchase_invoice_note,

          return_purchase_invoice_terms_conditions: return_purchase_invoice_terms_conditions,
          return_purchase_invoice_remark: return_purchase_invoice_remark,
          return_purchase_invoice_note: return_purchase_invoice_note,

          work_order_terms_conditions: work_order_terms_conditions,
          work_order_remark: work_order_remark,
          work_order_note: work_order_note,

          inward_prefix: inward_prefix,
          inward_title: inward_title,
          inward_doc_no: inward_doc_no,
          inward_view_color: inward_view_color,
          inward_view_formate: inward_view_formate,

          inward_terms_conditions: inward_terms_conditions,
          inward_remark: inward_remark,
          inward_note: inward_note,

          dispatch_prefix: dispatch_prefix,
          dispatch_title: dispatch_title,
          dispatch_doc_no: dispatch_doc_no,
          dispatch_view_color: dispatch_view_color,
          dispatch_view_formate: dispatch_view_formate,

          dispatch_terms_conditions: dispatch_terms_conditions,
          dispatch_remark: dispatch_remark,
          dispatch_note: dispatch_note,

          quotation_packing_charge_title: quotation_packing_charge_title,
          quotation_transport_charge_title: quotation_transport_charge_title,
          quotation_tcs_title: quotation_tcs_title,
          quotation_tsc_percentage: quotation_tsc_percentage,

          order_packing_charge_title: order_packing_charge_title,
          order_transport_charge_title: order_transport_charge_title,
          order_tcs_title: order_tcs_title,
          order_tsc_percentage: order_tsc_percentage,

          sales_invoice_packing_charge_title: sales_invoice_packing_charge_title,
          sales_invoice_transport_charge_title: sales_invoice_transport_charge_title,
          sales_invoice_tcs_title: sales_invoice_tcs_title,
          sales_invoice_tsc_percentage: sales_invoice_tsc_percentage,

          return_sales_invoice_packing_charge_title: return_sales_invoice_packing_charge_title,
          return_sales_invoice_transport_charge_title: return_sales_invoice_transport_charge_title,
          return_sales_invoice_tcs_title: return_sales_invoice_tcs_title,
          return_sales_invoice_tsc_percentage: return_sales_invoice_tsc_percentage,

          purchase_order_packing_charge_title: purchase_order_packing_charge_title,
          purchase_order_transport_charge_title: purchase_order_transport_charge_title,
          purchase_order_tcs_title: purchase_order_tcs_title,
          purchase_order_tsc_percentage: purchase_order_tsc_percentage,

          purchase_invoice_packing_charge_title: purchase_invoice_packing_charge_title,
          purchase_invoice_transport_charge_title: purchase_invoice_transport_charge_title,
          purchase_invoice_tcs_title: purchase_invoice_tcs_title,
          purchase_invoice_tsc_percentage: purchase_invoice_tsc_percentage,

          return_purchase_invoice_packing_charge_title: return_purchase_invoice_packing_charge_title,
          return_purchase_invoice_transport_charge_title: return_purchase_invoice_transport_charge_title,
          return_purchase_invoice_tcs_title: return_purchase_invoice_tcs_title,
          return_purchase_invoice_tsc_percentage: return_purchase_invoice_tsc_percentage,

          work_order_packing_charge_title: work_order_packing_charge_title,
          work_order_transport_charge_title: work_order_transport_charge_title,
          work_order_tcs_title: work_order_tcs_title,
          work_order_tsc_percentage: work_order_tsc_percentage,

          inward_packing_charge_title: inward_packing_charge_title,
          inward_transport_charge_title: inward_transport_charge_title,
          inward_tcs_title: inward_tcs_title,
          inward_tsc_percentage: inward_tsc_percentage,

          dispatch_packing_charge_title: dispatch_packing_charge_title,
          dispatch_transport_charge_title: dispatch_transport_charge_title,
          dispatch_tcs_title: dispatch_tcs_title,
          dispatch_tsc_percentage: dispatch_tsc_percentage,
        },
      );
      console.log("resultCreateSetPrefixresultCreateSetPrefix", resultCreateSetPrefix);

      if (resultCreateSetPrefix) {
        return resSuccess({
          ack_msg: "SetPrefix created successfully",
          data: { item: resultCreateSetPrefix },
        });
      } else {
        return resError();
      }
    }
  } catch (error) {
    return resBadRequest({
      ack_msg: " ",
      developer_msg: `${error.message}`,
    });
  }
};

export const setPrefixGet = async (req) => {
  try {
    const {
      company_id
    } = req.body

    const result = await companyVsSetPrefixModel.findOne({
      where: { isDelete: "0", company_id: company_id },
      attributes: [
        "order_prefix",
        "order_title",
        "order_doc_no",
        "order_view_color",
        "order_view_formate",

        "quotation_prefix",
        "quotation_title",
        "quotation_doc_no",
        "quotation_view_color",
        "quotation_view_formate",

        "proforma_invoice_prefix",
        "proforma_invoice_title",
        "proforma_invoice_doc_no",
        "proforma_invoice_view_color",
        "proforma_invoice_view_formate",

        "invoice_prefix",
        "invoice_title",
        "invoice_doc_no",
        "invoice_view_color",
        "invoice_view_formate",

        "purchase_ord_prefix",
        "purchase_order_title",
        "purchase_order_doc_no",
        "purchase_order_view_color",
        "purchase_order_view_formate",

        "return_sales_invoice_prefix",
        "return_sales_invoice_title",
        "return_sales_invoice_doc_no",
        "return_sales_invoice_view_color",
        "return_sales_invoice_view_formate",

        "return_purchase_invoice_prefix",
        "return_purchase_invoice_title",
        "return_purchase_invoice_doc_no",
        "return_purchase_invoice_view_color",
        "return_purchase_invoice_view_formate",

        "workorder_prefix",
        "workorder_title",
        "workorder_doc_no",
        "workorder_view_color",
        "workorder_view_formate",

        "purchase_prefix",
        "purchase_title",
        "purchase_doc_no",
        "purchase_view_color",
        "purchase_view_formate",

        "quotation_terms_conditions",
        "quotation_remark",
        "quotation_note",

        "proforma_invoice_terms_conditions",
        "proforma_invoice_remark",
        "proforma_invoice_note",

        "order_terms_conditions",
        "order_remark",
        "order_note",

        "sales_invoice_terms_conditions",
        "sales_invoice_remark",
        "sales_invoice_note",

        "return_sales_invoice_terms_conditions",
        "return_sales_invoice_remark",
        "return_sales_invoice_note",

        "purchase_order_terms_conditions",
        "purchase_order_remark",
        "purchase_order_note",

        "purchase_invoice_terms_conditions",
        "purchase_invoice_remark",
        "purchase_invoice_note",

        "return_purchase_invoice_terms_conditions",
        "return_purchase_invoice_remark",
        "return_purchase_invoice_note",

        "work_order_terms_conditions",
        "work_order_remark",
        "work_order_note",

        "inward_prefix",
        "inward_title",
        "inward_doc_no",
        "inward_view_color",
        "inward_view_formate",

        "inward_terms_conditions",
        "inward_remark",
        "inward_note",

        "dispatch_prefix",
        "dispatch_title",
        "dispatch_doc_no",
        "dispatch_view_color",
        "dispatch_view_formate",

        "dispatch_terms_conditions",
        "dispatch_remark",
        "dispatch_note",

        "quotation_packing_charge_title",
        "quotation_transport_charge_title",
        "quotation_tcs_title",
        "quotation_tsc_percentage",

        "order_packing_charge_title",
        "order_transport_charge_title",
        "order_tcs_title",
        "order_tsc_percentage",

        "sales_invoice_packing_charge_title",
        "sales_invoice_transport_charge_title",
        "sales_invoice_tcs_title",
        "sales_invoice_tsc_percentage",

        "return_sales_invoice_packing_charge_title",
        "return_sales_invoice_transport_charge_title",
        "return_sales_invoice_tcs_title",
        "return_sales_invoice_tsc_percentage",

        "purchase_order_packing_charge_title",
        "purchase_order_transport_charge_title",
        "purchase_order_tcs_title",
        "purchase_order_tsc_percentage",

        "purchase_invoice_packing_charge_title",
        "purchase_invoice_transport_charge_title",
        "purchase_invoice_tcs_title",
        "purchase_invoice_tsc_percentage",

        "return_purchase_invoice_packing_charge_title",
        "return_purchase_invoice_transport_charge_title",
        "return_purchase_invoice_tcs_title",
        "return_purchase_invoice_tsc_percentage",

        "work_order_packing_charge_title",
        "work_order_transport_charge_title",
        "work_order_tcs_title",
        "work_order_tsc_percentage",

        "inward_packing_charge_title",
        "inward_transport_charge_title",
        "inward_tcs_title",
        "inward_tsc_percentage",

        "dispatch_packing_charge_title",
        "dispatch_transport_charge_title",
        "dispatch_tcs_title",
        "dispatch_tsc_percentage"
      ],
    });

    if (result) {
      return resSuccess({
        data: { item: result },
      });
    } else {
      return resError({
        ack_msg: "No set prefix data found",
        developer_msg: "Data not found",
      });
    }
  } catch (e) {
    return resBadRequest({ developer_msg: `error ${e}` });
  }
}

export const imageSettingsUpdate = async (req) => {
  try {
    const { company_id } = req.body;

    const headerImg = req?.files?.header_img?.[0];
    const footerImg = req?.files?.footer_img?.[0];
    const companyImg = req?.files?.company_logo?.[0];
    const companySign = req?.files?.company_sign?.[0];
    const catalogPdf = req?.files?.catalog_pdf?.[0];
    const bannerOne = req?.files?.banner_img_one?.[0];
    const bannerTwo = req?.files?.banner_img_two?.[0];

    const directoryPath = path.join(
      process.cwd(),
      "media-folder",
      "company_image",
      company_id.toString()
    );

    await fs.mkdirp(directoryPath);

    const saveFile = async (file) => {
      if (!file) return null;

      const filePath = file.path;
      const fileName = path.basename(filePath);
      const destination = path.join(directoryPath, fileName);

      await fs.move(filePath, destination);

      return company_id + "/" + fileName;
    };

    const convertPathHeader = await saveFile(headerImg);
    const convertPathFooter = await saveFile(footerImg);
    const convertPathCompany = await saveFile(companyImg);
    const convertPathSign = await saveFile(companySign);
    const convertPathCatalog = await saveFile(catalogPdf);
    const convertPathBannerOne = await saveFile(bannerOne);
    const convertPathBannerTwo = await saveFile(bannerTwo);

    const updateData = {};

    if (convertPathHeader) updateData.header_img = convertPathHeader;
    if (convertPathFooter) updateData.footer_img = convertPathFooter;
    if (convertPathCompany) updateData.company_logo = convertPathCompany;
    if (convertPathSign) updateData.company_sign = convertPathSign;
    if (convertPathCatalog) updateData.company_catalog = convertPathCatalog;
    if (convertPathBannerOne) updateData.banner_img_one = convertPathBannerOne;
    if (convertPathBannerTwo) updateData.banner_img_two = convertPathBannerTwo;

    const result = await companyModel.update(updateData, {
      where: { id: company_id },
    });

    if (result) {
      return resSuccess({
        ack_msg: "Image Settings updated successfully",
        data: { item: result },
      });
    }

    return resError();
  } catch (error) {
    return resBadRequest({
      ack_msg: "",
      developer_msg: error.message,
    });
  }
};

export const moduleSettingsUpdate = async (req) => {
  try {

    const {
      company_id,
      order_qty_unit,
      in_order_image_view,
      watermark_in_print,
      is_contact_validation,
      is_strict_check_product_stock,
      is_strict_wharehouse_wise_product_stock_check,
      view_inquiry_form_in_contact,
      same_product_multiple_in_cart,
    } = req.body;

    const resultUpdateModule = await companyModel.update(
      {
        in_order_image_view: in_order_image_view,
        watermark_in_print: watermark_in_print,
        is_contact_validation: is_contact_validation,
        is_strict_check_product_stock: is_strict_check_product_stock,
        is_strict_wharehouse_wise_product_stock_check: is_strict_wharehouse_wise_product_stock_check,
        view_inquiry_form_in_contact: view_inquiry_form_in_contact,
        same_product_multiple_in_cart: same_product_multiple_in_cart,
        order_qty_unit: order_qty_unit,
      },
      {
        where: { id: company_id },
      }
    );
    if (resultUpdateModule) {
      return resSuccess({
        ack_msg: "Module Settings updated successfully",
        data: { item: resultUpdateModule },
      });
    }
  } catch (error) {
    return resBadRequest({
      ack_msg: " ",
      developer_msg: `${error.message}`,
    });
  }
};

export const paymentDataAdd = async (req, res) => {
  const {
    razorpay_payment_id,
    razorpay_order_id,
    razorpay_signature,
    amount,
    created_date_time,
    a_application_login_id,
    plan_id,
    plan_name,
    plan_amount,
    discount_amount,
    gst_amount,
    plan_duration,
    coupon_code_id,
    downloadFlag,
    referralId,
    round_off_amount
  } = req.body;

  try {
    // Fetch company data first for email, filename, etc.
    const companyData = await companyModel.findOne({
      where: { a_application_login_id, isDelete: "0" },
      attributes: [
        "company_name",
        "company_email",
        "company_contact",
        "gst_number",
        "address",
        "plan_date",
        "plan_expiry_date",
        "header_img",
        "footer_img",
        "id",
        "country_id",
        "state_id",
        "city_id"
      ]
    });

    if (!companyData) {
      return resError({
        ack_msg: "Company Data Not Found",
        developer_msg: "Company Data Not Found",
      });
    }

    // Fetch register details
    // const userData = await loginModel.findOne({
    //   where: { id: a_application_login_id, isDelete: "0" },
    //   attributes: ["username"]
    // });

    let getPlanDetails;
    let invoice_number;
    let addDataOfPaymentHistory;

    if (downloadFlag == 1) {
      // Agar downloadFlag == 1 hai to sirf last record fetch karo (no create)
      getPlanDetails = await companyVsPlansModel.findOne({
        where: { a_application_login_id, isDelete: "0" },
        order: [['id', 'DESC']]
      });

      if (!getPlanDetails) {
        return resError({
          ack_msg: "No payment history found for this company",
          developer_msg: "No payment history found for this company",
        });
      }

      invoice_number = getPlanDetails.invoice_number;
    } else {
      // Ye wala part open rakha hai - sirf data add hoga
      const lastRecord = await companyVsPlansModel.findOne({
        where: { isDelete: "0" },
        order: [['sr_by_number', 'DESC']],
        attributes: ["sr_by_number"]
      });

      const nextSrNumber = lastRecord?.sr_by_number ? lastRecord.sr_by_number + 1 : 1;

      invoice_number = `INV/${nextSrNumber}/25-26/`;

      const invoice_created_date_time = moment().format("YYYY-MM-DD HH:mm:ss");

      // Ye line open hai - data successfully add hoga
      addDataOfPaymentHistory = await companyVsPlansModel.create({
        razorpay_payment_id,
        razorpay_order_id,
        razorpay_signature,
        amount,
        a_application_login_id,
        plan_id,
        plan_name,
        plan_amount,
        discount_amount,
        gst_amount,
        plan_duration,
        coupon_code_id: coupon_code_id || "",
        sr_by_number: nextSrNumber,
        invoice_number: invoice_number,
        invoice_created_date_time: invoice_created_date_time,
        created_date_time: created_date_time,
        company_masters_id: companyData.id,
        round_off_amount
      });

      if (!addDataOfPaymentHistory) {
        return resError({
          ack_msg: "Failed to save payment history",
          developer_msg: "Failed to save payment history",
        });
      }

      getPlanDetails = addDataOfPaymentHistory;
    }

    //Baaki saara code comment kar diya gaya hai
    /*
    const htmlTemplate = fs.readFileSync(
      path.join(__dirnameConstant, `../views/newPlanInvoice/newPlanParchaseCustomerInvoice.ejs`),
      "utf-8"
    );

    // ... saari PDF generation, email, download logic comment ki gayi hai
    */

    // Success response directly bhej rahe hain (data add hone ke baad)
    const item = downloadFlag == 1 ? getPlanDetails : addDataOfPaymentHistory;

    return {
      ack: 1,
      code: 200,
      ack_msg: "Payment data added successfully",  // Custom success message
      data: {
        // item: item,
        invoice_number: invoice_number,
        message: "Data successfully saved in database"
      }
    };

  } catch (error) {
    console.error("Payment History Add Error:", error);
    return resBadRequest({
      ack_msg: "Payment History Add Error",
      developer_msg: error.message || "Unknown Error occurred",
    });
  }
};

export const companyPlanExpireChange = async (req, res) => {
  try {
    const {
      a_application_login_id,
      company_id,
      plan_expiry_date,
      referralId,
      master_reffral_code
    } = req.body;

    console.log("Request Body =>", req.body);

    // Validate required fields
    if (!company_id || !plan_expiry_date) {
      return resError({
        ack_msg: "Missing required fields",
        developer_msg: "company_id and plan_expiry_date are required",
      });
    }

    // NEW LOGIC: If master_reffral_code is present → SKIP validation completely
    if (!master_reffral_code) {
      // Old logic runs only if master_reffral_code is NOT provided

      if (!referralId) {
        return resError({
          ack_msg: "Missing referral ID",
          developer_msg: "referralId is required when master_reffral_code is not provided",
        });
      }


      // Step 1: Check rights
      const referralRecord = await refferralCodeMasterModal.findOne({
        where: {
          id: referralId,
          isDelete: "0",
          is_expairy_change: "1",
        },
      });

      if (!referralRecord) {
        return resError({
          ack_msg: "You don't have rights to change Expiry Date",
          developer_msg: "Referral does not allow expiry change",
        });
      }
    } else {
      console.log("master_reffral_code detected → Skipping referral validation...");
    }

    // Step 2: Find company
    const company = await companyModel.findOne({
      where: {
        id: company_id,
        isDelete: "0",
      },
    });

    if (!company) {
      return resError({
        ack_msg: "Company not found",
        developer_msg: "No active company found",
      });
    }

    // Step 3: Update expiry date
    await companyModel.update(
      { plan_expiry_date },
      {
        where: {
          id: company_id,
          isDelete: "0",
        },
      }
    );

    const updatedCompany = await companyModel.findOne({
      where: { id: company_id },
      attributes: ["id", "company_name"],
    });

    return resSuccess({
      ack_msg: "Plan expiry date updated successfully",
      data: {
        company_id,
        plan_expiry_date,
        updated_at: new Date(),
        company: updatedCompany,
      },
    });

  } catch (error) {
    console.error("Error in companyPlanExpireChange:", error);
    return resBadRequest({
      ack_msg: "UNKNOWN_ERROR_TRY_AGAIN",
      developer_msg: error.message || String(error),
    });
  }
};


const rightsAdd = async (returnValue) => {
  try {
    const {
      company_id,
      plan_number,
      a_application_login_id,
    } = returnValue;
    console.log("Company ID:", company_id);
    console.log("Plan Number:", plan_number);
    console.log("Login ID:", a_application_login_id);
    console.log("Tenant DB:", returnValue.tenantDB);

    const formattedDateAndTime = moment().format("YYYY-MM-DD HH:mm:ss");
    let isRenewal = 0;
    let getAllCompanyDetail;

    const applicationLoginTypeRightModelIntance =
      applicationLoginTypeRightModel(returnValue.tenantDB);

    let findCompanyId = await getCompanyByLoginId(a_application_login_id);

    if (findCompanyId) {
      getAllCompanyDetail = await companyModel.findOne({
        where: {
          id: findCompanyId.company_masters_id,
          isDelete: "0",
        },
        attributes: ["plan_expiry_date", "plan_id"],
      });
    }

    if (
      getAllCompanyDetail?.dataValues?.plan_expiry_date &&
      getAllCompanyDetail.dataValues.plan_expiry_date !== "" &&
      getAllCompanyDetail.dataValues.plan_expiry_date !== "0000-00-00"
    ) {
      const getdate = compareDate(
        getAllCompanyDetail.dataValues.plan_expiry_date
      );
      isRenewal = getdate == 1 ? 1 : 0;
    }

    const oldPlanId = getAllCompanyDetail?.dataValues?.plan_id;

    console.log("old plannnnnnnnnnn", oldPlanId);

    const planIdToUse = plan_number || getAllCompanyDetail?.dataValues?.plan_id;

    const planPages = await planVsPageModel.findAll({
      where: { isDelete: 0, plan_id: planIdToUse },
      attributes: ["page_id", "data_limit"],
    });
    console.log("new plan pages", planPages);

    if (!planPages.length) {
      return resError({
        developer_msg: "No pages found for the selected plan",
      });
    }

    const pageDataLimits = planPages.map(({ dataValues }) => ({
      page_id: dataValues.page_id,
      data_limit: dataValues.data_limit,
    }));

    const newPageIds = pageDataLimits.map((item) => item.page_id);

    const applicationPages = await applicationPagesModel.findAll({
      where: { isDelete: 0, id: { [Op.in]: newPageIds } },
    });

    if (!applicationPages.length) {
      return resError({ developer_msg: "No application pages found" });
    }

    let oldPageIds = [];
    if (oldPlanId) {
      const oldPlanPages = await planVsPageModel.findAll({
        where: { isDelete: 0, plan_id: oldPlanId },
        attributes: ["page_id"],
      });
      oldPageIds = oldPlanPages.map(
        ({ dataValues }) => dataValues.page_id
      );
    }

    const companyUsers = await companyVsApplicationLoginModel.findAll({
      where: {
        company_masters_id: company_id,
        isDelete: 0,
      },
      attributes: [
        "company_masters_id",
        "company_flag",
        "a_application_login_id",
      ],
    });

    const targetUsers = companyUsers.length > 0 ? companyUsers : [
      {
        company_masters_id: company_id,
        company_flag: 1, // Owner
        a_application_login_id: a_application_login_id,
      }
    ];

    const rightsToInsert = [];

    for (const user of targetUsers) {
      const userLoginId = user.a_application_login_id;
      const isOwner = user.company_flag === 1;

      if (oldPlanId) {
        const removedPageIds = oldPageIds.filter(
          (id) => !newPageIds.includes(id)
        );

        for (const removedPageId of removedPageIds) {
          await applicationLoginTypeRightModelIntance.update(
            { isDelete: 1 },
            {
              where: {
                a_application_login_id: userLoginId,
                company_masters_id: company_id,
                page_id: removedPageId,
              },
            }
          );
        }
      }

      // Fetch all existing rights for this user in a single query to prevent N+1 query loop
      const existingRightsList = await applicationLoginTypeRightModelIntance.findAll({
        where: {
          a_application_login_id: userLoginId,
          company_masters_id: company_id,
          isDelete: 0,
        },
        attributes: ["page_id", "a_page_id_rights_jason"],
      });

      const existingRightsMap = new Map();
      for (const right of existingRightsList) {
        existingRightsMap.set(right.page_id, right);
      }

      for (const { dataValues } of applicationPages) {
        const matchingPage = pageDataLimits.find(
          (item) => item.page_id === dataValues.id
        );

        const isExistingPage = oldPageIds.includes(dataValues.id);

        const existingRights = existingRightsMap.get(dataValues.id);

        let rightsJson;

        if (
          isExistingPage &&
          existingRights &&
          existingRights.a_page_id_rights_jason
        ) {
          try {
            rightsJson = JSON.parse(
              existingRights.a_page_id_rights_jason || "{}"
            );
            rightsJson.limit = matchingPage
              ? matchingPage.data_limit
              : "";
          } catch (err) {
            console.error("Error parsing existing rights JSON:", err);
          }
        }

        if (!rightsJson) {
          rightsJson = isOwner
            ? {
              view: 1,
              add: 1,
              edit: 1,
              delete: 1,
              approve: 1,
              import: 1,
              print: 1,
              share: 1,
              all_data: 1,
              personal: 0,
              limit: matchingPage ? matchingPage.data_limit : "",
            }
            : {
              view: 1,
              add: 1,
              edit: 1,
              delete: 1,
              approve: 1,
              import: 1,
              print: 1,
              share: 1,
              all_data: 0,
              personal: 1,
              limit: matchingPage ? matchingPage.data_limit : "",
            };
        }

        rightsToInsert.push({
          a_application_login_id: userLoginId,
          company_masters_id: company_id,
          page_id: dataValues.id,
          page_name: dataValues.page_name,
          a_page_id_rights_jason: rightsJson,
          created_date_time: formattedDateAndTime,
          isDelete: 0,
          isActive: 1,
        });
      }
    }

    if (rightsToInsert.length > 0) {
      await applicationLoginTypeRightModelIntance.bulkCreate(rightsToInsert, {
        updateOnDuplicate: ["a_page_id_rights_jason", "page_name", "isDelete", "isActive", "created_date_time"],
      });
      console.log(`[rightsAdd] Successfully inserted ${rightsToInsert.length} plan-wise rights for company ${company_id}, plan ${planIdToUse}`);
    }

    return resSuccess({
      data: "Your Plan is Created/Updated and rights refreshed",
      developer_msg: "Your Plan is Created/Updated and rights refreshed",
    });
  } catch (error) {
    console.error("companyPlaneCreate Error", error);
    return resBadRequest({ developer_msg: `${error}` });
  }
};

export const companyImagesGet = async (req) => {
  try {
    const where = {};

    // filter: only valid logos
    where.company_logo = {
      [Op.and]: [
        { [Op.ne]: null },
        { [Op.ne]: "" }
      ]
    };

    const limit = req.body?.limit || 50;

    const result = await companyModel.findAll({
      where,
      attributes: ["company_logo"],
      order: Sequelize.literal("RAND()"),
      limit: limit
    });

    const updatedResult = result.map(item => {
      return {
        company_logo: COMPANY_IMG_LINK_EXTENDED + item.company_logo
      };
    });
    if (updatedResult.length > 0) {
      return resSuccess({
        data: { item: updatedResult },
      });
    } else {
      return resError({
        ack_msg: "No company logos found",
        developer_msg: "Data not found",
      });
    }
  } catch (e) {
    return resBadRequest({ developer_msg: `error ${e}` });
  }
};

export const whatsappConfigCreate = async (req) => {
  const {
    a_application_login_id,
    plateform,
    configured_type,
    whatsapp_phone_number_id,
    whatsapp_waba_id,
    whatsapp_api_key,
  } = req.body;

  const findCompanyId = await getCompanyByLoginId(a_application_login_id);

  try {

    const isExistData = await companyVsWhatsappConfigModel.findOne({
      where: { company_id: findCompanyId.company_masters_id, isDelete: 0 },
      raw: true
    });

    if (isExistData) {
      const updateResult = await companyVsWhatsappConfigModel.update(
        {
          plateform,
          configured_type,
          whatsapp_phone_number_id,
          whatsapp_waba_id,
          whatsapp_api_key,
        },
        {
          where: { company_id: findCompanyId.company_masters_id, isDelete: 0 },
        }
      );

      if (updateResult) {
        return resSuccess({
          ack_msg: "Configuration Updated successfully",
          data: { item: updateResult },
        });
      } else {
        return resError({
          ack_msg: "Data Not Updated",
          data: "Data Not Updated",
        });
      }
    } else {
      const createResult = await companyVsWhatsappConfigModel.create(
        {
          company_id: findCompanyId.company_masters_id,
          plateform,
          configured_type,
          whatsapp_phone_number_id,
          whatsapp_waba_id,
          whatsapp_api_key,
        },
      );

      if (createResult) {
        return resSuccess({
          ack_msg: "Configuration created successfully",
          data: { item: createResult },
        });
      } else {
        return resError({
          ack_msg: "Data Not Added",
          data: "Data Not Added",
        });
      }
    }

  } catch (error) {
    console.log("whatsappConfigCreate error", error);
    return resBadRequest({
      ack_msg: " ",
      developer_msg: `${error.message}`,
    });
  }
};

export const whatsappConfigGet = async (req) => {

  const {
    a_application_login_id,
  } = req.body;

  const findCompanyId = await getCompanyByLoginId(a_application_login_id);

  try {

    const result = await companyVsWhatsappConfigModel.findOne({
      where: { isDelete: "0", company_id: findCompanyId.company_masters_id },
      attributes: [
        "plateform",
        "configured_type",
        "whatsapp_phone_number_id",
        "whatsapp_waba_id",
        "whatsapp_api_key",
      ],
    });

    if (result) {
      return resSuccess({
        data: { item: result },
      });
    } else {
      return resError({
        ack_msg: "No Config found",
        developer_msg: "Data not found",
      });
    }
  } catch (e) {
    console.log("whatsappConfigGet error", e)
    return resBadRequest({ developer_msg: `error ${e}` });
  }
};

export const createWorkspace = async (req) => {
  const { workspace_name, parent_company_id } = req.body;
  const ownerId = req.user.id;

  try {
    if (!workspace_name || !parent_company_id) {
      return resError({
        ack_msg: "Workspace name and parent company ID are required",
        developer_msg: "Required fields missing",
      });
    }

    // Verify user is owner of the parent company
    const parentCompanyMapping = await companyVsApplicationLoginModel.findOne({
      where: {
        a_application_login_id: ownerId,
        company_masters_id: parent_company_id,
        company_flag: 1, // Owner
        isDelete: 0
      }
    });

    if (!parentCompanyMapping) {
      return resError({
        ack_msg: "Access denied: Only company owners can create workspaces",
        developer_msg: "Access denied",
      });
    }

    const parentCompany = await companyModel.findOne({
      where: { id: parent_company_id, isDelete: "0" }
    });

    if (!parentCompany) {
      return resError({
        ack_msg: "Parent company not found",
        developer_msg: "Parent company record not found",
      });
    }

    if (parentCompany.parent_company_id !== null && parentCompany.parent_company_id !== undefined) {
      return resError({
        ack_msg: "Workspaces can only be created from the Main Company. Sub-workspaces cannot create sub-workspaces.",
        developer_msg: "Creation prohibited for sub-workspaces",
      });
    }

    const newQrCode = Math.floor(
      100000000000 + Math.random() * 900000000000
    ).toString();

    const formatDateAndTimeCreateDateTime = moment(new Date()).format("YYYY-MM-DD HH:mm:ss");

    const parentValues = typeof parentCompany.toJSON === "function" ? parentCompany.toJSON() : parentCompany;
    delete parentValues.id;
    delete parentValues.createdAt;
    delete parentValues.updatedAt;

    // Build child company body with all parent company details copied
    const companyBody = {
      ...parentValues,
      company_name: workspace_name,
      parent_company_id: parent_company_id,
      qr_code: newQrCode,
      isDelete: 0,
      isActive: 1,
      a_application_login_id: ownerId,
      // Blank out third-party & API keys
      whatsapp_authkey: "",
      whatsapp_appkey: "",
      india_mart_api_key: "",
      trade_india_user_id: "",
      trade_india_profile_id: "",
      trade_india_key: "",
      chatgpt_appkey: "",
      gimini_appkey: "",
      serp_api_key: "",
      google_lead_sheet_for_faceBook_1: "",
      google_lead_sheet_for_faceBook_2: "",
      google_sheet_key_3: "",
      google_sheet_key_4: "",
      google_sheet_first_name: "",
      google_sheet_second_name: "",
      google_sheet_third_name: "",
      google_sheet_fourth_name: "",
      // Blank out mail / SMTP configuration
      host_out_going_mail: "",
      port_mail_setup: "",
      mail_id_setup: "",
      password_mail_setup: "",
      pop3_host: "",
      incoming_port: "",
      is_email_verified: "",
      company_otp: "",
      // Blank out activation, invitation & referral codes
      activation_code: "",
      invitation_key: "",
      referral_code_id: ""
    };

    const newCompany = await companyModel.create(companyBody);

    if (!newCompany) {
      return resError({
        ack_msg: "Failed to create child company record",
        developer_msg: "Insert failed on companyModel",
      });
    }

    const childCompanyId = newCompany.id;

    // Retrieve owner's name for SQL execution
    const ownerUser = await loginModel.findOne({
      where: { id: ownerId },
      attributes: ["username"]
    });
    const ownerName = ownerUser ? ownerUser.username : "Owner";

    // Dynamic database name
    const dbName = `small_office_a${ownerId}_c${childCompanyId}`;

    // Execute SQL database copy
    const dbResult = await executeSQLFile(
      dbName,
      "create_company_copy.sql",
      ownerId,
      childCompanyId,
      ownerName
    );

    if (!dbResult.success) {
      // Rollback company record on failure
      await companyModel.destroy({ where: { id: childCompanyId } });
      return resError({
        ack_msg: "Database creation failed for workspace",
        developer_msg: dbResult.message,
      });
    }

    // Map owner to the new child company
    await companyVsApplicationLoginModel.create({
      company_masters_id: childCompanyId,
      company_flag: 1, // Owner role
      a_application_login_id: ownerId,
    });

    // Copy owner's own rights from the parent tenant DB into the child tenant DB
    // so that the owner has full access to the new workspace immediately.
    try {
      const childTenantInfoForOwner = await getTenantDB(ownerId, childCompanyId);
      const childRightsModelForOwner = applicationLoginTypeRightModel(childTenantInfoForOwner.sequelize);

      const parentTenantInfoForOwner = await getTenantDB(ownerId, parent_company_id);
      const parentRightsModelForOwner = applicationLoginTypeRightModel(parentTenantInfoForOwner.sequelize);

      const ownerParentRights = await parentRightsModelForOwner.findAll({
        where: { a_application_login_id: ownerId, company_masters_id: parent_company_id, isDelete: 0 }
      });

      if (ownerParentRights && ownerParentRights.length > 0) {
        const ownerRightsToInsert = ownerParentRights.map(right => {
          const { id, ...data } = right.dataValues;
          let parsedRights = data.a_page_id_rights_jason;
          if (typeof parsedRights === "string") {
            try {
              parsedRights = JSON.parse(parsedRights);
              if (typeof parsedRights === "string") {
                parsedRights = JSON.parse(parsedRights);
              }
            } catch (e) { }
          }
          return {
            ...data,
            a_page_id_rights_jason: parsedRights,
            company_masters_id: childCompanyId,
            created_date_time: formatDateAndTimeCreateDateTime
          };
        });
        await childRightsModelForOwner.bulkCreate(ownerRightsToInsert, { ignoreDuplicates: true });
        console.log(`[createWorkspace] Copied ${ownerRightsToInsert.length} owner rights to child workspace ${childCompanyId}`);
      } else {
        console.log(`[createWorkspace] No owner rights found in parent DB ${parent_company_id} to copy for owner ${ownerId}`);
      }
    } catch (ownerRightsErr) {
      console.error("[createWorkspace] Error copying owner rights to child workspace:", ownerRightsErr.message);
    }

    // Map selected employees and copy their rights from the parent company
    const { employee_ids } = req.body;
    if (employee_ids && Array.isArray(employee_ids) && employee_ids.length > 0) {
      try {
        const childTenantInfo = await getTenantDB(ownerId, childCompanyId);
        const childRightsModel = applicationLoginTypeRightModel(childTenantInfo.sequelize);

        const parentTenantInfo = await getTenantDB(ownerId, parent_company_id);
        const parentRightsModel = applicationLoginTypeRightModel(parentTenantInfo.sequelize);

        for (const empId of employee_ids) {
          // 1. Map to company_vs_application_logins
          await companyVsApplicationLoginModel.create({
            company_masters_id: childCompanyId,
            company_flag: 2, // Employee role
            a_application_login_id: empId,
          });

          // 2. Fetch employee rights from parent database
          const parentRights = await parentRightsModel.findAll({
            where: { a_application_login_id: empId, isDelete: 0 }
          });

          // 3. Copy rights to child database
          if (parentRights && parentRights.length > 0) {
            const rightsToInsert = parentRights.map(right => {
              const { id, ...data } = right.dataValues;
              let parsedRights = data.a_page_id_rights_jason;
              if (typeof parsedRights === "string") {
                try {
                  parsedRights = JSON.parse(parsedRights);
                  if (typeof parsedRights === "string") {
                    parsedRights = JSON.parse(parsedRights);
                  }
                } catch (e) { }
              }
              return {
                ...data,
                a_page_id_rights_jason: parsedRights,
                company_masters_id: childCompanyId,
                created_date_time: formatDateAndTimeCreateDateTime
              };
            });

            await childRightsModel.bulkCreate(rightsToInsert, { ignoreDuplicates: true });
          }
        }
      } catch (err) {
        console.error("Error mapping employees/rights for workspace:", err);
        // We log the error but don't fail the whole creation since workspace DB & owner mapping are done
      }
    }

    return resSuccess({
      ack_msg: "Workspace created successfully",
      data: newCompany,
    });

  } catch (error) {
    console.error("createWorkspace Error:", error);
    return resBadRequest({
      ack_msg: "An error occurred during workspace creation",
      developer_msg: error.message,
    });
  }
};