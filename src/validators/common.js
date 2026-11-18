import { z } from 'zod';

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

export const passwordSchema = z.string().regex(
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,64}$/,
  'Password must be 8-64 characters and include upper, lower, and a number',
);

export function requestSchema({ body, query, params } = {}) {
  return z.object({
    body: body ?? z.object({}).strict(),
    query: query ?? z.object({}).strip(),
    params: params ?? z.object({}).strip(),
  });
}

export const paging = {
  page: z.string().optional(),
  limit: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  search: z.string().max(120).optional(),
};
