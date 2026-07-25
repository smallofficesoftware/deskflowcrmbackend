import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import {
    BACKEND_OF_WPPCONNECT,
    ENCRYPT_WHATSAPP_RESPONSE
} from './appConstants.js';
import { decryptText, encryptText } from './encryption.js';

const axiosInstanceForWhatsApp = axios.create({
    baseURL: `${BACKEND_OF_WPPCONNECT}/api`,
    timeout: 180000,
    headers: { 'Content-Type': 'application/json' },
});

axiosInstanceForWhatsApp.interceptors.request.use(
    async (config) => {
        if (!ENCRYPT_WHATSAPP_RESPONSE) return config;
        if (config.headers['Content-Type'] === 'multipart/form-data' && config.data) {
            const form = new FormData();
            const data = config.data;

            for (const key in data) {
                const value = data[key];
                if (value instanceof fs.ReadStream) {
                    form.append(key, value);
                } else {
                    const valueToEncrypt = typeof value === 'object' ? JSON.stringify(value) : String(value);
                    form.append(key, encryptText(valueToEncrypt));
                }
            }

            config.data = form;
            config.headers = { ...config.headers, ...form.getHeaders() };
        } else if (config.data) {
            const plaintext = JSON.stringify(config.data);
            const encrypted = encryptText(plaintext);
            config.headers['Content-Type'] = 'application/json';
        }

        return config;
    },
    (error) => Promise.reject(error)
);

axiosInstanceForWhatsApp.interceptors.response.use(
    (response) => {
        if (!ENCRYPT_WHATSAPP_RESPONSE) return response;
        if (response.data?.payload) {
            const decrypted = decryptText(response.data.payload);
            try {
                response.data = JSON.parse(decrypted);
            } catch {
                response.data = decrypted;
            }
        }
        return response;
    },
    (error) => Promise.reject(error)
);

export default axiosInstanceForWhatsApp;
