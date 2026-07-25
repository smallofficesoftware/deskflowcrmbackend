import logger from "../utils/logger.js";

const pinoMiddleware = (req, res, next) => {
  const childLogger = logger.child({});
  req.logger = childLogger;
  let contentType = 'no-body';
  const rawContentType = req.headers['content-type'] || '';
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    if (rawContentType.includes('application/json')) {
      contentType = 'json';
    } else if (rawContentType.startsWith('multipart/form-data')) {
      contentType = 'formData';
    } else {
      contentType = 'unknown';
    }
  }
  const logData = {
    url: req.originalUrl,
    ...(Object.keys(req.query).length ? { query: req.query } : {}),
    ...(req.body && Object.keys(req.body).length ? { body: req.body } : {}),
    ...(req.files?.length ?
      { files: req.files.map((f) => f.originalname) }
      : {})
  };
  req.logger.info(
    logData,
    contentType !== 'no-body' ?
      `<- Incoming ${contentType} ${req.method} Request`
      : `<- Incoming ${req.method} Request`
  );
  next();
};

export default pinoMiddleware;