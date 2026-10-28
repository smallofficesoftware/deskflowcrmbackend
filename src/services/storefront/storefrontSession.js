import jwt from "jsonwebtoken";
import { getTenantDB } from "../../config/dbManager.js";
import { JWT_TOKEN_SIGNATURE } from "../../utils/appConstants.js";

// Customer session for the storefront (plans/2026-10-15-ecommerce-b2b-b2c-
// plan.txt, P3/4.2 - "new customer session/token - separate from internal
// auth.js"). Reuses the app's existing JWT_TOKEN_SIGNATURE rather than adding
// a new secret/env var (same risk call formBuilderPublicOtp.js already made
// for its own lower-stakes public OTP challenge) - "separate from internal
// auth.js" is satisfied by a distinct `aud` claim and payload shape, not a
// distinct secret: a storefront token can never be mistaken for a staff one
// because it's missing the claims middlewares/auth.js's authenticateToken
// actually checks (a_application_login_id, company context shape, etc.), and
// vice versa - internal auth.js never reads this module or its tokens.
const AUDIENCE = "storefront-customer";
const EXPIRES_IN = "30d";

// a_application_login_id is carried in the token (not just company_masters_id)
// so requireStorefrontSession can resolve req.tenantDB itself via
// getTenantDB() without a second resolveCompanyBySlug() round-trip on every
// protected request - the same two ids resolveCompanyBySlug() already
// returned at login time.
//
// REVISED 23-10-2026: a storefront customer IS a contact_masters row (no
// separate storefront_customers table - see migration 20261023100000's own
// comment), so this now carries contact_master_id, not storefront_customer_id.
// `scope: "chat"` marks a guest session proven only by a mobile OTP (no account/login). It is honoured by
// requireStorefrontChatSession alone (chat + support tickets); every other check rejects it, so a chat guest can
// never act as a logged-in customer (checkout, orders, price lists, browsing an invite-only/private store).
export const createSessionToken = (contact, a_application_login_id, scope) =>
  jwt.sign(
    {
      aud: AUDIENCE,
      contact_master_id: contact.id,
      company_masters_id: contact.company_masters_id,
      a_application_login_id,
      ...(scope ? { scope } : {}),
    },
    JWT_TOKEN_SIGNATURE,
    { expiresIn: EXPIRES_IN }
  );

export const verifySessionToken = (token, { allowChatScope = false } = {}) => {
  try {
    const decoded = jwt.verify(token, JWT_TOKEN_SIGNATURE);
    if (decoded?.aud !== AUDIENCE) return null;
    if (decoded.scope === "chat" && !allowChatScope) return null;
    return decoded;
  } catch {
    return null;
  }
};

/** Express middleware: reads the storefront session token and attaches
 * req.storefrontSession ({contact_master_id, company_masters_id}).
 * 403s otherwise - every /storefront/me* route needs this.
 *
 * No cookie-parser is registered anywhere in this app (confirmed - grep for
 * `cookie-parser`/`req.cookies` across src/ turns up nothing), and the
 * storefront's Next.js frontend is a separate origin from this API, so a
 * cookie set here would need cross-site SameSite=None;Secure plumbing this
 * app has never needed before. Instead this follows the EXACT existing
 * internal convention (middlewares/auth.js's authenticateToken): the raw
 * token goes straight in the `authorization` header, no "Bearer " prefix,
 * no cookie. The frontend BFF layer decides how it persists the token
 * (its own first-party cookie on its own domain, etc.) - this backend only
 * issues/verifies it. */
const buildSessionMiddleware = (options) => async (req, res, next) => {
  const token = req.headers.authorization;
  const session = token ? verifySessionToken(token, options) : null;
  if (!session) {
    return res.status(200).send({
      code: 403,
      ack: 0,
      ack_msg: "Please log in to continue.",
      developer_msg: "Missing or invalid storefront session token",
      data: [],
    });
  }

  const tenantDBInfo = await getTenantDB(session.a_application_login_id, session.company_masters_id);
  if (!tenantDBInfo?.sequelize) {
    return res.status(200).send({
      code: 403,
      ack: 0,
      ack_msg: "Please log in to continue.",
      developer_msg: "Could not resolve tenant DB for storefront session",
      data: [],
    });
  }

  req.storefrontSession = session;
  req.tenantDB = tenantDBInfo.sequelize;
  next();
};

export const requireStorefrontSession = buildSessionMiddleware({});
/** Same, but also accepts a mobile-OTP guest (chat-scope) session - for chat and support tickets only. */
export const requireStorefrontChatSession = buildSessionMiddleware({ allowChatScope: true });
