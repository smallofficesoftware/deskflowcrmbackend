import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import logger from '../utils/logger.js';

let credentials;
const serviceAccountPath = path.join(process.cwd(), "firebaseAdminSDK.json");

if (fs.existsSync(serviceAccountPath)) {
  try {
    const fileContents = fs.readFileSync(serviceAccountPath, "utf8");
    credentials = JSON.parse(fileContents);
  } catch (err) {
    logger.error("Failed to parse service account JSON:", err.message);
  }
} else {
  logger.error("Service account file not found at:", serviceAccountPath);
}

if (!admin.apps.length) {
  if (credentials) {
    admin.initializeApp({
      credential: admin.credential.cert(credentials),
    });
    logger.info("Firebase Admin initialized.");
  } else {
    logger.warn("Firebase credentials not found or invalid. Skipping Firebase Admin initialization.");
  }
}

export default admin;
