import moment from "moment";
import activationCodeMasterModel from "../../models/application_login/activationCodeMasterModel.js";
import companyModel from "../../models/company_setup/companyModel.js";
import companyVsApplicationLoginModel from "../../models/company_setup/companyVsApplicationLoginModel.js";
import {
  generateMD5,
  resBadRequest,
  resError,
  resSuccess,
} from "../../utils/sharedFunctions.js";

import refferralCodeMasterModal from "../../models/configuration/refferralCodeMasterModal.js";
import logger from "../../utils/logger.js";
import { loginHistories } from "../commonServices.js";

const formattedDate = moment(new Date()).format("YYYY-MM-DD");

export const activationCodeVerify = async (req) => {
  let { activation_code, contact_number } = req.body;

  try {
    if (!activation_code || !contact_number) {
      return resError({
        ack_msg: "Activation code or mobile number is not fill",
        developer_msg: "code or mobile number is blank",
      });
    }
    const input = activation_code;
    const makeActivationCode = generateMD5(input);

    const resultActivationCode1 = await activationCodeMasterModel.findOne({
      where: {
        activation_code: makeActivationCode,
        mobile_number: contact_number,
        isDelete: "0",
      },
      attributes: ["id", "activation_code", "mobile_number"],
    });
    if (resultActivationCode1) {
      return resError({
        ack_msg:
          "The Activation Code or mobile number is already in our system, or the Activation Code is invalid. ",
        developer_msg: "Data not found",
      });
    }
    const resultActivationCode = await activationCodeMasterModel.findOne({
      where: {
        activation_code: makeActivationCode,
        isDelete: "0",
      },
      attributes: ["id", "activation_code", "mobile_number"],
    });

    if (resultActivationCode) {
      const fliterData = await activationCodeMasterModel.findOne({
        where: { mobile_number: contact_number, isDelete: "0" },
        attributes: ["id", "activation_code", "mobile_number"],
      });
      if (!fliterData) {
        const activationCodeBody = {
          mobile_number: contact_number,
          date_of_activation: formattedDate,
          created_date: formattedDate,
        };
        const resultUpdateActivationCode =
          await activationCodeMasterModel.update(activationCodeBody, {
            where: { id: resultActivationCode.dataValues.id, isDelete: "0" },
          });
        if (resultUpdateActivationCode) {
          return resSuccess({
            data: { item: resultUpdateActivationCode },
            ack_msg: "your Activation is verified successfully ",
          });
        } else {
          return resError({
            ack_msg: "something went wrong",
            developer_msg: "Data not found activationCode",
          });
        }
      } else {
        return resError({
          ack_msg: "Mobile number is already in our system",
          developer_msg: "Data not found",
        });
      }
    } else {
      return resError({
        ack_msg: "The Activation Code is invalid. ",
        developer_msg: "Data not found",
      });
    }
  } catch (e) {
    logger.error(e);

    return resBadRequest({
      developer_msg: `error ${e.message}`,
    });
  }
};

export const activationCodeVerifyFromCompany = async (req) => {
  let activation_code,
    contact_number,
    company_name,
    company_email,
    invitation_key,
    referral_code,
    a_application_login_id;
  qr_code

  if (req.body) {
    ({
      activation_code,
      contact_number,
      company_name,
      company_email,
      invitation_key,
      a_application_login_id,
      referral_code,
      qr_code,
    } = req.body);
  } else {
    ({
      activation_code,
      contact_number,
      company_name,
      company_email,
      invitation_key,
      a_application_login_id,
      referral_code,
      qr_code,
    } = req);
  }
  try {
    console.log("requestActivation", req);

    const formattedDateAndTime = moment(new Date()).format("YYYY-MM-DD");

    if (!activation_code || !contact_number) {
      return resError({
        ack_msg: "Activation code or mobile number is not fill",
        developer_msg: "code or mobile number is blank",
      });
    }

    const input = activation_code;
    const makeActivationCode = generateMD5(input);

    const resultActivationCode = await activationCodeMasterModel.findOne({
      where: {
        mobile_number: contact_number,
        activation_code: makeActivationCode,
        isDelete: "0",
      },
      attributes: [
        "id",
        "date_of_activation",
        "plan_id",
        "months",
        "activation_code",
      ],
    });

    if (resultActivationCode) {
      const activationDate = new Date(
        resultActivationCode.dataValues.date_of_activation
      );

      if (isNaN(activationDate)) {
        throw new Error("Invalid date_of_activation");
      }

      const planDate = `${activationDate.getFullYear()}-${String(
        activationDate.getMonth() + 1
      ).padStart(2, "0")}-${String(activationDate.getDate()).padStart(2, "0")}`;

      const monthsToAdd = resultActivationCode.dataValues.months || 0;
      const expiryDate = new Date(activationDate);
      expiryDate.setMonth(expiryDate.getMonth() + monthsToAdd);

      const companyActivationCodeBody = {
        a_application_login_id: a_application_login_id,
        company_name: company_name,
        company_contact: contact_number,
        company_email: company_email,
        invitation_key: invitation_key,
        plan_id: resultActivationCode.dataValues.plan_id,
        plan_date: planDate,
        plan_expiry_date: expiryDate.toISOString().split("T")[0],
        activation_code: resultActivationCode.dataValues.activation_code,
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
        qr_code,
        currency_id: 3,
        country_id: 101,
        state_id: 4030,
      };

      if (referral_code && referral_code !== "") {
        const resultReferral = await refferralCodeMasterModal.findOne({
          where: {
            referral_code: referral_code,
            isDelete: 0,
          },
          attributes: ["id"],
        });

        if (resultReferral) {
          companyActivationCodeBody.referral_code_id =
            resultReferral.dataValues.id;
        } else {
          return resError({
            ack_msg: "Referral code is not match",
            developer_msg: "Referral code not found",
          });
        }
      }

      const resultCompany = await companyModel.create(
        companyActivationCodeBody
      );

      if (resultCompany) {
        const resultCompanyVsApplicationLogins =
          await companyVsApplicationLoginModel.create({
            company_masters_id: resultCompany.dataValues.id,
            a_application_login_id: a_application_login_id,
            company_flag: 1,
          });

        if (resultCompanyVsApplicationLogins) {
          await activationCodeMasterModel.update(
            {
              entry_flag: 1,
            },
            {
              where: {
                mobile_number: contact_number,
                activation_code: makeActivationCode,
                isDelete: "0",
              },
            }
          );

          // ✅ RIGHTS ADD KARNE WALA CODE YAHAN SE REMOVE KIYA GAYA HAI

          const loginHistory = await loginHistories({
            a_application_login_id:
              resultCompanyVsApplicationLogins.dataValues
                .a_application_login_id,
          });

          return resSuccess({
            data: { item: resultCompany },
            ack_msg: "your Activation is verified successfully ",
          });
        } else {
          return resError({
            ack_msg: "something went wrong",
            developer_msg: "Data not found CompanyVsApplicationLogins",
          });
        }
      } else {
        return resError({
          ack_msg: "something went wrong",
          developer_msg: "Data not found in Company",
        });
      }
    } else {
      return resError({
        ack_msg:
          "Invalid Activation Code. Please enter a valid Activation Code",
        developer_msg: "Data not found",
      });
    }
  } catch (e) {
    logger.error(e);

    return resBadRequest({
      developer_msg: `error ${e.message}`,
    });
    throw e;
  }
};

