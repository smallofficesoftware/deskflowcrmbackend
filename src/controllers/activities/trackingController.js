import { createTracking, getTracking } from '../../services/activities/trackingService.js';
import callServiceMethod from '../baseController.js';

export const allcreatetracking = async (req, res) => {
    await callServiceMethod(req, res, createTracking(req), "tracking");
}

export const allgettracking = async (req, res) => {
    await callServiceMethod(req, res, getTracking(req,res), "getTracking")
}