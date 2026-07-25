import { getRoundOff, updateRoundOff } from "../../controllers/hr/roundOfController.js";
import { authenticateToken } from "../../middlewares/auth.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";

export default (app) => {
    app.post("/get-round-off", authenticateToken, tenantMiddleware, getRoundOff);
    app.post("/update-round-off", authenticateToken, tenantMiddleware, updateRoundOff);
}