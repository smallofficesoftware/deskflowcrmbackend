import moment from "moment";
import { col, fn, Op, where } from "sequelize";
import { trackingModel } from "../../models/activities/trackingModel.js";
import {
    resBadRequest,
    resError,
    resSuccess,
    sanitizeObjectOfNull
} from "../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../commonServices.js";

export const createTracking = async (req) => {
  try {
    const currentDate = new Date();
    const formattedDate = moment(currentDate).format("YYYY-MM-DD HH:mm:ss");
    const body = req.body.location_data;
    const findCompanyId = await getCompanyByLoginId(
      body[0].a_application_login_id
    );
    const trackingBody = body.map((e, i) => {
      return {
        a_application_login_id: e.a_application_login_id,
        company_masters_id: findCompanyId.company_masters_id,
        latitude: e.latitude,
        longitude: e.longitude,
        m_timestamp: e.m_timestamp,
        address: e.address,
        city_locality: e.city_locality,
        state_administrative_area: e.state_administrative_area,
        country: e.country,
        postal_code: e.postal_code,
        iso_postal_code: e.iso_postal_code,
        created_date_time: formattedDate,
        mode: e.mode,
      };
    });
    const trackingLocation = trackingModel(req.tenantDB);
    const trackingCreate = await trackingLocation.bulkCreate(trackingBody);

    if (trackingCreate) {
      return resSuccess({
        ack_msg: "Location tracking add successfully.",
        data: trackingBody,
      });
    } else {
      return resError({
        ack_msg: "Something went wrong.",
        developer_msg: "Location not track.",
      });
    }
  } catch (error) {
    console.log("Error", error);

    return resBadRequest({ developer_msg: `error ${error}` });
  }
};

export const getTracking = async (req, res) => {
  try {
    let { a_application_login_id, m_timestamp } = req.body;
    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    const trackingMaster = trackingModel(req.tenantDB);

    let whereClause = {
      isDelete: 0,
      company_masters_id: findCompanyId.company_masters_id,
      a_application_login_id: a_application_login_id,
      [Op.and]: [where(fn("DATE", col("m_timestamp")), m_timestamp)],
    };

    const trackingData = await trackingMaster.findAll({
      where: whereClause,
      order: [["id", "ASC"]],
    });

    const sanitizedContacts =
      trackingData &&
      trackingData.map((trackingItem) => {
        const sanitized = sanitizeObjectOfNull(trackingItem.toJSON());
        return {
          id: sanitized.id,
          latitude: sanitized.latitude,
          longitude: sanitized.longitude,
          mode: sanitized.mode,
          m_timestamp: sanitized.m_timestamp,
          address: sanitized.address,
          created_date_time:sanitized.created_date_time
        };
      });

    if (trackingData) {
      return resSuccess({
        data: { item: sanitizedContacts },
      });
    } else {
      return resError({
        ack_msg: "No Data",
        developer_msg: "Data not found",
      });
    }
  } catch (e) {
    return resBadRequest({ developer_msg: `error ${e}` });
  }
};
