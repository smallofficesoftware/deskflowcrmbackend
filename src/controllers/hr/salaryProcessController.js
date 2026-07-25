import { getSalaryDetail, proceedToAccount, salaryCalculate, salaryFetch } from "../../services/hr/salaryProcessServices.js";
import callServiceMethod from "../baseController.js";

export const salaryProcessProvider = async (req, res) => {
    await callServiceMethod(req, res, salaryCalculate(req), "salaryProcessProvider");
};

export const salaryFetchProvider = async (req, res) => {
    await callServiceMethod(req, res, salaryFetch(req), "salaryFetchProvider");
};

export const monthlySlipProvider = async (req, res) => {
    await callServiceMethod(req, res, getSalaryDetail(req), "monthlySlipProvider");
};

export const proceedToAccountProvider = async (req, res) => {
    await callServiceMethod(req, res, proceedToAccount(req), "proceedToAccountProvider");
};