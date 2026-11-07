const { ApiError } = require('../utils/http');

/** Validate req[source] against a zod schema; replaces it with the parsed value. */
const validate = (schema, source = 'body') => (req, res, next) => {
  const result = schema.safeParse(req[source] ?? {});
  if (!result.success) {
    const errors = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join('.') || '_';
      if (!errors[key]) errors[key] = issue.message;
    }
    return next(ApiError.badRequest(Object.values(errors)[0] || 'Validation failed', errors));
  }
  if (source === 'query') req.validQuery = result.data; else req[source] = result.data;
  next();
};

module.exports = { validate };
