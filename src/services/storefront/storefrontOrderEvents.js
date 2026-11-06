import moment from "moment";
import { contactMessageHistory } from "../../models/activities/contactMessageHistoryModel.js";
import { contactModel } from "../../models/activities/contactModel.js";
import emitToCompany from "../1socketIOServices/emitToCompany.js";

// A new storefront order lands in the contact's EXISTING chat thread (contact_message_histories,
// entry_flag 3 = storefront chat, message_side 2 = customer - see storefrontChatService.js), so the team
// sees it exactly like a message the customer typed. Emits the existing "contact-chat-changed" event
// (what the CRM web and the Flutter app subscribe to). No new event name.
const ENTRY_FLAG_STOREFRONT_CHAT = 3;
const SIDE_CUSTOMER = 2;
const MAX_LENGTH = 255; // contact_message_histories.description is a varchar(255)

const PAYMENT_LABEL = { razorpay: "online payment", cash: "cash", bank: "bank transfer", upi: "UPI" };

/** Never throws - the order is already committed, a chat/socket problem must not fail it. */
export const postStorefrontOrderToChat = async (req, { tenantDB, company_masters_id, a_application_login_id, contact_id, cart_id, cart_number, grand_total, total_qty, payment_method, requires_approval }) => {
  try {
    const ref = cart_number ? `#${cart_number}` : `(draft ${cart_id})`;
    const parts = [`New order ${ref} - Rs ${Number(grand_total || 0).toFixed(2)}`];
    if (total_qty) parts.push(`${total_qty} item(s)`);
    parts.push(requires_approval ? "awaiting approval" : PAYMENT_LABEL[payment_method] || payment_method);
    const description = parts.join(" - ").slice(0, MAX_LENGTH);

    const now = moment().format("YYYY-MM-DD HH:mm:ss");
    await contactMessageHistory(tenantDB).create({
      company_masters_id,
      a_application_login_id,
      contact_masters_id: contact_id,
      message_side: SIDE_CUSTOMER,
      entry_flag: ENTRY_FLAG_STOREFRONT_CHAT,
      description,
      created_date_time: now,
      isDelete: 0,
      isActive: 1,
    });
    // Moves the contact to the top of the contact list, same as a typed chat message.
    await contactModel(tenantDB).update({ modified_date: now }, { where: { id: contact_id, company_masters_id } });

    const io = req.app.get("io");
    emitToCompany(io, company_masters_id, "contact-chat-changed", { contact_id, order_message: description });
  } catch (e) {
    console.error("storefront order -> chat failed", e);
  }
};
