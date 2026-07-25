
const callServiceMethod = async (req, res, serviceMethodToCall, FN_name) => {
  try {
    const data = await serviceMethodToCall;
    res.status(200).send(data);
  } catch (error) {
    if (error.response && error.response.status === 401) {
      res.status(401).send({ message: 'Unauthorized: Token is invalid or expired' });
    } else {
      console.error(error);
      res.status(500).send({ message: 'Internal Server Error' });
    }
    console.error(error);
  }
};

export default callServiceMethod;



