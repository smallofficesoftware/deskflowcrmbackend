import { Op, Sequelize } from "sequelize";
import { routePlannerModel } from "../../models/activities/routePlannerModel.js";
import { routePlanVsContactsModel } from "../../models/activities/routePlanVsContactsModel.js";
import loginModel from "../../models/application_login/loginModel.js";
import { resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../commonServices.js";

export const routesGet = async (req) => {
    try {
        const { ul, ll, a_application_login_id, searchTerm, startSearchDate, endSearchDate, status_options, employee_options } = req.body;

        const limit = Number(ll);
        const offset = Number(ul);

        const whereClause = {
            isDelete: "0",
        }

        whereClause[Op.and] = whereClause[Op.and] || [];

        if (startSearchDate && endSearchDate) {
            whereClause[Op.and].push(
                Sequelize.where(
                    Sequelize.fn("DATE", Sequelize.col("start_date")),
                    {
                        [Op.lte]: endSearchDate,
                    }
                ),
                Sequelize.where(
                    Sequelize.fn("DATE", Sequelize.col("end_date")),
                    {
                        [Op.gte]: startSearchDate,
                    }
                )
            );
        }

        if (Array.isArray(status_options) && status_options.length) {
            whereClause.status_id = {
                [Op.in]: status_options.filter(Number)
            }
        }

        if (Array.isArray(employee_options) && employee_options.length) {
            whereClause.employee_id = {
                [Op.in]: employee_options.filter(Number)
            }
        }

        if (searchTerm) {
            whereClause[Op.and].push({
                [Op.or]: [
                    { remark: { [Op.like]: `%${searchTerm}%` } },
                    { id: Number(searchTerm) || 0 },
                    // {
                    //     country_id: {
                    //         [Op.in]: Sequelize.literal(`(
                    //                 SELECT id
                    //                 FROM a_countries
                    //                 WHERE isDelete = 0
                    //                 AND country_name LIKE '%${searchTerm}%'
                    //               )`),
                    //     },
                    // },
                ],
            });
        }

        const routePlannerModelInstance = routePlannerModel(req.tenantDB);
        const result = await routePlannerModelInstance.findAll({
            where: whereClause,
            attributes: [
                "id",
                "employee_id",
                "start_date",
                "end_date",
                "country_id",
                "state_id",
                "city_id",
                "area_id",
                "status_id",
                "remark",
                "created_date_time",
                "a_application_login_id",
                [
                    Sequelize.literal(`(
                                            SELECT a_countries.country_name
                                            FROM a_countries
                                            WHERE a_countries.id = route_planners.country_id
                                              AND a_countries.isDelete = 0
                                            LIMIT 1
                                          )`),
                    "country_name"
                ],
                [
                    Sequelize.literal(`(
                                            SELECT a_states.state_name
                                            FROM a_states
                                            WHERE a_states.id = route_planners.state_id
                                              AND a_states.isDelete = 0
                                            LIMIT 1
                                          )`),
                    "state_name"
                ],
                [
                    Sequelize.literal(`(
                                            SELECT a_cities.city_name
                                            FROM a_cities
                                            WHERE a_cities.id = route_planners.city_id
                                              AND a_cities.isDelete = 0
                                            LIMIT 1
                                          )`),
                    "city_name"
                ],
                [
                    Sequelize.literal(`(
                                            SELECT a_areas.area_name
                                            FROM a_areas
                                            WHERE a_areas.id = route_planners.area_id
                                              AND a_areas.isDelete = 0
                                            LIMIT 1
                                          )`),
                    "area_name"
                ],
                [
                    Sequelize.literal(
                        "(SELECT stage_status_masters.name FROM stage_status_masters WHERE stage_status_masters.id = route_planners.status_id AND stage_status_masters.isDelete = 0)"
                    ),
                    "stage_status_name",
                ],
                [
                    Sequelize.literal(
                        "(SELECT stage_status_masters.color FROM stage_status_masters WHERE stage_status_masters.id = route_planners.status_id AND stage_status_masters.isDelete = 0)"
                    ),
                    "stage_status_color",
                ],
            ],
            raw: true,
            limit,
            offset,
            order: [
                [
                    Sequelize.literal(`
                        CASE 
                            WHEN DATE(start_date) >= CURDATE() THEN 0
                            ELSE 1
                        END
                    `),
                    "ASC",
                ],
                [
                    Sequelize.literal(`
                        CASE 
                            WHEN DATE(start_date) >= CURDATE() 
                                THEN DATEDIFF(DATE(start_date), CURDATE())
                            ELSE DATEDIFF(CURDATE(), DATE(start_date))
                        END
                    `),
                    "ASC",
                ],
            ]
        });

        let loginWhere = {
            isDelete: 0,
        };

        loginWhere.id = {
            [Op.in]: result.map((rt) => rt.employee_id).filter(Boolean),
        }

        const loginUsers =
            await loginModel.findAll({
                where: loginWhere,
                attributes: ["id", "username"],
                raw: true,
            });

        result.map((rt) => {
            const employee_name = loginUsers.find((emp) => emp.id == rt.employee_id)?.username || "";
            rt.employee_name = employee_name;
        })

        if (result) {
            return resSuccess({
                data: { item: result },
            });
        } else {
            return resError({
                ack_msg: "No Routes found",
                developer_msg: "Data not found",
            });
        }
    } catch (error) {
        console.log("routesGet Error", error);
        return resBadRequest({ developer_msg: `error ${e}` });
    }
};

export const routesAdd = async (req) => {
    try {
        const { a_application_login_id, employee_id, start_date, end_date, country_id, state_id, city_id, area_id, remark } = req.body;

        const findCompanyId = await getCompanyByLoginId(a_application_login_id);

        const routePlannerModelInstance = routePlannerModel(req.tenantDB);

        const doesExist = await routePlannerModelInstance.findOne({
            where: {
                employee_id,
                start_date: {
                    [Op.lte]: end_date,
                },
                end_date: {
                    [Op.gte]: start_date,
                },
                isDelete: 0,
            },
        });

        if (doesExist) {
            return resError({
                ack_msg: "Given Team Member already has Route Planed overlaping with the given dates",
            });
        }

        const insert = await routePlannerModelInstance.create(
            {
                employee_id,
                start_date,
                end_date,
                country_id,
                state_id,
                city_id,
                area_id,
                remark,
                a_application_login_id,
                company_masters_id: findCompanyId.company_masters_id
            }
        );

        if (!insert) {
            return resError({
                ack_msg: "Route Adding Failed",
            });
        }

        return resSuccess({
            ack_msg: "Route Plan Added",
            developer_msg: "Route Plan Added",
        });

    } catch (error) {
        console.log("routesAdd Error", error);
        return resBadRequest({
            ack_msg: "",
            developer_msg: `${error.message}`,
        });
    }
}

export const routesUpdate = async (req) => {
    try {
        const { a_application_login_id, id, employee_id, start_date, end_date, country_id, state_id, city_id, area_id, remark } = req.body;

        const routePlannerModelInstance = routePlannerModel(req.tenantDB);

        const doesExistThisChangedEmpWithSameDate = await routePlannerModelInstance.findAll({
            where: {
                employee_id,
                isDelete: 0,
                start_date: {
                    [Op.lte]: end_date,
                },
                end_date: {
                    [Op.gte]: start_date,
                },
            },
        });

        if (doesExistThisChangedEmpWithSameDate && doesExistThisChangedEmpWithSameDate.length > 1) {
            return resError({
                ack_msg: "Given Team Member already has Planed Routes overlaping with the given dates",
            });
        }

        let isSameId = false;

        if (doesExistThisChangedEmpWithSameDate && doesExistThisChangedEmpWithSameDate.length && (id == doesExistThisChangedEmpWithSameDate[0].id)) {
            isSameId = true;
        }

        if (doesExistThisChangedEmpWithSameDate && doesExistThisChangedEmpWithSameDate.length && !isSameId) {
            return resError({
                ack_msg: "Given Team Member already has Planed Route overlaping with the given dates",
            });
        }

        if (!isSameId) {
            const doesExist = await routePlannerModelInstance.findOne({
                where: { id, isDelete: 0 },
            });

            if (!doesExist) {
                return resError({
                    ack_msg: "Route Plan does not exist",
                });
            }
        }

        const result = await routePlannerModelInstance.update(
            {
                employee_id,
                start_date,
                end_date,
                country_id,
                state_id,
                city_id,
                area_id,
                remark,
            },
            {
                where: { id: id, isDelete: "0" },
            }
        );

        if (!result) {
            return resError({
                ack_msg: "Route Update Failed",
            });
        }

        return resSuccess({
            ack_msg: "Route Updated",
            developer_msg: "Route Updated",
        });

    } catch (error) {
        console.log("routesUpdate Error", error);
        return resBadRequest({
            ack_msg: "",
            developer_msg: `${error.message}`,
        });
    }
}

export const assignedContactsGet = async (req) => {
    try {
        const { a_application_login_id, route_id } = req.body;

        const routePlanVsContactsModelInstance = routePlanVsContactsModel(req.tenantDB);

        const result = await routePlanVsContactsModelInstance.findAll({
            where: { isDelete: "0", route_id },
            attributes: [
                "id",
                "contact_id",
                "a_application_login_id",
                [
                    Sequelize.literal(`(
                                            SELECT contact_masters.person_name
                                            FROM contact_masters
                                            WHERE contact_masters.id = route_plan_vs_contacts.contact_id
                                              AND contact_masters.isDelete = 0
                                            LIMIT 1
                                          )`),
                    "person_name"
                ],
                [
                    Sequelize.literal(`(
                                            SELECT contact_masters.company_name
                                            FROM contact_masters
                                            WHERE contact_masters.id = route_plan_vs_contacts.contact_id
                                              AND contact_masters.isDelete = 0
                                            LIMIT 1
                                          )`),
                    "company_name"
                ],
                [
                    Sequelize.literal(`(
                                            SELECT contact_masters.mobile_number
                                            FROM contact_masters
                                            WHERE contact_masters.id = route_plan_vs_contacts.contact_id
                                              AND contact_masters.isDelete = 0
                                            LIMIT 1
                                          )`),
                    "mobile_number"
                ],
            ],
            raw: true,
        });

        if (result) {
            return resSuccess({
                data: { item: result },
            });
        } else {
            return resError({
                ack_msg: "No Contacts found",
                developer_msg: "Data not found",
            });
        }
    } catch (error) {
        console.log("assignedContactsGet Error", error);
        return resBadRequest({ developer_msg: `error ${e}` });
    }
};

export const assignContactsToRoute = async (req) => {
    try {
        const { a_application_login_id, contact_id, route_id } = req.body;

        const findCompanyId = await getCompanyByLoginId(a_application_login_id);

        const routePlanVsContactsModelInstance = routePlanVsContactsModel(req.tenantDB);

        const doesExist = await routePlanVsContactsModelInstance.findOne({
            where: {
                route_id,
                contact_id: Number(contact_id),
                isDelete: 0,
            },
        });

        if (doesExist) {
            return resError({
                ack_msg: "Contact is assigned already",
            });
        }

        const insert = await routePlanVsContactsModelInstance.create(
            {
                route_id,
                contact_id: Number(contact_id),
                a_application_login_id,
                company_masters_id: findCompanyId.company_masters_id
            }
        );

        if (!insert) {
            return resError({
                ack_msg: "Failed to assign contact",
            });
        }

        return resSuccess({
            ack_msg: "Contact assigned successfully",
            developer_msg: "Contact assigned successfully",
        });

    } catch (error) {
        console.log("assignContactsToRoute Error", error);
        return resBadRequest({
            ack_msg: "",
            developer_msg: `${error.message}`,
        });
    }
}

export const removeContactsFromRoute = async (req) => {
    const { id } = req.body;

    try {
        const routePlanVsContactsModelInstance = routePlanVsContactsModel(req.tenantDB);

        const doesExistData = await routePlanVsContactsModelInstance.findOne({
            where: { id, isDelete: "0" },
            raw: true
        });

        if (!doesExistData) {
            return resError({
                ack_msg: "Contact is not even assigned to be removed",
                developer_msg: "Contact is not even assigned to be removed",
            });
        }

        const result = await routePlanVsContactsModelInstance.update(
            {
                isDelete: "1"
            },
            {
                where: { id }
            }
        );

        if (result) {
            return resSuccess({
                ack_msg: "Contact removed successfully",
                data: { item: result },
            });
        } else {
            return resError({
                ack_msg: "Contact remove failed"
            });
        }

    } catch (error) {
        console.log("removeContactsFromRoute error", error)
        return resBadRequest({
            ack_msg: " ",
            developer_msg: `${error.message}`,
        });
    }
};

export const assignStatusToRoutePlanner = async (req) => {
    const {
        checkedOptions,
        routeId,
        a_application_login_id,
    } = req.body;

    try {
        const routePlannerModelInstance = routePlannerModel(req.tenantDB);
        const isExistData = await routePlannerModelInstance.findOne({
            where: { id: routeId, isDelete: 0 },
            raw: true
        });

        if (!isExistData) {
            return resError({
                ack_msg: "Route Plan does not exist",
                developer_msg: "Route Plan does not exist",
            });
        }

        let statusId = 0;
        if (checkedOptions) {
            statusId = checkedOptions;
        }

        console.log("statusId", statusId)
        console.log("routeId", routeId)

        const result = await routePlannerModelInstance.update(
            {
                status_id: statusId,
            },
            {
                where: { id: routeId, isDelete: 0 },
            }
        );

        if (result) {
            return resSuccess({
                ack_msg: "Status Updated successfully",
                data: { item: result },
            });
        } else {
            return resError();
        }

    } catch (error) {
        console.log("assignStatusToRoutePlanner error", error)
        return resBadRequest({
            ack_msg: " ",
            developer_msg: `${error.message}`,
        });
    }
};