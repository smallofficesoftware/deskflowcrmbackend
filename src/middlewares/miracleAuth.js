import moment from "moment";
import miracleConfigModel from "../models/company_setup/miracleConfigModel.js";
import { getCompanyByLoginId } from "../services/commonServices.js";
import logger from "../utils/logger.js";
import { parseMiracleRights } from "../utils/miracleRightsHelper.js";
import { getFinancialYearRangeWise, isValid } from "../utils/sharedFunctions.js";

export const checkMiracleAuth = async (req, res, next) => {
    try {
        const { a_application_login_id } = req.body || {};
        let company_id =
            req.headers?.["x-company-id"] ||
            req.body?.company_id ||
            req.body?.company_masters_id ||
            req.user?.companyId;

        if (!isValid(company_id)) {
            const findCompanyId = await getCompanyByLoginId(a_application_login_id);
            company_id = findCompanyId?.company_masters_id;
        }

        if (!isValid(company_id)) {
            return res.json({
                code: 200,
                ack: 0,
                ack_msg: "Invalid company.",
                developer_msg: "company detail not received.",
            });
        }

        company_id = Number(company_id);

        const formattedDateTime = moment(new Date()).format("YYYY-MM-DD");
        const financialYear = getFinancialYearRangeWise(formattedDateTime);
        const start_date = financialYear?.start_date || null;
        const end_date = financialYear?.end_date || null;
        const year = req.body?.Year || (start_date && end_date ? `${start_date}#${end_date}` : null);

        const whereCondition = { isDelete: 0, company_id };
        if (year) {
            whereCondition.Year = year;
        }

        const config = await miracleConfigModel.findOne({
            where: whereCondition,
            raw: true,
            attributes: [
                "client_id",
                "api_key",
                "access_token",
                "auth_date_time",
                "baseurl",
                "urlKey",
                "rights_config"
            ]
        });

        if (!config) {
            return res.json({
                code: 200,
                ack: 0,
                ack_msg: "miracle configuration not found.",
                developer_msg: "miracle configuration not found.",
            });
        }

        // pass function to axios later
        req.body.mconfig = {
            ...config,
            rights_config: parseMiracleRights(config.rights_config),
            company_id,
        };

        next();

    } catch (error) {
        logger.error("checkAuth Error", error);
        console.error("checkAuth Error", error);
        return res.json({
            code: 200,
            ack: 0,
            ack_msg: "Miracle auth failed",
            developer_msg: "Internal Server Error",
        });
    }
};