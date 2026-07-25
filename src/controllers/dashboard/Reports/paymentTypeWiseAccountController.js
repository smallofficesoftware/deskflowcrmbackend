import callServiceMethod from "../../../controllers/baseController.js";
import { paymentTypeWiseAccountGet } from "../../../services/dashboard/Reports/paymentTypeWiseAccountServices.js";

export const getPaymentTypeWiseAccount = async (req, res) => {
    await callServiceMethod(req, res, paymentTypeWiseAccountGet(req), "paymentTypeWiseAccountGet");
};
