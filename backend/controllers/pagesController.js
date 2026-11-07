const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { query, one, transaction, pool } = require('../config/db');
const { ApiError, ok, asyncHandler } = require('../utils/http');
const { cleanText, toBool, fileUrl } = require('../utils/helpers');
const images = require('../services/images');
const settings = require('../services/settings');
const cache = require('../services/cache');
const { audit } = require('../services/audit');
const { pagesWithImages, renumberPages } = require('../services/editions');
const { cleanupFiles } = require('../middleware/upload');
const { PUBLIC_WHERE } = require('./editionsController');

async function getEdition(id) {
  const ed = await one('SELECT * FROM editions WHERE id=? AND deleted_at IS NULL', [id]);
  if (!ed) throw ApiError.notFound('Edition not found');
  return ed;
}

/** Process one image file into a page row (new or replacing). */
async function storePageImage(conn, editionId, filePath, originalName, { pageId = null, pageNumber = null } = {}) {
  const orig = await images.saveOriginal(filePath, editionId, originalName);
  const variants = await images.buildVariants(images.absOriginal(orig.path), editionId);
  let id = pageId;
  if (!id) {
    const [r] = await conn.query('INSERT INTO edition_pages (edition_id, page_number, title, original_name, width, height) VALUES (?,?,?,?,?,?)',
      [editionId, pageNumber, `Page ${pageNumber}`, String(originalName).slice(0, 250), orig.width, orig.height]);
    id = r.insertId;
  } else {
    // remove previous files
    const [old] = await conn.query('SELECT variant, path FROM page_images WHERE page_id=?', [id]);
    for (const o of old) images.safeUnlink(o.variant === 'original' ? images.absOriginal(o.path) : images.absUpload(o.path));
    await conn.query('DELETE FROM page_images WHERE page_id=?', [id]);
    await conn.query('UPDATE edition_pages SET original_name=?, width=?, height=? WHERE id=?', [String(originalName).slice(0, 250), orig.width, orig.height, id]);
  }
  for (const [variant, v] of Object.entries({ original: orig, ...variants })) {
    await conn.query('INSERT INTO page_images (page_id, variant, path, mime, width, height, size_bytes, is_watermarked) VALUES (?,?,?,?,?,?,?,?)',
      [id, variant, v.path, v.mime, v.width, v.height, v.size_bytes, v.is_watermarked]);
  }
  return id;
}

/** Natural sort so page-2.jpg comes before page-10.jpg */
const natural = (a, b) => a.originalname.localeCompare(b.originalname, undefined, { numeric: true, sensitivity: 'base' });

const list = asyncHandler(async (req, res) => {
  await getEdition(req.params.editionId);
  ok(res, await pagesWithImages(req.params.editionId));
});

const upload = asyncHandler(async (req, res) => {
  const tmpExtra = [];
  try {
    const ed = await getEdition(req.params.editionId);
    const files = (req.files || []).slice().sort(natural);
    if (!files.length) throw ApiError.badRequest('Select at least one page image to upload');
    const s = await settings.getGroup('website_settings');
    // Expand PDFs into page images
    const queue = [];
    for (const f of files) {
      if (f.mimetype === 'application/pdf') {
        if (!s.allow_pdf_upload) throw ApiError.badRequest('PDF upload is disabled in ePaper settings.');
        const pngs = await images.pdfToImages(f.path);
        tmpExtra.push(...pngs);
        pngs.forEach((p, i) => queue.push({ path: p, name: `${path.basename(f.originalname, '.pdf')}-p${i + 1}.png` }));
      } else {
        await images.assertImage(f.path);
        queue.push({ path: f.path, name: f.originalname });
      }
    }
    const created = [];
    const [{ maxn }] = await query('SELECT COALESCE(MAX(page_number),0) maxn FROM edition_pages WHERE edition_id=?', [ed.id]);
    let n = maxn;
    for (const item of queue) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const id = await storePageImage(conn, ed.id, item.path, item.name, { pageNumber: ++n });
        await conn.commit();
        created.push(id);
      } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
    }
    await query('UPDATE editions SET updated_by=? WHERE id=?', [req.user.id, ed.id]);
    await audit(req, 'pages.uploaded', 'edition', ed.id, { count: created.length });
    cache.invalidate('public:');
    ok(res, await pagesWithImages(ed.id), `${created.length} page(s) uploaded successfully`, 201);
  } finally {
    cleanupFiles(req);
    tmpExtra.forEach((p) => images.safeUnlink(p));
  }
});

const replace = asyncHandler(async (req, res) => {
  const tmpExtra = [];
  try {
    const page = await one('SELECT * FROM edition_pages WHERE id=?', [req.params.pageId]);
    if (!page) throw ApiError.notFound('Page not found');
    if (!req.file) throw ApiError.badRequest('Select an image to replace this page');
    let src = req.file.path;
    if (req.file.mimetype === 'application/pdf') {
      const pngs = await images.pdfToImages(req.file.path);
      tmpExtra.push(...pngs);
      src = pngs[0];
    }
    await transaction((conn) => storePageImage(conn, page.edition_id, src, req.file.originalname, { pageId: page.id }));
    await audit(req, 'page.replaced', 'page', page.id, { edition_id: page.edition_id });
    cache.invalidate('public:');
    ok(res, await pagesWithImages(page.edition_id), 'Page replaced successfully');
  } finally {
    cleanupFiles(req);
    tmpExtra.forEach((p) => images.safeUnlink(p));
  }
});

const update = asyncHandler(async (req, res) => {
  const page = await one('SELECT * FROM edition_pages WHERE id=?', [req.params.pageId]);
  if (!page) throw ApiError.notFound('Page not found');
  const b = req.body || {};
  await query('UPDATE edition_pages SET title=?, description=?, is_visible=? WHERE id=?', [
    b.title !== undefined ? cleanText(b.title).slice(0, 200) || null : page.title,
    b.description !== undefined ? cleanText(b.description).slice(0, 500) || null : page.description,
    b.is_visible !== undefined ? (toBool(b.is_visible) ? 1 : 0) : page.is_visible, page.id]);
  await audit(req, 'page.updated', 'page', page.id);
  cache.invalidate('public:');
  ok(res, await pagesWithImages(page.edition_id), 'Page updated');
});

const remove = asyncHandler(async (req, res) => {
  const page = await one('SELECT * FROM edition_pages WHERE id=?', [req.params.pageId]);
  if (!page) throw ApiError.notFound('Page not found');
  const files = await query('SELECT variant, path FROM page_images WHERE page_id=?', [page.id]);
  await transaction(async (conn) => {
    await conn.query('DELETE FROM edition_pages WHERE id=?', [page.id]);
    const [rest] = await conn.query('SELECT id FROM edition_pages WHERE edition_id=? ORDER BY page_number', [page.edition_id]);
    await renumberPages(conn, page.edition_id, rest.map((r) => r.id));
  });
  for (const f of files) images.safeUnlink(f.variant === 'original' ? images.absOriginal(f.path) : images.absUpload(f.path));
  await audit(req, 'page.deleted', 'page', page.id, { edition_id: page.edition_id, page_number: page.page_number });
  cache.invalidate('public:');
  ok(res, await pagesWithImages(page.edition_id), 'Page deleted');
});

const reorder = asyncHandler(async (req, res) => {
  const ed = await getEdition(req.params.editionId);
  const order = (req.body.order || []).map(Number).filter(Boolean);
  const existing = (await query('SELECT id FROM edition_pages WHERE edition_id=?', [ed.id])).map((r) => r.id);
  if (order.some((id) => !existing.includes(id))) throw ApiError.badRequest('Order contains pages from another edition');
  await transaction((conn) => renumberPages(conn, ed.id, order));
  await audit(req, 'pages.reordered', 'edition', ed.id);
  cache.invalidate('public:');
  ok(res, await pagesWithImages(ed.id), 'Page order saved');
});

const setFirst = asyncHandler(async (req, res) => {
  const page = await one('SELECT * FROM edition_pages WHERE id=?', [req.params.pageId]);
  if (!page) throw ApiError.notFound('Page not found');
  const ids = (await query('SELECT id FROM edition_pages WHERE edition_id=? ORDER BY page_number', [page.edition_id])).map((r) => r.id);
  await transaction((conn) => renumberPages(conn, page.edition_id, [page.id, ...ids.filter((i) => i !== page.id)]));
  await audit(req, 'page.set_first', 'page', page.id);
  cache.invalidate('public:');
  ok(res, await pagesWithImages(page.edition_id), 'First page updated');
});

/** Regenerate optimized/watermarked variants from originals. Body: { edition_id } or nothing for all editions. */
async function regenerate(editionId, quality) {
  const where = editionId ? 'WHERE p.edition_id=?' : '';
  const pages = await query(`SELECT p.id, p.edition_id, pi.path FROM edition_pages p JOIN page_images pi ON pi.page_id=p.id AND pi.variant='original' JOIN editions e ON e.id=p.edition_id AND e.deleted_at IS NULL ${where}`, editionId ? [editionId] : []);
  const wm = await settings.getGroup('watermark_settings');
  let done = 0;
  for (const p of pages) {
    const abs = images.absOriginal(p.path);
    if (!fs.existsSync(abs)) continue;
    const old = await query("SELECT path FROM page_images WHERE page_id=? AND variant<>'original'", [p.id]);
    const v = await images.buildVariants(abs, p.edition_id, wm, quality);
    for (const [variant, x] of Object.entries(v)) {
      await query(`INSERT INTO page_images (page_id, variant, path, mime, width, height, size_bytes, is_watermarked) VALUES (?,?,?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE path=VALUES(path), mime=VALUES(mime), width=VALUES(width), height=VALUES(height), size_bytes=VALUES(size_bytes), is_watermarked=VALUES(is_watermarked)`,
      [p.id, variant, x.path, x.mime, x.width, x.height, x.size_bytes, x.is_watermarked]);
    }
    old.forEach((o) => images.safeUnlink(images.absUpload(o.path)));
    done++;
  }
  cache.invalidate('public:');
  return done;
}

const regenerateHandler = asyncHandler(async (req, res) => {
  const editionId = req.body.edition_id ? Number(req.body.edition_id) : null;
  const count = await regenerate(editionId);
  await audit(req, 'pages.regenerated', 'edition', editionId || 'all', { count });
  ok(res, { count }, `${count} page(s) re-processed with current watermark/quality settings`);
});

/** Validate an edition's pages before publishing. */
const validateEdition = asyncHandler(async (req, res) => {
  const ed = await getEdition(req.params.editionId);
  const pages = await pagesWithImages(ed.id);
  const issues = []; const warnings = [];
  if (!pages.length) issues.push('The edition has no pages.');
  if (pages.length && !pages.some((p) => p.is_visible)) issues.push('All pages are hidden.');
  const origs = await query("SELECT pi.page_id, pi.path FROM page_images pi JOIN edition_pages p ON p.id=pi.page_id WHERE p.edition_id=? AND pi.variant='original'", [ed.id]);
  const origMap = Object.fromEntries(origs.map((o) => [o.page_id, o.path]));
  const ratios = [];
  for (const p of pages) {
    for (const v of ['large', 'medium', 'thumb']) {
      if (!p.images[v]) issues.push(`Page ${p.page_number}: missing ${v} image.`);
      else if (!fs.existsSync(images.absUpload(p.images[v].url.replace(/^\/uploads\//, '')))) issues.push(`Page ${p.page_number}: ${v} image file is missing on disk.`);
    }
    if (!origMap[p.id] || !fs.existsSync(images.absOriginal(origMap[p.id]))) warnings.push(`Page ${p.page_number}: original file not found.`);
    if (p.width && p.width < 1000) warnings.push(`Page ${p.page_number}: low resolution (${p.width}px wide). Text may be hard to read.`);
    if (p.width && p.height) ratios.push(p.height / p.width);
  }
  if (ratios.length > 1) {
    const avg = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    pages.forEach((p, i) => { if (ratios[i] && Math.abs(ratios[i] - avg) / avg > 0.25) warnings.push(`Page ${p.page_number}: size/orientation differs from other pages.`); });
  }
  ok(res, { valid: !issues.length, issues, warnings, page_count: pages.length, visible_count: pages.filter((p) => p.is_visible).length });
});

/** Admin: download original file of a page. */
const downloadOriginal = asyncHandler(async (req, res) => {
  const img = await one("SELECT pi.path, p.original_name FROM page_images pi JOIN edition_pages p ON p.id=pi.page_id WHERE pi.page_id=? AND pi.variant='original'", [req.params.pageId]);
  if (!img) throw ApiError.notFound('Original not found');
  res.download(images.absOriginal(img.path), img.original_name || path.basename(img.path));
});

/** Public: download a page (watermarked large variant) if downloads are allowed. */
const publicDownload = asyncHandler(async (req, res) => {
  const row = await one(`SELECT pi.path, p.page_number, e.slug, e.allow_download FROM edition_pages p
    JOIN editions e ON e.id=p.edition_id JOIN page_images pi ON pi.page_id=p.id AND pi.variant='large'
    WHERE p.id=? AND p.is_visible=1 AND ${PUBLIC_WHERE}`, [req.params.pageId]);
  if (!row) throw ApiError.notFound('Page not found');
  const s = await settings.getGroup('website_settings');
  if (!s.action_download || !row.allow_download) throw ApiError.forbidden('Downloads are disabled for this edition.');
  const buf = await sharp(images.absUpload(row.path)).jpeg({ quality: 90 }).toBuffer();
  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Content-Disposition', `attachment; filename="${row.slug}-page-${row.page_number}.jpg"`);
  res.send(buf);
});

module.exports = { list, upload, replace, update, remove, reorder, setFirst, regenerate, regenerateHandler, validateEdition, downloadOriginal, publicDownload, fileUrl };
