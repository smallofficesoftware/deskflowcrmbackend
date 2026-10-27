import { applicationLoginTypeRightModel } from "../models/application_login/applicationLoginTypeRightModel.js";

export const getUserRights = async ({
    company_masters_id,
    a_application_login_id,
    page_id,
    page_slug,
    tenentId
}) => {
    try {
        // page_id for a page_slug can drift between databases (a_application_pages ids
        // are plain AUTO_INCREMENT and the table is also written to independently by the
        // admin panel's own platform-page migrations - found 27-10-2026, Attribute
        // Master: 196 on the dev DB vs 200 on demobackend). Callers that want to be
        // immune to that should pass page_slug instead of a hardcoded page_id; existing
        // numeric callers are unaffected.
        let resolvedPageId = page_id;
        if (page_slug) {
            const masterDbName = process.env.TENANT_DB_DB_NAME;
            const [pageRows] = await tenentId.query(
                `SELECT id FROM \`${masterDbName}\`.\`a_application_pages\` WHERE page_slug = :page_slug AND isDelete = 0 LIMIT 1`,
                { replacements: { page_slug } }
            );
            resolvedPageId = pageRows?.[0]?.id ?? page_id;
        }

        const applicationLoginTypeRightModelInstance = applicationLoginTypeRightModel(tenentId);
        const rights = await applicationLoginTypeRightModelInstance.findOne({
            where: {
                company_masters_id,
                a_application_login_id,
                isDelete: 0,
                page_id: resolvedPageId,
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

        const raw = rights.a_page_id_rights_jason;
        const parsed = typeof raw === "object" ? raw : JSON.parse(raw);

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
