# Vachana Kranti ePaper – Dynamic ePaper Management System

A complete, database-driven ePaper newspaper platform:

- **Public website (React + Vite):** a newspaper page viewer with zoom, pan, pinch, swipe and full-screen. Readers can crop articles and share clippings, comment, browse editions, and subscribe. The site installs as a PWA and can send push notifications.
- **Admin panel (`/admin`):** editions, the publish workflow, pages, categories, area mapping, scheduling, action management, comments, subscribers, settings (ePaper, theme, watermark, SEO, reCAPTCHA, social, PWA), CMS pages, users, roles, permissions and audit logs.
- **REST API (Node.js + Express + MySQL):** JWT authentication, role-based permissions, validation, an image pipeline, a scheduler, web push, and a sitemap with server-side SEO meta tags.

```
epaper/
├── backend/                 Node.js / Express API
│   ├── config/              env config, DB pool, permission & settings catalogues
│   ├── controllers/         request handlers per module
│   ├── routes/              /api/v1/* route definitions
│   ├── middleware/          auth (JWT + RBAC), validation, uploads, errors
│   ├── services/            images/watermark/PDF, push, mail, settings, cache, SEO meta, audit
│   ├── validators/          zod request schemas
│   ├── jobs/                scheduled-publishing job (node-cron)
│   ├── migrations/          SQL migrations + runner
│   ├── seeders/             base seed (roles, admin, settings…) + optional demo content
│   ├── tests/smoke.js       end-to-end API test (58 checks)
│   ├── uploads/             PUBLIC optimised images (served at /uploads)
│   └── storage/originals/   PRIVATE original uploads (never modified, not public)
└── frontend/                React (Vite) app – public site + admin panel
    ├── public/              service worker (sw.js), offline page, default icons
    └── src/                 components, pages, layouts, routes, services, hooks, context, store, utils, styles
```

---

## 1. Requirements (Windows)

| Software | Version | Download |
|---|---|---|
| Node.js | 18 LTS or newer (20/22 recommended) | https://nodejs.org |
| MySQL | 8.0 (or MariaDB 10.6+) | https://dev.mysql.com/downloads/installer/ (or XAMPP / WAMP) |
| Git (optional) | any | https://git-scm.com |

No other system tools are needed. Image processing (`sharp`) and PDF conversion (`pdfjs-dist` + `@napi-rs/canvas`) ship prebuilt Windows binaries through npm.

> Using XAMPP: start **MySQL** from the XAMPP control panel. The default user is `root` with an empty password.

---

## 2. Installation (Windows – Command Prompt or PowerShell)

### 2.1 Backend

```bat
cd epaper\backend
npm install
copy .env.example .env
```

Open `backend\.env` in a text editor and set at least:

```ini
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=epaper

JWT_SECRET=<long random string>
SETTINGS_ENCRYPTION_KEY=<another long random string>

ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=Admin@12345
```

To generate random secrets:

```bat
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Create the database tables and the base data:

```bat
npm run setup
```

`npm run setup` runs `npm run migrate` (it creates the database if it's missing and applies `migrations/*.sql`) and then `npm run seed`. The seed creates the roles, permissions, Super Admin, default settings, the "Main Edition" category, CMS pages, social links and Karnataka districts.

Optional: load sample editions so the site has something to show immediately:

```bat
npm run seed:demo
```

Start the API:

```bat
npm run dev        :: development (auto-restart on change)
:: or
npm start          :: production
```

The API runs at **http://localhost:5000**. Health check: http://localhost:5000/api/v1/health

### 2.2 Frontend

Open a second terminal:

```bat
cd epaper\frontend
npm install
copy .env.example .env
npm run dev
```

The website runs at **http://localhost:5173**. The Vite dev server proxies `/api`, `/uploads`, `/manifest.webmanifest`, `/sitemap.xml` and `/robots.txt` to the backend.

- Public site: http://localhost:5173
- Admin panel: http://localhost:5173/admin/login, using the `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env`

> **Change the admin password** after the first login (Admin → Change Password).

---

## 3. Production build & run

The backend can serve the built React app itself, with server-side SEO/Open Graph tags (so WhatsApp, Facebook and Google see the right titles and preview images):

```bat
cd epaper\frontend
npm run build                 :: creates frontend\dist

cd ..\backend
:: in .env set:
::   NODE_ENV=production
::   APP_URL=https://epaper.yourdomain.com
::   API_URL=https://epaper.yourdomain.com
::   CORS_ORIGINS=https://epaper.yourdomain.com
::   FRONTEND_DIST=../frontend/dist
npm start
```

Everything (website, admin, API, images, sitemap, manifest) is now served from one port (`PORT`, default 5000).

### Keep it running on Windows (PM2)

```bat
npm install -g pm2 pm2-windows-startup
cd epaper\backend
pm2 start server.js --name epaper
pm2 save
pm2-startup install
```

### Deployment notes

1. **Reverse proxy / HTTPS.** Put IIS (with URL Rewrite + ARR), Nginx or Apache in front of port 5000 and enable HTTPS. Push notifications, PWA install and the clipboard API require HTTPS (localhost is exempt). Example Nginx block:
   ```nginx
   server {
     server_name epaper.yourdomain.com;
     client_max_body_size 200m;
     location / { proxy_pass http://127.0.0.1:5000; proxy_set_header Host $host; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto $scheme; }
   }
   ```
2. **Separate hosting (optional).** To host `frontend/dist` on a different domain or CDN, build with `VITE_API_ORIGIN=https://api.yourdomain.com` and add the frontend's origin to `CORS_ORIGINS`.
3. **Back up** the MySQL database, `backend/uploads/` and `backend/storage/originals/`.
4. **Email.** Fill in `SMTP_*` in `.env` for password reset, subscriber and contact emails. Without SMTP, emails are printed to the server console.
5. **Time zone.** Scheduled times are entered in the admin's browser time zone and stored as absolute times. The server pins its MySQL session time zone to Node's, so `NOW()` and the scheduler always agree.

---

## 4. Configuration reference (`backend/.env`)

| Key | Purpose |
|---|---|
| `PORT` | API / web server port (default 5000) |
| `APP_URL` | Public website URL, used for share links, emails and the sitemap |
| `API_URL` | Public API URL, used for absolute image URLs in push notifications |
| `CORS_ORIGINS` | Comma-separated allowed browser origins |
| `DB_*` | MySQL connection |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | Token signing / lifetime |
| `SETTINGS_ENCRYPTION_KEY` | Encrypts secrets stored in the DB (reCAPTCHA secret, VAPID private key) |
| `BCRYPT_ROUNDS` | Password hashing cost |
| `MAX_LOGIN_ATTEMPTS`, `LOCK_MINUTES` | Brute-force protection |
| `MAX_UPLOAD_MB`, `MAX_FILES_PER_UPLOAD` | Upload limits for newspaper pages |
| `ADMIN_*` | Initial Super Admin (used by `npm run seed` only) |
| `SMTP_*`, `MAIL_FROM` | Outgoing email |
| `VAPID_*` | Optional fixed Web Push keys (auto-generated and stored encrypted if empty) |
| `FRONTEND_DIST` | Path of the React build served in production |

Everything else (site name, logos, theme, watermark, SEO, reCAPTCHA keys, Google client ID, PWA, social links, comment rules, reader actions, maintenance mode…) is edited in the **admin panel**, not in code.

---

## 5. Feature checklist (reference site → this implementation)

**Public website**

| Feature | Where |
|---|---|
| Logo, name, date, edition dropdown, footer, social links, important links | Header / Footer (from ePaper, Theme, Social settings) |
| Page viewer: zoom buttons, mouse-wheel zoom, double-click zoom, drag-pan, pinch, swipe, keyboard (←/→, +/−, 0, ↑/↓, Home/End), full screen, thumbnails, page selector, first/prev/next/last, loading indicator, aspect ratio kept | `components/public/PageViewer.jsx`, `Reader.jsx` |
| Image quality: medium image first, large image loaded in the background when zooming; next page preloaded; lazy thumbnails | `PageViewer.jsx` |
| Crop: draw, move, resize (8 handles), preview, download, share, copy link, open clipping page | `PageViewer.jsx`, `Share.jsx`, `/clip/:code` |
| Share: WhatsApp, Facebook, Telegram, X, Email, copy link, native share | `Share.jsx` |
| Editions by date (with previous/next), category, district/region; same-day editions; latest; archive with filters | `EditionSelector.jsx`, `/editions`, `/category/:slug` |
| Comments: login (email or Google), 200-character limit (configurable), moderation, reCAPTCHA, spam rules, per-edition and global toggle | `Comments.jsx` + Comment Settings |
| Accounts: register, login, logout, forgot/reset password, profile, subscription status, unsubscribe, push on/off | `/account`, `/unsubscribe` |
| CMS pages (About, Contact + form, Privacy, Disclaimer, Terms, Important Links) | `/page/:slug` |
| PWA: manifest from settings, service worker, offline page, install button (iOS help), push notifications | `public/sw.js`, `/manifest.webmanifest` |
| English / Kannada UI switch, light / dark mode, maintenance mode | Header + ePaper / Theme settings |

**Admin panel:** Dashboard (MySQL statistics, trends, recent activity, alerts bell) · Manage Editions (search, filters, date filters, sort, pagination, bulk actions) · Add/Edit Edition (category, region, date, cover, description, status, schedule, reader options) · Publish Edition wizard (select → upload/arrange → preview/validate → publish now / schedule / draft) · Page manager (bulk upload JPG/PNG/WebP/PDF, drag-drop order, replace, edit title, show/hide, set first page, preview, download original) · Edition Categories · Area Mapping (states, districts, cities, regions, location mappings) · Scheduling (upcoming / completed / cancelled, reschedule, cancel, run now) · Action Management (reader toolbar toggles + bulk publish/unpublish/activate/deactivate/archive/duplicate/delete) · Shared Clippings · Comments (approve/reject/spam/delete, bulk, block users) · Subscribers (CRUD, search, filters, CSV export, email notification, unsubscribe requests) · Push Notifications (send with image, URL and audience, history, resend, auto-notify on publish) · Contact Messages · CMS Pages (rich editor, images, URL, SEO) · SEO (home, editions, pages, categories, CMS, robots.txt, sitemap) · ePaper / Theme / Watermark (live preview, re-process pages) / Comment / Social / reCAPTCHA (test) / PWA settings · Users · Roles & permission matrix · Audit Logs · Profile & Change Password (logout other sessions).

**Roles:** Super Admin, Administrator, Editor, Publisher, Content Manager and Regional Manager. Permissions use the form `module.action` (view / add / edit / delete / publish / manage), and every API route and admin screen checks them.

---

## 6. Database

There are 31 InnoDB tables (utf8mb4) with foreign keys, indexes, unique constraints, timestamps and soft deletes: `users, roles, permissions, role_permissions, editions, edition_categories, edition_pages, page_images, regions, states, districts, cities, area_mappings, edition_schedules, comments, subscribers, social_links, website_settings, theme_settings, watermark_settings, seo_settings, push_notifications, notification_subscriptions, pwa_settings, cms_pages, recaptcha_settings, audit_logs, password_resets, shared_clippings, contact_messages, migrations`.

- Schema: `backend/migrations/001_initial_schema.sql`
- New migrations: add `002_something.sql` and run `npm run migrate`
- Seeders: `npm run seed` is idempotent and safe to re-run. `npm run seed:demo` loads optional sample content.

**Image storage.** Originals are copied to `storage/originals/` and are never changed or served publicly. For each page, optimised WebP variants (large 2200px, medium 1100px, thumbnail 320px) are generated in `uploads/editions/<id>/`, with the watermark applied to large and medium. "Apply to all existing pages" in Watermark Settings regenerates the variants from the originals.

---

## 7. API overview (`/api/v1`)

`auth` · `editions` (+ `/public`, `/public/latest`, `/public/dates`, `/public/resolve`, `/public/:slug`, `/bulk`, `/:id/actions/:action`, `/:id/duplicate`) · `pages` (`/edition/:id/upload`, `/reorder`, `/validate`, `/:id/replace`, `/:id/set-first`, `/regenerate`, `/:id/download`, `/:id/original`) · `categories` · `areas` (`/:entity`, `/mappings`, `/public`) · `schedules` · `comments` · `subscribers` (`/export`, `/notify`) · `settings` (`/public`, `/:group`, `/social`, `/watermark/preview`, `/recaptcha/test`) · `seo` · `notifications` · `cms` (`/contact`, `/messages`) · `clippings` · `admin` (`/dashboard`, `/alerts`, `/users`, `/roles`, `/permissions`, `/audit-logs`). Aliases: `/dashboard`, `/audit-logs`, `/roles`, `/permissions`, `/users`, `/theme`, `/watermark`, `/pwa`, `/social`.

Every response uses the shape `{ success, message, data, meta? }`. Errors use proper HTTP status codes (400/401/403/404/409/413/423/429/503), with field errors in `errors`.

---

## 8. Security

- bcrypt password hashing
- JWT with token versioning, so changing a password, blocking a user or using "log out everywhere" invalidates existing sessions
- Account lockout after repeated failed logins
- Rate limits on auth, comments, subscriptions, clippings, the contact form and the API overall
- Helmet headers with a Content-Security-Policy, and a CORS allow-list
- Parameterised SQL everywhere
- Input validation with zod; HTML sanitised with sanitize-html (comments stored as plain text, CMS HTML allow-listed)
- Upload checks: extension + MIME + real image decoding, plus size and count limits
- Original files kept private; CSV export protected against formula injection
- reCAPTCHA secret and VAPID private key stored AES-256-GCM encrypted and never sent to the browser
- Audit log for logins and every admin change
- CSRF: the API uses bearer tokens in headers (no auth cookies), so cross-site requests can't act on a user's behalf

---

## 9. Testing

With the backend running and seeded:

```bat
cd epaper\backend
node tests\smoke.js
```

This runs 58 end-to-end checks covering the workflows from the specification:

1. **Publishing:** add edition → upload → reorder → validate → publish → visible on the website
2. **Scheduling:** schedule → hidden until due → automatic publication
3. **Reading:** edition list, dates, page download, crop → clipping URL
4. **Comments:** register → comment → pending → admin approves → shown
5. **Settings:** site name, theme, social links and SEO changes reflected publicly; sitemap, robots and manifest
6. **Subscribers:** subscribe → admin search → CSV export → unsubscribe
7. **Notifications:** send and history

Permissions are also checked: an editor is blocked from settings and deletion, and a reader can't log into the admin. The script cleans up its own test data.

---

## 10. Troubleshooting

| Problem | Fix |
|---|---|
| `Cannot connect to MySQL` | Check that MySQL is running and that `DB_*` in `.env` is correct |
| `Database tables are missing` | Run `npm run setup` |
| `npm install` fails on `sharp` / `@napi-rs/canvas` | Use Node 18+ x64. Delete `node_modules` and run `npm install` again |
| Images not shown in development | Make sure the backend is running on the port set in `frontend/.env` (`VITE_BACKEND_URL`) |
| Push notifications don't arrive | Use HTTPS (or localhost), allow notifications in the browser, and check that "Enable browser push notifications" is on |
| Google login button missing | Set the Google client ID in ePaper Settings and add your domain to the OAuth client's authorised origins |
| Password reset email not received | Configure `SMTP_*`. Without it, the reset link is printed in the backend console |
