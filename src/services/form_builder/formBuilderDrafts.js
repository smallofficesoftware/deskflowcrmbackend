// "Save and continue later" (plan item M7) — what a draft may hold. Pure
// module, no imports. A draft is a person's
// unfinished answers kept as JSON; it is never validated (it is unfinished by
// definition) and becomes a real entry only through the normal submit.
//
// Not kept in a draft: files / photos / signatures (they travel as uploads),
// numbers the system gives (auto number, calculations), the spam trap, and any
// Aadhaar number (masked or encrypted when saved for real — a draft would
// otherwise keep the full number in plain text).

export const MAX_DRAFT_CHARS = 200000;
export const MAX_DRAFTS_PER_FORM = 20; // per person

const isAadhaar = (f) => f?.format_preset === "aadhaar";

const NEVER_KEPT_TYPES = new Set(["section-header", "instruction", "file", "image", "signature", "auto-number", "calculation", "honeypot"]);

export function keptDraftFields(fields) {
  return (Array.isArray(fields) ? fields : []).filter((f) => f && f.key && !NEVER_KEPT_TYPES.has(f.type) && !isAadhaar(f));
}

// -> { answers } (only fields the form has and a draft may hold), or { error }.
export function cleanDraftAnswers(fields, answers) {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) return { error: "There is nothing to save yet" };
  const kept = new Set(keptDraftFields(fields).map((f) => f.key));
  const clean = {};
  for (const [key, value] of Object.entries(answers)) {
    if (!kept.has(key) || value === undefined) continue;
    clean[key] = value;
  }
  if (Object.keys(clean).length === 0) return { error: "There is nothing to save yet" };
  const size = JSON.stringify(clean).length;
  if (size > MAX_DRAFT_CHARS) return { error: "This draft is too large to save" };
  return { answers: clean };
}

// Names of the fields left out of a draft, for the "not saved" note on screen.
export function leftOutOfDraft(fields) {
  return (Array.isArray(fields) ? fields : [])
    .filter((f) => f && f.key && (["file", "image", "signature"].includes(f.type) || isAadhaar(f)))
    .map((f) => f.label || f.key);
}
