import sequelize from "../config/sequelize.js";
import { bulkEmailSenderProvider, checkAuth, commonCreate, commonGetCountProvider, commonUpdate, getCommon, getMainCommon, mainCommonCreate, mainCommonUpdate } from "../controllers/commonController.js";
import { authenticateToken } from "../middlewares/auth.js";
import { bulkemailSenderFromData } from "../middlewares/multer.js";
import { tenantMiddleware } from "../middlewares/tenantMiddleware.js";
import logger from "../utils/logger.js";
export default (app) => {
  app.post("/query", async (req, res) => {
    const { table, columns, where } = req.body;

    try {
      if (![table]) {
        return res.status(404).json({ error: `Model ${table} not found` });
      }

      let queryOptions = {
        attributes: columns.split(",").map((column) => column.trim()),
      };

      if (where) {
        const whereObj = JSON.parse(where);
        queryOptions.where = whereObj;
      }

      const result = await sequelize.models[table].findAll(queryOptions);

      if (!result || result.length === 0) {
        return res.status(404).json({ error: "Record(s) not found" });
      }

      res.json(result);
    } catch (err) {
      logger.error(err);
      res.status(500).json({ error: "Server error" });
    }
  });


  app.post("/commonGet", authenticateToken, tenantMiddleware, getCommon)
  app.post("/commonCreate", authenticateToken, tenantMiddleware, commonCreate);
  app.post("/commonUpdate", authenticateToken, tenantMiddleware, commonUpdate);
  app.post("/commonGetCount", authenticateToken, tenantMiddleware, commonGetCountProvider);
  app.post("/checkAuthToken", authenticateToken, tenantMiddleware, checkAuth);
  app.post("/mainCommonGet", getMainCommon);
  app.post("/mainCommonCreate", mainCommonCreate);
  app.post("/mainCommonUpdate", mainCommonUpdate);
  app.post("/ebs", bulkemailSenderFromData.single("attachement"), bulkEmailSenderProvider);
};
