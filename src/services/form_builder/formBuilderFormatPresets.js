// Format presets for text-like form fields (Form Builder v2, plan item O1)
// — lets a form builder pick "Mobile" / "GST" / "PAN" ... instead of
// writing a regex. Pure function, no DB calls: validates one submitted
// value and returns what should actually be stored (normalised / masked),
// or a plain-language error the filler can act on.
//
// Applies to field types text, phone and email (formBuilderSubmissionService
// decides that). The frontend runs the same rules for instant feedback, but
// the server result is the one that counts.
import { normalizeToTenDigit } from "../../utils/sharedFunctions.js";

export const FORMAT_PRESETS = ["mobile", "email", "gst", "pan", "ifsc", "pincode", "aadhaar", "vehicle_no"];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GST_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const PINCODE_PATTERN = /^[1-9][0-9]{5}$/;
const AADHAAR_PATTERN = /^[2-9][0-9]{11}$/;
// Already-masked Aadhaar as this module stores it — accepted unchanged so
// editing an existing submission (which only ever sees the masked value)
// doesn't fail validation.
const AADHAAR_MASKED_PATTERN = /^X{8}[0-9]{4}$/;
// State code + RTO number + optional series letters + 4-digit number
// (GJ01AB1234, DL3CAB1234, MH12A1234), or the Bharat series (22BH1234AA).
const VEHICLE_PATTERN = /^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$/;
const VEHICLE_BH_PATTERN = /^[0-9]{2}BH[0-9]{4}[A-Z]{1,2}$/;

// Spaces, dashes, dots and slashes people commonly type inside ids.
function compact(value) {
  return String(value).replace(/[\s\-./]/g, "").toUpperCase();
}

// Returns { error: string|null, value } — value is what to store when
// error is null. Unknown / empty preset: value passed through unchanged.
export function validateFormatPreset(preset, rawValue) {
  const input = String(rawValue).trim();

  switch (preset) {
    case "mobile": {
      // Only digits and the usual separators — normalizeToTenDigit strips
      // every non-digit, so letters would otherwise slip through.
      if (!/^[0-9+\-\s()]+$/.test(input)) {
        return { error: "Enter a valid 10-digit mobile number" };
      }
      // normalizeToTenDigit handles +91 / 0 / 00 prefixes and returns
      // "91" + 10 digits for a valid Indian number — stored exactly as
      // returned, same format the rest of the CRM stores mobiles in.
      const normalized = normalizeToTenDigit(input);
      if (!normalized || normalized.length !== 12 || !/^91[6-9][0-9]{9}$/.test(normalized)) {
        return { error: "Enter a valid 10-digit mobile number" };
      }
      return { error: null, value: normalized };
    }
    case "email": {
      const email = input.toLowerCase();
      if (!EMAIL_PATTERN.test(email)) return { error: "Enter a valid email address (e.g. name@example.com)" };
      return { error: null, value: email };
    }
    case "gst": {
      const gst = compact(input);
      if (!GST_PATTERN.test(gst)) return { error: "Enter a valid GST number (e.g. 24ABCDE1234F1Z5)" };
      return { error: null, value: gst };
    }
    case "pan": {
      const pan = compact(input);
      if (!PAN_PATTERN.test(pan)) return { error: "Enter a valid PAN (e.g. ABCDE1234F)" };
      return { error: null, value: pan };
    }
    case "ifsc": {
      const ifsc = compact(input);
      if (!IFSC_PATTERN.test(ifsc)) return { error: "Enter a valid IFSC code (e.g. SBIN0001234)" };
      return { error: null, value: ifsc };
    }
    case "pincode": {
      const pin = input.replace(/\s/g, "");
      if (!PINCODE_PATTERN.test(pin)) return { error: "Enter a valid 6-digit pincode" };
      return { error: null, value: pin };
    }
    case "aadhaar": {
      const aadhaar = compact(input);
      if (AADHAAR_MASKED_PATTERN.test(aadhaar)) return { error: null, value: aadhaar };
      if (!AADHAAR_PATTERN.test(aadhaar)) return { error: "Enter a valid 12-digit Aadhaar number" };
      // Never store the full number — only the last 4 digits stay readable.
      return { error: null, value: `XXXXXXXX${aadhaar.slice(-4)}` };
    }
    case "vehicle_no": {
      const vehicle = compact(input);
      if (!VEHICLE_PATTERN.test(vehicle) && !VEHICLE_BH_PATTERN.test(vehicle)) {
        return { error: "Enter a valid vehicle number (e.g. GJ01AB1234)" };
      }
      return { error: null, value: vehicle };
    }
    default:
      return { error: null, value: rawValue };
  }
}
