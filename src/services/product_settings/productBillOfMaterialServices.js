import fs from "fs-extra";
import path from "path";
import Sequelize, { Op } from "sequelize";
import companyModel from "../../models/company_setup/companyModel.js";
import { machineManagementModel } from "../../models/masters/machineManagementModel.js";
import { bomVsProcessVsConsAndRejctsModel } from "../../models/product_settings/bomProcessVsConsAndRejctsModel.js";
import { bomVsProcessListsModel } from "../../models/product_settings/bomVsProcessListsModel.js";
import { processMastersModel } from "../../models/product_settings/processMastersModel.js";
import { productBillOfMaterialModel } from "../../models/product_settings/productBillOfMaterialModel.js";
import { productModel } from "../../models/product_settings/productModel.js";
import { PRODUCT_BOM_IMG_LINK_EXTENDED, PRODUCT_IMG_LINK_EXTENDED } from "../../utils/appConstants.js";
import { resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../commonServices.js";


export const createBomDetails = async (req) => {
    const {
        product_id,
        bom_name,
        qty,
        unit,
        bom_review_frequency,
        a_application_login_id
    } = req.body;

    const bomDocFile = req.files?.bom_document?.[0];
    const bomDrawingFile = req.files?.bom_drawing?.[0];

    const findCompanyId = await getCompanyByLoginId(a_application_login_id);

    let pdfDirectoryPath;
    if (bomDocFile || bomDrawingFile) {
        pdfDirectoryPath = path.join(
            process.cwd(),
            "media-folder",
            "product_bom",
            findCompanyId.company_masters_id.toString()
        );
    }

    try {
        const productBillOfMaterialModelInstance = productBillOfMaterialModel(req.tenantDB)
        const isExistData = await productBillOfMaterialModelInstance.findOne({
            where: { product_id: product_id, isDelete: "0" },
            raw: true
        });

        let docPath = "";
        let drawingPath = "";

        // Create folder if needed
        if (bomDocFile || bomDrawingFile) {
            await fs.mkdirp(pdfDirectoryPath);
        }

        // Upload product_doc
        if (bomDocFile) {
            const fileName = bomDocFile.filename;

            const destinationPath = path.join(pdfDirectoryPath, fileName);

            await fs.move(bomDocFile.path, destinationPath);

            docPath = `${findCompanyId.company_masters_id}/${fileName}`;
        }

        // Upload product_manual (you can treat this as bom_drawing)
        if (bomDrawingFile) {
            const fileName = bomDrawingFile.filename;

            const destinationPath = path.join(pdfDirectoryPath, fileName);

            await fs.move(bomDrawingFile.path, destinationPath);

            drawingPath = `${findCompanyId.company_masters_id}/${fileName}`;
        }

        if (isExistData) {
            const resultUpdateProductBillOfMaterial = await productBillOfMaterialModelInstance.update(
                {
                    bom_name: bom_name,
                    qty: qty,
                    unit: unit,
                    bom_document: docPath || isExistData.bom_document || "",
                    bom_drawing: drawingPath || isExistData.bom_drawing || "",
                    bom_review_frequency: bom_review_frequency,
                    company_masters_id: findCompanyId.company_masters_id,
                    a_application_login_id: a_application_login_id
                },
                {
                    where: { product_id: product_id, isDelete: "0" },
                }
            );

            if (resultUpdateProductBillOfMaterial) {
                return resSuccess({
                    ack_msg: "Product BOM updated successfully",
                    data: { item: resultUpdateProductBillOfMaterial },
                });
            } else {
                return resError();
            }
        } else {
            let totalRows = await productBillOfMaterialModelInstance.count({
                where: {
                    isDelete: "0"
                }
            });

            totalRows++;

            const resultCreateProductBillOfMaterial = await productBillOfMaterialModelInstance.create(
                {
                    product_id: product_id,
                    bom_number: `#${totalRows}`,
                    bom_name: bom_name,
                    qty: qty,
                    unit: unit,
                    bom_document: docPath,
                    bom_drawing: drawingPath,
                    bom_review_frequency: bom_review_frequency,
                    company_masters_id: findCompanyId.company_masters_id,
                    a_application_login_id: a_application_login_id
                },
            );
            if (resultCreateProductBillOfMaterial) {
                return resSuccess({
                    ack_msg: "Product BOM created successfully",
                    data: { item: resultCreateProductBillOfMaterial },
                });
            } else {
                return resError();
            }
        }

    } catch (error) {
        return resBadRequest({
            ack_msg: " ",
            developer_msg: `${error.message}`,
        });
    }
};

export const bomDetailsGet = async (req) => {
    try {
        const {
            product_id
        } = req.body

        const productBillOfMaterialModelInstance = productBillOfMaterialModel(req.tenantDB)
        const result = await productBillOfMaterialModelInstance.findOne({
            where: { isDelete: "0", product_id: product_id },
            attributes: [
                "id",
                "bom_number",
                "bom_name",
                "qty",
                "unit",
                "bom_document",
                "bom_drawing",
                "bom_review_frequency",
            ],
        });

        if (result.bom_document) {
            result.bom_document = PRODUCT_BOM_IMG_LINK_EXTENDED + result.bom_document
        }

        if (result.bom_drawing) {
            result.bom_drawing = PRODUCT_BOM_IMG_LINK_EXTENDED + result.bom_drawing
        }

        if (result) {
            return resSuccess({
                data: { item: result },
            });
        } else {
            return resError({
                ack_msg: "No BOM Details found",
                developer_msg: "Data not found",
            });
        }
    } catch (e) {
        return resBadRequest({ developer_msg: `error ${e}` });
    }
};

export const bomDetailsDelete = async (req) => {
    const {
        id,
    } = req.body;

    try {
        const productBillOfMaterialModelInstance = productBillOfMaterialModel(req.tenantDB)
        const isExistBomData = await productBillOfMaterialModelInstance.findOne({
            where: { product_id: id },
            raw: true
        });

        if (!isExistBomData) {
            return resError({
                ack_msg: "Bill Of Material does not exist",
                developer_msg: "Bill Of Material does not exist",
            });
        }

        const resultOfBomDelete = await productBillOfMaterialModelInstance.update(
            {
                isDelete: "1"
            },
            {
                where: { product_id: id }
            }
        );

        const bomVsProcessListsModelInstance = bomVsProcessListsModel(req.tenantDB)
        const isExistProcessListData = await bomVsProcessListsModelInstance.findAll({
            where: { product_id: id },
            raw: true
        });

        if (isExistProcessListData.length !== 0) {
            const resultOfProcessListDeletion = await bomVsProcessListsModelInstance.update(
                {
                    isDelete: "1"
                },
                {
                    where: { product_id: id }
                }
            );
        }

        const bomVsProcessVsConsAndRejctsModelInstance = bomVsProcessVsConsAndRejctsModel(req.tenantDB)
        const isExistItemData = await bomVsProcessVsConsAndRejctsModelInstance.findAll({
            where: { master_product_id: id },
            raw: true
        });

        let resultOfItemsDeletion;

        if (isExistItemData.length !== 0) {
            resultOfItemsDeletion = await bomVsProcessVsConsAndRejctsModelInstance.update(
                {
                    isDelete: "1"
                },
                {
                    where: { master_product_id: id }
                }
            );
        }

        if (resultOfItemsDeletion || resultOfBomDelete) {
            return resSuccess({
                ack_msg: "Bill Of Material Deleted successfully",
                data: { item: resultOfItemsDeletion ? resultOfItemsDeletion : resultOfBomDelete },
            });
        } else {
            return resError();
        }

    } catch (error) {
        console.log("bomDetailsDelete error", error)
        return resBadRequest({
            ack_msg: " ",
            developer_msg: `${error.message}`,
        });
    }
};

export const processMastersCreate = async (req) => {
    const {
        process_name,
        color,
        a_application_login_id
    } = req.body;

    if (!process_name) {
        return resError({
            ack_msg: "Please Enter Process Name",
            developer_msg: "Please Enter Process Name",
        });
    }

    const findCompanyId = await getCompanyByLoginId(a_application_login_id);

    try {
        const processMastersModelInstance = processMastersModel(req.tenantDB)
        const isExistData = await processMastersModelInstance.findOne({
            where: { process_name: process_name, isDelete: "0" },
            raw: true
        });

        if (isExistData) {
            return resError({
                ack_msg: "Process name already exist",
                developer_msg: "Process already exist",
            });
        }

        const resultCreateProcessMasters = await processMastersModelInstance.create(
            {
                process_name: process_name,
                color: color,
                a_application_login_id: a_application_login_id,
                company_masters_id: findCompanyId.company_masters_id,
            },
        );

        if (resultCreateProcessMasters) {
            return resSuccess({
                ack_msg: "Process Masters created successfully",
                data: { item: resultCreateProcessMasters },
            });
        } else {
            return resError();
        }

    } catch (error) {
        console.log("processMastersCreate error", error);
        return resBadRequest({
            ack_msg: " ",
            developer_msg: `${error.message}`,
        });
    }
};

export const processMastersUpdate = async (req) => {
    const {
        id,
        process_name,
        color,
    } = req.body;

    try {
        const processMastersModelInstance = processMastersModel(req.tenantDB)
        const isExistData = await processMastersModelInstance.findOne({
            where: { process_name, isDelete: "0", id: { [Op.ne]: id } },
            raw: true
        });

        if (isExistData) {
            return resError({
                ack_msg: "Process name already exist",
                developer_msg: "Process name already exist",
            });
        }

        const resultUpdateProcessMasters = await processMastersModelInstance.update(
            {
                process_name: process_name,
                color: color,
            },
            { where: { id } }
        );

        if (resultUpdateProcessMasters) {
            return resSuccess({
                ack_msg: "Process Masters updated successfully",
                data: { item: resultUpdateProcessMasters },
            });
        } else {
            return resError();
        }

    } catch (error) {
        console.log("processMastersUpdate error", error)
        return resBadRequest({
            ack_msg: " ",
            developer_msg: `${error.message}`,
        });
    }
};

export const processMastersGet = async (req) => {
    try {

        const processMastersModelInstance = processMastersModel(req.tenantDB)
        const result = await processMastersModelInstance.findAll({
            where: { isDelete: "0" },
            attributes: [
                "process_name",
                "color",
                "id"
            ],
        });

        if (result) {
            return resSuccess({
                data: { item: result },
            });
        } else {
            return resError({
                ack_msg: "No Process Names found",
                developer_msg: "Data not found",
            });
        }
    } catch (e) {
        console.log("processMastersGet error", e)
        return resBadRequest({ developer_msg: `error ${e}` });
    }
};

export const processListCreate = async (req) => {
    const {
        bom_id,
        product_id,
        process_id,
        workstation_id,
        required_time,
        process_cost,
        manpower_cost,
        a_application_login_id
    } = req.body;

    const findCompanyId = await getCompanyByLoginId(a_application_login_id);

    try {
        const bomVsProcessListsModelInstance = bomVsProcessListsModel(req.tenantDB)

        const resultCreateBomVsProcessLists = await bomVsProcessListsModelInstance.create(
            {
                bom_id,
                product_id,
                process_id,
                workstation_id,
                required_time,
                process_cost,
                manpower_cost,
                a_application_login_id,
                company_masters_id: findCompanyId.company_masters_id,
            },
        );

        if (resultCreateBomVsProcessLists) {
            return resSuccess({
                ack_msg: "Process created successfully",
                data: { item: resultCreateBomVsProcessLists },
            });
        } else {
            return resError();
        }

    } catch (error) {
        console.log("processListCreate error", error);
        return resBadRequest({
            ack_msg: " ",
            developer_msg: `${error.message}`,
        });
    }
};

export const processListUpdate = async (req) => {
    const {
        id,
        bom_id,
        product_id,
        process_id,
        workstation_id,
        required_time,
        process_cost,
        manpower_cost,
    } = req.body;

    try {
        const bomVsProcessListsModelInstance = bomVsProcessListsModel(req.tenantDB)
        const isExistData = await bomVsProcessListsModelInstance.findOne({
            where: { id, bom_id, product_id },
            raw: true
        });

        if (!isExistData) {
            return resError({
                ack_msg: "Process does not exist",
                developer_msg: "Process does not exist",
            });
        }

        const resultUpdateBomVsProcessLists = await bomVsProcessListsModelInstance.update(
            {
                process_id,
                workstation_id,
                required_time,
                process_cost,
                manpower_cost
            },
            {
                where: { id, bom_id, product_id }
            }
        );

        if (resultUpdateBomVsProcessLists) {
            return resSuccess({
                ack_msg: "Process updated successfully",
                data: { item: resultUpdateBomVsProcessLists },
            });
        } else {
            return resError();
        }

    } catch (error) {
        console.log("processListUpdate error", error)
        return resBadRequest({
            ack_msg: " ",
            developer_msg: `${error.message}`,
        });
    }
};

export const processListsGet = async (req) => {

    const {
        product_id
    } = req.body;

    try {

        const bomVsProcessListsModelInstance = bomVsProcessListsModel(req.tenantDB)
        const result = await bomVsProcessListsModelInstance.findAll({
            where: { isDelete: "0", product_id },
            attributes: [
                "id",
                "process_id",
                "workstation_id",
                "required_time",
                "process_cost",
                "manpower_cost",
                [
                    Sequelize.literal(`(
                            SELECT process_masters.process_name
                            FROM process_masters
                            WHERE process_masters.id = bom_vs_process_lists.process_id
                              AND process_masters.isDelete = 0
                            LIMIT 1
                          )`),
                    "process_name"
                ]
            ],
            raw: true
        });

        for (let item of result) {
            let workstationIds = [];

            if (typeof item.workstation_id === "string") {
                workstationIds = item.workstation_id.split(",").map(id => Number(id));
            } else if (Array.isArray(item.workstation_id)) {
                workstationIds = item.workstation_id.map(id => Number(id));
            } else if (typeof item.workstation_id === "number") {
                workstationIds = [item.workstation_id];
            }

            let machine_name = "";

            if (workstationIds.length > 0) {
                const machineManagementModelInstance = machineManagementModel(req.tenantDB);
                const workstationList = await machineManagementModelInstance.findAll({
                    where: {
                        id: { [Op.in]: workstationIds },
                        isDelete: 0,
                    },
                    attributes: ["machine_name"],
                    raw: true
                });

                machine_name = workstationList
                    .map(w => w.machine_name)
                    .filter(Boolean)
                    .join(", ");
            }

            item.machine_name = machine_name;
        }

        return resSuccess({
            data: { item: result },
        });

    } catch (e) {
        console.log("processListsGet error", e)
        return resBadRequest({ developer_msg: `error ${e}` });
    }
};

export const processListDelete = async (req) => {
    const {
        id,
    } = req.body;

    try {
        const bomVsProcessListsModelInstance = bomVsProcessListsModel(req.tenantDB)
        const isExistData = await bomVsProcessListsModelInstance.findOne({
            where: { id },
            raw: true
        });

        if (!isExistData) {
            return resError({
                ack_msg: "Process does not exist",
                developer_msg: "Process does not exist",
            });
        }

        const resultUpdateBomVsProcessLists = await bomVsProcessListsModelInstance.update(
            {
                isDelete: "1"
            },
            {
                where: { id }
            }
        );

        if (resultUpdateBomVsProcessLists) {
            return resSuccess({
                ack_msg: "Process Deleted successfully",
                data: { item: resultUpdateBomVsProcessLists },
            });
        } else {
            return resError();
        }

    } catch (error) {
        console.log("processListDelete error", error)
        return resBadRequest({
            ack_msg: " ",
            developer_msg: `${error.message}`,
        });
    }
};

export const costingUpdate = async (req) => {
    const {
        id,
        product_id,
        extra_charges_1,
        extra_charges_2,
        sales_rate
    } = req.body;

    try {
        const productBillOfMaterialModelInstance = productBillOfMaterialModel(req.tenantDB)
        const isExistData = await productBillOfMaterialModelInstance.findOne({
            where: { id, product_id },
            raw: true
        });

        if (!isExistData) {
            return resError({
                ack_msg: "BOM does not exist",
                developer_msg: "BOM does not exist",
            });
        }

        const resultUpdateCosting = await productBillOfMaterialModelInstance.update(
            {
                extra_charges_1,
                extra_charges_2,
                sales_rate
            },
            {
                where: { id, product_id }
            }
        );

        if (resultUpdateCosting) {
            return resSuccess({
                ack_msg: "Costing updated successfully",
                data: { item: resultUpdateCosting },
            });
        } else {
            return resError();
        }

    } catch (error) {
        console.log("costingUpdate error", error)
        return resBadRequest({
            ack_msg: " ",
            developer_msg: `${error.message}`,
        });
    }
};

export const costingGet = async (req) => {

    const {
        product_id
    } = req.body;

    try {

        const productBillOfMaterialModelInstance = productBillOfMaterialModel(req.tenantDB)
        const result = await productBillOfMaterialModelInstance.findOne({
            where: { isDelete: "0", product_id },
            attributes: [
                "extra_charges_1",
                "extra_charges_2",
                "sales_rate",
            ],
            raw: true
        });

        if (result) {
            return resSuccess({
                ack_msg: "Costing got successfully",
                data: { item: result },
            });
        } else {
            return resError();
        }

    } catch (e) {
        console.log("costingGet error", e)
        return resBadRequest({ developer_msg: `error ${e}` });
    }
};

export const itemListCreate = async (req) => {
    const {
        bom_id,
        master_product_id,
        process_id,
        type,
        item_id,
        qty,
        unit,
        remark,
        reuse,
        a_application_login_id
    } = req.body;

    const findCompanyId = await getCompanyByLoginId(a_application_login_id);

    try {
        const bomVsProcessVsConsAndRejctsModelInstance = bomVsProcessVsConsAndRejctsModel(req.tenantDB)

        const isExistData = await bomVsProcessVsConsAndRejctsModelInstance.findOne({
            where: { item_id, process_id, type, isDelete: "0" },
            raw: true
        });

        if (isExistData) {
            return resError({
                ack_msg: "Item already exist",
                developer_msg: "Item already exist",
            });
        }

        const resultCreateBomVsProcessItemLists = await bomVsProcessVsConsAndRejctsModelInstance.create(
            {
                bom_id,
                master_product_id,
                process_id,
                type,
                item_id,
                qty,
                unit,
                remark,
                a_application_login_id,
                is_reusable: reuse,
                company_masters_id: findCompanyId.company_masters_id,
            },
        );

        if (resultCreateBomVsProcessItemLists) {
            return resSuccess({
                ack_msg: "Item created successfully",
                data: { item: resultCreateBomVsProcessItemLists },
            });
        } else {
            return resError({
                ack_msg: "Data Not Added",
                data: "Data Not Added",
            });
        }

    } catch (error) {
        console.log("itemListCreate error", error);
        return resBadRequest({
            ack_msg: " ",
            developer_msg: `${error.message}`,
        });
    }
};

export const itemListGet = async (req) => {

    const {
        process_id,
        master_product_id,
    } = req.body;

    try {

        const bomVsProcessVsConsAndRejctsModelInstance = bomVsProcessVsConsAndRejctsModel(req.tenantDB)
        const result = await bomVsProcessVsConsAndRejctsModelInstance.findAll({
            where: { isDelete: "0", master_product_id, process_id },
            attributes: [
                "id",
                "item_id",
                "qty",
                "unit",
                "type",
                "remark",
                "is_reusable",
                [
                    Sequelize.literal(`(
                                SELECT products.product_name
                                FROM products
                                WHERE products.id = bom_process_vs_cons_rejcts.item_id
                                AND products.isDelete = 0
                                LIMIT 1
                            )`),
                    "product_name"
                ],
                [
                    Sequelize.literal(`(
                                SELECT product_unit_masters.unit
                                FROM product_unit_masters
                                WHERE product_unit_masters.id = bom_process_vs_cons_rejcts.unit
                                AND product_unit_masters.isDelete = 0
                                LIMIT 1
                            )`),
                    "unit_name"
                ],
                [
                    Sequelize.literal(`(
                                SELECT products.purchase_rate
                                FROM products
                                WHERE products.id = bom_process_vs_cons_rejcts.item_id
                                AND products.isDelete = 0
                                AND bom_process_vs_cons_rejcts.type = 1
                                LIMIT 1
                            )`),
                    "purchase_rate"
                ],
                [
                    Sequelize.literal(`(
                                SELECT products.rate
                                FROM products
                                WHERE products.id = bom_process_vs_cons_rejcts.item_id
                                AND products.isDelete = 0
                                AND bom_process_vs_cons_rejcts.type = 2
                                LIMIT 1
                            )`),
                    "rate"
                ]
            ],
            raw: true
        });

        if (result) {
            return resSuccess({
                ack_msg: "Items got successfully",
                data: { item: result },
            });
        } else {
            return resError();
        }

    } catch (e) {
        console.log("itemListsGet error", e)
        return resBadRequest({ developer_msg: `error ${e}` });
    }
};

export const itemListDelete = async (req) => {
    const {
        id,
    } = req.body;

    try {
        const bomVsProcessVsConsAndRejctsModelInstance = bomVsProcessVsConsAndRejctsModel(req.tenantDB)
        const isExistData = await bomVsProcessVsConsAndRejctsModelInstance.findOne({
            where: { id },
            raw: true
        });

        if (!isExistData) {
            return resError({
                ack_msg: "Item does not exist",
                developer_msg: "Item does not exist",
            });
        }

        const resultCreateBomVsProcessItemLists = await bomVsProcessVsConsAndRejctsModelInstance.update(
            {
                isDelete: "1"
            },
            {
                where: { id }
            }
        );

        if (resultCreateBomVsProcessItemLists) {
            return resSuccess({
                ack_msg: "Item Deleted successfully",
                data: { item: resultCreateBomVsProcessItemLists },
            });
        } else {
            return resError();
        }

    } catch (error) {
        console.log("itemListDelete error", error)
        return resBadRequest({
            ack_msg: " ",
            developer_msg: `${error.message}`,
        });
    }
};

export const costingRatesGet = async (req) => {

    const {
        bom_id
    } = req.body;

    try {
        const bomVsProcessListsModelInstance = bomVsProcessListsModel(req.tenantDB);
        const resultProcessList = await bomVsProcessListsModelInstance.findAll({
            where: { isDelete: "0", bom_id },
            attributes: [
                "process_cost",
                "manpower_cost"
            ],
            raw: true
        });

        let totalProcessCost = 0;
        let totalManpowerCost = 0;

        resultProcessList.forEach((item) => {
            totalProcessCost += Number(item.process_cost || 0);
            totalManpowerCost += Number(item.manpower_cost || 0);
        });

        const bomVsProcessVsConsAndRejctsModelInstance = bomVsProcessVsConsAndRejctsModel(req.tenantDB);
        const resultItemList = await bomVsProcessVsConsAndRejctsModelInstance.findAll({
            where: { isDelete: "0", bom_id },
            attributes: [
                "item_id",
                "qty",
                "type",
                "is_reusable",
                [
                    Sequelize.literal(`(
                                SELECT products.purchase_rate
                                FROM products
                                WHERE products.id = bom_process_vs_cons_rejcts.item_id
                                AND products.isDelete = 0
                                AND bom_process_vs_cons_rejcts.type = 1
                                LIMIT 1
                            )`),
                    "purchase_rate"
                ],
                [
                    Sequelize.literal(`(
                                SELECT products.rate
                                FROM products
                                WHERE products.id = bom_process_vs_cons_rejcts.item_id
                                AND products.isDelete = 0
                                AND bom_process_vs_cons_rejcts.type = 2
                                LIMIT 1
                            )`),
                    "rate"
                ],
            ],
            raw: true
        });

        let total_cons_cost = 0;
        let total_reject_cost = 0;

        resultItemList.forEach(item => {


            if (item.type === 1) {
                total_cons_cost += (item.qty || 0) * (item.purchase_rate || 0);
            } else if (item.type === 2 && item.is_reusable === 1) {
                total_reject_cost += (item.qty || 0) * (item.rate || 0);
            }
        });

        const result = {
            process_grand_total: totalProcessCost + totalManpowerCost,
            total_cons_cost,
            total_reject_cost
        }

        if (result) {
            return resSuccess({
                ack_msg: "Costing Rates got successfully",
                data: { item: result },
            });
        } else {
            return resError();
        }

    } catch (e) {
        console.log("costingRatesGet error", e)
        return resBadRequest({ developer_msg: `error ${e}` });
    }
};

export const allBomDataGet = async (req) => {

    const {
        product_id,
        bom_id,
        a_application_login_id
    } = req.body;

    const findCompanyId = await getCompanyByLoginId(a_application_login_id);

    try {
        const productBillOfMaterialModelInstance = productBillOfMaterialModel(req.tenantDB)
        const resultOfBomDetails = await productBillOfMaterialModelInstance.findOne({
            where: { isDelete: "0", product_id: product_id },
            attributes: [
                "bom_number",
                "bom_name",
                "qty",
                "unit",
                "bom_review_frequency",
                [
                    Sequelize.literal(`(
                            SELECT product_unit_masters.unit
                            FROM product_unit_masters
                            WHERE product_unit_masters.id = product_bill_of_materials.unit
                              AND product_unit_masters.isDelete = 0
                            LIMIT 1
                          )`),
                    "unit_name"
                ]
            ],
            raw: true
        });

        const productModelInstance = productModel(req.tenantDB)
        const resultOfProduct = await productModelInstance.findOne({
            where: { isDelete: "0", id: product_id },
            attributes: [
                "product_name",
                "product_code",
                "category_id",
                "product_group_id",
                "product_img",
                [
                    Sequelize.literal(`(
                            SELECT categories.category_name
                            FROM categories
                            WHERE categories.id = products.category_id
                              AND categories.isDelete = 0
                            LIMIT 1
                          )`),
                    "category_name"
                ],
                [
                    Sequelize.literal(`(
                            SELECT product_groups.group_name
                            FROM product_groups
                            WHERE product_groups.id = products.product_group_id
                              AND product_groups.isDelete = 0
                            LIMIT 1
                          )`),
                    "group_name"
                ]
            ],
            raw: true
        });

        if (resultOfProduct.product_img) {
            resultOfProduct.product_img = PRODUCT_IMG_LINK_EXTENDED + resultOfProduct.product_img;
        }

        const bomVsProcessListsModelInstance = bomVsProcessListsModel(req.tenantDB)
        const resultOfProcessList = await bomVsProcessListsModelInstance.findAll({
            where: { isDelete: "0", product_id },
            attributes: [
                "id",
                "process_id",
                "workstation_id",
                "required_time",
                "process_cost",
                "manpower_cost",
                [
                    Sequelize.literal(`(
                            SELECT process_masters.process_name
                            FROM process_masters
                            WHERE process_masters.id = bom_vs_process_lists.process_id
                              AND process_masters.isDelete = 0
                            LIMIT 1
                          )`),
                    "process_name"
                ]
            ],
            raw: true
        });

        for (let item of resultOfProcessList) {
            let workstationIds = [];

            if (typeof item.workstation_id === "string") {
                workstationIds = item.workstation_id.split(",").map(id => Number(id));
            } else if (Array.isArray(item.workstation_id)) {
                workstationIds = item.workstation_id.map(id => Number(id));
            } else if (typeof item.workstation_id === "number") {
                workstationIds = [item.workstation_id];
            }

            let machine_name = "";

            if (workstationIds.length > 0) {
                const machineManagementModelInstance = machineManagementModel(req.tenantDB);
                const workstationList = await machineManagementModelInstance.findAll({
                    where: {
                        id: { [Op.in]: workstationIds },
                        isDelete: 0,
                    },
                    attributes: ["machine_name"],
                    raw: true
                });

                machine_name = workstationList
                    .map(w => w.machine_name)
                    .filter(Boolean)
                    .join(", ");
            }

            item.machine_name = machine_name;
        }

        const bomVsProcessVsConsAndRejctsModelInstance = bomVsProcessVsConsAndRejctsModel(req.tenantDB)
        const resultOfConsAndRejection = await bomVsProcessVsConsAndRejctsModelInstance.findAll({
            where: { isDelete: "0", master_product_id: product_id },
            attributes: [
                "process_id",
                "item_id",
                "qty",
                "unit",
                "type",
                "remark",
                "is_reusable",
                [
                    Sequelize.literal(`(
                                SELECT products.product_name
                                FROM products
                                WHERE products.id = bom_process_vs_cons_rejcts.item_id
                                AND products.isDelete = 0
                                LIMIT 1
                            )`),
                    "product_name"
                ],
                [
                    Sequelize.literal(`(
                                SELECT product_unit_masters.unit
                                FROM product_unit_masters
                                WHERE product_unit_masters.id = bom_process_vs_cons_rejcts.unit
                                AND product_unit_masters.isDelete = 0
                                LIMIT 1
                            )`),
                    "unit_name"
                ],
                [
                    Sequelize.literal(`(
                                SELECT products.purchase_rate
                                FROM products
                                WHERE products.id = bom_process_vs_cons_rejcts.item_id
                                AND products.isDelete = 0
                                AND bom_process_vs_cons_rejcts.type = 1
                                LIMIT 1
                            )`),
                    "purchase_rate"
                ],
                [
                    Sequelize.literal(`(
                                SELECT products.rate
                                FROM products
                                WHERE products.id = bom_process_vs_cons_rejcts.item_id
                                AND products.isDelete = 0
                                AND bom_process_vs_cons_rejcts.type = 2
                                LIMIT 1
                            )`),
                    "rate"
                ]
            ],
            raw: true
        });

        const resultOfCosting = await productBillOfMaterialModelInstance.findOne({
            where: { isDelete: "0", product_id },
            attributes: [
                "extra_charges_1",
                "extra_charges_2",
                "sales_rate",
            ],
            raw: true
        });

        const resultProcessList = await bomVsProcessListsModelInstance.findAll({
            where: { isDelete: "0", bom_id },
            attributes: [
                "process_cost",
                "manpower_cost"
            ],
            raw: true
        });

        let totalProcessCost = 0;
        let totalManpowerCost = 0;

        resultProcessList.forEach((item) => {
            totalProcessCost += Number(item.process_cost || 0);
            totalManpowerCost += Number(item.manpower_cost || 0);
        });

        const resultItemList = await bomVsProcessVsConsAndRejctsModelInstance.findAll({
            where: { isDelete: "0", bom_id },
            attributes: [
                "item_id",
                "qty",
                "type",
                "is_reusable",
                [
                    Sequelize.literal(`(
                                SELECT products.purchase_rate
                                FROM products
                                WHERE products.id = bom_process_vs_cons_rejcts.item_id
                                AND products.isDelete = 0
                                AND bom_process_vs_cons_rejcts.type = 1
                                LIMIT 1
                            )`),
                    "purchase_rate"
                ],
                [
                    Sequelize.literal(`(
                                SELECT products.rate
                                FROM products
                                WHERE products.id = bom_process_vs_cons_rejcts.item_id
                                AND products.isDelete = 0
                                AND bom_process_vs_cons_rejcts.type = 2
                                LIMIT 1
                            )`),
                    "rate"
                ],
            ],
            raw: true
        });

        let total_cons_cost = 0;
        let total_reject_cost = 0;

        resultItemList.forEach(item => {


            if (item.type === 1) {
                total_cons_cost += (item.qty || 0) * (item.purchase_rate || 0);
            } else if (item.type === 2 && item.is_reusable === 1) {
                total_reject_cost += (item.qty || 0) * (item.rate || 0);
            }
        });

        resultOfCosting["process_grand_total"] = totalProcessCost + totalManpowerCost;
        resultOfCosting["total_cons_cost"] = total_cons_cost;
        resultOfCosting["total_reject_cost"] = total_reject_cost;

        const resultOfCurrencyGet = await companyModel.findOne({
            where: { isDelete: "0", id: findCompanyId.company_masters_id },
            attributes: [
                "currency_id",
                [
                    Sequelize.literal(`(
                                SELECT currencies.short_name
                                FROM currencies
                                WHERE currencies.id = company_masters.currency_id
                                AND currencies.isDelete = 0
                                LIMIT 1
                            )`),
                    "currency"
                ],
            ],
            raw: true
        })

        const result = {
            bom_details: resultOfBomDetails,
            process_list: resultOfProcessList,
            item_list: resultOfConsAndRejection,
            costing: resultOfCosting,
            product: resultOfProduct,
            currency_data: resultOfCurrencyGet
        }

        if (result) {
            return resSuccess({
                ack_msg: "All Data got successfully",
                data: { item: result },
            });
        } else {
            return resError();
        }

    } catch (e) {
        console.log("allBomDataGet error", e)
        return resBadRequest({ developer_msg: `error ${e}` });
    }
};