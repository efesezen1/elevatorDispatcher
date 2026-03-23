/**
 * Algorithm 3 — Moving Average Smoothing (SMA)
 *
 * Returns a Simple Moving Average of flow over the last N readings
 * for every meter in the district. Filters out sensor outliers.
 */
function smoothedFlow(db, districtId, windowSize) {
  const n = windowSize || parseInt(process.env.SMA_WINDOW || '5', 10);

  const meters = db
    .prepare(`SELECT id, label, type FROM meters WHERE district_id = ?`)
    .all(districtId);

  return meters.map((meter) => {
    const readings = db
      .prepare(
        `SELECT flow_lps, recorded_at
         FROM flow_readings
         WHERE meter_id = ?
         ORDER BY recorded_at DESC
         LIMIT ?`
      )
      .all(meter.id, n);

    const sma =
      readings.length === 0
        ? null
        : readings.reduce((s, r) => s + r.flow_lps, 0) / readings.length;

    return { ...meter, sma, readingsUsed: readings.length, window: n };
  });
}

module.exports = { smoothedFlow };
