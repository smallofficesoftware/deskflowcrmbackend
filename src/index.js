import cors from "cors";
import express from "express";
import http from "http";
import path from "path";
import { Server } from "socket.io";
import apiLogger from "./middlewares/apiLogger.js";
import maintenanceMode from "./middlewares/maintenanceMode.js";
import { decryptRequest, encryptRequest } from "./middlewares/payloadSecurity.js";
import pinoMiddleware from './middlewares/pinoMiddleware.js';
import routers from "./routes/indexRouter.js";
import storeSocketId from "./services/1socketIOServices/storeSocketId.js";
import { startVersionRetentionCron } from "./services/pdfmeEngine/versionRetentionCron.js";
import { baseURL, ENCRYPT_SMALL_OFFICE_CRM_RESPONSE, NODE_ENV, PORT } from "./utils/appConstants.js";
import logger from "./utils/logger.js";
import { parseSession, resError } from "./utils/sharedFunctions.js";

const allowedOrigins = [
    "http://192.168.1.223:3000",
    "http://192.168.1.223:3001",
    "http://192.168.1.223:5000",
    "http://192.168.1.223:2424",
    "http://192.168.1.49:3000",
    "http://192.168.1.49:3001",
    "http://192.168.1.48:3000",
    "http://192.168.1.48:3001",
    "http://localhost:3000",
    "http://localhost:3001",
    "https://app.smalloffice.in",
    "https://app.deskflowcrm.com",
    "https://smalloffice.in",
    "https://deskflowcrm.com",
    "http://192.168.1.232",
    "http://192.168.1.49:5000",
    "http://192.168.1.48:5000",
    "http://localhost:5000",
    "https://whatsapp.smalloffice.in",
    "https://whatsapp.deskflowcrm.com",
    "http://192.168.1.46:21465",
    "https://whatsappbackend.smalloffice.in",
    "https://whatsappbackend.deskflowcrm.com",
    "https://backend.smalloffice.in",
    "https://backend.deskflowcrm.com",
    "http://192.168.1.177:8000",
    "http://192.168.1.48:56",
    "https://demo.smalloffice.in",
    "https://demobackend.smalloffice.in",
    "https://wa.smalloffice.in",
    "https://waadmin.smalloffice.in",
    "https://wadmin.smalloffice.in",
];
const app = express();
app.set("trust proxy", true);
const server = http.createServer(app);
export const io = new Server(server, {
    cors: {
        origin: allowedOrigins,
        methods: ["GET", "POST"],
        credentials: true,
    },
});

// try {
// registerGlobalErrorHandlers();
app.use(express.json({
    limit: '50mb',
    verify: (req, res, buf) => {
        req.rawBody = buf;
    },
}));
app.use(
    cors({
        origin: function (origin, callback) {
            if (!origin) return callback(null, true);
            if (allowedOrigins.indexOf(origin) === -1) {
                const msg =
                    "The CORS policy for this site does not allow access from the specified Origin.";
                return callback(new Error(msg), false);
            }
            return callback(null, true);
        },
        credentials: true,
    })
);
app.use(pinoMiddleware);
app.use(decryptRequest);
app.use(encryptRequest);
app.use(maintenanceMode);
app.use((err, req, res, next) => {
    return resError({
        ack_msg: "Internal Server Error",
        developer_msg: "Internal Server Error",
    })
})
io.on("connection", (socket) => {
    logger.info("[Deskflow CRM:connection]: socket connection successful with id: ", socket.id)
    socket.on(
        "storeSocketID",
        async ({ sessions, socketID }) => {
            try {
                sessions.length > 0 && sessions.map(async (session) => {
                    const { a_application_login_id, company_masters_id } = parseSession(session);
                    if (company_masters_id) {
                        // Company-scoped room for broadcast events (task/contact live sync
                        // etc.) — every teammate connected for this company receives the
                        // same emit, without per-user socket-id lookups.
                        socket.join(`company-${company_masters_id}`);
                    }
                    if (socketID && socketID.length > 0) {
                        await storeSocketId({
                            socketId: socketID,
                            applicationLoginId: a_application_login_id,
                            companyId: company_masters_id,
                        });
                    }
                });
            } catch (error) {
                socket.emit("socket-error", {
                    message: "Failed to register socket IDs",
                    data: { sessions, socketID },
                    error: error.message || "Unexpected error",
                });
                logger.error("[Deskflow CRM:storeSocketID]:[Error]", error);
            }
        }
    );
    socket.on("disconnect", (reason) => {
        logger.info(`[Deskflow CRM:disconnect]: Socket ID ${socket.id} disconnected due to ${reason}`)
    });
});
app.set('whatsAppSocket', io);
app.set('io', io);
app.use(express.urlencoded({ extended: true }));
app.use(apiLogger);
app.use("/api", routers());



const publicFolder = path.join(process.cwd(), 'public')
app.use('/', express.static(publicFolder));
const findDirProfileImage = path.join(
    process.cwd(),
    "media-folder/profile_photo"
);
app.use("/profile-pic", express.static(findDirProfileImage));

const findDirProductImages = path.join(
    process.cwd(),
    "media-folder/product-images"
);
app.use("/productImg", express.static(findDirProductImages));

const findDirProductBomImages = path.join(
    process.cwd(),
    "media-folder/product_bom"
);
app.use("/product-bom-img", express.static(findDirProductBomImages));

const findDirTaskAttachment = path.join(
    process.cwd(),
    "media-folder/task_attechment"
);
app.use("/taskATH", express.static(findDirTaskAttachment));

const findDirVisitingCardImage = path.join(
    process.cwd(),
    "media-folder/visiting_card_image"
);
app.use("/visitingCard", express.static(findDirVisitingCardImage));

const findDirCompanyImages = path.join(
    process.cwd(),
    "media-folder/company_image"
);
app.use("/companyImg", express.static(findDirCompanyImages));
const findDirAttendanceImages = path.join(
    process.cwd(),
    "media-folder/attendance_images"
);
app.use("/attendanceImg", express.static(findDirAttendanceImages));
const findDirMediaFolderMsg = path.join(
    process.cwd(),
    "media-folder/contact_history_attachment"
);
app.use("/media-folder", express.static(findDirMediaFolderMsg));
const findDirMediaFolderMsgTask = path.join(
    process.cwd(),
    "media-folder/task_history_attachment"
);
app.use("/media-folder", express.static(findDirMediaFolderMsgTask));
const findDirVisitImages = path.join(
    process.cwd(),
    "media-folder/visit_image"
);
app.use("/visitImg", express.static(findDirVisitImages));

const findDirExpenseImages = path.join(
    process.cwd(),
    "media-folder/expense-images"
);
app.use("/expenseImg", express.static(findDirExpenseImages));

const findDirLeaveImages = path.join(
    process.cwd(),
    "media-folder/leave-images"
);
app.use("/leaveImg", express.static(findDirLeaveImages));

const orderAttachmentView = path.join(process.cwd(), "media-folder/cart_attachment");
app.use("/orderAttachment", express.static(orderAttachmentView));

const findOrderView = path.join(process.cwd(), "media-folder/cart");
app.use("/order_view", express.static(findOrderView));

const findShippingLabelView = path.join(process.cwd(), "media-folder/ShippingLabel");
app.use("/shipping_label_view", express.static(findShippingLabelView));

const findAccountTransactionView = path.join(process.cwd(), "media-folder/accountTransaction");
app.use("/accountTransactions", express.static(findAccountTransactionView));

const findEmpAccountTransactionView = path.join(process.cwd(), "media-folder/empAccountTransaction");
app.use("/empAccountTransactions", express.static(findEmpAccountTransactionView));

const customerPlanInvoice = path.join(process.cwd(), "media-folder/newCompanyInvoice");
app.use("/newPlanInvoice", express.static(customerPlanInvoice));

const findApkView = path.join(process.cwd(), "media-folder/apk");
app.use("/apk", express.static(findApkView));

const findExportFile = path.join(process.cwd(), "media-folder/exports/");
app.use("/export", express.static(findExportFile));

const campaignExportFile = path.join(process.cwd(), "media-folder/campaign/");
app.use("/camp-gen-excel", express.static(campaignExportFile));

const whatsappTemplateStaticFiles = path.join(process.cwd(), "media-folder/whatsapp-template");
app.use("/whatsapp-template-att", express.static(whatsappTemplateStaticFiles));


const customerSupportTicketAttacment = path.join(process.cwd(), "media-folder/store_ticket_attachment");
app.use("/support-att", express.static(customerSupportTicketAttacment));

const findDirMiracleLedger = path.join(
    process.cwd(),
    "media-folder/miracle/ledger/"
);
app.use("/mcusledger", express.static(findDirMiracleLedger));

server.listen(PORT, () => {
    logger.info(`Environment Mode: ${NODE_ENV}`)
    logger.info(`Response data encryption: ${ENCRYPT_SMALL_OFFICE_CRM_RESPONSE}`)
    logger.info(`Server running on ${baseURL}`)
    startVersionRetentionCron();
});
// } catch (error) {
//     logger.fatal('App failed to start:', err);
//     process.exit(1);
// }