import crypto from "crypto";
import moment from "moment";
import Razorpay from "razorpay";
import { accountTransactionsModel } from "../../models/activities/accountTransactionsModel.js";
import { cartModel } from "../../models/activities/cartsModel.js";
import { isAppEnabledForCompany } from "../../middlewares/requireAddon.js";
import { getNumberSeries, resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";
import { getStorefrontAuthSettings } from "./storefrontAuthSettings.js";
import { resolveCompanyBySlug } from "./storefrontCompanyResolver.js";

// P4 (plans/2026-10-15-ecommerce-b2b-b2c-plan.txt) - the payment slice deferred
// by the checkout slice. Per-company Razorpay merchant keys + the "which stage
// means paid" setting (both read via getStorefrontAuthSettings, same
// marketplace_addon_settings.config_json blob the settings UI writes - no new
// table). Mirrors the EXISTING CRM billing precedent exactly:
// thirdPartyIntegrationService.js's addPlanByRrazorpay (order creation) and
// razorpayPaymentVerify (HMAC signature check) - same library calls, same
// verification algorithm, just per-company keys instead of the global env
// vars, and a cart instead of a plan. Deliberately client-verify-on-redirect
// only, no server-pushed Razorpay webhook - same limitation the existing
// billing flow already has, not a new gap introduced here.
const ADDON_CODE = "ecommerce-storefront";
const CART_REFERENCE_TABLE = "carts"; // matches accountTransactionCartLinkServices.js's CART_LINK_REFERENCE_TABLE
const TRANSACTION_TYPE_CREDIT_RECEIPT = 1; // paymentTypesList id "1" (CreateAccountTransactionController.ts)
const TRANSACTION_MODE_ONLINE_PORTAL = 3; // paymentModeList id "3" (same file)

async function resolveAndGate(companySlug) {
  const resolved = await resolveCompanyBySlug(companySlug);
  if (!resolved) return { error: resError({ ack_msg: "Store not found" }) };

  const { enabled } = await isAppEnabledForCompany(resolved.tenantDB, resolved.company_masters_id, ADDON_CODE);
  if (!enabled) return { error: resError({ ack_msg: "This store's online ordering is not enabled." }) };

  return { resolved };
}

async function loadPayableCart(tenantDB, company_masters_id, cart_id) {
  const cart = await cartModel(tenantDB).findOne({
    where: { id: cart_id, company_masters_id, isDelete: 0, type: 2 },
  });
  if (!cart) return { error: "Order not found." };
  return { cart };
}

/** Already-recorded check - the retry/idempotency guard for verify. A cart that
 * already has a Credit transaction linked via reference_table/reference_id
 * (the SAME mechanism accountTransactionCartLinkServices.js already uses to
 * read "is this cart paid") has already been confirmed; re-running verify
 * (double webhook-style delivery, a user hitting back/refresh after success)
 * must not create a second transaction or re-advance the stage. */
async function findExistingPaymentTransaction(tenantDB, cart_id) {
  return accountTransactionsModel(tenantDB).findOne({
    where: { reference_table: CART_REFERENCE_TABLE, reference_id: cart_id, type: TRANSACTION_TYPE_CREDIT_RECEIPT, isDelete: 0 },
  });
}

export const createStorefrontPaymentOrder = async (req) => {
  try {
    const { companySlug } = req.params;
    const { cart_id } = req.body || {};
    if (!cart_id) return resBadRequest({ developer_msg: "cart_id is required" });

    const { resolved, error } = await resolveAndGate(companySlug);
    if (error) return error;

    const { cart, error: cartError } = await loadPayableCart(resolved.tenantDB, resolved.company_masters_id, cart_id);
    if (cartError) return resError({ ack_msg: cartError });

    const existing = await findExistingPaymentTransaction(resolved.tenantDB, cart.id);
    if (existing) return resError({ ack_msg: "This order has already been paid for." });

    const settings = await getStorefrontAuthSettings(resolved.tenantDB, resolved.company_masters_id);
    if (!settings.razorpay_key_id || !settings.razorpay_key_secret) {
      return resError({ ack_msg: "Online payment is not set up for this store yet." });
    }
    if (!settings.paid_stage_status_id) {
      return resError({ ack_msg: "This store hasn't configured which stage means \"paid\" yet." });
    }

    const razorpay = new Razorpay({ key_id: settings.razorpay_key_id, key_secret: settings.razorpay_key_secret });
    const amountPaise = Math.round(Number(cart.grand_total) * 100);
    if (!amountPaise || amountPaise <= 0) return resBadRequest({ developer_msg: "Invalid order amount" });

    let order;
    try {
      order = await razorpay.orders.create({
        amount: amountPaise,
        currency: "INR",
        receipt: `cart_${cart.id}`,
        payment_capture: 1,
      });
    } catch (gatewayError) {
      return resError({
        ack_msg: "Could not start payment. Please try again.",
        developer_msg: `Razorpay order creation failed: ${gatewayError?.error?.description || gatewayError}`,
      });
    }

    return resSuccess({
      data: {
        item: {
          razorpay_key_id: settings.razorpay_key_id,
          razorpay_order_id: order.id,
          amount: amountPaise,
          currency: "INR",
          cart_id: cart.id,
        },
      },
    });
  } catch (error) {
    return resError({ developer_msg: `createStorefrontPaymentOrder failed: ${error}` });
  }
};

export const verifyStorefrontPayment = async (req) => {
  try {
    const { companySlug } = req.params;
    const { cart_id, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
    if (!cart_id || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return resBadRequest({ developer_msg: "cart_id, razorpay_order_id, razorpay_payment_id and razorpay_signature are required" });
    }

    const { resolved, error } = await resolveAndGate(companySlug);
    if (error) return error;

    const { cart, error: cartError } = await loadPayableCart(resolved.tenantDB, resolved.company_masters_id, cart_id);
    if (cartError) return resError({ ack_msg: cartError });

    // Idempotent retry: already recorded - just hand back the current state,
    // don't re-verify/re-create/re-advance.
    const existing = await findExistingPaymentTransaction(resolved.tenantDB, cart.id);
    if (existing) {
      return resSuccess({ ack_msg: "Payment already confirmed", data: { item: { cart_id: cart.id, cart_number: cart.cart_number } } });
    }

    const settings = await getStorefrontAuthSettings(resolved.tenantDB, resolved.company_masters_id);
    if (!settings.razorpay_key_secret || !settings.paid_stage_status_id) {
      return resError({ ack_msg: "Online payment is not set up for this store yet." });
    }

    const generatedSignature = crypto
      .createHmac("sha256", settings.razorpay_key_secret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");
    if (generatedSignature !== razorpay_signature) {
      return resError({ ack_msg: "Payment could not be verified." });
    }

    const nowFormatted = moment().format("YYYY-MM-DD HH:mm:ss");

    // cart_number is only reserved once an order is "real" (storefrontCheckoutService.js's
    // own comment) - a confirmed payment IS that moment, same as the old
    // online-store module's "approved" orderType.
    let numberSeries = null;
    if (!cart.cart_number) {
      numberSeries = await getNumberSeries(resolved.company_masters_id, cart.type, cart.cart_date, null, { tenantDB: resolved.tenantDB });
      if (numberSeries?.ack === 0) {
        return resError({ ack_msg: "Payment verified, but order numbering failed. Contact support.", developer_msg: numberSeries?.developer_msg });
      }
    }

    const t = await resolved.tenantDB.transaction();
    try {
      await accountTransactionsModel(resolved.tenantDB).create(
        {
          contact_masters_id: cart.to_customer_id,
          a_application_login_id: resolved.a_application_login_id,
          company_masters_id: resolved.company_masters_id,
          type: TRANSACTION_TYPE_CREDIT_RECEIPT,
          mode: TRANSACTION_MODE_ONLINE_PORTAL,
          amount: cart.grand_total,
          payment_date_time: nowFormatted,
          approve_date_time: nowFormatted,
          remark: "Razorpay online payment (storefront)",
          reference_table: CART_REFERENCE_TABLE,
          reference_id: cart.id,
          gateway_order_id: razorpay_order_id,
          gateway_payment_id: razorpay_payment_id,
          created_date_time: nowFormatted,
          isDelete: 0,
        },
        { transaction: t }
      );

      await cart.update(
        {
          cart_status: settings.paid_stage_status_id,
          ...(numberSeries
            ? { cart_number: numberSeries.order_no, sr_by_number: numberSeries.sr_by_no, sr_by_prifix: numberSeries.sr_by_prifix }
            : {}),
        },
        { transaction: t }
      );

      await t.commit();
    } catch (txError) {
      await t.rollback();
      throw txError;
    }

    return resSuccess({ ack_msg: "Payment confirmed", data: { item: { cart_id: cart.id, cart_number: numberSeries?.order_no || cart.cart_number } } });
  } catch (error) {
    return resError({ developer_msg: `verifyStorefrontPayment failed: ${error}` });
  }
};
