/** Area mapping: states, districts, cities, regions and location → edition/category mappings. */
const { query, one } = require('../config/db');
const { ApiError, ok, created, asyncHandler } = require('../utils/http');
const { slugify, cleanText } = require('../utils/helpers');
const cache = require('../services/cache');
const { audit } = require('../services/audit');

const ENTITIES = {
  states: { table: 'states', parent: null, fields: ['name', 'code', 'status'] },
  districts: { table: 'districts', parent: 'state_id', fields: ['name', 'state_id', 'status'] },
  cities: { table: 'cities', parent: 'district_id', fields: ['name', 'district_id', 'status'] },
  regions: { table: 'regions', parent: null, fields: ['name', 'state_id', 'description', 'status'] },
};

function entity(req) {
  const e = ENTITIES[req.params.entity];
  if (!e) throw ApiError.notFound('Unknown area type');
  return e;
}

const list = asyncHandler(async (req, res) => {
  const e = entity(req);
  const w = ['1=1']; const p = [];
  if (req.query.q) { w.push('t.name LIKE ?'); p.push(`%${req.query.q}%`); }
  if (req.query.state_id && ['districts', 'regions'].includes(req.params.entity)) { w.push('t.state_id=?'); p.push(req.query.state_id); }
  if (req.query.district_id && req.params.entity === 'cities') { w.push('t.district_id=?'); p.push(req.query.district_id); }
  if (req.query.status) { w.push('t.status=?'); p.push(req.query.status); }
  const joins = {
    states: 'SELECT t.*, (SELECT COUNT(*) FROM districts d WHERE d.state_id=t.id) AS child_count FROM states t',
    districts: 'SELECT t.*, s.name AS state_name, (SELECT COUNT(*) FROM cities c WHERE c.district_id=t.id) AS child_count FROM districts t JOIN states s ON s.id=t.state_id',
    cities: 'SELECT t.*, d.name AS district_name, d.state_id, s.name AS state_name FROM cities t JOIN districts d ON d.id=t.district_id JOIN states s ON s.id=d.state_id',
    regions: 'SELECT t.*, s.name AS state_name FROM regions t LEFT JOIN states s ON s.id=t.state_id',
  };
  ok(res, await query(`${joins[req.params.entity]} WHERE ${w.join(' AND ')} ORDER BY t.name`, p));
});

const save = (isNew) => asyncHandler(async (req, res) => {
  const e = entity(req);
  const b = req.body || {};
  const name = cleanText(b.name);
  if (!name || name.length < 2) throw ApiError.badRequest('Name is required', { name: 'Name is required' });
  if (e.parent && !b[e.parent]) throw ApiError.badRequest(`${e.parent === 'state_id' ? 'State' : 'District'} is required`);
  const status = b.status === 'inactive' ? 'inactive' : 'active';
  const vals = { name, slug: slugify(name), status };
  if (e.fields.includes('code')) vals.code = cleanText(b.code || '').slice(0, 10) || null;
  if (e.fields.includes('state_id')) vals.state_id = b.state_id ? Number(b.state_id) : null;
  if (e.fields.includes('district_id')) vals.district_id = Number(b.district_id);
  if (e.fields.includes('description')) vals.description = cleanText(b.description || '').slice(0, 255) || null;
  let id = req.params.id;
  if (isNew) {
    const r = await query(`INSERT INTO ${e.table} SET ?`, [vals]);
    id = r.insertId;
  } else {
    const r = await query(`UPDATE ${e.table} SET ? WHERE id=?`, [vals, id]);
    if (!r.affectedRows) throw ApiError.notFound();
  }
  await audit(req, `area.${req.params.entity}.${isNew ? 'created' : 'updated'}`, req.params.entity, id, { name });
  cache.invalidate('public:');
  (isNew ? created : ok)(res, await one(`SELECT * FROM ${e.table} WHERE id=?`, [id]), isNew ? 'Created successfully' : 'Updated successfully');
});

const remove = asyncHandler(async (req, res) => {
  const e = entity(req);
  const r = await query(`DELETE FROM ${e.table} WHERE id=?`, [req.params.id]);
  if (!r.affectedRows) throw ApiError.notFound();
  await audit(req, `area.${req.params.entity}.deleted`, req.params.entity, req.params.id);
  cache.invalidate('public:');
  ok(res, null, 'Deleted successfully');
});

const toggle = asyncHandler(async (req, res) => {
  const e = entity(req);
  await query(`UPDATE ${e.table} SET status=IF(status='active','inactive','active') WHERE id=?`, [req.params.id]);
  cache.invalidate('public:');
  ok(res, await one(`SELECT * FROM ${e.table} WHERE id=?`, [req.params.id]), 'Status updated');
});

/* ------------ Mappings ------------ */
const mappingSelect = `SELECT m.*, s.name AS state_name, d.name AS district_name, ci.name AS city_name, r.name AS region_name,
  c.name AS category_name, e.title AS edition_title, e.edition_date
  FROM area_mappings m LEFT JOIN states s ON s.id=m.state_id LEFT JOIN districts d ON d.id=m.district_id LEFT JOIN cities ci ON ci.id=m.city_id
  LEFT JOIN regions r ON r.id=m.region_id LEFT JOIN edition_categories c ON c.id=m.category_id LEFT JOIN editions e ON e.id=m.edition_id`;

const listMappings = asyncHandler(async (req, res) => {
  const w = ['1=1']; const p = [];
  if (req.query.q) { w.push('m.location_name LIKE ?'); p.push(`%${req.query.q}%`); }
  for (const k of ['state_id', 'district_id', 'category_id', 'region_id', 'edition_id']) if (req.query[k]) { w.push(`m.${k}=?`); p.push(req.query[k]); }
  ok(res, await query(`${mappingSelect} WHERE ${w.join(' AND ')} ORDER BY m.sort_order, m.location_name`, p));
});

const saveMapping = (isNew) => asyncHandler(async (req, res) => {
  const b = req.body || {};
  const n = (v) => (v ? Number(v) : null);
  const vals = {
    location_name: cleanText(b.location_name), state_id: n(b.state_id), district_id: n(b.district_id), city_id: n(b.city_id),
    region_id: n(b.region_id), category_id: n(b.category_id), edition_id: n(b.edition_id),
    status: b.status === 'inactive' ? 'inactive' : 'active', sort_order: Number(b.sort_order) || 0,
  };
  if (!vals.location_name) throw ApiError.badRequest('Location name is required', { location_name: 'Location name is required' });
  if (!vals.category_id && !vals.edition_id && !vals.region_id) throw ApiError.badRequest('Map the location to a category, region or edition');
  let id = req.params.id;
  if (isNew) id = (await query('INSERT INTO area_mappings SET ?', [vals])).insertId;
  else if (!(await query('UPDATE area_mappings SET ? WHERE id=?', [vals, id])).affectedRows) throw ApiError.notFound();
  await audit(req, `area.mapping.${isNew ? 'created' : 'updated'}`, 'area_mapping', id, vals);
  cache.invalidate('public:');
  (isNew ? created : ok)(res, await one(`${mappingSelect} WHERE m.id=?`, [id]), 'Mapping saved');
});

const removeMapping = asyncHandler(async (req, res) => {
  if (!(await query('DELETE FROM area_mappings WHERE id=?', [req.params.id])).affectedRows) throw ApiError.notFound();
  await audit(req, 'area.mapping.deleted', 'area_mapping', req.params.id);
  cache.invalidate('public:');
  ok(res, null, 'Mapping deleted');
});

const toggleMapping = asyncHandler(async (req, res) => {
  await query("UPDATE area_mappings SET status=IF(status='active','inactive','active') WHERE id=?", [req.params.id]);
  cache.invalidate('public:');
  ok(res, await one(`${mappingSelect} WHERE m.id=?`, [req.params.id]), 'Status updated');
});

/** Public tree of active locations that have at least one active mapping. */
const publicTree = asyncHandler(async (req, res) => {
  const data = await cache.remember('public:areas', 120, async () => {
    const mappings = await query(`${mappingSelect} WHERE m.status='active' AND (s.id IS NULL OR s.status='active') AND (d.id IS NULL OR d.status='active') AND (ci.id IS NULL OR ci.status='active') AND (r.id IS NULL OR r.status='active')
      ORDER BY m.sort_order, m.location_name`);
    const states = await query("SELECT id, name, slug FROM states WHERE status='active' ORDER BY name");
    const districts = await query("SELECT id, state_id, name, slug FROM districts WHERE status='active' ORDER BY name");
    const regions = await query("SELECT id, state_id, name, slug FROM regions WHERE status='active' ORDER BY name");
    const usedStates = new Set(mappings.map((m) => m.state_id).filter(Boolean));
    const usedDistricts = new Set(mappings.map((m) => m.district_id).filter(Boolean));
    return {
      mappings: mappings.map((m) => ({ id: m.id, location_name: m.location_name, state_id: m.state_id, district_id: m.district_id, city_id: m.city_id, region_id: m.region_id, category_id: m.category_id, edition_id: m.edition_id, category_name: m.category_name, district_name: m.district_name, state_name: m.state_name })),
      states: states.filter((s) => usedStates.has(s.id)),
      districts: districts.filter((d) => usedDistricts.has(d.id)),
      regions,
    };
  });
  ok(res, data);
});

module.exports = { list, create: save(true), update: save(false), remove, toggle, listMappings, createMapping: saveMapping(true), updateMapping: saveMapping(false), removeMapping, toggleMapping, publicTree };
