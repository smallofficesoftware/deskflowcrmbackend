import { Op, Sequelize } from "sequelize";
import companyVsApplicationLoginModel from "../../models/company_setup/companyVsApplicationLoginModel.js";
import { wareHouseModel } from "../../models/other_settings/wareHouseModel.js";
import { resError, resSuccess } from "../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../commonServices.js";

export const fetchwarehouse = async (req) => {
    try {
        const { a_application_login_id } = req.body;

        const findCompanyId = await getCompanyByLoginId(
            a_application_login_id
        );

        const warehoueModels = wareHouseModel(req.tenantDB);

        const warehouse = await warehoueModels.findAll({
            where: {
                isDelete: 0,

                [Op.or]: [
                    {
                        assigned_team_member: {
                            [Op.is]: null,
                        },
                    },
                    {
                        assigned_team_member: "",
                    },

                    Sequelize.where(
                        Sequelize.fn(
                            "FIND_IN_SET",
                            a_application_login_id,
                            Sequelize.col("assigned_team_member")
                        ),
                        {
                            [Op.gt]: 0,
                        }
                    ),
                ],
            },
        });

        if (warehouse && warehouse.length > 0) {
            return resSuccess({
                ack_msg: "warehouse Get Successfully",
                data: { item: warehouse },
            });
        } else {
            return resError({
                ack_msg: "No warehouse found",
                developer_msg: "Data not found",
            });
        }
    } catch (error) {
        console.log("fetchwarehouse error", error);

        return resError({
            ack_msg: "Error",
            developer_msg: error.message,
        });
    }
};


export const CreateWarehouse = async (req) => {
    try {
        const { a_application_login_id, warehouseInput } = req.body;

        const findCompanyId = await getCompanyByLoginId(
            a_application_login_id
        );

        const warehoueModels = wareHouseModel(req.tenantDB);

        // Get all team members of company
        const FindTeamMamber = await companyVsApplicationLoginModel.findAll({
            where: {
                company_masters_id: findCompanyId.company_masters_id,
                isDelete: 0,
            },
            attributes: ["a_application_login_id"],
            raw: true,
        });

        // Convert to comma separated string
        const assignedTeamMembers = FindTeamMamber
            .map((item) => item.a_application_login_id)
            .join(",");

        // Create warehouse
        const createWarehouse = await warehoueModels.create({
            ...warehouseInput,

            company_masters_id: findCompanyId.company_masters_id,
            a_application_login_id: a_application_login_id,
            assigned_team_member: assignedTeamMembers,
        });

        return resSuccess({
            ack_msg: "Warehouse Created Successfully",
            data: createWarehouse,
        });

    } catch (error) {
        console.log("fetchwarehouse error", error);

        return resError({
            ack_msg: "Error",
            developer_msg: error.message,
        });
    }
};

// export const UpdateWarehouse = async (req) => {
//   try {
//     const { a_application_login_id, warehouseInput, warehouse_id } = req.body;

//     const findCompanyId = await getCompanyByLoginId(
//       a_application_login_id
//     );

//     const warehoueModels = wareHouseModel(req.tenantDB);

//     // Get all active team members of company
//     const FindTeamMamber = await companyVsApplicationLoginModel.findAll({
//       where: {
//         company_master_id: findCompanyId.company_master_id,
//         isDelete: 0,
//       },
//       attributes: ["a_application_login_id"],
//       raw: true,
//     });

//     // Convert all ids into comma separated string
//     const assignedTeamMembers = FindTeamMamber
//       .map((item) => item.a_application_login_id)
//       .join(",");

//     // Update warehouse
//     await warehoueModels.update(
//       {
//         ...warehouseInput,

//         assigned_team_member: assignedTeamMembers,

//         modify_by: a_application_login_id,
//         modify_date: new Date(),
//       },
//       {
//         where: {
//           id: warehouse_id,
//           isDelete: 0,
//         },
//       }
//     );

//     // Get updated warehouse
//     const updatedWarehouse = await warehoueModels.findOne({
//       where: {
//         id: warehouse_id,
//       },
//     });

//     return resSuccess({
//       ack_msg: "Warehouse Updated Successfully",
//       data: updatedWarehouse,
//     });

//   } catch (error) {
//     console.log("UpdateWarehouse error", error);

//     return resError({
//       ack_msg: "Error",
//       developer_msg: error.message,
//     });
//   }
// };