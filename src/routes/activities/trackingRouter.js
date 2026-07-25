import { allcreatetracking, allgettracking } from '../../controllers/activities/trackingController.js';
import {authenticateToken} from '../../middlewares/auth.js'
import {tenantMiddleware} from "../../middlewares/tenantMiddleware.js";

export default (app) => {
    app.post("/tracking", authenticateToken, tenantMiddleware, allcreatetracking);
    app.post("/get-tracking", authenticateToken, tenantMiddleware, allgettracking);
}
