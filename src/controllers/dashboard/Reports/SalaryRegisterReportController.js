import callServiceMethod from "../../../controllers/baseController.js";
import { salaryRegistrationGet } from "../../../services/dashboard/Reports/SalaryRegisterReportServices.js";

export const getSalaryRegistration = async (req, res) => {
    await callServiceMethod(req, res, salaryRegistrationGet(req), "salaryRegistrationGet");
};