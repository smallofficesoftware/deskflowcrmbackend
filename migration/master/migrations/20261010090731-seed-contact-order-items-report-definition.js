/**
 * Migration Name: seed-contact-order-items-report-definition
 * Database Type: MASTER
 * Created: 10/10/2026 02:37:31 PM
 *
 * Seeds the Report Builder gallery (`system_report_definitions`) with a
 * ready-made "Contact - Order Items" report (ticket #1289): per order, the
 * customer's name and how many items are on that order. Only possible once
 * `cart_items` got an `order` relation + a groupable `cart_id` column in
 * modelRegistry.js (same commit) - before that there was no whitelisted path
 * from an item row back to its order's customer.
 */

const DEFINITION = {
  name: "Contact - Order Items",
  type: "query",
  model_key: "cart_items",
  columns_json: JSON.stringify([
    { column: "order.customer.company_name" },
    { column: "order.customer.person_name" },
    { column: "order.cart_number" },
    { column: "order.cart_date" },
    { column: "id", aggregate: "count", alias: "item_count" },
  ]),
  // One row per order - cart_id is cart_items' own FK to its parent order
  // (see modelRegistry.js's cart_items.columns.cart_id).
  group_by_json: JSON.stringify(["cart_id"]),
  filters_json: null,
  filters_to_show: null,
  category: "CRM",
  description: "Per order: the customer's name and how many items are on that order.",
  priority: "normal",
  display_order: 1,
};

export const up = async (queryInterface) => {
  const [existing] = await queryInterface.sequelize.query(
    "SELECT COUNT(*) as cnt FROM `system_report_definitions` WHERE `name` = ? AND `model_key` = ?",
    { replacements: [DEFINITION.name, DEFINITION.model_key] }
  );
  if (Number(existing[0].cnt) > 0) return;

  await queryInterface.bulkInsert("system_report_definitions", [
    {
      ...DEFINITION,
      isDelete: 0,
      isActive: 1,
      created_date_time: new Date(),
    },
  ]);
};

export const down = async (queryInterface) => {
  await queryInterface.bulkDelete("system_report_definitions", {
    name: DEFINITION.name,
    model_key: DEFINITION.model_key,
  });
};
