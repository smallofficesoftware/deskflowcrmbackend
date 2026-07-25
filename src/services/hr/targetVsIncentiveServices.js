import Sequelize, { Op } from "sequelize";
import loginModel from "../../models/application_login/loginModel.js";
import { targetVsIncentiveModel } from "../../models/hr/targetVsIncentiveModel.js";
import {
  resBadRequest,
  resError,
  resSuccess,
} from "../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../commonServices.js";

export const getAllTargetVsIncentives = async (req) => {
  try {
    const { ul, ll, a_application_login_id, searchTerm } = req.body;
    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    const targetVsIncentive = targetVsIncentiveModel(req.tenantDB);

    let whereClause = {
      [Op.or]: [
        { a_application_login_id: a_application_login_id },
        { assigned_team_member: a_application_login_id },
      ],
      isDelete: "0",
      company_masters_id: findCompanyId.company_masters_id,
    };

    // Add company owner condition
    if (findCompanyId.company_flag === 1) {
      whereClause = {
        isDelete: "0",
        company_masters_id: findCompanyId.company_masters_id,
      };
    }

    if (searchTerm) {
      if (findCompanyId.company_flag === 1) {
        // Company owner search condition
        whereClause = {
          [Op.and]: [
            {
              [Op.or]: [
                { target_flag: { [Op.like]: `%${searchTerm}%` } },
                Sequelize.where(Sequelize.fn("DATE_FORMAT", Sequelize.col("target_todate"), "%Y-%m-%d"), {
                  [Op.like]: `%${searchTerm}%`,
                }),
                Sequelize.where(Sequelize.fn("DATE_FORMAT", Sequelize.col("target_fromdate"), "%Y-%m-%d"), {
                  [Op.like]: `%${searchTerm}%`,
                }),
                Sequelize.where(Sequelize.cast(Sequelize.col("target_value"), "CHAR"), {
                  [Op.like]: `%${searchTerm}%`,
                }),
                Sequelize.where(Sequelize.cast(Sequelize.col("target_count"), "CHAR"), {
                  [Op.like]: `%${searchTerm}%`,
                }),
              ],
            },
            { isDelete: "0" },
            { company_masters_id: findCompanyId.company_masters_id },
          ],
        };
      } else {
        // Regular user search condition (original)
        whereClause = {
          [Op.and]: [
            {
              [Op.or]: [
                { target_flag: { [Op.like]: `%${searchTerm}%` } },
                Sequelize.where(Sequelize.fn("DATE_FORMAT", Sequelize.col("target_todate"), "%Y-%m-%d"), {
                  [Op.like]: `%${searchTerm}%`,
                }),
                Sequelize.where(Sequelize.fn("DATE_FORMAT", Sequelize.col("target_fromdate"), "%Y-%m-%d"), {
                  [Op.like]: `%${searchTerm}%`,
                }),
                Sequelize.where(Sequelize.cast(Sequelize.col("target_value"), "CHAR"), {
                  [Op.like]: `%${searchTerm}%`,
                }),
                Sequelize.where(Sequelize.cast(Sequelize.col("target_count"), "CHAR"), {
                  [Op.like]: `%${searchTerm}%`,
                }),
              ],
            },
            {
              [Op.or]: [
                { a_application_login_id: a_application_login_id },
                { assigned_team_member: a_application_login_id },
              ],
            },
            { isDelete: "0" },
            { company_masters_id: findCompanyId.company_masters_id },
          ],
        };
      }
    }

    const resultSourceOfTypes = await targetVsIncentive.findAll({
      where: whereClause,
      order: [["id", "DESC"]],
    });

    const assignedIds = resultSourceOfTypes
      .map(item => item.assigned_team_member)
      .filter(id => id);
    const users = await loginModel.findAll({
      where: {
        id: { [Op.in]: assignedIds },
        isDelete: 0
      },
      attributes: ["id", "username"],
      raw: true
    });
    const userMap = new Map(
      users.map(user => [user.id, user.username])
    );
    const formattedResult = resultSourceOfTypes.map(item => {
      const data = item.toJSON();
      return {
        ...data,
        assigned_team_member_name: userMap.get(data.assigned_team_member) || null
      };
    });

    if (formattedResult)
      return resSuccess({
        data: { item: formattedResult },
      });
    else {
      return resError({
        ack_msg: "No Target Data",
        developer_msg: "Data not found",
      });
    }
  } catch (e) {
    return resBadRequest({ developer_msg: `error ${e}` });
    throw e;
  }
};