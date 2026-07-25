import {
    allInquiry,createInquiry
  } from "../../controllers/activities/inquiryController.js";
  import {authenticateToken, publicAuthenticateToken} from "../../middlewares/auth.js";
  import {tenantMiddleware} from "../../middlewares/tenantMiddleware.js";

  export default (app) => {
    app.post("/inquiry", authenticateToken , tenantMiddleware,  allInquiry);
    app.post("/b2b-create-inquiry",  publicAuthenticateToken, tenantMiddleware,  createInquiry);

  };
  