const { getDb } = require('../db/connection');

function list(req, res, next) {
  try {
    const db = getDb();
    const { meter_id, limit = 50 } = req.query;
    const rows = meter_id
      ? db
          .prepare(
            `SELECT * FROM pressure_readings WHERE meter_id = ?
             ORDER BY recorded_at DESC LIMIT ?`
          )
          .all(meter_id, Number(limit))
      : db
          .prepare(
            `SELECT * FROM pressure_readings ORDER BY recorded_at DESC LIMIT ?`
          )
          .all(Number(limit));
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

function get(req, res, next) {
  try {
    const db = getDb();
    const row = db
      .prepare(`SELECT * FROM pressure_readings WHERE id = ?`)
      .get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Reading not found' });
    res.json(row);
  } catch (err) {
    next(err);
  }
}

function create(req, res, next) {
  try {
    const { meter_id, pressure_bar, recorded_at } = req.body;

    if (!meter_id || pressure_bar == null) {
      return res
        .status(400)
        .json({ error: 'meter_id and pressure_bar are required' });
    }
    if (Number(pressure_bar) < 0) {
      return res
        .status(400)
        .json({ error: 'pressure_bar must be non-negative' });
    }

    const db = getDb();

    // Verify meter exists
    const meter = db
      .prepare(`SELECT id FROM meters WHERE id = ?`)
      .get(meter_id);
    if (!meter) return res.status(404).json({ error: 'Meter not found' });

    const args = recorded_at
      ? [meter_id, pressure_bar, recorded_at]
      : [meter_id, pressure_bar];
    const sql = recorded_at
      ? `INSERT INTO pressure_readings (meter_id, pressure_bar, recorded_at) VALUES (?, ?, ?)`
      : `INSERT INTO pressure_readings (meter_id, pressure_bar) VALUES (?, ?)`;

    const info = db.prepare(sql).run(...args);
    res.status(201).json(
      db
        .prepare(`SELECT * FROM pressure_readings WHERE id = ?`)
        .get(info.lastInsertRowid)
    );
  } catch (err) {
    next(err);
  }
}

function remove(req, res, next) {
  try {
    const db = getDb();
    const info = db
      .prepare(`DELETE FROM pressure_readings WHERE id = ?`)
      .run(req.params.id);
    if (info.changes === 0)
      return res.status(404).json({ error: 'Reading not found' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

module.exports = { list, get, create, remove };
