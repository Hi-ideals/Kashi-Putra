const multer = require('multer');
const config = require('../config');
const { ApiError } = require('../utils/http');

function notFound(req, res) {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let status = err.status || 500;
  let message = err.message || 'Internal server error';
  let errors = err.errors;

  if (err instanceof multer.MulterError) {
    status = 400;
    //message = err.code === 'LIMIT_FILE_SIZE' ? `File too large. Maximum size is ${Math.round(config.upload.maxBytes / 1048576)} MB.` : err.message;
    message = err.code === 'LIMIT_FILE_SIZE' ? 'File too large. Please upload a smaller file.' : err.message;
  } else if (err.code === 'ER_DUP_ENTRY') {
    status = 409; message = 'A record with the same unique value already exists.';
  } else if (err.code === 'ER_ROW_IS_REFERENCED_2' || err.code === 'ER_ROW_IS_REFERENCED') {
    status = 409; message = 'This record is in use by other records and cannot be deleted.';
  } else if (err.type === 'entity.too.large') {
    status = 413; message = 'Request body too large.';
  } else if (!(err instanceof ApiError) && status === 500) {
    console.error(err);
    if (config.isProd) message = 'Internal server error';
  }
  res.status(status).json({ success: false, message, ...(errors ? { errors } : {}) });
}

module.exports = { notFound, errorHandler };
