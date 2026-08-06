export const REQUEST_FLAG = {
  Login: 1,
  Register: 2,
};

export const PAGE_ID = {
  CONTACT: "1",
  INQUIRY: "2",
  INSIGHT: "3",
  REMINDER: "4",
  PERSONAL_NOTE: "5",
  CATEGORY: "6",
  PRODUCT: "7",
  PRICE_LIST: "8",
  PRICE_LIST_ITEM: "9",
  SOURCE: "10",
  LABEL: "11",
  STATUS: "12",
  CONTACT_MESSAGE_HISTORY: "13",
  QUOTATION: "14",
  ORDER: "15",
  INVOICE: "16",
  EMAIL: "17",
  ACCOUNT_HISTORY: "18",
  PURCHASE: "87",
  LOCATION_SERVICE: "20",
  RECORDING_SERVICE: "21",
  CALL_HISTORY: "22",
  ATTENDANCE: "23",
  EXPENSE_TYPE: "24",
  EXPENSES: "25",
  TARGET_VS_INCENTIVE: "26",
  VISIT_TYPE: "27",
  VISIT: "28",
  CUSTOM_FORM_FIELD: "29",
  DEPARTMENT: "31",
  AI_ASSISTANT: "32",
  VOICE_CONTROL: "33",
  TEAM_MEMBER_ACESSES: "34",
  COUNTRIE: "45",
  STATES: "46",
  CITIES: "47",
  AREAS: "48",
  PURCHASE_ORDER: "49",
  TASK_CATEGORY: "50",
  TASK_MANAGEMENT: "51",
  TEAMPERFORMANCE_REPORT: "52",
  QUOTATION_REPORT: "53",
  SALESORDER_REPORT: "54",
  SALESINVOICE_REPORT: "55",
  PURCHASEORDER_REPORT: "56",
  PURCHASEINVOICE_REPORT: "57",
  ACCOUNTOUTSTANDING_REPORT: "58",
  PENDINGWORK_REPORT: "59",
  PRODUCTINVENTORY_REPORT: "60",
  ATTEDANCESALARY_REPORT: "61",
  PRODUCTMOVEMENT_REPORT: "62",
  PRODUCTPENDING_REPORT: "63",
  CATEGORYMOVEMENT_REPORT: "64",
  CATEGORYPENDING_REPORT: "65",
  ALLCONTACT_REPORT: "66",
  SOURCE_REPORT: "67",
  LABEL_REPORT: "68",
  ALLINQUIRY_REPORT: "69",
  TEAMEXPENSE_REPORT: "70",
  ALLVISIT_REPORT: "71",
  ALLCALL_REPORT: "72",
  PENDINGSALESORDER_REPORT: "73",
  PENDINGPURCHASEORDER_REPORT: "74",
  ALLTASK_REPORT: "75",
  TASK_MESSAGE_HISTORY: "76",
  RETURN_SALES_INVOICE: "80",
  RETURN_PURCHASE_INVOICE: "81",

  // 82 TO 87 MISSING

  RETURN_SALES_INVOICE_REPORT: "88",
  RETURN_PURCHASE_INVOICE_REPORT: "89",
  //90 and 91 MISSING
  INWARD: "92",
  DISPATCH: "93",
  SUPPORT_TICKET: "93",

  INWARD_REPORT: "97",
  DISPATCH_REPORT: "98",
  BILL_OF_MATERIALS: "110",
  EMP_ACCOUNT_HISTORY: "112",
  STATUS_REPORT: "115",
  PROFOMA_INVOICE: "120",
  PROFORMA_INVOICE_REPORT: "121",
  LOCK_CONTROL: "122",
  ROUND_OFF: "123",
  ADJUSTMENT_TYPE: "124",
  DAY_ADJUSTMENT: "125",
  EMP_ACCOUNTOUTSTANDING_REPORT: "126",
  EXPENSE_DETAILED_REPORT: "127",
  JOB_CARD: "128",
  PRODUCTION: "129",
  TARGET_VS_INCENTIVE_REPORT: "130",
  CUSTOMER_SALES_PURCHASE_REPORT: "131",
  ROUTE_PLANNER: "144",
  // Add more pages as needed
};
// config/googleApi.ts
export const GOOGLE_API = {
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI: "http://localhost:3000",
};


export const WORKFLOW_AUTOMATIONS_TYPES = {
  "google_lead_sheet_for_faceBook_1": "1",
  "google_lead_sheet_for_faceBook_2": "2",
  "google_sheet_key_3": "3",
  "google_sheet_key_4": "4"
};

export const GOOGLE_SHEET_DECLARED_COLUMN_LIST = {
  'person_name': ['person_name', { IS_REQUIRED: 1 }],
  'company_name': ['company_name'],
  'Email': ['Email'],
  'mobile_number': ['mobile_number', { IS_REQUIRED: 1 }],
  'Country': ['Country'],
  'State': ['State'],
  'City': ['City'],
  'Area': ['Area'],
  'Pincode': ['Pincode'],
  'Address': ['Address'],
  'shipping_address': ['shipping_address'],
  'gst_number': ['gst_number'],
  'client_code': ['client_code'],
  'price_list': ['price_list'],
  'source_type': ['source_type'],
  'lable': ['lable'],
  'longitude': ['longitude'],
  'latitude': ['latitude'],
  'category_name': ['category_name'],
  'product_name': ['product_name'],
  'required_quantity': ['required_quantity'],
  'requirement_type': ['requirement_type'],
  'Description': ['Description'],
  'DateTime': ['DateTime'],
  'referance_contact': ['referance_contact'],
  'cntc_column_number_1': ['cntc_column_number_1', { IS_CUSTOM_COLUMN: 1 }],
  'cntc_column_number_2': ['cntc_column_number_2', { IS_CUSTOM_COLUMN: 1 }],
  'cntc_column_number_3': ['cntc_column_number_3', { IS_CUSTOM_COLUMN: 1 }],
  'cntc_column_number_4': ['cntc_column_number_4', { IS_CUSTOM_COLUMN: 1 }],
  'cntc_column_number_5': ['cntc_column_number_5', { IS_CUSTOM_COLUMN: 1 }],
  'cntc_column_text_1': ['cntc_column_text_1', { IS_CUSTOM_COLUMN: 1 }],
  'cntc_column_text_2': ['cntc_column_text_2', { IS_CUSTOM_COLUMN: 1 }],
  'cntc_column_text_3': ['cntc_column_text_3', { IS_CUSTOM_COLUMN: 1 }],
  'cntc_column_text_4': ['cntc_column_text_4', { IS_CUSTOM_COLUMN: 1 }],
  'cntc_column_text_5': ['cntc_column_text_5', { IS_CUSTOM_COLUMN: 1 }],
  'cntc_column_text_area_1': ['cntc_column_text_area_1', { IS_CUSTOM_COLUMN: 1 }],
  'cntc_column_text_area_2': ['cntc_column_text_area_2', { IS_CUSTOM_COLUMN: 1 }],
  'cntc_column_text_area_3': ['cntc_column_text_area_3', { IS_CUSTOM_COLUMN: 1 }],
  'cntc_column_text_area_4': ['cntc_column_text_area_4', { IS_CUSTOM_COLUMN: 1 }],
  'cntc_column_text_area_5': ['cntc_column_text_area_5', { IS_CUSTOM_COLUMN: 1 }],
  'cntc_column_date_1': ['cntc_column_date_1', { IS_CUSTOM_COLUMN: 1 }],
  'cntc_column_date_2': ['cntc_column_date_2', { IS_CUSTOM_COLUMN: 1 }],
  'cntc_column_date_3': ['cntc_column_date_3', { IS_CUSTOM_COLUMN: 1 }],
  'cntc_column_date_4': ['cntc_column_date_4', { IS_CUSTOM_COLUMN: 1 }],
  'cntc_column_date_5': ['cntc_column_date_5', { IS_CUSTOM_COLUMN: 1 }],
  'cntc_column_date_and_time_1': ['cntc_column_date_and_time_1', { IS_CUSTOM_COLUMN: 1 }],
  'cntc_column_date_and_time_2': ['cntc_column_date_and_time_2', { IS_CUSTOM_COLUMN: 1 }],
  'cntc_column_date_and_time_3': ['cntc_column_date_and_time_3', { IS_CUSTOM_COLUMN: 1 }],
  'cntc_column_date_and_time_4': ['cntc_column_date_and_time_4', { IS_CUSTOM_COLUMN: 1 }],
  'cntc_column_date_and_time_5': ['cntc_column_date_and_time_5', { IS_CUSTOM_COLUMN: 1 }],
  'cntc_column_time_1': ['cntc_column_time_1', { IS_CUSTOM_COLUMN: 1 }],
  'cntc_column_time_2': ['cntc_column_time_2', { IS_CUSTOM_COLUMN: 1 }],
  'cntc_column_time_3': ['cntc_column_time_3', { IS_CUSTOM_COLUMN: 1 }],
  'cntc_column_time_4': ['cntc_column_time_4', { IS_CUSTOM_COLUMN: 1 }],
  'cntc_column_time_5': ['cntc_column_time_5', { IS_CUSTOM_COLUMN: 1 }],
  'cntc_column_switch_1': ['cntc_column_switch_1', { IS_CUSTOM_COLUMN: 1 }],
  'cntc_column_switch_2': ['cntc_column_switch_2', { IS_CUSTOM_COLUMN: 1 }],
  'cntc_column_switch_3': ['cntc_column_switch_3', { IS_CUSTOM_COLUMN: 1 }],
  'cntc_column_switch_4': ['cntc_column_switch_4', { IS_CUSTOM_COLUMN: 1 }],
  'cntc_column_switch_5': ['cntc_column_switch_5', { IS_CUSTOM_COLUMN: 1 }],
  'cntc_column_decimal_1': ['cntc_column_decimal_1', { IS_CUSTOM_COLUMN: 1 }],
  'cntc_column_decimal_2': ['cntc_column_decimal_2', { IS_CUSTOM_COLUMN: 1 }],
  'cntc_column_decimal_3': ['cntc_column_decimal_3', { IS_CUSTOM_COLUMN: 1 }],
  'cntc_column_dropdown_4': ['cntc_column_dropdown_4', { IS_CUSTOM_COLUMN: 1 }],
  'cntc_column_dropdown_5': ['cntc_column_dropdown_5', { IS_CUSTOM_COLUMN: 1 }],
  'cntc_column_radio_1': ['cntc_column_radio_1', { IS_CUSTOM_COLUMN: 1 }],
  'cntc_column_radio_2': ['cntc_column_radio_2', { IS_CUSTOM_COLUMN: 1 }],
  'cntc_column_radio_3': ['cntc_column_radio_3', { IS_CUSTOM_COLUMN: 1 }],
  'cntc_column_radio_4': ['cntc_column_radio_4', { IS_CUSTOM_COLUMN: 1 }],
  'cntc_column_radio_5': ['cntc_column_radio_5', { IS_CUSTOM_COLUMN: 1 }],
};

// Do Not Remove This code
Object.freeze(GOOGLE_SHEET_DECLARED_COLUMN_LIST);
// Do Not Remove This code
//     const orderTypesList = [
//   { id: "1", type: "quotation" },
//   { id: "2", type: "order" },
//   { id: "3", type: "invoice" },
//   { id: "4", type: "purchase_order" },
//   { id: "5", type: "order_purchase" },
//   { id: "6", type: "return_sales_invoice" },
//   { id: "7", type: "return_purchase_invoice" },
//   { id: "8", type: "inward" },
//   { id: "9", type: "dispatch" },
// ];

// 1 -> OUT
// 2 -> IN
export const STOCK_IN_OUT_ACCESSIBILITY = {
  1: 0, //quotation
  2: 0, //order
  3: 1,  //invoice
  4: 2, //purchase_order
  5: 0, //order_purchase
  6: 2, //return_sales_invoice
  7: 1, //return_purchase_invoice
  8: 2, //inward
  9: 1, //dispatch
  10: 2, //Stock Inward
  11: 1, //Stock Outward
  12: 0, //Performa
}

// Do Not Remove This code
Object.freeze(STOCK_IN_OUT_ACCESSIBILITY);

// is_email_verified_isOtpVerified
export const REGISTRATION_FLAG_UPDATE_RULE = {
  '1_1': 0,
  '0_1': 2,
  '1_0': 1
};

// Do Not Remove This code
Object.freeze(REGISTRATION_FLAG_UPDATE_RULE);

const FYEAR_RULE = { A: "SHORT", a: "FULL" };

// Do Not Remove This code
Object.freeze(FYEAR_RULE);

export const NUMBER_SERIES_PATTERN_RULE = {
  1: "PREFIX",
  2: "SR_NO",
  3: FYEAR_RULE,
  4: "SUFFIX"
}
// Do Not Remove This code
Object.freeze(NUMBER_SERIES_PATTERN_RULE);

export const SALES_DEFINED_IDS_FOR_STATUS = {
  2: {
    '1': -8, //pending_for_dispatch
    '2': -9, //partially_dispatch
    '3': -10, //full_dispatched
  },
  5: {
    '1': -11, //pending_for_grn
    '2': -12, //partially_grn
    '3': -13, //full_grn
  }
};

// Do Not Remove This code
Object.freeze(SALES_DEFINED_IDS_FOR_STATUS);

export const DEFINED_CONFIGURED_TYPE = [1, 2];

export const PROCESS_TYPE = {
  ATTENDANCE: "attendance",
  SALARY: "salary",
};

Object.freeze(PROCESS_TYPE);
