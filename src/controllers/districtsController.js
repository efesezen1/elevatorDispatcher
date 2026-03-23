const { getDb } = require('../db/connection');

function list(req, res, next) {
  try {
    const db = getDb();
    const rows = db
      .prepare(`SELECT * FROM districts ORDER BY created_at DESC`)
      .all();
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

function get(req, res, next) {
  try {
    const db = getDb();
    const row = db
      .prepare(`SELECT * FROM districts WHERE id = ?`)
      .get(req.params.id);
    if (!row) return res.status(404).json({ error: 'District not found' });
    res.json(row);
  } catch (err) {
    next(err);
  }
}

function create(req, res, next) {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    const db = getDb();
    const info = db
      .prepare(`INSERT INTO districts (name) VALUES (?)`)
      .run(name);
    const row = db
      .prepare(`SELECT * FROM districts WHERE id = ?`)
      .get(info.lastInsertRowid);
    res.status(201).json(row);
  } catch (err) {
    next(err);
  }
}

function update(req, res, next) {
  try {
    const db = getDb();
    const existing = db
      .prepare(`SELECT * FROM districts WHERE id = ?`)
      .get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'District not found' });

    const name = req.body.name ?? existing.name;
    const valve_status = req.body.valve_status ?? existing.valve_status;

    if (!['OPEN', 'CLOSED'].includes(valve_status)) {
      return res
        .status(400)
        .json({ error: 'valve_status must be OPEN or CLOSED' });
    }

    db.prepare(
      `UPDATE districts SET name = ?, valve_status = ? WHERE id = ?`
    ).run(name, valve_status, req.params.id);

    res.json(
      db.prepare(`SELECT * FROM districts WHERE id = ?`).get(req.params.id)
    );
  } catch (err) {
    next(err);
  }
}

function remove(req, res, next) {
  try {
    const db = getDb();
    const info = db
      .prepare(`DELETE FROM districts WHERE id = ?`)
      .run(req.params.id);
    if (info.changes === 0)
      return res.status(404).json({ error: 'District not found' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

module.exports = { list, get, create, update, remove };
