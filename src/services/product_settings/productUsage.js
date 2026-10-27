import { QueryTypes } from "sequelize";

/**
 * Where a product is used. A product used anywhere in this list must not be deleted, because the
 * document, task, price list or job card that points at it would lose its product.
 *
 * Each entry: table, the column that holds the product id, and the label shown to the user. Tables or
 * columns a tenant database does not have yet are skipped, so an older tenant never fails the check.
 */
const PRODUCT_USAGE = [
    { table: "cart_items", column: "item_product_id", label: "Quotation / Order / Invoice" },
    { table: "price_lists", column: "product_id", label: "Price List" },
    { table: "task_managements", column: "product_id", label: "Task / Support Ticket" },
    { table: "inquiries", column: "product_id", label: "Inquiry" },
    { table: "visits", column: "product_id", label: "Visit" },
    { table: "product_bill_of_materials", column: "product_id", label: "Bill of Material" },
    { table: "bom_vs_process_lists", column: "product_id", label: "Bill of Material" },
    { table: "bom_process_vs_cons_rejcts", column: "master_product_id", label: "Bill of Material" },
    { table: "product_variant_attributes", column: "parent_product_id", label: "Variants" },
    { table: "product_variant_option_values", column: "product_id", label: "Variants" },
    { table: "products", column: "parent_product_id", label: "Variants" },
    { table: "job_cards", column: "item_id", label: "Job Card" },
    { table: "job_cards", column: "parent_material_id", label: "Job Card" },
    { table: "production_transactions", column: "production_item_id", label: "Production" },
    { table: "production_transaction_items", column: "item_id", label: "Production" },
    { table: "cart_vs_serial_numbers", column: "product_id", label: "Serial Numbers" },
    { table: "target_vs_incentives", column: "product_id", label: "Target / Incentive" },
];

/**
 * For each product id, the list of places it is used (labels, no duplicates). A product that is not
 * used anywhere is missing from the result.
 *
 * Rows already deleted (isDelete = 1) do not count, on tables that have that column.
 *
 * @returns {Promise<Map<number, string[]>>}
 */
export async function findProductUsage(tenantDB, productIds, { transaction } = {}) {
    const usage = new Map();
    const ids = [...new Set((productIds || []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
    if (ids.length === 0) return usage;

    const tables = [...new Set(PRODUCT_USAGE.map((u) => u.table))];
    const columnRows = await tenantDB.query(
        `SELECT TABLE_NAME AS t, COLUMN_NAME AS c
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (:tables)`,
        { replacements: { tables }, type: QueryTypes.SELECT, transaction }
    );
    const columnsOf = new Map();
    columnRows.forEach(({ t, c }) => {
        if (!columnsOf.has(t)) columnsOf.set(t, new Set());
        columnsOf.get(t).add(c);
    });

    for (const { table, column, label } of PRODUCT_USAGE) {
        const cols = columnsOf.get(table);
        if (!cols || !cols.has(column)) continue;

        const notDeleted = cols.has("isDelete") ? "AND isDelete = 0" : "";
        const rows = await tenantDB.query(
            `SELECT DISTINCT \`${column}\` AS id FROM \`${table}\` WHERE \`${column}\` IN (:ids) ${notDeleted}`,
            { replacements: { ids }, type: QueryTypes.SELECT, transaction }
        );
        rows.forEach(({ id }) => {
            const key = Number(id);
            const labels = usage.get(key) || [];
            if (!labels.includes(label)) labels.push(label);
            usage.set(key, labels);
        });
    }
    return usage;
}
