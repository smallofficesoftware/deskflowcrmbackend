import ejs from "ejs";
import fs from "fs";
import moment from "moment";
import path from "path";
import pdf from "pdf-creator-node";
import { __dirnameConstant, PDF_LINK_EXTENDED_JOB_CARD } from "../../utils/appConstants.js";
import { resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";
import { getCompanyDetailByLoginId } from "../commonServices.js";
import { fetchProductionEntryDetail, jobCardsDetails } from "./JobCardServices.js";

// Server-side PDFs for the mobile app (and anything else that wants one):
// the client asks, gets a link, downloads the file and prints it. The data
// comes from the same services the web screens use (jobCardsDetails /
// fetchProductionEntryDetail), so a printed sheet always matches the screen.

const num = (v) => Number(v) || 0;

// 5 -> "5", 2.5 -> "2.5", 2.125 -> "2.125" (no trailing zeros)
const fmt = (v) => {
    const s = num(v).toFixed(3);
    return s.replace(/\.?0+$/, "");
};

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

const renderPdf = async ({ companyDetail, viewName, data, filePrefix }) => {
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

// kind: "jobCard" (customer, item, required material with stock) or "bom"
// (just the processes and their materials).
export const jobCardPdf = async (req) => {
    try {
        const { a_application_login_id, id } = req.body;
        const kind = req.body.kind === "bom" ? "bom" : "jobCard";

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

        const targetQty = req.body.production_qty != null && req.body.production_qty !== ""
            ? num(req.body.production_qty)
            : null;

        const file = await renderPdf({
            companyDetail,
            viewName: "jobCardPdf",
            filePrefix: kind === "bom" ? `bom_${id}` : `job_card_${id}`,
            data: {
                kind,
                title: kind === "bom" ? "Bill of Material" : `Job Card #${id}`,
                contact: contactDetail,
                item: itemDetail,
                targetQty,
                processes: bomProcesses || [],
            },
        });

        return resSuccess({
            ack_msg: "Pdf generated",
            data: { ...file, title: kind === "bom" ? `BOM-${id}` : `JobCard-${id}` },
        });
    } catch (error) {
        console.error("jobCardPdf Error", error);
        return resBadRequest({
            ack_msg: "UNKNOWN_ERROR_TRY_AGAIN",
            developer_msg: `error ${error.message || error}`,
        });
    }
};

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

        const companyDetail = await getCompanyDetailByLoginId(a_application_login_id);
        if (!companyDetail?.id) {
            return resError({ ack_msg: "Company not found." });
        }

        const file = await renderPdf({
            companyDetail,
            viewName: "productionEntryPdf",
            filePrefix: `production_entry_${id}`,
            data: {
                entry,
                dateText: entry.entry_date ? moment(entry.entry_date).format("DD-MM-YYYY") : "",
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
