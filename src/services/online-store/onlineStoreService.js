import moment from "moment";
import { Op } from "sequelize";
import { getTenantDB } from "../../config/dbManager.js";
import { getUserRights } from "../../helpers/rightsHelper.js";
import companyModel from "../../models/company_setup/companyModel.js";
import { PAGE_ID } from "../../utils/AppEnumeration.js";
import {
    getNumberSeries,
    resBadRequest,
    resError,
    resSuccess
} from "../../utils/sharedFunctions.js";

export const orderCreateByOnlineStore = async (req, res) => {
    const qr_code = req.params.qrcode;
    const { orderType = "draft", cart = {}, items = [] } = req.body;
    try {
        if (!qr_code) {
            return resError({ ack_msg: "Invalid Company QR Code", developer_msg: "Invalid Company QR Code" });
        }
        if (!cart.cart_remark) {
            return resError({ ack_msg: "Cart remark is required", developer_msg: "Cart.cart_remark is required" });
        }
        // Address may be provided in cart.Address OR cart.address. Accept either.
        const addressProvided = cart.Address || cart.address || "";
        if (!Array.isArray(items) || items.length === 0) {
            return resError({ ack_msg: "Items array is required", developer_msg: "items must be a non-empty array" });
        }
        if (cart.type && Number(cart.type) !== 2) {
            return resError({ ack_msg: "Invalid cart type", developer_msg: "cart.type should be 2 (order) for online store orders" });
        }
        const validOrderTypes = ["draft"];
        if (!validOrderTypes.includes(orderType)) {
            return resError({ ack_msg: `Order type not supported. Allowed: ${validOrderTypes.join(", ")}`, developer_msg: `Unsupported orderType` });
        }
        const companyData = await companyModel.findOne({
            where: { qr_code, isDelete: 0 },
            attributes: ["id", "a_application_login_id", "qr_code"],
        });
        if (!companyData) {
            return resError({ ack_msg: "Company Not Found", developer_msg: "Company Not Found for provided qr_code" });
        }
        const company_masters_id = companyData.dataValues.id;
        const a_application_login_id = companyData.dataValues.a_application_login_id;
        const tenantId = companyData.dataValues.a_application_login_id;
        const companyId = companyData.dataValues.id;
        req.headers["x-tenant-id"] = tenantId;
        const tenantDBInfo = await getTenantDB(tenantId, companyId);
        if (!tenantDBInfo || !tenantDBInfo.models) {
            return resError({ ack_msg: "Tenant DB Error", developer_msg: "Unable to resolve tenant DB" });
        }
        const tenantSequelize = tenantDBInfo.sequelize;
        const models = tenantDBInfo.models;
        const customerMobileNumber = cart.to_customer_phone || cart.mobile_number || (items.length && items[0].customer_mobile) || "";
        const customerName = cart.to_customer_name || cart.name || (items.length && items[0].customer_name) || "";
        if (!customerMobileNumber) {
            return resError({ ack_msg: "Customer mobile number is required", developer_msg: "Customer mobile number is required" });
        }
        if (!customerName) {
            return resError({ ack_msg: "Customer Name is required", developer_msg: "Customer Name is required" });
        }
        const productCodes = [];
        const productIds = [];
        for (const it of items) {
            if (it.item_product_code) productCodes.push(String(it.item_product_code));
            if (it.product_code) productCodes.push(String(it.product_code));
            if (it.item_product_id) productIds.push(Number(it.item_product_id));
            if (it.product_id) productIds.push(Number(it.product_id));
        }
        if (productCodes.length === 0 && productIds.length === 0) {
            return resError({ ack_msg: "Product identifier(s) required in items", developer_msg: "Each item must contain item_product_code or item_product_id" });
        }
        const productWhere = { isDelete: 0 };
        const orArray = [];
        if (productIds.length) orArray.push({ id: { [Op.in]: productIds } });
        if (productCodes.length) orArray.push({ product_code: { [Op.in]: productCodes } });
        if (orArray.length > 0) productWhere[Op.or] = orArray;
        const foundProducts = await models.products.findAll({
            where: productWhere,
            attributes: ["id", "product_code", "rate", "GST", "net_rate", "hsn_code", "product_name", "product_barcode_number"],
        });
        if (!foundProducts || foundProducts.length === 0) {
            return resError({ ack_msg: "No matching products found", developer_msg: "Provided product codes do not exist" });
        }
        let contact = await models.contact_masters.findOne({
            where: { mobile_number: customerMobileNumber, company_masters_id, isDelete: 0 },
        });
        if (!contact) {
            const userList = await models.contact_masters.findAll({
                where: { company_masters_id, isDelete: 0 },
                attributes: ["company_masters_id", "a_application_login_id"],
            });
            // const userRights = await applicationLoginTypeRightModel.findOne({
            //     where: {
            //         company_masters_id,
            //         a_application_login_id,
            //         page_id: 1,
            //         isDelete: 0,
            //     },
            //     attributes: ["a_application_login_id", "a_page_id_rights_jason"],
            // });
            const tenantDB = req.tenantDB;
            const userRights = await getUserRights({
                company_masters_id,
                a_application_login_id,
                page_id: PAGE_ID.CONTACT,
                tenantDB
            });
            const userCount = userList.length;
            if (userRights && userRights.a_page_id_rights_jason) {
                try {
                    const rightsJson = JSON.parse(userRights.a_page_id_rights_jason || "{}");
                    if (typeof rightsJson.limit === "number" && rightsJson.limit > 0 && userCount >= rightsJson.limit) {
                        return resError({
                            ack_msg: `Your Contacts Limit Exceeded`,
                            developer_msg: `Limit ${rightsJson.limit} reached for Company`,
                        });
                    }
                } catch (err) {
                    req.logger.error("Error parsing rights JSON:", a_application_login_id, err);
                }
            }
            contact = await models.contact_masters.create({
                company_masters_id,
                person_name: customerName || "Guest",
                company_name: cart.to_customer_company_name || "",
                mobile_number: customerMobileNumber,
                email_id: cart.to_customer_email || "",
                isDelete: 0,
                isActive: 1,
                created_date_time: moment().format("YYYY-MM-DD HH:mm:ss"),
                source_type_id: -18,
            });
        }
        const contactId = contact.id || contact.dataValues?.id;
        const productById = new Map();
        const productByCode = new Map();
        for (const p of foundProducts) {
            const pid = p.id ?? p.dataValues?.id;
            const pcode = p.product_code ?? p.dataValues?.product_code;
            productById.set(Number(pid), p);
            if (pcode !== undefined && pcode !== null) productByCode.set(String(pcode), p);
        }
        const missingItems = [];
        for (const it of items) {
            const id = it.item_product_id || it.product_id || null;
            const code = (it.item_product_code || it.product_code) ? String(it.item_product_code || it.product_code) : null;
            let matched = null;
            if (id && productById.has(Number(id))) matched = productById.get(Number(id));
            else if (code && productByCode.has(code)) matched = productByCode.get(code);
            if (!matched) {
                missingItems.push(it);
            }
        }
        if (missingItems.length > 0) {
            return resError({
                ack_msg: "Invalid products found in items",
                developer_msg: "Some products do not exist or do not belong to this company",
                missing_products: missingItems,
            });
        }
        // If approved order, get financial numbering
        let financialYearDetail = null;
        if (orderType === "approved") {
            financialYearDetail = await getNumberSeries(company_masters_id, cart.type || 2, cart.cart_date || moment().format("YYYY-MM-DD"), req);
        }
        // Prepare cart custom fields (take from cart payload when present)
        const cartItemCustom = {
            carts_column_number_1: cart.carts_column_number_1 || "",
            carts_column_number_2: cart.carts_column_number_2 || "",
            carts_column_number_3: cart.carts_column_number_3 || "",
            carts_column_number_4: cart.carts_column_number_4 || "",
            carts_column_number_5: cart.carts_column_number_5 || "",
            carts_column_text_1: cart.carts_column_text_1 || "",
            carts_column_text_2: cart.carts_column_text_2 || "",
            carts_column_text_3: cart.carts_column_text_3 || "",
            carts_column_text_4: cart.carts_column_text_4 || "",
            carts_column_text_5: cart.carts_column_text_5 || "",
            carts_column_text_area_1: cart.carts_column_text_area_1 || "",
            carts_column_text_area_2: cart.carts_column_text_area_2 || "",
            carts_column_text_area_3: cart.carts_column_text_area_3 || "",
            carts_column_text_area_4: cart.carts_column_text_area_4 || "",
            carts_column_text_area_5: cart.carts_column_text_area_5 || "",
            carts_column_date_1: cart.carts_column_date_1 || "",
            carts_column_date_2: cart.carts_column_date_2 || "",
            carts_column_date_3: cart.carts_column_date_3 || "",
            carts_column_date_4: cart.carts_column_date_4 || "",
            carts_column_date_5: cart.carts_column_date_5 || "",
            carts_column_date_and_time_1: cart.carts_column_date_and_time_1 || "",
            carts_column_date_and_time_2: cart.carts_column_date_and_time_2 || "",
            carts_column_date_and_time_3: cart.carts_column_date_and_time_3 || "",
            carts_column_date_and_time_4: cart.carts_column_date_and_time_4 || "",
            carts_column_date_and_time_5: cart.carts_column_date_and_time_5 || "",
            carts_column_time_1: cart.carts_column_time_1 || "",
            carts_column_time_2: cart.carts_column_time_2 || "",
            carts_column_time_3: cart.carts_column_time_3 || "",
            carts_column_time_4: cart.carts_column_time_4 || "",
            carts_column_time_5: cart.carts_column_time_5 || "",
            carts_column_switch_1: cart.carts_column_switch_1 ? 1 : 0,
            carts_column_switch_2: cart.carts_column_switch_2 ? 1 : 0,
            carts_column_switch_3: cart.carts_column_switch_3 ? 1 : 0,
            carts_column_switch_4: cart.carts_column_switch_4 ? 1 : 0,
            carts_column_switch_5: cart.carts_column_switch_5 ? 1 : 0,
            carts_column_decimal_1: cart.carts_column_decimal_1 || "",
            carts_column_decimal_2: cart.carts_column_decimal_2 || "",
            carts_column_decimal_3: cart.carts_column_decimal_3 || "",
            carts_column_decimal_4: cart.carts_column_decimal_4 || "",
            carts_column_decimal_5: cart.carts_column_decimal_5 || "",
            carts_column_dropdown_1: cart.carts_column_dropdown_1 || "",
            carts_column_dropdown_2: cart.carts_column_dropdown_2 || "",
            carts_column_dropdown_3: cart.carts_column_dropdown_3 || "",
            carts_column_dropdown_4: cart.carts_column_dropdown_4 || "",
            carts_column_dropdown_5: cart.carts_column_dropdown_5 || "",
            carts_column_radio_1: cart.carts_column_radio_1 || "",
            carts_column_radio_2: cart.carts_column_radio_2 || "",
            carts_column_radio_3: cart.carts_column_radio_3 || "",
            carts_column_radio_4: cart.carts_column_radio_4 || "",
            carts_column_radio_5: cart.carts_column_radio_5 || "",
            carts_column_page_text_1: cart.carts_column_page_text_1 || "",
            carts_column_page_text_2: cart.carts_column_page_text_2 || "",
            carts_column_page_text_3: cart.carts_column_page_text_3 || "",
            carts_column_page_text_4: cart.carts_column_page_text_4 || "",
            carts_column_page_text_5: cart.carts_column_page_text_5 || "",
            carts_column_page_url_1: cart.carts_column_page_url_1 || "",
            carts_column_page_url_2: cart.carts_column_page_url_2 || "",
            carts_column_page_url_3: cart.carts_column_page_url_3 || "",
            carts_column_page_url_4: cart.carts_column_page_url_4 || "",
            carts_column_page_url_5: cart.carts_column_page_url_5 || "",
        };
        // Build cartBody depending on order type
        const formattedDateTime = moment().format("YYYY-MM-DD HH:mm:ss");
        let cartBody = {
            type: 2,
            cart_remark: cart.cart_remark || "Order Remark",
            cart_terms_and_condition: cart.cart_terms_and_condition || "",
            cart_notes: cart.cart_notes || "",
            cart_date: cart.cart_date || moment().format("YYYY-MM-DD"),
            currency_id: 0,
            conversion_rate: cart.conversion_rate || 1,
            taxable_amt: cart.taxable_amt || 0,
            tcs_amt: cart.tcs_amt || 0,
            gst_amt: cart.gst_amt || 0,
            round_off: cart.round_off || 0,
            total_amt: cart.total_amt || 0,
            total_qty: cart.total_qty || 0,
            discount_pct: cart.discount_pct || 0,
            discount_pr: cart.discount_pr || 0,
            packing_forwarding_charge: cart.packing_forwarding_charge || 0,
            advance_payment: cart.advance_payment || 0,
            payment_type: cart.payment_type || "",
            country_id: cart.country_id || 0,
            state_id: cart.state_id || 0,
            city_id: cart.city_id || 0,
            area_id: cart.area_id || 0,
            PinCode: cart.PinCode || cart.PinCode || "",
            Address: addressProvided,
            shipping_address: cart.shipping_address || "",
            to_customer_id: contactId,
            to_customer_company_name: contact.company_name || cart.to_customer_company_name || "",
            to_customer_name: contact.person_name || customerName || "",
            to_customer_phone: contact.mobile_number || customerMobileNumber,
            to_customer_email: cart.to_customer_email || contact.email_id || "",
            to_customer_gst_number: cart.to_customer_gst_number || contact.gst_number || "",
            to_customer_price_list_id: cart.to_customer_price_list_id || "",
            created_date_time: formattedDateTime,
            a_application_login_id: a_application_login_id,
            company_masters_id: company_masters_id,
            cart_status: 0,
            ...cartItemCustom,
        };
        cartBody.grand_total = cart.grand_total ? (cart.conversion_rate > 0 ? (cart.grand_total * cart.conversion_rate) : cart.grand_total) : 0;
        const t = await tenantSequelize.transaction();
        try {
            const resultCart = await models.carts.create(cartBody, { transaction: t });
            if (!resultCart) {
                await t.rollback();
                return resError({ ack_msg: "Failed to create cart", developer_msg: "Failed to create cart" });
            }
            const cartId = resultCart.id ?? resultCart.dataValues?.id;
            // Build cart items using authoritative product fields from DB
            const cartItemsToCreate = items.map((it) => {
                // find product
                const id = it.item_product_id || it.product_id || null;
                const code = (it.item_product_code || it.product_code) ? String(it.item_product_code || it.product_code) : null;
                let product = null;
                if (id && productById.has(Number(id))) product = productById.get(Number(id));
                else if (code && productByCode.has(code)) product = productByCode.get(code);
                // product object might be a sequelize instance; access dataValues if present
                const p = product && product.dataValues ? product.dataValues : (product || {});
                // compute rate/gst/net rate: prefer p.rate/net_rate and apply conversion if provided
                const conversion = Number(cart.conversion_rate || 1);
                const item_rate_from_db = (typeof p.rate === "number") ? Number(p.rate) : (p.rate ? Number(p.rate) : 0);
                const item_net_rate_from_db = (typeof p.net_rate === "number") ? Number(p.net_rate) : (p.net_rate ? Number(p.net_rate) : item_rate_from_db);
                const item_gst_from_db = (typeof p.GST === "number") ? Number(p.GST) : (p.GST ? Number(p.GST) : 0);
                const item_qty = Number(it.item_qty || it.qty || 1);
                const item_discount_pct = Number(it.item_discount_pct || it.discount_pct || 0);
                // Calculate effective rate (apply conversion rate if necessary)
                const effective_rate = conversion > 0 ? (item_rate_from_db * conversion) : item_rate_from_db;
                const effective_net_rate = conversion > 0 ? (item_net_rate_from_db * conversion) : item_net_rate_from_db;
                // apply discount percent to rate -> discount amount per unit
                const discountAmtPerUnit = (effective_rate * (item_discount_pct / 100));
                const rateAfterDiscount = effective_rate - discountAmtPerUnit;
                const item_total = Number((rateAfterDiscount * item_qty).toFixed(2));
                return {
                    cart_type: Number(cart.type || 2),
                    cart_id: cartId,
                    currency_id: cart.currency_id || 0,
                    conversion_rate: cart.conversion_rate || 1,
                    a_application_login_id: a_application_login_id,
                    referance_cart_id: cart.referance_cart_id,
                    referance_cart_name: cart.referance_cart_name,
                    company_masters_id: company_masters_id,
                    item_category_id: it.item_category_id,
                    item_category_name: it.item_category_name,
                    item_product_description: it.item_product_description || p.product_description || p.product_name || "",
                    item_product_code: p.product_code || code || "",
                    item_product_id: p.id || id,
                    item_product_name: p.product_name || it.item_product_name || "",
                    item_unit_name: it.item_unit_name || it.unit || p.unit || "",
                    item_rate: Number(effective_rate),
                    item_gst: Number(item_gst_from_db),
                    item_net_rate: Number(effective_net_rate),
                    item_qty: item_qty,
                    item_discount_pct: item_discount_pct,
                    item_discount_pr: Number((discountAmtPerUnit * item_qty).toFixed(2)),
                    item_total: Number(item_total),
                    item_hsn_code: p.hsn_code || it.item_hsn_code || "",
                    cart_date: cart.cart_date || moment().format("YYYY-MM-DD"),
                    cart_number: orderType === "approved" ? (financialYearDetail?.order_no || "") : (resultCart.cart_number || ""),
                    isDelete: 0,
                    isActive: 1,
                    created_date_time: formattedDateTime,
                    // pass product custom columns if present on item (or default from product)
                    products_column_number_1: it.products_column_number_1 || p.products_column_number_1 || "",
                    products_column_number_2: it.products_column_number_2 || p.products_column_number_2 || "",
                    products_column_number_3: it.products_column_number_3 || p.products_column_number_3 || "",
                    products_column_number_4: it.products_column_number_4 || p.products_column_number_4 || "",
                    products_column_number_5: it.products_column_number_5 || p.products_column_number_5 || "",
                    products_column_text_1: it.products_column_text_1 || p.products_column_text_1 || "",
                    products_column_text_2: it.products_column_text_2 || p.products_column_text_2 || "",
                    products_column_text_3: it.products_column_text_3 || p.products_column_text_3 || "",
                    products_column_text_4: it.products_column_text_4 || p.products_column_text_4 || "",
                    products_column_text_5: it.products_column_text_5 || p.products_column_text_5 || "",
                    products_column_text_area_1: it.products_column_text_area_1 || p.products_column_text_area_1 || "",
                    products_column_text_area_2: it.products_column_text_area_2 || p.products_column_text_area_2 || "",
                    products_column_text_area_3: it.products_column_text_area_3 || p.products_column_text_area_3 || "",
                    products_column_text_area_4: it.products_column_text_area_4 || p.products_column_text_area_4 || "",
                    products_column_text_area_5: it.products_column_text_area_5 || p.products_column_text_area_5 || "",
                    products_column_date_1: it.products_column_date_1 || p.products_column_date_1 || "",
                    products_column_date_2: it.products_column_date_2 || p.products_column_date_2 || "",
                    products_column_date_3: it.products_column_date_3 || p.products_column_date_3 || "",
                    products_column_date_4: it.products_column_date_4 || p.products_column_date_4 || "",
                    products_column_date_5: it.products_column_date_5 || p.products_column_date_5 || "",
                    products_column_date_and_time_1: it.products_column_date_and_time_1 || p.products_column_date_and_time_1 || "",
                    products_column_date_and_time_2: it.products_column_date_and_time_2 || p.products_column_date_and_time_2 || "",
                    products_column_date_and_time_3: it.products_column_date_and_time_3 || p.products_column_date_and_time_3 || "",
                    products_column_date_and_time_4: it.products_column_date_and_time_4 || p.products_column_date_and_time_4 || "",
                    products_column_date_and_time_5: it.products_column_date_and_time_5 || p.products_column_date_and_time_5 || "",
                    products_column_time_1: it.products_column_time_1 || p.products_column_time_1 || "",
                    products_column_time_2: it.products_column_time_2 || p.products_column_time_2 || "",
                    products_column_time_3: it.products_column_time_3 || p.products_column_time_3 || "",
                    products_column_time_4: it.products_column_time_4 || p.products_column_time_4 || "",
                    products_column_time_5: it.products_column_time_5 || p.products_column_time_5 || "",
                    products_column_switch_1: it.products_column_switch_1 ? 1 : (p.products_column_switch_1 ? 1 : 0),
                    products_column_switch_2: it.products_column_switch_2 ? 1 : (p.products_column_switch_2 ? 1 : 0),
                    products_column_switch_3: it.products_column_switch_3 ? 1 : (p.products_column_switch_3 ? 1 : 0),
                    products_column_switch_4: it.products_column_switch_4 ? 1 : (p.products_column_switch_4 ? 1 : 0),
                    products_column_switch_5: it.products_column_switch_5 ? 1 : (p.products_column_switch_5 ? 1 : 0),
                    products_column_decimal_1: it.products_column_decimal_1 || p.products_column_decimal_1 || "",
                    products_column_decimal_2: it.products_column_decimal_2 || p.products_column_decimal_2 || "",
                    products_column_decimal_3: it.products_column_decimal_3 || p.products_column_decimal_3 || "",
                    products_column_decimal_4: it.products_column_decimal_4 || p.products_column_decimal_4 || "",
                    products_column_decimal_5: it.products_column_decimal_5 || p.products_column_decimal_5 || "",
                    products_column_dropdown_1: it.products_column_dropdown_1 || p.products_column_dropdown_1 || "",
                    products_column_dropdown_2: it.products_column_dropdown_2 || p.products_column_dropdown_2 || "",
                    products_column_dropdown_3: it.products_column_dropdown_3 || p.products_column_dropdown_3 || "",
                    products_column_dropdown_4: it.products_column_dropdown_4 || p.products_column_dropdown_4 || "",
                    products_column_dropdown_5: it.products_column_dropdown_5 || p.products_column_dropdown_5 || "",
                    products_column_radio_1: it.products_column_radio_1 || p.products_column_radio_1 || "",
                    products_column_radio_2: it.products_column_radio_2 || p.products_column_radio_2 || "",
                    products_column_radio_3: it.products_column_radio_3 || p.products_column_radio_3 || "",
                    products_column_radio_4: it.products_column_radio_4 || p.products_column_radio_4 || "",
                    products_column_radio_5: it.products_column_radio_5 || p.products_column_radio_5 || "",
                    contact_master_id: contactId,
                };
            });
            // bulk insert cart items
            const resultCartItems = await models.cart_items.bulkCreate(cartItemsToCreate, { transaction: t });
            if (!resultCartItems) {
                await t.rollback();
                return resError({ ack_msg: "Failed to create cart items", developer_msg: "Failed to create cart items" });
            }
            await t.commit();
            // close tenant connection if provided
            if (tenantSequelize && typeof tenantSequelize.close === "function") {
                try { await tenantSequelize.close(); } catch (e) { /* ignore */ }
            }
            return resSuccess({ ack_msg: "Cart created successfully" });
        } catch (errInner) {
            await t.rollback();
            if (tenantSequelize && typeof tenantSequelize.close === "function") {
                try { await tenantSequelize.close(); } catch (e) { /* ignore */ }
            }
            console.error("Transaction error creating cart:", errInner);
            return resBadRequest({ developer_msg: errInner.message || "Transaction failed" });
        }
    } catch (error) {
        console.error("Error creating order:", error);
        return resBadRequest({ developer_msg: error.message || "Unknown error" });
    }
};

export const getProductCategories = async (req) => {
    try {
        const { qrCode } = req.params;
        const companyData = await companyModel.findOne({
            where: { qr_code: qrCode, isDelete: 0 },
            attributes: ["id", "qr_code", "a_application_login_id"]
        });
        if (!companyData) {
            return res.status(404).json({ error: "Company not found" });
        }
        const tenantId = companyData.a_application_login_id;
        const companyId = companyData.id;
        req.headers["x-tenant-id"] = tenantId;
        const tenantDBInfo = await getTenantDB(tenantId, companyId);
        const tenantSequelize = tenantDBInfo.sequelize;
        const categories = await tenantDBInfo.models.categories.findAll({
            where: { isDelete: 0, isActive: 1 },
            attributes: ["id", "category_name", "color"],
            order: [["category_name", "ASC"]]
        });
        if (tenantSequelize && typeof tenantSequelize.close === 'function') {
            await tenantSequelize.close();
        }
        return resSuccess({
            data: categories
        });
    } catch (error) {
        console.error("Error fetching categories:", error);
        return resError({
            ack_msg: "Failed to fetch categories",
        });
    }
}

export const getAllProducts = async (req) => {
    try {
        const { qrCode } = req.params;
        const {
            page = 1,
            limit = 20,
            search,
            category_id,
            sort_by,
            sort_order,
            min_price,
            max_price,
            is_active,
            mobile_number
        } = req.query;

        const pageNum = page ? Math.max(1, parseInt(page) || 1) : null;
        const limitNum = limit ? Math.min(100, Math.max(1, parseInt(limit) || 20)) : null;
        const offset = pageNum && limitNum ? (pageNum - 1) * limitNum : null;

        const companyData = await companyModel.findOne({
            where: { qr_code: qrCode, isDelete: 0 },
            attributes: ["id", "qr_code", "a_application_login_id"]
        });

        if (!companyData) {
            return resError({
                ack_msg: "Company not found",
                developer_msg: `No company found with QR code`
            });
        }

        const tenantId = companyData.a_application_login_id;
        const companyId = companyData.id;

        req.headers["x-tenant-id"] = tenantId;

        const tenantDBInfo = await getTenantDB(tenantId, companyId);
        const tenantSequelize = tenantDBInfo.sequelize;
        const Products = tenantDBInfo.models.products;
        const ContactMaster = tenantDBInfo.models.contact_masters;
        const CartItem = tenantDBInfo.models.cart_items;

        const contactData = await ContactMaster.findOne({
            where: { mobile_number, isDelete: 0, isActive: 1 },
            attributes: ["id", "mobile_number", "email_id", "person_name", "assinged_to_price_list"]
        });

        if (!contactData) {
            return resError({
                ack_msg: "Contact not found",
                developer_msg: `No contact found with mobile number`
            });
        }
        const priceListMasterData = await tenantDBInfo.models.pricelist_masters.findOne({
            where: { isDelete: 0, company_masters_id: companyId, id: contactData.assinged_to_price_list },
        });

        let priceListsData;
        if (priceListMasterData) {
            priceListsData = await tenantDBInfo.models.price_lists.findAll({
                where: {
                    isDelete: 0,
                    isActive: 1,
                    company_masters_id: companyId,
                    pricelist_masters_id: priceListMasterData.id
                },
                attributes: [
                    'id',
                    'pricelist_masters_id',
                    'company_masters_id',
                    'a_application_login_id',
                    'product_id',
                    'rate',
                    'discount',
                    'net_rate',
                    'created_date_time',
                    'last_updated_date_time',
                    'last_updated_by',
                    'isDelete',
                    'isActive'
                ],
            });
        }
        const whereConditions = {
            isDelete: 0,
            company_masters_id: companyId,
            product_types: 5
        };

        if (search?.trim()) {
            whereConditions[Op.or] = [
                { product_name: { [Op.like]: `%${search.trim()}%` } },
                { product_description: { [Op.like]: `%${search.trim()}%` } }
            ];
        } else {
            // Only apply category_id filter when search is NOT present
            if (category_id) {
                const categoryIds = category_id
                    .split(',')
                    .map((id) => parseInt(id.trim()))
                    .filter((id) => !isNaN(id));

                if (categoryIds.length > 0) {
                    whereConditions.category_id = { [Op.in]: categoryIds };
                }
            }
        }

        if (min_price || max_price) {
            whereConditions.price = {};

            if (min_price && !isNaN(parseFloat(min_price))) {
                whereConditions.price[Op.gte] = parseFloat(min_price);
            }

            if (max_price && !isNaN(parseFloat(max_price))) {
                whereConditions.price[Op.lte] = parseFloat(max_price);
            }

            if (Object.keys(whereConditions.price).length === 0) {
                delete whereConditions.price;
            }
        }

        if (is_active !== undefined) {
            whereConditions.isActive = is_active === '1' ? 1 : 0;
        }

        const allowedSortFields = [
            'product_name', 'net_rate', 'created_date_time', 'updated_date_time',
            'id'
        ];

        let orderClause = undefined;

        if (sort_by && allowedSortFields.includes(sort_by)) {
            const sortDirection = (sort_order || 'ASC').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
            orderClause = [[sort_by, sortDirection]];
        }

        const totalCount = await Products.count({ where: whereConditions });

        const queryOptions = { where: whereConditions };
        if (orderClause) queryOptions.order = orderClause;
        if (limitNum) queryOptions.limit = limitNum;
        if (offset !== null) queryOptions.offset = offset;

        const products = await Products.findAll(queryOptions);

        // 🔽🔽🔽 YAHAN SE CHANGE KIYA HAI (overwrite hata ke price_list attach kiya) 🔽🔽🔽
        let updatedProducts;

        // price map (optional)
        const priceMap = {};

        if (priceListsData && priceListsData.length > 0) {
            priceListsData.forEach(pl => {
                priceMap[pl.product_id] = pl.toJSON ? pl.toJSON() : pl;
            });
        }

        updatedProducts = await Promise.all(
            products.map(async (p) => {
                const productJson = p.toJSON ? p.toJSON() : p;

                // ================== STOCK CALCULATION (ALWAYS) ==================
                const whereClauseOpen = {
                    isDelete: 0,
                    item_product_id: p.id,
                    cart_type: { [Op.in]: [4, 3, 6, 7, 8, 9] },
                    cart_number: { [Op.ne]: null, [Op.not]: "" },
                    stock_type: { [Op.ne]: 0 },
                    [Op.or]: [
                        { a_application_login_id: tenantId },
                        { company_masters_id: companyId },
                    ],
                    [Op.and]: [
                        {
                            [Op.or]: [
                                { cart_type: 4, reference_type: { [Op.ne]: 8 } },
                                { cart_type: 3, reference_type: { [Op.ne]: 9 } },
                                { cart_type: { [Op.in]: [6, 7, 8, 9] } },
                            ],
                        },
                    ],
                };

                const cartItems = await CartItem.findAll({ where: whereClauseOpen });

                const closing_qty = cartItems.reduce((total, item) => {
                    if (
                        (item.cart_type == 4 && item.reference_type != 8) ||
                        item.cart_type == 6 ||
                        item.cart_type == 8
                    ) {
                        return total + item.item_qty;
                    } else if (
                        (item.cart_type == 3 && item.reference_type != 9) ||
                        item.cart_type == 7 ||
                        item.cart_type == 9
                    ) {
                        return total - item.item_qty;
                    }
                    return total;
                }, 0);
                // ================== STOCK CALCULATION END ==================

                const priceListRow = priceMap[p.id];

                return {
                    ...productJson,
                    closing_qty, // ✅ ALWAYS PRESENT
                    ...(priceListRow ? { price_list: priceListRow } : {})
                };
            })
        );

        // 🔼🔼🔼 CHANGE YAHIN TAK HAI 🔼🔼🔼

        const totalPages = pageNum && limitNum ? Math.ceil(totalCount / limitNum) : 1;

        if (tenantSequelize && typeof tenantSequelize.close === 'function') {
            await tenantSequelize.close();
        }

        return resSuccess({
            data: {
                products: updatedProducts,
                pagination: pageNum
                    ? {
                        current_page: pageNum,
                        per_page: limitNum,
                        total_count: totalCount,
                        total_pages: totalPages,
                        has_next_page: pageNum < totalPages,
                        has_prev_page: pageNum > 1,
                        next_page: pageNum < totalPages ? pageNum + 1 : null,
                        prev_page: pageNum > 1 ? pageNum - 1 : null,
                    }
                    : null,
                filters: {
                    search: search || null,
                    category_id: search?.trim() ? null : (category_id || null),
                    min_price: min_price || null,
                    max_price: max_price || null,
                    is_active: is_active || null,
                    sort_by: sort_by || null,
                    sort_order: sort_order || null,
                }
            }
        });
    } catch (error) {
        console.error("Error fetching products:", error);
        return resError({
            ack_msg: "Failed to fetch products",
        });
    }
};

export const getPriceLists = async (req) => {
    try {
        const { qrCode } = req.params;
        const {
            page = 1,
            limit = 20,
            search = '',
            sort_by = 'id',
            sort_order = 'ASC'
        } = req.query;
        const pageNum = Math.max(1, parseInt(page) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
        const offset = (pageNum - 1) * limitNum;
        const companyData = await companyModel.findOne({
            where: { qr_code: qrCode, isDelete: 0 },
            attributes: ["id", "qr_code", "a_application_login_id"]
        });
        if (!companyData) {
            return resError({
                ack_msg: "Company not found",
                developer_msg: `No company found with QR code: ${qrCode}`
            });
        }
        const tenantId = companyData.a_application_login_id;
        const companyId = companyData.id;
        req.headers["x-tenant-id"] = tenantId;
        const tenantDBInfo = await getTenantDB(tenantId, companyId);
        const tenantSequelize = tenantDBInfo.sequelize;
        const pricelist_masters = await tenantDBInfo.models.pricelist_masters.findAll({
            where: { isDelete: 0, isActive: 1, company_masters_id: companyId },
            attributes: ['id', 'price_list_name', 'company_masters_id', 'a_application_login_id', 'effective_from', 'country_id', 'state_id', 'city_id', 'created_date_time', 'isDelete', 'isActive'],
        })
        const pricelists = await tenantDBInfo.models.price_lists.findAll({
            where: { isDelete: 0, isActive: 1, company_masters_id: companyId },
            attributes: ['id', 'pricelist_masters_id', 'company_masters_id', 'a_application_login_id', 'product_id', 'rate', 'discount', 'net_rate', 'created_date_time', 'last_updated_date_time', 'last_updated_by', 'isDelete', 'isActive'],
        });
        if (tenantSequelize && typeof tenantSequelize.close === 'function') {
            await tenantSequelize.close();
        }
        return resSuccess({
            data: { pricelist_masters, pricelists }
        });
    } catch (error) {
        console.error("Error fetching public pricelists:", error);
        return resError({
            ack_msg: "Failed to fetch pricelists",
            developer_msg: error.message
        });
    }
}