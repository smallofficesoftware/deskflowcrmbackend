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
  // Full request bodies (GPS batches, uploads, passwords/tokens) made the out log grow
  // by GBs. Log only the body field names unless LOG_REQUEST_BODY=1 is set for debugging.
  const hasBody = req.body && typeof req.body === 'object' && Object.keys(req.body).length;
  const logData = {
    url: req.originalUrl,
    ...(Object.keys(req.query).length ? { query: req.query } : {}),
    ...(hasBody
      ? process.env.LOG_REQUEST_BODY === '1'
        ? { body: req.body }
        : { bodyKeys: Object.keys(req.body) }
      : {}),
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