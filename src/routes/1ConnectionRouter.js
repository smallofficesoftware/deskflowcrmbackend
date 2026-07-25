import {
      allchatcontroller
} from "../controllers/connectionController.js";


export default (app) => {
  app.post(
    "/connection",
    allchatcontroller
  );
};