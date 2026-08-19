import { applicationLoginTypeRightModel } from "../models/application_login/applicationLoginTypeRightModel.js";

export const getUserRights = async ({
    company_masters_id,
    a_application_login_id,
    page_id,
    tenentId
}) => {
    try {
        const applicationLoginTypeRightModelInstance = applicationLoginTypeRightModel(tenentId);
        const rights = await applicationLoginTypeRightModelInstance.findOne({
            where: {
                company_masters_id,
                a_application_login_id,
                isDelete: 0,
                page_id,
            },
            attributes: ["a_application_login_id", "a_page_id_rights_jason"],
        });

        // Default rights
        let output = {
            showAllData: false,
            showPersonalData: false,
            raw: null,
        };

        if (!rights || !rights.a_page_id_rights_jason) return output;

        const parsed = rights.a_page_id_rights_jason;

        output.showAllData = parsed?.all_data == 1;
        output.showPersonalData = parsed?.personal == 1;
        output.raw = parsed;

        return output;
    } catch (err) {
        console.log("Rights check failed:", err);
        return {
            showAllData: false,
            showPersonalData: false,
            raw: null,
        };
    }
};
