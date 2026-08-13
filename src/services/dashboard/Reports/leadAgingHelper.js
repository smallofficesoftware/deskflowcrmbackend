import { QueryTypes } from "sequelize";

// Each entry selects (contact_id, activity_date) pairs for one "contacted via X" source.
// carts.type: 1=Quotation, 2=Sales Order, 3=Sales Invoice, 5=Purchase Order, 12=Proforma Invoice.
const ACTIVITY_SOURCE_SQL = {
  call: `SELECT contact_id AS cid, call_date_time AS activity_date FROM call_histories WHERE company_masters_id = :companyId AND isDelete = 0 AND contact_id IS NOT NULL`,
  whatsapp: `SELECT contact_masters_id AS cid, created_date_time AS activity_date FROM contact_message_histories WHERE company_masters_id = :companyId AND isDelete = 0 AND contact_masters_id IS NOT NULL`,
  visit: `SELECT contact_id AS cid, created_date_time AS activity_date FROM visits WHERE company_masters_id = :companyId AND isDelete = 0 AND contact_id IS NOT NULL`,
  task: `SELECT contact_masters_id AS cid, created_date_time AS activity_date FROM task_managements WHERE company_masters_id = :companyId AND isDelete = 0 AND contact_masters_id IS NOT NULL`,
  inquiry: `SELECT contact_master_id AS cid, created_date_time AS activity_date FROM inquiries WHERE company_masters_id = :companyId AND isDelete = 0 AND contact_master_id IS NOT NULL`,
  sales_order: `SELECT to_customer_id AS cid, created_date_time AS activity_date FROM carts WHERE company_masters_id = :companyId AND isDelete = 0 AND type = 2 AND to_customer_id IS NOT NULL`,
  quotation: `SELECT to_customer_id AS cid, created_date_time AS activity_date FROM carts WHERE company_masters_id = :companyId AND isDelete = 0 AND type = 1 AND to_customer_id IS NOT NULL`,
  proforma_invoice: `SELECT to_customer_id AS cid, created_date_time AS activity_date FROM carts WHERE company_masters_id = :companyId AND isDelete = 0 AND type = 12 AND to_customer_id IS NOT NULL`,
  invoice: `SELECT to_customer_id AS cid, created_date_time AS activity_date FROM carts WHERE company_masters_id = :companyId AND isDelete = 0 AND type = 3 AND to_customer_id IS NOT NULL`,
  purchase_order: `SELECT to_customer_id AS cid, created_date_time AS activity_date FROM carts WHERE company_masters_id = :companyId AND isDelete = 0 AND type = 5 AND to_customer_id IS NOT NULL`,
};

const BUCKET_DAYS = { 7: 7, 15: 15, 30: 30, "7": 7, "15": 15, "30": 30 };

// bucket: "7" | "15" | "30" | "never"
export const getContactIdsByLastActivity = async (
  tenantDB,
  companyId,
  activityTypes,
  bucket
) => {
  const validTypes = (activityTypes || []).filter(
    (t) => ACTIVITY_SOURCE_SQL[t]
  );

  if (validTypes.length === 0) return [];

  const unionSql = validTypes
    .map((t) => ACTIVITY_SOURCE_SQL[t])
    .join(" UNION ALL ");

  if (bucket === "never") {
    const rows = await tenantDB.query(
      `SELECT cm.id AS id
       FROM contact_masters cm
       WHERE cm.company_masters_id = :companyId
         AND cm.isDelete = 0
         AND cm.id NOT IN (
           SELECT cid FROM (${unionSql}) AS activity_union WHERE cid IS NOT NULL
         )`,
      {
        replacements: { companyId },
        type: QueryTypes.SELECT,
      }
    );

    return rows.map((r) => r.id);
  }

  const days = BUCKET_DAYS[bucket];

  if (!days) return [];

  const rows = await tenantDB.query(
    `SELECT cid FROM (
       SELECT cid, MAX(activity_date) AS last_activity
       FROM (${unionSql}) AS activity_union
       WHERE cid IS NOT NULL
       GROUP BY cid
     ) AS last_activity_per_contact
     WHERE last_activity <= DATE_SUB(NOW(), INTERVAL :days DAY)`,
    {
      replacements: { companyId, days },
      type: QueryTypes.SELECT,
    }
  );

  return rows.map((r) => r.cid);
};
