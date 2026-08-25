import {
  addChecklistItem,
  editChecklistItem,
  getChecklist,
  removeChecklistItem,
  reorderChecklist,
} from "../../controllers/activities/taskChecklistController.js";
import { authenticateToken } from "../../middlewares/auth.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";

export default (app) => {
  app.post("/get-task-checklist", authenticateToken, tenantMiddleware, getChecklist);
  app.post("/create-task-checklist-item", authenticateToken, tenantMiddleware, addChecklistItem);
  app.post("/update-task-checklist-item", authenticateToken, tenantMiddleware, editChecklistItem);
  app.post("/delete-task-checklist-item", authenticateToken, tenantMiddleware, removeChecklistItem);
  app.post("/reorder-task-checklist", authenticateToken, tenantMiddleware, reorderChecklist);
};
