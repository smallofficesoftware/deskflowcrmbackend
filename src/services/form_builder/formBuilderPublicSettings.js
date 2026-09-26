// Public-form controls (plan item M3): open/close dates, a total entry
// limit, one entry per mobile number, a thank-you message or redirect, and
// whether an OTP is required. Stored under the form's settings (settings_json
// / published_settings_json, same JSON column approval stages and print
// settings use): { public: { ... } }. Pure module — the DB-side checks
// (counting entries, looking up a mobile) live in formBuilderPublicService.js.

export function parsePublicSettings(json) {
  let parsed = json;
  if (typeof json === "string") {
    try {
      parsed = JSON.parse(json);
    } catch {
      parsed = null;
    }
  }
  const p = parsed && typeof parsed === "object" ? parsed.public : null;
  return {
    // Not truncated here — findPublicSettingsProblems is what enforces the
    // length limit, at publish time, so a form can never actually carry an
    // over-length message; truncating on read would just hide that check.
    thank_you_message: p?.thank_you_message ? String(p.thank_you_message) : "",
    redirect_url: p?.redirect_url ? String(p.redirect_url).trim() : "",
    open_date: p?.open_date ? String(p.open_date).slice(0, 10) : null,
    close_date: p?.close_date ? String(p.close_date).slice(0, 10) : null,
    max_entries: Number.isInteger(Number(p?.max_entries)) && Number(p?.max_entries) > 0 ? Number(p.max_entries) : null,
    one_per_mobile: !!p?.one_per_mobile,
    require_otp: !!p?.require_otp,
  };
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const URL_PATTERN = /^https?:\/\/.+/i;

// Publish-time check. Returns a plain-words message or null.
export function findPublicSettingsProblems(settingsJson) {
  const s = parsePublicSettings(settingsJson);
  if (s.open_date && !DATE_PATTERN.test(s.open_date)) return "The public form's opening date couldn't be read. Pick it again.";
  if (s.close_date && !DATE_PATTERN.test(s.close_date)) return "The public form's closing date couldn't be read. Pick it again.";
  if (s.open_date && s.close_date && s.open_date > s.close_date) return "The public form's closing date is before its opening date.";
  if (s.redirect_url && !URL_PATTERN.test(s.redirect_url)) return "The redirect link should start with http:// or https://.";
  if (s.thank_you_message.length > 1000) return "The thank-you message is too long (at most 1000 characters).";
  return null;
}

// Today's date (YYYY-MM-DD) in the app's +05:30 zone, matching how
// default_today / date edit rules judge "today" elsewhere in Form Builder.
function todayIST(now) {
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}

// Publish check for consent fields (plan M2): a consent tick with no terms
// text is a tick box nobody can read the meaning of. Returns a plain-words
// message or null.
export function findConsentProblems(fields) {
  for (const f of Array.isArray(fields) ? fields : []) {
    if (f?.type !== "consent") continue;
    if (!String(f.content ?? "").trim()) {
      return `“${f.label || f.key}”: add the terms the person is agreeing to.`;
    }
  }
  return null;
}

// Whether the public form accepts a new entry right now. `entryCount` = live
// (isDelete=0, isDraft excluded) rows already submitted — pass null to skip
// the max-entries check (the caller decides whether counting is worth it).
// Returns { open: true } or { open: false, reason, message }.
export function publicFormStatus(settingsJson, { now = new Date(), entryCount = null } = {}) {
  const s = parsePublicSettings(settingsJson);
  const today = todayIST(now);
  if (s.open_date && today < s.open_date) {
    return { open: false, reason: "not_open_yet", message: "This form isn't open yet. Please check back later." };
  }
  if (s.close_date && today > s.close_date) {
    return { open: false, reason: "closed", message: "This form is closed and no longer accepting entries." };
  }
  if (s.max_entries != null && entryCount != null && entryCount >= s.max_entries) {
    return { open: false, reason: "full", message: "This form has reached its maximum number of entries." };
  }
  return { open: true };
}
