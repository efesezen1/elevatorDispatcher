const { getDb } = require('../db/connection');

function list(req, res, next) {
  try {
    const db = getDb();
    const { district_id } = req.query;
    const rows = district_id
      ? db
          .prepare(
            `SELECT * FROM meters WHERE district_id = ? ORDER BY created_at DESC`
          )
          .all(district_id)
      : db.prepare(`SELECT * FROM meters ORDER BY created_at DESC`).all();
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

function get(req, res, next) {
  try {
    const db = getDb();
    const row = db
      .prepare(`SELECT * FROM meters WHERE id = ?`)
      .get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Meter not found' });
    res.json(row);
  } catch (err) {
    next(err);
  }
}

function create(req, res, next) {
  try {
    const { district_id, label, type } = req.body;
    if (!district_id || !label || !type) {
      return res
        .status(400)
        .json({ error: 'district_id, label, and type are required' });
    }
    if (!['INLET', 'OUTLET'].includes(type)) {
      return res
        .status(400)
        .json({ error: 'type must be INLET or OUTLET' });
    }

    const db = getDb();
    const district = db
      .prepare(`SELECT id FROM districts WHERE id = ?`)
      .get(district_id);
    if (!district) {
      return res.status(404).json({ error: 'District not found' });
    }

    const info = db
      .prepare(
        `INSERT INTO meters (district_id, label, type) VALUES (?, ?, ?)`
      )
      .run(district_id, label, type);

    res.status(201).json(
      db.prepare(`SELECT * FROM meters WHERE id = ?`).get(info.lastInsertRowid)
    );
  } catch (err) {
    next(err);
  }
}

function update(req, res, next) {
  try {
    const db = getDb();
    const existing = db
      .prepare(`SELECT * FROM meters WHERE id = ?`)
      .get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Meter not found' });

    const label = req.body.label ?? existing.label;
    const type = req.body.type ?? existing.type;

    if (!['INLET', 'OUTLET'].includes(type)) {
      return res.status(400).json({ error: 'type must be INLET or OUTLET' });
    }

    db.prepare(`UPDATE meters SET label = ?, type = ? WHERE id = ?`).run(
      label,
      type,
      req.params.id
    );

    res.json(
      db.prepare(`SELECT * FROM meters WHERE id = ?`).get(req.params.id)
    );
  } catch (err) {
    next(err);
  }
}

function remove(req, res, next) {
  try {
    const db = getDb();
    const info = db
      .prepare(`DELETE FROM meters WHERE id = ?`)
      .run(req.params.id);
    if (info.changes === 0)
      return res.status(404).json({ error: 'Meter not found' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

module.exports = { list, get, create, update, remove };
