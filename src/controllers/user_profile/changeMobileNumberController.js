import { checkNewEmailOTP, checkNewNumberOTP, checkOldEmailOTP, checkOldNumberOTP, sendOTPNewEmail, sendOTPNewNumber, sendOTPOldEmail, sendOTPOldNumber } from "../../services/user_profile/changeMobileNumberServices.js";
import callServiceMethod from "../baseController.js";

export const verifyOldNumber = async (req, res) => {
    await callServiceMethod(
        req,
        res,
        sendOTPOldNumber(req),
        "verifyOldNumber"
    );
};
export const verifyOldNumberOTP = async (req, res) => {
    await callServiceMethod(
        req,
        res,
        checkOldNumberOTP(req),
        "verifyOldNumberOTP"
    );
};
export const verifyNewNumber = async (req, res) => {
    await callServiceMethod(
        req,
        res,
        sendOTPNewNumber(req),
        "verifyNewNumber"
    );
};
export const verifyNewNumberOTP = async (req, res) => {
    await callServiceMethod(
        req,
        res,
        checkNewNumberOTP(req),
        "verifyOldNumberOTP"
    );
};
export const verifyOldEmailAddressOTP = async (req, res) => {
    await callServiceMethod(
        req,
        res,
        checkOldEmailOTP(req),
        "verifyOldEmailAddressOTP"
    );
};
export const verifyOldEmail = async (req, res) => {
    await callServiceMethod(
        req,
        res,
        sendOTPOldEmail(req),
        "verifyOldEmail"
    );
};

export const verifyNewEmail = async (req, res) => {
    await callServiceMethod(
        req,
        res,
        sendOTPNewEmail(req),
        "verifyNewEmail"
    );
};

export const verifyNewEmailOTP = async (req, res) => {
    await callServiceMethod(
        req,
        res,
        checkNewEmailOTP(req),
        "verifyNewEmailOTP"
    );
};
