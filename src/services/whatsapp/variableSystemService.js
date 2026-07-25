import moment from "moment";
import { Op, QueryTypes, Sequelize } from "sequelize";
import { whatsappTemplateConfigsModel } from "../../models/activities/whatsappTemplateConfigsModel.js";
import loginModel from "../../models/application_login/loginModel.js";
import companyModel from "../../models/company_setup/companyModel.js";
import { resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";
import { validateSendViaSavedConfig } from "../../validators/whatsappTemplateValidator.js";
import { accountPDFv1, allAccountTransactionOfContactPDF } from "../activities/accountTransactionServices.js";
import { pdfOrder } from "../activities/orderServices.js";
import { getCompanyByLoginId } from "../commonServices.js";
import { resolveAttachmentVariable, resolveVariableMappings, validateResolutionParams } from "./variableResolverService.js";
import { sendTemplateMessage } from "./whatsappService.js";


export const ordWvFetch = async (req) => {
    try {

        const queryMap = {
            basic: `
                carts.id,
                carts.type AS voucher_type,
                carts.cart_number AS voucher_number,
                carts.cart_date AS voucher_date,
                carts.grand_total AS voucher_amount
            `,

            customer: `
                customer.id AS customer_id,
                customer.person_name AS voucher_customer_name,
                customer.mobile_number AS customer_mobile_number,
                customer.company_name AS customer_company_name,
                customer.email_id AS customer_email_address
            `,

        };

        const joinMap = {
            customer: `
                LEFT JOIN contact_masters customer
                ON customer.id = carts.to_customer_id
            `,

        };
        const { orderId, fetchType } = req.params;
        const sequelize = req.tenantDB;
        const types = fetchType ?
            fetchType.split(",")
                .map((v) => v.trim().toLowerCase()) : [];

        // Always include basic
        if (!types.includes("basic")) {
            types.unshift("basic");
        }

        const selectFields = [];
        const joins = [];

        for (const type of types) {
            if (queryMap[type]) {
                selectFields.push(queryMap[type]);
            }

            if (joinMap[type]) {
                joins.push(joinMap[type]);
            }
        }

        const sql = `
    SELECT
      ${selectFields.join(",")}

    FROM carts

    ${joins.join(" ")}

    WHERE carts.id = :orderId
    AND carts.isDelete = 0
  `;

        const result = await sequelize.query(sql, {
            replacements: {
                orderId,
            },
            type: QueryTypes.SELECT,
        });

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

        const resultt = result.map((v) => {
            return {
                ...v,
                voucher_type: orderTypesShowList[v.voucher_type]
            }
        })
        return resultt;
    } catch (error) {
        console.log("ordWvFetch Error", error);
        return [];
    }
};

export const accWvFetch = async (req) => {
    try {
        const accqueryMap = {
            basic: `
                account_transactions.id,
                account_transactions.type AS payment_type,
                paytype.payment_type_name AS payment_by,
                account_transactions.payment_date_time AS payment_date,
                account_transactions.amount AS account_amount
            `,

            customer: `
                customer.id AS customer_id,
                customer.person_name AS customer_name,
                customer.mobile_number AS customer_mobile_number,
                customer.company_name AS customer_company_name,
                customer.email_id AS customer_email_address
            `,

        };

        const accjoinMap = {
            customer: `
                LEFT JOIN contact_masters customer
                ON customer.id = account_transactions.contact_masters_id
            `,
        };
        const { acc_id, fetchType } = req.params;
        const sequelize = req.tenantDB;
        const types = fetchType ?
            fetchType.split(",")
                .map((v) => v.trim().toLowerCase()) : [];

        // Always include basic
        if (!types.includes("basic")) {
            types.unshift("basic");
        }

        const selectFields = [];
        const joins = [];

        for (const type of types) {
            if (accqueryMap[type]) {
                selectFields.push(accqueryMap[type]);
            }

            if (accjoinMap[type]) {
                joins.push(accjoinMap[type]);
            }
        }

        const sql = `
    SELECT
      ${selectFields.join(",")}

    FROM account_transactions

    ${joins.join(" ")}

    LEFT JOIN payment_types paytype
      ON paytype.id = account_transactions.mode

    WHERE account_transactions.id = :acc_id
    AND account_transactions.isDelete = 0
  `;

        const result = await sequelize.query(sql, {
            replacements: {
                acc_id,
            },
            type: QueryTypes.SELECT,
        });
        const paymentTypesList = {
            "1": "Credit",
            "2": "Debit",
        };

        const resultt = result.map((v) => {
            return {
                ...v,
                "payment_type": paymentTypesList[String(v.payment_type)],
                "payment_by": v.payment_by,
                "payment_date": moment(v.payment_date).format("DD-MM-YYYY hh:mm A"),
                "account_amount": v.account_amount,
                "customer_name": v.customer_name
            }
        })
        return resultt;
    } catch (error) {
        console.log("accWvFetch Error", error);
        return [];
    }
};

export const ordAttFetch = async (req) => {
    try {
        const { orderId, fetchType } = req.params;
        if (orderId && fetchType == 'pdf') {
            req.body.cart_id = orderId;
            const data = await pdfOrder(req);
            return [{ voucher_pdf_url: data?.data?.path }]
        } else {
            return [];
        }
    } catch (error) {
        console.log("ordAttFetch Error", error);
        return [];
    }
}

export const accAttFetch = async (req) => {
    try {
        const { acc_id, customerId, fetchType } = req.params;
        if (acc_id && fetchType == 'pdf') {
            req.body.accountTransactionId = acc_id;
            const data = await accountPDFv1(req);
            return [{ account_receipt_pdf_url: data?.data?.fileLinkPath }]
        } else if (customerId && fetchType == 'ledpdf') {
            req.body.contact_master_id = customerId;
            req.body.a_application_login_id = req.body.whx_a_application_login_id;
            const data = await allAccountTransactionOfContactPDF(req);

            return [{ account_ledger_pdf_url: data?.data?.fileLinkPath }]
        } else {
            return [];
        }
    } catch (error) {
        console.log("ordAttFetch Error", error);
        return [];
    }
}

export const conWvFetch = async (req) => {
    try {
        const { customerId } = req.params;
        const sequelize = req.tenantDB;
        const sql = `
            SELECT
            * 
            FROM contact_masters

            WHERE contact_masters.id = :customerId
            AND contact_masters.isDelete = 0
        `;

        const result = await sequelize.query(sql, {
            replacements: {
                customerId,
            },
            type: QueryTypes.SELECT,
        });

        const resultt = result.map((v) => {
            return {
                ...v,
                customer_name: v.person_name,
                customer_mobile_number: v.mobile_number,
                customer_company_name: v.company_name,
                customer_email_address: v.email_id

            }
        })

        return resultt;

    } catch (error) {
        console.log("conWvFetch Error", error);
        return [];
    }
};

export const cmpWvFetch = async (req) => {
    try {
        const { appId } = req.params;

        const findCompanyId = await getCompanyByLoginId(appId);

        const result = await companyModel.findOne({
            where: {
                isDelete: 0,
                a_application_login_id: findCompanyId.company_masters_id
            },
            raw: true
        });

        if (!result) {
            return [];
        }

        return [{
            ...result,
            company_mobile_number: result.company_contact,
            company_email_address: result.company_email
        }];

    } catch (error) {
        console.log("conWvFetch Error", error);
        return [];
    }
};

export const tskWbFetch = async (req) => {
    try {
        const queryMap = {
            basic: `
    task_managements.id,
    task_managements.id AS task_no,
    task_managements.task_title,
    task_managements.task_remark AS task_description,
    task_managements.task_priority AS task_priority

  `,

            customer: `
    customer.id AS customer_id,
    customer.person_name AS customer_name,
    customer.mobile_number AS customer_mobile_number,
    customer.company_name AS customer_company_name,
    customer.email_id AS customer_email_address
  `,

            status: `
    status_masters.name AS task_status
  `,

        };

        const joinMap = {
            customer: `
    LEFT JOIN contact_masters customer
      ON customer.id = task_managements.contact_masters_id
  `,

            status: `
    LEFT JOIN stage_status_masters status_masters
      ON status_masters.id = task_managements.status
  `,

        };

        const { tskId, fetchType } = req.params;
        const sequelize = req.tenantDB;
        const types = fetchType ?
            fetchType.split(",")
                .map((v) => v.trim().toLowerCase()) : [];

        // Always include basic
        if (!types.includes("basic")) {
            types.unshift("basic");
        }

        const selectFields = [];
        const joins = [];

        for (const type of types) {
            if (queryMap[type]) {
                selectFields.push(queryMap[type]);
            }

            if (joinMap[type]) {
                joins.push(joinMap[type]);
            }
        }

        const sql = `
            SELECT
            ${selectFields.join(",")}

            FROM task_managements

            ${joins.join(" ")}

            WHERE task_managements.id = :tskId
            AND task_managements.isDelete = 0
        `;

        const result = await sequelize.query(sql, {
            replacements: {
                tskId,
            },
            type: QueryTypes.SELECT,
        });

        const resultt = result.map((v) => {
            return {
                ...v,
            }
        })
        return resultt;
    } catch (error) {
        console.log("tskWbFetch Error", error);
        return [];
    }
}

/**
 * Get saved template configuration for a module + template
 */
export const whatsappTemplateConfigs = async (req, res) => {
    try {
        const { module, templateId, a_application_login_id } = req.query;
        const userId = a_application_login_id;

        if (!module) {
            /*  return res.status(400).json({
                 success: false,
                 error: 'module are required'
             }); */
            return resError({
                code: 400,
                status: 400,
                ack_msg: "module are required",
                data: {
                    success: false,
                    error: 'module are required'
                }
            })
        }

        const whatsappTemplateConfigsModelInstance = whatsappTemplateConfigsModel(req.tenantDB)
        let whereClause = { isDelete: 0 };

        if (module) {
            whereClause.module = module
        }

        if (templateId) {
            whereClause.template_id = templateId
        }

        // if (userId) {
        //     whereClause.user_id = userId
        // }

        const config = await whatsappTemplateConfigsModelInstance.findOne({
            where: whereClause
        });

        const responseData = config
            ? {
                id: config.id,
                module: config.module,
                templateId: config.template_id,
                templateName: config.template_name,
                variableMappings: config.variable_mappings ? JSON.parse(config.variable_mappings) : null,
                attachmentVariableKey: config.attachment_variable_key,
                attachmentSourceType: config.attachment_source_type ?? "variable",
                staticAttachmentUrl: config.static_attachment_url ?? undefined,
                staticAttachmentFileName: config.static_attachment_file_name ?? undefined,
                userId: config.user_id,
                isActive: config.isActive,
                createdAt: config.created_at,
                updatedAt: config.updated_at
            }
            : null;

        return resSuccess({
            code: 200,
            data: {
                success: true,
                data: responseData
            }
        })
    } catch (error) {

        console.error('Error fetching saved config:', error);
        /*         res.status(500).json({
                    success: false,
                    error: 'Internal server error'
                }); */
        return resError({
            code: 500,
            status: 500,
            ack_msg: "Internal server error",
            data: {
                success: false,
                error: 'Internal server error'
            }
        })
    }
}

/**
 * Save or update template configuration
 */
export const whatsappTemplateConfigsUpdate = async (req, res) => {
    try {
        const {
            module,
            templateId,
            templateName,
            variableMappings,
            attachmentVariableKey,
            staticAttachmentFileName,
            staticAttachmentUrl,
            attachmentSourceType,
            language,
            a_application_login_id
        } = req.body;

        const user_id = a_application_login_id;

        if (!module || !templateId || !templateName || !variableMappings) {
            return resError({
                code: 400,
                status: 400,
                ack_msg: "module, templateId, templateName, and variableMappings are required",
                data: {
                    success: false,
                    error: 'module, templateId, templateName, and variableMappings are required'
                }
            })
            /*         return res.status(400).json({
                        success: false,
                        error: "module, templateId, templateName, and variableMappings are required"
                    }); */
        }

        const whatsappTemplateConfigsModelInstance =
            whatsappTemplateConfigsModel(req.tenantDB);

        const [config, created] =
            await whatsappTemplateConfigsModelInstance.upsert({
                module,
                template_id: templateId,
                template_name: templateName,
                variable_mappings: variableMappings,
                attachment_variable_key: attachmentVariableKey ? attachmentVariableKey : "",
                attachment_source_type: attachmentSourceType ?? "variable",
                static_attachment_url: staticAttachmentUrl ?? "",
                static_attachment_file_name: staticAttachmentFileName ?? "",
                language: language,
                user_id,
                isDelete: 0,
                isActive: 1,
            });

        /*         res.json({
                    success: true,
                    data: config,
                    created,
                    message: "Template configuration saved successfully",
                }); */

        return resSuccess({
            code: 200,
            data: {
                success: true,
                data: config,
                created,
                message: "Template configuration saved successfully",
            }
        })

    } catch (error) {
        console.error("Error saving template config:", error);
        return resError({
            code: 500,
            status: 500,
            ack_msg: "Internal server error",
            data: {
                success: false,
                error: 'Internal server error'
            }
        })
        /* res.status(500).json({
            success: false,
            error: "Internal server error",
        }); */

    }
};


/* export const whatappTemplateConfigsDelete = async (req) => {
    try {
        const { module, contextParams } = req.body;
        const userId = req.user.id;

        // Build cache key pattern
        const pattern = module
            ? `var:${userId}:*:${module}:*`
            : `var:${userId}:*`;

        // Clear Redis cache
        const redis = new Redis(process.env.REDIS_URL);
        const keys = await redis.keys(pattern);

        if (keys.length > 0) {
            await redis.del(...keys);
        }

        res.json({
            success: true,
            message: `Cleared ${keys.length} cache entries`,
            clearedKeys: keys.length
        });
    } catch (error) {
        console.error('Error clearing cache:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
} */

export const whatsappTemplateConfigGet = async (req) => {
    try {
        const { a_application_login_id } = req.body;

        const findCompanyId = await getCompanyByLoginId(a_application_login_id);

        const whatsappTemplateConfigsModelInstance = whatsappTemplateConfigsModel(req.tenantDB);

        const result = await whatsappTemplateConfigsModelInstance.findAll({
            where: { isDelete: 0 },
            attributes: [
                "id",
                "module",
                "template_id",
                "template_name",
                "variable_mappings",
                "user_id",
                "created_at",

            ]
        });

        const activeTeamList = await loginModel.findAll({
            where: {
                id: {
                    [Op.in]: Sequelize.literal(`(
                                SELECT a_application_login_id 
                                FROM company_vs_application_logins 
                                WHERE isDelete = 0 
                                AND company_masters_id = ${findCompanyId.company_masters_id}
                            )`)
                },
                isDelete: 0
            },
            attributes: ["id", "username"],
            raw: true
        });

        if (activeTeamList) {
            result.forEach((item) => {
                const username = activeTeamList.find(e => e.id == item.user_id).username;
                item.dataValues.username = username;
            });
        }

        if (result) {
            return resSuccess({
                ack_msg: "configs got successfully",
                data: { item: result },
            });
        } else {
            return resError();
        }

    } catch (e) {
        console.log("whatsappTemplateConfigGet error", e)
        return resBadRequest({ developer_msg: `error ${e}` });
    }
}

export const whatsappTemplateConfigDelete = async (req) => {
    const {
        module,
    } = req.body;

    try {
        const whatsappTemplateConfigsModelInstance = whatsappTemplateConfigsModel(req.tenantDB);
        const isExistData = await whatsappTemplateConfigsModelInstance.findOne({
            where: { module },
            raw: true
        });

        if (!isExistData) {
            return resError({
                ack_msg: "Config does not exist",
                developer_msg: "Config does not exist",
            });
        }

        const result = await whatsappTemplateConfigsModelInstance.destroy(
            {
                where: { module }
            }
        );

        if (result) {
            return resSuccess({
                ack_msg: "Config Deleted successfully",
                data: { item: result },
            });
        } else {
            return resError();
        }

    } catch (error) {
        console.log("whatsappTemplateConfigDelete error", error)
        return resBadRequest({
            ack_msg: " ",
            developer_msg: `${error.message}`,
        });
    }
};

export const sendWhatsappTemplateViaBackend = async (req) => {
    try {
        const errors = validateSendViaSavedConfig(req.body);
        if (errors.length) return resError({
            data: errors.join("; ")
        });

        const { whx_a_application_login_id, module, contextParams, recipientPhone } = req.body;
        const whatsappTemplateConfigsModelInstance = whatsappTemplateConfigsModel(req.tenantDB);

        // 1. Load saved config
        const config = await whatsappTemplateConfigsModelInstance.findOne({
            where: { module },
            raw: true
        });

        if (!config) {
            return resError({
                data: `No saved config found for module "${module}"`
            });
        }

        // 2. Validate contextParams cover all required variable params
        const paramIssues = validateResolutionParams(
            config.variable_mappings,
            module,
            contextParams,
        );
        if (paramIssues.length) {
            return resError({
                data: `Parameter validation failed: ${paramIssues.join("; ")}`
            });
        }

        // 3. Resolve variables → actual values
        const resolvedVars = await resolveVariableMappings(
            req,
            config.variable_mappings,
            module,
            contextParams,
        );

        // 4. Check for empty resolved values (all must be filled for real send)
        const emptyVars = Object.entries(resolvedVars)
            .filter(([, v]) => !v || v.trim() === "")
            .map(([k]) => `{{${k}}}`);

        if (emptyVars.length) {
            return resError({
                data: `Could not resolve values for placeholders: ${emptyVars.join(", ")}`
            });
        }

        // 5. Resolve attachment URL (NEW) ─────────────────────────
        //    Only runs when template has IMAGE/DOCUMENT/VIDEO header
        let attachmentUrl = "";
        const sourceType = config.attachment_source_type ?? "variable";
        const attachmentVariableKey = config.attachment_variable_key;
        if (sourceType === "static") {
            attachmentUrl = config.static_attachment_url ?? "";

            if (!attachmentUrl) {

                return resError({
                    data: `No static attachment file has been uploaded for this template configuration.`
                });
            }
        }
        else if (attachmentVariableKey) {
            attachmentUrl = await resolveAttachmentVariable(
                req, attachmentVariableKey, module, contextParams,
            );

            if (!attachmentUrl) {
                // Attachment is required for media templates — fail if missing
                /*  return fail(
                     res,
                     `Could not resolve attachment URL for variable "${attachmentVariableKey}". ` +
                     `This template requires a media attachment.`,
                 ); */

                return resError({
                    data: `This template requires a media attachment.`
                });
            }
        }

        // 6. Build and send template
        req.body = {
            whx_a_application_login_id,
            template: {
                id: config.template_id,
                name: config.template_name,
            },
            variables: resolvedVars,
            is_template_message: 1,
            receiverClue: contextParams,
            quickFillVars: config.variable_mappings,
            mediaUrl: attachmentUrl || null,
            languageCode: config.language,
            attachmentVariableKey: sourceType === "variable" ? (config.attachment_variable_key || undefined) : undefined,
            recipientPhone,
        };
        const result = await sendTemplateMessage(req)
        return resSuccess({
            ack_msg: "Template sent via saved configuration",
            code: 200,
            data: {
                result,
                resolvedVariables: resolvedVars,
                templateName: config.template_name,
            }
        })

    } catch (error) {
        console.log("sendWhatsappTemplateViaBackend error", error);
        return resBadRequest({ developer_msg: `error ${error}` });
    }
}