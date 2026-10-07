import { productBillOfMaterialModel } from "../../models/product_settings/productBillOfMaterialModel.js";
import { resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";
import { getCompanyDetailByLoginId } from "../commonServices.js";
import { allBomDataGet } from "../product_settings/productBillOfMaterialServices.js";
import { fmt, renderPdf } from "./jobCardPdfServices.js";

// The BOM sheet the web prints (BomPdfView), made on the server so the mobile
// app can download and print it. The data comes from the same service the web
// page uses (allBomDataGet), so the two always agree.

const num = (v) => Number(v) || 0;
const money = (v) => num(v).toFixed(2);

// 3725 -> "01:02:05"
const hms = (seconds) => {
    const t = Math.max(0, num(seconds));
    const two = (n) => String(n).padStart(2, "0");
    return `${two(Math.floor(t / 3600))}:${two(Math.floor((t % 3600) / 60))}:${two(t % 60)}`;
};

const FREQUENCY = { 1: "Weekly", 2: "Monthly", 3: "Half Yearly", 4: "Yearly" };

export const bomPdf = async (req) => {
    try {
        const { a_application_login_id, product_id } = req.body;

        if (!product_id) {
            return resBadRequest({
                ack_msg: "Product id is required.",
                developer_msg: "Missing product_id in req.body",
            });
        }

        // allBomDataGet needs the BOM id for the cost totals; find it when the
        // caller only knows the product.
        if (!req.body.bom_id) {
            const bom = await productBillOfMaterialModel(req.tenantDB).findOne({
                where: { product_id, isDelete: "0" },
                attributes: ["id"],
                raw: true,
            });
            if (!bom) {
                return resError({ ack_msg: "This product has no Bill Of Material." });
            }
            req.body.bom_id = bom.id;
        }

        const all = await allBomDataGet(req);
        if (!all || all.ack !== 1) {
            return all || resError({ ack_msg: "Bill Of Material not found." });
        }
        const { bom_details, process_list, item_list, costing, product, currency_data } =
            all.data.item;
        if (!bom_details || !product) {
            return resError({ ack_msg: "Bill Of Material not found." });
        }

        const companyDetail = await getCompanyDetailByLoginId(a_application_login_id);
        if (!companyDetail?.id) {
            return resError({ ack_msg: "Company not found." });
        }

        const processes = (process_list || []).map((p) => {
            const mine = (item_list || []).filter((i) => Number(i.process_id) === Number(p.id));
            return {
                ...p,
                consumption: mine.filter((i) => Number(i.type) === 1),
                rejection: mine.filter((i) => Number(i.type) === 2),
            };
        });

        // Same sums as the web page and the costing screen.
        const totalCost =
            num(costing?.process_grand_total) +
            num(costing?.total_cons_cost) +
            num(costing?.extra_charges_1) +
            num(costing?.extra_charges_2) -
            num(costing?.total_reject_cost);
        const profit = num(costing?.sales_rate) - totalCost;
        const profitPercent = totalCost === 0 ? 0 : (profit / totalCost) * 100;

        const file = await renderPdf({
            companyDetail,
            viewName: "bomPdf",
            filePrefix: `bom_sheet_${product_id}`,
            data: {
                product,
                bom: bom_details,
                frequency: FREQUENCY[Number(bom_details.bom_review_frequency)] || "-",
                currency: currency_data?.currency || "",
                costing: costing || {},
                totalCost,
                profit,
                profitPercent,
                processes,
                money,
                hms,
                fmt,
            },
        });

        return resSuccess({
            ack_msg: "Pdf generated",
            data: { ...file, title: `BOM-${product.product_code || product_id}` },
        });
    } catch (error) {
        console.error("bomPdf Error", error);
        return resBadRequest({
            ack_msg: "UNKNOWN_ERROR_TRY_AGAIN",
            developer_msg: `error ${error.message || error}`,
        });
    }
};
