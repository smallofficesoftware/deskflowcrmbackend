import fs from "fs-extra";
import moment from "moment";
import path from "path";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";
import { cartModel } from "../../models/activities/cartsModel.js";
import { contactMessageHistory } from "../../models/activities/contactMessageHistoryModel.js";
import { contactModel } from "../../models/activities/contactModel.js";
import { inquiryModel } from "../../models/activities/inquiryModel.js";
import whatappDispatchJobs from "../../models/activities/whatappDispatchJobsModel.js";
import { applicationLoginTypeRightModel } from "../../models/application_login/applicationLoginTypeRightModel.js";
import loginModel from "../../models/application_login/loginModel.js";
import companyModel from "../../models/company_setup/companyModel.js";
import companyVsApplicationLoginModel from "../../models/company_setup/companyVsApplicationLoginModel.js";
import companyVsWhatsappConfigModel from "../../models/company_setup/companyVsWhatsappConfigModel.js";
import { WHATSAPP_TEMPLATE_STATIC_ATTACHMENT_GENEREATE_LINK } from "../../utils/appConstants.js";
import { PAGE_ID } from "../../utils/AppEnumeration.js";
import { isValid, normalizeToTenDigit, resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";
import { accountPDFv1, allAccountTransactionOfContactPDF } from "../activities/accountTransactionServices.js";
import { pdfOrder } from "../activities/orderServices.js";
import { getCompanyByLoginId, insertStagesAndStatusLogs } from "../commonServices.js";
import { sendMultipleNotification } from "../company_setup/thirdPartyIntegrationService.js";
import { autoAssignmentContactIdsGet, prepareMailAndWhatsappSenderToTheContact } from "../other_settings/wrkflwAutoAssignmentContactService.js";
import { sendWhatsappTemplateViaBackend } from "./variableSystemService.js";
import { WHATSAPP_AXIOS } from "./whatsappAxiosRegistry.js";
import { WHATSAPP_FETCH_TEMPLATE_HANDLER, WHATSAPP_FETCH_WABA_CONFIG_DETAILS, WHATSAPP_FETCH_WABA_CONFIG_DETAILS_TEAM, WHATSAPP_SEND_CONTACT_ASSIGNMENT, WHATSAPP_SEND_SALES_PDF_HANDLER, WHATSAPP_SEND_TASK_HANDLER, WHATSAPP_SEND_TEMPLATE_HANDLER } from "./whatsappHandlerRegistry.js";

export const sendSalesPdfWhatsapp = async (req) => {
    try {
        const { a_application_login_id } = req.body || {};

        const company = await getCompanyByLoginId(a_application_login_id);

        const config = await companyVsWhatsappConfigModel.findOne({
            where: { company_id: company.company_masters_id },
            raw: true,
        });

        if (!config) {
            return resError({
                ack_msg: "Company not found",
                developer_msg: "No company config",
            });
        }

        const { configured_type, plateform, whatsapp_phone_number_id, whatsapp_connection_id, whatsapp_api_key } = config;

        const handler = WHATSAPP_SEND_SALES_PDF_HANDLER?.[configured_type]?.[plateform];
        const axios = WHATSAPP_AXIOS?.[configured_type]?.[plateform];

        if (!handler) {
            return resError({
                ack_msg: "Unsupported configuration",
                developer_msg: `type=${configured_type}, platform=${plateform}`,
            });
        }

        // generate PDF
        const resops = await pdfOrder(req);
        if (resops.ack !== 1) {
            return resError({
                ack_msg: resops.ack_msg,
                developer_msg: "PDF failed",
            });
        }

        const {
            path: fileUrl,
            customer_phone,
            sessionName,
            title,
        } = resops.data;
        const contactModelInstance = contactModel(req.tenantDB);
        const contactDetailFetch = await contactModelInstance.findOne({ where: { isDelete: 0, mobile_number: normalizeToTenDigit(customer_phone) }, raw: true, attributes: ["person_name", "company_name"] });
        const companyName = contactDetailFetch?.company_name?.trim();
        const personName = contactDetailFetch?.person_name?.trim();
        const recipientName = (companyName && personName && personName !== 'Unknown') ? `${companyName} ${personName}` : (companyName || personName || 'Unknown');

        return await handler({
            numbers: customer_phone,
            recipientName,
            sessionName,
            fileUrl,
            title,
            phone_number: normalizeToTenDigit(customer_phone),
            mediaUrl: fileUrl,
            fileName: `${customer_phone}.pdf`,
            // messageText: `Please find attached the invoice.`,
            messageType: 'document',
            whatsapp_phone_number_id,
            whatsapp_connection_id,
            whatsapp_api_key,
            a_application_login_id,
            axios,
        });
    } catch (error) {
        console.log("sendSalesPdfWhatsapp Error", error);
        return resBadRequest({ developer_msg: `error ${error}` });
    }
};

export const sendContactAllAccountPdfWhatsapp = async (req) => {
    try {
        const { a_application_login_id } = req.body || {};

        const company = await getCompanyByLoginId(a_application_login_id);

        const config = await companyVsWhatsappConfigModel.findOne({
            where: { company_id: company.company_masters_id },
            raw: true,
        });

        if (!config) {
            return resError({
                ack_msg: "Company not found",
                developer_msg: "No company config",
            });
        }

        const { configured_type, plateform, whatsapp_phone_number_id, whatsapp_connection_id, whatsapp_api_key } = config;

        const handler = WHATSAPP_SEND_SALES_PDF_HANDLER?.[configured_type]?.[plateform];
        const axios = WHATSAPP_AXIOS?.[configured_type]?.[plateform];

        if (!handler) {
            return resError({
                ack_msg: "Unsupported configuration",
                developer_msg: `type=${configured_type}, platform=${plateform}`,
            });
        }

        // generate PDF
        const resops = await allAccountTransactionOfContactPDF(req);

        if (resops.ack !== 1) {
            return resError({
                ack_msg: resops.ack_msg,
                developer_msg: "PDF failed",
            });
        }

        const fileUrl = resops.data.fileLinkPath;

        const contactModelInstance = contactModel(req.tenantDB);
        const contactDetailFetch = await contactModelInstance.findOne({ where: { isDelete: 0, mobile_number: normalizeToTenDigit(resops.data.mobile_number) }, raw: true, attributes: ["person_name", "company_name"] });
        const companyName = contactDetailFetch?.company_name?.trim();
        const personName = contactDetailFetch?.person_name?.trim();
        const recipientName = (companyName && personName && personName !== 'Unknown') ? `${companyName} ${personName}` : (companyName || personName || 'Unknown');

        return await handler({
            numbers: [resops.data.mobile_number],
            sessionName: resops.data.sessionName,
            recipientName,
            fileUrl: fileUrl,
            type: "document",
            title: "account-transaction",
            mimetype: "application/pdf",
            phone_number: normalizeToTenDigit(resops.data.mobile_number),
            mediaUrl: fileUrl,
            fileName: `account-transaction.pdf`,
            messageType: 'document',
            whatsapp_phone_number_id,
            whatsapp_connection_id,
            whatsapp_api_key,
            a_application_login_id,
            axios
        });
    } catch (error) {
        console.log("sendContactAllAccountPdfWhatsapp Error", error);
        return resBadRequest({ developer_msg: `error ${error}` });
    }
}

export const sendSingleAccountPdfWhatsapp = async (req) => {
    try {
        const { a_application_login_id } = req.body || {};

        const company = await getCompanyByLoginId(a_application_login_id);

        const config = await companyVsWhatsappConfigModel.findOne({
            where: { company_id: company.company_masters_id },
            raw: true,
        });

        if (!config) {
            return resError({
                ack_msg: "Company not found",
                developer_msg: "No company config",
            });
        }

        const { configured_type, plateform, whatsapp_phone_number_id, whatsapp_connection_id, whatsapp_api_key } = config;

        const handler = WHATSAPP_SEND_SALES_PDF_HANDLER?.[configured_type]?.[plateform];
        const axios = WHATSAPP_AXIOS?.[configured_type]?.[plateform];


        if (!handler) {
            return resError({
                ack_msg: "Unsupported configuration",
                developer_msg: `type=${configured_type}, platform=${plateform}`,
            });
        }

        // generate PDF
        const resops = await accountPDFv1(req);

        if (resops.ack !== 1) {
            return resError({
                ack_msg: resops.ack_msg,
                developer_msg: "PDF failed",
            });
        }

        const fileUrl = resops.data.fileLinkPath;

        const contactModelInstance = contactModel(req.tenantDB);
        const contactDetailFetch = await contactModelInstance.findOne({ where: { isDelete: 0, mobile_number: normalizeToTenDigit(resops.data.mobile_number) }, raw: true, attributes: ["person_name", "company_name"] });
        const companyName = contactDetailFetch?.company_name?.trim();
        const personName = contactDetailFetch?.person_name?.trim();
        const recipientName = (companyName && personName && personName !== 'Unknown') ? `${companyName} ${personName}` : (companyName || personName || 'Unknown');

        return await handler({
            numbers: [resops.data.mobile_number],
            sessionName: resops.data.sessionName,
            recipientName,
            fileUrl: fileUrl,
            type: "document",
            title: "account-transaction-single",
            mimetype: "application/pdf",
            phone_number: normalizeToTenDigit(resops.data.mobile_number),
            mediaUrl: fileUrl,
            fileName: `account-transaction-single.pdf`,
            // messageText: `Please find attached the invoice.`,
            messageType: 'document',
            whatsapp_phone_number_id,
            whatsapp_connection_id,
            whatsapp_api_key,
            a_application_login_id,
            axios
        });
    } catch (error) {
        console.log("sendSingleAccountPdfWhatsapp Error", error);
        return resBadRequest({ developer_msg: `error ${error}` });
    }
}

export const taskSendWhatsappMessages = async (req) => {
    try {
        const { a_application_login_id, sessionName, numbers, mediaUrls, caption, text, tskId } = req.body || {};

        const company = await getCompanyByLoginId(a_application_login_id);

        const config = await companyVsWhatsappConfigModel.findOne({
            where: { company_id: company.company_masters_id },
            raw: true,
        });

        if (!config) {
            return resError({
                ack_msg: "Company not found",
                developer_msg: "No company config",
            });
        }

        const { configured_type, plateform } = config;

        if (configured_type == 2 && plateform == 2) {
            req.body.recipientPhone = numbers;
            req.body.contextParams = { tskId: tskId, appId: a_application_login_id };
            req.body.module = "task_whatsapp_send";
            req.body.whx_a_application_login_id = a_application_login_id;
            const response = await sendWhatsappTemplateViaBackend(req);
            return response;
        }

        const handler = WHATSAPP_SEND_TASK_HANDLER?.[configured_type]?.[plateform];
        const axios = WHATSAPP_AXIOS?.[configured_type]?.[plateform];


        if (!handler) {
            return resError({
                ack_msg: "Unsupported configuration",
                developer_msg: `type=${configured_type}, platform=${plateform}`,
            });
        }

        const contactModelInstance = contactModel(req.tenantDB);
        const contactDetailFetch = await contactModelInstance.findOne({ where: { isDelete: 0, mobile_number: normalizeToTenDigit(numbers) }, raw: true, attributes: ["person_name", "company_name"] });
        const companyName = contactDetailFetch?.company_name?.trim();
        const personName = contactDetailFetch?.person_name?.trim();
        const recipientName = (companyName && personName && personName !== 'Unknown') ? `${companyName} ${personName}` : (companyName || personName || 'Unknown');

        return await handler({
            sessionName,
            recipientName,
            numbers,
            fileUrl: mediaUrls,
            caption,
            text,
            phone_number: normalizeToTenDigit(numbers),
            mediaUrl: mediaUrls,
            messageType: 'document',
            whatsapp_phone_number_id,
            whatsapp_connection_id,
            whatsapp_api_key,
            a_application_login_id,
            axios
        });
    } catch (error) {
        console.log("taskSendWhatsappMessages Error", error);
        return resBadRequest({ developer_msg: `error ${error}` });
    }
}

export const contactAssignSendMessage = async (req, detail) => {
    try {
        const { a_application_login_id, template_id, sessionName, numbers, text, customer_person_name, customer_company_name, customer_id } = detail || {};

        const company = await getCompanyByLoginId(a_application_login_id);

        const config = await companyVsWhatsappConfigModel.findOne({
            where: { company_id: company.company_masters_id },
            raw: true,
        });

        if (!config) {
            return resError({
                ack_msg: "Company not found",
                developer_msg: "No company config",
            });
        }

        const { configured_type, plateform, whatsapp_phone_number_id, whatsapp_connection_id, whatsapp_api_key } = config;

        if (configured_type == 2 && plateform == 2) {
            req.body.recipientPhone = Array.isArray(numbers) ? numbers[0] : numbers;
            req.body.contextParams = { customerId: customer_id, appId: a_application_login_id };
            req.body.module = template_id;
            req.body.whx_a_application_login_id = a_application_login_id;
            const response = await sendWhatsappTemplateViaBackend(req);
            return response;
        }

        const handler = WHATSAPP_SEND_CONTACT_ASSIGNMENT?.[configured_type]?.[plateform];
        const axios = WHATSAPP_AXIOS?.[configured_type]?.[plateform];

        if (!handler) {
            return resError({
                ack_msg: "Unsupported configuration",
                developer_msg: `type=${configured_type}, platform=${plateform}`,
            });
        }

        const contactModelInstance = contactModel(req.tenantDB);
        const contactDetailFetch = await contactModelInstance.findOne({ where: { isDelete: 0, mobile_number: normalizeToTenDigit(numbers) }, raw: true, attributes: ["person_name", "company_name"] });
        const companyName = contactDetailFetch?.company_name?.trim();
        const personName = contactDetailFetch?.person_name?.trim();
        const recipientName = (companyName && personName && personName !== 'Unknown') ? `${companyName} ${personName}` : (companyName || personName || 'Unknown');

        return await handler({
            sessionName,
            recipientName,
            numbers,
            text,
            phone_number: `${numbers}`,
            message: template_id ? null : text,
            whatsapp_phone_number_id,
            whatsapp_connection_id,
            whatsapp_api_key,
            a_application_login_id,
            languageCode: "hi",
            templateName: template_id,
            messageType: template_id ? "template" : 'text',
            templateVariables: {
                "1":
                    customer_person_name === "Unknown"
                        ? (customer_company_name || "Customer")
                        : customer_company_name
                            ? `${customer_company_name} - ${customer_person_name}`
                            : customer_person_name,
            },
            axios
        });
    } catch (error) {
        console.log("contactAssignSendMessage Error", error);
        return resBadRequest({ developer_msg: `error ${error}` });
    }
}

export const addWhatsappDispatchJobs = async (req) => {
    try {
        const { whatspp_dispatch_jobs_type, whatspp_dispatch_jobs_company_id } = req.body;

        if (!isValid(whatspp_dispatch_jobs_type)) {
            return resError({
                ack_msg: "Invalid type",
            });
        }

        if (!isValid(whatspp_dispatch_jobs_company_id)) {
            return resError({
                ack_msg: "Invalid company",
            });
        }
        const checkIsExist = await whatappDispatchJobs.findOne({ where: { isDelete: 0, type: whatspp_dispatch_jobs_type, company_id: whatspp_dispatch_jobs_company_id } })
        if (checkIsExist) {
            return resError({
                ack_msg: "Already Exist",
            });
        }

        const isInsert = await whatappDispatchJobs.create({ type: whatspp_dispatch_jobs_type, company_id: whatspp_dispatch_jobs_company_id });
        if (!isInsert) {
            return resError({
                ack_msg: "Something wend wrong.",
            });
        }

        return resSuccess({
            ack_msg: "Inserted successfully.",
        });

    } catch (error) {
        console.log("addWhatsappDispatchJobs error", error);
        return resBadRequest({ developer_msg: `error ${error}` });
    }
};

export const fetchWhatsappTemplate = async (req) => {
    try {
        const { a_application_login_id } = req.body || {};

        const company = await getCompanyByLoginId(a_application_login_id);

        const config = await companyVsWhatsappConfigModel.findOne({
            where: { company_id: company.company_masters_id },
            raw: true,
        });

        if (!config) {
            return resError({
                ack_msg: "Company not found",
                developer_msg: "No company config",
            });
        }

        const { configured_type, plateform, whatsapp_api_key, whatsapp_waba_id } = config;

        const handler = WHATSAPP_FETCH_TEMPLATE_HANDLER?.[configured_type]?.[plateform];
        const axios = WHATSAPP_AXIOS?.[configured_type]?.[plateform];

        if (!handler) {
            return resError({
                ack_msg: "Unsupported configuration",
                developer_msg: `type=${configured_type}, platform=${plateform}`,
            });
        }

        return await handler({
            whatsapp_api_key,
            whatsapp_waba_id,
            a_application_login_id,
            axios
        });
    } catch (error) {
        console.log("fetchWhatsappTemplate error", error);
        return resBadRequest({ developer_msg: `error ${error}` });
    }
};

export const fetchWhatsappWABAConfig = async (req) => {
    try {
        const { a_application_login_id } = req.body || {};

        const company = await getCompanyByLoginId(a_application_login_id);

        const config = await companyVsWhatsappConfigModel.findOne({
            where: { company_id: company.company_masters_id },
            raw: true,
        });

        if (!config) {
            return resError({
                ack_msg: "Company not found",
                developer_msg: "No company config",
            });
        }

        const { configured_type, plateform, whatsapp_api_key, whatsapp_waba_id } = config;

        const handler = WHATSAPP_FETCH_WABA_CONFIG_DETAILS?.[configured_type]?.[plateform];
        const axios = WHATSAPP_AXIOS?.[configured_type]?.[plateform];

        if (!handler) {
            return resError({
                ack_msg: "Unsupported configuration",
                developer_msg: `type=${configured_type}, platform=${plateform}`,
            });
        }

        return await handler({
            whatsapp_api_key,
            whatsapp_waba_id,
            a_application_login_id,
            axios
        });
    } catch (error) {
        console.log("fetchWhatsappWABAConfig error", error);
        return resBadRequest({ developer_msg: `error ${error}` });
    }
};

export const fetchWhatsappWABAConfigTeam = async (req) => {
    try {
        const { a_application_login_id } = req.body || {};

        const company = await getCompanyByLoginId(a_application_login_id);

        const config = await companyVsWhatsappConfigModel.findOne({
            where: { company_id: company.company_masters_id },
            raw: true,
        });

        if (!config) {
            return resError({
                ack_msg: "Company not found",
                developer_msg: "No company config",
            });
        }

        const { configured_type, plateform, whatsapp_api_key, whatsapp_waba_id } = config;

        const handler = WHATSAPP_FETCH_WABA_CONFIG_DETAILS_TEAM?.[configured_type]?.[plateform];
        const axios = WHATSAPP_AXIOS?.[configured_type]?.[plateform];

        if (!handler) {
            return resError({
                ack_msg: "Unsupported configuration",
                developer_msg: `type=${configured_type}, platform=${plateform}`,
            });
        }

        return await handler({
            whatsapp_api_key,
            whatsapp_waba_id,
            a_application_login_id,
            axios
        });
    } catch (error) {
        console.log("fetchWhatsappWABAConfigTeam error", error);
        return resBadRequest({ developer_msg: `error ${error}` });
    }
};

export const sendTemplateMessage = async (req) => {
    try {
        const { whx_a_application_login_id, template, variables, recipientPhone, mediaUrl, languageCode } = req.body || {};

        const company = await getCompanyByLoginId(whx_a_application_login_id);

        const config = await companyVsWhatsappConfigModel.findOne({
            where: { company_id: company.company_masters_id },
            raw: true,
        });

        if (!config) {
            return resError({
                ack_msg: "Company not found",
                developer_msg: "No company config",
            });
        }

        const { configured_type, plateform, whatsapp_phone_number_id, whatsapp_connection_id, whatsapp_api_key } = config;

        const handler = WHATSAPP_SEND_TEMPLATE_HANDLER?.[configured_type]?.[plateform];
        const axios = WHATSAPP_AXIOS?.[configured_type]?.[plateform];

        if (!handler) {
            return resError({
                ack_msg: "Unsupported configuration",
                developer_msg: `type=${configured_type}, platform=${plateform}`,
            });
        }

        const getFileNameFromUrl = (fileUrl) => {
            try {
                const url = new URL(fileUrl);

                // Extract filename from pathname
                const fileName = url.pathname.split("/").pop();

                return fileName;
            } catch (error) {
                return null;
            }
        };

        const contactModelInstance = contactModel(req.tenantDB);
        const contactDetailFetch = await contactModelInstance.findOne({ where: { isDelete: 0, mobile_number: normalizeToTenDigit(recipientPhone) }, raw: true, attributes: ["person_name", "company_name"] });
        const companyName = contactDetailFetch?.company_name?.trim();
        const personName = contactDetailFetch?.person_name?.trim();
        const recipientName = (companyName && personName && personName !== 'Unknown') ? `${companyName} ${personName}` : (companyName || personName || 'Unknown');

        let demo_media_url = null;

        return await handler({
            phone_number: recipientPhone,
            recipientName,
            whatsapp_phone_number_id,
            whatsapp_connection_id,
            whatsapp_api_key,
            a_application_login_id: whx_a_application_login_id,
            languageCode,
            axios,
            templateName: template?.name,
            templateVariables: variables,
            mediaUrl: mediaUrl ? mediaUrl : demo_media_url,
            fileName: getFileNameFromUrl(mediaUrl ? mediaUrl : demo_media_url),
        });

    } catch (error) {
        console.log("sendTemplateMessage error", error);
        return resBadRequest({ developer_msg: `error ${error}` });
    }
};

export const fetchQuickFillsValue = async (req) => {
    try {
        const { cart_id, variables, quickFillVars } = req.body || {};
        const cartModelInstance = cartModel(req.tenantDB);
        const getDetailDb = await cartModelInstance.findOne({ where: { isDelete: 0, id: cart_id }, raw: true })

        if (!getDetailDb) {
            return resError({
                ack_msg: "Invalid Detail",
                developer_msg: ``,
            });
        }

        const orderTypesShowList = {
            1: "Quotation",
            2: "Sales Order",
            3: "Sales Invoice",
            4: "Purchase Invoice",
            5: "Purchase Order",
            6: "Return Sales Invoice",
            7: "Return Purchase Invoice",
            8: "Inward",
            9: "Dispatch",
        };


        Object.keys(quickFillVars).map((v) => {
            if (quickFillVars[v] == 'voucher_customer_name') {
                variables[v] = getDetailDb?.to_customer_name
            } else if (quickFillVars[v] == 'voucher_type') {
                variables[v] = orderTypesShowList[getDetailDb?.type]
            } else if (quickFillVars[v] == 'voucher_number') {
                variables[v] = getDetailDb?.cart_number
            } else if (quickFillVars[v] == 'voucher_date') {
                variables[v] = getDetailDb?.cart_date
            } else if (quickFillVars[v] == 'voucher_amount') {
                variables[v] = getDetailDb?.grand_total
            }
        })

        return resSuccess({
            data: {
                variables
            },
        });
    } catch (error) {
        console.log("fetchQuickFillsValue error", error);
        return resBadRequest({ developer_msg: `error ${error}` });
    }
}

export const wconfigFlag = async (req) => {
    try {
        const { a_application_login_id } = req.body || {};

        const company = await getCompanyByLoginId(a_application_login_id);

        const config = await companyVsWhatsappConfigModel.findOne({
            where: { company_id: company.company_masters_id },
            raw: true,
        });
        let WHATSAPP_PLATEFORM;

        if (!config) {
            WHATSAPP_PLATEFORM = 0;
            return resSuccess({
                data: { WHATSAPP_PLATEFORM }
            });
        }

        const { configured_type, plateform } = config;


        if (plateform == 2 && configured_type == 2) {
            WHATSAPP_PLATEFORM = 2;
        } else {
            WHATSAPP_PLATEFORM = 1;
        }
        return resSuccess({
            data: { WHATSAPP_PLATEFORM }
        });

    } catch (error) {
        console.log("wconfigFlag error", error);
        return resBadRequest({ developer_msg: `error ${error}` });
    }
}

export const waCloudHook = async (req, res) => {
    try {
        const lead = req.body;
        if (!lead) {
            return resError(res, {
                ack_msg: "Invalid payload",
                developer_msg: "Empty or invalid data received",
            });
        }

        // console.log("hghghghghgh", lead['contact.name']);
        const { sender_number, message, message_type, recipent_number, timestamp } = lead;


        const { companyCode } = req.params;

        // Find company by QR code
        const companyRecord = await companyModel.findOne({
            where: { qr_code: companyCode, isDelete: "0" },
            attributes: ["id", "qr_code", "a_application_login_id", "company_name"],
        });

        if (!companyRecord) {
            return resError(res, {
                ack_msg: "Invalid company code",
                developer_msg: `No company found with qr_code: ${companyCode}`,
            });
        }

        const tenantId = companyRecord.a_application_login_id;
        const companyIdResult = await getCompanyByLoginId(tenantId);
        const company_masters_id = companyIdResult.company_masters_id;
        let a_company_name;
        let a_company_id;
        a_company_name = companyRecord.company_name;
        a_company_id = companyRecord.id;

        // Set tenant context
        req.headers["x-tenant-id"] = tenantId;
        await new Promise((resolve, reject) => {
            tenantMiddleware(req, res, (err) => (err ? reject(err) : resolve()));
        });

        if (!req.tenantDB) {
            return resError(res, { ack_msg: "Tenant DB not initialized" });
        }

        const CTContactModel = contactModel(req.tenantDB);
        const CTInquiryModel = inquiryModel(req.tenantDB);
        const CTContactMessageHistoryModel = contactMessageHistory(req.tenantDB);

        const applicationLoginTypeRightModelIntance = applicationLoginTypeRightModel(req.tenantDB);

        // Source Type ID for JustDial
        const SOURCE_TYPE_ID = -4;

        const contactRightsList = await applicationLoginTypeRightModelIntance.findAll({
            where: {
                company_masters_id,
                a_application_login_id: companyIdResult.a_application_login_id,
                page_id: PAGE_ID.CONTACT,
                isDelete: 0,
            },
            attributes: ["a_page_id_rights_jason"],
        });

        const currentContactCount = await CTContactModel.count({
            where: { isDelete: 0 },
        });
        for (const right of contactRightsList) {
            try {
                let rightsJson = right.a_page_id_rights_jason;
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
                if (typeof rightsJson?.limit === "number" && rightsJson.limit > 0) {
                    if (currentContactCount >= rightsJson.limit) {
                        return resError({
                            ack_msg: `Limit ${rightsJson.limit} reached for Company. Current Contact In Your System: ${currentContactCount}`,
                            developer_msg: `Limit ${rightsJson.limit} reached for Company. Current Contact In Your System: ${currentContactCount}.`,
                        });
                    }
                }
            } catch (err) {
                console.error("Contact rights JSON parse error:", err);
            }
        }

        // Auto assignment
        const whatsappEmailSendTeamPersonList = [];
        const contactAssignedIds = await autoAssignmentContactIdsGet(req, {
            source_type_id: SOURCE_TYPE_ID,
            city_id: "",
            area_id: "",
            description: message
        });
        const contactAssignedIdsStr = isValid(contactAssignedIds?.data?.assignedIds) ? contactAssignedIds?.data?.assignedIds?.join(",") : "";

        if (contactAssignedIds?.data?.isWhatsappEmailSendEnabled && (contactAssignedIds?.data?.assignedIds?.length == 1 || isValid(contactAssignedIds?.data?.template_id))) {
            whatsappEmailSendTeamPersonList.push(
                {
                    team_id: contactAssignedIdsStr,
                    send_message: contactAssignedIds?.data?.send_description,
                    template_id: contactAssignedIds?.data?.template_id
                }
            )
        }

        const contactEmailSendList = [];
        const contactWhatsappSendList = [];

        const currentDateTime = new Date();
        let mobile_number = normalizeToTenDigit(sender_number);
        let person_name = 'Unknown';
        if (lead['contact.name']) {
            person_name = lead['contact.name']
        } else if (lead?.['contact_name']) {
            person_name = lead['contact_name']
        } else if (lead?.['contact_name1']) {
            person_name = lead['contact_name1']
        }
        let description = message;
        let message_type_ = message_type;
        let recipent_number_ = recipent_number;
        const created_date_time = moment(new Date(timestamp)).format("YYYY-MM-DD HH:mm:ss") || moment(currentDateTime).format("YYYY-MM-DD HH:mm:ss");

        const checkIsNumberExist = await CTContactModel.findOne({
            where: { isDelete: 0, mobile_number: mobile_number },
            raw: true
        });



        let contactReponse;
        let isNewContact;
        if (checkIsNumberExist) {
            contactReponse = checkIsNumberExist;
        } else {

            contactReponse = await CTContactModel.create(
                {
                    mobile_number,
                    raw_mobile_number: sender_number || "",
                    person_name,
                    created_date_time,
                    source_type_id: SOURCE_TYPE_ID,
                    a_application_login_id: companyRecord.a_application_login_id,
                    assinged_to_work_a_application_id: contactAssignedIdsStr || companyRecord.a_application_login_id
                });
            isNewContact = contactReponse ? true : false;

        }

        const createdInquiry = await CTInquiryModel.create(
            {
                contact_master_id: contactReponse.id,
                description,
                inquiry_date_time: created_date_time,
                source_type_id: SOURCE_TYPE_ID,
                a_application_login_id: companyRecord.a_application_login_id
            });


        if (isNewContact) {
            await insertStagesAndStatusLogs(req, {
                reference_table: "contact_masters",
                reference_id: contactReponse.id,
                status_id: "-1",
                a_application_login_id: companyRecord.a_application_login_id,
            });
        }

        if (isNewContact) {
            if (isValid(whatsappEmailSendTeamPersonList) && isValid(contactReponse.mobile_number)) {
                const result = whatsappEmailSendTeamPersonList.find(item => item.team_id == contactReponse.assinged_to_work_a_application_id);
                if (result) {
                    contactWhatsappSendList.push({
                        whatsapp_number: contactReponse.mobile_number,
                        contact_detail: {
                            person_name: contactReponse.person_name,
                            mobile_number: contactReponse.mobile_number,
                            customer_id: contactReponse.id
                        },
                        team_person: contactReponse.assinged_to_work_a_application_id,
                        company_name: a_company_name,
                        a_company_id: a_company_id,
                        send_message: result?.send_message,
                        template_id: result?.template_id,
                    });
                }
            }
            await prepareMailAndWhatsappSenderToTheContact(req, { contactWhatsappSendList });
        }

        if (createdInquiry) {
            await insertStagesAndStatusLogs(req, {
                reference_table: "inquiries",
                reference_id: createdInquiry.id,
                status_id: "-2",
                a_application_login_id: companyRecord.a_application_login_id,
            });
        }

        const messageEntry = await CTContactMessageHistoryModel.create({
            contact_masters_id: contactReponse.id,
            a_application_login_id: companyRecord.a_application_login_id,
            description,
            created_date_time: created_date_time,
            message_side: "2",
            message_type_id: "0",
        });

        if (createdInquiry || messageEntry) {
            await CTContactModel.update(
                {
                    is_read_by_a_application_login_id: '',
                },
                {
                    where: {
                        id: contactReponse.id,
                    },
                }
            );
        }


        // Notification
        try {
            const ownerLogins = await companyVsApplicationLoginModel.findAll({
                where: { company_masters_id, company_flag: 1, isDelete: 0 },
                attributes: ["a_application_login_id"],
            });

            const loginIds = ownerLogins
                .map(o => o.a_application_login_id)
                .filter(id => id !== companyRecord.a_application_login_id);

            if (loginIds.length > 0) {
                const tokensData = await loginModel.findAll({
                    where: { id: loginIds, isDelete: 0 },
                    attributes: ["android_refresh_token", "web_refresh_token", "ios_refresh_token"],
                });

                const tokens = [...new Set(
                    tokensData.flatMap(t => [
                        t.android_refresh_token,
                        t.web_refresh_token,
                        t.ios_refresh_token
                    ].filter(Boolean))
                )];

                if (tokens.length > 0) {
                    await sendMultipleNotification({
                        deviceTokens: tokens,
                        title: "New Whatsapp Lead",
                        body: `${isNewContact ? "New lead" : "Follow-up"} from Whatsapp`,
                    });
                }
            }

            return resSuccess({
                ack_msg: "success",
                developer_msg: "success",
            });
        } catch (notifyErr) {
            console.error("JustDial Notification Failed:", notifyErr.message);
        }


    } catch (error) {
        console.log("waCloudHook error", error);
        return resBadRequest({ developer_msg: `error ${error}` });
    }
}


export const whatsappTemplateUploadAttachment = async (req) => {
    try {
        const { a_application_login_id } = req.body;
        const file = req.file;
        const findCompanyId = await getCompanyByLoginId(a_application_login_id);

        let directoryPath;
        if (file) {
            directoryPath = path.join(
                process.cwd(),
                "media-folder",
                "whatsapp-template",
                findCompanyId.company_masters_id.toString(),
                "upload-media",
            );
        }

        // File upload logic
        let fileUrl;
        let fileName;
        if (file) {
            fs.mkdirp(directoryPath);
            const filePath = file.path;
            fileName = path.basename(filePath);
            const destinationPath = path.join(directoryPath, fileName);

            await fs.move(filePath, destinationPath);

            fileUrl = `${WHATSAPP_TEMPLATE_STATIC_ATTACHMENT_GENEREATE_LINK}${findCompanyId.company_masters_id}/upload-media/${fileName}`;
        }

        return resSuccess({
            data: {
                url: fileUrl,
                fileName: fileName
            }
        });

    } catch (error) {
        console.error("whatsappTemplateUploadAttachment Error:", error);
        return resBadRequest({
            ack_msg: "Something went wrong",
            developer_msg: `Error: ${error.message}`,
        });
    }
};

