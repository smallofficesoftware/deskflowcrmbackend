import Sequelize, { Op } from "sequelize";
import { priceListMastersModel } from "../../models/product_settings/priceListMastersModel.js";
import { resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../commonServices.js";

export const getAllPriceListMasters = async (req) => {
  try {
    let { searchTerm, a_application_login_id } = req.body;
    const findCompanyId = await getCompanyByLoginId(a_application_login_id);

    let whereClause = {
      [Op.or]: [
        { a_application_login_id: a_application_login_id },
        // { assinged_to_work_a_application_id: a_application_login_id },
        { company_masters_id: findCompanyId.company_masters_id },
      ],

      isDelete: "0",
    };

    if (searchTerm) {
      whereClause = {
        [Op.or]: [{ price_list_name: { [Op.like]: "%" + searchTerm + "%" } }],
        [Op.or]: [
          { a_application_login_id: a_application_login_id },
          { company_masters_id: findCompanyId.company_masters_id },
        ], // Assuming a_application_login_id is defined somewhere in your code
        isDelete: "0",
      };
    } else {
    }
    const priceListModel = priceListMastersModel(req.tenantDB)
    const resultPriceListMaster = await priceListModel.findAll({
      where: whereClause,
      order: [["id", "DESC"]],
      attributes: {
        include: [
          [
            Sequelize.literal(
              "(SELECT a_countries.country_name FROM a_countries WHERE a_countries.id = pricelist_masters.country_id )"
            ),
            "country_name",
          ],
          [
            Sequelize.literal(
              "(SELECT a_states.state_name FROM a_states WHERE a_states.id = pricelist_masters.state_id )"
            ),
            "state_name",
          ],
          [
            Sequelize.literal(
              "(SELECT a_cities.city_name FROM a_cities WHERE a_cities.id = pricelist_masters.city_id )"
            ),
            "city_name",
          ],
        ],
      },
    });
    if (resultPriceListMaster) {
      return resSuccess({
        data: { item: resultPriceListMaster },
      });
    } else {
      return resError({
        ack_msg: "No price List Masters",
        developer_msg: "Data not found",
      });
    }
  } catch (e) {
    return resBadRequest({ developer_msg: `error ${e}` });
    throw e;
  }
};
