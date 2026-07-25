import { allExpenseTypeMaster, createExpenseTypeMainMaster, createExpenseTypeMaster, expenseTypeMasterUpdate, getExpenseTypeMainMaster, updateExpenseTypeMainMaster } from "../../controllers/hr/expenseTypeMasterController.js";
import { authenticateToken } from "../../middlewares/auth.js";
import { productUpload } from "../../middlewares/multer.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";


export default (app) => {
  app.post("/get-expense", authenticateToken, tenantMiddleware, allExpenseTypeMaster);
  app.post("/create-expense", authenticateToken, tenantMiddleware, productUpload.single("image"), createExpenseTypeMaster);
  app.post("/update-expense", authenticateToken, tenantMiddleware, productUpload.single("image"), expenseTypeMasterUpdate);
  app.post("/create-expense-type", authenticateToken, tenantMiddleware, createExpenseTypeMainMaster);
  app.post("/update-expense-type", authenticateToken, tenantMiddleware, updateExpenseTypeMainMaster);
  app.post("/get-expense-type", authenticateToken, tenantMiddleware, getExpenseTypeMainMaster);
};
