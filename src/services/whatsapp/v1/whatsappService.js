import moment from "moment";
import { Op } from "sequelize";
import { fetchDataFromTempDB } from "../../../helpers/whatsappDatabaseConfigure.js";
import companyModel from "../../../models/company_setup/companyModel.js";
import { WHATSAPP_DATABASE_HOST, WHATSAPP_DATABASE_NAME, WHATSAPP_DATABASE_PASSWORD, WHATSAPP_DATABASE_USERNAME } from "../../../utils/appConstants.js";
import { isValid, resBadRequest, resError, resSuccess } from "../../../utils/sharedFunctions.js";

export const sendToWhatsApp = async ({
    numbers,
    sessionName,
    type = "text",
    mediaUrls,
    text = "",
    caption = "",
    base64,
    documentFileName,
    mimetype = "application/pdf",
    duration,
    ptt,
    ptv,
    axios
}) => {
    try {
        const payload = {
            numbers: Array.isArray(numbers) ? numbers : [numbers],
            sessionName,
            type,
            text,
            caption,
        };

        // Media handling
        if (isValid(mediaUrls)) {
            payload.mediaUrls = Array.isArray(mediaUrls)
                ? mediaUrls
                : [mediaUrls];
        }

        if (isValid(documentFileName)) {
            payload.documentFileName = documentFileName;
        }

        if (isValid(base64)) {
            payload.base64 = base64;
        }

        const options = {};

        if (isValid(mimetype)) options.mimetype = mimetype;
        if (isValid(duration)) options.duration = duration;
        if (isValid(ptt)) options.ptt = ptt;
        if (isValid(ptv)) options.ptv = ptv;

        if (Object.keys(options).length > 0) {
            payload.options = options;
        }

        const response = await axios.post(
            "/messages/send-message",
            payload,
        );

        if (response.status == 404 || response.status == 400 || response.status == 500) {
            return resError({
                ack_msg: response.data.error || response.data.message,
                developer_msg: "error occured when sending message",
            });
        } else if (response.status == 200) {
            return resSuccess({
                ack_msg: "WhatsApp message sent successfully.",
            });
        }
    } catch (error) {
        console.log("sendToWhatsApp error", error);
        return resError({
            ack_msg: error?.msg,
            developer_msg: "error occured when sending message",
        });
    }
};

export const fetchConnectedSessions = async (req) => {
    try {
        const dbConfig = {
            host: WHATSAPP_DATABASE_HOST,
            database: WHATSAPP_DATABASE_NAME,
            username: WHATSAPP_DATABASE_USERNAME,
            password: WHATSAPP_DATABASE_PASSWORD,
            dialect: "mysql",
        };

        const whatsappConnectedCompanyIds = await fetchDataFromTempDB(dbConfig);
        const company_ids = isValid(whatsappConnectedCompanyIds) ? whatsappConnectedCompanyIds.map(item => Number(item.name.match(/c(\d+)/)[1])) : null;
        const expireDateCheck = moment(new Date()).format("YYYY-MM-DD");

        const getAllCompany = await companyModel.findAll({
            where: {
                isDelete: 0,
                isActive: 1,
                id: company_ids,
                plan_expiry_date: { [Op.gte]: expireDateCheck }
            },
            raw: true,
            attributes: ["id", "a_application_login_id", "company_name"]
        });

        if (!isValid(getAllCompany)) {
            return resError({ developer_msg: 'No Company found.' });
        }
        return resSuccess({
            ack_msg: "Company found successfully",
            data: getAllCompany
        });
    } catch (error) {
        console.log("fetchConnectedSessions error", error);
        return resBadRequest({
            ack_msg: "something went wrong",
            developer_msg: error.msg,
            status: 404,
        });
    }
}
