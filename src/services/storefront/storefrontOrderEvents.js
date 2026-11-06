import moment from "moment";
import { contactMessageHistory } from "../../models/activities/contactMessageHistoryModel.js";
import { contactModel } from "../../models/activities/contactModel.js";
import companyModel from "../../models/company_setup/companyModel.js";
import { APP_URL_SMALL_OFFICE_CRM } from "../../utils/appConstants.js";
import { formatDateAndTimeCreateDateTime } from "../../utils/sharedFunctions.js";
import emitToCompany from "../1socketIOServices/emitToCompany.js";

// A new storefront order lands in the contact's CRM chat as the SAME card the CRM writes when a team member
// creates an order (orderServices.js, cartToMsgBody): same row shape (msg_cart_id, message_side 1,
// message_type_id 2), same HTML (title, #number, total + currency, "View <title>" link, Created By line), so
// it renders and behaves exactly like a CRM-made order. Deliberately no entry_flag 3: that flag is what makes
// the storefront chat widget show a row to the customer, and this is a team-side card.
// Then the existing "contact-chat-changed" socket event is emitted - no new event name.
const MESSAGE_SIDE_TEAM = 1;
const MESSAGE_TYPE_ORDER_CARD = 2;
const CURRENCY = "INR"; // storefront carts carry no currency_id; the CRM's own fallback is INR too

const PAYMENT_LABEL = { razorpay: "online payment", cash: "cash", bank: "bank transfer", upi: "UPI" };

/** Never throws - the order is already committed, a chat/socket problem must not fail it. */
export const postStorefrontOrderToChat = async (req, { tenantDB, company_masters_id, a_application_login_id, contact_id, cart_id, cart_number, grand_total, total_qty, payment_method, requires_approval }) => {
  try {
    const company = await companyModel.findOne({ where: { id: company_masters_id }, attributes: ["order_title", "order_view_formate"], raw: true });
    const title = company?.order_title || "Sales Order";
    const printView = company?.order_view_formate || 1;

    const contact = await contactModel(tenantDB).findOne({ where: { id: contact_id, company_masters_id }, attributes: ["person_name"], raw: true });
    const createdBy = `${contact?.person_name || "Guest"} (Storefront)`;

    const now = moment().format("YYYY-MM-DD HH:mm:ss");
    const when = formatDateAndTimeCreateDateTime(now);
    const description = `
  <b>${title}</b><br>
  ${cart_number ? `#${cart_number}` : "#XXXXXXXX"}<br>
  <b>${grand_total ? `${grand_total}${CURRENCY}` : ""}</b><br>
  <a href="${APP_URL_SMALL_OFFICE_CRM}/OrderPrintViewV${printView}/${cart_id}" target="_blank">View ${title}</a><br>
  <p><b>Created By:</b>${createdBy} (${when})</p>
  `;

    await contactMessageHistory(tenantDB).create({
      contact_masters_id: contact_id,
      a_application_login_id,
      company_masters_id,
      msg_cart_id: cart_id,
      description,
      created_date_time: now,
      message_side: MESSAGE_SIDE_TEAM,
      message_type_id: MESSAGE_TYPE_ORDER_CARD,
      application_login_name: createdBy,
    });
    // Moves the contact to the top of the contact list, same as any new chat activity.
    await contactModel(tenantDB).update({ modified_date: now }, { where: { id: contact_id, company_masters_id } });

    // Plain-text line for the CRM toast (useStorefrontOrderToast); ordinary chat events carry no such field.
    const parts = [`New order ${cart_number ? `#${cart_number}` : `(draft ${cart_id})`} - Rs ${Number(grand_total || 0).toFixed(2)}`];
    if (total_qty) parts.push(`${total_qty} item(s)`);
    parts.push(requires_approval ? "awaiting approval" : PAYMENT_LABEL[payment_method] || payment_method);

    emitToCompany(req.app.get("io"), company_masters_id, "contact-chat-changed", { contact_id, order_message: parts.join(" - ") });
  } catch (e) {
    console.error("storefront order -> chat failed", e);
  }
};
