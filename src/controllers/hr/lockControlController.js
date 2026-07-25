import { lockcontrolAdd, lockcontrolGet } from "../../services/hr/lockcontrolServices.js";
import callServiceMethod from "../baseController.js";

export const addlockcontrol = async (req, res) => {
    await callServiceMethod(req, res, lockcontrolAdd(req), "lockcontrolAdd");
};

export const getlockcontrol = async (req, res) => {
    await callServiceMethod(req, res, lockcontrolGet(req), "lockcontrolGet");
};