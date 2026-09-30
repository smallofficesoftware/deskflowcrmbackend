import { changeStageWithForm } from "../../services/stage_change/stageChangeWithFormService.js";
import callServiceMethod from "../baseController.js";

export const changeStageWithFormProvider = async (req, res) => {
  await callServiceMethod(req, res, changeStageWithForm(req), "changeStageWithFormProvider");
};
