import { getReportCatalog } from "../../services/report_catalog/reportCatalogServices.js";
import callServiceMethod from "../baseController.js";

export const getReportCatalogProvider = async (req, res) => {
    await callServiceMethod(req, res, getReportCatalog(req), "getReportCatalog");
};
