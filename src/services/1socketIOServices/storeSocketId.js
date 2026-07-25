import { socketConnectionsModel } from "../../models/socketConnectionsModel.js";

const storeSocketId = async ({ socketId, applicationLoginId, companyId }) => {
  const existing = await socketConnectionsModel().findOne({
    where: {
      a_application_logins_id: applicationLoginId,
      company_masters_id: companyId,
    },
  });
  if (existing) {
    existing.socket_id = socketId;
    existing.updated_date = new Date();
    return existing.save();
  }
  return socketConnectionsModel().create({
    socket_id: socketId,
    a_application_logins_id: applicationLoginId,
    company_masters_id: companyId,
    updated_date: new Date(),
  });
};

export default storeSocketId;
