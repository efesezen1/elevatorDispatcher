/**
 * Algorithm 1 — Mass Balance Equation
 *
 * L_ratio = (Q_in - Σq_out) / Q_in
 *
 * Uses the most recent flow reading per meter for the given district.
 */
function computeMassBalance(db, districtId) {
  const THRESHOLD = parseFloat(process.env.LEAK_RATIO_THRESHOLD || '0.4');

  const rows = db
    .prepare(
      `SELECT m.type, fr.flow_lps
       FROM meters m
       JOIN flow_readings fr ON fr.meter_id = m.id
       WHERE m.district_id = ?
         AND fr.id = (
           SELECT id FROM flow_readings
           WHERE meter_id = m.id
           ORDER BY recorded_at DESC, id DESC
           LIMIT 1
         )`
    )
    .all(districtId);

  const Q_in = rows
    .filter((r) => r.type === 'INLET')
    .reduce((sum, r) => sum + r.flow_lps, 0);

  const Q_out = rows
    .filter((r) => r.type === 'OUTLET')
    .reduce((sum, r) => sum + r.flow_lps, 0);

  if (Q_in === 0) {
    return { Q_in: 0, Q_out: 0, L_ratio: null, leakAlert: false };
  }

  const L_ratio = (Q_in - Q_out) / Q_in;
  return { Q_in, Q_out, L_ratio, leakAlert: L_ratio > THRESHOLD };
}

module.exports = { computeMassBalance };
