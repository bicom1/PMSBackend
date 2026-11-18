import { ApiError } from '../utils/ApiError.js';

function flattenQuery(query) {
  const output = {};
  for (const [key, value] of Object.entries(query || {})) {
    if (Array.isArray(value)) output[key] = value.length ? String(value[0]) : '';
    else if (typeof value === 'string') output[key] = value;
    else return null;
  }
  return output;
}

export const validate = (schema) => (req, _res, next) => {
  const query = flattenQuery(req.query);
  if (!query) return next(new ApiError(400, 'Invalid query parameter'));

  const parsed = schema.safeParse({
    body: req.body ?? {},
    query,
    params: req.params ?? {},
  });

  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    const summary = issues.map((issue) => issue.message).filter(Boolean).join(' ');
    return next(new ApiError(400, summary || 'Validation failed', issues));
  }

  req.body = parsed.data.body ?? {};
  req.query = parsed.data.query ?? {};
  req.params = parsed.data.params ?? {};
  next();
};
