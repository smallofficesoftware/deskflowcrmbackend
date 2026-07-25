import sanitizeHtml from "sanitize-html";
import { messages } from "../config/app.js";
import { NODE_ENV } from "../utils/appConstants.js";
import logger from "../utils/logger.js";

export const getAllChat = async (req, res) => {
  try {
    const { msg } = req.body;
    if (!msg || typeof msg !== "string" || msg.trim().length === 0) {
      logger.error("Validation failed: Invalid or empty message");
      return res.status(400).json({ error: "Valid message is required" });
    }

    const sanitizedMsg = sanitizeHtml(msg.trim(), {
      allowedTags: [],
      allowedAttributes: {},
    });

    const newMsg = {
      message: sanitizedMsg,
      timestamp: new Date().toISOString(),
    };
    messages.push(newMsg);
    // io.emit("new_message", newMsg);

    return res.status(200).json({
      message: "Message sent successfully",
      data: newMsg,
    });
  } catch (error) {
    logger.error("Error in getAllChat:", error.message);
    return res.status(500).json({
      error: "Internal server error",
      details: NODE_ENV === "development" ? error.message : undefined,
    });
  }
};