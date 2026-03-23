/**
 * Algorithm 2 — Pressure Drop Correlation (Torricelli-based Burst Detection)
 *
 * Q ∝ √P  →  Pearson correlation between flow_lps and sqrt(pressure_bar).
 * A healthy pipe shows r ≈ 1. When pressure drops but flow surges (burst pipe),
 * the correlation collapses toward 0 or goes negative.
 *
 * Pairs flow and pressure readings recorded within 1 minute of each other.
 */
function pearson(xs, ys) {
  const n = xs.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;

  let num = 0, denX = 0, denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }

  const denom = Math.sqrt(denX * denY);
  return denom === 0 ? 0 : num / denom;
}

function computePressureCorrelation(db, meterId, n) {
  const SAMPLES = n || 20;
  const THRESHOLD = parseFloat(
    process.env.BURST_CORRELATION_THRESHOLD || '0.3'
  );

  // Match flow and pressure readings within a 1-minute window.
  const readings = db
    .prepare(
      `SELECT fr.flow_lps, pr.pressure_bar
       FROM flow_readings fr
       JOIN pressure_readings pr
         ON pr.meter_id = fr.meter_id
        AND ABS(julianday(pr.recorded_at) - julianday(fr.recorded_at)) < (1.0 / 1440)
       WHERE fr.meter_id = ?
       ORDER BY fr.recorded_at DESC
       LIMIT ?`
    )
    .all(meterId, SAMPLES);

  if (readings.length < 5) {
    return {
      meterId,
      samplesUsed: readings.length,
      correlation: null,
      burstAlert: false,
      message: 'Insufficient paired readings (need ≥ 5)',
    };
  }

  const xs = readings.map((r) => r.flow_lps);
  const ys = readings.map((r) => Math.sqrt(r.pressure_bar));
  const r = pearson(xs, ys);

  return {
    meterId,
    samplesUsed: readings.length,
    correlation: parseFloat(r.toFixed(4)),
    threshold: THRESHOLD,
    burstAlert: r < THRESHOLD,
  };
}

module.exports = { computePressureCorrelation };
