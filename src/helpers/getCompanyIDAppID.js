const getCompanyIDAppID = (key) => {
  const match = key.match(/^a(\d+)_c(\d+)$/);
  if (!match) {
    throw new Error(
      "Invalid format of session. Expected 'a{applicationLoginId}_c{companyId}'"
    );
  }
  const [, applicationLoginId, companyId] = match;
  return {
    applicationLoginId: parseInt(applicationLoginId, 10),
    companyId: parseInt(companyId, 10),
  };
};

export default getCompanyIDAppID;
