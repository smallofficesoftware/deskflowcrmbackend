import { bomHierarchy } from "../../services/production/bomHierarchyServices.js";
import callServiceMethod from "../baseController.js";

export const bomHierarchyProvider = async (req, res) => {
    await callServiceMethod(req, res, bomHierarchy(req), "bomHierarchyProvider");
};
