import moment from "moment";
import { getUserRights } from "../../helpers/rightsHelper.js";
import { printSettingModel } from "../../models/company_setup/printSettingModel.js";
import { resError, resSuccess } from "../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../commonServices.js";

export const printsetting = async (req) => {
    try {
        const { printSettings } = req.body;
        const formattedDateTime = moment(new Date()).format("YYYY-MM-DD HH:mm:ss");
        const printModel = printSettingModel(req.tenantDB);

        if (!printSettings || typeof printSettings !== 'object') {
            return resError({ developer_msg: "Invalid or missing printSettings in request body" });
        }

        let printSettingsJson;
        try {
            printSettingsJson = JSON.stringify(printSettings);
        } catch (jsonError) {
            return resError({ developer_msg: "Failed to serialize printSettings to JSON" });
        }

        const findCompanyId = await getCompanyByLoginId(Number(printSettings.a_application_login_id));
        if (!findCompanyId) {
            return resError({ developer_msg: "Company not found" });
        }

        const createBody = {
            type: Number(printSettings.type),
            print_version: Number(printSettings.print_version),
            setting_details: printSettingsJson,
            modify_date_time: formattedDateTime,
            modify_by: Number(printSettings.a_application_login_id),
            created_date_time: formattedDateTime,
            a_application_login_id: Number(printSettings.a_application_login_id),
            company_masters_id: findCompanyId.company_masters_id,

        }

        const getPrintData = await printModel.findOne({
            where: {
                type: Number(printSettings.type),
                print_version: Number(printSettings.print_version),
                isDelete: 0
            },
            attributes: ["id"]
        })

        if (getPrintData && getPrintData.id) {
            const createBody = {
                type: Number(printSettings.type),
                print_version: Number(printSettings.print_version),
                setting_details: printSettingsJson,
                modify_date_time: formattedDateTime,
                modify_by: Number(printSettings.a_application_login_id),
                a_application_login_id: Number(printSettings.a_application_login_id),
                company_masters_id: findCompanyId.company_masters_id,

            }
            const resultPrint = await printModel.update(createBody, {
                where: { id: getPrintData.id }
            });
            if (!resultPrint) {
                return resError({ ack_msg: "", developer_msg: "Failed to create PrintSetting" });
            }
            return resSuccess({
                data: { item: resultPrint },
                ack_msg: "update successfully",
            });

        }
        else {
            const resultPrint = await printModel.create(createBody);
            if (!resultPrint) {
                return resError({ ack_msg: "", developer_msg: "Failed to create PrintSetting" });
            }

            return resSuccess({
                data: { item: resultPrint },
                ack_msg: "Added successfully",
            });

        }
    }
    catch (e) {
        console.log(e);
        return resError({
            ack_msg: "", developer_msg: `Failed to Catch ${e}`
        })

    }
}


export const getprintsetting = async (req) => {
    try {
        const { type, print_version } = req.body;
        const printModel = printSettingModel(req.tenantDB);


        const getPrintData = await printModel.findOne({
            where: {
                type: Number(type),
                print_version: Number(print_version),
                isDelete: 0
            },
        })
        console.log("getPrintDatagetPrintDatagetPrintData", getPrintData);

        if (!getPrintData) {
            return resError({
                ack_msg: "Failed to get print Details-----"
            })
        }
        else {
            let parsedSettings;
            try {
                parsedSettings = JSON.parse(getPrintData.setting_details);
                console.log("parsedSettingsparsedSettingsparsedSettingsparsedSettings", parsedSettings);

            } catch (jsonError) {
                console.error("Error parsing setting_details:", jsonError);
                return resError({
                    ack_msg: "Failed to parse print settings132",
                    developer_msg: "Invalid JSON format in setting_details",
                });
            }

            return resSuccess({
                ack_msg: "data get Succesfully",
                data: {
                    ...getPrintData.dataValues,
                    setting_details: parsedSettings,
                },

            })
        }

    }
    catch (e) {
        console.log(e);
        return resError({
            ack_msg: "Failed To get data",
            developer_msg: `${e}`
        })
    }
}


export const newrightsprinteee = async (req) => {
    try {
        const {
            page_id,
            a_application_login_id,
            rights_flag
        } = req.body;


        const findCompanyId = await getCompanyByLoginId(a_application_login_id);

        const { raw } = await getUserRights({
            company_masters_id: findCompanyId.company_masters_id,
            a_application_login_id,
            page_id: page_id,
            tenentId: req.tenantDB
        });
        return resSuccess({
            data: raw
        });
    }
    catch (e) {
        console.log(e);
        return resError({
            ack_msg: "Failed To get data",
            developer_msg: `${e}`
        })
    }
}