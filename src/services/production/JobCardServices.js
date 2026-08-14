import { Op, Sequelize } from "sequelize";
import { getUserRights } from "../../helpers/rightsHelper.js";
import { cartItemModel } from "../../models/activities/cartItemsModel.js";
import { cartModel } from "../../models/activities/cartsModel.js";
import { contactModel } from "../../models/activities/contactModel.js";
import loginModel from "../../models/application_login/loginModel.js";
import { bomVsProcessVsConsAndRejctsModel } from "../../models/product_settings/bomProcessVsConsAndRejctsModel.js";
import { bomVsProcessListsModel } from "../../models/product_settings/bomVsProcessListsModel.js";
import { categoryModel } from "../../models/product_settings/categoryModel.js";
import { processMastersModel } from "../../models/product_settings/processMastersModel.js";
import { productBillOfMaterialModel } from "../../models/product_settings/productBillOfMaterialModel.js";
import { productModel } from "../../models/product_settings/productModel.js";
import { JobCardsModel } from "../../models/production/JobCardsModel.js";
import { productionTransactionModel } from "../../models/production/productionTransactionModel.js";
import { productionTransactionsItemsModel } from "../../models/production/productionTransactionsItemsModel.js";
import { PAGE_ID } from "../../utils/AppEnumeration.js";
import { isValid, resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";
import { inserStockAdjustment } from "../activities/stockAdjustmentServices.js";
import { getCompanyByLoginId } from "../commonServices.js";

export const jobCardsFetch = async (req) => {
    try {
        const { ul = 0, ll = 30, a_application_login_id, labelOptions, statusOptions, assignedTeamOptions, createdTeamOptions, labelAndOr, searchTerm } = req.body;

        const limit = Number.isInteger(Number(ll)) && Number(ll) > 0 ? Number(ll) : 30;
        const offset = Number.isInteger(Number(ul)) && Number(ul) >= 0 ? Number(ul) : 0;

        const JobCardsModelInstance = JobCardsModel(req.tenantDB);
        const ContactModelInstance = contactModel(req.tenantDB);
        const CartModelInstance = cartModel(req.tenantDB);
        const CartItemModelInstance = cartItemModel(req.tenantDB);

        const findCompanyId = await getCompanyByLoginId(a_application_login_id);

        const { showAllData, showPersonalData } = await getUserRights({
            company_masters_id: findCompanyId.company_masters_id,
            a_application_login_id,
            page_id: PAGE_ID.JOB_CARD,
            tenentId: req.tenantDB
        });

        const whereClause = {
            isDelete: 0,
            isActive: 1,
        }

        if (showPersonalData) {
            whereClause[Op.or] = [
                Sequelize.literal(`FIND_IN_SET(${a_application_login_id}, team_assign_ids)`),
                { a_application_login_id: a_application_login_id }
            ];
        } else if (showAllData) {
            // whereClause[Op.or] = [
            //   { company_masters_id: findCompanyId.company_masters_id },
            // ];
        } else {
            whereClause[Op.or] = [{ a_application_login_id: a_application_login_id }];
        }

        whereClause[Op.and] = whereClause[Op.and] || [];

        /* -----------------------------------------------------------
            1. LABEL / MULTI LABEL
        ------------------------------------------------------------ */
        if (isValid(labelOptions)) {

            const hasBlankLabel = labelOptions.includes(-9999);

            const normalLabelIds = labelOptions.filter(id => id !== -9999);

            const labelConditions = [];

            // Normal FIND_IN_SET conditions
            if (normalLabelIds.length > 0) {
                const labelCondition = normalLabelIds
                    .map(id => `FIND_IN_SET(${id}, label_ids) > 0`)
                    .join(labelAndOr == 2 ? " AND " : " OR ");

                labelConditions.push(`(${labelCondition})`);
            }

            // Blank label condition for -9999
            if (hasBlankLabel) {
                labelConditions.push(`(label_ids IS NULL OR label_ids = '')`);
            }

            const conditions = [];
            // Combine all label conditions
            conditions.push(`(${labelConditions.join(" OR ")})`);

            // Combine all
            whereClause[Op.and].push(
                Sequelize.literal(`(${conditions.join(" OR ")})`)
            );
        }

        /* -----------------------------------------------------------
              2. JOB STATUS FILTER
          ------------------------------------------------------------ */
        if (isValid(statusOptions)) {
            const hasBlank = statusOptions.includes(-7777);
            const normalStatus = statusOptions.filter(
                id => id !== -7777
            );
            if (hasBlank && normalStatus.length > 0) {
                whereClause.status_id = {
                    [Op.or]: [
                        { [Op.in]: normalStatus },
                        { [Op.is]: null },
                        { [Op.eq]: 0 },
                        { [Op.eq]: '' }
                    ]
                };
            } else if (hasBlank) {
                whereClause.status_id = {
                    [Op.or]: [
                        { [Op.is]: null },
                        { [Op.eq]: 0 },
                        { [Op.eq]: '' }
                    ]
                };
            } else {
                whereClause.status_id = { [Op.in]: normalStatus };
            }
        }

        /* -----------------------------------------------------------
              3. TEAM MEMBER FILTERS (multi-select)
          ------------------------------------------------------------ */
        const parts = [];

        if (createdTeamOptions?.length) {
            parts.push(
                ...createdTeamOptions.map(id => `FIND_IN_SET(${id}, a_application_login_id) > 0`)
            );
        }

        if (assignedTeamOptions?.length) {
            parts.push(
                ...assignedTeamOptions.map(id => `FIND_IN_SET(${id}, team_assign_ids) > 0`)
            );
        }

        if (parts.length) {
            whereClause[Op.and].push(Sequelize.literal(`(${parts.join(" OR ")})`));
        }

        /* -----------------------------------------------------------
              4. Search Term if any
          ------------------------------------------------------------ */
        if (searchTerm) {
            whereClause[Op.and].push({
                [Op.or]: [
                    {
                        contact_id: {
                            [Op.in]: Sequelize.literal(`(
                                    SELECT id
                                    FROM contact_masters
                                    WHERE isDelete = 0
                                    AND person_name LIKE '%${searchTerm}%'
                                )`),
                        },
                    },
                    {
                        contact_id: {
                            [Op.in]: Sequelize.literal(`(
                                    SELECT id
                                    FROM contact_masters
                                    WHERE isDelete = 0
                                    AND company_name LIKE '%${searchTerm}%'
                                )`),
                        },
                    },
                    {
                        item_id: {
                            [Op.in]: Sequelize.literal(`(
                                    SELECT id
                                    FROM cart_items
                                    WHERE isDelete = 0
                                    AND item_product_name LIKE '%${searchTerm}%'
                                )`),
                        },
                    },
                    {
                        order_id: {
                            [Op.in]: Sequelize.literal(`(
                                    SELECT id
                                    FROM carts
                                    WHERE SUBSTRING_INDEX(SUBSTRING_INDEX(cart_number, '/', 2), '/', -1)
                                        LIKE '%${searchTerm}%'
                                )`),
                        },
                    }
                ],
            });
        }

        const jobCardsData = await JobCardsModelInstance.findAll({
            where: whereClause,
            limit,
            offset,
            order: [['created_date_time', 'DESC']],
            raw: true,
            attributes: {
                include: [
                    [
                        Sequelize.literal(
                            `(SELECT GROUP_CONCAT(lable_masters.color) FROM lable_masters WHERE lable_masters.isDelete = 0 AND FIND_IN_SET(lable_masters.id, job_cards.label_ids))`
                        ),
                        "label_color",
                    ],
                    [
                        Sequelize.literal(
                            `(SELECT GROUP_CONCAT(lable_masters.lable_name) FROM lable_masters WHERE lable_masters.isDelete = 0 AND FIND_IN_SET(lable_masters.id, job_cards.label_ids))`
                        ),
                        "label_name",
                    ],
                    [
                        Sequelize.literal(
                            "(SELECT stage_status_masters.name FROM stage_status_masters WHERE stage_status_masters.id = job_cards.status_id AND stage_status_masters.isDelete = 0)"
                        ),
                        "stage_status_name",
                    ],
                    [
                        Sequelize.literal(
                            "(SELECT stage_status_masters.color FROM stage_status_masters WHERE stage_status_masters.id = job_cards.status_id AND stage_status_masters.isDelete = 0)"
                        ),
                        "stage_status_color",
                    ],
                ],
            },
        });

        let activeTeamList;
        let activeTeamMap;
        if (jobCardsData) {
            activeTeamList = await loginModel.findAll(
                {
                    where: {
                        id: {
                            [Op.in]: Sequelize.literal(`(
                        SELECT a_application_login_id
                        FROM company_vs_application_logins
                        WHERE isDelete=0 AND company_masters_id = '${findCompanyId.company_masters_id}'
                      )`)
                        },
                        isDelete: 0
                    },
                    attributes: ["username", "id"],
                    raw: true
                }
            );
            activeTeamMap = new Map(
                activeTeamList.map(user => [user.id, user.username])
            );
        }

        const jobCardList = await Promise.all(jobCardsData.map(async (jobCard) => {
            const customer = await ContactModelInstance.findOne({ where: { id: jobCard.contact_id }, raw: true });
            const item = await CartItemModelInstance.findOne({ where: { id: jobCard.item_id }, raw: true });
            const cart = await CartModelInstance.findOne({ where: { id: jobCard.order_id }, raw: true });

            const loginId = jobCard.a_application_login_id;

            let createORassignName;
            let assignedNameList;

            if (isValid(jobCard.team_assign_ids)) {
                const assignedIds = jobCard.team_assign_ids.split(",").map((id) => id.trim()).filter((id) => id);

                if (assignedIds.length > 0) {
                    createORassignName = activeTeamMap.get(Number(assignedIds[0])) || null;
                    assignedNameList = assignedIds.map(id => activeTeamMap.get(Number(id))).filter(Boolean).join(', ');
                }
            }

            const created_by_name = activeTeamMap.get(Number(loginId)) || null;

            if (!isValid(createORassignName)) {
                createORassignName = created_by_name || "";
            }

            const finalName = `${isValid(jobCard.team_assign_ids) && createORassignName ? "Assign to: " : "Created by: "}${createORassignName || ""}`

            const assined_team_person_list = assignedNameList ? `Assign to: ${assignedNameList}` : "";


            return {
                id: jobCard.id,
                order_item_id: jobCard.item_id,
                item_name: item?.item_product_name || "Unknown Item",
                order_no: cart?.cart_number || "-",
                customer_name: customer?.company_name || customer?.person_name || "Unknown Customer",
                product_qty: jobCard.production_qty,
                unit: item?.item_unit_name || "",
                status_id: jobCard.status_id || 0,
                label_ids: jobCard.label_ids || "",
                team_assign_ids: jobCard.team_assign_ids || "",
                label_color: jobCard.label_color || "",
                label_name: jobCard.label_name || "",
                stage_status_name: jobCard.stage_status_name || "",
                stage_status_color: jobCard.stage_status_color || "",
                teamMemberName: finalName || "",
                assined_team_person_list,
                last_modified_date: jobCard.modified_date || jobCard.created_date_time
            };
        }));

        return resSuccess({
            ack_msg: "Job Cards fetched successfully",
            data: jobCardList,
            hasMore: jobCardList.length === parseInt(ll)
        });

    } catch (error) {
        console.log("jobCardsFetch Error", error);
        return resBadRequest({
            ack_msg: "UNKNOWN_ERROR_TRY_AGAIN",
            developer_msg: `error ${error.message || error}`,
        });
    }
}

export const jobCardsDetails = async (req) => {
    try {
        const { id } = req.body; // Job Card ID

        console.log(`\n--- [DEBUG] Fetching Job Card Details for ID: ${id} ---`);

        const JobCardsModelInstance = JobCardsModel(req.tenantDB);
        const ContactModelInstance = contactModel(req.tenantDB);
        const CartModelInstance = cartModel(req.tenantDB);
        const CartItemModelInstance = cartItemModel(req.tenantDB);
        const BOMModelInstance = productBillOfMaterialModel(req.tenantDB);
        const BOMProcessModelInstance = bomVsProcessListsModel(req.tenantDB);
        const ProcessMasterInstance = processMastersModel(req.tenantDB);
        const BOMMaterialInstance = bomVsProcessVsConsAndRejctsModel(req.tenantDB);
        const ProductModelInstance = productModel(req.tenantDB);

        // 1. Fetch Job Card
        const jobCard = await JobCardsModelInstance.findOne({
            where: { id: id, isDelete: 0 },
            raw: true
        });

        if (!jobCard) {
            console.log(`[DEBUG ERROR] No job card found for id ${id}`);
            return resError({
                ack_msg: "Job Card not found",
                developer_msg: `No job card found for id ${id}`
            });
        }
        console.log(`[DEBUG 1] Job Card found:`, { id: jobCard.id, item_id: jobCard.item_id || jobCard.order_item_id, order_id: jobCard.order_id });

        // 2. Fetch Contact Detail
        const contact = await ContactModelInstance.findOne({ 
            where: { id: jobCard.contact_id, isDelete: 0 }, 
            raw: true 
        });

        const contactDetail = {
            id: contact?.id || null,
            name: contact?.company_name || contact?.person_name || "",
            phone: contact?.mobile_number || "",
            email: contact?.email_id || "",
            city: contact?.city || contact?.city_name || null,
            address: contact?.address || contact?.shipping_address || "",
            gst_no: contact?.gst_number || "",
        };

        // 3. Fetch Item & Order Detail (Supports both item_id and order_item_id)
        const targetItemId = jobCard.item_id || jobCard.order_item_id;
        
        const item = await CartItemModelInstance.findOne({ 
            where: { id: targetItemId, isDelete: 0 }, 
            raw: true 
        });

        const cart = await CartModelInstance.findOne({ 
            where: { id: jobCard.order_id, isDelete: 0 }, 
            raw: true 
        });

        console.log(`[DEBUG 2] Item Found:`, item ? item.item_product_name : "NULL");

        const prodQty = Number(jobCard.product_qty) || Number(item?.item_qty) || 1;

        const itemDetail = {
            item_id: item?.id || null,
            item_name: item?.item_product_name || "",
            item_code: item?.item_product_code || "",
            order_no: cart?.cart_number || "",
            order_qty: Number(item?.item_qty) || 0,
            unit: item?.item_unit_name || "",
            pending_qty: Number(item?.item_qty) || 0,
            delivery_date: cart?.due_date || null
        };

        // 4. Fetch BOM & Processes
        let bomProcesses = [];
        const productId = item?.item_product_id || item?.product_id;

        if (productId) {
            const bom = await BOMModelInstance.findOne({
                where: { product_id: productId, isDelete: 0 },
                raw: true
            });

            console.log(`[DEBUG 3] BOM Found for product_id ${productId}:`, bom ? `BOM ID #${bom.id}` : "NO BOM FOUND");

            if (bom) {
                const processes = await BOMProcessModelInstance.findAll({
                    where: { bom_id: bom.id, isDelete: 0 },
                    raw: true
                });

                console.log(`[DEBUG 4] BOM Processes Count: ${processes.length}`);

                if (processes.length) {
                    // 4a. Batch fetch process masters
                    const processIds = [...new Set(processes.map(p => Number(p.process_id)))].filter(Boolean);
                    const processMasters = await ProcessMasterInstance.findAll({
                        where: { id: { [Op.in]: processIds } },
                        raw: true
                    });
                    const processMasterMap = new Map(processMasters.map(pm => [Number(pm.id), pm]));

                    // 4b. Batch fetch ALL materials for this BOM
                    const allMaterials = await BOMMaterialInstance.findAll({
                        where: { bom_id: bom.id, isDelete: 0 },
                        raw: true
                    });

                    console.log(`[DEBUG 5] Total BOM Materials Found: ${allMaterials.length}`);

                    // 4c. Batch fetch product names & stock
                    const itemIds = [...new Set(allMaterials.map(m => Number(m.item_id || m.material_id)))].filter(Boolean);

                    const products = itemIds.length > 0 ? await ProductModelInstance.findAll({
                        where: { id: { [Op.in]: itemIds }, isDelete: 0 },
                        attributes: ["id", "product_name", "unit"],
                        raw: true
                    }) : [];
                    const productMap = new Map(products.map(p => [Number(p.id), p]));

                    // Safely fetch stock without destructuring crashes
                    const stockBatchResult = await fetchItemStockBatch(req, itemIds);
                    const stockMap = stockBatchResult?.stockMap || {};
                    const unitMap = stockBatchResult?.unitMap || {};

                    // Group materials by process_id
                    const materialsByProcess = new Map();
                    allMaterials.forEach(m => {
                        const pId = Number(m.process_id);
                        if (!materialsByProcess.has(pId)) {
                            materialsByProcess.set(pId, []);
                        }
                        materialsByProcess.get(pId).push(m);
                    });

                    // Material Formatter
                    const formatMaterial = (m) => {
                        const mId = Number(m.item_id || m.material_id);
                        const productInfo = productMap.get(mId);
                        
                        const availableQty = Number(stockMap[mId]) || 0;
                        const unit = productInfo?.unit || unitMap[mId] || m.unit || "";
                        
                        const bomPerUnitQty = Number(m.qty) || 0;
                        const requiredQty = (bomPerUnitQty/bom.qty) * prodQty;

                        return {
                            material_id: mId,
                            material_name: productInfo?.product_name || m.material_name || `Material ID ${mId}`,
                            unit: unit,
                            required_qty: requiredQty,
                            available_qty: availableQty,
                            qty_diff: availableQty - requiredQty
                        };
                    };

                    bomProcesses = processes.map((proc) => {
                        const pId = Number(proc.id);
                        const processId = Number(proc.process_id);
                        const processMaster = processMasterMap.get(processId);
                        const materials = materialsByProcess.get(pId) || [];

                        return {
                            process_id: pId,
                            process_name: processMaster?.process_name || proc.process_name || "Unknown Process",
                            consumption: materials
                                .filter(m => Number(m.type) === 1 || !m.type)
                                .map(formatMaterial),
                            rejection: materials
                                .filter(m => Number(m.type) === 2)
                                .map(formatMaterial)
                        };
                    });
                }
            }
        } else {
            console.log(`[DEBUG WARNING] No product_id found on cart item.`);
        }

        console.log(`--- [DEBUG END] Sending Response ---\n`);

        return resSuccess({
            ack_msg: "Job Card details fetched successfully",
            data: {
                contactDetail,
                itemDetail,
                bomProcesses,
            }
        });

    } catch (error) {
        console.log("jobCardsDetails Error", error);
        return resBadRequest({
            ack_msg: "UNKNOWN_ERROR_TRY_AGAIN",
            developer_msg: `error ${error.message || error}`,
        });
    }
};

// Batched stock lookup: one query for ALL item_ids at once, grouped in SQL.
// Replaces per-item fetchItemStock() calls inside loops.
const fetchItemStockBatch = async (req, itemIds) => {
    if (!itemIds.length) return {};

    try {
        const cartItem = cartItemModel(req.tenantDB);
        const productModelInstance = productModel(req.tenantDB);
        const itemResult = await productModelInstance.findAll({ where: { isDelete: 0, id: { [Op.in]: itemIds } }, attributes: ["id", "unit"] })
        const results = await cartItem.findAll({
            where: {
                isDelete: 0,
                item_product_id: { [Op.in]: itemIds },
                cart_number: { [Op.ne]: null, [Op.not]: "" },
                stock_type: { [Op.ne]: 0 },
                [Op.or]: [
                    { cart_type: 4, reference_type: { [Op.ne]: 8 } },
                    { cart_type: 3, reference_type: { [Op.ne]: 9 } },
                    { cart_type: { [Op.in]: [6, 7, 8, 9, 10, 11] } },
                ],
            },
            attributes: [
                "item_product_id",
                [
                    req.tenantDB.literal(`
                        SUM(
                            CASE
                                WHEN cart_type IN (4, 6, 8, 10) THEN item_qty
                                WHEN cart_type IN (3, 7, 9, 11) THEN -item_qty
                                ELSE 0
                            END
                        )
                    `),
                    "calOpenQty",
                ],
            ],
            group: ["item_product_id"],
            raw: true,
        });

        const stockMap = {};
        const unitMap = {};
        results.forEach(r => {
            stockMap[r.item_product_id] = Number(r.calOpenQty) || 0;
        });
        itemResult.forEach(r => {
            unitMap[r.id] = r.unit || "";
        });
        return { stockMap, unitMap };

    } catch (error) {
        console.log("fetchItemStockBatch Error", error);
        return {};
    }
};

export const jobCardsSave = async (req) => {
    const { a_application_login_id, customer_id, order_item_id, product_qty, order_id } = req.body;
    try {
        const JobCardsModelInstance = JobCardsModel(req.tenantDB);
        const insert = await JobCardsModelInstance.create({
            a_application_login_id,
            contact_id: customer_id,
            order_id,
            item_id: order_item_id,
            production_qty: product_qty
        })

        if (!insert) {
            return resError({
                ack_msg: "Failed to create job card",
                developer_msg: "sometimes wend wrong",
            });
        }

        return resSuccess({
            ack_msg: "Job Card is created successfully",
            data: insert, // Ensure frontend picks up insert.id (job_card_id) from this response
        });

    } catch (error) {
        console.log("jobCardsSave Error", error);
        return resBadRequest({
            ack_msg: "UNKNOWN_ERROR_TRY_AGAIN",
            developer_msg: `error ${error.message || error}`,
        });
    }
}

export const printBom = async (req) => {
    try {
        const { id } = req.body;

        // Add your PDF generation logic here

        return resSuccess({
            ack_msg: "Print data generated successfully",
            data: { print_url: "/placeholder-print-url.pdf" }
        });
    } catch (error) {
        console.log("printBom Error", error);
        return resBadRequest({
            ack_msg: "UNKNOWN_ERROR_TRY_AGAIN",
            developer_msg: `error ${error.message || error}`,
        });
    }
}

export const submitUnifiedProductionEntry = async (req) => {
    try {
        const {
            a_application_login_id,
            job_id,
            order_item_id,
            produced_qty,
            finish_good_warehouse_id,
            entry_date,
            remark,
            team_member_id,
            consumption_items = [],
            rejection_items = []
        } = req.body;

        // Initialize Models
        const productModelInstance = productModel(req.tenantDB);
        const categoryModelInstance = categoryModel(req.tenantDB);
        const productionTransactionModelInstance = productionTransactionModel(req.tenantDB);
        const productionTransactionsItemsModelInstance = productionTransactionsItemsModel(req.tenantDB);

        // ==========================================
        // 1. SAVE PRODUCTION MASTER & ITEMS
        // ==========================================

        const totalConsumption = consumption_items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
        const totalRejection = rejection_items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);

        const productionMaster = await productionTransactionModelInstance.create({
            job_id,
            team_member: team_member_id || null,
            production_item_id: order_item_id || null,
            bom_id: null,
            production_qty: produced_qty,
            consumption_qty: totalConsumption,
            rejection_qty: totalRejection,
            date: entry_date,
            remark,
            a_application_login_id,
        });

        if (!productionMaster) {
            return resError({ ack_msg: "Failed to save production master record." });
        }

        const productionId = productionMaster.id;
        const productionItemsData = [];

        const formatProdItem = (item, entryType) => ({
            job_id,
            production_id: productionId,
            bom_id: null,
            process_id: item.process_id,
            entry_type: entryType,
            item_id: item.material_id,
            unit: null,
            qty: item.qty,
            warehouse: item.warehouse_id,
            a_application_login_id
        });

        rejection_items.forEach(item => productionItemsData.push(formatProdItem(item, '1')));
        consumption_items.forEach(item => productionItemsData.push(formatProdItem(item, '2')));

        if (productionItemsData.length > 0) {
            await productionTransactionsItemsModelInstance.bulkCreate(productionItemsData);
        }

        // ==========================================
        // 2. PRE-FETCH PRODUCT DATA (Cache)
        // ==========================================

        const allProductIds = [order_item_id, ...consumption_items.map(i => i.material_id), ...rejection_items.map(i => i.material_id)];
        const uniqueProductIds = [...new Set(allProductIds.filter(id => id))];

        const productCache = {};
        const categoryCache = {};

        await Promise.all(uniqueProductIds.map(async (id) => {
            const prod = await productModelInstance.findOne({ where: { isDelete: 0, id: id }, raw: true });
            if (prod) {
                productCache[id] = prod;
                if (prod.category_id && !categoryCache[prod.category_id]) {
                    const cat = await categoryModelInstance.findOne({ where: { isDelete: 0, id: prod.category_id }, raw: true });
                    categoryCache[prod.category_id] = cat?.category_name || "Uncategorized";
                }
            }
        }));

        // Variables to hold the returned stock IDs
        let fgStockId = null;
        let rejStockId = null;
        let consStockId = null;

        // ==========================================
        // 3A. FINISHED GOODS STOCK ADJUSTMENT (INWARD)
        // ==========================================
        if (produced_qty > 0 && productCache[order_item_id]) {
            const p = productCache[order_item_id];
            req.body.stockDetail = {
                stock_adjustment_type: "2", // Plus
                stock_date: entry_date,
                stock_remark: `Production FG INWARD (Job Card #${job_id})`
            };
            req.body.stockItem = [{
                product_id: order_item_id,
                product_name: p.product_name,
                warehouse_from: finish_good_warehouse_id,
                warehouse_to: null,
                qty: produced_qty,
                remark: remark ? `Job Card #${job_id} FG - ${remark}` : `Finished goods entry for Job Card #${job_id}`,
                category_id: p.category_id,
                category_name: categoryCache[p.category_id] || "Uncategorized",
                product_code: p.product_code
            }];

            const fgInsert = await inserStockAdjustment(req);
            if (fgInsert && fgInsert.ack === 1) fgStockId = fgInsert.inserted_id;
        }

        // ==========================================
        // 3B. REJECTION STOCK ADJUSTMENT (INWARD)
        // ==========================================
        if (rejection_items.length > 0) {
            const rejStockItems = [];
            rejection_items.forEach(item => {
                const p = productCache[item.material_id];
                if (p && item.qty > 0) {
                    rejStockItems.push({
                        product_id: item.material_id,
                        product_name: p.product_name,
                        warehouse_from: item.warehouse_id,
                        warehouse_to: null,
                        qty: item.qty,
                        remark: remark ? `Job Card #${job_id} Rej - ${remark}` : `Material rejection entry for Job Card #${job_id}`,
                        category_id: p.category_id,
                        category_name: categoryCache[p.category_id] || "Uncategorized",
                        product_code: p.product_code
                    });
                }
            });

            if (rejStockItems.length > 0) {
                req.body.stockDetail = {
                    stock_adjustment_type: "2", // Plus
                    stock_date: entry_date,
                    stock_remark: `Production REJECTION INWARD (Job Card #${job_id})`
                };
                req.body.stockItem = rejStockItems;

                const rejInsert = await inserStockAdjustment(req);
                if (rejInsert && rejInsert.ack === 1) rejStockId = rejInsert.inserted_id;
            }
        }

        // ==========================================
        // 3C. CONSUMPTION STOCK ADJUSTMENT (OUTWARD)
        // ==========================================
        if (consumption_items.length > 0) {
            const consStockItems = [];
            consumption_items.forEach(item => {
                const p = productCache[item.material_id];
                if (p && item.qty > 0) {
                    consStockItems.push({
                        product_id: item.material_id,
                        product_name: p.product_name,
                        warehouse_from: item.warehouse_id,
                        warehouse_to: null,
                        qty: item.qty,
                        remark: remark ? `Job Card #${job_id} Cons - ${remark}` : `Material consumption entry for Job Card #${job_id}`,
                        category_id: p.category_id,
                        category_name: categoryCache[p.category_id] || "Uncategorized",
                        product_code: p.product_code
                    });
                }
            });

            if (consStockItems.length > 0) {
                req.body.stockDetail = {
                    stock_adjustment_type: "3", // Minus
                    stock_date: entry_date,
                    stock_remark: `Production CONSUMPTION OUTWARD (Job Card #${job_id})`
                };
                req.body.stockItem = consStockItems;

                const consInsert = await inserStockAdjustment(req);
                if (consInsert && consInsert.ack === 1) consStockId = consInsert.inserted_id;
            }
        }

        // ==========================================
        // 4. UPDATE MASTER WITH STOCK IDs
        // ==========================================
        await productionTransactionModelInstance.update({
            finish_good_stock_adjustment_id: fgStockId,
            rejection_stock_adjustment_id: rejStockId,
            consumption_good_stock_adjustment_id: consStockId
        }, {
            where: { id: productionId }
        });

        return resSuccess({
            ack_msg: "Production entry, finished goods, consumption, and rejection recorded successfully."
        });

    } catch (error) {
        console.log("submitUnifiedProductionEntry Error", error);
        return resBadRequest({
            ack_msg: "UNKNOWN_ERROR_TRY_AGAIN",
            developer_msg: `error ${error.message || error}`,
        });
    }
}

export const fetchProductionList = async (req) => {
    try {
        const { a_application_login_id, job_id } = req.body;
        const findCompanyId = await getCompanyByLoginId(a_application_login_id);

        // Basic validation
        if (!job_id) {
            return resBadRequest({
                ack_msg: "Job ID is required.",
                developer_msg: "Missing job_id in req.body",
            });
        }

        // Initialize Models
        const productionTransactionModelInstance = productionTransactionModel(req.tenantDB);
        const productionTransactionsItemsModelInstance = productionTransactionsItemsModel(req.tenantDB);

        // 1. Fetch all production master entries for this job_id
        const productionList = await productionTransactionModelInstance.findAll({
            where: { job_id: job_id, isDelete: 0 },
            order: [['created_date_time', 'DESC']], // Newest first
            raw: true
        });

        // Return early if no records found
        if (!productionList || productionList.length === 0) {
            return resSuccess({
                ack_msg: "Production list fetched successfully.",
                data: []
            });
        }

        // Extract all production IDs to fetch their items in ONE query (Optimized)
        const productionIds = productionList.map(prod => prod.id);

        // 2. Bulk fetch all associated items for these production records
        const allProductionItems = await productionTransactionsItemsModelInstance.findAll({
            where: { production_id: productionIds, isDelete: 0 },
            attributes: ['production_id', 'entry_type'],
            raw: true
        });

        let activeTeamList;
        let activeTeamMap;

        activeTeamList = await loginModel.findAll(
            {
                where: {
                    id: {
                        [Op.in]: Sequelize.literal(`(
                        SELECT a_application_login_id
                        FROM company_vs_application_logins
                        WHERE isDelete=0 AND company_masters_id = '${findCompanyId.company_masters_id}'
                      )`)
                    },
                    isDelete: 0
                },
                attributes: ["username", "id"],
                raw: true
            }
        );
        activeTeamMap = new Map(
            activeTeamList.map(user => [user.id, user.username])
        );


        // 3. Map and format the response to exactly match the requested payload
        const formattedList = productionList.map((prod) => {
            // Filter items in-memory for this specific production entry
            const relatedItems = allProductionItems.filter(item => item.production_id === prod.id);

            // Entry Type '2' = Consumption, '1' = Rejection
            const consumptionCount = relatedItems.filter(item => item.entry_type === '2').length;
            const rejectionCount = relatedItems.filter(item => item.entry_type === '1').length;

            return {
                id: prod.id,
                job_id: prod.job_id,
                produced_qty: prod.production_qty || 0,
                entry_date: prod.date,
                remark: prod.remark || "",
                team_member_id: prod.team_member || null,
                team_member_name: activeTeamMap.get(Number(prod.team_member)) || null,
                consumption_count: consumptionCount,
                rejection_count: rejectionCount,
                created_date_time: prod.created_date_time
            };
        });

        return resSuccess({
            ack_msg: "Production list fetched successfully.",
            data: formattedList
        });

    } catch (error) {
        console.log("fetchProductionList Error", error);
        return resBadRequest({
            ack_msg: "UNKNOWN_ERROR_TRY_AGAIN",
            developer_msg: `error ${error.message || error}`,
        });
    }
}

export const deleteProductionEntry = async (req) => {
    try {
        const { a_application_login_id, id } = req.body;

        if (!id) {
            return resBadRequest({
                ack_msg: "Production Entry ID is required.",
                developer_msg: "Missing id in req.body",
            });
        }

        const productionTransactionModelInstance = productionTransactionModel(req.tenantDB);
        const productionTransactionsItemsModelInstance = productionTransactionsItemsModel(req.tenantDB);

        // Use your actual stock ledger models here
        const stockMasterModelInstance = cartModel(req.tenantDB);
        const stockItemModelInstance = cartItemModel(req.tenantDB);

        // 1. Verify the entry exists
        const entry = await productionTransactionModelInstance.findOne({
            where: { id: id, isDelete: 0 },
            raw: true
        });

        if (!entry) {
            return resError({ ack_msg: "Production entry not found or already deleted." });
        }

        // 2. Extract Stock IDs to delete
        const stockIdsToDelete = [
            entry.finish_good_stock_adjustment_id,
            entry.rejection_stock_adjustment_id,
            entry.consumption_good_stock_adjustment_id
        ].filter(stockId => stockId !== null && stockId !== undefined);

        // 3. Delete Stock Adjustments safely by exact ID
        if (stockIdsToDelete.length > 0) {
            // Soft delete stock master records
            await stockMasterModelInstance.update(
                { isDelete: 1, modified_date: new Date() },
                { where: { id: stockIdsToDelete } }
            );

            // Soft delete stock child items 
            // (Ensure 'stock_adjustment_master_id' matches your table's actual foreign key column)
            await stockItemModelInstance.update(
                { isDelete: 1, modified_date: new Date() },
                { where: { cart_id: stockIdsToDelete } }
            );
        }

        // 4. Soft-delete the master production transaction
        await productionTransactionModelInstance.update(
            { isDelete: 1, modified_date: new Date() },
            { where: { id: id } }
        );

        // 5. Soft-delete all child production items
        await productionTransactionsItemsModelInstance.update(
            { isDelete: 1, modified_date: new Date() },
            { where: { production_id: id } }
        );

        return resSuccess({
            ack_msg: "Production entry and related stock adjustments deleted successfully."
        });

    } catch (error) {
        console.log("deleteProductionEntry Error", error);
        return resBadRequest({
            ack_msg: "UNKNOWN_ERROR_TRY_AGAIN",
            developer_msg: `error ${error.message || error}`,
        });
    }
}

export const deleteJobCard = async (req) => {
    try {
        const { a_application_login_id, id } = req.body;

        if (!id) {
            return resBadRequest({
                ack_msg: "Job Card ID is required.",
                developer_msg: "Missing id in req.body",
            });
        }

        const JobCardsModelInstance = JobCardsModel(req.tenantDB);
        const productionTransactionModelInstance = productionTransactionModel(req.tenantDB);

        // 1. Check if any production entries exist for this job card
        const activeProductionCount = await productionTransactionModelInstance.count({
            where: { job_id: id, isDelete: 0 }
        });

        // 2. Block deletion if production entries exist
        if (activeProductionCount > 0) {
            return resError({
                ack_msg: "Cannot delete Job Card. Please delete all associated Production Entries first.",
                developer_msg: `Found ${activeProductionCount} active production entries.`
            });
        }

        // 3. Perform soft delete
        const updated = await JobCardsModelInstance.update(
            { isDelete: 1, modified_date: new Date() },
            { where: { id: id, isDelete: 0 } }
        );

        if (updated[0] === 0) {
            return resError({ ack_msg: "Job Card not found or already deleted." });
        }

        return resSuccess({ ack_msg: "Job Card deleted successfully." });

    } catch (error) {
        console.log("deleteJobCard Error", error);
        return resBadRequest({
            ack_msg: "UNKNOWN_ERROR_TRY_AGAIN",
            developer_msg: `error ${error.message || error}`,
        });
    }
}


export const fetchWarehouseStockBatch = async (req) => {
    try {
        const { a_application_login_id, items } = req.body;

        // 1. Basic validation
        if (!items || !Array.isArray(items) || items.length === 0) {
            return resBadRequest({
                ack_msg: "Invalid payload.",
                developer_msg: "items array is missing or empty."
            });
        }

        // 2. Extract unique material IDs to optimize the DB query
        const materialIds = [...new Set(items.map(item => item.material_id))];

        const cartItemModelInstance = cartItemModel(req.tenantDB);

        // 3. Execute your exact stock calculation logic, grouped by product AND warehouse
        const stockResults = await cartItemModelInstance.findAll({
            where: {
                isDelete: 0,
                item_product_id: { [Op.in]: materialIds },
                cart_number: { [Op.ne]: null, [Op.not]: "" },
                stock_type: { [Op.ne]: 0 },
                [Op.or]: [
                    { cart_type: 4, reference_type: { [Op.ne]: 8 } },
                    { cart_type: 3, reference_type: { [Op.ne]: 9 } },
                    { cart_type: { [Op.in]: [6, 7, 8, 9, 10, 11] } },
                ],
            },
            attributes: [
                "item_product_id",
                "item_warehouse_id", // Added so we know which warehouse has the stock
                [
                    req.tenantDB.literal(`
                        SUM(
                            CASE
                                WHEN cart_type IN (4, 6, 8, 10) THEN item_qty
                                WHEN cart_type IN (3, 7, 9, 11) THEN -item_qty
                                ELSE 0
                            END
                        )
                    `),
                    "calOpenQty",
                ],
            ],
            group: ["item_product_id", "item_warehouse_id"], // Group by both
            raw: true,
        });

        // 4. Map the database results back to the requested payload format
        const responseItems = items.map(reqItem => {
            let availableQty = 0;

            if (reqItem.warehouse_id === -1) {
                // Sum the stock across ALL warehouses for this material
                const matchingStocks = stockResults.filter(s => s.item_product_id == reqItem.material_id);
                availableQty = matchingStocks.reduce((sum, s) => sum + (Number(s.calOpenQty) || 0), 0);
            } else {
                // Match the exact material and warehouse combination
                const stockRecord = stockResults.find(
                    s => s.item_product_id == reqItem.material_id && s.item_warehouse_id == reqItem.warehouse_id
                );
                availableQty = stockRecord ? (Number(stockRecord.calOpenQty) || 0) : 0;
            }

            return {
                material_id: reqItem.material_id,
                warehouse_id: reqItem.warehouse_id,
                available_qty: availableQty
            };
        });

        // 5. Return formatted success response
        return resSuccess({
            ack_msg: "Warehouse stock fetched successfully",
            data: {
                item: responseItems
            }
        });

    } catch (error) {
        console.log("fetchWarehouseStockBatch Error:", error);
        return resBadRequest({
            ack_msg: "UNKNOWN_ERROR_TRY_AGAIN",
            developer_msg: `error ${error.message || error}`,
        });
    }
};

export const assignTeamMemberToJob = async (req) => {
    const {
        checkedOptions,
        jobId,
        a_application_login_id,
    } = req.body;

    try {
        const JobCardsModelInstance = JobCardsModel(req.tenantDB);
        const isExistData = await JobCardsModelInstance.findOne({
            where: { id: jobId, isDelete: 0 },
            raw: true
        });

        if (!isExistData) {
            return resError({
                ack_msg: "Job Card does not exist",
                developer_msg: "Job Card does not exist",
            });
        }

        let teamMemberIds = "";
        if (checkedOptions && checkedOptions.length > 0) {
            teamMemberIds = checkedOptions.join(",");
        }

        const result = await JobCardsModelInstance.update(
            {
                team_assign_ids: teamMemberIds,
            },
            {
                where: { id: jobId, isDelete: 0 },
            }
        );

        if (result) {
            return resSuccess({
                ack_msg: checkedOptions.length > 1 ? "Team Members assigned successfully" : "Team Member assigned successfully",
                data: { item: result },
            });
        } else {
            return resError();
        }

    } catch (error) {
        console.log("assignTeamMemberToJob error", error)
        return resBadRequest({
            ack_msg: " ",
            developer_msg: `${error.message}`,
        });
    }
};

export const assignLabelToJobCard = async (req) => {
    const {
        checkedOptions,
        jobId,
        a_application_login_id,
    } = req.body;

    try {
        const JobCardsModelInstance = JobCardsModel(req.tenantDB);
        const isExistData = await JobCardsModelInstance.findOne({
            where: { id: jobId, isDelete: 0 },
            raw: true
        });

        if (!isExistData) {
            return resError({
                ack_msg: "Job Card does not exist",
                developer_msg: "Job Card does not exist",
            });
        }

        let labelIds = "";
        if (checkedOptions && checkedOptions.length > 0) {
            labelIds = checkedOptions.join(",");
        }

        const result = await JobCardsModelInstance.update(
            {
                label_ids: labelIds,
            },
            {
                where: { id: jobId, isDelete: 0 },
            }
        );

        if (result) {
            return resSuccess({
                ack_msg: checkedOptions.length > 1 ? "Labels assigned successfully" : "Label assigned successfully",
                data: { item: result },
            });
        } else {
            return resError();
        }

    } catch (error) {
        console.log("assignLabelToJobCard error", error)
        return resBadRequest({
            ack_msg: " ",
            developer_msg: `${error.message}`,
        });
    }
};

export const assignStatusToJobCard = async (req) => {
    const {
        checkedOptions,
        jobId,
        a_application_login_id,
    } = req.body;

    try {
        const JobCardsModelInstance = JobCardsModel(req.tenantDB);
        const isExistData = await JobCardsModelInstance.findOne({
            where: { id: jobId, isDelete: 0 },
            raw: true
        });

        if (!isExistData) {
            return resError({
                ack_msg: "Job Card does not exist",
                developer_msg: "Job Card does not exist",
            });
        }

        let statusId = 0;
        if (checkedOptions) {
            statusId = checkedOptions;
        }

        const result = await JobCardsModelInstance.update(
            {
                status_id: statusId,
            },
            {
                where: { id: jobId, isDelete: 0 },
            }
        );

        if (result) {
            return resSuccess({
                ack_msg: "Status Updated successfully",
                data: { item: result },
            });
        } else {
            return resError();
        }

    } catch (error) {
        console.log("assignStatusToJobCard error", error)
        return resBadRequest({
            ack_msg: " ",
            developer_msg: `${error.message}`,
        });
    }
};

export const updateJobCardQty = async (req) => {
    try {
        const { a_application_login_id, id, product_qty } = req.body;

        // 1. Basic field validation
        if (!id) {
            return resBadRequest({
                ack_msg: "Job Card ID is required.",
                developer_msg: "Missing 'id' field in req.body",
            });
        }

        if (product_qty === undefined || product_qty === null || Number(product_qty) <= 0) {
            return resBadRequest({
                ack_msg: "Valid product quantity is required.",
                developer_msg: "Missing or invalid 'product_qty' field in req.body",
            });
        }

        const JobCardsModelInstance = JobCardsModel(req.tenantDB);

        // 2. Perform the update on the target job card
        const [updatedRowsCount] = await JobCardsModelInstance.update(
            {
                production_qty: Number(product_qty),
                modified_date: new Date()
            },
            {
                where: {
                    id: id,
                    isDelete: 0
                }
            }
        );

        // 3. Verify if a record was actually matched and altered
        if (updatedRowsCount === 0) {
            return resError({
                ack_msg: "Job Card not found or already deleted.",
                developer_msg: `No active job card matches ID ${id}`
            });
        }

        return resSuccess({
            ack_msg: "Job card quantity updated successfully."
        });

    } catch (error) {
        console.log("updateJobCardQty Error:", error);
        return resBadRequest({
            ack_msg: "UNKNOWN_ERROR_TRY_AGAIN",
            developer_msg: `error ${error.message || error}`,
        });
    }
}

export const fetchProductionEntryDetail = async (req) => {
    try {
        const { a_application_login_id, id } = req.body;

        if (!id) {
            return resBadRequest({
                ack_msg: "Production Entry ID is required.",
                developer_msg: "Missing id in req.body",
            });
        }

        const productionTransactionModelInstance = productionTransactionModel(req.tenantDB);
        const productionTransactionsItemsModelInstance = productionTransactionsItemsModel(req.tenantDB);
        const productModelInstance = productModel(req.tenantDB);

        const prodMaster = await productionTransactionModelInstance.findOne({
            where: { id: id, isDelete: 0 },
            raw: true
        });

        if (!prodMaster) {
            return resError({ ack_msg: "Production entry not found." });
        }

        const prodItems = await productionTransactionsItemsModelInstance.findAll({
            where: { production_id: id, isDelete: 0 },
            raw: true
        });

        const productIds = prodItems.map(item => item.item_id).filter(id => id);
        let products = [];
        if (productIds.length > 0) {
            products = await productModelInstance.findAll({
                where: { id: productIds },
                attributes: ["id", "product_name", "unit"],
                raw: true
            });
        }
        const productMap = new Map(products.map(p => [p.id, p]));

        const consumption_items = [];
        const rejection_items = [];

        prodItems.forEach(item => {
            const pInfo = productMap.get(item.item_id) || {};
            const payloadItem = {
                process_id: item.process_id,
                material_id: item.item_id,
                material_name: pInfo.product_name || `Material #${item.item_id}`,
                unit: pInfo.unit || "",
                warehouse_id: item.warehouse,
                qty: Number(item.qty) || 0
            };
            if (item.entry_type === '2') { // 2 = consumption
                consumption_items.push(payloadItem);
            } else if (item.entry_type === '1') { // 1 = rejection
                rejection_items.push(payloadItem);
            }
        });

        const detail = {
            id: prodMaster.id,
            job_id: prodMaster.job_id,
            produced_qty: prodMaster.production_qty || 0,
            finish_good_warehouse_id: prodMaster.finish_good_warehouse_id || null,
            entry_date: prodMaster.date,
            remark: prodMaster.remark || "",
            team_member_id: prodMaster.team_member || null,
            consumption_items,
            rejection_items
        };

        return resSuccess({
            ack_msg: "Production entry details fetched successfully.",
            data: detail
        });

    } catch (error) {
        console.log("fetchProductionEntryDetail Error", error);
        return resBadRequest({
            ack_msg: "UNKNOWN_ERROR_TRY_AGAIN",
            developer_msg: `error ${error.message || error}`,
        });
    }
};