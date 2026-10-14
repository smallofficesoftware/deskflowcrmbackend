import { generateInvoicePdf } from "../../services/miracle/miracleInvoicePdfService.js";
import callServiceMethod from "../baseController.js";

export const generateInvoicePdfProvider = async (req, res) => {
    await callServiceMethod(
        req,
        res,
        generateInvoicePdf(req),
        "generateInvoicePdfProvider"
    );
};
