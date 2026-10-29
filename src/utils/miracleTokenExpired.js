// Miracle tells a caller its login token has expired in two ways: an HTTP 401 (code AH015), which the axios
// instance already retries with a fresh token, and an HTTP 200 whose body is { IsError: true, ErrorCode: "EXCEP002",
// Message: "Token is Expired." }, which used to be logged as a failure and shown to the user. This tells the second
// kind apart. It matches the message text, not the code alone: EXCEP002 is a general exception code.
export const isTokenExpiredBody = (data) => {
    if (!data || data.IsError !== true) return false;
    return /token\s+is\s+expired/i.test(String(data.Message || ""));
};
