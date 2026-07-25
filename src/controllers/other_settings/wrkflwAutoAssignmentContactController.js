
import { fetchAutoAssignmentContactDetail, insertAutoAssignmentContactDetail, updateWhatappTemplateID } from "../../services/other_settings/wrkflwAutoAssignmentContactService.js";
import callServiceMethod from "../baseController.js";

export const addAutoAssignmentContactDetail = async (req, res) => {
    await callServiceMethod(
        req,
        res,
        insertAutoAssignmentContactDetail(req),
        "addAutoAssignmentContactDetail"
    );
};

export const getAutoAssignmentContactDetail = async (req, res) => {
    await callServiceMethod(
        req,
        res,
        fetchAutoAssignmentContactDetail(req),
        "addAutoAssignmentContactDetail"
    );
};

export const updateWhatappTemplateIDProvider = async (req, res) => {
    await callServiceMethod(
        req,
        res,
        updateWhatappTemplateID(req),
        "updateWhatappTemplateIDProvider"
    );
};