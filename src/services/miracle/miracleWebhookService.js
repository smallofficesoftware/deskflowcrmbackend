import { checkMiracleAuth } from "../../middlewares/miracleAuth.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";
import companyModel from "../../models/company_setup/companyModel.js";
import miracleConfigModel from "../../models/company_setup/miracleConfigModel.js";
import { categoryModel } from "../../models/product_settings/categoryModel.js";
import { productGroupModel } from "../../models/product_settings/productGroupModel.js";
import { productModel } from "../../models/product_settings/productModel.js";
import { productUnitMasterModel } from "../../models/product_settings/productUnitMasterModel.js";
import { taxModel } from "../../models/product_settings/taxModel.js";
import { createAxiosIntance } from "../../utils/miracleAxiosInstance.js";
import { parseMiracleRights } from "../../utils/miracleRightsHelper.js";
import { resBadRequest, resSuccess } from "../../utils/sharedFunctions.js";
import { insertMiracleLog } from "../activities/miracleLogService.js";

import { accountTransactionsModel } from "../../models/activities/accountTransactionsModel.js";
import { cartItemModel } from "../../models/activities/cartItemsModel.js";
import { cartModel } from "../../models/activities/cartsModel.js";
import { contactModel } from "../../models/activities/contactModel.js";
import { inquiryModel } from "../../models/activities/inquiryModel.js";
import { paymentTypeModel } from "../../models/activities/paymentTypeModel.js";
import { areaModel } from "../../models/masters/areaModel.js";
import { cityModel } from "../../models/masters/cityModel.js";
import { stateModel } from "../../models/masters/stateModel.js";
import { priceListModel } from "../../models/product_settings/priceListModel.js";
import { customFieldFormModel } from "../../models/other_settings/customFieldFormModel.js";
import { Op } from "sequelize";

const extractMiracleCustomFields = async (tenantDB, companyId, formType, ufddetPayload, targetModule = null) => {
    if (!tenantDB || !companyId || !formType || !ufddetPayload || typeof ufddetPayload !== "object") return {};
    try {
        const CFFModel = customFieldFormModel(tenantDB);
        let customFields = await CFFModel.findAll({
            where: {
                isDelete: 0,
                company_masters_id: companyId,
                third_party_field_name: { [Op.ne]: null }
            },
            attributes: ["reference_column_name", "third_party_field_name", "applicable_modules", "form_type"],
            raw: true
        });

        customFields = customFields.filter(f => {
            const checkFormType = targetModule !== null ? targetModule : formType;
            if (Number(f.form_type) === Number(checkFormType)) return true;
            if (f.applicable_modules && f.applicable_modules !== "") {
                const mods = String(f.applicable_modules).split(",").map(m => m.trim());
                return mods.includes(String(checkFormType));
            }
            return false;
        });
        const updates = {};
        for (const field of customFields) {
            const key = field.third_party_field_name ? String(field.third_party_field_name).trim() : "";
            const col = field.reference_column_name;
            if (key && col && ufddetPayload[key] !== undefined) {
                updates[col] = ufddetPayload[key];
            }
        }
        return updates;
    } catch (err) {
        console.error("Error extracting Miracle custom fields from webhook:", err);
        return {};
    }
};

export const WEBHOOK_EVENT_REGISTRY = {
    PA: {
        label: "Product Add",
        handler: handleProductAdd,
    },
    PE: {
        label: "Product Update",
        handler: handleProductAdd,
    },
    PD: {
        label: "Product Delete",
        handler: handleProductDelete,
    },
    AA: {
        label: "Contact Add",
        handler: handleContactAddOrUpdate,
    },
    AE: {
        label: "Contact Update",
        handler: handleContactAddOrUpdate,
    },
    AD: {
        label: "Contact Delete",
        handler: handleContactDelete,
    },
    TA: {
        label: "Voucher Create",
        handler: handleVoucherAddOrUpdate,
    },
    TE: {
        label: "Voucher Update",
        handler: handleVoucherAddOrUpdate,
    },
    TD: {
        label: "Voucher Delete",
        handler: handleVoucherDelete,
    },
};

export const webhookM = async (req, res) => {
    const webhookStart = Date.now();
    let tenantDBForLog = null;
    let companyIdForLog = null;
    const incomingPayload = req.body;

    try {
        const { companyCode } = req.params;
        const companyGet = await companyModel.findOne({
            where: {
                qr_code: companyCode,
                isDelete: "0",
            },
            attributes: ["id", "qr_code", "a_application_login_id", "company_name"],
        });

        if (!companyGet) {
            return resBadRequest({
                ack_msg: "Company setup not found",
                developer_msg: `No company found matching qr_code: ${companyCode}`,
            });
        }

        const tenantId = companyGet.dataValues.a_application_login_id;
        const companyId = companyGet.dataValues.id;
        companyIdForLog = companyId;
        req.headers["x-tenant-id"] = tenantId;
        req.headers["x-company-id"] = companyId;
        req.body.a_application_login_id = tenantId;

        const runMiddleware = (middleware, req, res) => {
            return new Promise((resolve, reject) => {
                middleware(req, res, (err) => {
                    if (err) return reject(err);
                    resolve();
                });
            });
        };

        await runMiddleware(tenantMiddleware, req, res);
        tenantDBForLog = req.tenantDB;
        await runMiddleware(checkMiracleAuth, req, res);

        const payload = req.body;
        const eventConfig = WEBHOOK_EVENT_REGISTRY[payload.EventType];

        if (!eventConfig) {
            setImmediate(() => insertMiracleLog(tenantDBForLog, {
                log_type: "WEBHOOK",
                module_name: "unknown",
                action_type: payload.EventType || "",
                miracle_unique_id: payload.UniqueId || "",
                status: "FAILED",
                response_time: Date.now() - webhookStart,
                request_payload: incomingPayload,
                error_message: `Unsupported EventType: ${payload.EventType}`,
                company_masters_id: companyIdForLog,
            }));
            return resBadRequest({
                ack_msg: `Unsupported EventType: ${payload.EventType}`,
                developer_msg: `No handler registered for "${payload.EventType}"`,
            });
        }

        // Fetch company Miracle configuration & rights
        const mConfig = await miracleConfigModel.findOne({
            where: { company_id: companyId, isDelete: "0" },
            raw: true,
        });

        const rights = parseMiracleRights(mConfig?.rights_config);

        // 1. Master Webhook Switch Check
        if (!rights.webhook?.enabled) {
            setImmediate(() => insertMiracleLog(tenantDBForLog, {
                log_type: "WEBHOOK",
                module_name: "all",
                action_type: payload.EventType || "",
                miracle_unique_id: payload.UniqueId || "",
                status: "SKIPPED",
                response_time: Date.now() - webhookStart,
                request_payload: incomingPayload,
                error_message: "Webhooks are disabled for this company",
                company_masters_id: companyIdForLog,
            }));
            return resSuccess({
                ack_msg: "Webhook skipped: Webhooks are disabled for this company",
                data: { EventType: payload.EventType, status: "disabled" },
            });
        }

        // 2. Specific Module & Action Rights Check
        const VOUCHER_VOUTYP_TO_MODULE = {
            SS: "invoice",
            PP: "purchase_invoice",
            SR: "return_sales_invoice",
            PR: "return_purchase_invoice",
            QS: "quotation",
            OS: "order",
            OP: "purchase_order",
            HS: "dispatch",
            HP: "inward",
            BP: "account_transaction",
            BR: "account_transaction",
            CP: "account_transaction",
            CR: "account_transaction",
        };

        const CART_TYPE_TO_MODULE = {
            3: "invoice",
            4: "purchase_invoice",
            6: "return_sales_invoice",
            7: "return_purchase_invoice",
            1: "quotation",
            2: "order",
            5: "purchase_order",
            9: "dispatch",
            8: "inward",
        };

        let targetModule = null;
        let targetAction = null;

        if (payload.EventType === "PA") {
            targetModule = "product";
            targetAction = "add";
        } else if (payload.EventType === "PE") {
            targetModule = "product";
            targetAction = "update";
        } else if (payload.EventType === "PD") {
            targetModule = "product";
            targetAction = "delete";
        } else if (payload.EventType === "AA") {
            targetModule = "contact";
            targetAction = "add";
        } else if (payload.EventType === "AE") {
            targetModule = "contact";
            targetAction = "update";
        } else if (payload.EventType === "AD") {
            targetModule = "contact";
            targetAction = "delete";
        } else if (payload.EventType === "TA" || payload.EventType === "TE") {
            targetAction = payload.EventType === "TA" ? "add" : "update";
            try {
                const detail = await fetchVoucherDetail(req, payload.UniqueId);
                if (detail?.voutyp) {
                    targetModule = VOUCHER_VOUTYP_TO_MODULE[detail.voutyp] || null;
                }
            } catch (err) {
                console.error("Error fetching voucher detail for rights check:", err.message);
            }
        } else if (payload.EventType === "TD") {
            targetAction = "delete";
            const cartModelInstance = cartModel(req.tenantDB);
            const accountTransactionsModelInstance = accountTransactionsModel(req.tenantDB);

            const existingCart = await cartModelInstance.findOne({
                where: { miracle_UniqueId: payload.UniqueId, company_masters_id: companyId, isDelete: "0" },
                raw: true
            });

            if (existingCart) {
                targetModule = CART_TYPE_TO_MODULE[existingCart.type] || null;
            } else {
                const existingTx = await accountTransactionsModelInstance.findOne({
                    where: { miracle_UniqueId: payload.UniqueId, company_masters_id: companyId, isDelete: "0" },
                    raw: true
                });
                if (existingTx) {
                    targetModule = "account_transaction";
                }
            }
        }

        if (targetModule && targetAction) {
            const isAllowed = rights.webhook?.[targetModule]?.[targetAction];
            if (isAllowed === false) {
                setImmediate(() => insertMiracleLog(tenantDBForLog, {
                    log_type: "WEBHOOK",
                    module_name: targetModule || "unknown",
                    action_type: `${targetAction?.toUpperCase()} (${payload.EventType})`,
                    miracle_unique_id: payload.UniqueId || "",
                    status: "SKIPPED",
                    response_time: Date.now() - webhookStart,
                    request_payload: incomingPayload,
                    error_message: `${targetModule}.${targetAction} is disabled in Miracle Configurations`,
                    company_masters_id: companyIdForLog,
                }));
                return resSuccess({
                    ack_msg: `Webhook skipped: ${targetModule}.${targetAction} is disabled in Miracle Configurations`,
                    data: { EventType: payload.EventType, targetModule, targetAction, status: "disabled" },
                });
            }
        }

        const result = await eventConfig.handler({
            payload,
            context: { req, res, tenantDB: req.tenantDB, companyId, tenantId },
        });

        // Log successful webhook
        setImmediate(() => insertMiracleLog(tenantDBForLog, {
            log_type: "WEBHOOK",
            module_name: targetModule || payload.EventType || "unknown",
            action_type: targetAction ? `${targetAction.toUpperCase()} (${payload.EventType})` : payload.EventType,
            miracle_unique_id: payload.UniqueId || "",
            status: "SUCCESS",
            response_time: Date.now() - webhookStart,
            request_payload: incomingPayload,
            response_payload: result,
            company_masters_id: companyIdForLog,
        }));

        return resSuccess({ ack_msg: "success", data: result });
    } catch (error) {
        console.log("webhookM error", error);
        setImmediate(() => insertMiracleLog(tenantDBForLog, {
            log_type: "WEBHOOK",
            module_name: incomingPayload?.EventType || "unknown",
            action_type: incomingPayload?.EventType || "",
            miracle_unique_id: incomingPayload?.UniqueId || "",
            status: "FAILED",
            response_time: Date.now() - webhookStart,
            request_payload: incomingPayload,
            error_message: error.message,
            company_masters_id: companyIdForLog,
        }));
        return resBadRequest({
            ack_msg: error.message,
            developer_msg: error.message
        });
    }
};

async function fetchProductDetail(req, uniqueId) {
    const { mconfig } = req.body;
    const { client_id, api_key, baseurl } = mconfig;

    const api = createAxiosIntance({
        baseURL: baseurl,
        clientId: client_id,
        apiKey: api_key,
        tenantDB: req.tenantDB,
        getAuthContext: async () => req.body.mconfig
    });

    const response = await api.get(`TPA/M2/V1/GetProduct?id=${uniqueId}`);

    const { DataModel, IsError, Message, ErrorCode } = response.data || {};

    return DataModel;
}

async function fetchContactDetail(req, uniqueId) {
    const { mconfig } = req.body;
    const { client_id, api_key, baseurl } = mconfig;

    const api = createAxiosIntance({
        baseURL: baseurl,
        clientId: client_id,
        apiKey: api_key,
        tenantDB: req.tenantDB,
        getAuthContext: async () => req.body.mconfig
    });

    const response = await api.get(`TPA/M2/V1/GetAccount?id=${uniqueId}`);

    const { DataModel, IsError, Message, ErrorCode } = response.data || {};

    return DataModel;
}

async function fetchVoucherDetail(req, uniqueId) {
    const { mconfig } = req.body;
    const { client_id, api_key, baseurl } = mconfig;

    const api = createAxiosIntance({
        baseURL: baseurl,
        clientId: client_id,
        apiKey: api_key,
        tenantDB: req.tenantDB,
        getAuthContext: async () => req.body.mconfig
    });

    const response = await api.get(`TPA/M2/V1/GetVoucher?id=${uniqueId}`);

    const { DataModel, IsError, Message, ErrorCode } = response.data || {};

    return DataModel;
}

async function createOrUpdateProductFromDetail(tenantDB, companyId, tenantId, productDetail) {
    const {
        uniqueId,
        prdnm,
        prdalinm,
        grpnm,
        catnm,
        slabnm,
        hsncode,
        gstper,
        purrate,
        salrate,
        gstunt,
        minstk,
        ordlev,
    } = productDetail;

    const scope = {
        company_masters_id: companyId,
        a_application_login_id: tenantId,
    };

    const categoriesInstance = categoryModel(tenantDB);
    const product_groupsInstance = productGroupModel(tenantDB);
    const tax_mastersInstance = taxModel(tenantDB);
    const product_unit_mastersInstance = productUnitMasterModel(tenantDB);
    const productModelInstance = productModel(tenantDB);

    const [groupResult, taxSlab, unitResult] = await Promise.all([
        product_groupsInstance.findOrCreate({
            where: { group_name: grpnm, isDelete: "0" },
            defaults: { group_name: grpnm },
        }),
        tax_mastersInstance.findOne({
            where: { name: slabnm, isDelete: "0" },
        }),
        product_unit_mastersInstance.findOrCreate({
            where: { unit: gstunt, isDelete: "0" },
            defaults: { unit: gstunt },
        }),
    ]);

    const [group] = groupResult;
    const [unit] = unitResult;

    const [category, categoryCreated] = await categoriesInstance.findOrCreate({
        where: { category_name: catnm, isDelete: "0" },
        defaults: { category_name: catnm, group_id: group.id },
    });

    if (!categoryCreated && category.group_id !== group.id) {
        await category.update({ group_id: group.id });
    }

    const net_rate = salrate + ((salrate * gstper) / 100);
    const purchase_rate = purrate;

    const customFields = await extractMiracleCustomFields(tenantDB, companyId, 4, productDetail.ufddet);

    const productPayload = {
        ...scope,
        product_types: 5,
        product_name: prdnm,
        product_alias: prdalinm,
        category_id: category.id,
        product_group_id: group.id,
        gst_id: taxSlab?.id ?? 0,
        GST: gstper,
        unit: unit.unit,
        unit_id: unit.id,
        hsn_code: hsncode,
        purchase_rate,
        rate: salrate,
        net_rate,
        min_stock_quantity: minstk,
        max_stock_quantity: ordlev,
        miracle_UniqueId: uniqueId,
        miracle_update_date_time: new Date(),
        ...customFields,
    };

    const [product, created] = await productModelInstance.findOrCreate({
        where: { miracle_UniqueId: uniqueId, ...scope, isDelete: "0" },
        defaults: productPayload,
    });

    if (!created) {
        await product.update(productPayload);
    }

    return { product, created };
}

export async function handleProductAdd({ payload, context }) {
    const { UniqueId } = payload;
    const { tenantDB, companyId, tenantId } = context;
    const { req } = context;

    const productDetail = await fetchProductDetail(req, UniqueId);
    if (!productDetail) {
        throw new Error(`Product detail not found for UniqueId: ${UniqueId}`);
    }

    const { product, created } = await createOrUpdateProductFromDetail(tenantDB, companyId, tenantId, productDetail);

    return { UniqueId, productId: product.id, status: created ? "created" : "updated" };
}

export async function handleProductDelete({ payload, context }) {
    const { UniqueId } = payload;
    const { tenantDB, companyId } = context;

    if (!UniqueId) {
        throw new Error("Missing UniqueId in payload for Product Delete (PD)");
    }

    const productModelInstance = productModel(tenantDB);
    const product = await productModelInstance.findOne({
        where: { miracle_UniqueId: UniqueId, company_masters_id: companyId, isDelete: "0" },
    });

    if (!product) {
        return { UniqueId, status: "not_found", message: "Product not found or already deleted" };
    }

    // Safety Check: Check if product exists in active carts or price lists
    const cartItemModelInstance = cartItemModel(tenantDB);
    const priceListModelInstance = priceListModel(tenantDB);

    const productInCart = await cartItemModelInstance.findOne({
        where: { item_product_id: product.id, company_masters_id: companyId, isDelete: 0 },
    });

    const productInPriceList = await priceListModelInstance.findOne({
        where: { product_id: product.id, company_masters_id: companyId, isDelete: 0 },
    });

    if (productInCart || productInPriceList) {
        return {
            UniqueId,
            productId: product.id,
            status: "blocked",
            message: "Cannot delete product because it exists in active cart items or price list.",
        };
    }

    await product.update({ isDelete: 1 });

    return { UniqueId, productId: product.id, status: "deleted" };
}

async function createOrUpdateContactFromDetail(tenantDB, companyId, tenantId, contactDetail) {
    const {
        uniqueId,
        accnm,
        accalinm,
        gstin,
        addr
    } = contactDetail;

    const {
        conper1,
        conper2,
        addr1,
        addr2,
        citynm,
        pincode,
        areanm,
        statenm,
        mob1,
        email
    } = addr || {};

    let stateId = null;
    if (statenm) {
        const [stateObj] = await stateModel(tenantDB).findOrCreate({
            where: { state_name: statenm, isDelete: "0" },
            defaults: { state_name: statenm, country_id: 101 }
        });
        stateId = stateObj.id;
    }

    let cityId = null;
    if (citynm) {
        const [cityObj] = await cityModel(tenantDB).findOrCreate({
            where: { city_name: citynm, isDelete: "0" },
            defaults: { city_name: citynm, state_id: stateId, country_id: 101 }
        });
        cityId = cityObj.id;
    }

    let areaId = null;
    if (areanm) {
        const [areaObj] = await areaModel(tenantDB).findOrCreate({
            where: { area_name: areanm, isDelete: "0" },
            defaults: { area_name: areanm, city_id: cityId, state_id: stateId, country_id: 101 }
        });
        areaId = areaObj.id;
    }

    const customFields = await extractMiracleCustomFields(tenantDB, companyId, 1, contactDetail.ufddet);

    const contactPayload = {
        person_name: conper1 || conper2 || accnm || "",
        company_name: accnm || "",
        client_code: accalinm || "",
        mobile_number: mob1 || "",
        email_id: email || "",
        country: "101",
        state: stateId ? String(stateId) : "",
        city: cityId ? String(cityId) : "",
        area: areaId ? String(areaId) : "",
        pincode: pincode || "",
        address: addr1 || "",
        shipping_address: addr2 || "",
        gst_number: gstin || "",
        company_masters_id: companyId,
        a_application_login_id: tenantId,
        assinged_to_work_a_application_id: tenantId,
        source_type_id: -21,
        miracle_UniqueId: uniqueId,
        miracle_update_date_time: new Date(),
        isDelete: 0,
        isActive: 1,
        ...customFields,
    };

    const contactModelInstance = contactModel(tenantDB);
    const [contact, created] = await contactModelInstance.findOrCreate({
        where: { miracle_UniqueId: uniqueId, company_masters_id: companyId, isDelete: "0" },
        defaults: contactPayload
    });

    if (!created) {
        await contact.update(contactPayload);
    }

    return { contact, created };
}

export async function handleContactAddOrUpdate({ payload, context }) {
    const { UniqueId } = payload;
    const { tenantDB, companyId, tenantId } = context;
    const { req } = context;

    const contactDetail = await fetchContactDetail(req, UniqueId);
    if (!contactDetail) {
        throw new Error(`Contact detail not found for UniqueId: ${UniqueId}`);
    }

    const { contact, created } = await createOrUpdateContactFromDetail(tenantDB, companyId, tenantId, contactDetail);

    return { UniqueId, contactId: contact.id, status: created ? "created" : "updated" };
}

export async function handleContactDelete({ payload, context }) {
    const { UniqueId } = payload;
    const { tenantDB, companyId } = context;

    if (!UniqueId) {
        throw new Error("Missing UniqueId in payload for Contact Delete (AD)");
    }

    const contactModelInstance = contactModel(tenantDB);
    const contact = await contactModelInstance.findOne({
        where: { miracle_UniqueId: UniqueId, company_masters_id: companyId, isDelete: "0" },
    });

    if (!contact) {
        return { UniqueId, status: "not_found", message: "Contact not found or already deleted" };
    }

    // Safety Check: Verify if contact has active carts or inquiries
    const cartModelInstance = cartModel(tenantDB);
    const inquiryModelInstance = inquiryModel(tenantDB);

    const contactCart = await cartModelInstance.findOne({
        where: { to_customer_id: contact.id, company_masters_id: companyId, isDelete: 0 },
    });

    const contactInquiry = await inquiryModelInstance.findOne({
        where: { contact_master_id: contact.id, isDelete: 0 },
    });

    if (contactCart || contactInquiry) {
        return {
            UniqueId,
            contactId: contact.id,
            status: "blocked",
            message: "Cannot delete contact because it has active carts or inquiries.",
        };
    }

    await contact.update({ isDelete: 1 });

    return { UniqueId, contactId: contact.id, status: "deleted" };
}

export async function handleAccountTransactionAddOrUpdate({ voucherDetail, tenantDB, companyId, tenantId, req }) {
    const {
        uniqueId,
        voutyp,
        voudt,
        cheqdt,
        acc,
        oppacc,
        amount,
        narr
    } = voucherDetail;

    const contactModelInstance = contactModel(tenantDB);
    let customerId = null;

    if (acc) {
        let customer = await contactModelInstance.findOne({
            where: { miracle_UniqueId: acc, company_masters_id: companyId, isDelete: "0" }
        });

        if (!customer) {
            try {
                const contactDetail = await fetchContactDetail(req, acc);
                if (contactDetail) {
                    const res = await createOrUpdateContactFromDetail(tenantDB, companyId, tenantId, contactDetail);
                    customer = res.contact;
                }
            } catch (err) {
                console.error("Error fetching/creating contact dynamically in payment webhook:", err);
            }
        }

        if (customer) {
            customerId = customer.id;
        }
    }

    const paymentTypeModelInstance = paymentTypeModel(tenantDB);
    const targetTransactionType = (voutyp === "CP" || voutyp === "CR") ? 1 : 0;
    let paymentType = await paymentTypeModelInstance.findOne({
        where: {
            transaction_type: targetTransactionType,
            company_masters_id: companyId,
            isDelete: "0"
        }
    });

    if (!paymentType) {
        paymentType = await paymentTypeModelInstance.create({
            company_masters_id: companyId,
            a_application_login_id: tenantId,
            payment_type_name: targetTransactionType === 1 ? "Cash" : "Bank",
            transaction_type: targetTransactionType,
            isDelete: 0,
            isActive: 1
        });
    }

    const type = (voutyp === "BP" || voutyp === "CP") ? 2 : 1;
    const paymentDateTime = voudt || cheqdt || new Date();

    const transactionPayload = {
        contact_masters_id: customerId,
        a_application_login_id: tenantId,
        company_masters_id: companyId,
        type: type,
        mode: paymentType.id,
        amount: Number(amount || 0),
        payment_date_time: paymentDateTime,
        approve_date_time: paymentDateTime,
        created_date_time: paymentDateTime,
        remark: narr || "",
        approve_by_a_application_login_id: tenantId,
        miracle_account_ledger: oppacc || "",
        miracle_UniqueId: uniqueId,
        miracle_update_date_time: new Date(),
        isDelete: 0,
        isActive: 1
    };

    const accountTransactionsModelInstance = accountTransactionsModel(tenantDB);
    const [transaction, created] = await accountTransactionsModelInstance.findOrCreate({
        where: { miracle_UniqueId: uniqueId, company_masters_id: companyId, isDelete: "0" },
        defaults: transactionPayload
    });

    if (!created) {
        await transaction.update(transactionPayload);
    }

    return { UniqueId: uniqueId, transactionId: transaction.id, status: created ? "created" : "updated" };
}

export async function handleVoucherAddOrUpdate({ payload, context }) {
    const { UniqueId } = payload;
    const { tenantDB, companyId, tenantId } = context;
    const { req } = context;

    const voucherDetail = await fetchVoucherDetail(req, UniqueId);
    if (!voucherDetail) {
        throw new Error(`Voucher detail not found for UniqueId: ${UniqueId}`);
    }

    if (["BP", "BR", "CP", "CR"].includes(voucherDetail.voutyp)) {
        return handleAccountTransactionAddOrUpdate({ voucherDetail, tenantDB, companyId, tenantId, req });
    }

    const {
        uniqueId,
        voutyp,
        voudt,
        vouno,
        docdt,
        billno,
        acc,
        billamt,
        flgcd,
        narr,
        items,
        billdt,
        ufddet
    } = voucherDetail;

    const VOUCHER_TYPE_TO_CART_TYPE = {
        SS: 3, PP: 4, OS: 2, OP: 5, SR: 6, PR: 7, QS: 1, HS: 9, HP: 8
    };

    const cartType = VOUCHER_TYPE_TO_CART_TYPE[voutyp] || 0;
    const cartNumber = billno || vouno || "";
    const cartDate = billdt || voudt || docdt || null;
    const dueDate = ufddet?.U0000001 || null;

    let transactionMode = 0;
    if (flgcd === "C") {
        transactionMode = 1;
    } else if (flgcd === "D") {
        transactionMode = 2;
    }

    const contactModelInstance = contactModel(tenantDB);
    let customerId = null;
    let customerName = "";
    let customerEmail = "";
    let customerPhone = "";
    let customerCompanyName = "";
    let customerGstNumber = "";

    if (acc) {
        let customer = await contactModelInstance.findOne({
            where: { miracle_UniqueId: acc, company_masters_id: companyId, isDelete: "0" }
        });

        if (!customer) {
            try {
                const contactDetail = await fetchContactDetail(req, acc);
                if (contactDetail) {
                    const res = await createOrUpdateContactFromDetail(tenantDB, companyId, tenantId, contactDetail);
                    customer = res.contact;
                }
            } catch (err) {
                console.error("Error fetching/creating contact dynamically in voucher webhook:", err);
            }
        }

        if (customer) {
            customerId = customer.id;
            customerName = customer.person_name || "";
            customerEmail = customer.email_id || "";
            customerPhone = customer.mobile_number || "";
            customerCompanyName = customer.company_name || "";
            customerGstNumber = customer.gst_number || "";
        }
    }

    // Process items
    let totalQty = 0;
    let taxableAmt = 0;
    let totalGstAmt = 0;

    const cartItemModelInstance = cartItemModel(tenantDB);
    const productModelInstance = productModel(tenantDB);
    const categoryModelInstance = categoryModel(tenantDB);

    const cartItemsPayloads = [];

    if (items && Array.isArray(items)) {
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            let product = await productModelInstance.findOne({
                where: { miracle_UniqueId: item.prd, company_masters_id: companyId, isDelete: "0" }
            });

            if (!product) {
                try {
                    const productDetail = await fetchProductDetail(req, item.prd);
                    if (productDetail) {
                        const res = await createOrUpdateProductFromDetail(tenantDB, companyId, tenantId, productDetail);
                        product = res.product;
                    }
                } catch (err) {
                    console.error(`Error fetching/creating product ${item.prd} dynamically in voucher webhook:`, err);
                }
            }

            if (!product) {
                continue;
            }

            const itemQty = Number(item.qty1 || item.qty2 || item.qty3 || item.qty4 || item.qty5 || 0);
            const itemRate = Number(item.rate || 0);
            const amt = Number(item.amt) || (itemQty * itemRate);

            let itemTaxAmt = 0;
            let itemGst = 0;
            if (item.expdet && Array.isArray(item.expdet)) {
                item.expdet.forEach(exp => {
                    itemTaxAmt += Number(exp.expamt) || 0;
                    itemGst += Number(exp.expper) || 0;
                });
            }

            const itemTotal = Number(item.txpaidrt) || (amt + itemTaxAmt);
            const itemNetRate = itemQty > 0 ? (itemTotal / itemQty) : itemRate;

            let categoryName = "";
            if (product.category_id) {
                const category = await categoryModelInstance.findOne({
                    where: { id: product.category_id, isDelete: "0" }
                });
                categoryName = category?.category_name || "";
            }

            totalQty += itemQty;
            taxableAmt += amt;
            totalGstAmt += itemTaxAmt;

            let itemCustomFields = {};
            if (item.ufddet && typeof item.ufddet === "object") {
                itemCustomFields = await extractMiracleCustomFields(tenantDB, companyId, 4, item.ufddet, targetFormType);
            }

            cartItemsPayloads.push({
                ...itemCustomFields,
                cart_type: cartType,
                currency_id: 1,
                a_application_login_id: tenantId,
                company_masters_id: companyId,
                item_category_id: product.category_id,
                item_category_name: categoryName,
                item_product_id: product.id,
                item_product_name: product.product_name,
                item_unit_name: product.unit || "",
                item_rate: itemRate,
                item_gst: itemGst,
                item_net_rate: itemNetRate,
                item_qty: itemQty,
                item_total: itemTotal,
                item_hsn_code: product.hsn_code || "",
                cart_date: cartDate,
                cart_number: cartNumber,
                isDelete: 0,
                isActive: 1
            });
        }
    }

    const calculatedTotal = taxableAmt + totalGstAmt;
    const grandTotal = Number(billamt) || calculatedTotal;
    const roundOff = Number((grandTotal - calculatedTotal).toFixed(2));

    const CART_TYPE_TO_FORM_TYPE = {
        1: 5,  // Quotation -> form_type 5
        2: 6,  // Sales Order -> form_type 6
        3: 7,  // Sales Invoice -> form_type 7
        4: 8,  // Purchase Invoice -> form_type 8
        5: 9,  // Purchase Order -> form_type 9
        6: 10, // Return Sales Invoice -> form_type 10
        7: 11, // Return Purchase Invoice -> form_type 11
        8: 12, // Goods Received Note -> form_type 12
        9: 13  // Dispatch -> form_type 13
    };
    const targetFormType = CART_TYPE_TO_FORM_TYPE[cartType] || cartType;
    const customFields = await extractMiracleCustomFields(tenantDB, companyId, targetFormType, ufddet);

    const cartPayload = {
        type: cartType,
        cart_number: cartNumber,
        cart_date: cartDate,
        due_date: dueDate,
        company_masters_id: companyId,
        a_application_login_id: tenantId,
        to_customer_id: customerId,
        to_customer_name: customerName,
        to_customer_email: customerEmail,
        to_customer_phone: customerPhone,
        to_customer_company_name: customerCompanyName,
        to_customer_gst_number: customerGstNumber,
        transaction_mode: transactionMode,
        cart_remark: narr || "",
        total_amt: taxableAmt,
        total_qty: totalQty,
        taxable_amt: taxableAmt,
        gst_amt: totalGstAmt,
        round_off: roundOff,
        grand_total: grandTotal,
        miracle_UniqueId: uniqueId,
        miracle_update_date_time: new Date(),
        isDelete: 0,
        ...customFields,
        isActive: 1
    };

    const cartModelInstance = cartModel(tenantDB);
    const [cart, created] = await cartModelInstance.findOrCreate({
        where: { miracle_UniqueId: uniqueId, company_masters_id: companyId, isDelete: "0" },
        defaults: cartPayload
    });

    if (!created) {
        await cart.update(cartPayload);
    }

    // Soft delete existing items for this cart
    await cartItemModelInstance.update(
        { isDelete: 1 },
        { where: { cart_id: cart.id, isDelete: 0 } }
    );

    const itemsToCreate = cartItemsPayloads.map(item => ({
        ...item,
        cart_id: cart.id
    }));

    await cartItemModelInstance.bulkCreate(itemsToCreate);

    return { UniqueId, cartId: cart.id, status: created ? "created" : "updated" };
}

export async function handleVoucherDelete({ payload, context }) {
    const { UniqueId } = payload;
    const { tenantDB, companyId } = context;

    if (!UniqueId) {
        throw new Error("Missing UniqueId in payload for Voucher Delete (TD)");
    }

    let deletedCartId = null;
    let deletedTransactionId = null;

    // 1. Check in Carts & Cart Items (Invoices / Bills / Orders / Quotations, etc.)
    const cartModelInstance = cartModel(tenantDB);
    const cartItemModelInstance = cartItemModel(tenantDB);

    const cart = await cartModelInstance.findOne({
        where: { miracle_UniqueId: UniqueId, company_masters_id: companyId, isDelete: "0" },
    });

    if (cart) {
        await cart.update({ isDelete: 1 });
        await cartItemModelInstance.update(
            { isDelete: 1 },
            { where: { cart_id: cart.id, isDelete: 0 } }
        );
        deletedCartId = cart.id;
    }

    // 2. Check in Account Transactions (Cash / Bank Payments & Receipts)
    const accountTransactionsModelInstance = accountTransactionsModel(tenantDB);
    const transaction = await accountTransactionsModelInstance.findOne({
        where: { miracle_UniqueId: UniqueId, company_masters_id: companyId, isDelete: "0" },
    });

    if (transaction) {
        await transaction.update({ isDelete: 1 });
        deletedTransactionId = transaction.id;
    }

    if (!deletedCartId && !deletedTransactionId) {
        return { UniqueId, status: "not_found", message: "Voucher / Transaction not found or already deleted" };
    }

    return {
        UniqueId,
        cartId: deletedCartId,
        transactionId: deletedTransactionId,
        status: "deleted"
    };
}