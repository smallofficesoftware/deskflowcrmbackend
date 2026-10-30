import webpush from "web-push";
import { QueryTypes } from "sequelize";
import { resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";

// Web push for the ecommerce storefront: order status updates and chat replies reach a customer's
// installed storefront app / browser. Keys come from the environment (generate once with
// `npx web-push generate-vapid-keys`): STOREFRONT_VAPID_PUBLIC_KEY, STOREFRONT_VAPID_PRIVATE_KEY and
// STOREFRONT_VAPID_SUBJECT (a mailto: or https: contact). Without keys the feature is off and every
// call here is a harmless no-op. A badly formed setting must never stop the backend from starting: this file
// loads at startup, so any problem with the keys just switches push off and is logged.

const PUBLIC_KEY = (process.env.STOREFRONT_VAPID_PUBLIC_KEY || "").trim();
const PRIVATE_KEY = (process.env.STOREFRONT_VAPID_PRIVATE_KEY || "").trim();
const RAW_SUBJECT = (process.env.STOREFRONT_VAPID_SUBJECT || "").trim() || "mailto:support@smalloffice.in";
// The push library wants a URL: a plain address like info@example.com becomes mailto:info@example.com.
const SUBJECT = /^(mailto:|https:\/\/)/i.test(RAW_SUBJECT) ? RAW_SUBJECT : `mailto:${RAW_SUBJECT}`;

let pushEnabled = false;
if (PUBLIC_KEY && PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
    pushEnabled = true;
  } catch (error) {
    console.error("storefront push is switched off - the STOREFRONT_VAPID_* settings are not valid:", error?.message || error);
  }
}

/** GET /storefront/push/key - public: the VAPID public key the browser subscribes with (null = push is off). */
export const getStorefrontPushKey = async () => resSuccess({ data: { item: { public_key: pushEnabled ? PUBLIC_KEY : null } } });

/** POST /storefront/me/push/subscribe { endpoint, keys: { p256dh, auth } } */
export const subscribeStorefrontPush = async (req) => {
  try {
    if (!pushEnabled) return resError({ ack_msg: "Notifications are not enabled on this server." });
    const { contact_master_id, company_masters_id } = req.storefrontSession;
    const endpoint = String(req.body?.endpoint || "");
    const p256dh = String(req.body?.keys?.p256dh || "");
    const auth = String(req.body?.keys?.auth || "");
    if (!endpoint.startsWith("https://") || endpoint.length > 500 || !p256dh || !auth) {
      return resBadRequest({ developer_msg: "A valid push subscription (endpoint, keys.p256dh, keys.auth) is required" });
    }
    const userAgent = String(req.headers["user-agent"] || "").slice(0, 255);
    // One row per browser; a re-subscribe (or another customer on the same browser) takes the row over.
    await req.tenantDB.query(
      `INSERT INTO storefront_push_subscriptions (company_masters_id, contact_masters_id, endpoint, p256dh, auth, user_agent, isDelete)
       VALUES (:company, :contact, :endpoint, :p256dh, :auth, :userAgent, 0)
       ON DUPLICATE KEY UPDATE company_masters_id = VALUES(company_masters_id), contact_masters_id = VALUES(contact_masters_id),
         p256dh = VALUES(p256dh), auth = VALUES(auth), user_agent = VALUES(user_agent), isDelete = 0`,
      { replacements: { company: company_masters_id, contact: contact_master_id, endpoint, p256dh, auth, userAgent } }
    );
    return resSuccess({ data: { item: { subscribed: true } } });
  } catch (error) {
    return resError({ developer_msg: `subscribeStorefrontPush failed: ${error}` });
  }
};

/** POST /storefront/me/push/unsubscribe { endpoint } */
export const unsubscribeStorefrontPush = async (req) => {
  try {
    const { contact_master_id } = req.storefrontSession;
    const endpoint = String(req.body?.endpoint || "");
    if (!endpoint) return resBadRequest({ developer_msg: "endpoint is required" });
    await req.tenantDB.query(
      `UPDATE storefront_push_subscriptions SET isDelete = 1 WHERE endpoint = :endpoint AND contact_masters_id = :contact`,
      { replacements: { endpoint, contact: contact_master_id } }
    );
    return resSuccess({ data: { item: { subscribed: false } } });
  } catch (error) {
    return resError({ developer_msg: `unsubscribeStorefrontPush failed: ${error}` });
  }
};

/**
 * Push `{ title, body, url, tag }` to every device of one customer. Fire-and-forget safe: never throws, so a
 * push problem can never fail the order update or chat reply that triggered it. Dead subscriptions
 * (404/410 from the push service) are switched off.
 */
export const notifyStorefrontContact = async (tenantDB, companyId, contactId, payload) => {
  try {
    if (!pushEnabled || !tenantDB || !companyId || !contactId) return;
    const subs = await tenantDB.query(
      `SELECT id, endpoint, p256dh, auth FROM storefront_push_subscriptions
        WHERE company_masters_id = :companyId AND contact_masters_id = :contactId AND isDelete = 0`,
      { replacements: { companyId, contactId }, type: QueryTypes.SELECT }
    );
    const message = JSON.stringify(payload);
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, message, { TTL: 86400 });
        } catch (error) {
          if (error?.statusCode === 404 || error?.statusCode === 410) {
            await tenantDB.query(`UPDATE storefront_push_subscriptions SET isDelete = 1 WHERE id = :id`, { replacements: { id: s.id } });
          } else {
            console.error("storefront push: send failed", error?.statusCode || error?.message);
          }
        }
      })
    );
  } catch (error) {
    console.error("storefront push: notify failed", error);
  }
};

/** A storefront order (sales order, carts type 2) moved to a new stage -> tell its customer. */
export const notifyStorefrontOrderStatus = async (tenantDB, cartId, statusId) => {
  try {
    if (!pushEnabled || !tenantDB || !cartId || !statusId) return;
    const [row] = await tenantDB.query(
      `SELECT c.cart_number, c.to_customer_id, c.company_masters_id, s.name AS stage_name
         FROM carts c
         LEFT JOIN stage_status_masters s ON s.id = :statusId AND s.isDelete = 0
        WHERE c.id = :cartId AND c.type = 2 AND c.isDelete = 0`,
      { replacements: { cartId, statusId }, type: QueryTypes.SELECT }
    );
    if (!row?.to_customer_id || !row.stage_name) return;
    await notifyStorefrontContact(tenantDB, row.company_masters_id, row.to_customer_id, {
      title: `Order ${row.cart_number || `#${cartId}`} update`,
      body: `Your order is now: ${row.stage_name}`,
      url: "/account/orders",
      tag: `order-${cartId}`,
    });
  } catch (error) {
    console.error("storefront push: order status notify failed", error);
  }
};
