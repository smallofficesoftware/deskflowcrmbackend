import { decryptRequestForMultipart } from "../../middlewares/payloadSecurity.js";
import { getAllLeaves, leaveCreate, leaveUpdate } from "../../services/hr/leaveServices.js";
import callServiceMethod from "../baseController.js";


export const allLeave = async (req, res) => {
    await callServiceMethod(
        req,
        res,
        getAllLeaves(req),
        "allLeave"
    );
};

export const createLeave = async (req, res) => {
    decryptRequestForMultipart(req);
    await callServiceMethod(req, res, leaveCreate(req), "createLeave");
};
export const updateLeave = async (req, res) => {
    decryptRequestForMultipart(req);
    await callServiceMethod(req, res, leaveUpdate(req), "updateLeave");
};
