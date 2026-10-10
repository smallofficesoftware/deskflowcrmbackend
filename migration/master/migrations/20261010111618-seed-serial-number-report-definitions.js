/**
 * Migration Name: seed-serial-number-report-definitions
 * Database Type: MASTER
 *
 * Seeds the Report Builder gallery (`system_report_definitions`) with 4
 * ready-made "serial number wise" reports, covering the full lifecycle of a
 * serial-tracked product:
 *  - Sales History: every order (sales order -> dispatch -> invoice chain)
 *    a serial number has ever been on (cart_vs_serial_numbers - already a
 *    registered report source, no backend gap).
 *  - Stock Status: whether a serial is currently in stock or sold out,
 *    via a running in/out ledger (serial_stock_ledger - already registered).
 *  - Task History / Visit History: which Tasks/Support Tickets/Visits were
 *    done against a serial - NEWLY reportable as of this same change, which
 *    registered task_managements.serial_number/product_id and
 *    visits.serial_number/product_id in modelRegistry.js (added by
 *    20261007100000-add-product-serial-to-task-managements-and-visits.js,
 *    but never wired into the Report Builder until now).
 */

const DEFINITIONS = [
  {
    name: "Serial Number - Sales History",
    model_key: "cart_vs_serial_numbers",
    category: "CRM",
    description: "Every order (sales order, dispatch, invoice) a serial number has been on, with product and customer.",
    columns: [
      { column: "serial_numbers" },
      { column: "product.product_name" },
      { column: "cart_type" },
      { column: "cart.cart_number" },
      { column: "cart.cart_date" },
      { column: "cart.customer.company_name" },
      { column: "cart.customer.person_name" },
      { column: "created_date_time" },
    ],
  },
  {
    name: "Serial Number - Stock Status",
    model_key: "serial_stock_ledger",
    category: "Inventory",
    description: "Running in/out stock balance per serial number - 1 = currently in stock, 0 = sold/returned out.",
    columns: [
      { column: "serial_numbers" },
      { column: "product.product_name" },
      { column: "cart_type" },
      { column: "cart.cart_number" },
      { column: "created_date_time" },
      { column: "stock_delta", runningTotal: true, alias: "stock_balance" },
    ],
  },
  {
    name: "Serial Number - Task History",
    model_key: "task_managements",
    category: "Activities",
    description: "Tasks and Support Tickets filled in against a serial-tracked product, with the serial number and contact.",
    columns: [
      { column: "serial_number" },
      { column: "product.product_name" },
      { column: "task_title" },
      { column: "task_type" },
      { column: "contact.person_name" },
      { column: "task_fromdate" },
      { column: "completed_date" },
    ],
  },
  {
    name: "Serial Number - Visit History",
    model_key: "visits",
    category: "Activities",
    description: "Visits filled in against a serial-tracked product, with the serial number and contact.",
    columns: [
      { column: "serial_number" },
      { column: "product.product_name" },
      { column: "person_name" },
      { column: "remark" },
      { column: "start_date" },
      { column: "end_date" },
      { column: "contact.person_name" },
    ],
  },
];

export const up = async (queryInterface) => {
  const [existing] = await queryInterface.sequelize.query(
    "SELECT name FROM `system_report_definitions` WHERE `name` IN (?)",
    { replacements: [DEFINITIONS.map((d) => d.name)] }
  );
  const existingNames = new Set(existing.map((r) => r.name));

  const rows = DEFINITIONS.filter((d) => !existingNames.has(d.name)).map((d) => ({
    name: d.name,
    type: "query",
    model_key: d.model_key,
    columns_json: JSON.stringify(d.columns),
    group_by_json: JSON.stringify([]),
    filters_json: null,
    filters_to_show: null,
    category: d.category,
    description: d.description,
    priority: "normal",
    display_order: 1,
    isDelete: 0,
    isActive: 1,
    created_date_time: new Date(),
  }));

  if (rows.length > 0) {
    await queryInterface.bulkInsert("system_report_definitions", rows);
  }
};

export const down = async (queryInterface) => {
  await queryInterface.bulkDelete("system_report_definitions", {
    name: DEFINITIONS.map((d) => d.name),
  });
};
