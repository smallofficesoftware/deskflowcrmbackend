import moment from "moment";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";
import companyModel from "../../models/company_setup/companyModel.js";
import { customFieldDatavaluesModel } from "../../models/other_settings/customfieldDatavaluesModel.js";
import { customFieldFormModel } from "../../models/other_settings/customFieldFormModel.js";
import {
  getColumnName,
  resBadRequest,
  resError,
  resSuccess
} from "../../utils/sharedFunctions.js";
import {
  getCompanyByLoginId
} from "../commonServices.js";

export const orderTypesCustomInquiryList = [
  { id: "1", order_type_display: "Number" },
  { id: "2", order_type_display: "Text" },
  { id: "3", order_type_display: "TextArea" },
  { id: "4", order_type_display: "Date" },
  { id: "5", order_type_display: "DateAndTime" },
  { id: "6", order_type_display: "Time" },
  { id: "7", order_type_display: "Switch" },
  { id: "8", order_type_display: "Decimal" },
];

export const addCustomFieldFrom = async (req) => {
  try {
    const currentDate = new Date();
    const formattedDate = moment(currentDate).format("YYYY-MM-DD HH:mm:ss");

    // const findCompanyId = await getCompanyDetailByLoginId(
    //   req.body.a_application_login_id
    // );
    const findCompanyId = await getCompanyByLoginId(req.body.a_application_login_id);

    const customFieldForm = customFieldFormModel(req.tenantDB); // Initialize User model

    const checkDuplication = await customFieldForm.findOne({
      where: {
        isDelete: 0,
        company_masters_id: findCompanyId.company_masters_id,
        form_type: req.body.form_type,
        title: req.body.title,
        data_type: req.body.data_type,
      },
    });

    if (checkDuplication) {
      return resError({
        ack_msg: "Field is already available",
        developer_msg: "From Field is already available Duplication error",
      });
    }

    const validColumn = await getColumnName({
      dataType: req.body.data_type,
      companyId: findCompanyId.company_masters_id,
      formType: req.body.form_type,
      req: req
    });

    if (validColumn === 1) {
      return resError({
        ack_msg: "You are not allowed to add more. You have already added 5.",
        developer_msg: "Data type  has reached the limit of 5.",
      });
    }

    const customInquiryFromBody = {
      title: req.body.title,
      data_type: req.body.data_type,
      display_order: req.body.display_order,
      required_or_not: req.body.required_or_not,
      print_or_not: req.body.print_or_not,
      report_print_or_not: req.body.report_print_or_not,
      product_feild_row_column: req.body.product_feild_row_column,
      required_for: req.body.required_for,
      min_limit: req.body.min_limit,
      max_limit: req.body.max_limit,
      validation_type: req.body.validation_type,
      a_application_login_id: req.body.a_application_login_id,
      form_type: req.body.form_type,
      company_masters_id: findCompanyId.company_masters_id,
      reference_column_name: validColumn,
      third_party_field_name: req.body.third_party_field_name ? String(req.body.third_party_field_name).trim() : null,
      applicable_modules: req.body.applicable_modules ? String(req.body.applicable_modules).trim() : null,
      created_date_time: formattedDate,
    };

    const result = await customFieldForm.create(customInquiryFromBody);

    if (result) {
      return resSuccess({
        data: { item: result },
      });
    } else {
      return resError({
        ack_msg: "custom Inquiry Form is not Add",
        developer_msg:
          "custom Inquiry Form is not Add in create there is error",
      });
    }
  } catch (error) {
    console.log("error", error);

    return resBadRequest({ developer_msg: `error ${error}` });
  }
};

export const getAllCustomFieldFrom = async (req) => {
  try {
    const { a_application_login_id, form_type } = req.body;

    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    let whereClause = {
      company_masters_id: findCompanyId.company_masters_id,
      isDelete: 0,
    };

    if (form_type) {
      whereClause = { ...whereClause, form_type: form_type }
    }
    const customFieldForm = customFieldFormModel(req.tenantDB);


    const resultCIF = await customFieldForm.findAll({
      where: whereClause,
      attributes: [
        "id",
        "title",
        "data_type",
        "display_order",
        "required_or_not",
        "print_or_not",
        "reference_column_name",
        "product_feild_row_column",
        "required_for",
        "min_limit",
        "max_limit",
        "validation_type",
        "data_sorce",
        "third_party_field_name",
        "applicable_modules",
        "form_type"
      ],
      order: [["display_order", "ASC"]],
      raw: true,
    });

    if (resultCIF) {
      return resSuccess({
        data: { item: resultCIF },
      });
    } else {
      return resError({
        ack_msg: "no Data found",
        developer_msg: "There is no Data",
      });
    }
  } catch (error) {
    console.log("error", error);
    return resBadRequest({ developer_msg: `error ${error}` });
  }
};


export const addCustomFieldDatavalues = async (req) => {
  try {

    const { a_application_login_id, custom_field_master_id, data_source, editValue, deleteValue } = req.body;

    const findCompanyId = await getCompanyByLoginId(a_application_login_id);

    const companyId = findCompanyId.company_masters_id;

    const customFieldModels = customFieldFormModel(req.tenantDB);
    const datatypes = await customFieldModels.findOne({
      where: {
        id: custom_field_master_id,
      },
      attributes: ["id", "data_type"]
    })

    const dataType = datatypes.data_type;

    if (editValue && editValue > 0) {

      const datavaluesModels = customFieldDatavaluesModel(req.tenantDB);

      const request = {
        data_sorce: data_source,
      }
      const dataValues = await datavaluesModels.update(request, {
        where: {
          id: editValue,
          custom_field_master_id: custom_field_master_id,
        }
      });

      if (dataValues) {
        return resSuccess({
          ack_msg: "Successfully Updated",
          developer_msg: "successfully Updated",
          data: dataValues,
        })
      }
    }
    else if (deleteValue && deleteValue > 0) {
      const datavaluesModels = customFieldDatavaluesModel(req.tenantDB);

      const request = {
        isDelete: 1
      }
      const dataValues = await datavaluesModels.update(request, {
        where: {
          id: deleteValue,
          custom_field_master_id: custom_field_master_id,
        }
      });

      if (dataValues) {
        return resSuccess({
          ack_msg: "Successfully Deleted",
          developer_msg: "successfully Deleted",
          data: dataValues,
        })
      }
    }
    else {
      try {

        const datavaluesModels = customFieldDatavaluesModel(req.tenantDB);
        const formattedDateTime = new Date().toISOString().slice(0, 19).replace('T', ' ');


        const request = {
          a_application_login_id: a_application_login_id,
          company_masters_id: companyId,
          custom_field_master_id: custom_field_master_id,
          data_type: dataType,
          data_sorce: data_source,
          created_date_time: formattedDateTime
        }
        const dataValues = await datavaluesModels.create(request);

        if (dataValues) {
          return resSuccess({
            ack_msg: "Successfully Created",
            developer_msg: "successfully added",
            data: dataValues,
          })
        }
      }
      catch (error) {
        return resError({
          developer_msg: error
        })
      }
    }
  }
  catch (e) {
    console.log(e);

  }
}



export const getCustomFieldDatavalues = async (req, res) => {
  try {
    const { custom_field_master_id } = req.body;

    if (!custom_field_master_id) {
      return resError({
        ack: 0,
        ack_msg: "custom_field_master_id is required",
        developer_msg: "Missing custom_field_master_id in request body",
      });
    }

    const ids = Array.isArray(custom_field_master_id)
      ? custom_field_master_id
      : [custom_field_master_id];

    if (!ids.every(id => typeof id === 'number' && id > 0)) {
      returnresError({
        ack: 0,
        ack_msg: "All custom_field_master_id values must be positive numbers",
        developer_msg: "Invalid ID format in custom_field_master_id",
      });
    }

    const datavaluesModels = customFieldDatavaluesModel(req.tenantDB);

    const dataValues = await datavaluesModels.findAll({
      where: {
        custom_field_master_id: ids,
        isDelete: 0,
      },
      attributes: ['custom_field_master_id', 'data_sorce', "id"],
    });

    const formattedData = dataValues.map(item => ({
      id: item.id,
      custom_field_master_id: item.custom_field_master_id,
      data_sorce: item.data_sorce,
    }));

    return resSuccess({
      ack: 1,
      ack_msg: "Successfully fetched",
      developer_msg: "Data retrieved successfully",
      data: formattedData,
    });
  } catch (error) {
    console.error("Error in getCustomFieldDatavalues:", error);
    return resError({
      ack: 0,
      ack_msg: "Internal server error",
      developer_msg: error.message || "Unknown error",
    });
  }
};


export const getAllCustomFieldFromByUsingCompany = async (req, res) => {
  try {
    const { qrCode, form_type } = req.body;
    const getCompanyData = await companyModel.findOne({
      where: { qr_code: qrCode },
      attributes: ["id", "a_application_login_id"]
    });

    const findCompanyId = await getCompanyByLoginId(getCompanyData.a_application_login_id);

    let whereClause = {
      company_masters_id: findCompanyId.company_masters_id,
      isDelete: 0,
    };

    if (form_type) {
      whereClause.form_type = form_type;
    }
    const company_masters_id = findCompanyId.company_masters_id;
    const a_application_login_id = findCompanyId.a_application_login_id;
    const tenantId = a_application_login_id;

    req.headers["x-tenant-id"] = tenantId;

    await new Promise((resolve, reject) => {
      tenantMiddleware(req, {}, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
    const customFieldForm = customFieldFormModel(req.tenantDB);

    const resultCIF = await customFieldForm.findAll({
      where: whereClause,
      attributes: [
        "id",
        "title",
        "data_type",
        "display_order",
        "required_or_not",
        "print_or_not",
        "reference_column_name",
        "product_feild_row_column",
        "required_for",
        "data_sorce",
        "third_party_field_name",
        "form_type",
        "a_application_login_id"
      ],
      order: [["display_order", "ASC"]],
      raw: true,
    });

    if (resultCIF?.length > 0) {
      return resSuccess({
        data: { item: resultCIF },
      });
    } else {
      return resError({
        ack_msg: "no Data found",
        developer_msg: "There is no Data",
      });
    }
  } catch (error) {
    console.log("error", error);
    return resBadRequest({ developer_msg: `error ${error}` });
  }
};

export const getAllCustomFieldDatavalueforQrByinquiryy = async (req, res) => {
  try {
    const { custom_field_master_id, qrCode } = req.body;

    // 1) Validate required input
    if (!custom_field_master_id) {
      return resError({
        ack: 0,
        ack_msg: "custom_field_master_id is required",
        developer_msg: "Missing custom_field_master_id in request body",
      });
    }
    if (!qrCode) {
      return resError({
        ack: 0,
        ack_msg: "qrCode is required",
        developer_msg: "Missing qrCode in request body",
      });
    }

    // 2) Find company by qr_code
    const getCompanyData = await companyModel.findOne({
      where: { qr_code: qrCode },
      attributes: ["id", "a_application_login_id"],
    });

    if (!getCompanyData) {
      return resError({
        ack: 0,
        ack_msg: "Invalid QR Code",
        developer_msg: `No company found for qrCode: ${qrCode}`,
      });
    }

    // 3) Resolve company via login id
    const findCompanyId = await getCompanyByLoginId(getCompanyData.a_application_login_id);
    if (!findCompanyId || !findCompanyId.a_application_login_id) {
      return resError({
        ack: 0,
        ack_msg: "Company not found for provided login id",
        developer_msg: `getCompanyByLoginId returned invalid result for login id: ${getCompanyData.a_application_login_id}`,
      });
    }

    // 4) Normalize custom_field_master_id to an array of positive integers
    const ids = Array.isArray(custom_field_master_id)
      ? custom_field_master_id
      : [custom_field_master_id];

    // Convert to numbers and validate
    const numericIds = ids.map((id) => {
      // allow numeric strings like "12" as well
      const n = Number(id);
      return Number.isFinite(n) ? Math.trunc(n) : NaN;
    });

    if (!numericIds.every((n) => Number.isInteger(n) && n > 0)) {
      return resError({
        ack: 0,
        ack_msg: "All custom_field_master_id values must be positive integers",
        developer_msg: "Invalid ID format in custom_field_master_id",
      });
    }

    // 5) Set tenant header and run tenant middleware
    const a_application_login_id = findCompanyId.a_application_login_id;
    const tenantId = a_application_login_id;

    // attach tenant header
    req.headers = req.headers || {};
    req.headers["x-tenant-id"] = tenantId;

    // assume tenantMiddleware(req, res, next)
    await new Promise((resolve, reject) => {
      tenantMiddleware(req, res, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });

    // 6) Initialize tenant model
    const datavaluesModel = customFieldDatavaluesModel(req.tenantDB);

    // 7) Query data values
    const dataValues = await datavaluesModel.findAll({
      where: {
        custom_field_master_id: numericIds, // Sequelize translates array -> IN
        isDelete: 0,
      },
      attributes: ["id", "custom_field_master_id", "data_sorce"],
      raw: true,
    });

    // 8) Format response (already simple objects because raw: true)
    const formattedData = dataValues.map((item) => ({
      id: item.id,
      custom_field_master_id: item.custom_field_master_id,
      data_sorce: item.data_sorce,
    }));

    return resSuccess({
      ack: 1,
      ack_msg: "Successfully fetched",
      developer_msg: "Data retrieved successfully",
      data: formattedData,
    });
  } catch (error) {
    console.error("Error in getAllCustomFieldDatavalueforQrByinquiryy:", error);
    return resError({
      ack: 0,
      ack_msg: "Internal server error",
      developer_msg: error?.message || String(error),
    });
  }
};

