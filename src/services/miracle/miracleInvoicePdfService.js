// Download a synced invoice's printable PDF from Miracle Cloud ERP.
//
//   POST /generate-invoice-pdf  { a_application_login_id, cart_id }
//     -> { fileName, filePath, url }
//
// Uses TPA/M2/V1/GenerateFile with rptType RPT003 (Voucher / Bill Printing):
// uniqueId is the voucher id Miracle returned when the invoice was synced
// (carts.miracle_UniqueId). Only available when the company's Miracle
// integration is on (checkMiracleAuth supplies req.body.mconfig).
import fs from "fs-extra";
import path from "path";
import { cartModel } from "../../models/activities/cartsModel.js";
import { MIRACLE_LEDGER_PDF } from "../../utils/appConstants.js";
import { createAxiosIntance } from "../../utils/miracleAxiosInstance.js";
import { isValid, resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";

// Saved beside the ledger PDFs so the existing /mcusledger static route serves it.
async function savePdf(base64Data, fileName, company_id) {
    const base64Clean = String(base64Data).replace(/^data:application\/pdf;base64,/, "");
    const directoryPath = path.join(process.cwd(), "media-folder", "miracle", "ledger", String(company_id));
    await fs.mkdir(directoryPath, { recursive: true });
    const filePath = path.join(directoryPath, fileName);
    await fs.writeFile(filePath, base64Clean, "base64");
    return { fileName, filePath };
}

export const generateInvoicePdf = async (req) => {
    try {
        const { cart_id, mconfig } = req.body;
        const { client_id, api_key, baseurl, company_id } = mconfig;

        if (!isValid(cart_id)) {
            return resError({ ack_msg: "cart_id is required" });
        }

        const cart = await cartModel(req.tenantDB).findOne({
            where: { isDelete: 0, id: cart_id },
            attributes: ["id", "cart_number", "miracle_UniqueId"],
            raw: true,
        });

        if (!cart) {
            return resError({ ack_msg: "Invoice not found" });
        }

        if (!isValid(cart.miracle_UniqueId)) {
            return resError({ ack_msg: "This invoice is not synced to Miracle yet. Sync it first." });
        }

        const api = createAxiosIntance({
            baseURL: baseurl,
            clientId: client_id,
            apiKey: api_key,
            tenantDB: req.tenantDB,
            getAuthContext: async () => req.body.mconfig,
        });

        const response = await api.post("tpa/M2/V1/GenerateFile", {
            rptType: "RPT003",
            uniqueId: cart.miracle_UniqueId,
        });

        const { IsError, Message, DataModel, FileName, ErrorCode } = response.data || {};

        if (IsError) {
            return resBadRequest({
                ack_msg: Message,
                developer_msg: ErrorCode ? `Error Code: ${ErrorCode}` : Message,
            });
        }

        // API guide v1.3: DataModel is { fileName, pdfBase64 }; older replies
        // returned the Base64 string directly with FileName beside it.
        const pdfBase64 = typeof DataModel === "string" ? DataModel : DataModel?.pdfBase64;
        if (!pdfBase64) {
            return resBadRequest({
                ack_msg: "Miracle did not return a PDF for this invoice.",
                developer_msg: "GenerateFile RPT003 response had no pdfBase64",
            });
        }

        const safeNumber = String(cart.cart_number || cart.id).replace(/[^A-Za-z0-9_-]/g, "_");
        const pdfName = `invoice_${safeNumber}_${Date.now()}.pdf`;
        const { fileName, filePath } = await savePdf(pdfBase64, pdfName, company_id);

        return resSuccess({
            ack_msg: Message || "Invoice PDF generated.",
            data: {
                fileName,
                filePath,
                url: `${MIRACLE_LEDGER_PDF}${company_id}/${fileName}`,
                miracleFileName: DataModel?.fileName || FileName || null,
            },
        });
    } catch (error) {
        console.log("generateInvoicePdf error", error);

        const apiErrorMessage = error.response?.data?.Message || error.message;
        const apiErrorCode = error.response?.data?.ErrorCode || null;

        return resBadRequest({
            ack_msg: apiErrorMessage,
            developer_msg: apiErrorCode ? `Error Code: ${apiErrorCode}` : error.message,
        });
    }
};
