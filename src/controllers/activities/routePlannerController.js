import { assignContactsToRoute, assignedContactsGet, assignStatusToRoutePlanner, removeContactsFromRoute, routesAdd, routesGet, routesUpdate } from "../../services/activities/routePlannerServices.js";
import callServiceMethod from "../baseController.js";

export const getRoutes = async (req, res) => {
    await callServiceMethod(req, res, routesGet(req), "routesGet");
};

export const addRoutes = async (req, res) => {
    await callServiceMethod(req, res, routesAdd(req), "routesAdd");
};

export const updateRoutes = async (req, res) => {
    await callServiceMethod(req, res, routesUpdate(req), "routesUpdate");
};

export const getAssignedContacts = async (req, res) => {
    await callServiceMethod(req, res, assignedContactsGet(req), "assignedContactsGet");
};

export const assignContacts = async (req, res) => {
    await callServiceMethod(req, res, assignContactsToRoute(req), "assignContactsToRoute");
};

export const removeContacts = async (req, res) => {
    await callServiceMethod(req, res, removeContactsFromRoute(req), "removeContactsFromRoute");
};

export const assignStatusToRoute = async (req, res) => {
    await callServiceMethod(req, res, assignStatusToRoutePlanner(req), "assignStatusToRoutePlanner");
};