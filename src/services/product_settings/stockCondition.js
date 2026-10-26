import { Op } from "sequelize";

/**
 * The one definition of "which cart item rows move stock", shared so every stock figure agrees.
 * It is the rule the product list, Stock Summary, stock movement and stock checks already use:
 *
 * - cart types 3 invoice, 4 purchase invoice, 6 sales return, 7 purchase return, 8 inward,
 *   9 dispatch, 10 stock inward, 11 stock outward;
 * - a real cart number (drafts do not count);
 * - `stock_type` is not 0 (documents that do not move stock, or copies made from another one);
 * - a purchase invoice made from an inward (reference_type 8) and an invoice made from a dispatch
 *   (reference_type 9) are not counted again, because the inward / dispatch already moved the stock.
 *
 * Direction: stock in = 4 (not from an inward), 6, 8, 10; stock out = 3 (not from a dispatch), 7, 9, 11.
 */
export const STOCK_CART_TYPES = [4, 3, 6, 7, 8, 9, 10, 11];

/**
 * Conditions for a cart_items query, to be spread into the query's `[Op.and]` array:
 * `where: { isDelete: 0, [Op.and]: [...otherConditions, ...stockCartItemConditions()] }`.
 */
export const stockCartItemConditions = () => [
    { cart_type: { [Op.in]: STOCK_CART_TYPES } },
    { cart_number: { [Op.ne]: null } },
    { cart_number: { [Op.ne]: "" } },
    { stock_type: { [Op.ne]: 0 } },
    {
        [Op.or]: [
            { cart_type: 4, reference_type: { [Op.ne]: 8 } },
            { cart_type: 3, reference_type: { [Op.ne]: 9 } },
            { cart_type: { [Op.in]: [6, 7, 8, 9, 10, 11] } },
        ],
    },
];

/** +1 when the row brings stock in, -1 when it takes stock out, 0 when it does not move stock. */
export const stockDirection = (cartType, referenceType) => {
    const type = Number(cartType);
    const ref = Number(referenceType);
    if ((type === 4 && ref !== 8) || type === 6 || type === 8 || type === 10) return 1;
    if ((type === 3 && ref !== 9) || type === 7 || type === 9 || type === 11) return -1;
    return 0;
};

/** The row's quantity with its sign: positive in, negative out, 0 when it does not move stock. */
export const stockSignedQty = (item) =>
    stockDirection(item.cart_type, item.reference_type) * (parseFloat(item.item_qty) || 0);
