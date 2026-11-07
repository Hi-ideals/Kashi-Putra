const fs = require('fs');
const path = require('path');
const multer = require('multer');
const config = require('../config');
const { ApiError } = require('../utils/http');
const { randomToken } = require('../utils/helpers');

fs.mkdirSync(config.paths.tmp, { recursive: true });

const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.webp'];

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, config.paths.tmp),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${randomToken(8)}${path.extname(file.originalname).toLowerCase()}`),
});

function makeFilter({ allowPdf = false, allowSvgIco = false } = {}) {
  return (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const okImage = IMAGE_MIMES.includes(file.mimetype) && IMAGE_EXT.includes(ext);
    const okPdf = allowPdf && file.mimetype === 'application/pdf' && ext === '.pdf';
    const okIco = allowSvgIco && ['.ico'].includes(ext) && /icon/.test(file.mimetype);
    if (okImage || okPdf || okIco) return cb(null, true);
    cb(ApiError.badRequest(`Unsupported file type: ${file.originalname}. Allowed: JPG, JPEG, PNG, WebP${allowPdf ? ', PDF' : ''}`));
  };
}

/** Page uploads (images + optional PDF). */
const pageUpload = multer({ storage, fileFilter: makeFilter({ allowPdf: true }), limits: { fileSize: config.upload.maxBytes, files: config.upload.maxFiles } });
/** Generic image uploads (logos, covers, category images...). 8 MB. */
const imageUpload = multer({ storage, fileFilter: makeFilter({ allowSvgIco: true }), limits: { fileSize: 25 * 1024 * 1024, files: 10 } });

/** Remove temp files after a request (call in finally). */
function cleanupFiles(req) {
  const files = [].concat(req.file || [], ...(Array.isArray(req.files) ? [req.files] : Object.values(req.files || {})));
  for (const f of files.flat()) if (f?.path) fs.promises.unlink(f.path).catch(() => {});
}

module.exports = { pageUpload, imageUpload, cleanupFiles };
