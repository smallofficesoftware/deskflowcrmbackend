import { verifyNewEmail, verifyNewEmailOTP, verifyNewNumber, verifyNewNumberOTP, verifyOldEmail, verifyOldEmailAddressOTP, verifyOldNumber, verifyOldNumberOTP } from "../../controllers/user_profile/changeMobileNumberController.js";
import { authenticateToken } from "../../middlewares/auth.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";

export default (app) => {
    app.post("/verify-old-number", authenticateToken, tenantMiddleware, verifyOldNumber);
    app.post("/verify-old-number-otp", authenticateToken, tenantMiddleware, verifyOldNumberOTP);
    app.post("/verify-new-number", authenticateToken, tenantMiddleware, verifyNewNumber);
    app.post("/verify-new-number-otp", authenticateToken, tenantMiddleware, verifyNewNumberOTP);
    app.post("/verify-old-email", authenticateToken, tenantMiddleware, verifyOldEmail);
    app.post("/verify-old-email-otp", authenticateToken, tenantMiddleware, verifyOldEmailAddressOTP);
    app.post("/verify-new-email", authenticateToken, tenantMiddleware, verifyNewEmail);
    app.post("/verify-new-email-address-otp", authenticateToken, tenantMiddleware, verifyNewEmailOTP);
}