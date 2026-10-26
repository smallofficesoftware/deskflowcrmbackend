import { Op } from "sequelize";
import { cityModel } from "../../models/masters/cityModel.js";
import { wrkflwAutoAssignmentContactModel } from "../../models/other_settings/wrkflwAutoAssignmentContactModel.js";

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Finds which city a message is about, for sources (WhatsApp) that arrive without any
 * geo. Only cities that have an auto-assignment rule for the source are considered, and
 * a city counts when its name appears in the text as a whole word (case-insensitive).
 * The longest matching name wins, so "New Delhi" beats "Delhi".
 *
 * @returns {Promise<number|null>} the a_cities id, or null when no rule city is in the text
 */
export const findRuleCityIdInText = async (sequelize, source_type_id, text) => {
    if (!text || !String(text).trim()) return null;

    const ruleCities = await wrkflwAutoAssignmentContactModel(sequelize).findAll({
        where: { source_type_id, isDelete: 0, city_id: { [Op.gt]: 0 } },
        attributes: ["city_id"],
        group: ["city_id"],
        raw: true,
    });
    if (!ruleCities.length) return null;

    const cities = await cityModel(sequelize).findAll({
        where: { id: ruleCities.map((r) => r.city_id), isDelete: 0 },
        attributes: ["id", "city_name"],
        raw: true,
    });

    const haystack = String(text);
    let best = null;
    for (const city of cities) {
        const name = (city.city_name || "").trim();
        if (!name) continue;
        const found = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(name)}($|[^\\p{L}\\p{N}])`, "iu").test(haystack);
        if (found && (!best || name.length > best.name.length)) best = { id: city.id, name };
    }
    return best ? best.id : null;
};
