import { allCurrency } from "../../controllers/configuration/currencyController.js";
import { authenticateToken } from "../../middlewares/auth.js";

export default (app)=>{
    app.post("/currency",allCurrency);
}