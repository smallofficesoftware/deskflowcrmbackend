import axios from "axios";
import moment from "moment";
import { Op } from "sequelize";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";
import { contactMessageHistory } from "../../models/activities/contactMessageHistoryModel.js";
import { contactModel } from "../../models/activities/contactModel.js";
import { inquiryModel } from "../../models/activities/inquiryModel.js";
import { applicationLoginTypeRightModel } from "../../models/application_login/applicationLoginTypeRightModel.js";
import loginModel from "../../models/application_login/loginModel.js";
import companyModel from "../../models/company_setup/companyModel.js";
import companyVsApplicationLoginModel from "../../models/company_setup/companyVsApplicationLoginModel.js";
import { cityModel } from "../../models/masters/cityModel.js";
import { countryModel } from "../../models/masters/countryModel.js";
import { stateModel } from "../../models/masters/stateModel.js";
import { categoryModel } from "../../models/product_settings/categoryModel.js";
import { productModel } from "../../models/product_settings/productModel.js";
import { generateNumber, isValid, normalizeToTenDigit, resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";
import { getCompanyByLoginId, insertStagesAndStatusLogs } from "../commonServices.js";
import { autoAssignmentContactIdsGet, prepareMailAndWhatsappSenderToTheContact } from "../other_settings/wrkflwAutoAssignmentContactService.js";

export const addContactByIndiaMart = async (req) => {
    try {
        const { date } = req.body;
        //1. companyId Fatch
        const findCompanyId = await getCompanyByLoginId(req.body.a_application_login_id);
        const source_type_id = "-1";
        let a_company_name;
        let a_company_id;
        // 2. Fetch IndiaMart API key
        const findIndiaMartApiKey = await companyModel.findOne({
            where: {
                id: findCompanyId.company_masters_id,
                isDelete: "0",
            },
            attributes: ["id", "india_mart_api_key", "company_name"],
        });

        if (!findIndiaMartApiKey || !findIndiaMartApiKey.dataValues.india_mart_api_key) {
            return resError({
                ack_msg: "IndiaMart API key not found",
                developer_msg: `No API key found for company ID`,
            });
        }

        a_company_name = findIndiaMartApiKey.dataValues.company_name;
        a_company_id = findIndiaMartApiKey.dataValues.id;
        // 3:  check IndiaMart date and check formate
        const indiaMartDate = moment(new Date()).format("DD-MM-YYYY").toUpperCase();
        const indiaMartStartTime = isValid(date) ? date : indiaMartDate;
        const indiaMartEndTime = isValid(date) ? date : indiaMartDate;
        const indiaMartApiKey = findIndiaMartApiKey.dataValues.india_mart_api_key;

        //  4: Call IndiaMart API
        const response = await axios.get(`https://mapi.indiamart.com/wservce/crm/crmListing/v2/?glusr_crm_key=${indiaMartApiKey}&start_time=${indiaMartStartTime}&end_time=${indiaMartEndTime}`);

        const indiaMartData = response?.data;

        if (indiaMartData.STATUS !== "SUCCESS" || indiaMartData.CODE !== 200) {
            return resError({
                ack_msg: indiaMartData?.MESSAGE || "IndiaMart API returned invalid or empty response",
                developer_msg: indiaMartData?.MESSAGE || "IndiaMart API returned invalid or empty response",
                data: indiaMartData,
            });
        }

        const responseBody = response.data.RESPONSE;

        if (!responseBody || !Array.isArray(responseBody)) {
            return resError({
                ack_msg: "Invalid IndiaMart response",
                developer_msg: "IndiaMart API returned invalid or empty response",
                data: response?.data
            });
        }

        // 5: Remove duplicate Data
        const CTContactModel = contactModel(req.tenantDB);
        const contact_id_last = await CTContactModel.findOne({ where: { isDelete: 0 }, order: [['id', 'DESC']] });
        const seen = new Set();
        const contactBody = (responseBody ?? [])
            .filter((entry) => {
                if (seen.has(entry.UNIQUE_QUERY_ID)) {
                    console.log(
                        `Skipping duplicate entry with UNIQUE_QUERY_ID: ${entry.UNIQUE_QUERY_ID}`
                    );
                    return false;
                }
                seen.add(entry.UNIQUE_QUERY_ID);
                return true;
            })
            .map((entry, i) => ({
                column_1: entry.UNIQUE_QUERY_ID,
                person_name: entry.SENDER_NAME || "Unkown",
                mobile_number: entry.SENDER_MOBILE ? normalizeToTenDigit(entry.SENDER_MOBILE) : generateNumber(1234567890, contact_id_last.id + (i + 1)),
                raw_mobile_number: entry.SENDER_MOBILE || "",
                email_id: entry.SENDER_EMAIL,
                address: entry.SENDER_ADDRESS,
                pincode: entry.SENDER_PINCODE,
                created_date_time: entry.QUERY_TIME,
                a_application_login_id: req.body.a_application_login_id,
                company_masters_id: findCompanyId.company_masters_id,
                source_type_id: source_type_id,
                country: entry.SENDER_COUNTRY_ISO,
                state: entry.SENDER_STATE,
                city: entry.SENDER_CITY,
                company_name: entry.SENDER_COMPANY,
                description: `${entry.QUERY_PRODUCT_NAME} ${entry.QUERY_MESSAGE} ${entry.QUERY_MCAT_NAME} ${entry.SUBJECT}`,
            }));

        if (!contactBody || !Array.isArray(contactBody)) {
            return resError({
                ack_msg: "Invalid IndiaMart contact filter response",
                developer_msg: "IndiaMart API returned invalid or empty response",
                data: response?.data
            });
        }

        //  6:  add tanent Model
        const CTproductModel = productModel(req.tenantDB);
        const CTcategoryModel = categoryModel(req.tenantDB);
        const CTInquiryModel = inquiryModel(req.tenantDB);
        const CTContactMessageHistoryModel = contactMessageHistory(req.tenantDB);
        const CTCountryModel = countryModel(req.tenantDB);
        const CTStateModel = stateModel(req.tenantDB);
        const CTCityModel = cityModel(req.tenantDB);
        const applicationLoginTypeRightModelIntance = applicationLoginTypeRightModel(req.tenantDB);

        //  7: Fetch  data tanat model wise
        const existingEntries = await CTContactModel.findAll({
            where: { isDelete: 0 },
            attributes: ["column_1", "mobile_number"],
        });

        const existingEntriesInquiry = await CTInquiryModel.findAll({
            where: { uniqe_india_mart_id: { [Op.ne]: '' } },
            attributes: ["uniqe_india_mart_id"],
        });
        const existingProduct = await CTproductModel.findAll({
            where: {
                isDelete: 0,
                a_application_login_id: req.body.a_application_login_id,
                company_masters_id: findCompanyId.company_masters_id,
            },
        });
        const existingCategory = await CTcategoryModel.findAll({
            where: {
                isDelete: 0,
                a_application_login_id: req.body.a_application_login_id,
                company_masters_id: findCompanyId.company_masters_id,
            },
        });

        const countriesData = await CTCountryModel.findAll({
            where: {
                isDelete: 0,
            },
        });

        const statesData = await CTStateModel.findAll({
            where: {
                isDelete: 0,
            },
        });

        const cityData = await CTCityModel.findAll({
            where: {
                isDelete: 0,
            },
        });

        //  8: Create maps loop  categories and products
        const existingCategoryMap = new Map(existingCategory.map((entry) => [entry.category_name, entry.id]));

        const existingProductMap = new Map(existingProduct.map((entry) => [entry.product_name, entry.id]));

        const existingColumn1Set = new Set(existingEntries.map((entry) => String(entry.column_1).trim()));

        const contactMobileNumberSet = new Set(existingEntries.map((entry) => String(entry.mobile_number).trim()));

        const existingEntriesInquiryMap = new Set(existingEntriesInquiry.map((entry) => String(entry.uniqe_india_mart_id).trim()));

        const countriesDataSet = new Map(countriesData.map((entry) => [entry.country_iso, entry.id]));

        const statesDataSet = new Map(statesData.map((entry) => [entry.state_name, entry.id]));

        const cityDataSet = new Map(cityData.map((entry) => [entry.city_name, entry.id]));

        // Step 9: Filter out existing leads
        const currentDataMobileNumberCheckSet = new Set();
        const whatsappEmailSendTeamPersonList = [];
        const filteredContactBody = await Promise.all(
            contactBody
                .filter((entry) => {
                    const mobile = String(entry.mobile_number).trim();
                    const column1 = String(entry.column_1).trim();

                    if (currentDataMobileNumberCheckSet.has(String(mobile))) {
                        return false; // skip
                    }
                    currentDataMobileNumberCheckSet.add(String(mobile));

                    // First priority: mobile number
                    if (contactMobileNumberSet.has(mobile)) {
                        return false; // skip
                    }

                    // Second priority: column_1
                    if (existingColumn1Set.has(column1)) {
                        return false; // skip
                    }

                    // Otherwise keep
                    return true;
                })
                .map(async (entry) => {
                    const { description, ...restEntry } = entry;
                    const country = countriesDataSet.get(entry.country?.trim()) || 0;
                    const state = statesDataSet.get(entry.state?.trim()) || 0;
                    const city = cityDataSet.get(entry.city?.trim()) || 0;

                    /* Contact Assignment */
                    const contactAssignedIds = await autoAssignmentContactIdsGet(req, {
                        source_type_id,
                        country_id: country,
                        state_id: state,
                        city_id: city,
                        area_id: null,
                        description: description
                    });
                    const contactAssignedIdsStr = isValid(contactAssignedIds?.data?.assignedIds) ? contactAssignedIds?.data?.assignedIds?.join(",") : "";

                    if (contactAssignedIds?.data?.isWhatsappEmailSendEnabled && (contactAssignedIds?.data?.assignedIds?.length == 1 || isValid(contactAssignedIds?.data?.template_id))) {
                        whatsappEmailSendTeamPersonList.push(
                            {
                                team_id: contactAssignedIdsStr,
                                send_message: contactAssignedIds?.data?.send_description,
                                template_id: contactAssignedIds?.data?.template_id
                            }
                        )
                    }
                    /* Contact Assignment */

                    return {
                        ...restEntry,
                        country,
                        state,
                        assinged_to_work_a_application_id: contactAssignedIdsStr || req.body.a_application_login_id,
                    };
                })
        );

        const filteredInquiryBody = contactBody.filter((entry) => !existingEntriesInquiryMap.has(String(entry.column_1).trim()))

        // 10: Check user limits plan wise
        const userList = await CTContactModel.findAll({
            where: {
                company_masters_id: findCompanyId.company_masters_id,
                isDelete: 0,
            },
            attributes: ["company_masters_id", "a_application_login_id"],
        });
        const userRightsList = await applicationLoginTypeRightModelIntance.findAll({
            where: {
                company_masters_id: findCompanyId.company_masters_id,
                page_id: 1,
                isDelete: 0,
            },
            attributes: ["a_application_login_id", "a_page_id_rights_jason"],
        });
        const userCount = userList.length;

        for (const userRight of userRightsList) {
            try {
                const rightsJson = JSON.parse(
                    userRight.dataValues.a_page_id_rights_jason
                );
                if (typeof rightsJson.limit === "number" && rightsJson.limit > 0) {
                    const totalAfterImport = userCount + filteredContactBody.length;
                    if (totalAfterImport > rightsJson.limit) {
                        return resError({
                            ack_msg: `Limit ${rightsJson.limit} reached for Company. Current: ${userCount}, Trying to add: ${filteredContactBody.length}`,
                            developer_msg: `Limit ${rightsJson.limit} reached for Company. Current: ${userCount}, Trying to add: ${filteredContactBody.length}`,
                        });
                    }
                }
            } catch (err) {
                console.error(
                    "Error parsing JSON for a_application_login_id:",
                    userRight.a_application_login_id,
                    err
                );
            }
        }

        //  11: Insert new leads and prepare response
        if (filteredContactBody.length > 0) {
            const result = await CTContactModel.bulkCreate(filteredContactBody);
            const contactEmailSendList = [];
            const contactWhatsappSendList = [];
            await Promise.all(
                result.map((v) => {
                    insertStagesAndStatusLogs(req, {
                        reference_table: "contact_masters",
                        reference_id: v.id,
                        status_id: "-1",
                        a_application_login_id: req.body.a_application_login_id,
                    })
                    if (isValid(whatsappEmailSendTeamPersonList) && isValid(v.email_id)) {
                        const result = whatsappEmailSendTeamPersonList.find(item => item.team_id == v.assinged_to_work_a_application_id);
                        if (result) {
                            contactEmailSendList.push({
                                email_id: v.email_id,
                                contact_detail: {
                                    person_name: v.person_name,
                                    mobile_number: v.mobile_number,
                                    company_name: v.company_name
                                },
                                team_person: v.assinged_to_work_a_application_id,
                                company_name: a_company_name,
                                a_company_id: a_company_id,
                                send_message: result?.send_message,
                            });
                        }
                    }
                    if (isValid(whatsappEmailSendTeamPersonList) && isValid(v.mobile_number)) {
                        const result = whatsappEmailSendTeamPersonList.find(item => item.team_id == v.assinged_to_work_a_application_id);
                        if (result) {
                            contactWhatsappSendList.push({
                                whatsapp_number: v.mobile_number,
                                contact_detail: {
                                    person_name: v.person_name,
                                    mobile_number: v.mobile_number,
                                    company_name: v.company_name,
                                    customer_id: v.id
                                },
                                team_person: v.assinged_to_work_a_application_id,
                                company_name: a_company_name,
                                a_company_id: a_company_id,
                                send_message: result?.send_message,
                                template_id: result?.template_id,
                            });
                        }
                    }
                })
            );

            await prepareMailAndWhatsappSenderToTheContact(req, { contactWhatsappSendList, contactEmailSendList });
        }

        //  12: Insert inquiries
        if (filteredInquiryBody.length > 0) {

            /* collect contact id */
            const mobile_number = filteredInquiryBody.map(e => e.mobile_number);
            const contactCollectedIds = await CTContactModel.findAll({
                where: {
                    isDelete: '0',
                    mobile_number: mobile_number
                },
                attributes: ["id", "mobile_number"]
            });

            const contactCollectedIdsSet = new Map(contactCollectedIds.map((entry) => [String(entry.mobile_number).trim(), entry.id]));
            /* collect contact id */

            const insertInquiry = filteredInquiryBody
                .filter((cm) =>
                    responseBody.some((a) => a.UNIQUE_QUERY_ID === cm.column_1)
                )
                .map((cm) => {
                    const matchedEntry = responseBody.find(
                        (a) => a.UNIQUE_QUERY_ID === cm.column_1
                    );
                    const categoryId = existingCategoryMap.get(
                        matchedEntry.QUERY_MCAT_NAME
                    );
                    const productId = existingProductMap.get(
                        matchedEntry.QUERY_PRODUCT_NAME
                    );
                    const contact_id = contactCollectedIdsSet.get(String(cm.mobile_number)?.trim());
                    return {
                        contact_master_id: contact_id,
                        product_id: productId || -1,
                        category_id: categoryId || -1,
                        description: matchedEntry.QUERY_MESSAGE,
                        inquiry_date_time: matchedEntry.QUERY_TIME,
                        a_application_login_id: req.body.a_application_login_id,
                        company_masters_id: findCompanyId.company_masters_id,
                        source_type_id: source_type_id,
                        uniqe_india_mart_id: cm.column_1,
                    };
                });
            if (insertInquiry.length > 0) {
                const createdInq = await CTInquiryModel.bulkCreate(insertInquiry);

                await Promise.all(
                    createdInq.map((v) =>
                        insertStagesAndStatusLogs(req, {
                            reference_table: "inquiries",
                            reference_id: v.id,
                            status_id: "-2",
                            a_application_login_id: req.body.a_application_login_id
                        })
                    )
                );

                /* notification code */
                try {
                    const ownerTokenData = await companyVsApplicationLoginModel.findAll({
                        where: {
                            isDelete: 0,
                            company_masters_id: findCompanyId.company_masters_id,
                            company_flag: 1,
                        },
                        attributes: ["a_application_login_id"],
                    });

                    const allLoginIds = ownerTokenData
                        .map((item) => item.a_application_login_id)
                        .filter((id) => id !== req.body.a_application_login_id);

                    const ownerTokens =
                        allLoginIds.length > 0
                            ? await loginModel.findAll({
                                where: { id: allLoginIds, isDelete: 0 },
                                attributes: [
                                    "android_refresh_token",
                                    "web_refresh_token",
                                    "ios_refresh_token",
                                ],
                            })
                            : [];

                    const allTokens = ownerTokens
                        .flatMap((tokenObj) => [
                            tokenObj.android_refresh_token,
                            tokenObj.web_refresh_token,
                            tokenObj.ios_refresh_token,
                        ])
                        .filter((token) => token && token.trim() !== "");

                    const uniqueTokens = [...new Set(allTokens)];

                    if (uniqueTokens.length > 0) {
                        const notificationBody = `Added ${insertInquiry.length} new ${insertInquiry.length === 1 ? "inquiry" : "inquiries"
                            } from IndiaMart.`;
                        await sendMultipleNotification({
                            deviceTokens: uniqueTokens,
                            title: `New IndiaMart Inquiries Added`,
                            body: notificationBody,
                        });
                        console.log(
                            "Notifications sent to",
                            uniqueTokens.length,
                            "devices"
                        );
                    } else {
                        console.log("No device tokens found for notification.");
                    }
                } catch (notificationError) {
                    console.error(
                        "Notification failed (non-critical):",
                        notificationError.message
                    );
                }
                /* notification code */
            }

            //  13: Insert message history
            const msgDateTime = new Date();
            const msgDateTimeFormattedDate = moment(msgDateTime).format(
                "YYYY-MM-DD HH:mm:ss"
            );

            // Collect contact_masters_id values during mapping
            const messageMatches = filteredInquiryBody
                .filter((cm) =>
                    responseBody.some((a) => a.UNIQUE_QUERY_ID === cm.column_1)
                )
                .map((cm) => {
                    const matchedEntry = responseBody.find(
                        (a) => a.UNIQUE_QUERY_ID === cm.column_1
                    );
                    const contact_id = contactCollectedIdsSet.get(cm.mobile_number);
                    return {
                        contact_masters_id: contact_id,
                        a_application_login_id: req.body.a_application_login_id,
                        company_masters_id: findCompanyId.company_masters_id,
                        description: `
                            <strong>Name : </strong>${matchedEntry.SENDER_NAME}<br>
                            <strong>Mobile No. :</strong> ${matchedEntry.SENDER_MOBILE}<br>
                            <strong>Mobile Alt : </strong>${matchedEntry.SENDER_MOBILE_ALT}<br>
                            <strong>Phone No : </strong>${matchedEntry.SENDER_PHONE}<br>
                            <strong>Phone No Alt : </strong>${matchedEntry.SENDER_PHONE_ALT}<br>
                            <strong>Call Duration : </strong>${matchedEntry.CALL_DURATION}<br>
                            <strong>Email ID : </strong>${matchedEntry.SENDER_EMAIL}<br>
                            <strong>Email ID Alt : </strong>${matchedEntry.SENDER_EMAIL_ALT}<br>
                            <strong>Source : </strong>IndiaMart<br>
                            <strong>Date : </strong>${matchedEntry.QUERY_TIME}<br>
                            <strong>Address : </strong>${matchedEntry.SENDER_ADDRESS}<br>
                            <strong>Country : </strong>${matchedEntry.SENDER_COUNTRY_ISO}<br>
                            <strong>State : </strong>${matchedEntry.SENDER_STATE}<br>
                            <strong>City : </strong>${matchedEntry.SENDER_CITY}<br>
                            <strong>Pincode : </strong>${matchedEntry.SENDER_PINCODE}<br>
                            <strong>Product Name : </strong>${matchedEntry.QUERY_PRODUCT_NAME}<br>
                            <strong>Category Name : </strong>${matchedEntry.QUERY_MCAT_NAME}<br>
                            <strong>Subject : </strong>${matchedEntry.SUBJECT}<br>
                            <strong>Description : </strong>${matchedEntry.QUERY_MESSAGE}
                        `,
                        created_date_time: matchedEntry.QUERY_TIME || msgDateTimeFormattedDate,
                        message_side: "2",
                        message_type_id: "0",
                    };
                });

            const contactIds = messageMatches.map(
                (match) => match.contact_masters_id
            );

            await CTContactMessageHistoryModel.bulkCreate(messageMatches);

            const ContactMaster = contactModel(req.tenantDB);
            if (contactIds.length > 0) {
                await ContactMaster.update(
                    {
                        is_read_by_a_application_login_id: '',
                    },
                    {
                        where: {
                            id: contactIds,
                        },
                    }
                );
            }
        }
        //  14: Return success response
        return resSuccess({
            ack_msg: filteredContactBody.length > 0 ? "New leads added successfully" : "No new leads found",
            data: response?.data
        });
    } catch (error) {
        console.error("Error in addContactByIndiaMart:", error);
        return resBadRequest({
            ack_msg: "Something went wrong",
            developer_msg: `Error: ${error.message}`,
        });
    }
};

export const addContactByIndiaMartPushApi = async (req, res) => {
    try {

        const indiaMartData = req.body.RESPONSE;

        if (!indiaMartData) {
            return resError(res, {
                ack_msg: "Invalid IndiaMart response",
                developer_msg: "IndiaMart API returned empty or invalid format",
            });
        }

        // Ensure the data is treated as an array
        const responseBody = Array.isArray(indiaMartData) ? indiaMartData : [indiaMartData];

        if (responseBody.length === 0) {
            return resError(res, {
                ack_msg: "Invalid IndiaMart response not list formate",
                developer_msg: "IndiaMart API returned empty or invalid format",
            });
        }

        const { companyCode } = req.params;

        const findIndiaMartApiKey = await companyModel.findOne({
            where: {
                qr_code: companyCode,
                isDelete: "0",
            },
            attributes: ["id", "qr_code", "a_application_login_id", "company_name"],
        });


        //1. companyId Fatch

        if (!findIndiaMartApiKey) {
            return resError(res, {
                ack_msg: "IndiaMart API key not found for company",
                developer_msg: `No API key found for company with qr_code: ${companyCode}`,
            });
        }



        const findCompanyId = await getCompanyByLoginId(findIndiaMartApiKey.dataValues.a_application_login_id);

        let a_company_name;
        let a_company_id;
        a_company_name = findIndiaMartApiKey.dataValues.company_name;
        a_company_id = findIndiaMartApiKey.dataValues.id;
        const tenantId = findIndiaMartApiKey.dataValues.a_application_login_id;
        let source_type_id = -1;
        req.headers["x-tenant-id"] = tenantId;
        await new Promise((resolve, reject) => {
            tenantMiddleware(req, res, (err) => {
                if (err) {
                    return reject(err);
                }
                resolve();
            });
        });
        const CTContactModel = contactModel(req.tenantDB);
        const contact_id_last = await CTContactModel.findOne({ where: { isDelete: 0 }, order: [['id', 'DESC']] });
        const seen = new Set();
        const contactBody = (responseBody ?? [])
            .filter((entry) => {
                if (seen.has(entry.UNIQUE_QUERY_ID)) {
                    console.log(
                        `Skipping duplicate entry with UNIQUE_QUERY_ID: ${entry.UNIQUE_QUERY_ID}`
                    );
                    return false;
                }
                seen.add(entry.UNIQUE_QUERY_ID);
                return true;
            })
            .map((entry, i) => ({
                column_1: entry.UNIQUE_QUERY_ID,
                person_name: entry.SENDER_NAME || "Unkown",
                mobile_number: entry.SENDER_MOBILE ? normalizeToTenDigit(entry.SENDER_MOBILE) : generateNumber(1234567890, contact_id_last.id + (i + 1)),
                raw_mobile_number: entry.SENDER_MOBILE || "",
                email_id: entry.SENDER_EMAIL,
                address: entry.SENDER_ADDRESS,
                pincode: entry.SENDER_PINCODE,
                created_date_time: entry.QUERY_TIME,
                a_application_login_id: findIndiaMartApiKey.dataValues.a_application_login_id,
                company_masters_id: findCompanyId.company_masters_id,
                source_type_id: source_type_id,
                country: entry.SENDER_COUNTRY_ISO,
                state: entry.SENDER_STATE,
                city: entry.SENDER_CITY,
                company_name: entry.SENDER_COMPANY,
                description: `${entry.QUERY_PRODUCT_NAME} ${entry.QUERY_MESSAGE} ${entry.QUERY_MCAT_NAME} ${entry.SUBJECT}`,
            }));



        if (!contactBody) {
            return resError(res, {
                ack_msg: "IndiaMart data not found for company",
                developer_msg: `IndiaMart contact filter detail not found`,
            });
        }




        // Add tenant models
        const CTproductModel = productModel(req.tenantDB);
        const CTcategoryModel = categoryModel(req.tenantDB);
        const CTInquiryModel = inquiryModel(req.tenantDB);
        const CTContactMessageHistoryModel = contactMessageHistory(req.tenantDB);
        const CTCountryModel = countryModel(req.tenantDB);
        const CTStateModel = stateModel(req.tenantDB);
        const CTCityModel = cityModel(req.tenantDB);
        const applicationLoginTypeRightModelIntance = applicationLoginTypeRightModel(req.tenantDB);

        if (!req.tenantDB) {
            return resError(res, {
                ack_msg: "Tenant database not initialized",
                developer_msg: `Failed to initialize tenant database for tenantId: ${tenantId}`,
            });
        }

        //  7: Fetch  data tanat model wise
        const existingEntries = await CTContactModel.findAll({
            where: { isDelete: 0 },
            attributes: ["column_1", "mobile_number"],
        });
        const existingProduct = await CTproductModel.findAll({
            where: {
                isDelete: 0,
                a_application_login_id: findIndiaMartApiKey.dataValues.a_application_login_id,
                company_masters_id: findCompanyId.company_masters_id,
            },
        });
        const existingCategory = await CTcategoryModel.findAll({
            where: {
                isDelete: 0,
                a_application_login_id: findIndiaMartApiKey.dataValues.a_application_login_id,
                company_masters_id: findCompanyId.company_masters_id,
            },
        });

        const countriesData = await CTCountryModel.findAll({
            where: {
                isDelete: 0,
            },
        });

        const statesData = await CTStateModel.findAll({
            where: {
                isDelete: 0,
            },
        });

        const cityData = await CTCityModel.findAll({
            where: {
                isDelete: 0,
            },
        });

        //  8: Create maps loop  categories and products
        const existingCategoryMap = new Map(existingCategory.map((entry) => [entry.category_name, entry.id]));

        const existingProductMap = new Map(existingProduct.map((entry) => [entry.product_name, entry.id]));

        const existingColumn1Set = new Set(existingEntries.map((entry) => String(entry.column_1).trim()));

        const contactMobileNumberSet = new Set(existingEntries.map((entry) => String(entry.mobile_number).trim()));

        const countriesDataSet = new Map(countriesData.map((entry) => [entry.country_iso, entry.id]));

        const statesDataSet = new Map(statesData.map((entry) => [entry.state_name, entry.id]));

        const cityDataSet = new Map(cityData.map((entry) => [entry.city_name, entry.id]));

        // Step 9: Filter out existing leads
        const whatsappEmailSendTeamPersonList = [];
        const filteredContactBody = await Promise.all(contactBody
            .filter((entry) => !existingColumn1Set.has(String(entry.column_1).trim()) && !contactMobileNumberSet.has(String(entry.mobile_number).trim()))
            .map(async (entry) => {
                const { description, ...restEntry } = entry;
                const country = countriesDataSet.get(entry.country?.trim()) || 0;
                const state = statesDataSet.get(entry.state?.trim()) || 0;
                const city = cityDataSet.get(entry.city?.trim()) || 0;
                /* Contact Assignement */
                const contactAssignedIds = await autoAssignmentContactIdsGet(req, {
                    source_type_id: source_type_id,
                    country_id: country,
                    state_id: state,
                    city_id: city,
                    area_id: null,
                    description: description
                });
                const contactAssignedIdsStr = isValid(contactAssignedIds?.data?.assignedIds) ? contactAssignedIds?.data?.assignedIds?.join(",") : "";

                if (contactAssignedIds?.data?.isWhatsappEmailSendEnabled && (contactAssignedIds?.data?.assignedIds?.length == 1 || isValid(contactAssignedIds?.data?.template_id))) {
                    whatsappEmailSendTeamPersonList.push(
                        {
                            team_id: contactAssignedIdsStr,
                            send_message: contactAssignedIds?.data?.send_description,
                            template_id: contactAssignedIds?.data?.template_id
                        }
                    )
                }
                /* Contact Assignement */
                return {
                    ...restEntry,
                    country,
                    state,
                    city,
                    assinged_to_work_a_application_id: contactAssignedIdsStr || findIndiaMartApiKey.dataValues.a_application_login_id,
                }
            }));
        const filteredInquiryBody = contactBody.filter((entry) => !existingColumn1Set.has(String(entry.column_1).trim()))

        // 10: Check user limits plan wise
        const userList = await CTContactModel.findAll({
            where: {
                company_masters_id: findCompanyId.company_masters_id,
                isDelete: 0,
            },
            attributes: ["company_masters_id", "a_application_login_id"],
        });
        const userRightsList = await applicationLoginTypeRightModelIntance.findAll({
            where: {
                company_masters_id: findCompanyId.company_masters_id,
                page_id: 1,
                isDelete: 0,
            },
            attributes: ["a_application_login_id", "a_page_id_rights_jason"],
        });
        const userCount = userList.length;

        for (const userRight of userRightsList) {
            try {
                const rightsJson = JSON.parse(
                    userRight.dataValues.a_page_id_rights_jason
                );
                if (typeof rightsJson.limit === "number" && rightsJson.limit > 0) {
                    const totalAfterImport = userCount + filteredContactBody.length;
                    if (totalAfterImport > rightsJson.limit) {
                        return resError({
                            ack_msg: `Limit ${rightsJson.limit} reached for Company. Current: ${userCount}, Trying to add: ${filteredContactBody.length}`,
                            developer_msg: `Limit ${rightsJson.limit} reached for Company. Current: ${userCount}, Trying to add: ${filteredContactBody.length}`,
                        });
                    }
                }
            } catch (err) {
                console.error(
                    "Error parsing JSON for a_application_login_id:",
                    userRight.a_application_login_id,
                    err
                );
            }
        }

        //  11: Insert new leads and prepare response
        if (filteredContactBody.length > 0) {
            const result = await CTContactModel.bulkCreate(filteredContactBody);

            const contactEmailSendList = [];
            const contactWhatsappSendList = [];
            await Promise.all(
                result.map((v) => {
                    insertStagesAndStatusLogs(req, {
                        reference_table: "contact_masters",
                        reference_id: v.id,
                        status_id: "-1",
                        a_application_login_id: findIndiaMartApiKey.dataValues.a_application_login_id
                    })
                    if (isValid(whatsappEmailSendTeamPersonList) && isValid(v.email_id)) {
                        const result = whatsappEmailSendTeamPersonList.find(item => item.team_id == v.assinged_to_work_a_application_id);
                        if (result) {
                            contactEmailSendList.push({
                                email_id: v.email_id,
                                contact_detail: {
                                    person_name: v.person_name,
                                    mobile_number: v.mobile_number,
                                    company_name: v.company_name
                                },
                                team_person: v.assinged_to_work_a_application_id,
                                company_name: a_company_name,
                                a_company_id: a_company_id,
                                send_message: result?.send_message,
                            });
                        }
                    }
                    if (isValid(whatsappEmailSendTeamPersonList) && isValid(v.mobile_number)) {
                        const result = whatsappEmailSendTeamPersonList.find(item => item.team_id == v.assinged_to_work_a_application_id);
                        if (result) {
                            contactWhatsappSendList.push({
                                whatsapp_number: v.mobile_number,
                                contact_detail: {
                                    person_name: v.person_name,
                                    mobile_number: v.mobile_number,
                                    company_name: v.company_name,
                                    customer_id: v.id
                                },
                                team_person: v.assinged_to_work_a_application_id,
                                company_name: a_company_name,
                                a_company_id: a_company_id,
                                send_message: result?.send_message,
                                template_id: result?.template_id,
                            });
                        }
                    }
                })
            );
            await prepareMailAndWhatsappSenderToTheContact(req, { contactWhatsappSendList, contactEmailSendList });
        }

        //  12: Insert inquiries
        if (filteredInquiryBody.length > 0) {

            /* collect contact id */
            const mobile_number = filteredInquiryBody.map(e => e.mobile_number);
            const contactCollectedIds = await CTContactModel.findAll({
                where: {
                    isDelete: '0',
                    mobile_number: mobile_number
                },
                attributes: ["id", "mobile_number"],

            });

            const contactCollectedIdsSet = new Map(contactCollectedIds.map((entry) => [String(entry.mobile_number).trim(), entry.id]));
            /* collect contact id */

            const insertInquiry = filteredInquiryBody
                .filter((cm) =>
                    responseBody.some((a) => a.UNIQUE_QUERY_ID === cm.column_1)
                )
                .map((cm) => {
                    const matchedEntry = responseBody.find(
                        (a) => a.UNIQUE_QUERY_ID === cm.column_1
                    );
                    const categoryId = existingCategoryMap.get(
                        matchedEntry.QUERY_MCAT_NAME
                    );
                    const productId = existingProductMap.get(
                        matchedEntry.QUERY_PRODUCT_NAME
                    );
                    const contact_id = contactCollectedIdsSet.get(String(cm.mobile_number)?.trim());
                    return {
                        contact_master_id: contact_id,
                        product_id: productId || -1,
                        category_id: categoryId || -1,
                        description: matchedEntry.QUERY_MESSAGE,
                        inquiry_date_time: matchedEntry.QUERY_TIME,
                        a_application_login_id: findIndiaMartApiKey.dataValues.a_application_login_id,
                        company_masters_id: findCompanyId.company_masters_id,
                        source_type_id: req.body.source_type_id,
                    };
                });
            if (insertInquiry.length > 0) {
                const createdInq = await CTInquiryModel.bulkCreate(insertInquiry);
                await Promise.all(
                    createdInq.map((v) =>
                        /* Status Log Entry Added BY Dinesh -> 20-11-2025 */
                        insertStagesAndStatusLogs(req, {
                            reference_table: "inquiries",
                            reference_id: v.id,
                            status_id: "-2",
                            a_application_login_id: findIndiaMartApiKey.dataValues.a_application_login_id
                        })
                        /* Status Log Entry Added BY Dinesh -> 20-11-2025 */
                    )
                );

                /* notification code */
                try {
                    const ownerTokenData = await companyVsApplicationLoginModel.findAll({
                        where: {
                            isDelete: 0,
                            company_masters_id: findCompanyId.company_masters_id,
                            company_flag: 1,
                        },
                        attributes: ["a_application_login_id"],
                    });

                    const allLoginIds = ownerTokenData
                        .map((item) => item.a_application_login_id)
                        .filter((id) => id !== findIndiaMartApiKey.dataValues.a_application_login_id);

                    const ownerTokens =
                        allLoginIds.length > 0
                            ? await loginModel.findAll({
                                where: { id: allLoginIds, isDelete: 0 },
                                attributes: [
                                    "android_refresh_token",
                                    "web_refresh_token",
                                    "ios_refresh_token",
                                ],
                            })
                            : [];

                    const allTokens = ownerTokens
                        .flatMap((tokenObj) => [
                            tokenObj.android_refresh_token,
                            tokenObj.web_refresh_token,
                            tokenObj.ios_refresh_token,
                        ])
                        .filter((token) => token && token.trim() !== "");

                    const uniqueTokens = [...new Set(allTokens)];

                    if (uniqueTokens.length > 0) {
                        const notificationBody = `Added ${insertInquiry.length} new ${insertInquiry.length === 1 ? "inquiry" : "inquiries"
                            } from IndiaMart.`;
                        await sendMultipleNotification({
                            deviceTokens: uniqueTokens,
                            title: `New IndiaMart Inquiries Added`,
                            body: notificationBody,
                        });
                        console.log(
                            "Notifications sent to",
                            uniqueTokens.length,
                            "devices"
                        );
                    } else {
                        console.log("No device tokens found for notification.");
                    }
                } catch (notificationError) {
                    console.error(
                        "Notification failed (non-critical):",
                        notificationError.message
                    );
                }
                /* notification code */
            }

            //  13: Insert message history
            const msgDateTime = new Date();
            const msgDateTimeFormattedDate = moment(msgDateTime).format(
                "YYYY-MM-DD HH:mm:ss"
            );

            // Collect contact_masters_id values during mapping
            const messageMatches = filteredInquiryBody
                .filter((cm) =>
                    responseBody.some((a) => a.UNIQUE_QUERY_ID === cm.column_1)
                )
                .map((cm) => {
                    const matchedEntry = responseBody.find(
                        (a) => a.UNIQUE_QUERY_ID === cm.column_1
                    );
                    const contact_id = contactCollectedIdsSet.get(cm.mobile_number);
                    return {
                        contact_masters_id: contact_id,
                        a_application_login_id: findIndiaMartApiKey.dataValues.a_application_login_id,
                        company_masters_id: findCompanyId.company_masters_id,
                        description: `
                            <strong>Name : </strong>${matchedEntry.SENDER_NAME}<br>
                            <strong>Mobile No. :</strong> ${matchedEntry.SENDER_MOBILE}<br>
                            <strong>Mobile Alt : </strong>${matchedEntry.SENDER_MOBILE_ALT}<br>
                            <strong>Phone No : </strong>${matchedEntry.SENDER_PHONE}<br>
                            <strong>Phone No Alt : </strong>${matchedEntry.SENDER_PHONE_ALT}<br>
                            <strong>Call Duration : </strong>${matchedEntry.CALL_DURATION}<br>
                            <strong>Email ID : </strong>${matchedEntry.SENDER_EMAIL}<br>
                            <strong>Email ID Alt : </strong>${matchedEntry.SENDER_EMAIL_ALT}<br>
                            <strong>Source : </strong>IndiaMart<br>
                            <strong>Date : </strong>${matchedEntry.QUERY_TIME}<br>
                            <strong>Address : </strong>${matchedEntry.SENDER_ADDRESS}<br>
                            <strong>Country : </strong>${matchedEntry.SENDER_COUNTRY_ISO}<br>
                            <strong>State : </strong>${matchedEntry.SENDER_STATE}<br>
                            <strong>City : </strong>${matchedEntry.SENDER_CITY}<br>
                            <strong>Pincode : </strong>${matchedEntry.SENDER_PINCODE}<br>
                            <strong>Product Name : </strong>${matchedEntry.QUERY_PRODUCT_NAME}<br>
                            <strong>Category Name : </strong>${matchedEntry.QUERY_MCAT_NAME}<br>
                            <strong>Subject : </strong>${matchedEntry.SUBJECT}<br>
                            <strong>Description : </strong>${matchedEntry.QUERY_MESSAGE}
                        `,
                        created_date_time: matchedEntry.QUERY_TIME || msgDateTimeFormattedDate,
                        message_side: "2",
                        message_type_id: "0",
                    };
                });

            const contactIds = messageMatches.map(
                (match) => match.contact_masters_id
            );

            await CTContactMessageHistoryModel.bulkCreate(messageMatches);

            const ContactMaster = contactModel(req.tenantDB);
            if (contactIds.length > 0) {
                await ContactMaster.update(
                    {
                        is_read_by_a_application_login_id: '',
                    },
                    {
                        where: {
                            id: contactIds,
                        },
                    }
                );
            }
        }

        //  14: Return success response
        return resSuccess({
            ack_msg: filteredContactBody.length > 0 ? "New leads added successfully" : "No new leads found",
            data: null
        });
    } catch (error) {
        console.error("Error in addContactByIndiaMartPushApi:", error);
        return resBadRequest(res, {
            ack_msg: "Something went wrong",
            developer_msg: `Error: ${error.message}`,
        });
    }
};