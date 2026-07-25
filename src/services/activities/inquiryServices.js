import Sequelize, { Op } from "sequelize";
import { getUserRights } from "../../helpers/rightsHelper.js";
import { contactModel } from "../../models/activities/contactModel.js";
import { inquiryModel } from "../../models/activities/inquiryModel.js";
import loginModel from "../../models/application_login/loginModel.js";
import companyVsApplicationLoginModel from "../../models/company_setup/companyVsApplicationLoginModel.js";
import { PAGE_ID } from "../../utils/AppEnumeration.js";
import {
  formatDateAndTimeCreateDateTime,
  resBadRequest,
  resSuccess,
  sanitizeObjectOfNull,
} from "../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../commonServices.js";
import { sendMultipleNotification } from "../company_setup/thirdPartyIntegrationService.js";

export const getAllInquiry = async (req) => {
  try {
    const { ul, ll } = req.body;
    const {
      searchTerm,
      a_application_login_id,
      labelFilter,
      contact_master_id,
      sourceTypeFilter,
      startDate,
      endDate,
      statusFilter,
      searchCategory,
      searchProduct,
      userFilter,
    } = req.body;

    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    const INQModel = inquiryModel(req.tenantDB);
    const INQContactModel = contactModel(req.tenantDB);

    INQModel.belongsTo(INQContactModel, { foreignKey: "contact_master_id" });
    INQContactModel.hasMany(INQModel, { foreignKey: "id" });
    const tenantDB = req.tenantDB;
    const { showAllData, showPersonalData } = await getUserRights({
      company_masters_id: findCompanyId.company_masters_id,
      a_application_login_id,
      page_id: PAGE_ID.INQUIRY,
      tenentId: req.tenantDB
    });

    let whereClause = {
      // company_masters_id: findCompanyId.company_masters_id,
      isDelete: "0",
    };

    if (findCompanyId.company_flag === 2) {
      if (showPersonalData) {
        whereClause[Op.and] = whereClause[Op.and] || [];

        whereClause[Op.and].push({
          [Op.or]: [
            {
              a_application_login_id,
            },
            Sequelize.where(
              Sequelize.fn(
                "FIND_IN_SET",
                a_application_login_id,
                Sequelize.col("inquiry_assigned_team_member")
              ),
              {
                [Op.gt]: 0,
              }
            ),
          ],
        });
      } else if (showAllData) {
        whereClause.company_masters_id =
          findCompanyId.company_masters_id;
      } else {
        whereClause.id = null;
      }
    }


    if (searchTerm) {
      whereClause[Op.and] = whereClause[Op.and] || [];
      whereClause[Op.and].push({
        [Op.or]: [
          { description: { [Op.like]: `%${searchTerm}%` } },
          {
            contact_master_id: {
              [Op.in]: Sequelize.literal(`(
                SELECT id
                FROM contact_masters
                WHERE isDelete = 0
                AND person_name LIKE '%${searchTerm}%'
              )`),
            },
          },
        ],
      });
    }

    if (contact_master_id) {
      whereClause.contact_master_id = contact_master_id;
    }

    if (statusFilter?.length > 0) {
      whereClause.contact_status = { [Op.in]: statusFilter };
    }

    if (labelFilter?.length > 0) {
      whereClause.label_id = { [Op.in]: labelFilter };
    }

    if (sourceTypeFilter?.length > 0) {
      whereClause.source_type_id = { [Op.in]: sourceTypeFilter };
    }

    if (searchCategory) {
      whereClause.category_id = searchCategory;
    }

    if (searchProduct) {
      whereClause.product_id = searchProduct;
    }

    if (userFilter?.length > 0) {
      whereClause[Op.and] = whereClause[Op.and] || [];
      const userConditions = userFilter.map((userId) =>
        Sequelize.where(
          Sequelize.fn(
            "FIND_IN_SET",
            userId,
            Sequelize.col("inquiry_assigned_team_member")
          ),
          { [Op.gt]: 0 }
        )
      );
      whereClause[Op.and].push({ [Op.or]: userConditions });
    }

    if (startDate && endDate) {
      whereClause[Op.and] = whereClause[Op.and] || [];
      whereClause[Op.and].push(
        Sequelize.where(
          Sequelize.fn("DATE", Sequelize.col("create_date_time")),
          {
            [Op.gte]: startDate,
          }
        ),
        Sequelize.where(
          Sequelize.fn("DATE", Sequelize.col("create_date_time")),
          {
            [Op.lte]: endDate,
          }
        )
      );
    }


    if (findCompanyId.company_flag === 1) {
      whereClause[Op.and] = whereClause[Op.and] || [];
      // whereClause[Op.and].push({ company_masters_id: findCompanyId.company_masters_id });
    }


    const attributesInclude = [
      [
        Sequelize.literal(`(
          SELECT reminder_messages.remark
          FROM reminder_messages
          WHERE reminder_messages.reference_id = inquiries.id
            AND reminder_messages.reference_table = "inquiries"
            AND reminder_messages.isDelete = 0
            AND reminder_messages.status = 0
        )`),
        "reminder_remark",
      ],
      [
        Sequelize.literal(`(
          SELECT reminder_messages.reminder_data_time
          FROM reminder_messages
          WHERE reminder_messages.reference_id = inquiries.id
            AND reminder_messages.reference_table = "inquiries"
            AND reminder_messages.isDelete = 0
            AND reminder_messages.status = 0
        )`),
        "reminder_data_time",
      ],
      [
        Sequelize.literal(`(
          SELECT source_types.source_name
          FROM source_types
          WHERE source_types.id = inquiries.source_type_id
            AND source_types.isDelete = 0
        )`),
        "source_name",
      ],
      [
        Sequelize.literal(`(
          SELECT source_types.color
          FROM source_types
          WHERE source_types.id = inquiries.source_type_id
            AND source_types.isDelete = 0
        )`),
        "source_name_color",
      ],
      [
        Sequelize.literal(`(
          SELECT products.product_name
          FROM products
          WHERE products.id = inquiries.product_id
            AND products.isDelete = 0
        )`),
        "product_name",
      ],
      [
        Sequelize.literal(`(
          SELECT categories.category_name
          FROM categories
          WHERE categories.id = inquiries.category_id
            AND categories.isDelete = 0
        )`),
        "category_name",
      ],
      [
        Sequelize.literal(`(
          SELECT contact_masters.person_name
          FROM contact_masters
          WHERE contact_masters.id = inquiries.contact_master_id
            AND contact_masters.isDelete = 0
        )`),
        "contact_person_name",
      ],
      [
        Sequelize.literal(`(
          SELECT contact_masters.mobile_number
          FROM contact_masters
          WHERE contact_masters.id = inquiries.contact_master_id
            AND contact_masters.isDelete = 0
        )`),
        "contact_person_number",
      ],
      [
        Sequelize.literal(`(
          SELECT contact_masters.company_name
          FROM contact_masters
          WHERE contact_masters.id = inquiries.contact_master_id
            AND contact_masters.isDelete = 0
        )`),
        "contact_company_name",
      ],
      [
        Sequelize.literal(`(
          SELECT stage_status_masters.name
          FROM stage_status_masters
          WHERE stage_status_masters.id = inquiries.contact_status
            AND stage_status_masters.isDelete = 0
        )`),
        "stage_status_name",
      ],
      [
        Sequelize.literal(`(
          SELECT stage_status_masters.color
          FROM stage_status_masters
          WHERE stage_status_masters.id = inquiries.contact_status
            AND stage_status_masters.isDelete = 0
        )`),
        "stage_status_color",
      ],
      [
        Sequelize.literal(`(
          SELECT GROUP_CONCAT(lable_masters.color)
          FROM lable_masters
          WHERE lable_masters.isDelete = 0
            AND FIND_IN_SET(lable_masters.id, inquiries.label_id)
        )`),
        "label_color",
      ],
      [
        Sequelize.literal(`(
          SELECT GROUP_CONCAT(lable_masters.lable_name)
          FROM lable_masters
          WHERE lable_masters.isDelete = 0
            AND FIND_IN_SET(lable_masters.id, inquiries.label_id)
        )`),
        "label_name",
      ],
    ];

    const commonOptions = {
      where: whereClause,
      limit: Number(ll) || 10,
      offset: Number(ul) || 0,
      order: [["id", "DESC"]],
      attributes: { include: attributesInclude },
    };


    const inquiry = await INQModel.findAll({
      ...commonOptions,
      include: [
        {
          model: INQContactModel,
          required: false,
          where: {
            // company_masters_id: findCompanyId.company_masters_id,
            isDelete: 0,
          },
        },
      ],
    });

    let activeTeamMap;
    if (inquiry) {
      const activeTeamList = await loginModel.findAll({
        where: {
          id: {
            [Op.in]: Sequelize.literal(`(
        SELECT a_application_login_id
        FROM company_vs_application_logins
        WHERE isDelete = 0
        AND company_masters_id = '${findCompanyId.company_masters_id}'
      )`)
          },
          isDelete: 0,
        },
        attributes: ["id", "username"],
        raw: true,
      });
      activeTeamMap = new Map(
        activeTeamList.map((user) => [
          Number(user.id),
          user.username,
        ])
      );
    }

    const sanitizedInquire = inquiry?.map((item) => {
      const clean = sanitizeObjectOfNull(item.toJSON());

      const createdById = Number(clean.a_application_login_id);

      const created_by_name =
        activeTeamMap.get(createdById) || "";

      let assignedNameList = [];


      if (
        clean.inquiry_assigned_team_member &&
        clean.inquiry_assigned_team_member.trim() !== ""
      ) {
        const assignedIds = clean.inquiry_assigned_team_member
          .split(",")
          .map((id) => Number(id.trim()))
          .filter(Boolean);

        assignedNameList = assignedIds
          .map((id) => activeTeamMap.get(id))
          .filter(Boolean);


      }

      const inq_created_by_name = created_by_name ? created_by_name : "";


      const assined_team_person_list =
        assignedNameList.length > 0
          ? `${assignedNameList.join(", ")}`
          : "";

      return {
        ...clean,
        assined_team_person_list,
        inq_created_by_name,

        create_date_time: clean.create_date_time
          ? formatDateAndTimeCreateDateTime(
            clean.create_date_time
          )
          : "",

        reminder_data_time: clean.reminder_data_time
          ? formatDateAndTimeCreateDateTime(
            clean.reminder_data_time
          )
          : "",
      };
    });

    return resSuccess({
      data: {
        item: sanitizedInquire,
      },
    });
  } catch (e) {
    console.error("Inquiry error:", e);
    return resBadRequest({ developer_msg: `error ${e}` });
  }
};



export const CreateInquiryBtoB = async (req, res) => {
  try {
    const {
      product_id,
      description,
      qty,
      source_type_id,
      company_masters_id,
      a_application_login_id,
      contact_number,
      contact_name,
      static_id,
    } = req.body;
    const INQModel = inquiryModel(req.tenantDB);
    const INQContactModel = contactModel(req.tenantDB);
    let existingContact = await INQContactModel.findOne({
      where: {
        mobile_number: contact_number,
        company_masters_id: company_masters_id,
        a_application_login_id: a_application_login_id,
        isDelete: "0",
      },
    });

    if (!existingContact) {
      existingContact = await INQContactModel.create({
        mobile_number: contact_number,
        person_name: contact_name,
        company_masters_id: company_masters_id,
        a_application_login_id: a_application_login_id,
      });
    }

    const newInquiry = await INQModel.create({
      product_id,
      description,
      qty,
      source_type_id,
      contact_master_id: existingContact.id,
      company_masters_id: company_masters_id,
      static: static_id,
    });

    if (newInquiry) {
      const ownerTokenData = await companyVsApplicationLoginModel.findAll({
        where: {
          isDelete: 0,
          company_masters_id: company_masters_id,
          company_flag: 1,
        },
        attributes: ["a_application_login_id"],
      });

      // Get tokens for each owner a_application_login_id
      const allLoginIds = ownerTokenData.map(
        (item) => item.a_application_login_id
      );

      const findTokens = await loginModel.findAll({
        where: {
          id: allLoginIds,
          isDelete: 0,
        },
        attributes: [
          "android_refresh_token",
          "web_refresh_token",
          "ios_refresh_token",
        ],
      });

      const tokens = findTokens
        .flatMap((tokenObj) => {
          const {
            android_refresh_token,
            web_refresh_token,
            ios_refresh_token,
          } = tokenObj.dataValues;
          return [android_refresh_token, web_refresh_token, ios_refresh_token];
        })
        .filter((token) => token && token.trim() !== "");

      if (tokens.length > 0) {
        try {
          await sendMultipleNotification({
            deviceTokens: tokens,
            title: "B2B smalloffice",
            body: "Inquiry created successfully",
          });
        } catch (notificationError) {
          console.error(
            "Notification failed (non-critical):",
            notificationError.message
          );
        }
      } else {
        console.log("No device tokens found for owners.");
      }
      return resSuccess({
        data: { item: newInquiry },
        ack_msg: "Inquiry created successfully",
      });
    } else {
      return resError({
        ack_msg: "Failed to create inquiry",
        developer_msg: "Unable to create inquiry due to unknown error",
      });
    }
  } catch (error) {
    return resBadRequest({
      ack_msg: "Error",
      developer_msg: `${error.message}`,
    });
  }
};
