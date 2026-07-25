import { Op } from "sequelize";
import { cartModel } from "../../models/activities/cartsModel.js";
import { taskManagementModel } from "../../models/activities/taskManagementModel.js";
import companyModel from "../../models/company_setup/companyModel.js";
import { APP_URL_SMALL_OFFICE_CRM } from "../../utils/appConstants.js";
import { resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../commonServices.js";

export const dynamicOptionsGet = async (req) => {

    const {
        search_term,
        a_application_login_id
    } = req.body;

    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    if (!findCompanyId) {
        return resError({ developer_msg: "Company not found" });
    }

    try {

        const cartModelInstance = cartModel(req.tenantDB)
        const resultOfCarts = await cartModelInstance.findAll({
            where: {
                isDelete: "0",
                cart_number: {
                    [Op.like]: `%${search_term}%`
                }
            },
            attributes: [
                "id",
                "cart_number",
                "type",
            ],
            raw: true
        });

        const viewMap = {
            1: "quotation_view_formate",
            2: "order_view_formate",
            3: "invoice_view_formate",
            4: "purchase_view_formate",
            5: "purchase_order_view_formate",
            6: "return_sales_invoice_view_formate",
            7: "return_purchase_invoice_view_formate",
            8: "inward_view_formate",
            9: "dispatch_view_formate"
        };

        const companyData = await companyModel.findOne({
            where: {
                isDelete: 0,
                id: findCompanyId.company_masters_id,
            },
            raw: true
        });

        const updatedResultOfCarts = resultOfCarts.map((element) => {
            const dynamicPrintView = (element.type === 10 || element.type === 11) ? "" : viewMap[element.type];

            const dynamicViewType = dynamicPrintView
                ? companyData?.[dynamicPrintView]
                : null;

            return {
                ...element,
                link: dynamicViewType
                    ? `${APP_URL_SMALL_OFFICE_CRM}/OrderPrintViewV${dynamicViewType}/${element.id}/1`
                    : (element.type === 10 || element.type === 11) ? `${APP_URL_SMALL_OFFICE_CRM}/StockAdjustmentPrintView/${element.id}` : null
            };
        });

        const isNumeric = !isNaN(search_term) && search_term.trim() !== "";
        const whereCondition = isNumeric
            ? { id: Number(search_term), isDelete: "0" }
            : {
                task_title: {
                    [Op.like]: `%${search_term}%`
                },
                isDelete: "0"
            };

        const taskManagementModelInstance = taskManagementModel(req.tenantDB)
        const resultOfTaskManagement = await taskManagementModelInstance.findAll({
            where: whereCondition,
            attributes: [
                "id",
                "task_title",
                "is_support_ticket",
            ],
            raw: true
        });

        const final = [
            ...updatedResultOfCarts,
            ...resultOfTaskManagement
        ];

        if (final) {
            return resSuccess({
                data: { item: final },
            });
        } else {
            return resError();
        }

    } catch (e) {
        console.log("dynamicOptionsGet error", e)
        return resBadRequest({ developer_msg: `error ${e}` });
    }
};