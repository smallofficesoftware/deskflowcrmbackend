import {
  DATE,
  DATEONLY,
  DOUBLE,
  INTEGER,
  NOW,
  STRING,
  TEXT,
  TIME,
  TINYINT,
} from "sequelize";

export const contactModel = (sequelize) => {
  return sequelize.define("contact_masters", {
    id: {
      type: INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    person_name: {
      type: STRING,
    },
    company_name: {
      type: STRING,
    },
    client_code: {
      type: STRING,
    },
    mobile_number: {
      type: STRING,
    },
    raw_mobile_number: {
      type: STRING,
    },
    email_id: {
      type: STRING,
    },
    lable: {
      type: STRING,
    },
    contact_status: {
      type: INTEGER,
      defaultValue: "-1",
    },
    // Kanban drag-order within a contact_status column; NULL sorts last (never dragged yet).
    position: {
      type: INTEGER,
      allowNull: true,
    },
    country: {
      type: STRING,
    },
    state: {
      type: STRING,
    },
    // district: {
    //   type: STRING,
    // },
    city: {
      type: STRING,
    },
    area: {
      type: STRING,
    },
    pincode: {
      type: STRING,
    },
    address: {
      type: TEXT,
    },
    shipping_address: {
      type: TEXT,
    },
    gst_number: {
      type: STRING,
    },
    gst_reg_type: {
      type: STRING,
    },
    gst_reg_date: {
      type: DATEONLY,
    },
    status: {
      type: INTEGER,
    },
    referance_contact: {
      type: INTEGER,
    },
    company_masters_id: {
      type: INTEGER,
    },
    pinned_message: {
      type: INTEGER,
    },
    a_application_login_id: {
      type: INTEGER,
    },
    assinged_to_price_list: {
      type: INTEGER,
    },
    // Ecommerce storefront invite-only allowlist flag (plans/2026-10-15-
    // ecommerce-b2b-b2c-plan.txt, P3/Q3).
    storefront_invited: {
      type: TINYINT,
    },
    // B2B credit control (plans/2026-10-15-ecommerce-b2b-b2c-plan.txt, P5) -
    // null/0 = no limit/not set. credit_limit checked against the SAME
    // closing-balance convention this file's own getContactById already
    // computes (SUM(type=2 Debit) - SUM(type=1 Credit) from
    // account_transactions) plus the new order's grand_total - see
    // storefrontCheckoutService.js's checkCreditLimit. payment_terms is
    // informational only this phase (days, e.g. 30 for "Net 30") - no
    // automated due-date enforcement/reminders.
    credit_limit: {
      type: DOUBLE,
    },
    payment_terms: {
      type: INTEGER,
    },
    // Storefront auth state (plans/2026-10-15-ecommerce-b2b-b2c-plan.txt, P3/Q3,
    // REVISED 23-10-2026) - a storefront customer IS a contact, not a separate
    // identity (see migration 20261023100000's own comment for why).
    storefront_pin_hash: {
      type: STRING,
    },
    storefront_is_verified_mobile: {
      type: TINYINT,
    },
    storefront_is_verified_email: {
      type: TINYINT,
    },
    // Non-null means "this contact has a storefront account" - used by
    // storefrontAuthService.js's invite-only gate to distinguish an existing
    // storefront customer from a CRM contact who's never used the storefront.
    storefront_signup_method: {
      type: STRING,
    },
    storefront_last_login_date: {
      type: DATE,
    },
    // Mode-switch lock (Q3(d), 23-10-2026) - comma-separated method keys
    // ('light'|'invite'|'otp_mobile'|'otp_email') this contact is denylisted
    // from, independent of the company-wide toggle. See migration
    // 20261023110000's own comment for why this only matters on re-enable.
    storefront_locked_methods: {
      type: TEXT,
    },
    assinged_to_work_a_application_id: {
      type: TEXT,
    },
    is_unread: {
      type: TINYINT,
    },
    is_read_by_a_application_login_id: {
      type: TINYINT,
    },
    is_pin: {
      type: TINYINT,
    },
    is_pin_by_a_application_login_id: {
      type: TINYINT,
    },
    isDelete: {
      type: TINYINT,
      defaultValue: "0",
    },
    isActive: {
      type: TINYINT,
      defaultValue: "1",
    },

    source_type_id: {
      type: INTEGER,
    },
    created_date_time: {
      type: DATE,
      defaultValue: NOW,
    },
    modified_date: {
      type: DATE,
      defaultValue: NOW,
    },
    column_1: {
      type: STRING,
    },
    column_2: {
      type: STRING,
    },
    column_3: {
      type: STRING,
    },
    column_4: {
      type: STRING,
    },
    column_5: {
      type: STRING,
    },
    column_6: {
      type: STRING,
    },
    cntc_column_number_1: {
      type: INTEGER,
    },
    cntc_column_number_2: {
      type: INTEGER,
    },
    cntc_column_number_3: {
      type: INTEGER,
    },
    cntc_column_number_4: {
      type: INTEGER,
    },
    cntc_column_number_5: {
      type: INTEGER,
    },
    cntc_column_text_1: {
      type: STRING,
    },
    cntc_column_text_2: {
      type: STRING,
    },
    cntc_column_text_3: {
      type: STRING,
    },
    cntc_column_text_4: {
      type: STRING,
    },
    cntc_column_text_5: {
      type: STRING,
    },
    cntc_column_text_area_1: {
      type: TEXT,
    },
    cntc_column_text_area_2: {
      type: TEXT,
    },
    cntc_column_text_area_3: {
      type: TEXT,
    },
    cntc_column_text_area_4: {
      type: TEXT,
    },
    cntc_column_text_area_5: {
      type: TEXT,
    },
    cntc_column_date_1: {
      type: DATEONLY,
    },
    cntc_column_date_2: {
      type: DATEONLY,
    },
    cntc_column_date_3: {
      type: DATEONLY,
    },
    cntc_column_date_4: {
      type: DATEONLY,
    },
    cntc_column_date_5: {
      type: DATEONLY,
    },
    cntc_column_date_and_time_1: {
      type: DATE,
    },
    cntc_column_date_and_time_2: {
      type: DATE,
    },
    cntc_column_date_and_time_3: {
      type: DATE,
    },
    cntc_column_date_and_time_4: {
      type: DATE,
    },
    cntc_column_date_and_time_5: {
      type: DATE,
    },
    cntc_column_time_1: {
      type: TIME,
    },
    cntc_column_time_2: {
      type: TIME,
    },
    cntc_column_time_3: {
      type: TIME,
    },
    cntc_column_time_4: {
      type: TIME,
    },
    cntc_column_time_5: {
      type: TIME,
    },
    cntc_column_switch_1: {
      type: TINYINT,
    },
    cntc_column_switch_2: {
      type: TINYINT,
    },
    cntc_column_switch_3: {
      type: TINYINT,
    },
    cntc_column_switch_4: {
      type: TINYINT,
    },
    cntc_column_switch_5: {
      type: TINYINT,
    },
    cntc_column_decimal_1: {
      type: DOUBLE,
    },
    cntc_column_decimal_2: {
      type: DOUBLE,
    },
    cntc_column_decimal_3: {
      type: DOUBLE,
    },
    cntc_column_decimal_4: {
      type: DOUBLE,
    },
    cntc_column_decimal_5: {
      type: DOUBLE,
    },
    cntc_column_dropdown_1: {
      type: STRING,
    },
    cntc_column_dropdown_2: {
      type: STRING,
    },
    cntc_column_dropdown_3: {
      type: STRING,
    },
    cntc_column_dropdown_4: {
      type: STRING,
    },
    cntc_column_dropdown_5: {
      type: STRING,
    },
    cntc_column_radio_1: {
      type: STRING,
    },
    cntc_column_radio_2: {
      type: STRING,
    },
    cntc_column_radio_3: {
      type: STRING,
    },
    cntc_column_radio_4: {
      type: STRING,
    },
    cntc_column_radio_5: {
      type: STRING,
    },
    address_location: {
      type: TEXT,
    },
    longitude: {
      type: STRING(255),
      allowNull: true,
      defaultValue: null,
    },
    latitude: {
      type: STRING(255),
      allowNull: true,
      defaultValue: null,
    },
    sync_whatsapp: {
      type: TINYINT,
      defaultValue: "0",
    },
    is_archive: {
      type: TINYINT,
      defaultValue: "0",
    },
    miracle_UniqueId: {
      type: TEXT,
    },
    miracle_update_date_time: {
      type: DATE,
    }
  }, {
    timestamps: true,
    createdAt: 'created_date_time',
    updatedAt: 'modified_date'
  });
};
