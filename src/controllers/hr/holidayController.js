import { holidayAdd, holidayGet, holidayUpdate } from "../../services/hr/holidayServices.js";
import callServiceMethod from "../baseController.js";

export const addHoliday = async (req, res) => {
    await callServiceMethod(req, res, holidayAdd(req), "holidayAdd");
};

export const getHoliday = async (req, res) => {
    await callServiceMethod(req, res, holidayGet(req), "holidayGet");
};

export const updateHoliday = async (req, res) => {
    await callServiceMethod(req, res, holidayUpdate(req), "holidayUpdate");
};