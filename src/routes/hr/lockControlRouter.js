
import { addlockcontrol, getlockcontrol } from "../../controllers/hr/lockControlController.js";
import { authenticateToken } from "../../middlewares/auth.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";

export default (app) => {
    app.post("/add-lock-control", authenticateToken, tenantMiddleware, addlockcontrol);
    app.post("/get-lock-control", authenticateToken, tenantMiddleware, getlockcontrol);
}