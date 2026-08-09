import maintenanceModesModel from "../models/configuration/maintenanceModesModel.js";
import { MAINTENANCE_BYPASS_IPS } from "../utils/appConstants.js";
import logger from "../utils/logger.js";

const getClientIp = (req) => {
  let ip =
    req.headers["cf-connecting-ip"] ||
    req.headers["x-real-ip"] ||
    (req.headers["x-forwarded-for"] ? req.headers["x-forwarded-for"].split(",")[0].trim() : null) ||
    req.ip ||
    req.socket?.remoteAddress ||
    "";

  if (ip.startsWith("::ffff:")) {
    ip = ip.replace("::ffff:", "");
  }
  return ip.trim();
};

const maintenanceMode = async (req, res, next) => {
  try {
    const clientIp = getClientIp(req);
    logger.info(`[Maintenance Mode] Detected IP: "${clientIp}", Allowed IPs: ${JSON.stringify(MAINTENANCE_BYPASS_IPS)}`);

    if (clientIp && MAINTENANCE_BYPASS_IPS.includes(clientIp)) {
      return next();
    }

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
