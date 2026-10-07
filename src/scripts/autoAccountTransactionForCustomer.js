import dotenv from "dotenv";
import path from "path";
import { Sequelize as SequelizePkg } from "sequelize";

// Creates the account_transactions the app would have created when an invoice was
// approved (see orderServices.js, createAccountTransaction in commonServices.js), for
// ONE customer or ALL customers. Only approved carts: approve_a_application_login_id <> 0,
// a real customer (to_customer_id <> 0) and a cart number.
//
// Per approved cart:
//   1. Invoice entry   amount = grand_total, amount_type 0, approved by the cart's own approver
//                      (carts.approve_a_application_login_id)
//        Sales Invoice (3) / Purchase Return (7)  -> type 2 (Debit)
//        Purchase Invoice (4) / Sales Return (6)  -> type 1 (Credit)
//   2. Advance entry   only when carts.advance_payment > 0, amount_type 1, remark "Advance Payment",
//        opposite type of the invoice entry, created unapproved (approver 0) exactly like the app
// Entries are linked with reference_table 'carts' / reference_id <cart id>, mode = cart.payment_type
// (or -1), payment/approve/created date = cart.created_date_time, remark in the app's HTML format.
// Safe to re-run: a cart that already has a non-deleted entry of that kind (amount_type 0 for the
// invoice entry, amount_type 1 for the advance entry) is skipped.
//
// DRY RUN by default - nothing is written unless --apply is passed.
//
// Usage: node src/scripts/autoAccountTransactionForCustomer.js --company=<id> --login=<id> (--contact=<id> | --all) [options]
//   --company=<id>        company_masters_id (required)
//   --login=<id>          a_application_login_id recorded as the creator of the entries (required)
//   --contact=<id>        one customer (contact_masters_id)
//   --all                 every customer of the company
//   --db=<name>           tenant DB name; skips the tenant_masters lookup and connects with the
//                         TENANT_DB_* credentials/host from the env file
//   --invoice-types=3,4,6,7  cart types to process (default 3,4,6,7)
//   --from=YYYY-MM-DD / --to=YYYY-MM-DD   only carts dated in that range
//   --apply               actually write
// Run with NODE_ENV=development to load .env.development (default is production).

const NODE_ENV = process.env.NODE_ENV || "production";
dotenv.config({ path: path.resolve(process.cwd(), `.env.${NODE_ENV}`) });

const args = process.argv.slice(2);
const opt = (name) => {
  const a = args.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : null;
};
const APPLY = args.includes("--apply");
const ALL = args.includes("--all");
const CONTACT = Number(opt("contact")) || null;
const COMPANY = Number(opt("company"));
const LOGIN = Number(opt("login"));
const DB_NAME = opt("db");
const FROM = opt("from");
const TO = opt("to");
const INVOICE_TYPES = (opt("invoice-types") || "3,4,6,7").split(",").map(Number);

// Same rule as orderServices.js: invoice entry type by cart type; advance is the opposite.
const invoiceTxType = (cartType) => (cartType === 3 || cartType === 7 ? 2 : 1);

if (!COMPANY || !LOGIN || (!CONTACT && !ALL) || INVOICE_TYPES.some((t) => ![3, 4, 6, 7].includes(t))) {
  console.error("Required: --company --login and --contact=<id> or --all. --invoice-types may only contain 3, 4, 6 and 7.");
  process.exit(1);
}

const dialect = "mysql";
const master = new SequelizePkg(
  process.env.TENANT_DB_DB_NAME,
  process.env.TENANT_DB_USER_NAME,
  process.env.TENANT_DB_PASSWORD,
  { host: process.env.TENANT_DB_HOST_NAME, dialect, logging: false }
);

const remarkHtml = (typeName, cart) =>
  `<p>${typeName ? `${typeName}<br>` : ""}Inv No.: ${cart.cart_number}<br>Inv Date : ${cart.cart_date || ""}<br>Contact Name : ${cart.to_customer_name}</p>`;

(async () => {
  let tenantDB;
  try {
    console.log(`Auto account transactions - ${APPLY ? "APPLY" : "DRY RUN (nothing will be written)"}`);
    const [[tenant]] = DB_NAME
      ? [[{
          db_name: DB_NAME,
          db_user: process.env.TENANT_DB_USER_NAME,
          db_password: process.env.TENANT_DB_PASSWORD,
          db_host: process.env.TENANT_DB_HOST_NAME,
        }]]
      : await master.query(
          "SELECT db_name, db_user, db_password, db_host FROM tenant_masters WHERE company_masters_id = :c AND isDelete = 0 LIMIT 1",
          { replacements: { c: COMPANY } }
        );
    if (!tenant) throw new Error(`No tenant DB for company ${COMPANY}`);
    tenantDB = new SequelizePkg(tenant.db_name, tenant.db_user, tenant.db_password, {
      host: tenant.db_host,
      dialect,
      logging: false,
      dialectOptions: { dateStrings: true },
    });
    console.log(`${CONTACT ? `Customer #${CONTACT}` : "All customers"} | DB: ${tenant.db_name}\n`);

    const [carts] = await tenantDB.query(
      `SELECT c.id, c.type, c.to_customer_id, c.to_customer_name, c.cart_number, c.cart_date,
              c.created_date_time, c.grand_total, c.advance_payment, c.payment_type,
              c.approve_a_application_login_id AS cart_approver,
              EXISTS (SELECT 1 FROM account_transactions t WHERE t.company_masters_id = c.company_masters_id
                      AND t.isDelete = 0 AND t.reference_table = 'carts' AND t.reference_id = c.id
                      AND t.amount_type = 0) AS has_invoice_entry,
              EXISTS (SELECT 1 FROM account_transactions t WHERE t.company_masters_id = c.company_masters_id
                      AND t.isDelete = 0 AND t.reference_table = 'carts' AND t.reference_id = c.id
                      AND t.amount_type = 1) AS has_advance_entry
       FROM carts c
       WHERE c.company_masters_id = :company AND c.isDelete = 0
         AND c.approve_a_application_login_id <> 0
         AND c.to_customer_id <> 0
         AND c.cart_number <> ''
         AND c.type IN (:types)
         AND (:contact IS NULL OR c.to_customer_id = :contact)
         AND (:from IS NULL OR c.cart_date >= :from) AND (:to IS NULL OR c.cart_date <= :to)
       ORDER BY c.update_Date_time ASC, c.id`,
      { replacements: { company: COMPANY, contact: CONTACT, types: INVOICE_TYPES, from: FROM, to: TO } }
    );

    const plan = [];
    for (const c of carts) {
      const type = invoiceTxType(Number(c.type));
      const grand = Number(c.grand_total) || 0;
      const adv = Number(c.advance_payment) || 0;
      const base = { cart: c, mode: c.payment_type ? c.payment_type : -1 };
      if (!Number(c.has_invoice_entry) && grand !== 0) {
        plan.push({ ...base, kind: "INVOICE", type, amount: grand, amount_type: 0, approver: c.cart_approver, remark: remarkHtml("", c) });
      }
      if (!Number(c.has_advance_entry) && adv > 0) {
        plan.push({ ...base, kind: "ADVANCE", type: type === 2 ? 1 : 2, amount: adv, amount_type: 1, approver: 0, remark: remarkHtml("Advance Payment", c) });
      }
    }
    for (const p of plan) {
      console.log(`[${p.kind}] cart #${p.cart.id} ${String(p.cart.cart_number || "").trim() || "(no number)"} cust#${p.cart.to_customer_id} type=${p.type} amount=${p.amount}`);
    }
    const count = (k) => plan.filter((p) => p.kind === k);
    const sum = (a) => a.reduce((s, p) => s + p.amount, 0).toFixed(2);
    console.log(
      `\n${carts.length} approved cart(s) | invoice entries ${count("INVOICE").length} (${sum(count("INVOICE"))}) | advance entries ${count("ADVANCE").length} (${sum(count("ADVANCE"))})`
    );

    if (!APPLY) return console.log("Dry run only. Re-run with --apply to create the entries.");
    if (!plan.length) return console.log("Nothing to apply.");

    const t = await tenantDB.transaction();
    try {
      for (const p of plan) {
        await tenantDB.query(
          `INSERT INTO account_transactions
             (contact_masters_id, a_application_login_id, company_masters_id, type, mode, amount, amount_type,
              payment_date_time, remark, approve_by_a_application_login_id, approve_date_time,
              reference_table, reference_id, miracle_account_ledger, isDelete, isActive,
              created_date_time, modified_date)
           VALUES (:contact, :login, :company, :type, :mode, :amount, :amount_type,
              :when, :remark, :approver, :when,
              'carts', :cart, '', 0, 1, :when, NOW())`,
          {
            transaction: t,
            replacements: {
              contact: p.cart.to_customer_id,
              login: LOGIN,
              company: COMPANY,
              type: p.type,
              mode: p.mode,
              amount: p.amount,
              amount_type: p.amount_type,
              when: p.cart.created_date_time,
              remark: p.remark,
              approver: p.approver,
              cart: p.cart.id,
            },
          }
        );
      }
      await t.commit();
      console.log(`Created ${plan.length} entr${plan.length === 1 ? "y" : "ies"}.`);
    } catch (e) {
      await t.rollback();
      throw e;
    }
  } catch (err) {
    console.error("Fatal error:", err.message || err);
    process.exitCode = 1;
  } finally {
    await tenantDB?.close?.();
    await master.close?.();
  }
})();
