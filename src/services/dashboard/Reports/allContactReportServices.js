import moment from "moment";
import { Op, Sequelize } from "sequelize";
import { getUserRights } from "../../../helpers/rightsHelper.js";
import { cartItemModel } from "../../../models/activities/cartItemsModel.js";
import { cartModel } from "../../../models/activities/cartsModel.js";
import { contactModel } from "../../../models/activities/contactModel.js";
import loginModel from "../../../models/application_login/loginModel.js";
import { areaModel } from "../../../models/masters/areaModel.js";
import { cityModel } from "../../../models/masters/cityModel.js";
import { countryModel } from "../../../models/masters/countryModel.js";
import { labelModel } from "../../../models/masters/labelModel.js";
import { sourceTypesModel } from "../../../models/masters/sourceTypeMode.js";
import { stagestatusModel } from "../../../models/masters/stagestatusModel.js";
import { stateModel } from "../../../models/masters/stateModel.js";
import { customFieldFormModel } from "../../../models/other_settings/customFieldFormModel.js";
import { PAGE_ID } from "../../../utils/AppEnumeration.js";
import { resError, resSuccess } from "../../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../../commonServices.js";
import {
  ACTIVITY_SOURCE_KEYS,
  getContactIdsByLastActivity,
} from "./leadAgingHelper.js";

export const getAllContactReport = async (req) => {
  try {
    const {
      a_application_login_id,
      setActive,
      setActiveDay,
      selectedLabels,
      selectedSourceTypes,
      selectedStageStatus,
      selectedTeamMembers,
      selectedDemography,
      selected_dates,
      selectedProductSearchId,
      setSelectOrderType,
      labelwiseContactShowAndOrNot,
      ul,
      ll,
      is_archive,
      leadAgingBucket,
      leadAgingActivityTypes,
    } = req.body;

    let deleted_flag = req.body?.deleted_flag || 0;

    const startDate = moment(selected_dates[0])
      .startOf("day")
      .format("YYYY-MM-DD");

    const endDate = moment(selected_dates[1])
      .endOf("day")
      .format("YYYY-MM-DD");

    const globalSearch = req.body.globalSearch?.trim() || "";

    let fullTextSearchCondition = {};

    if (globalSearch) {
      const cartColumns = Object.keys(
        contactModel(req.tenantDB).rawAttributes
      ).filter((col) => {
        const attr = contactModel(req.tenantDB).rawAttributes[col];

        return ["STRING", "TEXT", "CHAR", "VARCHAR"].includes(attr.type.key);
      });

      const like = `%${globalSearch}%`;

      const orConditions = cartColumns.map((col) => ({
        [col]: { [Op.like]: like },
      }));

      fullTextSearchCondition = { [Op.or]: orConditions };
    }

    const offset = ul;
    const limit = ll;

    const findCompanyId = await getCompanyByLoginId(
      req.body.a_application_login_id
    );

    const contactModels = await contactModel(req.tenantDB);
    const CartItem = cartItemModel(req.tenantDB);

    let whereClause = {
      isDelete: deleted_flag,
      company_masters_id: findCompanyId.company_masters_id,
    };

    const a_application_login_id_rights =
      req.body.a_application_login_id;

    const { showAllData, showPersonalData } =
      await getUserRights({
        company_masters_id:
          findCompanyId.company_masters_id,
        a_application_login_id:
          a_application_login_id_rights,
        page_id: PAGE_ID.ALLCONTACT_REPORT,
        tenentId: req.tenantDB,
      });

    // Personal scope means "mine" - both contacts this login created AND
    // ones assigned to them, same convention lableWiseReportServices.js /
    // sourceReportServices.js / teamPerformanceReportServices.js already
    // use. Filtering on a_application_login_id alone (the old behavior)
    // silently dropped every contact assigned to a team member by someone
    // else - "for owner all record, for team member default created and
    // assigned" was correct for owners, not for team members.
    const personalScopeOr = [
      { a_application_login_id: a_application_login_id_rights },
      Sequelize.literal(
        `FIND_IN_SET('${a_application_login_id_rights}', assinged_to_work_a_application_id) > 0`
      ),
    ];

    // Op.and (not a bare [Op.or] key) so this survives the
    // ...fullTextSearchCondition spread below - fullTextSearchCondition
    // has its OWN [Op.or] key when a search term is active, and since
    // Op.or is the same Symbol every time, a second [Op.or]: ... spread
    // on top would silently replace this one instead of combining with it.
    if (!showAllData && showPersonalData) {
      whereClause = {
        ...whereClause,
        [Op.and]: [{ [Op.or]: personalScopeOr }],
      };
    } else if (showPersonalData) {
      whereClause = {
        [Op.and]: [{ [Op.or]: personalScopeOr }],
      };
    }

    whereClause = {
      ...whereClause,
      ...fullTextSearchCondition,
    };

    // LABEL FILTER
    if (
      Array.isArray(selectedLabels) &&
      selectedLabels.length > 0
    ) {
      const hasBlankLabel =
        selectedLabels.includes(-9999);

      const normalLabelIds = selectedLabels.filter(
        (id) => id !== -9999
      );

      const labelConditions = [];

      if (normalLabelIds.length > 0) {
        const labelCondition = normalLabelIds
          .map((id) => `FIND_IN_SET(${id}, lable) > 0`)
          .join(
            labelwiseContactShowAndOrNot == 2
              ? " AND "
              : " OR "
          );

        labelConditions.push(`(${labelCondition})`);
      }

      if (hasBlankLabel) {
        labelConditions.push(
          `(lable IS NULL OR lable = '')`
        );
      }

      const conditions = [];

      conditions.push(
        `(${labelConditions.join(" OR ")})`
      );

      if (conditions.length > 0) {
        whereClause[Op.and] = [
          ...(whereClause[Op.and] || []),
          Sequelize.literal(
            `(${conditions.join(" OR ")})`
          ),
        ];
      }
    }

    // STATUS FILTER
    if (
      Array.isArray(selectedStageStatus) &&
      selectedStageStatus.length > 0
    ) {
      const hasBlank =
        selectedStageStatus.includes(-7777);

      const normalStatus =
        selectedStageStatus.filter(
          (id) => id !== -7777
        );

      if (hasBlank && normalStatus.length > 0) {
        whereClause.contact_status = {
          [Op.or]: [
            { [Op.in]: normalStatus },
            { [Op.is]: null },
            { [Op.eq]: 0 },
            { [Op.eq]: "" },
          ],
        };
      } else if (hasBlank) {
        whereClause.contact_status = {
          [Op.or]: [
            { [Op.is]: null },
            { [Op.eq]: 0 },
            { [Op.eq]: "" },
          ],
        };
      } else {
        whereClause.contact_status = {
          [Op.in]: normalStatus,
        };
      }
    }

    // SOURCE TYPE FILTER
    if (
      Array.isArray(selectedSourceTypes) &&
      selectedSourceTypes.length > 0
    ) {
      const hasBlank =
        selectedSourceTypes.includes(-8888);

      const normalSourceTypes =
        selectedSourceTypes.filter(
          (id) => id !== -8888
        );

      if (hasBlank && normalSourceTypes.length > 0) {
        whereClause.source_type_id = {
          [Op.or]: [
            { [Op.in]: normalSourceTypes },
            { [Op.is]: null },
            { [Op.eq]: 0 },
            { [Op.eq]: "" },
          ],
        };
      } else if (hasBlank) {
        whereClause.source_type_id = {
          [Op.or]: [
            { [Op.is]: null },
            { [Op.eq]: 0 },
            { [Op.eq]: "" },
          ],
        };
      } else {
        whereClause.source_type_id = {
          [Op.in]: normalSourceTypes,
        };
      }
    }

    // TEAM MEMBER FILTER
    if (
      selectedTeamMembers &&
      selectedTeamMembers.length > 0
    ) {
      whereClause["a_application_login_id"] = {
        [Op.in]: selectedTeamMembers,
      };
    }

    // DEMOGRAPHY
    if (Array.isArray(selectedDemography)) {
      if (
        selectedDemography[0] != null &&
        selectedDemography[0] !== ""
      ) {
        const countryId = parseInt(
          selectedDemography[0],
          10
        );

        if (!isNaN(countryId))
          whereClause["country"] = countryId;
      }

      if (
        selectedDemography[1] != null &&
        selectedDemography[1] !== ""
      ) {
        const stateId = parseInt(
          selectedDemography[1],
          10
        );

        if (!isNaN(stateId))
          whereClause["state"] = stateId;
      }

      if (
        selectedDemography[2] != null &&
        selectedDemography[2] !== ""
      ) {
        const cityId = parseInt(
          selectedDemography[2],
          10
        );

        if (!isNaN(cityId))
          whereClause["city"] = cityId;
      }

      if (
        selectedDemography[3] != null &&
        selectedDemography[3] !== ""
      ) {
        const areaId = parseInt(
          selectedDemography[3],
          10
        );

        if (!isNaN(areaId))
          whereClause["area"] = areaId;
      }
    }

    //isArchive
    if (is_archive) {
      console.log("dddddddd", is_archive);
      whereClause["is_archive"] = 1;
    }

    let cartItemContactIds = [];

    if (
      selectedProductSearchId &&
      setSelectOrderType
    ) {
      const itemsInCart =
        await CartItem.findAll({
          where: {
            cart_type: setSelectOrderType,
            item_product_id:
              selectedProductSearchId,
            isDelete: 0,
          },
          attributes: ["contact_master_id"],
          group: ["contact_master_id"],
          raw: true,
        });

      cartItemContactIds = itemsInCart.map(
        (item) => item.contact_master_id
      );

      whereClause.id = {
        [Op.in]:
          cartItemContactIds.length > 0
            ? cartItemContactIds
            : [0],
      };
    }

    let cartContactIds = [];
    let cartDetails = {};

    if (setActive) {
      const cartModels = await cartModel(
        req.tenantDB
      );

      let cartWhere = {
        type: 3,
      };

      if (setActiveDay) {
        const pastDate = new Date();

        pastDate.setDate(
          pastDate.getDate() -
          parseInt(setActiveDay)
        );

        cartWhere = {
          ...cartWhere,
          created_date_time: {
            [Op.gte]: pastDate,
          },
        };
      }

      if (
        setActive.toLowerCase() === "active"
      ) {
        const cartContacts =
          await cartModels.findAll({
            where: cartWhere,
            attributes: [
              "to_customer_id",
              "cart_number",
              "grand_total",
              "created_date_time",
            ],
            order: [
              ["created_date_time", "DESC"],
            ],
          });

        cartContactIds = cartContacts.map(
          (cart) => cart.to_customer_id
        );

        cartDetails = cartContacts.reduce(
          (acc, cart) => {
            if (!acc[cart.to_customer_id]) {
              acc[cart.to_customer_id] = {
                cart_number:
                  cart.cart_number || "",
                grand_total:
                  cart.grand_total || 0,
                created_date_time:
                  cart.created_date_time || null,
              };
            }

            return acc;
          },
          {}
        );

        whereClause.id = {
          [Op.in]:
            cartContactIds.length > 0
              ? cartContactIds
              : [0],
        };
      } else if (
        setActive.toLowerCase() === "deactivate"
      ) {
        const cartContacts =
          await cartModels.findAll({
            where: cartWhere,
            attributes: ["to_customer_id"],
          });

        cartContactIds = cartContacts.map(
          (cart) => cart.to_customer_id
        );

        const allCartDetails =
          await cartModels.findAll({
            where: { type: 3 },
            attributes: [
              "to_customer_id",
              "cart_number",
              "grand_total",
              "created_date_time",
            ],
            order: [
              ["created_date_time", "DESC"],
            ],
          });

        cartDetails = allCartDetails.reduce(
          (acc, cart) => {
            if (!acc[cart.to_customer_id]) {
              acc[cart.to_customer_id] = {
                cart_number:
                  cart.cart_number || "",
                grand_total:
                  cart.grand_total || 0,
                created_date_time:
                  cart.created_date_time || null,
              };
            }

            return acc;
          },
          {}
        );

        whereClause.id = {
          [Op.notIn]:
            cartContactIds.length > 0
              ? cartContactIds
              : [0],
        };
      }
    }

    if (leadAgingBucket) {
      const agingContactIds = await getContactIdsByLastActivity(
        req.tenantDB,
        findCompanyId.company_masters_id,
        leadAgingActivityTypes?.length ? leadAgingActivityTypes : ACTIVITY_SOURCE_KEYS,
        leadAgingBucket
      );

      const agingIn = { [Op.in]: agingContactIds.length > 0 ? agingContactIds : [0] };

      whereClause.id = whereClause.id
        ? { [Op.and]: [whereClause.id, agingIn] }
        : agingIn;
    }

    let dateFilter = {};

    if (selected_dates.length === 2) {
      dateFilter = {
        [Op.and]: Sequelize.where(
          Sequelize.fn(
            "DATE",
            Sequelize.col("created_date_time")
          ),
          {
            [Op.between]: [
              startDate,
              endDate,
            ],
          }
        ),
      };
    }

    const contacts = await contactModels.findAll({
      where: {
        isDelete: 0,
        ...dateFilter,
        ...whereClause,
      },
      order: [["id", "DESC"]],
      offset,
      limit,
    });

    // ==========================
    // LOGIN USERS FETCH
    // ==========================


    let loginIds = [];

    contacts.forEach((contact) => {
      // created by
      if (contact.a_application_login_id) {
        loginIds.push(
          Number(
            contact.a_application_login_id
          )
        );
      }

      // assigned to
      if (
        contact.assinged_to_work_a_application_id
      ) {
        const assignedIds =
          contact.assinged_to_work_a_application_id
            .split(",")
            .map((id) => Number(id.trim()))
            .filter((id) => !isNaN(id));

        loginIds.push(...assignedIds);
      }
    });

    loginIds = [...new Set(loginIds)];

    const loginUsers =
      await loginModel.findAll({
        where: {
          id: {
            [Op.in]: loginIds,
          },
        },
        attributes: ["id", "username"],
        raw: true,
      });

    const loginMap = {};

    loginUsers.forEach((user) => {
      loginMap[user.id] = user.username;
    });

    // ==========================
    // MASTER DATA
    // ==========================

    const sourceModels =
      await sourceTypesModel(req.tenantDB);

    const sourceTypes =
      await sourceModels.findAll({
        where: {
          isDelete: 0,
        },
        attributes: [
          "id",
          "source_name",
          "color",
        ],
      });

    const countryModels =
      await countryModel(req.tenantDB);

    const countryTypes =
      await countryModels.findAll({
        attributes: ["id", "country_name"],
      });

    const stateModels =
      await stateModel(req.tenantDB);

    const stateTypes =
      await stateModels.findAll({
        attributes: ["id", "state_name"],
      });

    const cityModels =
      await cityModel(req.tenantDB);

    const cityTypes =
      await cityModels.findAll({
        attributes: ["id", "city_name"],
      });

    const areaModels =
      await areaModel(req.tenantDB);

    const areaTypes =
      await areaModels.findAll({
        attributes: ["id", "area_name"],
      });

    const lableModels =
      await labelModel(req.tenantDB);

    const labels =
      await lableModels.findAll({
        where: {
          isDelete: 0,
        },
        attributes: [
          "id",
          "lable_name",
          "color",
        ],
      });

    const statusModels =
      await stagestatusModel(req.tenantDB);

    const status =
      await statusModels.findAll({
        where: {
          isDelete: 0,
        },
        attributes: [
          "id",
          "name",
          "color",
        ],
      });

    const getCustomFormFeild =
      customFieldFormModel(req.tenantDB);

    const CustomFormFeilds =
      await getCustomFormFeild.findAll({
        where: {
          form_type: 1,
          isDelete: 0,
          report_print_or_not: 1,
          data_type: {
            [Op.notIn]: [11, 12],
          },
        },
      });

    // ==========================
    // FINAL RESPONSE
    // ==========================

    const transformedContacts = contacts.map(
      (contact) => {
        const source = sourceTypes.find(
          (s) =>
            s.id === contact.source_type_id
        );

        const labelIds = contact.lable
          ? contact.lable
            .toString()
            .split(",")
            .map((id) =>
              parseInt(id.trim(), 10)
            )
            .filter((id) => !isNaN(id))
          : [];

        const matchedLabels = labels.filter(
          (label) =>
            labelIds.includes(label.id)
        );

        const lable_names = matchedLabels
          .map((l) => l.lable_name)
          .join(", ");

        const lable_colours = matchedLabels
          .map((l) => l.color)
          .join(", ");

        const statusItem = status.find(
          (s) =>
            s.id === contact.contact_status
        );

        const countryItem =
          countryTypes.find(
            (s) => s.id === contact.country
          );

        const stateItem = stateTypes.find(
          (s) => s.id === contact.state
        );

        const cityItem = cityTypes.find(
          (s) => s.id === contact.city
        );

        const areaItem = areaTypes.find(
          (s) => s.id === contact.area
        );

        // CREATED BY
        const createdByName =
          loginMap[
          contact.a_application_login_id
          ] || "";

        // ASSIGNED TO
        let assignedToNames = "";

        if (
          contact.assinged_to_work_a_application_id
        ) {
          const assignedIds =
            contact.assinged_to_work_a_application_id
              .split(",")
              .map((id) =>
                Number(id.trim())
              )
              .filter((id) => !isNaN(id));

          assignedToNames = assignedIds
            .map((id) => loginMap[id])
            .filter(Boolean)
            .join(", ");
        }

        // CREATED DATE TIME
        const createdDateTime = moment(contact.created_date_time).format("DD-MM-YYYY HH:mm:ss")

        return {
          ...contact.dataValues,

          customForm: CustomFormFeilds,

          person_name:
            contact.person_name || "",

          mobile_number:
            contact.mobile_number || "",

          company_name:
            contact.company_name || "-",

          source_name: source
            ? source.source_name
            : "",

          source_colour: source
            ? source.color
            : "",

          lable_name: lable_names,

          lable_colour: lable_colours,

          country_name: countryItem
            ? countryItem.country_name
            : "",

          state_name: stateItem
            ? stateItem.state_name
            : "",

          city_name: cityItem
            ? cityItem.city_name
            : "",

          area_name: areaItem
            ? areaItem.area_name
            : "",

          status_name: statusItem
            ? statusItem.name
            : "",

          status_colour: statusItem
            ? statusItem.color
            : "",

          cart_number:
            setActive &&
              cartDetails[contact.id]
              ? cartDetails[contact.id]
                .cart_number
              : "",

          grand_total:
            setActive &&
              cartDetails[contact.id]
              ? cartDetails[contact.id]
                .grand_total
              : 0,

          created_date_time:
            createdDateTime,

          created_by:
            createdByName,

          assigned_to:
            assignedToNames,
        };
      }
    );

    return resSuccess({
      data: {
        item: transformedContacts,
      },
      ack_msg: "Run Successfully",
    });
  } catch (e) {
    return resError({
      ack_msg: "Catch Error",
      developer_msg: `${e}`,
    });
  }
};