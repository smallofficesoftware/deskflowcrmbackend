// Report catalog served to the mobile app (POST /report-catalog), so a new report shows up in the
// app without an app release. Keep it in step with the web menu (reportsMenuData.tsx).
//
// key      = the web report's own id (the `value` in reportsMenuData.tsx)
// pageId   = a_application_pages id whose View right decides who sees the report
// icon     = a Material icon name the app knows (see report_icons.dart); unknown names get a default icon
export const REPORT_CATALOG = [
  {
    title: "CRM",
    icon: "contacts_outlined",
    entries: [
      { label: "Contact Book", key: "all_contact_report", pageId: 66, icon: "person_outline", description: "Full list of every contact saved in your CRM." },
      { label: "Inquiry", key: "all_inquiry_report", pageId: 69, icon: "help_outline", description: "Every inquiry raised by contacts, with product & status detail." },
      { label: "Quotation", key: "quotation", pageId: 53, icon: "description_outlined", description: "All quotations sent to customers in the selected period." },
      { label: "Proforma Invoice", key: "proforma_invoice_report", pageId: 121, icon: "receipt_long_outlined", description: "Proforma invoices issued ahead of final billing." },
      { label: "Orders", key: "order", pageId: 15, icon: "shopping_cart_outlined", description: "Sales orders placed by customers, order-wise." },
      { label: "Field Visits", key: "all_visit_report", pageId: 71, icon: "location_on_outlined", description: "Field visits logged by your team, with location and outcome." },
      { label: "Call History", key: "all_call_report", pageId: 72, icon: "call_outlined", description: "Call log history against every contact." },
      { label: "Customer Sales & Purchase", key: "customer_sales_purchase_report", pageId: 131, icon: "shopping_cart_outlined", description: "Sales and purchase totals per customer." },
    ],
  },
  {
    title: "HRM",
    icon: "groups_outlined",
    entries: [
      { label: "My Team", key: "My_Team_Report", pageId: 34, icon: "group_outlined", description: "Every team member and their access rights." },
      { label: "Expenses", key: "team_day_wise_expanse_report", pageId: 70, icon: "account_balance_wallet_outlined", description: "Day-wise expense breakup for each team member." },
      { label: "Leave Management", key: "LeaveManagement_Report", pageId: 105, icon: "event_busy_outlined", description: "Leave requests and approval status across the team." },
      { label: "Attendance & Salary", key: "attendance_salary", pageId: 61, icon: "schedule", description: "Attendance days mapped against monthly salary payout." },
      { label: "Attendance Register", key: "Attendance_register_Report", pageId: 117, icon: "today_outlined", description: "Daily in/out register for every employee." },
      { label: "Salary Register", key: "Salary_register_Report", pageId: 40, icon: "payments_outlined", description: "Monthly salary register with earnings and deductions." },
      { label: "Employee Day Book", key: "Emp_Transaction_Report", pageId: 112, icon: "menu_book_outlined", description: "Day-by-day transaction history per employee account." },
      { label: "Employee Account Outstanding", key: "Emp_AccountOutstanding_Report", pageId: 126, icon: "account_balance_outlined", description: "Outstanding balance owed to or by each employee." },
      { label: "Expense Detailed Report", key: "Expense_Detailed_Report", pageId: 127, icon: "list_alt", description: "Line-item detail of every expense claimed." },
      { label: "Target vs Incentive", key: "target_incentive_report", pageId: 130, icon: "payments_outlined", description: "Sales target vs achieved, with incentive payout per team member." },
    ],
  },
  {
    title: "Production",
    icon: "precision_manufacturing_outlined",
    entries: [
      { label: "Job Card", key: "Job_Card_Grid", pageId: 114, icon: "assignment_outlined", description: "Job cards issued for production runs." },
      { label: "Work Station", key: "Work_Station_Report", pageId: 44, icon: "factory_outlined", description: "Machines and work stations set up on the shop floor." },
      { label: "Process", key: "Process_Report", pageId: 44, icon: "settings_outlined", description: "Production process stages and their status." },
      { label: "Warehouse", key: "Warehouse_Report", pageId: 109, icon: "warehouse_outlined", description: "Warehouses configured for stock storage." },
      { label: "Bill Of Material", key: "BillOfMaterial_Report", pageId: 111, icon: "inventory_2_outlined", description: "BOM structures used for manufacturing products." },
      { label: "Stock Adjustment", key: "StockAdjustment_Report", pageId: 114, icon: "tune", description: "Manual stock quantity adjustments and reasons." },
      { label: "Warehouse Transfer", key: "WarehouseTransfer_Report", pageId: 114, icon: "swap_horiz", description: "Plus / minus of stock moved between warehouses, by warehouse, product and transfer." },
    ],
  },
  {
    title: "Accounts",
    icon: "account_balance_wallet_outlined",
    entries: [
      { label: "Invoice", key: "order_invoice", pageId: 55, icon: "receipt_long_outlined", description: "All sales invoices raised in the selected period." },
      { label: "Dispatch", key: "dispatch_report", pageId: 98, icon: "local_shipping_outlined", description: "Shipments dispatched against sales orders." },
      { label: "Account Day Book", key: "allaccount_report", pageId: 77, icon: "swap_horiz", description: "Every debit and credit transaction on your accounts." },
      { label: "Receivable", key: "Receivable", pageId: 58, icon: "arrow_downward", description: "Outstanding amounts customers still owe you." },
      { label: "Payable", key: "Payable", pageId: 58, icon: "arrow_upward", description: "Outstanding amounts you owe to suppliers." },
      { label: "Payment", key: "account_debit_report", pageId: 77, icon: "arrow_upward", description: "Payments made, debit-side account entries." },
      { label: "Receipt", key: "account_credit_report", pageId: 77, icon: "arrow_downward", description: "Receipts collected, credit-side account entries." },
      { label: "Cart Payment Report", key: "cart_payment_report", pageId: 77, icon: "receipt_long_outlined", description: "Invoices and orders with received/paid and pending amounts, based on linked transactions." },
      { label: "Credit Note (Sales Return)", key: "return_sales_invoice", pageId: 80, icon: "undo", description: "Sales returns / credit notes issued to customers." },
      { label: "Debit Note (Purchase Return)", key: "return_purchase_invoice", pageId: 81, icon: "undo", description: "Purchase returns / debit notes issued to suppliers." },
    ],
  },
  {
    title: "Inventory",
    icon: "inventory_2_outlined",
    entries: [
      { label: "Purchase Order", key: "purchase_order", pageId: 56, icon: "shopping_bag_outlined", description: "Purchase orders raised against your suppliers." },
      { label: "GRN", key: "inward_report", pageId: 92, icon: "move_to_inbox_outlined", description: "Goods received (GRN) against purchase orders." },
      { label: "Purchase Invoice", key: "purchase_invoice", pageId: 57, icon: "receipt_long_outlined", description: "Purchase invoices booked from suppliers." },
      { label: "Stock Summary", key: "product_inventory", pageId: 60, icon: "warehouse_outlined", description: "Current stock levels and low-stock alerts." },
      { label: "Serial Number Full Trace", key: "serial_number_trace", pageId: 199, icon: "qr_code_2_outlined", description: "Complete timeline of a serial number: documents, tasks and visits." },
      { label: "Serial Number Stock Movement", key: "serial_number_stock_check", pageId: 185, icon: "qr_code_2", description: "Stock in and out of one serial number, with opening and closing quantity." },
      { label: "Price List", key: "Price_List_Report", pageId: 8, icon: "price_change_outlined", description: "Custom price lists set up for different customers." },
      { label: "Price List Rates", key: "PriceListRate_Report", pageId: 202, icon: "price_change_outlined", description: "Current rate of every product in each price list, and the history of rate changes." },
    ],
  },
  {
    title: "Analysis",
    icon: "analytics_outlined",
    entries: [
      { label: "Team Performance", key: "team_performance", pageId: 52, icon: "leaderboard_outlined", description: "Compare performance metrics across your team." },
      { label: "Team Pending Work", key: "pending", pageId: 59, icon: "pending_actions_outlined", description: "Work items still pending per team member." },
      { label: "Status Wise Task / Support Ticket", key: "status_wise_report", pageId: 115, icon: "flag_outlined", description: "Tasks and tickets grouped by current status." },
      { label: "Source Wise Statistic", key: "source_wise_contact_statistic_report", pageId: 67, icon: "pie_chart_outline", description: "Contact counts broken down by lead source." },
      { label: "Label Wise Statistic", key: "label_wise_contact_statistics_report", pageId: 68, icon: "label_outline", description: "Contact counts broken down by label." },
      { label: "Chain Wise Contact", key: "all_contact_chainwise_report", pageId: 107, icon: "account_tree_outlined", description: "Contacts grouped by their parent-chain relationship." },
      { label: "All Deleted Contact", key: "all_deleted_contact_report", pageId: 96, icon: "person_off_outlined", description: "Contacts that have been deleted from your CRM." },
      { label: "Pending Order", key: "pending_order", pageId: 73, icon: "pending_outlined", description: "Sales orders still pending fulfillment." },
      { label: "Pending Purchase Order", key: "pending_purchase", pageId: 74, icon: "pending_outlined", description: "Purchase orders still pending receipt." },
      { label: "Product Wise Movement", key: "product_report", pageId: 62, icon: "swap_vert", description: "Stock in/out movement for each product." },
      { label: "Product Wise Pending", key: "product_wise_pending_report", pageId: 63, icon: "pending_outlined", description: "Pending order quantities per product." },
      { label: "Category Wise Movement", key: "category_report", pageId: 64, icon: "swap_vert", description: "Stock in/out movement rolled up by category." },
      { label: "Category Wise Pending", key: "category_wise_pending_report", pageId: 65, icon: "pending_outlined", description: "Pending order quantities rolled up by category." },
    ],
  },
  {
    title: "Tasks & more",
    icon: "task_alt",
    entries: [
      { label: "Tasks", key: "alltask_report", pageId: 51, icon: "checklist", description: "Every task created across your team." },
      { label: "Reminder", key: "allreminder_report", pageId: 106, icon: "notifications_none", description: "Reminders set for follow-ups and events." },
      { label: "Support Ticket", key: "support_ticket_report", pageId: 101, icon: "confirmation_number_outlined", description: "Customer support tickets and their resolution status." },
      { label: "Reviews", key: "reviews_report", pageId: 158, icon: "star_outline", description: "Customer reviews and ratings collected." },
      { label: "Personal Notes", key: "PersonalNotes_Report", pageId: 5, icon: "sticky_note_2_outlined", description: "Personal notes saved by team members." },
    ],
  },
];
