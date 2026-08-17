import fs from "fs-extra";
import moment from "moment";
import path from "path";
import { Op } from "sequelize";
import { accountTransactionsModel } from "../../models/activities/accountTransactionsModel.js";
import { cartItemModel } from "../../models/activities/cartItemsModel.js";
import { cartModel } from "../../models/activities/cartsModel.js";
import { contactModel } from "../../models/activities/contactModel.js";
import { paymentTypeModel } from "../../models/activities/paymentTypeModel.js";
import companyModel from "../../models/company_setup/companyModel.js";
import miracleConfigModel from "../../models/company_setup/miracleConfigModel.js";
import { areaModel } from "../../models/masters/areaModel.js";
import { cityModel } from "../../models/masters/cityModel.js";
import { stateModel } from "../../models/masters/stateModel.js";
import { categoryModel } from "../../models/product_settings/categoryModel.js";
import { productGroupModel } from "../../models/product_settings/productGroupModel.js";
import { productModel } from "../../models/product_settings/productModel.js";
import { productUnitMasterModel } from "../../models/product_settings/productUnitMasterModel.js";
import { taxModel } from "../../models/product_settings/taxModel.js";
import { customFieldFormModel } from "../../models/other_settings/customFieldFormModel.js";
import { MIRACLE_LEDGER_PDF } from "../../utils/appConstants.js";
import { createAxiosIntance } from "../../utils/miracleAxiosInstance.js";
import { cleanHtmlText, parseMiracleRights } from "../../utils/miracleRightsHelper.js";
import { getFinancialYearRangeWise, isValid, resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../commonServices.js";
import { insertMiracleLog } from "../activities/miracleLogService.js";

export const getMiracleUfdDet = async (tenantDB, companyId, formType, entityData) => {
    try {
        if (!tenantDB || !companyId || !formType || !entityData) return {};
        const CFFModel = customFieldFormModel(tenantDB);
        let customFields = await CFFModel.findAll({
            where: {
                isDelete: 0,
                company_masters_id: companyId,
                third_party_field_name: { [Op.ne]: null }
            },
            attributes: ["reference_column_name", "third_party_field_name", "applicable_modules", "form_type", "data_type"],
            raw: true
        });

        customFields = customFields.filter(f => {
            if (Number(f.form_type) === Number(formType)) return true;
            if (f.applicable_modules && f.applicable_modules !== "") {
                const mods = String(f.applicable_modules).split(",").map(m => m.trim());
                return mods.includes(String(formType));
            }
            return false;
        });

        const ufddet = {};
        for (const field of customFields) {
            const key = field.third_party_field_name ? String(field.third_party_field_name).trim() : "";
            const col = field.reference_column_name;
            if (key && col && entityData[col] !== undefined && entityData[col] !== null && entityData[col] !== "") {
                const val = String(entityData[col]).trim();
                const dataType = Number(field.data_type);
                if ((dataType === 4 || dataType === 5) && (val === "0000-00-00" || val === "0000-00-00 00:00:00" || val.startsWith("0000-00-00"))) {
                    continue;
                }
                ufddet[key] = val;
            }
        }
        return ufddet;
    } catch (err) {
        console.error("Error building Miracle ufddet:", err);
        return {};
    }
};

export const syncProduct = async (req) => {
    try {
        const { item_id, mconfig } = req.body;
        const { client_id, api_key, baseurl } = mconfig;
        const productModelInstance = productModel(req.tenantDB);
        const taxModelInstance = taxModel(req.tenantDB);
        const categoryModelInstance = categoryModel(req.tenantDB);
        const productGroupModelInstance = productGroupModel(req.tenantDB);
        const getProductDb = await productModelInstance.findOne({ where: { isDelete: 0, id: item_id }, raw: true });
        if (!getProductDb) {
            return resError({
                ack_msg: "Product detail not found",
            });
        }

        const rights = parseMiracleRights(mconfig?.rights_config);
        if (rights.sync_miracle?.enabled === false) {
            return resError({ ack_msg: "Miracle Sync is disabled in Miracle Configurations for this company" });
        }

        const productAction = getProductDb.miracle_UniqueId ? "update" : "add";
        if (rights.sync_miracle?.product?.[productAction] === false) {
            return resError({ ack_msg: `Miracle Sync permission denied for product.${productAction}` });
        }
        const gstCommodity = getProductDb.gst_id ? await taxModelInstance.findOne({ where: { isDelete: 0, id: getProductDb.gst_id }, attributes: ["name"], raw: true }) : "";

        const category_name_db = getProductDb.category_id ? await categoryModelInstance.findOne({ where: { isDelete: 0, id: getProductDb.category_id }, attributes: ["category_name"], raw: true }) : "";

        const group_name_db = getProductDb.product_group_id ? await productGroupModelInstance.findOne({ where: { isDelete: 0, id: getProductDb.product_group_id }, attributes: ["group_name"], raw: true }) : "";

        let gst_ = gstCommodity ? gstCommodity.name : "";
        let category_name = category_name_db ? category_name_db.category_name : "";
        let group_name = group_name_db ? group_name_db.group_name : "";

        const company_id = mconfig?.company_id || getProductDb.company_masters_id;
        let isStkReq = "n";

        if (company_id) {
            const companyMaster = await companyModel.findOne({
                where: { isDelete: 0, id: company_id },
                raw: true,
                attributes: ["is_strict_check_product_stock"]
            });
            if (Number(companyMaster?.is_strict_check_product_stock) === 2) {
                isStkReq = "y";
            }
        }

        const payload = {
            action: "A",
            prdnm: getProductDb.product_name,
            prdalinm: getProductDb.product_code,
            commnm: gst_,
            catnm: category_name,
            grpnm: group_name,
            slabnm: gst_,
            uomnm: getProductDb.miracle_uom_name || "U1",
            hsncode: getProductDb.hsn_code,
            gstper: +getProductDb.GST?.toFixed(2),
            purrate: +getProductDb.purchase_rate?.toFixed(2),
            salrate: +getProductDb.net_rate.toFixed(2),
            purunt: getProductDb.unit,
            salunt: getProductDb.unit,
            gstunt: getProductDb.unit,
            minstk: getProductDb.min_stock_quantity,
            ordlev: getProductDb.max_stock_quantity,
            prdstp: {
                "isbatchstk": "",
                "isstkreq": isStkReq,
                "islocstk": "",
                "ispricelist": ""
            }
        };

        if (getProductDb.miracle_UniqueId) {
            payload.action = "E";
            payload.uniqueId = getProductDb.miracle_UniqueId;
            delete payload['commnm'];
            delete payload['hsncode'];
            delete payload['gstper'];
            delete payload['prdstp'];
        }

        const customUfddet = await getMiracleUfdDet(req.tenantDB, company_id, 4, getProductDb);
        if (Object.keys(customUfddet).length > 0) {
            payload.ufddet = customUfddet;
        }

        const api = createAxiosIntance({
            baseURL: baseurl,
            clientId: client_id,
            apiKey: api_key,
            tenantDB: req.tenantDB,
            companyId: company_id,
            getAuthContext: async () => req.body.mconfig
        });

        const response = await api.post('TPA/M2/V1/Product', payload);
        const { UniqueId, IsError, Message, ErrorCode } = response.data || {};

        if (IsError) {
            if (ErrorCode == 'U0001' || Message == 'Product Name already exist, Enter Another Name.') {
                const response = await api.post('TPA/M2/V1/ProductLedger', {
                    "rptfield": ["prdid"],
                    "rptfilter": {
                        "prdnm": [getProductDb.product_name]
                    }
                });
                const { Data, IsError, Message, ErrorCode, TotalRecords } = response.data || {};
                if (!IsError && TotalRecords) {
                    await productModelInstance.update(
                        {
                            miracle_UniqueId: Data[0]['prdid'],
                            miracle_update_date_time: moment().format("YYYY-MM-DD HH:mm:ss")
                        },
                        {
                            where: { isDelete: 0, id: item_id }
                        }
                    );

                    return resSuccess({
                        ack_msg: Message,
                        data: { UniqueId: Data[0]['prdid'] }
                    });

                }

            }
            return resBadRequest({
                ack_msg: Message,
                developer_msg: ErrorCode ? `Error Code: ${ErrorCode}` : Message,
            });
        }

        if (UniqueId) {
            await productModelInstance.update(
                {
                    miracle_UniqueId: UniqueId,
                    miracle_update_date_time: moment().format("YYYY-MM-DD HH:mm:ss")
                },
                {
                    where: { isDelete: 0, id: item_id }
                }
            );
        }

        return resSuccess({
            ack_msg: Message,
            data: { UniqueId }
        });

    } catch (error) {
        console.log("syncProduct Error", error);

        // --- DYNAMIC ERROR HANDLING ---
        const apiErrorMessage = error.response?.data?.Message || error.message;
        const apiErrorCode = error.response?.data?.ErrorCode || null;

        return resBadRequest({
            ack_msg: apiErrorMessage,
            developer_msg: apiErrorCode ? `Error Code: ${apiErrorCode}` : error.message
        });
    }
};

export const syncInvoice = async (req) => {
    try {
        let { cart_id, mconfig } = req.body;
        const { client_id, api_key, baseurl } = mconfig;

        if (!cart_id) {
            return resError({ ack_msg: "cart_id is required" });
        }

        const rights = parseMiracleRights(mconfig?.rights_config);
        if (rights.sync_miracle?.enabled === false) {
            return resError({ ack_msg: "Miracle Sync is disabled in Miracle Configurations for this company" });
        }

        let cartIds = [];

        if (Array.isArray(cart_id)) {
            cartIds = cart_id;
        } else if (typeof cart_id === "string") {
            cartIds = cart_id.split(",").map(id => Number(id.trim())).filter(Boolean);
        } else {
            cartIds = [Number(cart_id)];
        }

        const cartModelInstance = cartModel(req.tenantDB);
        const cartItemModelInstance = cartItemModel(req.tenantDB);
        const productModelInstance = productModel(req.tenantDB);
        const contactModelInstance = contactModel(req.tenantDB);
        const accountTransactionsModelInstance = accountTransactionsModel(req.tenantDB);

        const results = [];
        const successfulCartIds = []; // OPTIMIZATION: Track successful cart IDs directly

        const reqCompanyId = req.body.mconfig?.company_id || req.user?.company_id || null;

        const api = createAxiosIntance({
            baseURL: baseurl,
            clientId: client_id,
            apiKey: api_key,
            tenantDB: req.tenantDB,
            companyId: reqCompanyId,
            getAuthContext: async () => req.body.mconfig
        });

        const companyCache = new Map();
        const contactCache = new Map();

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

        const CART_TYPE_TO_FORM_TYPE = {
            1: 5,  // Quotation -> form_type 5
            2: 6,  // Sales Order -> form_type 6
            3: 7,  // Sales Invoice -> form_type 7
            4: 8,  // Purchase Invoice -> form_type 8
            5: 9,  // Purchase Order -> form_type 9
            6: 10, // Return Sales Invoice -> form_type 10
            7: 11, // Return Purchase Invoice -> form_type 11
            8: 12, // Goods Received Note (Inward) -> form_type 12
            9: 13  // Dispatch -> form_type 13
        };

        for (const singleCartId of cartIds) {
            try {
                // Get cart
                const getCart = await cartModelInstance.findOne({
                    where: { isDelete: 0, id: singleCartId },
                    raw: true
                });

                if (!getCart) {
                    results.push({ cart_id: singleCartId, status: "fail", msg: "Cart not found" });
                    continue;
                }

                const targetFormType = CART_TYPE_TO_FORM_TYPE[getCart.type] || getCart.type;
                const targetModule = CART_TYPE_TO_MODULE[getCart.type] || "invoice";
                const targetAction = getCart.miracle_UniqueId ? "update" : "add";

                if (rights.sync_miracle?.[targetModule]?.[targetAction] === false) {
                    results.push({
                        cart_id: singleCartId,
                        status: "fail",
                        msg: `Miracle Sync permission denied for ${targetModule}.${targetAction}`
                    });
                    continue;
                }

                // Get items
                const getCartItem = await cartItemModelInstance.findAll({
                    where: { isDelete: 0, cart_id: singleCartId },
                    raw: true
                });

                if (!getCartItem.length) {
                    results.push({ cart_id: singleCartId, status: "fail", msg: "Cart items not found" });
                    continue;
                }

                const productIds = [...new Set(getCartItem.map(i => i.item_product_id))];

                const products = await productModelInstance.findAll({
                    where: {
                        isDelete: 0,
                        id: productIds,
                        miracle_UniqueId: { [Op.ne]: '' }
                    },
                    raw: true
                });

                const productMap = new Map(products.map(p => [p.id, p]));

                // Contact & Company Details (using request-level cache for bulk syncs)
                let getContactDetail = contactCache.get(getCart.to_customer_id);
                if (!getContactDetail) {
                    getContactDetail = await contactModelInstance.findOne({
                        where: { isDelete: 0, id: getCart.to_customer_id },
                        raw: true,
                        attributes: ["miracle_UniqueId", "id", "state", "gst_number"]
                    });
                    if (getContactDetail) {
                        contactCache.set(getCart.to_customer_id, getContactDetail);
                    }
                }

                if (!getContactDetail) {
                    results.push({ cart_id: singleCartId, status: "fail", msg: "Contact not found" });
                    continue;
                }

                const company_id = getCart.company_masters_id || req.body.mconfig?.company_id;
                let companyMaster = null;
                if (company_id) {
                    if (!companyCache.has(company_id)) {
                        const cm = await companyModel.findOne({
                            where: { isDelete: 0, id: company_id },
                            raw: true,
                            attributes: ["gst_number", "state_id"]
                        });
                        companyCache.set(company_id, cm);
                    }
                    companyMaster = companyCache.get(company_id);
                }

                const companyGst = companyMaster?.gst_number ? String(companyMaster.gst_number).trim() : "";
                const customerGst = getContactDetail?.gst_number ? String(getContactDetail.gst_number).trim() : "";
                const taxTypeFlag = (companyGst.length > 0 && customerGst.length > 0) ? "T" : "O";

                const companyStateId = companyMaster?.state_id ? String(companyMaster.state_id) : "";
                const contactStateId = getContactDetail?.state ? String(getContactDetail.state) : "";
                const isSameState = (companyStateId && contactStateId) ? (companyStateId === contactStateId) : true;

                let acc_id = getContactDetail.miracle_UniqueId;

                if (!isValid(acc_id)) {
                    req.body.contact_id = getContactDetail.id;

                    if ([1, 2, 3, 9, 6].includes(getCart.type)) {
                        req.body.group_name = "Sundry Debtors";
                    } else if ([4, 5, 7, 8].includes(getCart.type)) {
                        req.body.group_name = "Sundry Creditors";
                    }

                    const res = await syncContact(req);

                    if (res?.ack === 1) {
                        acc_id = res.data.UniqueId;
                        if (getContactDetail) {
                            getContactDetail.miracle_UniqueId = acc_id;
                            contactCache.set(getContactDetail.id, getContactDetail);
                        }
                    } else {
                        results.push({ cart_id: singleCartId, status: "fail", msg: res?.ack_msg || "Contact Sync failed" });
                        continue;
                    }
                }

                // Items
                const CFFModel = customFieldFormModel(req.tenantDB);
                let itemCustomFields = await CFFModel.findAll({
                    where: {
                        isDelete: 0,
                        company_masters_id: company_id,
                        form_type: 4,
                        third_party_field_name: { [Op.ne]: null }
                    },
                    attributes: ["reference_column_name", "third_party_field_name", "applicable_modules", "data_type"],
                    raw: true
                });

                itemCustomFields = itemCustomFields.filter(f => {
                    if (!f.applicable_modules) return true;
                    const mods = String(f.applicable_modules).split(",").map(m => m.trim());
                    return mods.includes(String(targetFormType));
                });

                const items = [];

                for (let index = 0; index < getCartItem.length; index++) {
                    const item = getCartItem[index];
                    let product = productMap.get(item.item_product_id);
                    let PRD = product?.miracle_UniqueId;
                    if (!product?.miracle_UniqueId) {
                        req.body.item_id = item.item_product_id;
                        const productMir = await syncProduct(req);
                        if (productMir?.ack != 1) {
                            throw new Error(`Product not synced: ${item.item_product_name}`);
                        }
                        PRD = productMir?.data?.UniqueId
                    }

                    const total = Number(item.item_total) || 0;
                    const gst = Number(item.item_gst) || 0;
                    const qty = Number(item.item_qty) || 0;
                    const rate = Number(item.item_rate) || 0;
                    const item_net_rate = Number(item.item_net_rate) || 0;

                    const gst_amount = (total * gst) / 100;
                    // const taxable_amount = total + gst_amount;
                    const taxable_amount = total;

                    let itemExpdet = [];
                    if (gst > 0) {
                        if (isSameState) {
                            itemExpdet = [
                                {
                                    expnm: "Central Tax",
                                    expper: Number((gst / 2).toFixed(1)),
                                    expamt: Number((gst_amount / 2).toFixed(1)),
                                },
                                {
                                    expnm: "State/UT Tax",
                                    expper: Number((gst / 2).toFixed(1)),
                                    expamt: Number((gst_amount / 2).toFixed(1)),
                                },
                            ];
                        } else {
                            itemExpdet = [
                                {
                                    expnm: "Integrated Tax",
                                    expper: Number(gst.toFixed(1)),
                                    expamt: Number(gst_amount.toFixed(1)),
                                },
                            ];
                        }
                    }

                    const itemUfddet = {};
                    for (const field of itemCustomFields) {
                        const key = field.third_party_field_name ? String(field.third_party_field_name).trim() : "";
                        const col = field.reference_column_name;
                        if (key && col && item[col] !== undefined && item[col] !== null && item[col] !== "") {
                            const val = String(item[col]).trim();
                            const dataType = Number(field.data_type);
                            if ((dataType === 4 || dataType === 5) && (val === "0000-00-00" || val === "0000-00-00 00:00:00" || val.startsWith("0000-00-00"))) {
                                continue;
                            }
                            itemUfddet[key] = val;
                        }
                    }

                    const itemPayload = {
                        prd: PRD,
                        seqno: index + 1,
                        qty1: Number(qty.toFixed(1)),
                        rate: Number(rate.toFixed(1)),
                        txpaidrt: Number(item_net_rate.toFixed(1)),
                        amt: Number(taxable_amount.toFixed(1)),
                        expdet: itemExpdet,
                    };

                    if (Object.keys(itemUfddet).length > 0) {
                        itemPayload.ufddet = itemUfddet;
                    }

                    items.push(itemPayload);
                }

                const voucherType = {
                    3: "SS", 4: "PP", 2: "OS", 5: "OP", 6: "SR",
                    7: "PR", 1: "QS", 9: "HS", 8: "HP",
                };

                const customUfddet = await getMiracleUfdDet(req.tenantDB, company_id, targetFormType, getCart);
                const ufddetHeaderObj = {
                    ...customUfddet
                };

                const payload = {
                    action: getCart.miracle_UniqueId ? "E" : "A",
                    uniqueId: getCart.miracle_UniqueId || undefined,
                    voutyp: voucherType[getCart.type],
                    billamt: Number(getCart.grand_total || 0),
                    narr: cleanHtmlText(getCart.cart_remark || ""),
                    items,
                    expdet: Number(getCart.round_off || 0) !== 0
                        ? [{ expnm: "Round Off", expper: 0, expamt: Number(Number(getCart.round_off).toFixed(2)) }]
                        : []
                };

                if (Object.keys(ufddetHeaderObj).length > 0) {
                    payload.ufddet = ufddetHeaderObj;
                }

                if (getCart.transaction_mode == 1) { // cash
                    payload.cpacc = acc_id;
                }

                // Voucher type specific required fields per Miracle API specification:
                const cartDate = getCart.cart_date || "";
                const cartNum = getCart.cart_number || "";
                let orgBillDt = cartDate;
                let orgBillNo = getCart.referance_cart_name || cartNum;

                if (getCart.type === 6 && isValid(getCart.referance_cart_id)) {
                    let refCart = await cartModelInstance.findOne({
                        where: { isDelete: 0, id: getCart.referance_cart_id },
                        raw: true
                    });

                    if (refCart) {
                        if (!isValid(refCart.miracle_UniqueId)) {
                            const refSyncRes = await syncInvoice({
                                ...req,
                                body: { ...req.body, cart_id: getCart.referance_cart_id }
                            });

                            if (refSyncRes?.ack !== 1) {
                                results.push({
                                    cart_id: singleCartId,
                                    status: "fail",
                                    msg: `Referenced Invoice #${getCart.referance_cart_id} sync failed: ${refSyncRes?.ack_msg || "Unknown error"}`
                                });
                                continue;
                            }

                            refCart = await cartModelInstance.findOne({
                                where: { isDelete: 0, id: getCart.referance_cart_id },
                                raw: true
                            });
                        }

                        if (refCart) {
                            orgBillDt = refCart.cart_date || orgBillDt;
                            orgBillNo = refCart.cart_number || orgBillNo;
                        }
                    }
                }

                const transactionAcc = getCart.transaction_mode == 1 ? getCart.miracle_account_legder : acc_id;
                const transactionModeFlag = getCart.transaction_mode == 1 ? "C" : getCart.transaction_mode == 2 ? "D" : "";
                const invTyp = isSameState ? "GST" : "IGST";
                const taxtyp = taxTypeFlag;

                if (getCart.type === 1) { // QS - Quotation
                    payload.flgcd = transactionModeFlag;
                    payload.acc = transactionAcc;
                    payload.quotdt = cartDate;
                    payload.quotno = cartNum;
                    payload.invtyp = invTyp;
                } else if (getCart.type === 2) { // OS - Sales Order
                    payload.flgcd = transactionModeFlag;
                    payload.acc = transactionAcc;
                    payload.orddt = cartDate;
                    payload.ordno = cartNum;
                    payload.invtyp = invTyp;
                } else if (getCart.type === 3) { // SS - Sales Invoice
                    payload.flgcd = transactionModeFlag;
                    payload.acc = transactionAcc;
                    payload.billdt = cartDate;
                    payload.billno = cartNum;
                    payload.invtyp = invTyp;
                    payload.taxtyp = taxtyp;
                } else if (getCart.type === 4) { // PP - Purchase Invoice
                    payload.flgcd = transactionModeFlag;
                    payload.acc = transactionAcc;
                    payload.voudt = cartDate;
                    payload.vouno = cartNum;
                    payload.invtyp = invTyp;
                    payload.taxtyp = taxtyp;
                } else if (getCart.type === 5) { // OP - Purchase Order
                    payload.flgcd = transactionModeFlag;
                    payload.acc = transactionAcc;
                    payload.orddt = cartDate;
                    payload.invtyp = invTyp;
                } else if (getCart.type === 6) { // SR - Sales Return
                    payload.flgcd = transactionModeFlag;
                    payload.billdt = cartDate;
                    payload.acc = transactionAcc;
                    payload.billno = cartNum;
                    payload.orgbilldt = orgBillDt;
                    payload.orgbillno = orgBillNo;
                    payload.invtyp = invTyp;
                    payload.taxtyp = taxtyp;
                } else if (getCart.type === 7) { // PR - Purchase Return
                    payload.flgcd = transactionModeFlag;
                    payload.voudt = cartDate;
                    payload.acc = transactionAcc;
                    payload.vouno = cartNum;
                    payload.invtyp = invTyp;
                    payload.taxtyp = taxtyp;
                } else if (getCart.type === 8) { // HP - Inward Challan
                    payload.flgcd = transactionModeFlag;
                    payload.acc = transactionAcc;
                    payload.voudt = cartDate;
                    payload.invtyp = invTyp;
                    payload.taxtyp = taxtyp;
                } else if (getCart.type === 9) { // HS - Dispatch Challan
                    payload.flgcd = transactionModeFlag;
                    payload.acc = transactionAcc;
                    payload.chdt = cartDate;
                    payload.chno = cartNum;
                    payload.invtyp = invTyp;
                    payload.taxtyp = taxtyp;
                }

                const response = await api.post('TPA/M2/V1/Voucher', payload);
                const { UniqueId, IsError, Message, ErrorCode } = response.data || {};

                if (IsError) {
                    results.push({ cart_id: singleCartId, status: "fail", msg: Message, errorCode: ErrorCode });
                    continue;
                }

                if (UniqueId) {
                    // OPTIMIZATION: directly push the original ID so we don't need a DB lookup later
                    successfulCartIds.push(singleCartId);

                    await cartModelInstance.update(
                        {
                            miracle_UniqueId: UniqueId,
                            miracle_update_date_time: moment.utc().format("YYYY-MM-DD HH:mm:ss")
                        },
                        {
                            where: { isDelete: 0, id: singleCartId }
                        }
                    );
                }

                results.push({ cart_id: singleCartId, status: "success", msg: Message });

            } catch (err) {
                const apiErrorMessage = err.response?.data?.Message || err.message;
                const apiErrorCode = err.response?.data?.ErrorCode || null;

                results.push({
                    cart_id: singleCartId,
                    status: "error",
                    msg: apiErrorMessage,
                    errorCode: apiErrorCode
                });
            }
        }

        // --- ACCOUNT TRANSACTIONS SYNC TRIGGER ---
        // Only run this if we actually had carts successfully sync
        if (successfulCartIds.length > 0) {
            const accountIdsFetch = await accountTransactionsModelInstance.findAll({
                where: { isDelete: 0, amount_type: 1, reference_table: "carts", reference_id: { [Op.in]: successfulCartIds } },
                raw: true
            });

            const accountIdsList = accountIdsFetch.map(v => v.id).join(",");

            // GUARD: Only call syncCaseBankPr if there are account IDs to sync
            if (accountIdsList) {
                req.body.acc_id = accountIdsList;
                await syncCaseBankPr(req);
            }
        }

        // --- DYNAMIC RESPONSE HANDLING ---
        if (cartIds.length === 1) {
            const singleResult = results[0];

            if (singleResult.status === "success") {
                return resSuccess({
                    ack_msg: singleResult.msg,
                    data: results
                });
            } else {
                return resBadRequest({
                    ack_msg: singleResult.msg,
                    developer_msg: `Error Code: ${singleResult.errorCode || 'N/A'}`,
                    data: results
                });
            }
        }

        return resSuccess({
            ack_msg: "Bulk sync completed. Please check data for details.",
            data: results
        });

    } catch (error) {
        console.error("syncInvoice Error", error);

        return resBadRequest({
            ack_msg: error.message,
            developer_msg: error.message
        });
    }
};

export const syncContact = async (req) => {
    try {
        const { contact_id, group_name, mconfig } = req.body;
        const { client_id, api_key, baseurl } = mconfig;

        if (!isValid(contact_id)) {
            return resError({ ack_msg: "contact_id is required" });
        }

        const contactModelInstance = contactModel(req.tenantDB);

        const getContactDetail = await contactModelInstance.findOne({ where: { isDelete: 0, id: contact_id }, raw: true });

        if (!getContactDetail) {
            return resError({ ack_msg: "Contact detail not found" });
        }

        const rights = parseMiracleRights(mconfig?.rights_config);
        if (rights.sync_miracle?.enabled === false) {
            return resError({ ack_msg: "Miracle Sync is disabled in Miracle Configurations for this company" });
        }

        const contactAction = getContactDetail.miracle_UniqueId ? "update" : "add";
        if (rights.sync_miracle?.contact?.[contactAction] === false) {
            return resError({ ack_msg: `Miracle Sync permission denied for contact.${contactAction}` });
        }

        // let contact_name = getContactDetail.company_name ? getContactDetail.company_name + '-' + getContactDetail.person_name : getContactDetail.person_name;
        let contact_name = (getContactDetail.company_name + " - " + getContactDetail.mobile_number);

        let city_name = "";
        let area_name = "";
        let state_name = "";

        if (getContactDetail.city) {
            const cityModelInstance = cityModel(req.tenantDB);
            const cityDb = await cityModelInstance.findOne({ where: { isDelete: 0, id: getContactDetail.city }, raw: true, attributes: ["city_name"] });
            city_name = cityDb?.city_name || "";
        }

        if (getContactDetail.area) {
            const areaModelInstance = areaModel(req.tenantDB);
            const areaDb = await areaModelInstance.findOne({ where: { isDelete: 0, id: getContactDetail.area }, raw: true, attributes: ["area_name"] });
            // FIXED: was areaDb.city_name
            area_name = areaDb?.area_name || "";
        }

        if (getContactDetail.state) {
            const stateModelInstance = stateModel(req.tenantDB);
            const stateDb = await stateModelInstance.findOne({ where: { isDelete: 0, id: getContactDetail.state }, raw: true, attributes: ["state_name"] });
            state_name = stateDb?.state_name || "";
        }

        if (!getContactDetail.client_code || !String(getContactDetail.client_code).trim()) {
            return resError({ ack_msg: `Client code does not exist for contact '${contact_name || "Detail"}'. Please enter a valid client code before syncing to Miracle.` });
        }

        if (!state_name || !state_name.trim()) {
            return resError({ ack_msg: `State is required for contact '${contact_name || "Detail"}'. Please select a valid state.` });
        }

        const hasGstin = Boolean(getContactDetail.gst_number && String(getContactDetail.gst_number).trim().length === 15);
        const regType = getContactDetail.gst_reg_type || (hasGstin ? "Regular" : "Unregistered");
        const regAppDate = getContactDetail.gst_reg_date || "2017-07-01";

        const company_id_contact = getContactDetail.company_masters_id || req.body.mconfig?.company_id;
        const customUfddetContact = await getMiracleUfdDet(req.tenantDB, company_id_contact, 1, getContactDetail);

        const payload = {
            "accnm": contact_name,
            "action": getContactDetail.miracle_UniqueId ? "E" : "A",
            "uniqueId": getContactDetail.miracle_UniqueId || undefined,
            "accalinm": getContactDetail.client_code,
            "accgrpnm": group_name ? group_name : "Sundry Debtors",
            "gstin": getContactDetail.gst_number || ""
        };

        if (Object.keys(customUfddetContact).length > 0) {
            payload.ufddet = customUfddetContact;
        }

        payload.addr = {
            "addr1": cleanHtmlText(getContactDetail.address || ""),
            "addr2": cleanHtmlText(getContactDetail.shipping_address || ""),
            "citynm": city_name,
            "pincode": getContactDetail.pincode,
            "areanm": area_name,
            "statenm": state_name.trim(),
            "mob1": getContactDetail.mobile_number,
            "email": getContactDetail.email_id,
        };

        payload.regtypedet = [
            {
                "regtype": regType,
                "regappdt": regAppDate
            }
        ];

        // API call
        const api = createAxiosIntance({
            baseURL: baseurl,
            clientId: client_id,
            apiKey: api_key,
            tenantDB: req.tenantDB,
            companyId: company_id_contact,
            getAuthContext: async () => req.body.mconfig
        });

        const response = await api.post('TPA/M2/V1/Account', payload);
        // Include ErrorCode here in case API returns 200 OK but IsError is true
        const { UniqueId, IsError, Message, ErrorCode } = response.data || {};

        if (IsError) {

            if (Message == 'Alias Name already Exist.' || Message == 'Account Name already exist.Enter another name.') {
                const response = await api.post('TPA/M2/V1/AccountLedger', {
                    "rptfield": ["accid"],
                    "rptfilter": {
                        "accgrpnm": ["Sundry Debtors", "Sundry Creditors"],
                        "accalinm": [getContactDetail.client_code]
                    }
                });
                const { Data, TotalRecords, IsError, Message } = response.data || {};
                if (!IsError && TotalRecords) {
                    await contactModelInstance.update(
                        {
                            miracle_UniqueId: Data[0]['accid'],
                            miracle_update_date_time: moment.utc().format("YYYY-MM-DD HH:mm:ss")
                        },
                        {
                            where: { isDelete: 0, id: contact_id }
                        }
                    );
                    return resSuccess({ ack_msg: Message, data: { UniqueId: Data[0]['accid'] } });
                }
            }
            return resError({
                ack_msg: Message,
                developer_msg: ErrorCode ? `Error Code: ${ErrorCode}` : "API returned IsError: true"
            });
        }

        if (UniqueId) {
            await contactModelInstance.update(
                {
                    miracle_UniqueId: UniqueId,
                    miracle_update_date_time: moment.utc().format("YYYY-MM-DD HH:mm:ss")
                },
                {
                    where: { isDelete: 0, id: contact_id }
                }
            );
        }

        return resSuccess({ ack_msg: Message, data: { UniqueId } });

    } catch (error) {
        console.log("syncContact Error", error);

        // --- DYNAMIC ERROR HANDLING ---
        // Extract Axios API error message if available, otherwise fallback to standard error message
        const apiErrorMessage = error.response?.data?.Message || error.message;
        const apiErrorCode = error.response?.data?.ErrorCode || null;

        return resBadRequest({
            ack_msg: apiErrorMessage,
            developer_msg: apiErrorCode ? `Error Code: ${apiErrorCode}` : error.message
        });
    }
}

export const generateLedger = async (req) => {
    try {
        const { contact_id, mconfig } = req.body;
        const { client_id, api_key, baseurl, company_id } = mconfig;

        if (!isValid(contact_id)) {
            return resError({ ack_msg: "contact_id is required" });
        }

        const contactModelInstance = contactModel(req.tenantDB);
        const getContactDetail = await contactModelInstance.findOne({ where: { isDelete: 0, id: contact_id }, raw: true });

        if (!getContactDetail) {
            return resError({ ack_msg: "Contact detail not found" });
        }

        const formattedDateTime = moment(new Date()).format("YYYY-MM-DD");
        const financialYear = getFinancialYearRangeWise(formattedDateTime);
        const start_date = financialYear?.start_date || null;
        const end_date = financialYear?.end_date || null;

        const payload = {
            "rptType": "RPT001",
            "uniqueId": getContactDetail.miracle_UniqueId,
            "fromDate": start_date,
            "toDate": end_date
        }

        // API call
        const api = createAxiosIntance({
            baseURL: baseurl,
            clientId: client_id,
            apiKey: api_key,
            tenantDB: req.tenantDB,
            getAuthContext: async () => req.body.mconfig
        });

        const response = await api.post('tpa/M2/V1/GenerateFile', payload);

        // Include ErrorCode in destructuring
        const { IsError, Message, DataModel, FileName, ErrorCode } = response.data || {};

        if (IsError) {
            return resBadRequest({
                ack_msg: Message,
                developer_msg: ErrorCode ? `Error Code: ${ErrorCode}` : Message
            });
        }

        const { fileName, filePath } = await base64ToPdf(DataModel, FileName, company_id)

        return resSuccess({
            ack_msg: Message,
            data: { fileName, filePath, url: `${MIRACLE_LEDGER_PDF}/${company_id}/${fileName}` }
        });

    } catch (error) {
        console.log("generateLedger error", error);

        // --- DYNAMIC ERROR HANDLING ---
        const apiErrorMessage = error.response?.data?.Message || error.message;
        const apiErrorCode = error.response?.data?.ErrorCode || null;

        return resBadRequest({
            ack_msg: apiErrorMessage,
            developer_msg: apiErrorCode ? `Error Code: ${apiErrorCode}` : error.message
        });
    }
};

export const generateOustanding = async (req) => {
    try {
        const { contact_id, mconfig } = req.body;
        const { client_id, api_key, baseurl, company_id } = mconfig;

        if (!isValid(contact_id)) {
            return resError({ ack_msg: "contact_id is required" });
        }

        const contactModelInstance = contactModel(req.tenantDB);
        const getContactDetail = await contactModelInstance.findOne({ where: { isDelete: 0, id: contact_id }, raw: true });

        if (!getContactDetail) {
            return resError({ ack_msg: "Contact detail not found" });
        }

        const formattedDateTime = moment(new Date()).format("YYYY-MM-DD");

        const payload = {
            "rptType": "RPT002",
            "uniqueId": getContactDetail.miracle_UniqueId,
            "reportDate": formattedDateTime
        };

        // API call
        const api = createAxiosIntance({
            baseURL: baseurl,
            clientId: client_id,
            apiKey: api_key,
            tenantDB: req.tenantDB,
            getAuthContext: async () => req.body.mconfig
        });

        const response = await api.post('tpa/M2/V1/GenerateFile', payload);

        // Include ErrorCode extraction for detailed debugging
        const { IsError, Message, DataModel, FileName, ErrorCode } = response.data || {};

        if (IsError) {
            // Changed from resError to resBadRequest to trigger frontend catch block properly
            return resBadRequest({
                ack_msg: Message,
                developer_msg: ErrorCode ? `Error Code: ${ErrorCode}` : Message
            });
        }

        const { fileName, filePath } = await base64ToPdf(DataModel, FileName, company_id)

        return resSuccess({
            ack_msg: Message,
            data: {
                fileName,
                filePath,
                url: `${MIRACLE_LEDGER_PDF}/${company_id}/${fileName}`
            }
        });

    } catch (error) {
        // Fixed copy/paste typo in console.log
        console.log("generateOutstanding error", error)

        // --- DYNAMIC ERROR HANDLING ---
        const apiErrorMessage = error.response?.data?.Message || error.message;
        const apiErrorCode = error.response?.data?.ErrorCode || null;

        return resBadRequest({
            ack_msg: apiErrorMessage,
            developer_msg: apiErrorCode ? `Error Code: ${apiErrorCode}` : error.message
        });
    }
};

async function base64ToPdf(base64Data, fileName, company_masters_id) {
    if (!base64Data) {
        throw new Error("Base64 data is required");
    }

    if (!fileName) {
        throw new Error("File name is required");
    }

    // Ensure .pdf extension
    if (!fileName.endsWith('.pdf') && !fileName.endsWith('.Pdf')) {
        fileName += '.pdf';
    }

    // Clean base64 prefix if exists
    const base64Clean = base64Data.replace(/^data:application\/pdf;base64,/, "");

    const directoryPath = path.join(
        process.cwd(),
        "media-folder",
        "miracle",
        "ledger",
        String(company_masters_id)
    );

    // Ensure directory exists
    await fs.mkdir(directoryPath, { recursive: true });

    const destinationPath = path.join(directoryPath, fileName);

    // Write file (async, non-blocking)
    await fs.writeFile(destinationPath, base64Clean, 'base64');

    return {
        fileName,
        filePath: destinationPath
    };
}

export const miracleConfigCreate = async (req) => {
    const {
        a_application_login_id,
        Year,
        client_id,
        api_key,
        urlKey,
        baseurl,
        BranchName,
        CompanyName,
        rights_config
    } = req.body;

    const findCompanyId = await getCompanyByLoginId(a_application_login_id);

    try {

        const isExistData = await miracleConfigModel.findOne({
            where: { company_id: findCompanyId.company_masters_id, isDelete: 0 },
            raw: true
        });

        const parsedRights = parseMiracleRights(rights_config);

        if (isExistData) {
            const updateResult = await miracleConfigModel.update(
                {
                    Year,
                    client_id,
                    api_key,
                    urlKey,
                    baseurl,
                    BranchName,
                    CompanyName,
                    rights_config: parsedRights
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
            const createResult = await miracleConfigModel.create(
                {
                    company_id: findCompanyId.company_masters_id,
                    Year,
                    client_id,
                    api_key,
                    urlKey,
                    baseurl,
                    BranchName,
                    CompanyName,
                    rights_config: parsedRights
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
        console.log("miracleConfigCreate error", error);
        return resBadRequest({
            ack_msg: " ",
            developer_msg: `${error.message}`,
        });
    }
};

export const miracleConfigGet = async (req) => {

    const {
        a_application_login_id,
    } = req.body;

    const findCompanyId = await getCompanyByLoginId(a_application_login_id);

    try {

        const result = await miracleConfigModel.findOne({
            where: { isDelete: "0", company_id: findCompanyId.company_masters_id },
            attributes: [
                "Year",
                "client_id",
                "api_key",
                "urlKey",
                "baseurl",
                "BranchName",
                "CompanyName",
                "rights_config"
            ],
            raw: true
        });

        if (result) {
            const safeRights = parseMiracleRights(result.rights_config);
            return resSuccess({
                data: {
                    item: {
                        ...result,
                        rights_config: safeRights
                    }
                },
            });
        } else {
            const safeRights = parseMiracleRights(null);
            return resError({
                ack_msg: "No Config found",
                developer_msg: "Data not found",
                data: {
                    item: {
                        rights_config: safeRights
                    }
                }
            });
        }
    } catch (error) {
        return resBadRequest({
            ack_msg: "Failed to fetch configuration",
            developer_msg: `${error.message}`,
        });
    }
};

export const syncCaseBankPr = async (req) => {
    try {
        let { acc_id, mconfig } = req.body;
        const { client_id, api_key, baseurl } = mconfig;

        if (!acc_id) {
            return resError({ ack_msg: "acc_id is required" });
        }

        const rights = parseMiracleRights(mconfig?.rights_config);
        if (rights.sync_miracle?.enabled === false) {
            return resError({ ack_msg: "Miracle Sync is disabled in Miracle Configurations for this company" });
        }

        let accIds = [];

        if (Array.isArray(acc_id)) {
            accIds = acc_id;
        } else if (typeof acc_id === "string") {
            accIds = acc_id.split(",").map(id => Number(id.trim())).filter(Boolean);
        } else {
            accIds = [Number(acc_id)];
        }

        const accountTransactionsModelInstance = accountTransactionsModel(req.tenantDB);
        const contactModelInstance = contactModel(req.tenantDB);
        const paymentTypeModelInstance = paymentTypeModel(req.tenantDB);

        const results = [];

        const getPaymentTypesDb = await paymentTypeModelInstance.findAll({ where: { isDelete: 0 }, raw: true, attributes: ["id", "transaction_type"] });
        const transactionModeMap = getPaymentTypesDb.reduce((acc, item) => {
            acc[item.id] = item.transaction_type;
            return acc;
        }, {});

        for (const singleCartId of accIds) {
            try {
                // Get cart
                const getAcc = await accountTransactionsModelInstance.findOne({
                    where: { isDelete: 0, id: singleCartId },
                    raw: true
                });

                if (!getAcc) {
                    results.push({ acc_id: singleCartId, status: "fail", msg: "account not found" });
                    continue;
                }

                const txAction = getAcc.miracle_UniqueId ? "update" : "add";
                if (rights.sync_miracle?.account_transaction?.[txAction] === false) {
                    results.push({
                        acc_id: singleCartId,
                        status: "fail",
                        msg: `Miracle Sync permission denied for account_transaction.${txAction}`
                    });
                    continue;
                }

                // Contact
                const getContactDetail = await contactModelInstance.findOne({
                    where: { isDelete: 0, id: getAcc.contact_masters_id },
                    raw: true,
                    attributes: ["miracle_UniqueId", "id"]
                });

                if (!getContactDetail) {
                    results.push({ acc_id: singleCartId, status: "fail", msg: "contact not found" });
                    continue;
                }

                let con_acc_id = getContactDetail.miracle_UniqueId;

                if (!isValid(con_acc_id)) {
                    req.body.contact_id = getContactDetail.id;

                    const res = await syncContact(req);

                    if (res?.ack === 1) {
                        con_acc_id = res.data.UniqueId;
                    } else {
                        results.push({ con_acc_id: singleCartId, status: "fail", msg: "Contact sync failed" });
                        continue;
                    }
                }

                const voucherType = {
                    '2_0': "BP",
                    '1_0': "BR",
                    '2_1': "CP",
                    '1_1': "CR",
                };

                const transaction_mode = transactionModeMap[getAcc.mode] ? transactionModeMap[getAcc.mode] : 0;
                const prFlag = getAcc.type;

                const voutyp = voucherType[`${prFlag}_${transaction_mode}`]
                const voudt = moment(getAcc.payment_date_time).format('YYYY-MM-DD');

                const payload = {
                    action: getAcc.miracle_UniqueId ? "E" : "A",
                    uniqueId: getAcc.miracle_UniqueId || undefined,
                    voutyp: voutyp,
                    voudt: voudt,
                    vouno: String(getAcc.id),
                    acc: con_acc_id,
                    oppacc: getAcc.miracle_account_ledger,
                    amount: Number(getAcc.amount || 0),
                    narr: cleanHtmlText(getAcc.remark || ""),
                    taxtyp: "O"
                };

                if (voutyp == 'BP' || voutyp == 'BR') {
                    payload.cheqdt = voudt;
                }

                const api = createAxiosIntance({
                    baseURL: baseurl,
                    clientId: client_id,
                    apiKey: api_key,
                    tenantDB: req.tenantDB,
                    getAuthContext: async () => req.body.mconfig
                });

                const response = await api.post('TPA/M2/V1/Voucher', payload);
                const { UniqueId, IsError, Message, ErrorCode } = response.data || {};

                if (IsError) {
                    results.push({ acc_id: singleCartId, status: "fail", msg: Message, errorCode: ErrorCode });
                    continue;
                }

                if (UniqueId) {
                    await accountTransactionsModelInstance.update(
                        {
                            miracle_UniqueId: UniqueId,
                            miracle_update_date_time: moment.utc().format("YYYY-MM-DD HH:mm:ss")
                        },
                        {
                            where: { isDelete: 0, id: singleCartId }
                        }
                    );
                }

                results.push({ acc_id: singleCartId, status: "success", msg: Message });

            } catch (err) {
                // Safely catch API errors for the specific item in the loop
                const apiErrorMessage = err.response?.data?.Message || err.message;
                const apiErrorCode = err.response?.data?.ErrorCode || null;

                results.push({
                    acc_id: singleCartId,
                    status: "error",
                    msg: apiErrorMessage,
                    errorCode: apiErrorCode
                });
            }
        }

        // --- DYNAMIC RESPONSE HANDLING ---
        // If syncing a single item, bubble the exact message to the frontend
        if (accIds.length === 1) {
            const singleResult = results[0];

            if (singleResult.status === "success") {
                return resSuccess({
                    ack_msg: singleResult.msg,
                    data: results
                });
            } else {
                return resBadRequest({
                    ack_msg: singleResult.msg,
                    developer_msg: singleResult.errorCode ? `Error Code: ${singleResult.errorCode}` : singleResult.msg,
                    data: results
                });
            }
        }

        // Bulk sync response
        return resSuccess({
            ack_msg: "Bulk sync completed. Please check data for details.",
            data: results
        });

    } catch (error) {
        console.error("syncCaseBankPr Error", error);

        return resBadRequest({
            ack_msg: error.message,
            developer_msg: error.message
        });
    }
}

export const fetchAccountLedger = async (req) => {
    try {
        let { mconfig, mode, transaction_mode } = req.body;
        let results = [];
        const { client_id, api_key, baseurl } = mconfig;
        const paymentTypeModelInstance = paymentTypeModel(req.tenantDB);

        const findTransactionMode = mode ? await paymentTypeModelInstance.findOne({ where: { isDelete: 0, id: mode }, raw: true }) : null;

        let accgrpnm;
        if (findTransactionMode && findTransactionMode.transaction_type === 0) { // bank
            accgrpnm = ["Bank Accounts (Banks)"];
        } else if (findTransactionMode && findTransactionMode.transaction_type === 1) { // cash
            accgrpnm = ["Cash-in-hand"];
        } else if (transaction_mode && transaction_mode == 1) { // cash memo
            accgrpnm = ["Cash-in-hand"];
        } else if (transaction_mode && transaction_mode == 2) { // debit memo
            accgrpnm = ["Bank Accounts (Banks)"];
        } else {
            accgrpnm = ["Cash-in-hand", "Bank Accounts (Banks)"];
        }

        const formattedDateTime = moment(new Date()).format("YYYY-MM-DD");
        const financialYear = getFinancialYearRangeWise(formattedDateTime);
        const start_date = financialYear?.start_date || null;
        const end_date = financialYear?.end_date || null;
        const payload = {
            fromdate: start_date,
            todate: end_date,
            rptfield: ["accid", "accnm", "accalinm", "accgrpnm"],
            rptfilter: {
                accgrpnm: accgrpnm
            }
        };

        const api = createAxiosIntance({
            baseURL: baseurl,
            clientId: client_id,
            apiKey: api_key,
            tenantDB: req.tenantDB,
            getAuthContext: async () => req.body.mconfig
        });

        const response = await api.post('TPA/M2/V1/AccountLedger', payload);

        const { Data, TotalRecords, IsError, Message } = response.data || {};

        if (IsError) {
            results.push({ status: "fail", msg: Message, Data, TotalRecords });
        }

        results.push({ status: "success", msg: Message, Data, TotalRecords });

        return resSuccess({
            ack_msg: "sync completed",
            data: results
        });

    } catch (error) {
        console.error("fetchAccountLedger Error", error);

        return resBadRequest({
            ack_msg: error.message,
            developer_msg: error.message
        });
    }
}

const VALID_MATCH_FIELDS = ['code', 'name', 'alias', 'unique_id'];

const FIELD_MAPPING = {
    code: { crm: 'product_code', miracle: 'prdalinm' },
    name: { crm: 'product_name', miracle: 'prdnm' },
    alias: { crm: 'product_alias', miracle: 'prdalinm' },
    unique_id: { crm: 'miracle_UniqueId', miracle: 'prdid' }
};

function normalize(value) {
    return (value ?? '').toString().trim().toLowerCase();
}

/**
 * Builds one Map per match field: normalized value -> our product row.
 */
function buildLookupMaps(ourProducts, matchFields) {
    const maps = {};
    matchFields.forEach((field) => {
        maps[field] = new Map();
    });

    for (const product of ourProducts) {
        for (const field of matchFields) {
            const crmKey = FIELD_MAPPING[field].crm;
            const key = normalize(product[crmKey]);

            if (key && !maps[field].has(key)) {
                maps[field].set(key, product);
            }
        }
    }
    return maps;
}

function findMatch(thirdPartyProduct, maps, matchFields) {
    for (const field of matchFields) {
        const miracleKey = FIELD_MAPPING[field].miracle;
        const key = normalize(thirdPartyProduct[miracleKey]);

        if (!key) continue;

        const match = maps[field].get(key);
        if (match) {
            return { matchedProduct: match, matchedBy: field };
        }
    }
    return { matchedProduct: null, matchedBy: null };
}

export const fetchMiracleProducts = async (req) => {
    try {
        const { mconfig } = req.body;
        const matchBy = (req.body?.matchBy || []).filter((f) => VALID_MATCH_FIELDS.includes(f));

        if (matchBy.length === 0) {
            return resError({
                ack_msg: "Select at least one field to match products.",
            });
        }

        const { client_id, api_key, baseurl } = mconfig;

        const api = createAxiosIntance({
            baseURL: baseurl,
            clientId: client_id,
            apiKey: api_key,
            tenantDB: req.tenantDB,
            getAuthContext: async () => req.body.mconfig
        });

        // ---------------------------------------------------------
        // STEP 1: Fetch Base Product List (Now contains all fields)
        // ---------------------------------------------------------
        const ledgerPayload = {
            "rptfield": [
                "prdnm", "prdid", "gstunt", "hsncode", "minstk", "ordlev", "lprate", "lsrate", "prdmrp", "commnm", "slabnm", "opamt", "opqty1", "recqty1", "iqty1", "clqty1", "prdcrdt", "prdupdt", "lastactiondt"
            ]
        };

        const ledgerResponse = await api.post('TPA/M2/V1/ProductLedger', ledgerPayload);
        const { Data: baseProducts, TotalRecords, IsError: baseIsError, Message: baseMsg, ErrorCode: baseCode } = ledgerResponse.data || {};

        if (baseIsError) {
            return resBadRequest({
                ack_msg: baseMsg || "Failed to fetch base products from Miracle.",
                developer_msg: baseCode ? `Error Code: ${baseCode}` : baseMsg
            });
        }

        if (!baseProducts || baseProducts.length === 0) {
            return resSuccess({
                ack_msg: "No products found.",
                data: { items: [], totalFetched: 0, totalMatched: 0, totalNew: 0 }
            });
        }

        // ---------------------------------------------------------
        // STEP 2: Match against CRM Database & Format Output
        // ---------------------------------------------------------
        const productModelInstance = productModel(req.tenantDB);

        const fetchProductsCrm = await productModelInstance.findAll({
            where: { isDelete: 0 },
            attributes: ['id', 'product_code', 'product_name', 'product_alias', 'miracle_UniqueId'],
            raw: true,
        });

        const lookupMaps = buildLookupMaps(fetchProductsCrm, matchBy);

        let totalMatched = 0;
        let totalNew = 0;

        // Iterate directly over baseProducts since we no longer need the secondary fetch loop
        const items = baseProducts.map((tp) => {
            const { matchedProduct, matchedBy } = findMatch(tp, lookupMaps, matchBy);

            if (matchedProduct) totalMatched += 1;
            else totalNew += 1;

            // 1. Format the Third Party (Miracle) Product
            const formattedThirdPartyProduct = {
                id: tp.prdid,
                code: tp.prdalinm || "",
                name: tp.prdnm || "",
                alias: tp.prdalinm || null,
                price: tp.lsrate || 0,       // Mapped to lsrate (Local Sale Rate) since salrate was removed
                category: tp.catnm || ""
            };

            // 2. Format the Matched CRM Product
            let formattedMatchedProduct = null;
            if (matchedProduct) {
                formattedMatchedProduct = {
                    id: matchedProduct.id,
                    code: matchedProduct.product_code || "",
                    name: matchedProduct.product_name || "",
                    alias: matchedProduct.product_alias || null,
                    third_party_id: matchedProduct.miracle_UniqueId || null
                };
            }

            // 3. Return the wrapper structure
            return {
                thirdPartyProduct: formattedThirdPartyProduct,
                matchedProduct: formattedMatchedProduct,
                matchedBy: matchedBy || null,
                status: matchedProduct ? 'matched' : 'new',
            };
        });

        // ---------------------------------------------------------
        // STEP 3: Return Final Response
        // ---------------------------------------------------------
        return resSuccess({
            ack_msg: baseMsg || "Products fetched and matched successfully.",
            data: {
                items,
                totalFetched: baseProducts.length,
                totalMatched,
                totalNew,
            },
        });

    } catch (error) {
        console.error("fetchMiracleProducts Error", error);

        const apiErrorMessage = error.response?.data?.Message || error.message;
        const apiErrorCode = error.response?.data?.ErrorCode || null;

        return resBadRequest({
            ack_msg: apiErrorMessage,
            developer_msg: apiErrorCode ? `Error Code: ${apiErrorCode}` : error.message
        });
    }
};

let barcodeCounter = 0;
let lastBarcodeTimestamp = 0;

function generateProductBarcode() {
    const now = Date.now();
    if (now !== lastBarcodeTimestamp) {
        lastBarcodeTimestamp = now;
        barcodeCounter = 0;
    }
    barcodeCounter++;
    const timestampPart = now.toString().slice(-9);
    const counterPart = barcodeCounter.toString().padStart(4, "0");
    return timestampPart + counterPart;
}

// --- NEW HELPER: Processes in chunks and tracks Success vs Failure per item ---
async function processInChunksWithResults(items, chunkSize, processItem) {
    let successCount = 0;
    let failedCount = 0;
    const errors = [];

    for (let i = 0; i < items.length; i += chunkSize) {
        const chunk = items.slice(i, i + chunkSize);

        // Promise.allSettled waits for all to finish, regardless of success/failure
        const chunkResults = await Promise.allSettled(chunk.map(processItem));

        chunkResults.forEach((result, index) => {
            if (result.status === 'fulfilled') {
                successCount++;
            } else {
                failedCount++;
                const detailedError = result.reason?.errors?.map(e => e.message).join(', ')
                    || result.reason?.parent?.sqlMessage
                    || result.reason?.original?.sqlMessage
                    || result.reason?.message
                    || 'Unknown database error';
                console.error("Batch item process error:", chunk[index], result.reason);
                errors.push({
                    productId: chunk[index].miracle_UniqueId || 'Unknown',
                    message: detailedError
                });
            }
        });
    }
    return { successCount, failedCount, errors };
}

export const processProducts = async (req) => {
    try {
        const { mconfig, a_application_login_id } = req.body;
        const matchBy = (req.body?.matchBy || []).filter((f) => VALID_MATCH_FIELDS.includes(f));

        if (matchBy.length === 0) {
            return resError({
                ack_msg: "Select at least one field to match products.",
            });
        }

        const { client_id, api_key, baseurl, company_id } = mconfig;
        const loginId = req.body.a_application_login_id || null;

        const api = createAxiosIntance({
            baseURL: baseurl,
            clientId: client_id,
            apiKey: api_key,
            tenantDB: req.tenantDB,
            getAuthContext: async () => req.body.mconfig
        });

        // ---------------------------------------------------------
        // STEP 1: Fetch Base Product List from Miracle
        // ---------------------------------------------------------
        const ledgerPayload = {
            "rptfield": ["prdnm", "prdid", "gstunt", "hsncode", "minstk", "ordlev", "lprate", "lsrate", "prdmrp", "commnm", "slabnm", "opamt", "opqty1", "recqty1", "iqty1", "clqty1", "prdcrdt", "prdupdt", "lastactiondt"]
        };

        const ledgerResponse = await api.post('TPA/M2/V1/ProductLedger', ledgerPayload);
        const { Data: baseProducts, IsError: baseIsError, Message: baseMsg, ErrorCode: baseCode } = ledgerResponse.data || {};

        if (baseIsError) {
            return resBadRequest({
                ack_msg: baseMsg || "Failed to fetch products from Miracle.",
                developer_msg: baseCode ? `Error Code: ${baseCode}` : baseMsg
            });
        }

        if (!baseProducts || baseProducts.length === 0) {
            return resSuccess({
                ack_msg: "No products found to process.",
                data: { updatedCount: 0, createdCount: 0, failedCount: 0 }
            });
        }

        // ---------------------------------------------------------
        // STEP 2: Pre-Sync Dependencies (Groups & Categories)
        // ---------------------------------------------------------
        const productGroupModelInstance = productGroupModel(req.tenantDB);
        const categoryModelInstance = categoryModel(req.tenantDB);

        // A. Handle Product Groups[cite: 2]
        const uniqueGroups = [...new Set(baseProducts.map(p => p.grpnm).filter(Boolean))];
        let groupMap = new Map();

        if (uniqueGroups.length > 0) {
            // Find existing groups
            const existingGroups = await productGroupModelInstance.findAll({
                where: { isDelete: 0, group_name: { [Op.in]: uniqueGroups } },
                raw: true
            });
            existingGroups.forEach(g => groupMap.set(g.group_name.trim().toLowerCase(), g.id));

            // Create missing groups
            const groupsToCreate = uniqueGroups
                .filter(g => !groupMap.has(g.trim().toLowerCase()))
                .map(g => ({
                    group_name: g,
                    company_masters_id: company_id,
                    a_application_login_id: loginId
                }));

            if (groupsToCreate.length > 0) {
                await productGroupModelInstance.bulkCreate(groupsToCreate);
                // Re-fetch to get newly generated IDs
                const allGroups = await productGroupModelInstance.findAll({
                    where: { isDelete: 0, group_name: { [Op.in]: uniqueGroups } },
                    raw: true
                });
                allGroups.forEach(g => groupMap.set(g.group_name.trim().toLowerCase(), g.id));
            }
        }

        // B. Handle Categories[cite: 1]
        const uniqueCategories = [...new Set(baseProducts.map(p => p.catnm).filter(Boolean))];
        let categoryMap = new Map();

        if (uniqueCategories.length > 0) {
            const existingCategories = await categoryModelInstance.findAll({
                where: { isDelete: 0, category_name: { [Op.in]: uniqueCategories } },
                raw: true
            });
            existingCategories.forEach(c => categoryMap.set(c.category_name.trim().toLowerCase(), c.id));

            // Create missing categories, linking them to their respective group_id
            const categoriesToCreate = [];

            // Loop through base products to find the group associated with the missing category
            baseProducts.forEach(p => {
                const catName = p.catnm?.trim().toLowerCase();
                if (catName && !categoryMap.has(catName)) {
                    // Only push if we haven't already queued this category for creation
                    if (!categoriesToCreate.some(c => c.category_name.trim().toLowerCase() === catName)) {
                        const groupId = p.grpnm ? groupMap.get(p.grpnm.trim().toLowerCase()) : null;
                        categoriesToCreate.push({
                            category_name: p.catnm,
                            group_id: groupId,
                            company_masters_id: company_id,
                            a_application_login_id: loginId
                        });
                    }
                }
            });

            if (categoriesToCreate.length > 0) {
                await categoryModelInstance.bulkCreate(categoriesToCreate);
                const allCategories = await categoryModelInstance.findAll({
                    where: { isDelete: 0, category_name: { [Op.in]: uniqueCategories } },
                    raw: true
                });
                allCategories.forEach(c => categoryMap.set(c.category_name.trim().toLowerCase(), c.id));
            }
        }

        // C. Handle Units
        const productUnitMasterModelInstance = productUnitMasterModel(req.tenantDB);
        const uniqueUnits = [...new Set(baseProducts.map(p => p.gstunt).filter(Boolean))];
        let unitMap = new Map();

        if (uniqueUnits.length > 0) {
            const existingUnits = await productUnitMasterModelInstance.findAll({
                where: { isDelete: 0, unit: { [Op.in]: uniqueUnits } },
                raw: true
            });
            existingUnits.forEach(u => unitMap.set(u.unit.trim().toLowerCase(), u.id));

            // Create missing units
            const unitsToCreate = uniqueUnits
                .filter(u => !unitMap.has(u.trim().toLowerCase()))
                .map(u => ({
                    unit: u,
                    company_masters_id: company_id,
                    a_application_login_id: loginId
                }));

            if (unitsToCreate.length > 0) {
                await productUnitMasterModelInstance.bulkCreate(unitsToCreate);
                // Re-fetch to get newly generated IDs
                const allUnits = await productUnitMasterModelInstance.findAll({
                    where: { isDelete: 0, unit: { [Op.in]: uniqueUnits } },
                    raw: true
                });
                allUnits.forEach(u => unitMap.set(u.unit.trim().toLowerCase(), u.id));
            }
        }

        // D. Handle Tax/GST Slabs
        const taxModelInstance = taxModel(req.tenantDB);
        const uniqueSlabs = [...new Set(baseProducts.map(p => p.slabnm).filter(Boolean))];
        let taxMap = new Map();

        if (uniqueSlabs.length > 0) {
            const existingTaxes = await taxModelInstance.findAll({
                where: { isDelete: 0, name: { [Op.in]: uniqueSlabs } },
                raw: true
            });
            existingTaxes.forEach(t => taxMap.set(String(t.name).trim().toLowerCase(), t.id));

            // Create missing tax slabs
            const taxesToCreate = uniqueSlabs
                .filter(s => !taxMap.has(s.trim().toLowerCase()))
                .map(s => {
                    const match = s.match(/\d+(\.\d+)?/);
                    const gstVal = match ? parseFloat(match[0]) : 0;
                    return {
                        name: s,
                        value: gstVal,
                    };
                });

            if (taxesToCreate.length > 0) {
                await taxModelInstance.bulkCreate(taxesToCreate);
                // Re-fetch to get newly generated IDs
                const allTaxes = await taxModelInstance.findAll({
                    where: { isDelete: 0, name: { [Op.in]: uniqueSlabs } },
                    raw: true
                });
                allTaxes.forEach(t => taxMap.set(String(t.name).trim().toLowerCase(), t.id));
            }
        }

        // ---------------------------------------------------------
        // STEP 3: Match against CRM Database & Build Payloads
        // ---------------------------------------------------------
        const productModelInstance = productModel(req.tenantDB);

        const fetchProductsCrm = await productModelInstance.findAll({
            where: { isDelete: 0 },
            attributes: ['id', 'product_code', 'product_name', 'product_alias', 'miracle_UniqueId'],
            raw: true,
        });

        const lookupMaps = buildLookupMaps(fetchProductsCrm, matchBy);

        const recordsToInsert = [];
        const recordsToUpdate = [];
        const currentTimestamp = moment().format("YYYY-MM-DD HH:mm:ss");

        baseProducts.forEach((tp) => {
            const { matchedProduct } = findMatch(tp, lookupMaps, matchBy);

            // Extract IDs from our pre-synced Maps
            const groupId = tp.grpnm ? groupMap.get(tp.grpnm.trim().toLowerCase()) : null;
            const categoryId = tp.catnm ? categoryMap.get(tp.catnm.trim().toLowerCase()) : null;

            // Extract GST % from "slabnm" (e.g. "GST 18%" -> 18)
            const gstMatch = tp.slabnm ? tp.slabnm.match(/\d+(\.\d+)?/) : null;
            const gstPercentage = gstMatch ? parseFloat(gstMatch[0]) : 0;

            // Calculate Net Rate (Rate + GST amount)
            const rate = (tp.lsrate / ((gstPercentage / 100) + 1)) || 0;
            const calculatedNetRate = tp.lsrate;

            const purchas_rate = (tp.lprate / ((gstPercentage / 100) + 1)) || 0;
            const calculatedNetPurchaseRate = tp.lprate;

            const mappedData = {
                company_masters_id: company_id,
                a_application_login_id: loginId,
                product_name: tp.prdnm || "",
                product_code: tp.prdalinm || "",
                product_alias: tp.prdalinm || "",
                purchase_rate: +purchas_rate.toFixed(2) || 0,
                purchase_net_rate: +calculatedNetPurchaseRate.toFixed(2),
                rate: +rate.toFixed(2),
                net_rate: +calculatedNetRate.toFixed(2),
                unit: tp.gstunt || "",
                unit_id: tp.gstunt ? (unitMap.get(tp.gstunt.trim().toLowerCase()) || 0) : 0,
                GST: gstPercentage,
                gst_id: tp.slabnm ? (taxMap.get(tp.slabnm.trim().toLowerCase()) || "") : "",
                purchase_gst_per: gstPercentage,
                purchase_gst_id: tp.slabnm ? (taxMap.get(tp.slabnm.trim().toLowerCase()) || "") : "",
                hsn_code: tp.hsncode || "",
                product_group_id: groupId || "",
                category_id: categoryId || 1,
                min_stock_quantity: tp.minstk || 0,
                max_stock_quantity: tp.ordlev || 0,
                product_types: 5, // finish goods
                product_barcode_number: generateProductBarcode(),
                miracle_UniqueId: tp.prdid,
                miracle_update_date_time: currentTimestamp,
                isDelete: 0
            };

            if (matchedProduct) {
                const filteredData = Object.fromEntries(
                    Object.entries(mappedData).filter(([key, value]) => value !== undefined && value !== null && value !== "" && key !== "product_barcode_number")
                );

                recordsToUpdate.push({
                    id: matchedProduct.id,
                    ...filteredData
                });
            } else {
                recordsToInsert.push(mappedData);
            }
        });

        // ---------------------------------------------------------
        // STEP 4: Execute Database Operations safely
        // ---------------------------------------------------------
        const insertResults = await processInChunksWithResults(recordsToInsert, 100, async (record) => {
            return productModelInstance.create(record);
        });

        const updateResults = await processInChunksWithResults(recordsToUpdate, 100, async (record) => {
            const { id, ...updateFields } = record;
            return productModelInstance.update(updateFields, {
                where: { id: id, isDelete: 0 }
            });
        });

        // ---------------------------------------------------------
        // STEP 5: Format and Return Final Response
        // ---------------------------------------------------------
        const createdCount = insertResults.successCount;
        const updatedCount = updateResults.successCount;
        const failedCount = insertResults.failedCount + updateResults.failedCount;
        const errors = [...insertResults.errors, ...updateResults.errors];

        const responseData = {
            updatedCount,
            createdCount,
            failedCount,
        };

        if (errors.length > 0) {
            responseData.errors = errors;
        }

        return resSuccess({
            ack_msg: failedCount > 0 ? "Products processed with some errors." : "Products processed successfully.",
            data: responseData
        });

    } catch (error) {
        console.error("processProducts Error", error);

        const apiErrorMessage = error.response?.data?.Message || error.message;
        const apiErrorCode = error.response?.data?.ErrorCode || null;

        return resBadRequest({
            ack_msg: apiErrorMessage,
            developer_msg: apiErrorCode ? `Error Code: ${apiErrorCode}` : error.message
        });
    }
};


const VALID_MATCH_FIELDS_CONTACT = ['unique_id', 'mobile_number', 'gst_number', 'contact_name', 'client_code'];

const FIELD_MAPPING_CONTACT = {
    mobile_number: { crm: 'mobile_number', miracle: 'mob1' },
    gst_number: { crm: 'gst_number', miracle: 'gstin' },
    contact_name: { crm: 'company_name', miracle: 'accnm' },
    client_code: { crm: 'client_code', miracle: 'accalinm' },
    unique_id: { crm: 'miracle_UniqueId', miracle: 'accid' }
};

function getCurrentFinancialYearDates() {
    const currentMonth = moment().month(); // 0 indexed (Jan = 0, Apr = 3)
    let startYear, endYear;

    if (currentMonth >= 3) {
        startYear = moment().year();
        endYear = startYear + 1;
    } else {
        startYear = moment().year() - 1;
        endYear = moment().year();
    }

    return {
        fromDate: `${startYear}-04-01`,
        toDate: `${endYear}-03-31`
    };
}

function buildLookupMapsContact(ourRecords, matchFields, mapping) {
    const maps = {};
    matchFields.forEach((field) => {
        maps[field] = new Map();
    });

    for (const record of ourRecords) {
        for (const field of matchFields) {
            const crmKey = mapping[field].crm;
            const key = normalize(record[crmKey]);

            if (key && !maps[field].has(key)) {
                maps[field].set(key, record);
            }
        }
    }
    return maps;
}

function findMatchContact(thirdPartyRecord, maps, matchFields, mapping) {
    for (const field of matchFields) {
        const miracleKey = mapping[field].miracle;
        const key = normalize(thirdPartyRecord[miracleKey]);

        if (!key) continue;

        const match = maps[field].get(key);
        if (match) {
            return { matchedRecord: match, matchedBy: field };
        }
    }
    return { matchedRecord: null, matchedBy: null };
}


// ============================================================================
// 1. FETCH CONTACT (PREVIEW MODE)
// ============================================================================

export const fetchContact = async (req) => {
    try {
        const { mconfig } = req.body;
        const matchBy = (req.body?.matchBy || []).filter((f) => VALID_MATCH_FIELDS_CONTACT.includes(f));

        if (matchBy.length === 0) {
            return resError({
                ack_msg: "Select at least one field to match contacts.",
            });
        }

        const { client_id, api_key, baseurl } = mconfig;
        const { fromDate, toDate } = getCurrentFinancialYearDates();

        const api = createAxiosIntance({
            baseURL: baseurl,
            clientId: client_id,
            apiKey: api_key,
            tenantDB: req.tenantDB,
            getAuthContext: async () => req.body.mconfig
        });

        const ledgerPayload = {
            "fromdate": fromDate,
            "todate": toDate,
            "rptfield": ["accid", "accnm", "accalinm", "accgrpnm", "citynm", "statenm", "sgrpname", "gstin", "bname", "opbal", "totalcr", "totaldb", "clbal", "lastactiondt", "panno", "crdays", "regtype", "mob1", "email", "acccrdt", "accupdt"],
            "rptfilter": {
                "accgrpnm": ["Sundry Debtors", "Sundry Creditors"]
            }
        };

        const ledgerResponse = await api.post('TPA/M2/V1/AccountLedger', ledgerPayload);
        const { Data: baseContacts, IsError: baseIsError, Message: baseMsg, ErrorCode: baseCode } = ledgerResponse.data || {};

        if (baseIsError) {
            return resBadRequest({
                ack_msg: baseMsg || "Failed to fetch contacts from Miracle.",
                developer_msg: baseCode ? `Error Code: ${baseCode}` : baseMsg
            });
        }

        if (!baseContacts || baseContacts.length === 0) {
            return resSuccess({
                ack_msg: "No contacts found.",
                data: { items: [], totalFetched: 0, totalMatched: 0, totalNew: 0 }
            });
        }

        const contactModelInstance = contactModel(req.tenantDB);
        const fetchContactsCrm = await contactModelInstance.findAll({
            where: { isDelete: 0 },
            attributes: ['id', 'person_name', 'company_name', 'mobile_number', 'gst_number', 'client_code', 'miracle_UniqueId'],
            raw: true,
        });

        const lookupMaps = buildLookupMapsContact(fetchContactsCrm, matchBy, FIELD_MAPPING_CONTACT);

        let totalMatched = 0;
        let totalNew = 0;

        const items = baseContacts.map((tp) => {
            const { matchedRecord, matchedBy } = findMatchContact(tp, lookupMaps, matchBy, FIELD_MAPPING_CONTACT);

            if (matchedRecord) totalMatched += 1;
            else totalNew += 1;

            const formattedThirdPartyContact = {
                id: tp.accid,
                name: tp.accnm || "",
                mobile: tp.mob1 || "",
                gst: tp.gstin || "",
                group: tp.accgrpnm || ""
            };

            let formattedMatchedContact = null;
            if (matchedRecord) {
                formattedMatchedContact = {
                    id: matchedRecord.id,
                    name: matchedRecord.person_name || "",
                    mobile: matchedRecord.mobile_number || "",
                    gst: matchedRecord.gst_number || "",
                    third_party_id: matchedRecord.miracle_UniqueId || null
                };
            }

            return {
                thirdPartyContact: formattedThirdPartyContact,
                matchedContact: formattedMatchedContact,
                matchedBy: matchedBy || null,
                status: matchedRecord ? 'matched' : 'new',
            };
        });

        return resSuccess({
            ack_msg: baseMsg || "Contacts fetched and matched successfully.",
            data: {
                items,
                totalFetched: baseContacts.length,
                totalMatched,
                totalNew,
            },
        });

    } catch (error) {
        console.error("fetchContact Error", error);
        const apiErrorMessage = error.response?.data?.Message || error.message;
        const apiErrorCode = error.response?.data?.ErrorCode || null;

        return resBadRequest({
            ack_msg: apiErrorMessage,
            developer_msg: apiErrorCode ? `Error Code: ${apiErrorCode}` : error.message
        });
    }
};


// ============================================================================
// 2. PROCESS CONTACT (EXECUTION MODE)
// ============================================================================

export const processContact = async (req) => {
    try {
        const { mconfig, a_application_login_id } = req.body;
        const matchBy = (req.body?.matchBy || []).filter((f) => VALID_MATCH_FIELDS_CONTACT.includes(f));

        if (matchBy.length === 0) {
            return resError({
                ack_msg: "Select at least one field to match contacts.",
            });
        }

        const { client_id, api_key, baseurl } = mconfig;
        const { fromDate, toDate } = getCurrentFinancialYearDates();

        const api = createAxiosIntance({
            baseURL: baseurl,
            clientId: client_id,
            apiKey: api_key,
            tenantDB: req.tenantDB,
            getAuthContext: async () => req.body.mconfig
        });

        const ledgerPayload = {
            "fromdate": fromDate,
            "todate": toDate,
            "rptfield": ["accid", "accnm", "accalinm", "accgrpnm", "citynm", "areanm", "statenm", "sgrpname", "panno", "crdays", "crlimit", "aadharno", "gstin", "transport", "regtype", "udyamno", "udyamtyp", "udyamact", "accstatus", "balmethod", "conper1", "conper2", "addr1", "addr2", "addr3", "addr4", "pincode", "mob2", "mob1", "phone1", "phone2", "rphone1", "rphone2", "factoryno", "email", "website", "bname", "bbranch", "bradd", "bifsc", "baccno", "ibanno", "swiftcode", "opbal", "totalcr", "totaldb", "clbal", "acccrdt", "accupdt", "lastactiondt"],
            "rptfilter": {
                "accgrpnm": ["Sundry Debtors", "Sundry Creditors"]
            }
        };

        const ledgerResponse = await api.post('TPA/M2/V1/AccountLedger', ledgerPayload);
        const { Data: baseContacts, IsError: baseIsError, Message: baseMsg, ErrorCode: baseCode } = ledgerResponse.data || {};

        if (baseIsError) {
            return resBadRequest({
                ack_msg: baseMsg || "Failed to fetch contacts from Miracle.",
                developer_msg: baseCode ? `Error Code: ${baseCode}` : baseMsg
            });
        }

        if (!baseContacts || baseContacts.length === 0) {
            return resSuccess({
                ack_msg: "No contacts found to process.",
                data: { updatedCount: 0, createdCount: 0, failedCount: 0 }
            });
        }

        // ---------------------------------------------------------
        // PRE-SYNC: Resolve States and Cities
        // ---------------------------------------------------------
        const stateModelInstance = stateModel(req.tenantDB); //[cite: 6]
        const cityModelInstance = cityModel(req.tenantDB);   //[cite: 5]

        // Map States
        const uniqueStates = [...new Set(baseContacts.map(c => c.statenm).filter(Boolean))];
        let stateMap = new Map();
        if (uniqueStates.length > 0) {
            const existingStates = await stateModelInstance.findAll({
                where: { isDelete: 0, state_name: { [Op.in]: uniqueStates } },
                raw: true
            });
            existingStates.forEach(s => stateMap.set(s.state_name.trim().toLowerCase(), s.id));
        }

        // Map Cities
        const uniqueCities = [...new Set(baseContacts.map(c => c.citynm).filter(Boolean))];
        let cityMap = new Map();
        if (uniqueCities.length > 0) {
            const existingCities = await cityModelInstance.findAll({
                where: { isDelete: 0, city_name: { [Op.in]: uniqueCities } },
                raw: true
            });
            existingCities.forEach(c => cityMap.set(c.city_name.trim().toLowerCase(), c.id));
        }

        // ---------------------------------------------------------
        // Match against CRM Database
        // ---------------------------------------------------------
        const contactModelInstance = contactModel(req.tenantDB);
        const fetchContactsCrm = await contactModelInstance.findAll({
            where: { isDelete: 0 },
            attributes: ['id', 'person_name', 'company_name', 'mobile_number', 'gst_number', 'client_code', 'miracle_UniqueId'],
            raw: true,
        });

        const lookupMaps = buildLookupMapsContact(fetchContactsCrm, matchBy, FIELD_MAPPING_CONTACT);

        const recordsToInsert = [];
        const recordsToUpdate = [];
        const currentTimestamp = moment().format("YYYY-MM-DD HH:mm:ss");

        baseContacts.forEach((tp) => {
            const { matchedRecord } = findMatchContact(tp, lookupMaps, matchBy, FIELD_MAPPING_CONTACT);

            // Resolve State and City IDs
            const stateId = tp.statenm ? (stateMap.get(tp.statenm.trim().toLowerCase()) || null) : null;
            const cityId = tp.citynm ? (cityMap.get(tp.citynm.trim().toLowerCase()) || null) : null;

            // Map Miracle fields to your CRM Database columns
            const mappedData = {
                person_name: tp.accnm || "",
                company_name: tp.accnm || "",
                mobile_number: tp.mob1 || "",
                gst_number: tp.gstin || "",
                email_id: tp.email || "",
                client_code: tp.accalinm || "",
                country: 101,
                state: stateId,
                city: cityId,
                address: tp.addr1,
                source_type_id: -21,
                miracle_UniqueId: tp.accid,
                miracle_update_date_time: currentTimestamp,
                a_application_login_id: a_application_login_id,
                assinged_to_work_a_application_id: a_application_login_id,
                isDelete: 0
            };

            // Often company_name maps to the same name if it's not separated in Miracle
            if (!mappedData.company_name && tp.accnm) {
                mappedData.company_name = tp.accnm;
            }

            if (matchedRecord) {
                const filteredData = Object.fromEntries(
                    Object.entries(mappedData).filter(([_, value]) => value)
                );

                recordsToUpdate.push({
                    id: matchedRecord.id,
                    ...filteredData
                });
            } else {
                recordsToInsert.push(mappedData);
            }
        });

        // ---------------------------------------------------------
        // Execute Database Operations
        // ---------------------------------------------------------
        const insertResults = await processInChunksWithResults(recordsToInsert, 100, async (record) => {
            return contactModelInstance.create(record);
        });

        const updateResults = await processInChunksWithResults(recordsToUpdate, 100, async (record) => {
            const { id, ...updateFields } = record;
            return contactModelInstance.update(updateFields, {
                where: { id: id, isDelete: 0 }
            });
        });

        const createdCount = insertResults.successCount;
        const updatedCount = updateResults.successCount;
        const failedCount = insertResults.failedCount + updateResults.failedCount;
        const errors = [...insertResults.errors, ...updateResults.errors];

        const responseData = {
            updatedCount,
            createdCount,
            failedCount,
        };

        if (errors.length > 0) {
            responseData.errors = errors;
        }

        return resSuccess({
            ack_msg: failedCount > 0 ? "Contacts processed with some errors." : "Contacts processed successfully.",
            data: responseData
        });

    } catch (error) {
        console.error("processContact Error", error);
        const apiErrorMessage = error.response?.data?.Message || error.message;
        const apiErrorCode = error.response?.data?.ErrorCode || null;

        return resBadRequest({
            ack_msg: apiErrorMessage,
            developer_msg: apiErrorCode ? `Error Code: ${apiErrorCode}` : error.message
        });
    }
};

export const generateMiracleToken = async (req) => {
    const { a_application_login_id } = req.body;

    const findCompanyId = await getCompanyByLoginId(a_application_login_id);

    miracleConfigModel.update({ access_token: '' }, { where: { isDelete: 0, company_id: findCompanyId?.company_masters_id } })

    return resSuccess({
        ack_msg: ""
    });
};

const buildUnsyncedCondition = (tenantDB, primaryDateCol, start_date, end_date, isDateOnly = false) => {
    const unsyncedOr = [
        { miracle_UniqueId: null },
        { miracle_UniqueId: "" },
        { miracle_update_date_time: null },
        tenantDB.where(
            tenantDB.col("modified_date"),
            ">",
            tenantDB.col("miracle_update_date_time")
        )
    ];

    const baseWhere = {
        isDelete: 0,
        [Op.or]: unsyncedOr
    };

    if (start_date && end_date) {
        const primaryCond = isDateOnly ? {
            [primaryDateCol]: {
                [Op.gte]: start_date,
                [Op.lte]: end_date,
            }
        } : {
            [primaryDateCol]: {
                [Op.gte]: `${start_date} 00:00:00`,
                [Op.lte]: `${end_date} 23:59:59`,
            }
        };

        const modifiedCond = {
            modified_date: {
                [Op.gte]: `${start_date} 00:00:00`,
                [Op.lte]: `${end_date} 23:59:59`,
            }
        };

        return {
            [Op.and]: [
                baseWhere,
                {
                    [Op.or]: [
                        primaryCond,
                        modifiedCond
                    ]
                }
            ]
        };
    }

    return baseWhere;
};

const getModuleCounts = async (tenantDB, modelInstance, primaryDateCol, start_date, end_date, isDateOnly = false, type = null) => {
    const isNewWhere = {
        isDelete: 0,
        [Op.or]: [
            { miracle_UniqueId: null },
            { miracle_UniqueId: "" },
            { miracle_update_date_time: null }
        ]
    };

    const isUpdateWhere = {
        isDelete: 0,
        miracle_UniqueId: { [Op.ne]: null, [Op.ne]: "" },
        miracle_update_date_time: { [Op.ne]: null },
        [Op.and]: [
            tenantDB.where(
                tenantDB.col("modified_date"),
                ">",
                tenantDB.col("miracle_update_date_time")
            )
        ]
    };

    if (type !== null) {
        isNewWhere.type = type;
        isUpdateWhere.type = type;
    }

    const applyDate = (baseCond) => {
        if (!start_date || !end_date) return baseCond;
        const dateCond = isDateOnly ? {
            [primaryDateCol]: { [Op.gte]: start_date, [Op.lte]: end_date }
        } : {
            [primaryDateCol]: { [Op.gte]: `${start_date} 00:00:00`, [Op.lte]: `${end_date} 23:59:59` }
        };
        const modDateCond = {
            modified_date: { [Op.gte]: `${start_date} 00:00:00`, [Op.lte]: `${end_date} 23:59:59` }
        };
        return {
            [Op.and]: [
                baseCond,
                { [Op.or]: [dateCond, modDateCond] }
            ]
        };
    };

    const [new_count, update_count] = await Promise.all([
        modelInstance.count({ where: applyDate(isNewWhere) }),
        modelInstance.count({ where: applyDate(isUpdateWhere) })
    ]);

    return {
        total: new_count + update_count,
        new_count,
        update_count
    };
};

export const getMiracleUnsyncedCounts = async (req) => {
    try {
        const { start_date, end_date } = req.body;
        const productModelInstance = productModel(req.tenantDB);
        const contactModelInstance = contactModel(req.tenantDB);
        const cartModelInstance = cartModel(req.tenantDB);
        const accountTransactionsModelInstance = accountTransactionsModel(req.tenantDB);

        const [
            productCounts,
            contactCounts,
            quotationCounts,
            orderCounts,
            invoiceCounts,
            purchaseInvoiceCounts,
            purchaseOrderCounts,
            returnSalesCounts,
            returnPurchaseCounts,
            inwardCounts,
            dispatchCounts,
            accountTxCounts
        ] = await Promise.all([
            getModuleCounts(req.tenantDB, productModelInstance, "created_date_time", start_date, end_date),
            getModuleCounts(req.tenantDB, contactModelInstance, "created_date_time", start_date, end_date),
            getModuleCounts(req.tenantDB, cartModelInstance, "cart_date", start_date, end_date, true, 1),
            getModuleCounts(req.tenantDB, cartModelInstance, "cart_date", start_date, end_date, true, 2),
            getModuleCounts(req.tenantDB, cartModelInstance, "cart_date", start_date, end_date, true, 3),
            getModuleCounts(req.tenantDB, cartModelInstance, "cart_date", start_date, end_date, true, 4),
            getModuleCounts(req.tenantDB, cartModelInstance, "cart_date", start_date, end_date, true, 5),
            getModuleCounts(req.tenantDB, cartModelInstance, "cart_date", start_date, end_date, true, 6),
            getModuleCounts(req.tenantDB, cartModelInstance, "cart_date", start_date, end_date, true, 7),
            getModuleCounts(req.tenantDB, cartModelInstance, "cart_date", start_date, end_date, true, 8),
            getModuleCounts(req.tenantDB, cartModelInstance, "cart_date", start_date, end_date, true, 9),
            getModuleCounts(req.tenantDB, accountTransactionsModelInstance, "payment_date_time", start_date, end_date),
        ]);

        return resSuccess({
            data: {
                counts: {
                    product: productCounts,
                    contact: contactCounts,
                    quotation: quotationCounts,
                    order: orderCounts,
                    invoice: invoiceCounts,
                    purchase_invoice: purchaseInvoiceCounts,
                    purchase_order: purchaseOrderCounts,
                    return_sales_invoice: returnSalesCounts,
                    return_purchase_invoice: returnPurchaseCounts,
                    inward: inwardCounts,
                    dispatch: dispatchCounts,
                    account_transaction: accountTxCounts
                }
            }
        });
    } catch (error) {
        console.error("getMiracleUnsyncedCounts error", error);
        return resBadRequest({
            ack_msg: "Failed to fetch unsynced counts",
            developer_msg: error.message
        });
    }
};

export const bulkSyncMiracleModules = async (req) => {
    try {
        const { selected_modules, start_date, end_date } = req.body;
        if (!Array.isArray(selected_modules) || selected_modules.length === 0) {
            return resBadRequest({ ack_msg: "Select at least one module to sync." });
        }

        const productModelInstance = productModel(req.tenantDB);
        const contactModelInstance = contactModel(req.tenantDB);
        const cartModelInstance = cartModel(req.tenantDB);
        const accountTransactionsModelInstance = accountTransactionsModel(req.tenantDB);

        const prodCond = buildUnsyncedCondition(req.tenantDB, "created_date_time", start_date, end_date);
        const contactCond = buildUnsyncedCondition(req.tenantDB, "created_date_time", start_date, end_date);
        const accCond = buildUnsyncedCondition(req.tenantDB, "payment_date_time", start_date, end_date);

        const resultsSummary = [];

        const CART_TYPE_MAP = {
            quotation: 1,
            order: 2,
            invoice: 3,
            purchase_invoice: 4,
            purchase_order: 5,
            return_sales_invoice: 6,
            return_purchase_invoice: 7,
            inward: 8,
            dispatch: 9,
        };

        for (const moduleKey of selected_modules) {
            if (moduleKey === "product") {
                const items = await productModelInstance.findAll({
                    where: prodCond,
                    attributes: ["id"],
                    raw: true
                });
                let success = 0;
                let failed = 0;

                for (const item of items) {
                    try {
                        req.body.item_id = item.id;
                        const res = await syncProduct(req);
                        if (res?.ack === 1) success++;
                        else failed++;
                    } catch {
                        failed++;
                    }
                }
                resultsSummary.push({ module: "product", total: items.length, success, failed });
            } else if (moduleKey === "contact") {
                const items = await contactModelInstance.findAll({
                    where: contactCond,
                    attributes: ["id"],
                    raw: true
                });
                let success = 0;
                let failed = 0;

                for (const item of items) {
                    try {
                        req.body.contact_id = item.id;
                        req.body.group_name = "Sundry Debtors";
                        const res = await syncContact(req);
                        if (res?.ack === 1) success++;
                        else failed++;
                    } catch {
                        failed++;
                    }
                }
                resultsSummary.push({ module: "contact", total: items.length, success, failed });
            } else if (moduleKey === "account_transaction") {
                const items = await accountTransactionsModelInstance.findAll({
                    where: accCond,
                    attributes: ["id"],
                    raw: true
                });
                if (items.length > 0) {
                    req.body.acc_id = items.map(i => i.id);
                    const res = await syncCaseBankPr(req);
                    const success = res?.data?.filter(r => r.status === "success").length || 0;
                    const failed = items.length - success;
                    resultsSummary.push({ module: "account_transaction", total: items.length, success, failed });
                } else {
                    resultsSummary.push({ module: "account_transaction", total: 0, success: 0, failed: 0 });
                }
            } else if (CART_TYPE_MAP[moduleKey]) {
                const cartType = CART_TYPE_MAP[moduleKey];
                const cartWhere = {
                    ...buildUnsyncedCondition(req.tenantDB, "cart_date", start_date, end_date, true),
                    type: cartType,
                };
                const items = await cartModelInstance.findAll({
                    where: cartWhere,
                    attributes: ["id"],
                    raw: true
                });
                if (items.length > 0) {
                    req.body.cart_id = items.map(i => i.id);
                    const res = await syncInvoice(req);
                    const success = res?.data?.filter(r => r.status === "success").length || 0;
                    const failed = items.length - success;
                    resultsSummary.push({ module: moduleKey, total: items.length, success, failed });
                } else {
                    resultsSummary.push({ module: moduleKey, total: 0, success: 0, failed: 0 });
                }
            }
        }

        return resSuccess({
            ack_msg: "Bulk synchronization completed.",
            data: { results: resultsSummary }
        });
    } catch (error) {
        console.error("bulkSyncMiracleModules error", error);
        return resBadRequest({
            ack_msg: "Failed to execute bulk sync",
            developer_msg: error.message
        });
    }
};