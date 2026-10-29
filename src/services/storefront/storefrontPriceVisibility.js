import { contactModel } from "../../models/activities/contactModel.js";
import { verifySessionToken } from "./storefrontSession.js";

// "Price visibility" store setting (marketplace_addon_settings.config_json.price_visibility):
//   everyone   - prices are shown to every visitor (default, the behaviour before this setting)
//   login      - prices are shown only to a logged-in customer
//   price_list - prices are shown only to a logged-in customer that has a price list of their own
//   never      - prices are hidden from everyone, even after login
// A hidden price is sent as null with `price_hidden: true`, so the storefront shows "Ask for rate" instead.
// A chat-only guest session (mobile OTP, no login) is not a login, so verifySessionToken rejects it here.
export const PRICE_VISIBILITY_MODES = ["everyone", "login", "price_list", "never"];

export const normalizePriceVisibility = (value) => (PRICE_VISIBILITY_MODES.includes(value) ? value : "everyone");

/** True when this request must not be shown prices. `req.headers.authorization` carries the customer session. */
export const arePricesHidden = async (req, resolved, settings) => {
  const mode = normalizePriceVisibility(settings?.price_visibility);
  if (mode === "everyone") return false;
  if (mode === "never") return true;

  const token = req.headers.authorization;
  const session = token ? verifySessionToken(token) : null;
  const loggedIn = session && Number(session.company_masters_id) === Number(resolved.company_masters_id);
  if (!loggedIn) return true;
  if (mode === "login") return false;

  // price_list: the customer needs a price list of their own.
  const contact = await contactModel(resolved.tenantDB).findOne({
    where: { id: session.contact_master_id, company_masters_id: resolved.company_masters_id, isDelete: 0 },
    attributes: ["assinged_to_price_list"],
    raw: true,
  });
  return !Number(contact?.assinged_to_price_list);
};

/** A product (or variant) with every price removed. */
export const withoutPrices = (product) => ({
  ...product,
  rate: null,
  net_rate: null,
  ...(product.qty_slabs ? { qty_slabs: [] } : {}),
  price_hidden: true,
});
