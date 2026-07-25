import axios from 'axios';
import moment from 'moment';
import { getAccount, getJson } from 'serpapi';
import { contactMessageHistory } from '../../models/activities/contactMessageHistoryModel.js';
import { contactModel } from '../../models/activities/contactModel.js';
import companyModel from '../../models/company_setup/companyModel.js';
import {
    isValid,
    normalizeToTenDigit,
    resBadRequest,
    resError,
    resSuccess
} from "../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from '../commonServices.js';
import { autoAssignmentContactIdsGet, prepareMailAndWhatsappSenderToTheContact } from '../other_settings/wrkflwAutoAssignmentContactService.js';

export const getSerpSearchResultProvider = async (req) => {
    try {
        const { query, a_application_login_id, place } = req.body;

        /* Fetch company detail based on application_id */
        const findCompanyId = await getCompanyByLoginId(a_application_login_id);
        const getCompanyDetail = await companyModel.findOne({
            where: {
                isDelete: 0,
                id: findCompanyId.company_masters_id,
            },
            attributes: ['id', 'serp_api_key'],
            row: true
        })

        const start = req.params.start;
        const device = req.params.device;
        const no_cache = req.params.no_cache;
        const api_key = getCompanyDetail.serp_api_key;

        /* Get SERP account status for API limit check */
        const checkSerpAccountInfo = await getAccount({ api_key: api_key });
        const { total_searches_left } = checkSerpAccountInfo;
        if (total_searches_left <= 0) {
            return resError({
                ack_msg: "Reached Your Limit",
                developer_msg: `Error: ${error.message}`,
                data: error
            });
        }

        /* API configuration and fetch data from SERP API */
        const searchResults = await getJson({
            engine: "google_local",
            q: query,
            location: place,
            device: device || "desktop",//  "desktop" , "tablet" , "mobile"
            no_cache: no_cache || "false",
            google_domain: "google.com",
            gl: "in",
            hl: "en",
            tbs: "rajkot",
            // uule: "rajkot",
            start: String(start),
            api_key: api_key
        });

        return resSuccess({
            ack_msg: "Serp Data Fetched Successfully",
            developer_msg: `Serp Api Run Successfully.`,
            data: searchResults
        });

    } catch (e) {
        return resBadRequest({ developer_msg: `error ${e}` });
    }
};

export const insertGlobalSearchContact = async (req) => {
    try {
        const { a_application_login_id, data, messageList } = req.body;
        const CTContactModel = contactModel(req.tenantDB);
        const CTContactMessageHistoryModel = contactMessageHistory(req.tenantDB);
        const findCompanyId = await getCompanyByLoginId(a_application_login_id);

        const findIndiaMartApiKey = await companyModel.findOne({
            where: {
                id: findCompanyId.company_masters_id,
                isDelete: "0",
            },
            attributes: ["id", "company_name"],
        });
        let a_company_name = findIndiaMartApiKey.dataValues.company_name;
        let a_company_id = findIndiaMartApiKey.dataValues.id;
        const currentDateTime = new Date();
        const formatDateTime = moment(currentDateTime).format("YYYY-MM-DD HH:mm:ss");

        let processedContacts = [];
        const whatsappEmailSendTeamPersonList = [];
        try {
            processedContacts = await Promise.all(
                data.map(async (value) => {
                    const contactAssignedIds = await autoAssignmentContactIdsGet(req, {
                        source_type_id: "-14",
                        country_id: null,
                        state_id: null,
                        city_id: null,
                        area_id: null,
                        description: value?.description,
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

                    return {
                        ...value,
                        mobile_number: normalizeToTenDigit(value.mobile_number),
                        raw_mobile_number: value.mobile_number || "",
                        created_date_time: formatDateTime,
                        a_application_login_id,
                        company_masters_id: findCompanyId.company_masters_id,
                        source_type_id: "-14",
                        assinged_to_work_a_application_id: contactAssignedIdsStr || a_application_login_id
                    };
                })
            );
        } catch (error) {
            console.log("insertGlobalSearchContact loop error", error);
            return resBadRequest({ developer_msg: `error ${error.msg}` });
        }


        if (isValid(processedContacts)) {

            /* check duplication in by self array object */
            const seenMobiles = new Set();
            const seenCoords = new Set();

            const nonDuplicateValuesLevalOne = processedContacts.filter(e => {
                const mobileKey = e.mobile_number || 'null_' + Math.random();
                const coordKey = `${Number(e.latitude).toFixed(6)},${Number(e.longitude).toFixed(6)}`;

                if (!e.mobile_number || e.mobile_number.trim() === '') {
                    return false;
                }

                if (seenMobiles.has(mobileKey) || seenCoords.has(coordKey)) {
                    return false;
                }

                seenMobiles.add(mobileKey);
                seenCoords.add(coordKey);
                return true;
            });

            /* check duplication on contact existing data */
            const existingEntries = await CTContactModel.findAll({
                where: { isDelete: 0 },
                attributes: ["latitude", "longitude", "mobile_number"],
            });

            // const existinglatitudeSet = new Set(existingEntries.map((entry) => String(entry.latitude).trim()));
            // const existinglongitudeSet = new Set(existingEntries.map((entry) => String(entry.longitude).trim()));
            const contactMobileNumberSet = new Set(existingEntries.map((entry) => String(entry.mobile_number).trim()));
            const nonDuplicateValuesLevalTwo = nonDuplicateValuesLevalOne.filter((entry) => {
                // const checkLattitude = String(entry.latitude).trim();
                // const checkLogitude = String(entry.longitude).trim();
                const checkMobile = String(entry.mobile_number).trim();

                if (!isValid(checkMobile)) {
                    return false;
                }

                if (contactMobileNumberSet.has(checkMobile)) {
                    return false;
                }

                // if (!isValid(checkLogitude) && !isValid(checkLattitude)) {
                //     return false;
                // }

                // if (existinglongitudeSet.has(checkLogitude) && existinglatitudeSet.has(checkLattitude)) {
                //     return false;
                // }
                return true;

            })

            const createdContacts = await CTContactModel.bulkCreate(nonDuplicateValuesLevalTwo);
            if (createdContacts.length > 1) {
                const contactEmailSendList = [];
                const contactWhatsappSendList = [];
                await Promise.all(
                    createdContacts.map((v) => {
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
                )
                await prepareMailAndWhatsappSenderToTheContact(req, { contactWhatsappSendList, contactEmailSendList });

                /* collect contact id */
                const mobile_number = messageList.map(e => normalizeToTenDigit(e.mobile_number));
                const contactCollectedIds = await CTContactModel.findAll({
                    where: {
                        isDelete: '0',
                        mobile_number: mobile_number
                    },
                    attributes: ["id", "mobile_number"]
                });

                const contactCollectedIdsSet = new Map(contactCollectedIds.map((entry) => [String(entry.mobile_number).trim(), entry.id]));

                const insertMessages = messageList.map((cm) => {
                    const contact_id = contactCollectedIdsSet.get(normalizeToTenDigit(cm.mobile_number));
                    return {
                        contact_masters_id: contact_id,
                        a_application_login_id: a_application_login_id,
                        company_masters_id: findCompanyId.company_masters_id,
                        description: cm.description,
                        created_date_time: formatDateTime,
                        message_side: "2",
                        message_type_id: "0",
                    };
                });
                await CTContactMessageHistoryModel.bulkCreate(insertMessages);
            }
            return resSuccess({
                ack_msg: `${createdContacts.length} contact added successfully.`,
            });
        } else {
            return resError({
                ack_msg: "No data found to be added in contact.",
                developer_msg: "not valid data or no data found.",
            });
        }
    } catch (error) {
        console.log("insertGlobalSearchContact", error);
        return resBadRequest({
            ack_msg: " ",
            developer_msg: `${error.message}`,
        });
    }
};

export const getSerpAccountDetailData = async (req, res) => {
    try {
        const a_application_login_id = req.params.a_application_login_id;
        const findCompanyId = await getCompanyByLoginId(a_application_login_id);
        const getCompanyDetail = await companyModel.findOne({
            where: {
                isDelete: 0,
                id: findCompanyId.company_masters_id,
            },
            attributes: ['id', 'serp_api_key'],
            row: true
        })

        /* Get SERP account status for API limit check */
        const api_key = getCompanyDetail.serp_api_key;
        const checkSerpAccountInfo = await getAccount({ api_key: api_key });
        const { total_searches_left, searches_per_month } = checkSerpAccountInfo;
        return resSuccess({
            data: { total_searches_left, searches_per_month }
        });
    } catch (error) {
        return resBadRequest({ developer_msg: `error ${error}` });
    }
};

export const getSerpCountriesData = async (req, res) => {
    try {
        const q = req.params.query;
        const response = await axios.get(`https://serpapi.com/locations.json?q=${q}&limit=10`);
        const responseBody = response.data;
        return resSuccess({
            data: responseBody
        });
    } catch (error) {
        console.log(`getSerpCountriesData error ${error}`)
        return resBadRequest({ developer_msg: `getSerpCountriesData error ${error}` });
    }
};