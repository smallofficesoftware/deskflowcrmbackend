import CryptoJS from "crypto-js";
import { ENCRYPT_SMALL_OFFICE_CRM_RESPONSE, ENCRYPTION_SECRET } from "../utils/appConstants.js";
const IS_PRODUCTION = ENCRYPT_SMALL_OFFICE_CRM_RESPONSE;

// const ENCRYPTION_SECRET = "my-secret-passphrase"; // same as CryptoJS secret
// const ALGORITHM = "aes-256-gcm";

// // Derive a 32-byte key from secret
// function getKey(secret) {
//     return crypto.createHash("sha256").update(secret).digest();
// }

// // Encrypt (for response)
// function encryptPayload(data, secret) {
//     const key = getKey(secret);
//     const iv = crypto.randomBytes(12); // GCM recommends 12 bytes

//     const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
//     const encrypted = Buffer.concat([cipher.update(JSON.stringify(data), "utf8"), cipher.final()]);
//     const tag = cipher.getAuthTag();

//     return {
//         payload: Buffer.concat([iv, tag, encrypted]).toString("base64"), // bundle IV+tag+cipher
//     };
// }

// Decrypt (for request)
// function decryptPayload(payload, secret) {
//     const raw = Buffer.from(payload, "base64");

//     const iv = raw.subarray(0, 12);
//     const tag = raw.subarray(12, 28);
//     const encrypted = raw.subarray(28);

//     const key = getKey(secret);

//     const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
//     decipher.setAuthTag(tag);

//     const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
//     return JSON.parse(decrypted.toString("utf8"));
// }

export const decryptRequest = async (req, res, next) => {
    try {
        if ((IS_PRODUCTION || req.headers.is_actual == '1') && req.body?.payload) {
            if (req.is("application/json") && req.body?.payload) {
                const bytes = CryptoJS.AES.decrypt(req.body.payload, ENCRYPTION_SECRET);
                const decrypted = bytes.toString(CryptoJS.enc.Utf8);
                req.body = JSON.parse(decrypted);

                // // Request(decrypt incoming payload)
                // if (req.body?.payload) {
                //     req.body = decryptPayload(req.body.payload, ENCRYPTION_SECRET);
                // }
            }
        }

    } catch (err) {
        return res.status(400).json({ error: "Invalid encrypted payload" });
    }
    next();
};

export const encryptRequest = async (req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = (data) => {
        if (IS_PRODUCTION || req.headers.is_actual == '1') {
            const str = JSON.stringify(data);
            const encrypted = CryptoJS.AES.encrypt(str, ENCRYPTION_SECRET).toString();

            // // Response (encrypt outgoing payload)
            // const responseData = JSON.stringify(data);
            // res.json(encryptPayload(responseData, ENCRYPTION_SECRET));

            return originalJson({ payload: encrypted });
        } else {
            return originalJson(data); // plain response in development
        }
    };
    next();
};

export const decryptRequestForMultipart = async (req) => {
    try {
        if ((IS_PRODUCTION || req.headers.is_actual == '1') && req.body?.payload) {
            if (req.is("multipart/form-data") && req.body?.payload) {
                const bytes = CryptoJS.AES.decrypt(req.body.payload, ENCRYPTION_SECRET);
                const decrypted = bytes.toString(CryptoJS.enc.Utf8);
                req.body = JSON.parse(decrypted);
            }
        }
    } catch (err) {
        return res.status(400).json({ error: "Invalid encrypted payload" });
    }
};