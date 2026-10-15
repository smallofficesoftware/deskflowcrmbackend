// Contact numbers are not stored in one format: newer contacts are saved as "91" + 10 digits
// (919106760160), older ones as the plain 10 digits (9106760160). The contact import converts
// every incoming number to the "91" form and used to look for that exact text, so a contact saved
// the old way was never found and the import created a duplicate of it.
//
// Given the number the import works with, this returns every form the same number may be stored in,
// so the lookup can match all of them.
export function mobileNumberVariants(number) {
    const digits = String(number ?? "").replace(/\D/g, "");
    if (!digits) return [];

    if (digits.length === 12 && digits.startsWith("91")) return [digits, digits.slice(2)];
    if (digits.length === 10) return [digits, `91${digits}`];
    return [digits]; // any other length (other countries, short numbers): exact match only
}
