
import { CreateWarehouse, fetchwarehouse } from "../../services/other_settings/warehouseService.js";
import callServiceMethod from "../baseController.js";

export const getwarehouse = async (req, res) => {
    await callServiceMethod(
        req,
        res,
        fetchwarehouse(req),
        "addCustomFieldFrom"
    );
};
export const WareHouseCreate = async (req, res) => {
    await callServiceMethod(
        req,
        res,
        CreateWarehouse(req),
        "addCustomFieldFrom"
    );
};