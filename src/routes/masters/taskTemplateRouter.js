import { deleteTaskTemplate, getTaskDatasource, startWorkflow } from "../../controllers/masters/taskTemplateController.js";
import { authenticateToken } from "../../middlewares/auth.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";

export default (app) => {
    app.post("/getTaskTemplateDataSource", authenticateToken, tenantMiddleware, getTaskDatasource);
    app.post("/startWorkflow", authenticateToken, tenantMiddleware, startWorkflow);
    app.post("/DeleteTaskTemplate", authenticateToken, tenantMiddleware, deleteTaskTemplate);
};