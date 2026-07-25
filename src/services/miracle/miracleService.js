import fs from "fs-extra";
import moment from "moment";
import path from "path";
import { Op } from "sequelize";
import { accountTransactionsModel } from "../../models/activities/accountTransactionsModel.js";
import { cartItemModel } from "../../models/activities/cartItemsModel.js";
import { cartModel } from "../../models/activities/cartsModel.js";
import { contactModel } from "../../models/activities/contactModel.js";
import { paymentTypeModel } from "../../models/activities/paymentTypeModel.js";
import miracleConfigModel from "../../models/company_setup/miracleConfigModel.js";
import { areaModel } from "../../models/masters/areaModel.js";
import { cityModel } from "../../models/masters/cityModel.js";
import { stateModel } from "../../models/masters/stateModel.js";
import { categoryModel } from "../../models/product_settings/categoryModel.js";
import { productGroupModel } from "../../models/product_settings/productGroupModel.js";
import { productModel } from "../../models/product_settings/productModel.js";
import { taxModel } from "../../models/product_settings/taxModel.js";
import { MIRACLE_LEDGER_PDF } from "../../utils/appConstants.js";
import { createAxiosIntance } from "../../utils/miracleAxiosInstance.js";
import { getFinancialYearRangeWise, isValid, resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../commonServices.js";

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
        const gstCommodity = getProductDb.gst_id ? await taxModelInstance.findOne({ where: { isDelete: 0, id: getProductDb.gst_id }, attributes: ["name"], raw: true }) : "";

        const category_name_db = getProductDb.category_id ? await categoryModelInstance.findOne({ where: { isDelete: 0, id: getProductDb.category_id }, attributes: ["category_name"], raw: true }) : "";

        const group_name_db = getProductDb.product_group_id ? await productGroupModelInstance.findOne({ where: { isDelete: 0, id: getProductDb.product_group_id }, attributes: ["group_name"], raw: true }) : "";

        let gst_ = gstCommodity ? gstCommodity.name : "";
        let category_name = category_name_db ? category_name_db.category_name : "";
        let group_name = group_name_db ? group_name_db.group_name : "";

        const payload = {
            action: "A",
            prdnm: getProductDb.product_name,
            prdalinm: getProductDb.product_code,
            commnm: gst_,
            catnm: category_name,
            grpnm: group_name,
            slabnm: gst_,
            uomnm: "U1",
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
                "isstkreq": "y",
                "islocstk": "",
                "ispricelist": ""
            }
        };

        if (getProductDb.miracle_UniqueId) {
            payload.action = "E";
            payload.uniqueId = getProductDb.miracle_UniqueId;
            delete payload['commnm'];
            delete payload['prdstp'];
        }

        const api = createAxiosIntance({
            baseURL: baseurl,
            clientId: client_id,
            apiKey: api_key,
            tenantDB: req.tenantDB,
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

                // Contact
                const getContactDetail = await contactModelInstance.findOne({
                    where: { isDelete: 0, id: getCart.to_customer_id },
                    raw: true,
                    attributes: ["miracle_UniqueId", "id"]
                });

                if (!getContactDetail) {
                    results.push({ cart_id: singleCartId, status: "fail", msg: "Contact not found" });
                    continue;
                }

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
                    } else {
                        results.push({ cart_id: singleCartId, status: "fail", msg: res?.ack_msg || "Contact Sync failed" });
                        continue;
                    }
                }

                // Items
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
                    const taxable_amount = total + gst_amount;

                    items.push({
                        prd: PRD,
                        seqno: index + 1,
                        batchnm: "",
                        locnm: "",
                        qty1: Number(qty.toFixed(1)),
                        txpaidrt: Number(total.toFixed(1)),
                        rate: Number(rate.toFixed(1)),
                        txpaidrt: Number(item_net_rate.toFixed(1)),
                        amt: Number(taxable_amount.toFixed(1)),
                        expdet: [
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
                        ],
                    });
                }

                const voucherType = {
                    3: "SS", 4: "PP", 2: "OS", 5: "OP", 6: "SR",
                    7: "PR", 1: "QS", 9: "HS", 8: "HP",
                };

                const payload = {
                    action: getCart.miracle_UniqueId ? "E" : "A",
                    uniqueId: getCart.miracle_UniqueId || undefined,
                    voutyp: voucherType[getCart.type],
                    billno: getCart.cart_number,
                    acc: getCart.transaction_mode == 1 ? getCart.miracle_account_legder : acc_id,
                    billamt: Number(getCart.grand_total || 0),
                    flgcd: getCart.transaction_mode == 1 ? "C" : getCart.transaction_mode == 2 ? "D" : "",
                    invtyp: "GST",
                    taxtyp: "T",
                    items,
                    expdet: [{ expnm: "Round Off", expper: 0, expamt: 0 }],
                    ufddet: {
                        U0000001: getCart.due_date ? getCart.due_date : ""
                    }
                };

                if (getCart.transaction_mode == 1) { // case
                    payload.cpacc = acc_id;
                }

                if (getCart.type != 7) {
                    payload.billdt = getCart.cart_date;
                }

                if (getCart.type == 4 || getCart.type == 7) {
                    payload.voudt = getCart.cart_date;
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

        // let contact_name = getContactDetail.company_name ? getContactDetail.company_name + '-' + getContactDetail.person_name : getContactDetail.person_name;
        let contact_name = getContactDetail.company_name;

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
            // FIXED: was stateDb.city_name
            state_name = stateDb?.state_name || "";
        }

        const payload = {
            "accnm": contact_name,
            "action": "A",
            "accalinm": getContactDetail.client_code,
            "accgrpnm": group_name ? group_name : "Sundry Debtors",
            "gstin": getContactDetail.gst_number,
            "addr": {
                "addr1": getContactDetail.address,
                "addr2": getContactDetail.shipping_address,
                "citynm": city_name,
                "pincode": getContactDetail.pincode,
                "areanm": area_name,
                "statenm": state_name,
                "mob1": getContactDetail.mobile_number,
                "email": getContactDetail.email_id,
            },
            "regtypedet": [
                {
                    "regtype": "Unregistered",
                    "regappdt": "2017-07-01"
                }
            ]
        }

        // API call
        const api = createAxiosIntance({
            baseURL: baseurl,
            clientId: client_id,
            apiKey: api_key,
            tenantDB: req.tenantDB,
            getAuthContext: async () => req.body.mconfig
        });

        const response = await api.post('TPA/M2/V1/Account', payload);
        // Include ErrorCode here in case API returns 200 OK but IsError is true
        const { UniqueId, IsError, Message, ErrorCode } = response.data || {};

        if (IsError) {

            if (Message == 'Alias Name already Exist.') {
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
        CompanyName
    } = req.body;

    const findCompanyId = await getCompanyByLoginId(a_application_login_id);

    try {

        const isExistData = await miracleConfigModel.findOne({
            where: { company_id: findCompanyId.company_masters_id, isDelete: 0 },
            raw: true
        });

        if (isExistData) {
            const updateResult = await miracleConfigModel.update(
                {
                    Year,
                    client_id,
                    api_key,
                    urlKey,
                    baseurl,
                    BranchName,
                    CompanyName
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
                    CompanyName
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
        console.log("miracleConfigGet error", e)
        return resBadRequest({ developer_msg: `error ${e}` });
    }
};

export const syncCaseBankPr = async (req) => {
    try {
        let { acc_id, mconfig } = req.body;
        const { client_id, api_key, baseurl } = mconfig;

        if (!acc_id) {
            return resError({ ack_msg: "acc_id is required" });
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
                    narr: getAcc.remark,
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
                "prdupdt", "prdcrdt", "lastactiondt", "clqty1",
                "iqty1", "recqty1", "opqty1", "slabnm",
                "commnm", "hsncode", "catnm", "grpnm",
                "prdid", "prdnm", "gstunt", "minstk", "ordlev",
                "lprate", "lsrate", "prdmrp", "opamt"
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
                errors.push({
                    productId: chunk[index].miracle_UniqueId || 'Unknown',
                    message: result.reason?.message || 'Unknown database error'
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
            "rptfield": [
                "prdupdt", "prdcrdt", "lastactiondt", "clqty1",
                "iqty1", "recqty1", "opqty1", "slabnm",
                "commnm", "hsncode", "catnm", "grpnm",
                "prdid", "prdnm", "gstunt", "minstk", "ordlev",
                "lprate", "lsrate", "prdmrp", "opamt"
            ]
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
            const rate = (tp.lsrate / 1.18) || 0;
            const calculatedNetRate = tp.lsrate;

            const purchas_rate = (tp.lprate / 1.18) || 0;
            const calculatedNetPurchaseRate = tp.lprate;

            const mappedData = {
                product_name: tp.prdnm || "",
                product_code: tp.prdalinm || "",
                product_alias: tp.prdalinm || "",
                purchase_rate: +purchas_rate.toFixed(2) || 0,
                purchase_net_rate: +calculatedNetPurchaseRate.toFixed(2),
                rate: +rate.toFixed(2),
                net_rate: +calculatedNetRate.toFixed(2),
                unit: "NOS-NUMBERS",
                unit_id: 16,
                GST: 18,
                purchase_gst_per: 18,
                hsn_code: tp.hsncode || "",
                product_group_id: groupId || -1,
                category_id: categoryId || 1,
                min_stock_quantity: tp.minstk || 0,
                max_stock_quantity: tp.ordlev || 0,
                product_types: 5, // finish goods
                miracle_UniqueId: tp.prdid,
                miracle_update_date_time: currentTimestamp,
                isDelete: 0
            };

            if (matchedProduct) {
                const filteredData = Object.fromEntries(
                    Object.entries(mappedData).filter(([_, value]) => value)
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
}