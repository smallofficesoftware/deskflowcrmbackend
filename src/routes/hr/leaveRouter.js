import { allLeave, createLeave, updateLeave } from "../../controllers/hr/leaveController.js";
import { authenticateToken } from "../../middlewares/auth.js";
import { productUpload } from "../../middlewares/multer.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";


export default (app) => {
    app.post("/get-leave", authenticateToken, tenantMiddleware, allLeave);
    app.post("/create-leave", authenticateToken, tenantMiddleware, productUpload.single("attachment"), createLeave);
    app.post("/update-leave", authenticateToken, tenantMiddleware, productUpload.single("attachment"), updateLeave);
};
