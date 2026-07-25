import { getAllChat } from "../services/connectionServices.js";
import logger from "../utils/logger.js";

export const allchatcontroller = async (req, res) => {
  try {
    await getAllChat(req, res);
  } catch (error) {
    logger.error('Error in allchatcontroller:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};