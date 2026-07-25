
-- CREATE DATABASE xxx_${dbName} / DROP DATABASE ${dbName}
DROP DATABASE IF EXISTS ${dbName};--
CREATE DATABASE IF NOT EXISTS ${dbName};--

USE ${dbName};--

-- Copy Structure + Data for Other Tables
-- CREATE TABLE new_database.new_table LIKE source_database.source_table;
-- ALTER TABLE new_database.new_table DISABLE KEYS;
-- START TRANSACTION;
-- INSERT INTO new_database.new_table SELECT * FROM source_database.source_table;
-- COMMIT;
-- ALTER TABLE new_database.new_table ENABLE KEYS;

-- Copy Only the Structure
-- CREATE TABLE new_database.table2 LIKE source_database.table2;

CREATE TABLE `account_transactions` LIKE smalloffice_sample_tenant.account_transactions;


CREATE TABLE `a_countries` LIKE smalloffice_sample_tenant.a_countries;
ALTER TABLE `a_countries`  DISABLE KEYS;
START TRANSACTION;
INSERT INTO `a_countries` SELECT * FROM smalloffice_sample_tenant.a_countries;
COMMIT;
ALTER TABLE `a_countries` ENABLE KEYS;

CREATE TABLE `a_states` LIKE smalloffice_sample_tenant.a_states;
ALTER TABLE `a_states`  DISABLE KEYS;
START TRANSACTION;
INSERT INTO `a_states` SELECT * FROM smalloffice_sample_tenant.a_states;
COMMIT;
ALTER TABLE `a_states` ENABLE KEYS;

CREATE TABLE `a_cities` LIKE smalloffice_sample_tenant.a_cities;
ALTER TABLE `a_cities`  DISABLE KEYS;
START TRANSACTION;
INSERT INTO `a_cities` SELECT * FROM smalloffice_sample_tenant.a_cities;
COMMIT;
ALTER TABLE `a_cities` ENABLE KEYS;

CREATE TABLE `a_areas` LIKE smalloffice_sample_tenant.a_areas;
ALTER TABLE `a_areas`  DISABLE KEYS;
START TRANSACTION;
INSERT INTO `a_areas` SELECT * FROM smalloffice_sample_tenant.a_areas;
COMMIT;
ALTER TABLE `a_areas` ENABLE KEYS;

CREATE TABLE `source_types` LIKE smalloffice_sample_tenant.source_types;
ALTER TABLE `source_types`  DISABLE KEYS;
START TRANSACTION;
INSERT INTO `source_types` SELECT * FROM smalloffice_sample_tenant.source_types;
COMMIT;
ALTER TABLE `source_types` ENABLE KEYS;

CREATE TABLE `carts` LIKE smalloffice_sample_tenant.carts;
CREATE TABLE `cart_items` LIKE smalloffice_sample_tenant.cart_items;
CREATE TABLE `categories` LIKE smalloffice_sample_tenant.categories;
CREATE TABLE `product_groups` LIKE smalloffice_sample_tenant.product_groups;
CREATE TABLE `warehouses` LIKE smalloffice_sample_tenant.warehouses;
CREATE TABLE `contact_masters` LIKE smalloffice_sample_tenant.contact_masters;
CREATE TABLE `contact_message_histories` LIKE smalloffice_sample_tenant.contact_message_histories;
CREATE TABLE `custom_field_form_masters` LIKE smalloffice_sample_tenant.custom_field_form_masters;
CREATE TABLE `inquiries` LIKE smalloffice_sample_tenant.inquiries;
CREATE TABLE `location_trackings` LIKE smalloffice_sample_tenant.location_trackings;
CREATE TABLE `personal_notes` LIKE smalloffice_sample_tenant.personal_notes;
CREATE TABLE `pricelist_masters` LIKE smalloffice_sample_tenant.pricelist_masters;
CREATE TABLE `price_lists` LIKE smalloffice_sample_tenant.price_lists;
CREATE TABLE `product_types` LIKE smalloffice_sample_tenant.product_types;
ALTER TABLE `product_types`  DISABLE KEYS;
START TRANSACTION;
INSERT INTO `product_types` SELECT * FROM smalloffice_sample_tenant.product_types;
COMMIT;
ALTER TABLE `product_types` ENABLE KEYS;
CREATE TABLE `reminder_messages` LIKE smalloffice_sample_tenant.reminder_messages;
CREATE TABLE `target_vs_incentives` LIKE smalloffice_sample_tenant.target_vs_incentives;
CREATE TABLE `expenses` LIKE smalloffice_sample_tenant.expenses;
CREATE TABLE `expense_type_masters` LIKE smalloffice_sample_tenant.expense_type_masters;
CREATE TABLE `call_histories` LIKE smalloffice_sample_tenant.call_histories;
CREATE TABLE `attendance_histories` LIKE smalloffice_sample_tenant.attendance_histories;
CREATE TABLE `visits` LIKE smalloffice_sample_tenant.visits;
CREATE TABLE `visit_type_masters` LIKE smalloffice_sample_tenant.visit_type_masters;
CREATE TABLE `departments` LIKE smalloffice_sample_tenant.departments;
CREATE TABLE `machine_managements` LIKE smalloffice_sample_tenant.machine_managements;
CREATE TABLE `task_managements` LIKE smalloffice_sample_tenant.task_managements;
CREATE TABLE `task_message_histories` LIKE smalloffice_sample_tenant.task_message_histories;
CREATE TABLE `custom_field_form_datavalues` LIKE smalloffice_sample_tenant.custom_field_form_datavalues;
CREATE TABLE `wrkflw_auto_assignment_of_contacts` LIKE smalloffice_sample_tenant.wrkflw_auto_assignment_of_contacts;
CREATE TABLE `task_templete_masters` LIKE smalloffice_sample_tenant.task_templete_masters;
CREATE TABLE `task_templete_datasources` LIKE smalloffice_sample_tenant.task_templete_datasources;
CREATE TABLE `status_and_stages_logs` LIKE smalloffice_sample_tenant.status_and_stages_logs;
CREATE TABLE `user_app_tracks` LIKE smalloffice_sample_tenant.user_app_tracks;
CREATE TABLE `a_application_login_type_rights` LIKE smalloffice_sample_tenant.a_application_login_type_rights;
CREATE TABLE `leave_type_masters` LIKE smalloffice_sample_tenant.leave_type_masters;
CREATE TABLE `leaves` LIKE smalloffice_sample_tenant.leaves;
CREATE TABLE `bill_of_materials_masters` LIKE smalloffice_sample_tenant.bill_of_materials_masters;
CREATE TABLE `employee_account_transactions` LIKE smalloffice_sample_tenant.employee_account_transactions;
CREATE TABLE `product_bill_of_materials` LIKE smalloffice_sample_tenant.product_bill_of_materials;
CREATE TABLE `process_masters` LIKE smalloffice_sample_tenant.process_masters;
CREATE TABLE `bom_vs_process_lists` LIKE smalloffice_sample_tenant.bom_vs_process_lists;
CREATE TABLE `bom_process_vs_cons_rejcts` LIKE smalloffice_sample_tenant.bom_process_vs_cons_rejcts;
CREATE TABLE `api_logs` LIKE smalloffice_sample_tenant.api_logs;
CREATE TABLE `cart_vs_serial_numbers` LIKE smalloffice_sample_tenant.cart_vs_serial_numbers;
CREATE TABLE `whatsapp_template_configs` LIKE smalloffice_sample_tenant.whatsapp_template_configs;
CREATE TABLE `employee_payrolls` LIKE smalloffice_sample_tenant.employee_payrolls;
CREATE TABLE `compensation_adjustments` LIKE smalloffice_sample_tenant.compensation_adjustments;
CREATE TABLE `holidays` LIKE smalloffice_sample_tenant.holidays;
CREATE TABLE `attendance_batch_process` LIKE smalloffice_sample_tenant.attendance_batch_process;
CREATE TABLE `salary_registers` LIKE smalloffice_sample_tenant.salary_registers;
CREATE TABLE `job_cards` LIKE smalloffice_sample_tenant.job_cards;
CREATE TABLE `production_transactions` LIKE smalloffice_sample_tenant.production_transactions;
CREATE TABLE `production_transaction_items` LIKE smalloffice_sample_tenant.production_transaction_items;
CREATE TABLE `day_conversions` LIKE smalloffice_sample_tenant.day_conversions;
CREATE TABLE `lock_controls` LIKE smalloffice_sample_tenant.lock_controls;
CREATE TABLE `route_planners` LIKE smalloffice_sample_tenant.route_planners;
CREATE TABLE `route_plan_vs_contacts` LIKE smalloffice_sample_tenant.route_plan_vs_contacts;

CREATE TABLE `adjustment_types` LIKE smalloffice_sample_tenant.adjustment_types;
ALTER TABLE `adjustment_types`  DISABLE KEYS;
START TRANSACTION;
INSERT INTO `adjustment_types` SELECT * FROM smalloffice_sample_tenant.adjustment_types;
COMMIT;
ALTER TABLE `adjustment_types` ENABLE KEYS;

CREATE TABLE `tax_masters` LIKE smalloffice_sample_tenant.tax_masters;
ALTER TABLE `tax_masters`  DISABLE KEYS;
START TRANSACTION;
INSERT INTO `tax_masters` SELECT * FROM smalloffice_sample_tenant.tax_masters;
COMMIT;
ALTER TABLE `tax_masters` ENABLE KEYS;

CREATE TABLE `attendance_roundoff_rules` LIKE smalloffice_sample_tenant.attendance_roundoff_rules;
ALTER TABLE `attendance_roundoff_rules`  DISABLE KEYS;
START TRANSACTION;
INSERT INTO `attendance_roundoff_rules` SELECT * FROM smalloffice_sample_tenant.attendance_roundoff_rules;
COMMIT;
ALTER TABLE `attendance_roundoff_rules` ENABLE KEYS;

CREATE TABLE `wrkflw_google_sheet_configs` LIKE smalloffice_sample_tenant.wrkflw_google_sheet_configs;
ALTER TABLE `wrkflw_google_sheet_configs`  DISABLE KEYS;
START TRANSACTION;
INSERT INTO `wrkflw_google_sheet_configs` SELECT * FROM smalloffice_sample_tenant.wrkflw_google_sheet_configs;
COMMIT;
ALTER TABLE `wrkflw_google_sheet_configs` ENABLE KEYS;


CREATE TABLE `lable_masters` LIKE smalloffice_sample_tenant.lable_masters;
ALTER TABLE `lable_masters`  DISABLE KEYS;
START TRANSACTION;
INSERT INTO `lable_masters` SELECT * FROM smalloffice_sample_tenant.lable_masters;
COMMIT;
ALTER TABLE `lable_masters` ENABLE KEYS;

CREATE TABLE `print_settings` LIKE smalloffice_sample_tenant.print_settings;
ALTER TABLE `print_settings`  DISABLE KEYS;
START TRANSACTION;
INSERT INTO `print_settings` SELECT * FROM smalloffice_sample_tenant.print_settings;
COMMIT;
ALTER TABLE `print_settings` ENABLE KEYS;



CREATE TABLE `stage_status_masters` LIKE smalloffice_sample_tenant.stage_status_masters;
ALTER TABLE `stage_status_masters`  DISABLE KEYS;
START TRANSACTION;
INSERT INTO `stage_status_masters` SELECT * FROM smalloffice_sample_tenant.stage_status_masters;
COMMIT;
ALTER TABLE `stage_status_masters` ENABLE KEYS;

CREATE TABLE `task_categories` LIKE smalloffice_sample_tenant.task_categories;
ALTER TABLE `task_categories`  DISABLE KEYS;
START TRANSACTION;
INSERT INTO `task_categories` SELECT * FROM smalloffice_sample_tenant.task_categories;
COMMIT;
ALTER TABLE `task_categories` ENABLE KEYS;

ALTER TABLE `inquiries`
  ADD CONSTRAINT `fk_contact_master_id` FOREIGN KEY (`contact_master_id`) REFERENCES `contact_masters` (`id`) ON DELETE SET NULL ON UPDATE SET NULL;--
COMMIT;--

CREATE TABLE `cart_vs_attachments` LIKE smalloffice_sample_tenant.cart_vs_attachments;

CREATE TABLE `product_unit_masters` LIKE smalloffice_sample_tenant.product_unit_masters;
ALTER TABLE `product_unit_masters`  DISABLE KEYS;
START TRANSACTION;
INSERT INTO `product_unit_masters` SELECT * FROM smalloffice_sample_tenant.product_unit_masters;
COMMIT;
ALTER TABLE `product_unit_masters` ENABLE KEYS;

CREATE TABLE `products` LIKE smalloffice_sample_tenant.products;
ALTER TABLE `products`  DISABLE KEYS;
START TRANSACTION;
INSERT INTO `products` SELECT * FROM smalloffice_sample_tenant.products;
COMMIT;
ALTER TABLE `products` ENABLE KEYS;

ALTER TABLE `contact_masters`  DISABLE KEYS;
START TRANSACTION;
INSERT INTO `contact_masters` SELECT * FROM smalloffice_sample_tenant.contact_masters;
COMMIT;
ALTER TABLE `contact_masters` ENABLE KEYS;

ALTER TABLE `expense_type_masters`  DISABLE KEYS;
START TRANSACTION;
INSERT INTO `expense_type_masters` SELECT * FROM smalloffice_sample_tenant.expense_type_masters;
COMMIT;
ALTER TABLE `expense_type_masters` ENABLE KEYS;

ALTER TABLE `visit_type_masters`  DISABLE KEYS;
START TRANSACTION;
INSERT INTO `visit_type_masters` SELECT * FROM smalloffice_sample_tenant.visit_type_masters;
COMMIT;
ALTER TABLE `visit_type_masters` ENABLE KEYS;

ALTER TABLE `departments`  DISABLE KEYS;
START TRANSACTION;
INSERT INTO `departments` SELECT * FROM smalloffice_sample_tenant.departments;
COMMIT;
ALTER TABLE `departments` ENABLE KEYS;

ALTER TABLE `categories`  DISABLE KEYS;
START TRANSACTION;
INSERT INTO `categories` SELECT * FROM smalloffice_sample_tenant.categories;
COMMIT;
ALTER TABLE `categories` ENABLE KEYS;

ALTER TABLE `product_groups`  DISABLE KEYS;
START TRANSACTION;
INSERT INTO `product_groups` SELECT * FROM smalloffice_sample_tenant.product_groups;
COMMIT;
ALTER TABLE `product_groups` ENABLE KEYS;

ALTER TABLE `warehouses`  DISABLE KEYS;
START TRANSACTION;
INSERT INTO `warehouses` SELECT * FROM smalloffice_sample_tenant.warehouses;
COMMIT;
ALTER TABLE `warehouses` ENABLE KEYS;

CREATE TABLE `payment_types` LIKE smalloffice_sample_tenant.payment_types;
ALTER TABLE `payment_types`  DISABLE KEYS;
START TRANSACTION;
INSERT INTO `payment_types` SELECT * FROM smalloffice_sample_tenant.payment_types;
COMMIT;
ALTER TABLE `payment_types` ENABLE KEYS;

ALTER TABLE `inquiries`  DISABLE KEYS;
START TRANSACTION;
INSERT INTO `inquiries` SELECT * FROM smalloffice_sample_tenant.inquiries;
COMMIT;
ALTER TABLE `inquiries` ENABLE KEYS;

ALTER TABLE `contact_message_histories`  DISABLE KEYS;
START TRANSACTION;
INSERT INTO `contact_message_histories` SELECT * FROM smalloffice_sample_tenant.contact_message_histories;
COMMIT;
ALTER TABLE `contact_message_histories` ENABLE KEYS;

INSERT INTO smalloffice.tenant_masters (`id`, `a_application_login_id`, `company_masters_id`, `application_login_name`,  `db_host`, `db_user`, `db_password`, `db_name` , `created_date_time`,`isDelete`, `isActive`) VALUES (NULL, '${applicationId}', '${companyId}', '${applicationName}','${dbHost}', '${dbUser}', '', '${dbName}' , '${createDateTime}','0','1');


