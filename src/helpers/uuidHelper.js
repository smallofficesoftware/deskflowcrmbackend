import crypto from 'crypto';

export const generateTimeBasedPrefixedUUID = (prefix = "PRE") => {
    const timestamp = Date.now();
    const random = crypto.randomBytes(4).toString("hex");
    return `${prefix}-${timestamp}-${random}`;
};
