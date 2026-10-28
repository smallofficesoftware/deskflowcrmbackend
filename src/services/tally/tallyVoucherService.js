import { Op } from "sequelize";
import { accountTransactionsModel } from "../../models/activities/accountTransactionsModel.js";
import { cartItemModel } from "../../models/activities/cartItemsModel.js";
import { cartModel } from "../../models/activities/cartsModel.js";
import { contactModel } from "../../models/activities/contactModel.js";
import { paymentTypeModel } from "../../models/activities/paymentTypeModel.js";
import companyModel from "../../models/company_setup/companyModel.js";
import { marketplaceAddonRecordMappingsModel } from "../../models/marketplace/marketplaceAddonRecordMappingsModel.js";
import { marketplaceAddonSettingsModel } from "../../models/marketplace/marketplaceAddonSettingsModel.js";
import { marketplaceAddonSyncJobsModel } from "../../models/marketplace/marketplaceAddonSyncJobsModel.js";
import { taxModel } from "../../models/product_settings/taxModel.js";
import { resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";
import { resolveCompanyId } from "./tallyAuthHelper.js";
import { defaultGstLedgerName } from "./tallyGstLedgerMappingService.js";
import { buildReceiptPayload, buildSalesInvoicePayload, LEDGER_ROLES, resolveLedgerNames } from "./tallyVoucherBuilder.js";

const ADDON_CODE = "tally";

// What the Tally screen can send. `entity` is also the entity_type on the job and on the
// record-mapping row that remembers "this document is in Tally" (external_id = its REMOTEID).
const ENTITIES = ["invoice", "receipt"];
const MAX_PER_REQUEST = 200;
// Same staleness rule as tallySyncService: a job the connector never finished must not block a retry forever.
const STALE_AFTER_MS = 5 * 60 * 1000;

const text = (v) => (typeof v === "string" ? v.trim() : "");
const nameOfContact = (c) => text(c?.company_name) || text(c?.person_name);

/** The company's Tally settings: ledger names and auto-sync switches live in config_json. */
export const loadTallyConfig = async (tenantDB, company_masters_id) => {
  const row = await marketplaceAddonSettingsModel(tenantDB).findOne({
    where: { company_masters_id, addon_code: ADDON_CODE, isDelete: 0 },
    raw: true,
  });
  let cfg = row?.config_json;
  if (typeof cfg === "string") {
    try {
      cfg = JSON.parse(cfg);
    } catch {
      cfg = {};
    }
  }
  return cfg && typeof cfg === "object" ? cfg : {};
};

const mappingMap = async (tenantDB, company_masters_id, entity_type, crmIds, key = (m) => m.crm_id) => {
  const where = { company_masters_id, addon_code: ADDON_CODE, entity_type, isDelete: 0 };
  if (crmIds) where.crm_id = { [Op.in]: crmIds };
  const rows = await marketplaceAddonRecordMappingsModel(tenantDB).findAll({ where, raw: true });
  return new Map(rows.map((m) => [key(m), m]));
};

const mappedName = (m) => text(m?.external_ref) || text(m?.external_id) || "";

/** Loads everything one sales invoice needs and builds its voucher payload. */
const buildInvoice = async ({ tenantDB, company_masters_id, config, cartId, shared }) => {
  const cart = await cartModel(tenantDB).findOne({ where: { id: cartId, type: 3, isDelete: 0 }, raw: true });
  if (!cart) return { problems: ["Invoice not found."] };
  const items = await cartItemModel(tenantDB).findAll({ where: { cart_id: cartId, isDelete: 0 }, raw: true });
  const contact = cart.to_customer_id
    ? await contactModel(tenantDB).findOne({
        where: { id: cart.to_customer_id, isDelete: 0 },
        attributes: ["id", "person_name", "company_name", "state", "gst_number"],
        raw: true,
      })
    : null;

  const contactMapping = contact ? (await mappingMap(tenantDB, company_masters_id, "contact", [contact.id])).get(contact.id) : null;
  const partyName = mappedName(contactMapping) || nameOfContact(contact) || text(cart.to_customer_company_name) || text(cart.to_customer_name);

  const productMappings = await mappingMap(tenantDB, company_masters_id, "product", [...new Set(items.map((i) => i.item_product_id))]);
  const stockItemName = (item) => mappedName(productMappings.get(item.item_product_id)) || text(item.item_product_name);

  // tax_masters/gst_ledger lookups are per company, not per invoice - load once per batch.
  if (!shared.taxIdByRate) {
    const taxes = await taxModel(tenantDB).findAll({ where: { isDelete: 0 }, attributes: ["id", "value"], order: [["id", "ASC"]], raw: true });
    shared.taxIdByRate = new Map();
    for (const t of taxes) if (!shared.taxIdByRate.has(Number(t.value))) shared.taxIdByRate.set(Number(t.value), t.id);
    shared.gstMappings = await mappingMap(tenantDB, company_masters_id, "gst_ledger", null, (m) => `${m.crm_id}:${m.crm_ref}`);
    shared.company = await companyModel.findOne({ where: { isDelete: 0, id: company_masters_id }, raw: true, attributes: ["gst_number", "state_id"] });
  }
  const gstLedgerName = (rate, slot) => {
    const taxId = shared.taxIdByRate.get(Number(rate));
    const mapped = taxId ? mappedName(shared.gstMappings.get(`${taxId}:output_${slot}`)) : "";
    return mapped || defaultGstLedgerName(`output_${slot}`, Number(rate));
  };

  // Same-state test as Miracle's syncInvoice: compare the two state ids, assume same when unknown.
  const companyState = shared.company?.state_id ? String(shared.company.state_id) : "";
  const contactState = contact?.state ? String(contact.state) : "";
  const isSameState = companyState && contactState ? companyState === contactState : true;

  const built = buildSalesInvoicePayload({
    companyId: company_masters_id,
    cart,
    items,
    partyName,
    ledgers: resolveLedgerNames(config.ledgers),
    isSameState,
    stockItemName,
    gstLedgerName,
  });
  if (built.payload) built.payload.crm = { contactId: contact?.id ?? null };
  return built;
};

/** Loads a customer receipt and builds its voucher payload. */
const buildReceipt = async ({ tenantDB, company_masters_id, txId, shared }) => {
  const tx = await accountTransactionsModel(tenantDB).findOne({ where: { id: txId, type: 1, isDelete: 0 }, raw: true });
  if (!tx) return { problems: ["Receipt not found."] };
  if (!(Number(tx.mode) > 0)) return { problems: ["This entry has no payment mode, so it is not a receipt."] };

  const contact = tx.contact_masters_id
    ? await contactModel(tenantDB).findOne({ where: { id: tx.contact_masters_id, isDelete: 0 }, attributes: ["id", "person_name", "company_name"], raw: true })
    : null;
  const contactMapping = contact ? (await mappingMap(tenantDB, company_masters_id, "contact", [contact.id])).get(contact.id) : null;

  if (!shared.paymentTypes) {
    const types = await paymentTypeModel(tenantDB).findAll({ where: { isDelete: 0 }, attributes: ["id", "payment_type_name"], raw: true });
    shared.paymentTypes = new Map(types.map((t) => [Number(t.id), text(t.payment_type_name)]));
    shared.paymentModeMappings = await mappingMap(tenantDB, company_masters_id, "payment_mode");
  }
  const modeName = shared.paymentTypes.get(Number(tx.mode)) || "";
  const isCash = /cash/i.test(modeName);
  const paymentLedger = mappedName(shared.paymentModeMappings.get(Number(tx.mode))) || (isCash ? "Cash" : modeName);

  const built = buildReceiptPayload({
    companyId: company_masters_id,
    tx,
    partyName: mappedName(contactMapping) || nameOfContact(contact),
    paymentLedger,
    paymentLedgerParent: isCash ? LEDGER_ROLES.cash.parent : LEDGER_ROLES.bank.parent,
  });
  if (built.payload) built.payload.crm = { contactId: contact?.id ?? null };
  return built;
};

/**
 * Builds and queues one push_voucher job per document. A document that cannot be built (missing
 * name, unbalanced total...) is returned as `blocked` with the reasons and nothing is queued.
 * Re-sending an already-sent document is fine: the same REMOTEID makes Tally update it.
 */
export const queueTallyVouchers = async ({ tenantDB, company_masters_id, entity, ids }) => {
  const config = await loadTallyConfig(tenantDB, company_masters_id);
  const jobs = marketplaceAddonSyncJobsModel(tenantDB);
  const shared = {};
  const results = [];

  for (const id of ids) {
    try {
      const pending = await jobs.findOne({
        where: {
          company_masters_id,
          addon_code: ADDON_CODE,
          job_type: "push_voucher",
          entity_type: entity,
          entity_id: id,
          status: { [Op.in]: ["queued", "running"] },
          created_date_time: { [Op.gt]: new Date(Date.now() - STALE_AFTER_MS) },
        },
        attributes: ["id"],
        raw: true,
      });
      if (pending) {
        results.push({ id, status: "already_queued", job_id: pending.id });
        continue;
      }

      const built =
        entity === "invoice"
          ? await buildInvoice({ tenantDB, company_masters_id, config, cartId: id, shared })
          : await buildReceipt({ tenantDB, company_masters_id, txId: id, shared });
      if (!built.payload) {
        results.push({ id, status: "blocked", problems: built.problems || ["Could not build the voucher."] });
        continue;
      }

      // payload_json is a Sequelize JSON column: pass the object itself, never JSON.stringify it
      // (double-encodes - see the 27-10-2026 note in the plan).
      const job = await jobs.create({
        company_masters_id,
        addon_code: ADDON_CODE,
        job_type: "push_voucher",
        entity_type: entity,
        entity_id: id,
        direction: "push",
        status: "queued",
        payload_json: built.payload,
      });
      results.push({ id, status: "queued", job_id: job.id });
    } catch (error) {
      results.push({ id, status: "blocked", problems: [`Unexpected error: ${error?.message || error}`] });
    }
  }
  return results;
};

/** POST /tally/sync/send  { entity: "invoice"|"receipt", ids: number[] } */
export const sendToTally = async (req) => {
  try {
    const company_masters_id = resolveCompanyId(req);
    if (!req.tenantDB || !company_masters_id) {
      return resBadRequest({ developer_msg: "Tenant DB or company context missing" });
    }
    const { entity } = req.body || {};
    const ids = [...new Set((Array.isArray(req.body?.ids) ? req.body.ids : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
    if (!ENTITIES.includes(entity)) return resBadRequest({ developer_msg: `entity must be one of ${ENTITIES.join(", ")}` });
    if (!ids.length) return resBadRequest({ developer_msg: "ids is required" });
    if (ids.length > MAX_PER_REQUEST) return resBadRequest({ developer_msg: `Send at most ${MAX_PER_REQUEST} documents at a time` });

    const results = await queueTallyVouchers({ tenantDB: req.tenantDB, company_masters_id, entity, ids });
    return resSuccess({ data: { items: results } });
  } catch (error) {
    return resError({ developer_msg: `sendToTally failed: ${error}` });
  }
};

/**
 * POST /tally/sync/documents  { entity, from?, to?, status?, search?, offset?, limit? }
 * Documents with where they stand: unsent | queued | sent | changed (edited after it was sent) | failed.
 */
export const listTallyDocuments = async (req) => {
  try {
    const company_masters_id = resolveCompanyId(req);
    if (!req.tenantDB || !company_masters_id) {
      return resBadRequest({ developer_msg: "Tenant DB or company context missing" });
    }
    const { entity, from, to } = req.body || {};
    if (!ENTITIES.includes(entity)) return resBadRequest({ developer_msg: `entity must be one of ${ENTITIES.join(", ")}` });
    const limit = Math.min(Math.max(Number(req.body?.limit) || 50, 1), 200);
    const offset = Math.max(Number(req.body?.offset) || 0, 0);
    const wantStatus = text(req.body?.status);
    const tenantDB = req.tenantDB;

    // Rows first (date-filtered, newest first), statuses attached after. A status filter is applied
    // to the page we loaded, so the pager says how many came back rather than a global total.
    let rows;
    if (entity === "invoice") {
      const where = { type: 3, isDelete: 0 };
      if (from || to) where.cart_date = { ...(from ? { [Op.gte]: from } : {}), ...(to ? { [Op.lte]: to } : {}) };
      rows = (await cartModel(tenantDB).findAll({
        where,
        attributes: ["id", "cart_number", "cart_date", "to_customer_name", "to_customer_company_name", "grand_total", "update_Date_time"],
        order: [["id", "DESC"]],
        limit,
        offset,
        raw: true,
      })).map((c) => ({
        id: c.id,
        number: c.cart_number,
        date: c.cart_date,
        party: text(c.to_customer_company_name) || text(c.to_customer_name),
        amount: c.grand_total,
        changed_at: c.update_Date_time,
      }));
    } else {
      const where = { type: 1, isDelete: 0, mode: { [Op.gt]: 0 } };
      if (from || to) where.payment_date_time = { ...(from ? { [Op.gte]: `${from} 00:00:00` } : {}), ...(to ? { [Op.lte]: `${to} 23:59:59` } : {}) };
      const txs = await accountTransactionsModel(tenantDB).findAll({
        where,
        attributes: ["id", "voucher_number", "payment_date_time", "contact_masters_id", "amount"],
        order: [["id", "DESC"]],
        limit,
        offset,
        raw: true,
      });
      const contactIds = [...new Set(txs.map((t) => t.contact_masters_id).filter(Boolean))];
      const contacts = contactIds.length
        ? await contactModel(tenantDB).findAll({ where: { id: { [Op.in]: contactIds } }, attributes: ["id", "person_name", "company_name"], raw: true })
        : [];
      const nameById = new Map(contacts.map((c) => [c.id, nameOfContact(c)]));
      rows = txs.map((t) => ({ id: t.id, number: t.voucher_number, date: t.payment_date_time, party: nameById.get(t.contact_masters_id) || "", amount: t.amount, changed_at: null }));
    }

    const ids = rows.map((r) => r.id);
    const sent = ids.length ? await mappingMap(tenantDB, company_masters_id, entity, ids) : new Map();
    const latestJob = new Map();
    if (ids.length) {
      const jobRows = await marketplaceAddonSyncJobsModel(tenantDB).findAll({
        where: { company_masters_id, addon_code: ADDON_CODE, job_type: "push_voucher", entity_type: entity, entity_id: { [Op.in]: ids } },
        attributes: ["id", "entity_id", "status", "error_message", "created_date_time"],
        order: [["id", "DESC"]],
        raw: true,
      });
      for (const j of jobRows) if (!latestJob.has(j.entity_id)) latestJob.set(j.entity_id, j);
    }

    const items = rows
      .map((r) => {
        const m = sent.get(r.id);
        const j = latestJob.get(r.id);
        const sentAt = m?.config_json?.sent_at ? new Date(m.config_json.sent_at) : null;
        let status = "unsent";
        let error = null;
        if (j && ["queued", "running"].includes(j.status)) status = "queued";
        else if (j?.status === "failed" && (!sentAt || new Date(j.created_date_time) > sentAt)) {
          status = "failed";
          error = j.error_message || "The connector could not send this document.";
        } else if (m?.external_id) {
          status = sentAt && r.changed_at && new Date(r.changed_at) > sentAt ? "changed" : "sent";
        }
        return { ...r, status, error, sent_at: sentAt, tally_voucher_number: m?.external_ref || null };
      })
      .filter((r) => !wantStatus || wantStatus === "all" || r.status === wantStatus);

    return resSuccess({ data: { items, page_size: limit, offset } });
  } catch (error) {
    return resError({ developer_msg: `listTallyDocuments failed: ${error}` });
  }
};

/**
 * Called when the connector reports a push_voucher job: on success remember that the document is
 * in Tally (so the screen shows "sent" and a re-send updates it), and keep the customer's ledger
 * name the voucher used as a contact mapping so the mapping tab reflects what Tally now holds.
 */
export const recordVoucherResult = async (tenantDB, job) => {
  if (job.job_type !== "push_voucher" || job.status !== "done" || !job.entity_type || !job.entity_id) return;
  let payload = job.payload_json;
  for (let i = 0; i < 2 && typeof payload === "string"; i++) payload = JSON.parse(payload);
  let result = job.result_json;
  for (let i = 0; i < 2 && typeof result === "string"; i++) result = JSON.parse(result);

  const mappings = marketplaceAddonRecordMappingsModel(tenantDB);
  const company_masters_id = job.company_masters_id;
  const upsert = async (where, fields) => {
    const existing = await mappings.findOne({ where: { ...where, company_masters_id, addon_code: ADDON_CODE, isDelete: 0 } });
    const row = { ...where, company_masters_id, addon_code: ADDON_CODE, modified_date: new Date(), ...fields };
    return existing ? existing.update(row) : mappings.create(row);
  };

  await upsert(
    { entity_type: job.entity_type, crm_id: job.entity_id },
    {
      external_id: payload?.remoteId || result?.remoteId || null,
      external_ref: payload?.voucherNumber || result?.voucherNumber || null,
      match_confidence: "sent",
      is_confirmed: 1,
      direction: "push",
      config_json: { sent_at: new Date().toISOString(), last_action: result?.altered ? "updated" : "created" },
    }
  );

  const contactId = payload?.crm?.contactId;
  if (contactId && payload?.partyLedgerName) {
    const has = await mappings.findOne({ where: { company_masters_id, addon_code: ADDON_CODE, entity_type: "contact", crm_id: contactId, isDelete: 0 } });
    if (!has?.external_ref && !has?.external_id) {
      await upsert(
        { entity_type: "contact", crm_id: contactId },
        { external_ref: payload.partyLedgerName, match_confidence: "auto_created", is_confirmed: 0, direction: "both" }
      );
    }
  }
};
