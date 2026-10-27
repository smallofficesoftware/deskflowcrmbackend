import { resSuccess } from "../../utils/sharedFunctions.js";
import { REPORT_CATALOG } from "./reportCatalog.js";

/**
 * The report menu for the mobile app. Every entry is returned; the app hides the ones whose
 * `pageId` the user has no View right for (the user's rights are already on the device).
 */
export const getReportCatalog = async () => resSuccess({ data: { groups: REPORT_CATALOG } });
