const { getDb } = require('../db/connection');
const { checkAndShutdown } = require('../services/valveShutdown');

function list(req, res, next) {
  try {
    const db = getDb();
    const { meter_id, limit = 50 } = req.query;
    const rows = meter_id
      ? db
          .prepare(
            `SELECT * FROM flow_readings WHERE meter_id = ?
             ORDER BY recorded_at DESC LIMIT ?`
          )
          .all(meter_id, Number(limit))
      : db
          .prepare(
            `SELECT * FROM flow_readings ORDER BY recorded_at DESC LIMIT ?`
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
      .prepare(`SELECT * FROM flow_readings WHERE id = ?`)
      .get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Reading not found' });
    res.json(row);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/flow
 *
 * 1. valveGuard middleware has already checked the valve and attached req.district.
 * 2. Insert the reading.
 * 3. Run mass balance → auto-close valve if L_ratio > threshold.
 */
function create(req, res, next) {
  try {
    const { meter_id, flow_lps, recorded_at } = req.body;

    if (flow_lps == null) {
      return res.status(400).json({ error: 'flow_lps is required' });
    }
    if (Number(flow_lps) < 0) {
      return res.status(400).json({ error: 'flow_lps must be non-negative' });
    }

    const db = getDb();

    const args = recorded_at
      ? [meter_id, flow_lps, recorded_at]
      : [meter_id, flow_lps];
    const sql = recorded_at
      ? `INSERT INTO flow_readings (meter_id, flow_lps, recorded_at) VALUES (?, ?, ?)`
      : `INSERT INTO flow_readings (meter_id, flow_lps) VALUES (?, ?)`;

    const info = db.prepare(sql).run(...args);
    const reading = db
      .prepare(`SELECT * FROM flow_readings WHERE id = ?`)
      .get(info.lastInsertRowid);

    // Algorithm 5 — check mass balance and auto-close valve if needed
    const shutdown = checkAndShutdown(db, req.district.district_id);

    res.status(201).json({ reading, shutdown });
  } catch (err) {
    next(err);
  }
}

function remove(req, res, next) {
  try {
    const db = getDb();
    const info = db
      .prepare(`DELETE FROM flow_readings WHERE id = ?`)
      .run(req.params.id);
    if (info.changes === 0)
      return res.status(404).json({ error: 'Reading not found' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

module.exports = { list, get, create, remove };
