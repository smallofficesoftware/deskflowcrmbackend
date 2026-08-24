// Broadcasts an event to every socket connected for a given company (see the
// `company-${id}` room join in src/index.js's "storeSocketID" handler). Used
// for live-refresh signals (task add/edit/move, etc.) — payload is kept
// minimal since listeners just refetch, not merge in server-pushed data.
const emitToCompany = (io, companyId, event, payload = {}) => {
  if (!io || !companyId) return;
  io.to(`company-${companyId}`).emit(event, { companyId, at: Date.now(), ...payload });
};

export default emitToCompany;
