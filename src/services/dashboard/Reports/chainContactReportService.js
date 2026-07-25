import { Op, col, fn } from "sequelize";
import { contactModel } from "../../../models/activities/contactModel.js";
import { areaModel } from "../../../models/masters/areaModel.js";
import { cityModel } from "../../../models/masters/cityModel.js";
import { countryModel } from "../../../models/masters/countryModel.js";
import { stagestatusModel } from "../../../models/masters/stagestatusModel.js";
import { stateModel } from "../../../models/masters/stateModel.js";
import { resError, resSuccess } from "../../../utils/sharedFunctions.js";

export const getAllContactChainWise = async (req) => {
    try {
        const { selectedContactId } = req.body;

        const Contact = contactModel(req.tenantDB);

        let childWhere = {
            referance_contact: { [Op.ne]: null }
        };
        if (selectedContactId) {
            childWhere.referance_contact = selectedContactId;   // ← Yahaan filter lag raha hai
        }

        const grouped = await Contact.findAll({
            attributes: [
                "referance_contact",
                [fn("COUNT", col("id")), "child_count"]
            ],
            where: childWhere,
            group: ["referance_contact"],
            raw: true
        });

        const parentIds = grouped.map(g => g.referance_contact);

        if (!parentIds.length) {
            return resSuccess({
                data: { item: [] },
                ack_msg: "No chain data found"
            });
        }

        const parents = await Contact.findAll({
            where: { id: { [Op.in]: parentIds } },
            attributes: ["id", "person_name", "company_name", "mobile_number"],
            raw: true
        });

        const chainContact = await Contact.findAll({
            where: { referance_contact: { [Op.in]: parentIds } },
            attributes: [
                "id",
                "referance_contact",
                "person_name",
                "mobile_number",
                "company_name",
                "contact_status",
                "country",
                "state",
                "city",
                "area",
                "created_date_time",
                "address"
            ],
            raw: true
        });

        const [countries, states, cities, areas, statuses] = await Promise.all([
            countryModel(req.tenantDB).findAll({ attributes: ["id", "country_name"], raw: true }),
            stateModel(req.tenantDB).findAll({ attributes: ["id", "state_name"], raw: true }),
            cityModel(req.tenantDB).findAll({ attributes: ["id", "city_name"], raw: true }),
            areaModel(req.tenantDB).findAll({ attributes: ["id", "area_name"], raw: true }),
            stagestatusModel(req.tenantDB).findAll({ attributes: ["id", "name", "color"], raw: true }),
        ]);

        const countryMap = new Map(countries.map(c => [c.id, c.country_name]));
        const stateMap = new Map(states.map(s => [s.id, s.state_name]));
        const cityMap = new Map(cities.map(c => [c.id, c.city_name]));
        const areaMap = new Map(areas.map(a => [a.id, a.area_name]));
        const statusMap = new Map(statuses.map(s => [s.id, { name: s.name, color: s.color }]));

        const childrenMap = new Map();

        chainContact.forEach(child => {
            const status = statusMap.get(child.contact_status) || {};

            const enrichedChild = {
                id: child.id,
                referance_contact: child.referance_contact,
                person_name: child.person_name,
                address: child.address,
                mobile_number: child.mobile_number,
                company_name: child.company_name,
                status_name: status.name || "",
                status_colour: status.color || "",
                country_name: countryMap.get(child.country) || "",
                state_name: stateMap.get(child.state) || "",
                city_name: cityMap.get(child.city) || "",
                area_name: areaMap.get(child.area) || "",
                created_date_time: child.created_date_time
            };

            if (!childrenMap.has(child.referance_contact)) {
                childrenMap.set(child.referance_contact, []);
            }

            childrenMap.get(child.referance_contact).push(enrichedChild);
        });

        const result = parents.map(parent => ({
            id: parent.id,
            person_name: parent.person_name,
            company_name: parent.company_name,
            mobile_number: parent.mobile_number,
            chainContact: childrenMap.get(parent.id) || []
        }));

        return resSuccess({
            data: {
                item: result,
                total_parents: result.length
            },
            ack_msg: "Chain-wise contact report generated successfully"
        });

    } catch (error) {
        console.error(error);
        return resError({
            ack_msg: "Failed to generate chain report",
            developer_msg: error.message
        });
    }
};
