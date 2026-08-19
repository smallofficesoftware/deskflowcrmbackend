import moment from "moment";
import miracleConfigModel from "../models/company_setup/miracleConfigModel.js";
import { createAxiosIntance } from "../utils/miracleAxiosInstance.js";

let tokenRefreshPromiseMap = new Map(); // per company lock

const BUFFER_MINUTES = 2; // 🔥 refresh before expiry
const TOKEN_VALIDITY_MINUTES = 20;

export const getValidAccessToken = async ({
    company_id,
    access_token,
    auth_date_time,
    baseurl,
    client_id,
    api_key,
    urlKey
}, forceRefresh = false) => {

    const isExpired =
        forceRefresh ||
        !access_token ||
        isTimeExceeded(auth_date_time, TOKEN_VALIDITY_MINUTES - BUFFER_MINUTES);

    if (!isExpired) return access_token;

    //  prevent multiple refresh per company
    if (tokenRefreshPromiseMap.has(company_id)) {
        return await tokenRefreshPromiseMap.get(company_id);
    }

    const refreshPromise = (async () => {
        try {
            const response = await generateAccessToken({
                baseurl,
                clientId: client_id,
                apiKey: api_key,
                urlKey
            });

            const token = response?.DataModel?.token;

            if (!token) {
                throw new Error("Token not received");
            }

            const now = moment().format("YYYY-MM-DD HH:mm:ss");

            await miracleConfigModel.update(
                {
                    access_token: token,
                    auth_date_time: now
                },
                {
                    where: { company_id }
                }
            );

            return token;

        } finally {
            tokenRefreshPromiseMap.delete(company_id);
        }
    })();

    tokenRefreshPromiseMap.set(company_id, refreshPromise);

    return await refreshPromise;
};


// Expiry checker with buffer
function isTimeExceeded(inputDateTime, minutes) {
    const now = moment();
    const givenTime = moment(inputDateTime, 'YYYY-MM-DD HH:mm:ss', true);

    if (!givenTime.isValid()) {
        return true;
    }

    return now.isAfter(givenTime.add(minutes, 'minutes'));
}


// Generate token API
export async function generateAccessToken({ baseurl, clientId, apiKey, urlKey }) {
    const api = createAxiosIntance({
        baseURL: baseurl,
        clientId,
        apiKey
    });

    const response = await api.post(`CLAuth/Authenticate?urlKey=${urlKey}`);

    return response.data;
}