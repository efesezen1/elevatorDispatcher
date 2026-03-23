const { getDb } = require('../db/connection');

/**
 * Express middleware for POST /api/flow.
 * Resolves the district from meter_id and rejects the request with 403
 * if the district valve is CLOSED.
 */
function valveGuard(req, res, next) {
  const meter_id = Number(req.body?.meter_id);
  if (!meter_id) {
    return res.status(400).json({ error: 'meter_id is required' });
  }

  const db = getDb();
  const row = db
    .prepare(
      `SELECT d.id AS district_id, d.valve_status
       FROM meters m
       JOIN districts d ON d.id = m.district_id
       WHERE m.id = ?`
    )
    .get(meter_id);

  if (!row) {
    return res.status(404).json({ error: `Meter ${meter_id} not found` });
  }

  if (row.valve_status === 'CLOSED') {
    return res.status(403).json({
      error: 'District valve is CLOSED. Flow readings are rejected.',
      district_id: row.district_id,
    });
  }

  req.district = row; // attach for downstream controller use
  next();
}

module.exports = valveGuard;
