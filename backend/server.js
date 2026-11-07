const fs = require('fs');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const { pool } = require('./config/db');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middleware/error');
const { authenticate } = require('./middleware/auth');
const settings = require('./services/settings');
const settingsCtrl = require('./controllers/settingsController');
const seoCtrl = require('./controllers/seoController');
const { renderIndex } = require('./services/meta');
const { startScheduler } = require('./jobs/scheduler');
const push = require('./services/push');

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'script-src': ["'self'", 'https://www.google.com', 'https://www.gstatic.com', 'https://accounts.google.com', 'https://apis.google.com'],
      'frame-src': ["'self'", 'https://www.google.com', 'https://accounts.google.com', 'https://www.youtube.com', 'https://maps.google.com'],
      'img-src': ["'self'", 'data:', 'blob:', 'https:'],
      'connect-src': ["'self'", 'https://www.google.com', 'https://accounts.google.com'],
      'style-src': ["'self'", "'unsafe-inline'", 'https://accounts.google.com', 'https://fonts.googleapis.com'],
      'font-src': ["'self'", 'data:', 'https://fonts.gstatic.com'],
      'worker-src': ["'self'", 'blob:'],
    },
  },
}));
app.use(cors({
  origin: (origin, cb) => cb(null, !origin || config.corsOrigins.includes(origin) || config.corsOrigins.includes('*')),
  credentials: true,
  exposedHeaders: ['Content-Disposition'],
}));
app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
if (!config.isProd) app.use(morgan('dev'));

// Global API rate limit
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, limit: 1500, standardHeaders: true, legacyHeaders: false }));

// Maintenance mode: public reading APIs return 503 unless an admin is logged in
app.use(['/api/v1/editions/public', '/api/v1/clippings', '/api/v1/comments/public'], authenticate(false), async (req, res, next) => {
  try {
    const s = await settings.getGroup('website_settings');
    if (s.maintenance_mode && !req.user?.is_admin) return res.status(503).json({ success: false, maintenance: true, message: s.maintenance_message });
    next();
  } catch (e) { next(e); }
});

// Uploaded public files (originals are stored outside this folder)
app.use('/uploads', express.static(config.paths.uploads, { maxAge: '30d', immutable: true, index: false, dotfiles: 'deny' }));

// API
app.use('/api/v1', routes);
app.use('/api', notFound);

// PWA + SEO endpoints served from the site root
app.get('/manifest.webmanifest', settingsCtrl.manifest);
app.get('/pwa-icon-192.png', settingsCtrl.pwaIcon(192));
app.get('/pwa-icon-512.png', settingsCtrl.pwaIcon(512));
app.get('/robots.txt', seoCtrl.robots);
app.get('/sitemap.xml', seoCtrl.sitemap);

// Production: serve the React build with server-side SEO meta
const dist = config.paths.frontendDist;
if (fs.existsSync(path.join(dist, 'index.html'))) {
  app.use(express.static(dist, { index: false, maxAge: '7d', setHeaders: (res, p) => { if (/sw\.js$|index\.html$/.test(p)) res.setHeader('Cache-Control', 'no-cache'); } }));
  app.get(/^\/(?!api\/|uploads\/).*/, async (req, res, next) => {
    try {
      const html = await renderIndex(req.path);
      if (!html) return next();
      res.setHeader('Cache-Control', 'no-cache');
      res.type('html').send(html);
    } catch (e) { next(e); }
  });
  console.log(`✓ Serving frontend build from ${dist}`);
}

app.use(notFound);
app.use(errorHandler);

async function start() {
  try {
    await pool.query('SELECT 1');
  } catch (e) {
    console.error(`✗ Cannot connect to MySQL at ${config.db.host}:${config.db.port} (${e.message}). Check backend/.env`);
    process.exit(1);
  }
  const [[mig]] = await pool.query("SELECT COUNT(*) n FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='editions'");
  if (!mig.n) { console.error('✗ Database tables are missing. Run: npm run setup'); process.exit(1); }
  await require('./services/schemaUpgrades').run();
  await require('./services/backup').ensureTables();
  await settings.ensureDefaults();
  await push.ensureVapid().catch((e) => console.warn('VAPID setup skipped:', e.message));
  for (const d of [config.paths.uploads, config.paths.originals, config.paths.tmp]) fs.mkdirSync(d, { recursive: true });
  app.listen(config.port, process.env.HOST || '0.0.0.0', () => console.log(`✓ ePaper API running on ${config.apiUrl} (port ${config.port}, ${config.env})`));
  startScheduler();
}

if (require.main === module) start();
module.exports = app;
