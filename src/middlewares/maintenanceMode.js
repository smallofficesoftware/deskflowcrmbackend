import maintenanceModesModel from "../models/configuration/maintenanceModesModel.js";
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

// Handles copy/paste noise from the admin panel textarea and URL-style
// brackets/zone ids on IPv6 addresses ("[2401:4900::1]", "fe80::1%eth0").
const normalizeIp = (ip) =>
  ip
    .trim()
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .replace(/%.*$/, "")
    .toLowerCase();

const maintenanceMode = async (req, res, next) => {
  try {
    const clientIp = getClientIp(req);
    const setting = await maintenanceModesModel.findOne({
      where: { isDelete: 0 },
    });

    const bypassIps = (setting?.dataValues.bypass_ips || "")
      .split(",")
      .map(normalizeIp)
      .filter(Boolean);

    logger.info(`[Maintenance Mode] Detected IP: "${clientIp}", Allowed IPs: ${JSON.stringify(bypassIps)}`);

    if (clientIp && bypassIps.includes(normalizeIp(clientIp))) {
      return next();
    }

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
