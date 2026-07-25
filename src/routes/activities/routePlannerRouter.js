import { addRoutes, assignContacts, assignStatusToRoute, getAssignedContacts, getRoutes, removeContacts, updateRoutes } from "../../controllers/activities/routePlannerController.js";
import { authenticateToken } from "../../middlewares/auth.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";

export default (app) => {
    app.post("/get-routes", authenticateToken, tenantMiddleware, getRoutes);
    app.post("/add-route", authenticateToken, tenantMiddleware, addRoutes);
    app.post("/update-route", authenticateToken, tenantMiddleware, updateRoutes);
    app.post("/get-assigned-contacts", authenticateToken, tenantMiddleware, getAssignedContacts);
    app.post("/assign-contact-to-route", authenticateToken, tenantMiddleware, assignContacts);
    app.post("/remove-contact-from-route", authenticateToken, tenantMiddleware, removeContacts);
    app.post("/assign-status-to-route", authenticateToken, tenantMiddleware, assignStatusToRoute);
}