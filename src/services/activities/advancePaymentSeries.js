import { Op } from "sequelize";
import { accountTransactionsModel } from "../../models/activities/accountTransactionsModel.js";
import { resolveAccountTransactionSeries } from "./accountTransactionSeries.js";

// Sales order / sales invoice / purchase return advances are money received
// (credit); the other cart types pay it out (debit).
export const CREDIT_ADVANCE_CART_TYPES = [2, 3, 7];

// Approve request: the series (or typed voucher number) picked in the Approve
// dialog for the advance payment entry. Returns the message to refuse the approve
// with, or null. Nothing is saved. A cart whose advance entry already exists keeps
// its number, so only a first approval is checked.
export const checkAdvanceSeries = async (req, { cart, companyMasterId, cartId, referenceTable }) => {
  const advance = Number(cart?.advance_payment);
  if (!(advance > 0)) return null;
  if (!cart.advance_series_prefix && !cart.advance_entered_series_number) return null;

  if (cartId) {
    const existing = await accountTransactionsModel(req.tenantDB).findOne({
      where: {
        reference_id: cartId,
        reference_table: referenceTable || "carts",
        isDelete: 0,
        remark: { [Op.like]: "%Advance Payment%" },
      },
      attributes: ["id"],
    });
    if (existing) return null;
  }

  const result = await resolveAccountTransactionSeries(req.tenantDB, {
    company_masters_id: companyMasterId,
    mode: cart.payment_type ? cart.payment_type : -1,
    type: CREDIT_ADVANCE_CART_TYPES.includes(Number(cart.type)) ? 1 : 2,
    payment_date_time: new Date(),
    sr_by_prifix: cart.advance_series_prefix,
    entered_series_number: cart.advance_entered_series_number,
  });
  return result.error || null;
};
