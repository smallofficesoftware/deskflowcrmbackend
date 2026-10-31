// This is for Tenant Databases Connection and pass all models with connection

import Sequelize from "sequelize";
import { accountTransactionsModel } from "../models/activities/accountTransactionsModel.js";
import { callhistoryModel } from "../models/activities/callhistoryModel.js";
import { cartItemModel } from "../models/activities/cartItemsModel.js";
import { cartSerialNumberModel } from "../models/activities/cartSerialNumberModel.js";
import { cartModel } from "../models/activities/cartsModel.js";
import { contactMessageHistory } from "../models/activities/contactMessageHistoryModel.js";
import { contactModel } from "../models/activities/contactModel.js";
import { employeeAccountTransactionsModel } from "../models/activities/employeeAccountTransactionModel.js";
import { inquiryModel } from "../models/activities/inquiryModel.js";
import { paymentTypeModel } from "../models/activities/paymentTypeModel.js";
import { personalNotesModel } from "../models/activities/personalNotesModel.js";
import { reminderMessagesModel } from "../models/activities/reminderMessagesModel.js";
import { taskManagementModel } from "../models/activities/taskManagementModel.js";
import { taskMessageHistroyModel } from "../models/activities/taskMessageHistroyModel.js";
import { trackingModel } from "../models/activities/trackingModel.js";
import { userAppTrackModel } from "../models/application_login/userAppTrackModel.js";
import { userColumnPreferenceModel } from "../models/application_login/userColumnPreferenceModel.js";
import { attendanceModel } from "../models/hr/attendanceModel.js";
import { departmentModel } from "../models/hr/departmentModel.js";
import { employeePayrollModel } from "../models/hr/employeePayrollModel.js";
import { expenseTypeModel } from "../models/hr/expenseTypeModel.js";
import { leavesModel } from "../models/hr/leavesModel.js";
import { leaveTypeModel } from "../models/hr/leaveTypeModel.js";
import { targetVsIncentiveModel } from "../models/hr/targetVsIncentiveModel.js";
import { visitTypeModel } from "../models/hr/visitTypeModel.js";
import { areaModel } from "../models/masters/areaModel.js";
import { billOfMaterialsModel } from "../models/masters/billOfMaterialsModel.js";
import { cityModel } from "../models/masters/cityModel.js";
import { countryModel } from "../models/masters/countryModel.js";
import { labelModel } from "../models/masters/labelModel.js";
import { machineManagementModel } from "../models/masters/machineManagementModel.js";
import { sourceTypesModel } from "../models/masters/sourceTypeMode.js";
import { stagestatusModel } from "../models/masters/stagestatusModel.js";
import { stateModel } from "../models/masters/stateModel.js";
import { taskCategoryModel } from "../models/masters/taskCategoryModel.js";
import { taskTemplateModel } from "../models/masters/taskTemplateModel.js";
import { taskTemplateDatasource } from "../models/masters/taslTemplateDatasources.js";
import { customFieldFormModel } from "../models/other_settings/customFieldFormModel.js";
import { wareHouseModel } from "../models/other_settings/wareHouseModel.js";
import { workflowAutomationsModel } from "../models/other_settings/workflowAutomationsModel.js";
import { bomVsProcessVsConsAndRejctsModel } from "../models/product_settings/bomProcessVsConsAndRejctsModel.js";
import { categoryModel } from "../models/product_settings/categoryModel.js";
import { priceListMastersModel } from "../models/product_settings/priceListMastersModel.js";
import { priceListModel } from "../models/product_settings/priceListModel.js";
import { processMastersModel } from "../models/product_settings/processMastersModel.js";
import { productGroupModel } from "../models/product_settings/productGroupModel.js";
import { productImageModel } from "../models/product_settings/productImageModel.js";
import { productModel } from "../models/product_settings/productModel.js";
import { productTypesModel } from "../models/product_settings/productTypesModel.js";
import { productAttributeMasterModel } from "../models/product_settings/productAttributeMasterModel.js";
import { productAttributeValueMasterModel } from "../models/product_settings/productAttributeValueMasterModel.js";
import { productUnitMasterModel } from "../models/product_settings/productUnitMasterModel.js";
import { productVariantAttributeModel } from "../models/product_settings/productVariantAttributeModel.js";
import { productVariantAttributeValueModel } from "../models/product_settings/productVariantAttributeValueModel.js";
import { productVariantOptionValueModel } from "../models/product_settings/productVariantOptionValueModel.js";
import { taxModel } from "../models/product_settings/taxModel.js";
import { globalSequelize } from "./globalSequelize.js";
import {
    TENANT_POOL,
    cachedTenantRow,
    getCachedConnection,
    storeConnection,
    tenantConnectionKey,
} from "./tenantConnectionCache.js";

// const tenantConnections = {};
export const getTenantDB = async (tenantId, companyId) => {
    // if (tenantConnections[tenantId]) {
    //     return tenantConnections[tenantId];
    // }
    let tenant = null;
    if (companyId) {
        tenant = await cachedTenantRow(`c:${companyId}`, async () => {
            const [result] = await globalSequelize.query(
                "SELECT * FROM tenant_masters WHERE company_masters_id = ? AND isDelete = 0 LIMIT 1",
                {
                    replacements: [companyId],
                    type: Sequelize.QueryTypes.SELECT,
                }
            );
            return result;
        });
    }
    if (!tenant && tenantId) {
        tenant = await cachedTenantRow(`t:${tenantId}`, async () => {
            const [result] = await globalSequelize.query(
                "SELECT * FROM tenant_masters WHERE a_application_login_id = ? AND isDelete = 0 ORDER BY id DESC LIMIT 1",
                {
                    replacements: [tenantId],
                    type: Sequelize.QueryTypes.SELECT,
                }
            );
            return result;
        });
    }

    if (!tenant) {
        throw new Error("Tenant not found");
    }

    // Reuse the tenant's existing connection pool + models when we have one
    const cacheKey = tenantConnectionKey(tenant);
    const cachedConnection = getCachedConnection(cacheKey);
    if (cachedConnection) {
        return cachedConnection;
    }

    const tenantSequelize = new Sequelize(
        tenant.db_name,
        tenant.db_user,
        tenant.db_password,
        {
            host: tenant.db_host,
            dialect: "mysql",
            timezone: "+05:30",
            define: {
                timestamps: false,
            },
            pool: TENANT_POOL,
            // SQL logging off by default (huge logs); set SQL_LOGGING=1 to debug
            logging: process.env.SQL_LOGGING === "1" ? console.log : false,
        }
    );
    const models = {
        categories: categoryModel(tenantSequelize),
        product_groups: productGroupModel(tenantSequelize),
        product_images: productImageModel(tenantSequelize),
        attendance_histories: attendanceModel(tenantSequelize),
        task_categories: taskCategoryModel(tenantSequelize),
        payment_types: paymentTypeModel(tenantSequelize),
        expense_type_masters: expenseTypeModel(tenantSequelize),
        visit_type_masters: visitTypeModel(tenantSequelize),
        leave_type_masters: leaveTypeModel(tenantSequelize),
        leaves: leavesModel(tenantSequelize),
        product_types: productTypesModel(tenantSequelize),
        a_countries: countryModel(tenantSequelize),
        a_states: stateModel(tenantSequelize),
        a_cities: cityModel(tenantSequelize),
        a_areas: areaModel(tenantSequelize),
        pricelist_masters: priceListMastersModel(tenantSequelize),
        price_lists: priceListModel(tenantSequelize),
        source_types: sourceTypesModel(tenantSequelize),
        lable_masters: labelModel(tenantSequelize),
        custom_field_form_masters: customFieldFormModel(tenantSequelize),
        stage_status_masters: stagestatusModel(tenantSequelize),
        personal_notes: personalNotesModel(tenantSequelize),
        contact_message_histories: contactMessageHistory(tenantSequelize),
        task_message_histories: taskMessageHistroyModel(tenantSequelize),
        account_transactions: accountTransactionsModel(tenantSequelize),
        employee_account_transactions: employeeAccountTransactionsModel(tenantSequelize),
        reminder_messages: reminderMessagesModel(tenantSequelize),
        inquiries: inquiryModel(tenantSequelize),
        carts: cartModel(tenantSequelize),
        cart_items: cartItemModel(tenantSequelize),
        cart_vs_serial_numbers: cartSerialNumberModel(tenantSequelize),
        products: productModel(tenantSequelize),
        product_variant_attributes: productVariantAttributeModel(tenantSequelize),
        product_variant_attribute_values: productVariantAttributeValueModel(tenantSequelize),
        product_variant_option_values: productVariantOptionValueModel(tenantSequelize),
        product_attribute_masters: productAttributeMasterModel(tenantSequelize),
        product_attribute_value_masters: productAttributeValueMasterModel(tenantSequelize),
        target_vs_incentives: targetVsIncentiveModel(tenantSequelize),
        contact_masters: contactModel(tenantSequelize),
        departments: departmentModel(tenantSequelize),
        machine_managements: machineManagementModel(tenantSequelize),
        task_managements: taskManagementModel(tenantSequelize),
        call_histories: callhistoryModel(tenantSequelize),
        custom_field_form_datavalues: customFieldFormModel(tenantSequelize),
        expenses: expenseTypeModel(tenantSequelize),
        location_trackings: trackingModel(tenantSequelize),
        visits: visitTypeModel(tenantSequelize),
        wrkflw_google_sheet_configs: workflowAutomationsModel(tenantSequelize),
        task_templete_masters: taskTemplateModel(tenantSequelize),
        task_templete_datasources: taskTemplateDatasource(tenantSequelize),
        product_unit_masters: productUnitMasterModel(tenantSequelize),
        user_app_tracks: userAppTrackModel(tenantSequelize),
        user_column_preferences: userColumnPreferenceModel(tenantSequelize),
        warehouses: wareHouseModel(tenantSequelize),
        bill_of_materials_masters: billOfMaterialsModel(tenantSequelize),
        process_masters: processMastersModel(tenantSequelize),
        bom_process_vs_cons_rejcts: bomVsProcessVsConsAndRejctsModel(tenantSequelize),
        employee_payrolls: employeePayrollModel(tenantSequelize),
        tax_masters: taxModel(tenantSequelize),


    }
    return storeConnection(cacheKey, tenantSequelize, models);
};

