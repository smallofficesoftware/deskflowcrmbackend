import axios from "axios";
import moment from "moment";
import { Op } from "sequelize";
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
import {
    generateNumber,
    isJSON,
    isValid,
    normalizeToTenDigit,
    resBadRequest,
    resError,
    resSuccess
} from "../../utils/sharedFunctions.js";
import { getCompanyByLoginId, insertStagesAndStatusLogs } from "../commonServices.js";
import { autoAssignmentContactIdsGet, prepareMailAndWhatsappSenderToTheContact } from "../other_settings/wrkflwAutoAssignmentContactService.js";

export const addContactFromTradeIndia = async (req) => {
    try {
        const { date } = req.body;

        //1. companyId Fatch
        const findCompanyId = await getCompanyByLoginId(
            req.body.a_application_login_id
        );

        let a_company_name;
        let a_company_id;

        // 2. Fetch TradeIndia API key
        const findTradeIndiaApiKey = await companyModel.findOne({
            where: {
                id: findCompanyId.company_masters_id,
                isDelete: "0",
            },
            attributes: ["id", "trade_india_user_id", "trade_india_profile_id", "trade_india_key"],
        });

        // 2. Fetch TradeIndia Config Detail
        const userid = findTradeIndiaApiKey.dataValues.trade_india_user_id;
        const profile_id = findTradeIndiaApiKey.dataValues.trade_india_profile_id;
        const key = findTradeIndiaApiKey.dataValues.trade_india_key;
        a_company_name = findTradeIndiaApiKey.dataValues.company_name;
        a_company_id = findTradeIndiaApiKey.dataValues.id;

        if (!userid || !profile_id || !key) {
            return resError({
                ack_msg: "Trade India Config Detail not found",
                developer_msg: `No API key found for company ID`,
            });
        }

        // 3:  check tradeIndia date and check formate
        const tradeIndiaDate = moment(new Date()).format("YYYY-MM-DD").toUpperCase();
        const tradeIndiaStartTime = isValid(date) ? date : tradeIndiaDate;
        const tradeIndiaEndTime = isValid(date) ? date : tradeIndiaDate;
        const source_type_id = "-13";

        //  4: Call trade india API
        let response;
        try {
            response = await axios.get(`https://www.tradeindia.com/utils/my_inquiry.html?userid=${userid}&profile_id=${profile_id}&key=${key}&from_date=${tradeIndiaStartTime}&to_date=${tradeIndiaEndTime}`);

            console.log("sfsdfssdfsd", response);
        } catch (error) {
            if (error.response) {
                return resError({
                    ack_msg: error.response.data?.message ||
                        error.response.data?.error ||
                        "External API request failed",
                    developer_msg: `TradeIndia API returned HTTP status ${response.status}`,
                    data: error.response.data
                });
            }

            // Request sent but no response
            if (error.request) {
                return resError({
                    ack_msg: "No response from external service",
                    developer_msg: `TradeIndia API returned HTTP status ${response.status}`,
                });
            }

            // Axios config / timeout / misc
            return resError({
                ack_msg: error.message,
                developer_msg: `TradeIndia API returned HTTP status ${response.status}`,
            });
        }



        if (response?.status !== 200) {
            return resError({
                ack_msg: `TradeIndia API request failed ${response.status}`,
                developer_msg: `TradeIndia API returned HTTP status ${response.status}`,
                data: response.data
            });
        }

        const responseBody = response.data;

        if (!isValid(responseBody)) {
            return resError({
                ack_msg: "Invalid trade india response",
                developer_msg: "trade india API returned invalid or empty response",
                data: response?.data
            });
        }

        if (!isJSON(responseBody)) {
            return resError({
                ack_msg: responseBody,
                developer_msg: responseBody,
                data: responseBody
            });
        }

        // 5: Remove duplicate Data
        const seen = new Set();
        const CTContactModel = contactModel(req.tenantDB);
        const contact_id_last = await CTContactModel.findOne({ where: { isDelete: 0 }, order: [['id', 'DESC']] });
        const contactBody = (responseBody ?? [])
            .filter((entry) => {
                if (seen.has(entry.rfi_id)) {
                    console.log(
                        `Skipping duplicate entry with rfi_id: ${entry.rfi_id}`
                    );
                    return false;
                }
                seen.add(entry.rfi_id);
                return true;
            })

            .map((entry, i) => ({
                column_3: entry.rfi_id,
                person_name: entry.sender_name || "Unkown",
                company_name: entry.sender_co,
                email_id: entry.sender_email,
                mobile_number: entry.sender_mobile ? normalizeToTenDigit(entry.sender_mobile) : generateNumber(1234567890, contact_id_last.id + (i + 1)),
                raw_mobile_number: entry.sender_mobile || "",
                country: entry.sender_country,
                state: entry.sender_state,
                city: entry.sender_city,
                address: `${entry.sender_city}, ${entry.sender_state}, ${entry.sender_country}`,
                pincode: "",
                created_date_time: entry?.generated_date && entry?.generated_time
                    ? moment(`${entry.generated_date} ${entry.generated_time}`, "D MMMM YYYY HH:mm:ss").format("YYYY-MM-DD HH:mm:ss")
                    : moment().format("YYYY-MM-DD HH:mm:ss"),
                a_application_login_id: req.body.a_application_login_id,
                company_masters_id: findCompanyId.company_masters_id,
                source_type_id: source_type_id,
                description: `${entry?.message} ${entry?.subject} ${entry?.product_name}`,
            }));

        if (!isValid(contactBody)) {
            return resError({
                ack_msg: "Invalid trade india contact detail not found",
                developer_msg: "trade india API returned invalid or empty response",
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
            attributes: ["column_3", "mobile_number"],
        });

        const existingEntriesInquiry = await CTInquiryModel.findAll({
            where: { uniqe_trade_india_id: { [Op.ne]: '' } },
            attributes: ["uniqe_trade_india_id"],
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

        const existingColumn3Set = new Set(existingEntries.map((entry) => String(entry.column_3).trim()));

        const existingEntriesInquiryMap = new Set(existingEntriesInquiry.map((entry) => String(entry.uniqe_trade_india_id).trim()));

        const contactMobileNumberSet = new Set(existingEntries.map((entry) => String(entry.mobile_number).trim()));

        const countriesDataSet = new Map(countriesData.map((entry) => [entry.country_name, entry.id]));

        const statesDataSet = new Map(statesData.map((entry) => [entry.state_name, entry.id]));

        const cityDataSet = new Map(cityData.map((entry) => [entry.city_name, entry.id]));

        // Step 9: Filter out existing leads (duplication or rfi_id, mobile_number) and add extra columns 
        const whatsappEmailSendTeamPersonList = [];
        const filteredContactBody = await Promise.all(
            contactBody
                .filter((entry) => !existingColumn3Set.has(String(entry.column_3).trim()) && !contactMobileNumberSet.has(String(entry.mobile_number).trim()))
                .map(async (entry) => {
                    const { description, ...restEntry } = entry;
                    const country = countriesDataSet.get(entry.country?.trim()) || "";
                    const state = statesDataSet.get(entry.state?.trim()) || "";
                    const city = cityDataSet.get(entry.city?.trim()) || "";
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
                        assinged_to_work_a_application_id: contactAssignedIdsStr || req.body.a_application_login_id,
                    }
                })
        );

        const filteredInquiryBody = contactBody.filter((entry) => !existingEntriesInquiryMap.has(String(entry.column_3).trim()))

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

        let dataFind = [];
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
                        a_application_login_id: req.body.a_application_login_id
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
                }
                )
            );
            console.log("Error Log 2", contactWhatsappSendList);
            console.log("Error Log 3", contactEmailSendList);
            await prepareMailAndWhatsappSenderToTheContact(req, { contactWhatsappSendList, contactEmailSendList });
        }

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
                .map((cm) => {
                    const matchedEntry = responseBody.find(
                        (a) => a.rfi_id === cm.column_3
                    );

                    const productId = existingProductMap.get(
                        matchedEntry.product_name
                    );

                    const contact_id = contactCollectedIdsSet.get(String(cm.mobile_number)?.trim());
                    return {
                        contact_master_id: contact_id,
                        product_id: productId || -1,
                        category_id: -1,
                        description: matchedEntry.message,
                        inquiry_date_time: moment(matchedEntry.generated_date + ' ' + matchedEntry.generated_time).format("YYYY-MM-DD HH:mm:ss"),
                        a_application_login_id: req.body.a_application_login_id,
                        company_masters_id: findCompanyId.company_masters_id,
                        source_type_id: source_type_id,
                        uniqe_trade_india_id: cm.column_3,
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
                            a_application_login_id: req.body.a_application_login_id
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
                            } from Trade India.`;
                        await sendMultipleNotification({
                            deviceTokens: uniqueTokens,
                            title: `New Trade India Inquiries Added`,
                            body: notificationBody,
                        });
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

            const msgDateTime = new Date();
            const msgDateTimeFormattedDate = moment(msgDateTime).format(
                "YYYY-MM-DD HH:mm:ss"
            );

            const insertMessages = filteredInquiryBody
                .map((cm) => {
                    const matchedEntry = responseBody.find(
                        (a) => a.rfi_id === cm.column_3
                    );
                    const contact_id = contactCollectedIdsSet.get(cm.mobile_number);
                    return {
                        contact_masters_id: contact_id,
                        a_application_login_id: req.body.a_application_login_id,
                        company_masters_id: findCompanyId.company_masters_id,
                        description: `
                            <strong>Person Name :</strong> ${matchedEntry.sender_name}<br>
                            <strong>Company Name :</strong> ${matchedEntry.sender_co}<br>
                            <strong>Mobile No. :</strong> ${normalizeToTenDigit(matchedEntry.sender_mobile)}<br>
                            <strong>Other Mobile No. :</strong> ${matchedEntry?.sender_other_mobiles || ""}<br>
                            <strong>Email ID. :</strong> ${matchedEntry?.sender_email || ""}<br>
                            <strong>Address : </strong>${cm.address || ""}<br>
                            <strong>Date : </strong>${matchedEntry.generated_date} ${matchedEntry.generated_time}<br>
                            <strong>Source : </strong>Trade India<br>
                            <strong>Source in Trade India: </strong>${matchedEntry.source || ""}<br>
                            <strong>Inquiry Type : </strong>${matchedEntry.inquiry_type || ""}<br>
                            <strong>Ago time : </strong>${matchedEntry.ago_time || ""}<br>
                            <strong>Month-Slot : </strong>${matchedEntry.month_slot || ""}<br>
                            <strong>Product Name : </strong>${matchedEntry.product_name || ""}<br>
                            <strong>Product Source : </strong>${matchedEntry.product_source || ""}<br>
                            <strong>Subject : </strong>${matchedEntry.subject || ""}<br>
                            <strong>Description : </strong>${matchedEntry.message}
                        `,
                        created_date_time: moment(matchedEntry.generated_date + ' ' + matchedEntry.generated_time).format("YYYY-MM-DD HH:mm:ss") || msgDateTimeFormattedDate,
                        message_side: "2",
                        message_type_id: "0",
                    };
                });

            await CTContactMessageHistoryModel.bulkCreate(insertMessages);

            /* Unread Contact */
            const contactIds = insertMessages.map((match) => match.contact_masters_id);
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
            /* Unread Contact */
        }

        return resSuccess({
            ack_msg: filteredContactBody.length > 0 ? "New leads added successfully" : "No new leads found",
        });
    } catch (error) {
        console.error("Error in addContactFromTradeIndia:", error);
        return resBadRequest({
            ack_msg: "Something went wrong",
            developer_msg: `Error: ${error.message}`,
        });
    }
};
export const addContactFromTradeIndiaBuyLeads = async (req) => {
    try {
        const { date } = req.body;
        //1. companyId Fatch
        const findCompanyId = await getCompanyByLoginId(
            req.body.a_application_login_id
        );
        let a_company_name;
        let a_company_id;
        const source_type_id = "-13";
        // 2. Fetch TradeIndia API key
        const findTradeIndiaApiKey = await companyModel.findOne({
            where: {
                id: findCompanyId.company_masters_id,
                isDelete: "0",
            },
            attributes: ["id", "trade_india_user_id", "trade_india_profile_id", "trade_india_key"],
        });

        // 2. Fetch TradeIndia Config Detail
        const userid = findTradeIndiaApiKey.dataValues.trade_india_user_id;
        const profile_id = findTradeIndiaApiKey.dataValues.trade_india_profile_id;
        const key = findTradeIndiaApiKey.dataValues.trade_india_key;
        a_company_name = findTradeIndiaApiKey.dataValues.company_name;
        a_company_id = findTradeIndiaApiKey.dataValues.id;

        if (!userid || !profile_id || !key) {
            return resError({
                ack_msg: "Trade India Config Detail not found",
                developer_msg: `No API key found for company ID`,
            });
        }

        // 3:  check tradeIndia date and check formate
        const tradeIndiaDate = moment(new Date()).format("YYYY-MM-DD").toUpperCase();
        const tradeIndiaStartTime = isValid(date) ? date : tradeIndiaDate;
        const tradeIndiaEndTime = isValid(date) ? date : tradeIndiaDate;

        //  4: Call trade india API
        let response;

        try {
            response = await axios.get(`https://www.tradeindia.com/utils/my_buy_leads.html?userid=${userid}&profile_id=${profile_id}&key=${key}&from_date=${tradeIndiaStartTime}&to_date=${tradeIndiaEndTime}`);
        } catch (error) {
            if (error.response) {
                return resError({
                    ack_msg: error.response.data?.message ||
                        error.response.data?.error ||
                        "External API request failed",
                    developer_msg: `TradeIndia Buy Leads API returned HTTP status ${response.status}`,
                    data: error.response.data
                });
            }

            // Request sent but no response
            if (error.request) {
                return resError({
                    ack_msg: "No response from external service",
                    developer_msg: `TradeIndia Buy Leads API returned HTTP status ${response.status}`,
                });
            }

            // Axios config / timeout / misc
            return resError({
                ack_msg: error.message,
                developer_msg: `TradeIndia Buy Leads API returned HTTP status ${response.status}`,
            });

        }


        if (response?.status !== 200) {
            return resError({
                ack_msg: `TradeIndia Buy Leads API request failed ${response.status}`,
                developer_msg: `TradeIndia Buy Leads API returned HTTP status ${response.status}`,
                data: response.data
            });
        }

        const responseBody = response.data;

        if (!isValid(responseBody)) {
            return resError({
                ack_msg: "Invalid trade india Buy Leads response",
                developer_msg: "trade india API returned invalid or empty response",
                data: response.data
            });
        }

        if (!isJSON(responseBody)) {
            return resError({
                ack_msg: responseBody,
                developer_msg: responseBody,
                data: responseBody
            });
        }

        // 5: Remove duplicate Data
        const seen = new Set();
        const CTContactModel = contactModel(req.tenantDB);
        const contact_id_last = await CTContactModel.findOne({ where: { isDelete: 0 }, order: [['id', 'DESC']] });
        const contactBody = (responseBody ?? [])
            .filter((entry) => {
                if (seen.has(entry.lead_id)) {
                    console.log(
                        `Skipping duplicate entry with lead_id: ${entry.lead_id}`
                    );
                    return false;
                }
                seen.add(entry.lead_id);
                return true;
            })
            .map((entry, i) => ({
                column_4: entry.lead_id,
                person_name: entry.contact_details.user_name || "Unkown",
                company_name: entry?.co_name,
                email_id: entry?.contact_details?.contact_email,
                mobile_number: entry.contact_details.contact_number ? normalizeToTenDigit(entry.contact_details.contact_number) : generateNumber(1234567890, contact_id_last.id + (i + 1)),
                raw_mobile_number: entry.contact_details.contact_number || "",
                country: entry?.country,
                state: entry?.state,
                city: entry?.city,
                address: `${entry?.city}, ${entry?.state}, ${entry?.country}`,
                pincode: entry?.contact_details?.pincode ?? "",
                created_date_time: entry?.posted_on
                    ? moment(entry.posted_on, ["D MMMM YYYY", "DD MMMM YYYY", "YYYY-MM-DD", "YYYY-MM-DD HH:mm:ss"], true)
                        .format("YYYY-MM-DD HH:mm:ss")
                    : moment().format("YYYY-MM-DD HH:mm:ss"),
                a_application_login_id: req.body.a_application_login_id,
                company_masters_id: findCompanyId.company_masters_id,
                source_type_id: source_type_id,
                description: `${entry?.product_name} ${entry?.description}`
            }));

        if (!isValid(contactBody)) {
            return resError({
                ack_msg: "Invalid trade india contact detail not found",
                developer_msg: "trade india API returned invalid or empty response",
                data: response.data
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
            attributes: ["column_4", "mobile_number"],
        });

        const existingEntriesInquiry = await CTInquiryModel.findAll({
            where: { uniqe_trade_india_id: { [Op.ne]: '' } },
            attributes: ["uniqe_trade_india_id"],
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

        const existingColumn3Set = new Set(existingEntries.map((entry) => String(entry.column_4).trim()));

        const contactMobileNumberSet = new Set(existingEntries.map((entry) => String(entry.mobile_number).trim()));

        const existingEntriesInquiryMap = new Set(existingEntriesInquiry.map((entry) => String(entry.uniqe_trade_india_id).trim()));

        const countriesDataSet = new Map(countriesData.map((entry) => [entry.country_name, entry.id]));

        const statesDataSet = new Map(statesData.map((entry) => [entry.state_name, entry.id]));

        const cityDataSet = new Map(cityData.map((entry) => [entry.city_name, entry.id]));

        // Step 9: Filter out existing leads (duplication or lead_id, mobile_number) and add extra columns 
        const whatsappEmailSendTeamPersonList = [];
        const filteredContactBody = await Promise.all(
            contactBody
                .filter((entry) => !existingColumn3Set.has(String(entry.column_4).trim()) && !contactMobileNumberSet.has(String(entry.mobile_number).trim()))
                .map(async (entry) => {
                    const { description, ...restEntry } = entry;
                    const country = countriesDataSet.get(entry?.country?.trim()) || "";
                    const state = statesDataSet.get(entry?.state?.trim()) || "";
                    const city = cityDataSet.get(entry?.city?.trim()) || "";
                    /* Contact Assignement */
                    const contactAssignedIds = await autoAssignmentContactIdsGet(req, {
                        source_type_id: source_type_id,
                        country_id: country,
                        state_id: state,
                        city_id: city,
                        area_id: null,
                        description: description
                    });
                    console.log("Error Log 1", contactAssignedIds);
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
                        assinged_to_work_a_application_id: contactAssignedIdsStr || req.body.a_application_login_id,
                    }
                })
        );


        const filteredInquiryBody = contactBody.filter((entry) => !existingEntriesInquiryMap.has(String(entry.column_4).trim()))

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

        let dataFind = [];
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
                        a_application_login_id: req.body.a_application_login_id
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
                }
                )
            );
            console.log("Error Log 2", contactWhatsappSendList);
            console.log("Error Log 3", contactEmailSendList);
            await prepareMailAndWhatsappSenderToTheContact(req, { contactWhatsappSendList, contactEmailSendList });
        }

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
                .map((cm) => {
                    const matchedEntry = responseBody.find(
                        (a) => a.lead_id === cm.column_4
                    );

                    const productId = existingProductMap.get(
                        matchedEntry?.product_name
                    );

                    const contact_id = contactCollectedIdsSet.get(String(cm.mobile_number)?.trim());
                    return {
                        contact_master_id: contact_id,
                        product_id: productId || -1,
                        category_id: -1,
                        description: matchedEntry.description,
                        inquiry_date_time: moment(matchedEntry.posted_on).format("YYYY-MM-DD HH:mm:ss"),
                        a_application_login_id: req.body.a_application_login_id,
                        company_masters_id: findCompanyId.company_masters_id,
                        source_type_id: source_type_id,
                        uniqe_trade_india_id: cm.column_4,
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
                            a_application_login_id: req.body.a_application_login_id
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
                            } from Trade India.`;
                        await sendMultipleNotification({
                            deviceTokens: uniqueTokens,
                            title: `New Trade India Inquiries Added`,
                            body: notificationBody,
                        });

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

            const msgDateTime = new Date();
            const msgDateTimeFormattedDate = moment(msgDateTime).format(
                "YYYY-MM-DD HH:mm:ss"
            );

            const insertMessages = filteredInquiryBody
                .map((cm) => {
                    const matchedEntry = responseBody.find(
                        (a) => a.lead_id === cm.column_4
                    );
                    const contact_id = contactCollectedIdsSet.get(cm.mobile_number);
                    return {
                        contact_masters_id: contact_id,
                        a_application_login_id: req.body.a_application_login_id,
                        company_masters_id: findCompanyId.company_masters_id,
                        description: `
                            <strong>Person Name :</strong> ${matchedEntry.contact_details.user_name}<br>
                            <strong>Company Name :</strong> ${matchedEntry?.co_name}<br>
                            <strong>Mobile No. :</strong> ${normalizeToTenDigit(matchedEntry?.contact_details?.contact_number)}<br>
                            <strong>Email ID. :</strong> ${matchedEntry?.contact_details?.contact_email || ""}<br>
                            <strong>Address : </strong>${cm?.address || ""}<br>
                            <strong>Date : </strong>${matchedEntry?.posted_on}<br>
                            <strong>Source : </strong>Trade India<br>
                            <strong>Product Name : </strong>${matchedEntry?.product_name || ""}<br>
                            <strong>Product Source : </strong>${matchedEntry?.product_source || ""}<br>
                            <strong>Posted On : </strong>${matchedEntry?.posted_on || ""}<br>
                            <strong>Profile Link : </strong>${matchedEntry?.profile_link || ""}<br>
                            <strong>Lead Type : </strong>${matchedEntry?.lead_type || ""}<br>
                            <strong>Required For : </strong>${matchedEntry?.required_for || ""}<br>
                            <strong>User Desg : </strong>${matchedEntry?.user_desg || ""}<br>
                            <strong>Number Mask : </strong>${matchedEntry?.number_mask || ""}<br>
                            <strong>Country Code : </strong>${matchedEntry?.country_code || ""}<br>
                            <strong>Fax No : </strong>${matchedEntry?.fax_no || ""}<br>
                            <strong>Specification : </strong>${matchedEntry?.specification || ""}<br>
                            <strong>Delivery Loc : </strong>${matchedEntry?.delivery_loc || ""}<br>
                            <strong>Valid From : </strong>${matchedEntry?.valid_from || ""}<br>
                            <strong>Description : </strong>${matchedEntry?.description}
                        `,
                        created_date_time: moment(matchedEntry?.posted_on).format("YYYY-MM-DD HH:mm:ss") || msgDateTimeFormattedDate,
                        message_side: "2",
                        message_type_id: "0",
                    };
                });
            await CTContactMessageHistoryModel.bulkCreate(insertMessages);

            /* Unread Contact */
            const contactIds = insertMessages.map((match) => match.contact_masters_id);
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
            /* Unread Contact */
        }

        return resSuccess({
            ack_msg: filteredContactBody.length > 0 ? "New leads added successfully" : "No new leads found",
        });
    } catch (error) {
        console.error("Error in addContactFromTradeIndia:", error);
        return resBadRequest({
            ack_msg: "Something went wrong",
            developer_msg: `Error: ${error.message}`,
        });
    }
};