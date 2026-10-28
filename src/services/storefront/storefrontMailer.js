import { createTransporter } from "../../middlewares/nodemailer.js";
import { MAIL_SETTING_HOST_USER_NAME } from "../../utils/appConstants.js";
import { generateEmailMessage } from "../../utils/sharedFunctions.js";

// Email OTP delivery for the storefront (plans/2026-10-15-ecommerce-b2b-b2c-
// plan.txt, P3/Q3 method 4/1). Reuses createTransporter() (middlewares/
// nodemailer.js, tenant/company-aware SMTP resolution, falling back to the
// global MAIL_SETTING_* constants) + generateEmailMessage() (sharedFunctions.js,
// the same OTP email template the CRM's own onboarding flow uses) - there is
// no single exported sendMail() to call as-is (every existing caller builds
// its own nodemailer.createTransport inline, see changeMobileNumberServices.js's
// sendOTPOldEmail/sendOTPNewEmail), so this is a thin new wrapper following
// that same proven call shape, not a new design.
//
// KNOWN SIMPLIFICATION: "from" is always the global MAIL_SETTING_HOST_USER_NAME,
// even when createTransporter() resolved a company-specific SMTP account (its
// own auth.user) - matches changeMobileNumberServices.js's existing pattern,
// which has the same gap. Revisit if a company's custom "from" address needs
// to show correctly on a customer's inbox.
export const sendStorefrontOtpEmail = async (toEmail, otp, a_application_login_id = null) => {
  const transporter = await createTransporter(a_application_login_id);
  const html = generateEmailMessage({
    otp,
    additionalMessage: "This code is for your storefront account - do not share it.",
  });

  const info = await transporter.sendMail({
    from: MAIL_SETTING_HOST_USER_NAME,
    to: toEmail,
    subject: "Your storefront verification code",
    html,
  });

  return info?.accepted?.length > 0;
};
