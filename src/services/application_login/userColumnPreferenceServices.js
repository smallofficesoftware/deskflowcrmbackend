import { userColumnPreferenceModel } from "../../models/application_login/userColumnPreferenceModel.js";
import { resError, resSuccess } from "../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../commonServices.js";

export const getColumnPreference = async (req) => {
  try {
    const { a_application_login_id, report_key } = req.body;

    if (!a_application_login_id || !report_key) {
      return resError({
        ack_msg: "Failed to get column preference",
        developer_msg: "a_application_login_id and report_key are required",
      });
    }

    const columnPreferenceModel = userColumnPreferenceModel(req.tenantDB);

    const preference = await columnPreferenceModel.findOne({
      where: {
        a_application_login_id: Number(a_application_login_id),
        report_key,
        isDelete: 0,
      },
    });

    if (!preference) {
      return resSuccess({
        ack_msg: "No column preference found",
        data: { column_order: null, hidden_columns: null },
      });
    }

    let column_order = null;
    let hidden_columns = null;

    try {
      column_order = preference.column_order
        ? JSON.parse(preference.column_order)
        : null;
      hidden_columns = preference.hidden_columns
        ? JSON.parse(preference.hidden_columns)
        : null;
    } catch (jsonError) {
      return resError({
        ack_msg: "Failed to parse column preference",
        developer_msg: "Invalid JSON format in stored preference",
      });
    }

    return resSuccess({
      ack_msg: "Column preference get successfully",
      data: { column_order, hidden_columns },
    });
  } catch (error) {
    console.log("getColumnPreference error", error);

    return resError({
      ack_msg: "Error",
      developer_msg: error.message,
    });
  }
};

export const saveColumnPreference = async (req) => {
  try {
    const {
      a_application_login_id,
      report_key,
      column_order,
      hidden_columns,
    } = req.body;

    if (!a_application_login_id || !report_key) {
      return resError({
        ack_msg: "Failed to save column preference",
        developer_msg: "a_application_login_id and report_key are required",
      });
    }

    const columnPreferenceModel = userColumnPreferenceModel(req.tenantDB);

    const updateBody = {
      column_order: JSON.stringify(column_order || []),
      hidden_columns: JSON.stringify(hidden_columns || []),
    };

    const existing = await columnPreferenceModel.findOne({
      where: {
        a_application_login_id: Number(a_application_login_id),
        report_key,
        isDelete: 0,
      },
      attributes: ["id"],
    });

    if (existing) {
      await columnPreferenceModel.update(updateBody, {
        where: { id: existing.id },
      });
    } else {
      const findCompanyId = await getCompanyByLoginId(
        Number(a_application_login_id)
      );

      await columnPreferenceModel.create({
        ...updateBody,
        a_application_login_id: Number(a_application_login_id),
        company_masters_id: findCompanyId?.company_masters_id,
        report_key,
      });
    }

    return resSuccess({
      ack_msg: "Column preference saved successfully",
      data: {
        column_order: column_order || [],
        hidden_columns: hidden_columns || [],
      },
    });
  } catch (error) {
    console.log("saveColumnPreference error", error);

    return resError({
      ack_msg: "Error",
      developer_msg: error.message,
    });
  }
};
