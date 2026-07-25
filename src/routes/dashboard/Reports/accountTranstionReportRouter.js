import {
    accountOutstandingReport,
    allAcountTranctionReport
} from "../../../controllers/dashboard/Reports/teamAllAccountController.js";
import { authenticateToken } from "../../../middlewares/auth.js";
import { tenantMiddleware } from "../../../middlewares/tenantMiddleware.js";


export default (app) => {

    app.post(
        "/accountOutstandingReport",
        authenticateToken,
        tenantMiddleware,
        accountOutstandingReport
    );

    app.post(
        "/allAccountTranctionsReport",
        authenticateToken,
        tenantMiddleware,
        allAcountTranctionReport
    );
};
