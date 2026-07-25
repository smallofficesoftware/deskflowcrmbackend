import maintenanceModesModel from "../models/configuration/maintenanceModesModel.js";
import logger from "../utils/logger.js";

const maintenanceMode = async (req, res, next) => {
  try {
    const setting = await maintenanceModesModel.findOne({
      where: { isDelete: 0 },
    });
    if (setting && setting.dataValues.is_maintenance === 1) {
      return res.json({
        ack: -1,
        ack_msg: "Service Unavailable. We are currently undergoing maintenance.",
        developer_msg: "Service Unavailable. We are currently undergoing maintenance.",
        code: 200,

      });

    }
    if (setting && setting.dataValues.is_logout_strict === 1) {
      return res.json({
        ack: -2,
        ack_msg: "Service Unavailable. We are currently undergoing maintenance.",
        developer_msg: "is_logout_strict is on, so everyone has been logged out.",
        code: 200,

      });

    }
    next();
  } catch (error) {
    logger.error("Error fetching maintenance status:", error);
    next();
  }
};

export default maintenanceMode;
