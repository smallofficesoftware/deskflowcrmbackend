import { getWarehouseTransferReport } from "../../services/activities/warehouseTransferReportServices.js";
import callServiceMethod from "../baseController.js";

export const getWarehouseTransferReportProvider = async (req, res) => {
    await callServiceMethod(
        req,
        res,
        getWarehouseTransferReport(req, res),
        "getWarehouseTransferReport"
    );
};
