import { Op } from "sequelize";
import { sourceTypesModel } from "../../models/masters/sourceTypeMode.js";
import {
  resBadRequest,
  resError,
  resSuccess,
} from "../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../commonServices.js";

export const getAllSourceOfTypes = async (req) => {
  try {
    let { ul, ll } = req.body;
    let { searchTerm, a_application_login_id, searchCategoryId } = req.body;
    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    const sourceModel = sourceTypesModel(req.tenantDB);
    let whereClause = {
      [Op.or]: [
        { a_application_login_id: a_application_login_id },
        { company_masters_id: findCompanyId.company_masters_id },
        { id: { [Op.lt]: 0 } },
      ],

      isDelete: "0",
    };

    if (searchTerm) {
      whereClause = {
        [Op.or]: [{ product_name: { [Op.like]: "%" + searchTerm + "%" } }],
        [Op.or]: [
          { a_application_login_id: a_application_login_id },
          { company_masters_id: findCompanyId.company_masters_id },
        ], // Assuming a_application_login_id is defined somewhere in your code
        isDelete: "0",
      };
    } else {
    }

    const resultSourceOfTypes = await sourceModel.findAll({
      where: whereClause,
      order: [["id", "DESC"]],
    });

    if (resultSourceOfTypes)
      return resSuccess({
        data: { item: resultSourceOfTypes },
      });
    else {
      return resError({
        ack_msg: "No Source of Types",
        developer_msg: "Data not found",
      });
    }
  } catch (e) {
    return resBadRequest({ developer_msg: `error ${e}` });
    throw e;
  }
};
