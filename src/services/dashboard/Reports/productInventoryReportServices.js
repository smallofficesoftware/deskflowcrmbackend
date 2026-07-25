import { Op, Sequelize } from "sequelize";
import sequelize from "../../../config/sequelize.js";
import { buildSearchQuery } from "../../../helpers/searchAlgoV1.js";
import { cartItemModel } from "../../../models/activities/cartItemsModel.js";
import companyModel from "../../../models/company_setup/companyModel.js";
import currencyModel from "../../../models/configuration/currencyModel.js";
import { categoryModel } from "../../../models/product_settings/categoryModel.js";
import { productModel } from "../../../models/product_settings/productModel.js";
import { resError, resSuccess } from "../../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../../commonServices.js";

// server/controller.js (or wherever productInventoryReport lives)
export const productInventoryReport = async (req, res) => {
  try {
    const {
      a_application_login_id,
      selectedDates,
      selectedProduct,
      selectedCategory,
      selectedStockTypeId,
      selectedWarehouseIds,
      ll, // offset (number)
      ul, // limit (number)
    } = req.body;

    const globalSearch = req.body.globalSearch?.trim() || "";


    let relevanceOrder;
    let fullTextSearchConditionForProduct = {};
    if (globalSearch) {
      const cartColumns = Object.keys(productModel(req.tenantDB).rawAttributes)
        .filter(col => {
          const attr = productModel(req.tenantDB).rawAttributes[col];
          return ['STRING', 'TEXT', 'CHAR', 'VARCHAR'].includes(attr.type.key);
        });
      const { searchClause, relevanceSearchOrder } = buildSearchQuery(
        globalSearch,
        cartColumns
      );
      relevanceOrder = relevanceSearchOrder
      fullTextSearchConditionForProduct = searchClause;
    }


    const offset = ul;
    const limit = ll;


    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    const cartItem = cartItemModel(req.tenantDB);

    const companyCurrency = await companyModel.findOne({
      where: { id: findCompanyId.company_masters_id, isDelete: 0 },
      attributes: ["currency_id"],
    });

    const currency = await currencyModel.findOne({
      where: { id: companyCurrency?.currency_id, isDelete: 0 },
      attributes: ["id", "symbol", "short_name"],
    });

    // date range
    const start = new Date(selectedDates[0]);
    start.setHours(0, 0, 0, 0);

    const end = new Date(selectedDates[1]);
    end.setHours(23, 59, 59, 999);

    const productModels = productModel(req.tenantDB);
    const categoryModels = categoryModel(req.tenantDB);

    // assemble where clauses for product query
    const whereForProduct = {};
    const whereForcategory = {};
    if (selectedProduct) {
      whereForProduct[Op.and] = [Sequelize.literal(`FIND_IN_SET('${selectedProduct.value}',id)`)];
    }
    if (selectedCategory) {
      whereForcategory[Op.and] = [Sequelize.literal(`FIND_IN_SET('${selectedCategory.value}',category_id)`)];
    }

    // Use findAndCountAll so we can return totalRecords + paged rows
    /* Sorting and ordering */
    const order = [];
    if (relevanceOrder && relevanceOrder.length > 0) {
      order.push(...relevanceOrder);
    }
    const { count: totalRecords, rows: productRows } = await productModels.findAndCountAll({
      where: {
        isDelete: 0,
        company_masters_id: findCompanyId.company_masters_id,
        ...whereForcategory,
        ...whereForProduct,
        ...fullTextSearchConditionForProduct,
      },
      attributes: [
        "id",
        "category_id",
        "product_name",
        "product_code",
        "min_stock_quantity",
        "max_stock_quantity",
        "unit",
        "purchase_net_rate",
        "purchase_rate"
      ],
      offset, // ll -> offset
      limit,  // ul -> limit
      raw: true,
      order: relevanceOrder
    });

    // If there are no products in the page return empty items and totalRecords
    const data = productRows.length > 0 ? productRows : [];

    const reportData = await Promise.all(
      data.map(async (item) => {
        const productId = item.id;

        const category = await categoryModels.findOne({
          where: { id: item.category_id, isDelete: 0 },
          attributes: ['category_name'],
          raw: true,
        });

        // where clause for transactions in range
        const whereClause = {
          isDelete: 0,
          item_product_id: productId,
          cart_type: { [Op.in]: [4, 3, 6, 7, 8, 9, 10, 11] },
          cart_date: { [Op.between]: [start, end] },
          cart_number: { [Op.ne]: null, [Op.not]: "" },
          [Op.or]: [
            { a_application_login_id: a_application_login_id },
            { company_masters_id: findCompanyId.company_masters_id },
          ],
          [Op.and]: [
            {
              [Op.or]: [
                // cart_type = 4 AND reference_type != 8
                {
                  cart_type: 4,
                  reference_type: { [Op.ne]: 8 },
                },
                {
                  cart_type: 3,
                  reference_type: { [Op.ne]: 9 },
                },

                {
                  cart_type: { [Op.in]: [6, 7, 8, 9, 10, 11] },
                },
              ],
            },
          ],
        };

        let warehouseIds = [];

        // Only try to parse if warehouse_id exists and is a non-empty string
        if (typeof selectedWarehouseIds === 'string' && selectedWarehouseIds.trim() !== '') {
          warehouseIds = selectedWarehouseIds
            .split(',')
            .map(id => parseInt(id.trim(), 10))
            .filter(id => !isNaN(id));
        }

        const whereClauseOpen = {
          isDelete: 0,
          item_product_id: productId,
          cart_type: { [Op.in]: [4, 3, 6, 7, 8, 9, 10, 11] },
          cart_date: { [Op.lt]: start },
          cart_number: { [Op.ne]: null, [Op.not]: "" },
          stock_type: { [Op.ne]: 0 },
          [Op.or]: [
            { a_application_login_id: a_application_login_id },
            { company_masters_id: findCompanyId.company_masters_id },
          ],
          [Op.and]: [
            {
              [Op.or]: [
                // cart_type = 4 AND reference_type != 8
                {
                  cart_type: 4,
                  reference_type: { [Op.ne]: 8 },
                },
                {
                  cart_type: 3,
                  reference_type: { [Op.ne]: 9 },
                },

                {
                  cart_type: { [Op.in]: [4, 3, 6, 7, 8, 9, 10, 11] },
                },
              ],
            },
          ],
        };
        if (warehouseIds.length > 0) {
          whereClauseOpen.item_warehouse_id = { [Op.in]: warehouseIds };
        }
        console.log("sss", whereClauseOpen)
        const [
          resultCartItem,
          findOpeningQty,
          cartItemDispatch,
          cartItemOrder,
          cartItemInward,
          cartItemPurchase,
          cartReturnOrder,
          cartReturnPurchase,
          stockAdjustmentInward,
          stockAdjustmentOutward
        ] = await Promise.all([
          cartItem.findAll({ where: whereClause, raw: true }),
          cartItem.findAll({ where: whereClauseOpen, raw: true }),
          cartItem.findAll({
            where: {
              isDelete: 0,
              company_masters_id: findCompanyId.company_masters_id,
              cart_type: 9,
              cart_date: { [Op.between]: [start, end] },
              item_product_id: productId,
              stock_type: { [Op.ne]: 0 },
            },
            attributes: [[sequelize.fn("SUM", sequelize.col("item_qty")), "dispatch"]],
            raw: true,
          }),
          cartItem.findAll({
            where: {
              isDelete: 0,
              company_masters_id: findCompanyId.company_masters_id,
              cart_type: 3,
              cart_date: { [Op.between]: [start, end] },
              item_product_id: productId,
              reference_type: { [Op.ne]: 9 },
              stock_type: { [Op.ne]: 0 },
            },
            attributes: [[sequelize.fn("SUM", sequelize.col("item_qty")), "sales"]],
            raw: true,
          }),
          cartItem.findAll({
            where: {
              isDelete: 0,
              company_masters_id: findCompanyId.company_masters_id,
              cart_type: 8,
              cart_date: { [Op.between]: [start, end] },
              item_product_id: productId,
            },
            attributes: [[sequelize.fn("SUM", sequelize.col("item_qty")), "inward"]],
            raw: true,
          }),
          cartItem.findAll({
            where: {
              isDelete: 0,
              company_masters_id: findCompanyId.company_masters_id,
              cart_type: 4,
              cart_date: { [Op.between]: [start, end] },
              item_product_id: productId,
              reference_type: { [Op.ne]: 8 },
              stock_type: { [Op.ne]: 0 },
            },
            attributes: [[sequelize.fn("SUM", sequelize.col("item_qty")), "purchase"]],
            raw: true,
          }),
          cartItem.findAll({
            where: {
              isDelete: 0,
              company_masters_id: findCompanyId.company_masters_id,
              cart_type: 6,
              cart_date: { [Op.between]: [start, end] },
              item_product_id: productId,
              stock_type: { [Op.ne]: 0 },
            },
            attributes: [[sequelize.fn("SUM", sequelize.col("item_qty")), "returnSales"]],
            raw: true,
          }),
          cartItem.findAll({
            where: {
              isDelete: 0,
              company_masters_id: findCompanyId.company_masters_id,
              cart_type: 7,
              cart_date: { [Op.between]: [start, end] },
              item_product_id: productId,
              stock_type: { [Op.ne]: 0 },
            },
            attributes: [[sequelize.fn("SUM", sequelize.col("item_qty")), "returnPuchase"]],
            raw: true,
          }),
          cartItem.findAll({
            where: {
              isDelete: 0,
              company_masters_id: findCompanyId.company_masters_id,
              cart_type: 10,
              cart_date: { [Op.between]: [start, end] },
              item_product_id: productId,
              stock_type: { [Op.ne]: 0 },
            },
            attributes: [[sequelize.fn("SUM", sequelize.col("item_qty")), "stockAdjustmentInward"]],
            raw: true,
          }),
          cartItem.findAll({
            where: {
              isDelete: 0,
              company_masters_id: findCompanyId.company_masters_id,
              cart_type: 11,
              cart_date: { [Op.between]: [start, end] },
              item_product_id: productId,
              stock_type: { [Op.ne]: 0 },
            },
            attributes: [[sequelize.fn("SUM", sequelize.col("item_qty")), "stockAdjustmentOutward"]],
            raw: true,
          }),
        ]);

        const calOpenQty = findOpeningQty.reduce((total, it) => {
          if ((it.cart_type == 4 && it.reference_type != 8) || it.cart_type == 6 || it.cart_type == 8 || it.cart_type == 10) {
            return total + it.item_qty;
          } else if ((it.cart_type === 3 && it.reference_type != 9) || it.cart_type === 7 || it.cart_type === 9 || it.cart_type == 11) {
            return total - it.item_qty;
          }
          return total;
        }, 0);

        const closingQty = resultCartItem.reduce((total, it) => {
          if ((it.cart_type == 4 && it.reference_type != 8) || it.cart_type == 6 || it.cart_type == 8 || it.cart_type == 10) {
            return total + it.item_qty;
          } else if ((it.cart_type === 3 && it.reference_type != 9) || it.cart_type === 7 || it.cart_type === 9 || it.cart_type == 11) {
            return total - it.item_qty;
          }
          return total;
        }, 0);

        const sales = parseFloat(cartItemOrder?.[0]?.sales) || 0;
        const dispatch = parseFloat(cartItemDispatch?.[0]?.dispatch) || 0;
        const returnPurchase = parseFloat(cartReturnPurchase?.[0]?.returnPuchase) || 0;
        const inward = parseFloat(cartItemInward[0]?.inward) || 0
        const purchase = parseFloat(cartItemPurchase[0]?.purchase) || 0
        const returnSales = parseFloat(cartReturnOrder[0]?.returnSales) || 0
        const stockAdjustmentInwardIn = parseFloat(stockAdjustmentInward[0]?.stockAdjustmentInward) || 0
        const stockAdjustmentOutwardOut = parseFloat(stockAdjustmentOutward[0]?.stockAdjustmentOutward) || 0

        const calClosingQty1 = (calOpenQty) - (dispatch) - (sales) - (returnPurchase) - (stockAdjustmentOutwardOut);

        const calClosingQty = (calClosingQty1) + (inward) + (purchase) + (returnSales) + (stockAdjustmentInwardIn);

        if (
          (selectedStockTypeId === 1 && calClosingQty !== 0) ||
          (selectedStockTypeId === 2 && calClosingQty >= 0) ||
          (selectedStockTypeId === 3 && calClosingQty <= 0) ||
          (selectedStockTypeId === 4 && calClosingQty <= item.max_stock_quantity) ||
          (selectedStockTypeId === 5 && calClosingQty >= item.min_stock_quantity)
        ) {
          return null;
        }

        const purchaseNetRate = parseFloat(item.purchase_net_rate) || 0;
        const purchaseRate = parseFloat(item.purchase_rate) || 0;

        const totalValue =
          calClosingQty > 0
            ? calClosingQty * purchaseNetRate
            : 0;

        const totalValueOnlyRate =
          calClosingQty > 0
            ? calClosingQty * purchaseRate
            : 0;

        return {
          name: item.product_name,
          code: item.product_code,
          item_unit_name: item.unit,
          category_name: category?.category_name || '',
          openingStock: calOpenQty,
          inward: parseFloat(cartItemInward[0]?.inward) || 0,
          purchase: parseFloat(cartItemPurchase[0]?.purchase) || 0,
          dispatch: parseFloat(cartItemDispatch[0]?.dispatch) || 0,
          sales: parseFloat(cartItemOrder[0]?.sales) || 0,
          returnSales: parseFloat(cartReturnOrder[0]?.returnSales) || 0,
          returnPurchase: parseFloat(cartReturnPurchase[0]?.returnPuchase) || 0,
          stockAdjustmentInward: parseFloat(stockAdjustmentInward[0]?.stockAdjustmentInward) || 0,
          stockAdjustmentOutward: parseFloat(stockAdjustmentOutward[0]?.stockAdjustmentOutward) || 0,
          min_stock_quantity: item.min_stock_quantity,
          max_stock_quantity: item.max_stock_quantity,
          closingStock: calClosingQty,
          total_closing_stock_value: totalValue,
          total_closing_stock_rate: totalValueOnlyRate,
        };
      })
    );
    return resSuccess({
      data: { items: reportData.filter(Boolean), totalRecords },
      ack_msg: "Product inventory report fetched successfully",
    });
  } catch (e) {
    console.error(e);
    return resError({
      ack_msg: "error",
      developer_msg: e
    });
  }
};

