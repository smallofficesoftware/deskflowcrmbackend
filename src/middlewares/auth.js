import jwt from "jsonwebtoken";
import { ANDROID_APPLICATION_VERSION, ANDROID_UPDATE_VERSION_MSG, APPLICATION_APK_URL, APPLICATION_APK_URL_ANDROID, APPLICATION_APK_URL_IOS, APPLICATION_VERSION, CALL_HELPER_APP_VERSION, CALL_TRACKER_APP_URL, HARDCODED_TOKEN, JWT_TOKEN_SIGNATURE, LOCATIONS_TIME_FOR_MOBILE, LOCATIONS_UPDATE_ON_SERVER, UPDATE_VERSION_MSG } from "../utils/appConstants.js";

export const authenticateToken = async (req, res, next) => {
  const token = req.headers.authorization;

  if (!token) {
    return res.json({
      code: 200,
      ack: 3,
      ack_msg: "Please login",
      developer_msg: "Unauthorized or Invalid token",
      mobileVersion: {
        APPLICATION_VERSION,
        UPDATE_VERSION_MSG,
        LOCATIONS_TIME_FOR_MOBILE,
        LOCATIONS_UPDATE_ON_SERVER,
        APPLICATION_APK_URL,
        APPLICATION_APK_URL_IOS,
        APPLICATION_APK_URL_ANDROID,
        ANDROID_APPLICATION_VERSION,
        ANDROID_UPDATE_VERSION_MSG,
        CALL_HELPER_APP_VERSION,
        CALL_TRACKER_APP_URL
      },
    });
  }

  try {

    const decoded = await jwt.verify(token, JWT_TOKEN_SIGNATURE);

    if (decoded) {
      req.user = decoded;
      next(); // Call next middleware or route handler
    } else {
      return res.json({
        code: 200,
        ack: 3,
        ack_msg: "Please login",
        developer_msg: "Unauthorized or Invalid token",
        mobileVersion: {
          APPLICATION_VERSION,
          UPDATE_VERSION_MSG,
          LOCATIONS_TIME_FOR_MOBILE,
          LOCATIONS_UPDATE_ON_SERVER,
          APPLICATION_APK_URL,
          APPLICATION_APK_URL_IOS,
          APPLICATION_APK_URL_ANDROID,
          ANDROID_APPLICATION_VERSION,
          ANDROID_UPDATE_VERSION_MSG,
          CALL_HELPER_APP_VERSION,
          CALL_TRACKER_APP_URL
        },
      });
    }
  } catch (err) {
    if (err.name === "JsonWebTokenError") {
      return res.json({
        code: 200,
        ack: 3,
        ack_msg: "Please login",
        developer_msg: "Unauthorized or Invalid token",
        mobileVersion: {
          APPLICATION_VERSION,
          UPDATE_VERSION_MSG,
          LOCATIONS_TIME_FOR_MOBILE,
          LOCATIONS_UPDATE_ON_SERVER,
          APPLICATION_APK_URL,
          APPLICATION_APK_URL_IOS,
          APPLICATION_APK_URL_ANDROID,
          ANDROID_APPLICATION_VERSION,
          ANDROID_UPDATE_VERSION_MSG,
          CALL_HELPER_APP_VERSION,
          CALL_TRACKER_APP_URL
        },
      });
    }
    return res.json({
      code: 200,
      ack: 3,
      ack_msg: "Please login",
      developer_msg: "Internal Server Error",
      mobileVersion: {
        APPLICATION_VERSION,
        UPDATE_VERSION_MSG,
        LOCATIONS_TIME_FOR_MOBILE,
        LOCATIONS_UPDATE_ON_SERVER,
        APPLICATION_APK_URL,
        APPLICATION_APK_URL_IOS,
        APPLICATION_APK_URL_ANDROID,
        ANDROID_APPLICATION_VERSION,
        ANDROID_UPDATE_VERSION_MSG,
        CALL_HELPER_APP_VERSION,
        CALL_TRACKER_APP_URL
      },
    });
  }
};




export const publicAuthenticateToken = (req, res, next) => {
  const token = req.headers.authorization;
  if (!token || token !== HARDCODED_TOKEN) {
    return res.json({
      ack: 3,
      ack_msg: "Unauthorized or Invalid token",
      developer_msg: "Unauthorized or Invalid token",
    });
  }
  next();
};