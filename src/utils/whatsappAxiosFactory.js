import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import { decryptText, encryptText } from './encryption.js';

export const createWhatsAppAxios = ({
    baseURL,
    encryptEnabled = false,
}) => {
    const instance = axios.create({
        baseURL,
        timeout: 180000,
        headers: { "Content-Type": "application/json" },
    });

    instance.interceptors.request.use((config) => {
        if (!encryptEnabled) return config;

        if (
            config.headers["Content-Type"] === "multipart/form-data" &&
            config.data
        ) {
            const form = new FormData();

            for (const key in config.data) {
                const value = config.data[key];

                if (value instanceof fs.ReadStream) {
                    form.append(key, value);
                } else {
                    const val =
                        typeof value === "object"
                            ? JSON.stringify(value)
                            : String(value);
                    form.append(key, encryptText(val));
                }
            }

            config.data = form;
            config.headers = { ...config.headers, ...form.getHeaders() };
        } else if (config.data) {
            const encrypted = encryptText(JSON.stringify(config.data));
            config.data = { payload: encrypted };
        }

        return config;
    });

    instance.interceptors.response.use((response) => {
        if (!encryptEnabled) return response;

        if (response.data?.payload) {
            const decrypted = decryptText(response.data.payload);

            try {
                response.data = JSON.parse(decrypted);
            } catch {
                response.data = decrypted;
            }
        }

        return response;
    });

    return instance;
};