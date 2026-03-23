/**
 * Algorithm 4 — Minimum Night Flow (MNF) Analysis
 *
 * Aggregates INLET flow between 02:00–03:59 for the last N days.
 * High base flow during this window indicates background leakage.
 */
function computeMNF(db, districtId, days) {
  const windowDays = days || 7;
  const MNF_THRESHOLD = parseFloat(process.env.MNF_THRESHOLD || '2.0');

  // strftime('%H', ...) BETWEEN '02' AND '03' captures 02:00:00–03:59:59
  const rows = db
    .prepare(
      `SELECT
         date(fr.recorded_at)  AS day,
         AVG(fr.flow_lps)      AS avg_mnf,
         COUNT(*)              AS reading_count
       FROM flow_readings fr
       JOIN meters m ON m.id = fr.meter_id
       WHERE m.district_id = ?
         AND m.type = 'INLET'
         AND strftime('%H', fr.recorded_at) BETWEEN '02' AND '03'
         AND fr.recorded_at >= datetime('now', ? || ' days')
       GROUP BY date(fr.recorded_at)
       ORDER BY day DESC`
    )
    .all(districtId, `-${windowDays}`);

  const overallMNF =
    rows.length === 0
      ? null
      : rows.reduce((s, r) => s + r.avg_mnf, 0) / rows.length;

  return {
    districtId,
    windowDays,
    dailyMNF: rows,
    overallMNF,
    threshold: MNF_THRESHOLD,
    backgroundLeakageAlert:
      overallMNF !== null && overallMNF > MNF_THRESHOLD,
  };
}

module.exports = { computeMNF };
