const { z } = require('zod');

const email = z.string().trim().toLowerCase().email('Enter a valid email address').max(190);
const password = z.string().min(8, 'Password must be at least 8 characters').max(128)
  .regex(/[A-Za-z]/, 'Password must contain a letter').regex(/[0-9]/, 'Password must contain a number');
const id = z.coerce.number().int().positive();
const optId = z.union([z.coerce.number().int().positive(), z.literal(''), z.null()]).optional().transform((v) => (v ? Number(v) : null));
const bool = z.union([z.boolean(), z.literal('true'), z.literal('false'), z.literal('1'), z.literal('0'), z.literal(1), z.literal(0)])
  .transform((v) => v === true || v === 'true' || v === '1' || v === 1);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');
const datetime = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'Invalid date/time');
const status = z.enum(['active', 'inactive']);
const str = (max, min = 0) => z.string().trim().max(max).min(min);
const optStr = (max) => z.string().trim().max(max).optional().nullable().transform((v) => v || null);
const url = z.string().trim().max(500).refine((v) => !v || /^(https?:\/\/|\/|mailto:|tel:)/i.test(v), 'Enter a valid URL');

const recaptchaToken = z.string().optional().nullable();

module.exports = {
  z, email, password, id, optId, bool, date, datetime, status, str, optStr, url,

  register: z.object({ name: str(120, 2), email, password, phone: optStr(30), subscribe: bool.optional(), recaptchaToken }),
  login: z.object({ email, password: z.string().min(1, 'Password is required').max(128), recaptchaToken }),
  google: z.object({ credential: z.string().min(20) }),
  profile: z.object({ name: str(120, 2), phone: optStr(30) }),
  changePassword: z.object({ current_password: z.string().max(128).optional().default(''), new_password: password, confirm_password: z.string(), logout_other_sessions: bool.optional() })
    .refine((d) => d.new_password === d.confirm_password, { message: 'Passwords do not match', path: ['confirm_password'] }),
  forgot: z.object({ email, admin: bool.optional(), recaptchaToken }),
  reset: z.object({ token: z.string().min(20), password, confirm_password: z.string() })
    .refine((d) => d.password === d.confirm_password, { message: 'Passwords do not match', path: ['confirm_password'] }),

  edition: z.object({
    title: str(200, 2),
    category_id: id,
    region_id: optId,
    edition_date: date,
    description: optStr(5000),
    status: z.enum(['draft', 'scheduled', 'published', 'unpublished', 'archived']).optional().default('draft'),
    publish_at: z.string().optional().nullable(),
    comments_enabled: bool.optional().default(true),
    allow_download: bool.optional().default(true),
    allow_print: bool.optional().default(true),
    is_active: bool.optional().default(true),
    slug: z.string().trim().max(200).optional().nullable(),
    remove_cover: bool.optional(),
  }),

  category: z.object({ name: str(150, 2), slug: z.string().trim().max(160).optional().nullable(), description: optStr(5000), status: status.default('active'), sort_order: z.coerce.number().int().default(0), is_main: bool.optional().default(false), remove_image: bool.optional() }),

  comment: z.object({ edition_id: id, page_id: optId, area_id: optId, body: str(1000, 2), recaptchaToken }),

  subscriberPublic: z.object({ email, name: optStr(120), recaptchaToken }),
  subscriberAdmin: z.object({ email, name: optStr(120), phone: optStr(30), status: z.enum(['active', 'pending', 'unsubscribed']).default('active'), plan: str(60).default('free') }),

  social: z.object({ platform: str(40, 1), label: str(80, 1), url: url.refine((v) => !!v, 'URL is required'), icon: optStr(60), sort_order: z.coerce.number().int().default(0), status: status.default('active') }),

  cms: z.object({ title: str(200, 2), slug: z.string().trim().max(200).optional().nullable(), content: z.string().max(500000).optional().default(''), status: z.enum(['published', 'draft']).default('published'),
    show_in_footer: bool.optional().default(true), show_in_header: bool.optional().default(false), sort_order: z.coerce.number().int().default(0), remove_image: bool.optional(),
    seo: z.any().optional() }),

  seo: z.object({ meta_title: optStr(255), meta_description: optStr(500), meta_keywords: optStr(500), og_title: optStr(255), og_description: optStr(500),
    og_image: optStr(500), canonical_url: optStr(500), robots: optStr(60) }),

  schedule: z.object({ edition_id: id, publish_at: datetime, notify_on_publish: bool.optional().default(true), notes: optStr(255) }),

  notification: z.object({ title: str(150, 2), message: str(500, 2), url: url.optional().nullable(), audience: z.enum(['all', 'users', 'guests']).default('all'), edition_id: optId, send_now: bool.optional().default(true) }),

  pushSubscribe: z.object({ endpoint: z.string().url().max(2000), keys: z.object({ p256dh: z.string().max(255), auth: z.string().max(255) }) }),

  clip: z.object({ page_id: id, x: z.coerce.number().min(0).max(1), y: z.coerce.number().min(0).max(1), w: z.coerce.number().min(0.01).max(1), h: z.coerce.number().min(0.01).max(1) }),

  adminUser: z.object({ name: str(120, 2), email, phone: optStr(30), role_id: optId, status: z.enum(['active', 'blocked', 'inactive']).default('active'), password: password.optional().or(z.literal('')), can_comment: bool.optional().default(true) }),
  role: z.object({ name: str(80, 2), description: optStr(255), permissions: z.array(z.string().max(120)).default([]) }),

  contact: z.object({ name: str(120, 2), email, subject: optStr(200), message: str(5000, 5), recaptchaToken }),
};
