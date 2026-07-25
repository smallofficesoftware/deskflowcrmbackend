import { Op } from "sequelize";
import { accountTransactionsModel } from "../../../models/activities/accountTransactionsModel.js";
import { paymentTypeModel } from "../../../models/activities/paymentTypeModel.js";
import { resBadRequest, resSuccess } from "../../../utils/sharedFunctions.js";

export const paymentTypeWiseAccountGet = async (req) => {

    const {
        a_application_login_id,
    } = req.body;

    const selectedDates = req.body.selectedDates || [];

    const startDate = new Date(selectedDates[0]);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(selectedDates[1]);
    endDate.setHours(23, 59, 59, 999);

    try {

        const accountTransactionsModelInstance = accountTransactionsModel(req.tenantDB);
        const paymentTypeModelInstance = paymentTypeModel(req.tenantDB);

        const paymentTypes = await paymentTypeModelInstance.findAll({
            where: { isDelete: "0" },
            attributes: [
                "id",
                "payment_type_name",
                "payment_color",
            ],
            raw: true
        });

        const result = await Promise.all(
            paymentTypes.map(async (type) => {
                const transactions = await accountTransactionsModelInstance.findAll({
                    where: {
                        isDelete: "0",
                        payment_date_time: {
                            [Op.between]: [startDate, endDate],
                        },
                        mode: type.id,
                    },
                    attributes: ["type", "amount"],
                    raw: true,
                });

                const creditAmount = transactions.reduce(
                    (sum, txn) =>
                        txn.type === 1
                            ? sum + Number(txn.amount || 0)
                            : sum,
                    0
                );

                const debitAmount = transactions.reduce(
                    (sum, txn) =>
                        txn.type === 2
                            ? sum + Number(txn.amount || 0)
                            : sum,
                    0
                );

                return {
                    id: type.id,
                    payment_type_name: type.payment_type_name,
                    payment_color: type.payment_color,
                    credit_amount: creditAmount,
                    debit_amount: debitAmount,
                }
            })
        )

        return resSuccess({
            data: { item: result },
        });

    } catch (e) {
        console.log("paymentTypeWiseAccountGet error", e)
        return resBadRequest({ developer_msg: `error ${e}` });
    }
};