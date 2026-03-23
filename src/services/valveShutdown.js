const { computeMassBalance } = require('./massBalance');

/**
 * Algorithm 5 — Automated Valve Shutdown
 *
 * Called inline after every successful flow reading insert.
 * If L_ratio > threshold, the district valve is automatically CLOSED.
 */
function checkAndShutdown(db, districtId) {
  const balance = computeMassBalance(db, districtId);

  if (!balance.leakAlert) {
    return { action: 'none', ...balance };
  }

  db.prepare(`UPDATE districts SET valve_status = 'CLOSED' WHERE id = ?`).run(
    districtId
  );

  return { action: 'VALVE_CLOSED', ...balance };
}

module.exports = { checkAndShutdown };
