import { Op } from "sequelize";
import { accountTransactionsModel } from "../../models/activities/accountTransactionsModel.js";
import { paymentTypeModel } from "../../models/activities/paymentTypeModel.js";
import { taskManagementModel } from "../../models/activities/taskManagementModel.js";
import { taskCategoryModel } from "../../models/masters/taskCategoryModel.js";
import { wareHouseModel } from "../../models/other_settings/wareHouseModel.js";
import { categoryModel } from "../../models/product_settings/categoryModel.js";
import { productGroupModel } from "../../models/product_settings/productGroupModel.js";
import { productModel } from "../../models/product_settings/productModel.js";
import { resError, resSuccess } from "../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../commonServices.js";

export const getCategoryDelete = async (req) => {
  const { a_application_login_id, category_id } = req.body;

  if (!a_application_login_id || !category_id) {
    return resError({
      ack_msg: "Application login ID and category ID are required",
    });
  }

  const findCompanyId = await getCompanyByLoginId(a_application_login_id);
  if (!findCompanyId || !findCompanyId.company_masters_id) {
    return resError({
      ack_msg: "Invalid application login ID",
    });
  }

  const productModels = productModel(req.tenantDB);
  const categoryModels = categoryModel(req.tenantDB);

  const categoryIds = typeof category_id === "string" && category_id.includes(",")
    ? category_id.split(",").map(Number).filter(id => !isNaN(id))
    : [Number(category_id)];

  if (categoryIds.length === 0) {
    return resError({
      ack_msg: "Invalid category ID format",
    });
  }

  const products = await productModels.findAll({
    where: {
      isDelete: 0,
      company_masters_id: findCompanyId.company_masters_id,
      category_id: { [Op.in]: categoryIds },
    },
  });

  if (products.length > 0) {
    return resError({
      ack_msg: "One or more categories have associated products and cannot be deleted",
    });
  }

  const [rowsUpdated] = await categoryModels.update(
    {
      isDelete: 1,
    },
    {
      where: {
        isDelete: 0,
        id: { [Op.in]: categoryIds },
      },
    }
  );

  if (rowsUpdated === 0) {
    return resError({
      ack_msg: "No categories found or already deleted",
    });
  }

  return resSuccess({
    ack_msg: categoryIds.length > 1 ? "Categories Deleted Successfully" : "Category Deleted Successfully",
    data: { item: rowsUpdated },
  });
};

export const getTaskCategoryDelete = async (req) => {
  try {
    const { a_application_login_id, category_id } = req.body;

    if (!a_application_login_id || !category_id) {
      return resError({
        ack_msg: "Application login ID and category ID are required",
      });
    }

    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    if (!findCompanyId || !findCompanyId.company_masters_id) {
      return resError({
        ack_msg: "Invalid application login ID",
      });
    }

    const taskModels = taskManagementModel(req.tenantDB);
    const taskCategoryModels = taskCategoryModel(req.tenantDB);

    const categoryIds = typeof category_id === "string" && category_id.includes(",")
      ? category_id.split(",").map(Number).filter(id => !isNaN(id))
      : [Number(category_id)];

    if (categoryIds.length === 0) {
      return resError({
        ack_msg: "Invalid category ID format",
      });
    }

    const products = await taskModels.findAll({
      where: {
        isDelete: 0,
        company_masters_id: findCompanyId.company_masters_id,
        task_category_id: { [Op.in]: categoryIds },
      },
    });

    if (products.length > 0) {
      return resError({
        ack_msg: "This category cannot be deleted as tasks have already been created under it."
      });
    }

    const [rowsUpdated] = await taskCategoryModels.update(
      {
        isDelete: 1,
      },
      {
        where: {
          isDelete: 0,
          id: { [Op.in]: categoryIds },
        },
      }
    );

    if (rowsUpdated === 0) {
      return resError({
        ack_msg: "No categories found or already deleted",
      });
    }

    return resSuccess({
      ack_msg: categoryIds.length > 1 ? "Categories Deleted Successfully" : "Category Deleted Successfully",
      data: { item: rowsUpdated },
    });

  }
  catch (e) {
    console.log(e);
    resError({
      developer_msg: e
    })

  }
}


export const getWareHouseDelete = async (req) => {
  const { a_application_login_id, warehouse_id } = req.body;

  if (!a_application_login_id || !warehouse_id) {
    return resError({
      ack_msg: "Application login ID and category ID are required",
    });
  }

  const findCompanyId = await getCompanyByLoginId(a_application_login_id);
  if (!findCompanyId || !findCompanyId.company_masters_id) {
    return resError({
      ack_msg: "Invalid application login ID",
    });
  }

  const wareHouseModels = wareHouseModel(req.tenantDB);

  const warehouseids = typeof warehouse_id === "string" && warehouse_id.includes(",")
    ? warehouse_id.split(",").map(Number).filter(id => !isNaN(id))
    : [Number(warehouse_id)];

  if (warehouseids.length === 0) {
    return resError({
      ack_msg: "Invalid category ID format",
    });
  }



  const [rowsUpdated] = await wareHouseModels.update(
    {
      isDelete: 1,
    },
    {
      where: {
        isDelete: 0,
        id: { [Op.in]: warehouseids },
      },
    }
  );

  if (rowsUpdated === 0) {
    return resError({
      ack_msg: "No WareHouse found or already deleted",
    });
  }

  return resSuccess({
    ack_msg: warehouseids.length > 1 ? "WareHouse Deleted Successfully" : "WareHouse Deleted Successfully",
    data: { item: rowsUpdated },
  });
};


export const getGroupDelete = async (req) => {
  const { a_application_login_id, group_id } = req.body;

  if (!a_application_login_id || !group_id) {
    return resError({
      ack_msg: "Application login ID and category ID are required",
    });
  }

  const findCompanyId = await getCompanyByLoginId(a_application_login_id);
  if (!findCompanyId || !findCompanyId.company_masters_id) {
    return resError({
      ack_msg: "Invalid application login ID",
    });
  }
  const groupsModels = productGroupModel(req.tenantDB);
  const categoryModels = categoryModel(req.tenantDB);

  const groupsids = typeof group_id === "string" && group_id.includes(",")
    ? group_id.split(",").map(Number).filter(id => !isNaN(id))
    : [Number(group_id)];

  if (groupsids.length === 0) {
    return resError({
      ack_msg: "Invalid Group ID format",
    });
  }

  const products = await categoryModels.findAll({
    where: {
      isDelete: 0,
      company_masters_id: findCompanyId.company_masters_id,
      group_id: { [Op.in]: groupsids },
    },
  });

  if (products.length > 0) {
    return resError({
      ack_msg: "One or more Groups have associated Category and cannot be deleted",
    });
  }

  const [rowsUpdated] = await groupsModels.update(
    {
      isDelete: 1,
    },
    {
      where: {
        isDelete: 0,
        id: { [Op.in]: groupsids },
      },
    }
  );

  if (rowsUpdated === 0) {
    return resError({
      ack_msg: "No Groups found or already deleted",
    });
  }

  return resSuccess({
    ack_msg: groupsids.length > 1 ? "Groups Deleted Successfully" : "Groups Deleted Successfully",
    data: { item: rowsUpdated },
  });
};

export const getPaymentDelete = async (req) => {
  const { a_application_login_id, type_id } = req.body;

  if (!a_application_login_id || !type_id) {
    return resError({
      ack_msg: "Application login ID and category ID are required",
    });
  }

  const findCompanyId = await getCompanyByLoginId(a_application_login_id);
  if (!findCompanyId || !findCompanyId.company_masters_id) {
    return resError({
      ack_msg: "Invalid application login ID",
    });
  }

  const paymentTypeModels = paymentTypeModel(req.tenantDB);
  const accountModels = accountTransactionsModel(req.tenantDB);

  // ────────────────────────────────────────────────
  // Fixed part – handle both array and comma-string
  // ────────────────────────────────────────────────
  let paymentTypeIds;

  if (Array.isArray(type_id)) {
    // Frontend sent array → [7,6,5] or ["7","6","5"]
    paymentTypeIds = type_id
      .map(id => Number(id))
      .filter(id => !isNaN(id) && Number.isInteger(id));
  }
  else if (typeof type_id === "string" && type_id.includes(",")) {
    // Old behavior – "7,6,5"
    paymentTypeIds = type_id
      .split(",")
      .map(id => Number(id.trim()))
      .filter(id => !isNaN(id) && Number.isInteger(id));
  }
  else {
    // Single value – number or numeric string
    const singleId = Number(type_id);
    paymentTypeIds = !isNaN(singleId) && Number.isInteger(singleId)
      ? [singleId]
      : [];
  }

  if (paymentTypeIds.length === 0) {
    return resError({
      ack_msg: "Invalid Group ID format",
    });
  }

  const products = await accountModels.findAll({
    where: {
      isDelete: 0,
      company_masters_id: findCompanyId.company_masters_id,
      mode: { [Op.in]: paymentTypeIds },
    },
  });
  if (products.length > 0) {
    return resError({
      ack_msg: "One or more Payment Type have associated Account Transactions and cannot be deleted",
    });
  }

  const [rowsUpdated] = await paymentTypeModels.update(
    {
      isDelete: 1,
    },
    {
      where: {
        isDelete: 0,
        id: { [Op.in]: paymentTypeIds },
      },
    }
  );

  if (rowsUpdated === 0) {
    return resError({
      ack_msg: "No Payment Type found or already deleted",
    });
  }

  return resSuccess({
    ack_msg: paymentTypeIds.length > 1 ? "Payment Types Deleted Successfully" : "Payment Type Deleted Successfully",
    data: { item: rowsUpdated },
  });
};