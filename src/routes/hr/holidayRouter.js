import { addHoliday, getHoliday, updateHoliday } from "../../controllers/hr/holidayController.js";
import { authenticateToken } from "../../middlewares/auth.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";

export default (app) => {
    app.post("/add-holiday", authenticateToken, tenantMiddleware, addHoliday);
    app.post("/get-holiday", authenticateToken, tenantMiddleware, getHoliday);
    app.post("/update-holiday", authenticateToken, tenantMiddleware, updateHoliday);
}