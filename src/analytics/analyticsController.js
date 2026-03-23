const { getDb } = require('../db/connection');
const { computeMassBalance } = require('../services/massBalance');
const { computePressureCorrelation } = require('../services/pressureDrop');
const { smoothedFlow } = require('../services/movingAverage');
const { computeMNF } = require('../services/mnfAnalysis');

function requireDistrict(db, id, res) {
  const district = db.prepare(`SELECT * FROM districts WHERE id = ?`).get(id);
  if (!district) {
    res.status(404).json({ error: 'District not found' });
    return null;
  }
  return district;
}

/** GET /api/analytics/:districtId/mass-balance */
function massBalance(req, res, next) {
  try {
    const db = getDb();
    const district = requireDistrict(db, req.params.districtId, res);
    if (!district) return;
    res.json(computeMassBalance(db, district.id));
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/analytics/:districtId/pressure-correlation
 * Query params: ?meter_id=N&samples=20
 *
 * Runs Torricelli burst detection on a specific INLET meter.
 */
function pressureCorrelation(req, res, next) {
  try {
    const db = getDb();
    const district = requireDistrict(db, req.params.districtId, res);
    if (!district) return;

    const { meter_id, samples } = req.query;
    if (!meter_id) {
      return res.status(400).json({
        error: 'meter_id query param is required for pressure-correlation',
      });
    }

    // Confirm meter belongs to this district
    const meter = db
      .prepare(
        `SELECT id FROM meters WHERE id = ? AND district_id = ? AND type = 'INLET'`
      )
      .get(meter_id, district.id);
    if (!meter) {
      return res.status(404).json({
        error: 'INLET meter not found in this district',
      });
    }

    res.json(
      computePressureCorrelation(db, Number(meter_id), samples ? Number(samples) : undefined)
    );
  } catch (err) {
    next(err);
  }
}

/** GET /api/analytics/:districtId/smoothed-flow?window=5 */
function smoothed(req, res, next) {
  try {
    const db = getDb();
    const district = requireDistrict(db, req.params.districtId, res);
    if (!district) return;

    const win = req.query.window ? Number(req.query.window) : undefined;
    res.json(smoothedFlow(db, district.id, win));
  } catch (err) {
    next(err);
  }
}

/** GET /api/analytics/:districtId/mnf?days=7 */
function mnf(req, res, next) {
  try {
    const db = getDb();
    const district = requireDistrict(db, req.params.districtId, res);
    if (!district) return;

    const days = req.query.days ? Number(req.query.days) : undefined;
    res.json(computeMNF(db, district.id, days));
  } catch (err) {
    next(err);
  }
}

/** GET /api/analytics/:districtId/summary — runs all four algorithms */
function summary(req, res, next) {
  try {
    const db = getDb();
    const district = requireDistrict(db, req.params.districtId, res);
    if (!district) return;

    const balance = computeMassBalance(db, district.id);
    const sma = smoothedFlow(db, district.id);
    const mnfResult = computeMNF(db, district.id);

    // Pressure correlation needs meter_id — run for all INLET meters
    const inletMeters = db
      .prepare(
        `SELECT id, label FROM meters WHERE district_id = ? AND type = 'INLET'`
      )
      .all(district.id);

    const pressureResults = inletMeters.map((m) =>
      computePressureCorrelation(db, m.id)
    );

    res.json({
      district,
      massBalance: balance,
      smoothedFlow: sma,
      mnf: mnfResult,
      pressureCorrelation: pressureResults,
      alerts: {
        leakAlert: balance.leakAlert,
        backgroundLeakageAlert: mnfResult.backgroundLeakageAlert,
        burstAlert: pressureResults.some((r) => r.burstAlert),
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { massBalance, pressureCorrelation, smoothed, mnf, summary };
