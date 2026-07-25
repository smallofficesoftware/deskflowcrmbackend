USE ${dbName};--


INSERT INTO `lable_masters`( `company_masters_id`, `a_application_login_id`, `lable_name`, `color`, `created_date_time`)
 VALUES 
 ('${companyId}','${applicationId}','abc-1','','${createDateTime}'),
 ('${companyId}','${applicationId}','abc-2','','${createDateTime}'),
 ('${companyId}','${applicationId}','abc-4','','${createDateTime}'),
 ('${companyId}','${applicationId}','abc-5','','${createDateTime}'),
 ('${companyId}','${applicationId}','abc-6','','${createDateTime}');--



INSERT INTO `categories`(`company_masters_id`, `a_application_login_id`, `category_name`, `color`, `created_date_time`) VALUES 
('${companyId}','${applicationId}','Pizza','','${createDateTime}'),
('${companyId}','${applicationId}','Hot Dog','','${createDateTime}'),
('${companyId}','${applicationId}','Tea','','${createDateTime}'),
('${companyId}','${applicationId}','Milk','','${createDateTime}');--