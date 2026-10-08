import ejs from "ejs";
import fs from "fs";
import moment from "moment";
import path from "path";
import pdf from "pdf-creator-node";
import { __dirnameConstant, PDF_LINK_EXTENDED_JOB_CARD } from "../../utils/appConstants.js";
import { resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";
import { getCompanyDetailByLoginId } from "../commonServices.js";
import { fetchProductionEntryDetail, fetchProductionList, jobCardsDetails } from "./JobCardServices.js";

// Server-side PDFs for the mobile app (and anything else that wants one): the
// client asks, gets a link, downloads the file and prints it.
//
// Each print copies one of the web's print templates exactly (JobCardPrint,
// JobCardFullPrint, RequiredMaterialPrint, ProductionEntryPrint), and the data
// comes from the same services the web screens use, so a printed sheet always
// matches the web's.

const num = (v) => Number(v) || 0;

// 5 -> "5", 2.5 -> "2.5", 2.125 -> "2.125" (no trailing zeros)
export const fmt = (v) => {
    const s = num(v).toFixed(3);
    return s.replace(/\.?0+$/, "");
};

// The web prints material quantities with three decimals.
const f3 = (v) => num(v).toFixed(3);

// The web shows a dash for an empty value.
const dash = (v) => (v === undefined || v === null || v === "" ? "—" : v);

// What the job card still needs from stock: required minus what its production
// entries already consumed, never below 0 (same rule as the web print).
const pendingOf = (m) => Math.max(0, num(m.required_qty) - num(m.consumed_qty));
const diffOf = (m) => num(m.available_qty) - pendingOf(m);

// 3725 -> "1h 2m 5s"
const duration = (seconds) => {
    const s = num(seconds);
    if (s <= 0) return "0s";
    const parts = [];
    if (Math.floor(s / 3600)) parts.push(`${Math.floor(s / 3600)}h`);
    if (Math.floor((s % 3600) / 60)) parts.push(`${Math.floor((s % 3600) / 60)}m`);
    if (s % 60) parts.push(`${s % 60}s`);
    return parts.join(" ");
};

export const renderPdf = async ({ companyDetail, viewName, data, filePrefix }) => {
    const uploadDir = path.resolve(
        __dirnameConstant,
        `../../media-folder/jobCardPdf/${companyDetail.id.toString()}`
    );
    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
    }
    const fileNameOnly = `${filePrefix}_${Date.now()}.pdf`;
    const filePath = path.join(uploadDir, fileNameOnly);

    const template = fs.readFileSync(
        path.join(__dirnameConstant, `../views/job-card/${viewName}.ejs`),
        "utf-8"
    );
    const html = ejs.render(template, {
        companyName: companyDetail.company_name || "",
        printedAt: moment().format("DD-MM-YYYY HH:mm"),
        fmt,
        f3,
        dash,
        pendingOf,
        diffOf,
        duration,
        ...data,
    });

    await pdf.create(
        { html, data: {}, path: filePath, type: "" },
        {
            format: "A4",
            orientation: "portrait",
            border: "10mm",
            footer: {
                height: "5mm",
                contents: {
                    default: `<span style="color: #444;">{{page}}</span>/<span>{{pages}}</span>`,
                },
            },
        }
    );

    return {
        fileLinkPath: `${PDF_LINK_EXTENDED_JOB_CARD}${companyDetail.id.toString()}/${fileNameOnly}`,
        fileName: fileNameOnly,
    };
};

// The job card prints the web has, by `kind`:
//   "jobCard"          Print Job Card (customer and item details)
//   "master"           Print Master Report (materials plus production history)
//   "requiredMaterial" Required Material Print
// Anything else is treated as "jobCard".
const KINDS = {
    jobCard: { view: "jobCardPrint", prefix: "job_card", name: (id) => `JobCard-${id}` },
    master: { view: "jobCardMasterPrint", prefix: "job_card_master", name: (id) => `JobCardMaster-${id}` },
    requiredMaterial: {
        view: "requiredMaterialPrint",
        prefix: "required_material",
        name: (id) => `RequiredMaterial-${id}`,
    },
};

export const jobCardPdf = async (req) => {
    try {
        const { a_application_login_id, id } = req.body;
        const kindKey = KINDS[req.body.kind] ? req.body.kind : "jobCard";
        const kind = KINDS[kindKey];

        if (!id) {
            return resBadRequest({
                ack_msg: "Job card id is required.",
                developer_msg: "Missing id in req.body",
            });
        }

        const detail = await jobCardsDetails(req);
        if (!detail || detail.ack !== 1) {
            return detail || resError({ ack_msg: "Job card not found." });
        }
        const { contactDetail, itemDetail, bomProcesses } = detail.data;

        const companyDetail = await getCompanyDetailByLoginId(a_application_login_id);
        if (!companyDetail?.id) {
            return resError({ ack_msg: "Company not found." });
        }

        // The master report also lists the production entries.
        let entries = [];
        if (kindKey === "master") {
            req.body.job_id = id;
            const list = await fetchProductionList(req);
            entries = list && list.ack === 1 && Array.isArray(list.data) ? list.data : [];
        }
        const totalProduced = entries.reduce((sum, e) => sum + num(e.produced_qty), 0);

        const file = await renderPdf({
            companyDetail,
            viewName: kind.view,
            filePrefix: `${kind.prefix}_${id}`,
            data: {
                jobCardId: id,
                contact: contactDetail || {},
                item: itemDetail || {},
                itemName: itemDetail?.item_name || "",
                processes: bomProcesses || [],
                entries,
                totalProduced,
            },
        });

        return resSuccess({
            ack_msg: "Pdf generated",
            data: { ...file, title: kind.name(id) },
        });
    } catch (error) {
        console.error("jobCardPdf Error", error);
        return resBadRequest({
            ack_msg: "UNKNOWN_ERROR_TRY_AGAIN",
            developer_msg: `error ${error.message || error}`,
        });
    }
};

// The production entry print: "PRODUCTION ENTRY RECEIPT", like the web's.
export const productionEntryPdf = async (req) => {
    try {
        const { a_application_login_id, id } = req.body;

        if (!id) {
            return resBadRequest({
                ack_msg: "Production Entry ID is required.",
                developer_msg: "Missing id in req.body",
            });
        }

        const detail = await fetchProductionEntryDetail(req);
        if (!detail || detail.ack !== 1) {
            return detail || resError({ ack_msg: "Production entry not found." });
        }
        const entry = detail.data;

        // The receipt names the item of the job card the entry belongs to.
        let itemName = "";
        try {
            req.body.id = entry.job_id;
            const job = await jobCardsDetails(req);
            itemName = job?.ack === 1 ? job.data?.itemDetail?.item_name || "" : "";
        } finally {
            req.body.id = id;
        }

        const companyDetail = await getCompanyDetailByLoginId(a_application_login_id);
        if (!companyDetail?.id) {
            return resError({ ack_msg: "Company not found." });
        }

        const file = await renderPdf({
            companyDetail,
            viewName: "productionEntryReceipt",
            filePrefix: `production_entry_${id}`,
            data: {
                jobCardId: entry.job_id,
                itemName,
                entry: {
                    ...entry,
                    consumption_items: entry.consumption_items || [],
                    rejection_items: entry.rejection_items || [],
                },
            },
        });

        return resSuccess({
            ack_msg: "Pdf generated",
            data: { ...file, title: `ProductionEntry-${id}` },
        });
    } catch (error) {
        console.error("productionEntryPdf Error", error);
        return resBadRequest({
            ack_msg: "UNKNOWN_ERROR_TRY_AGAIN",
            developer_msg: `error ${error.message || error}`,
        });
    }
};
