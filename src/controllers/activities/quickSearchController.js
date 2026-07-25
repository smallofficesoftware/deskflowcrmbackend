import { dynamicOptionsGet } from "../../services/activities/quickSearchServices.js";
import callServiceMethod from "../baseController.js";

export const getDynamicOptions = async (req, res) => {
    await callServiceMethod(req, res, dynamicOptionsGet(req), "dynamicOptionsGet");
};