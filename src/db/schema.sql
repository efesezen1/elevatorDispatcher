PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS districts (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT    NOT NULL UNIQUE,
    valve_status TEXT    NOT NULL DEFAULT 'OPEN'
                         CHECK(valve_status IN ('OPEN','CLOSED')),
    created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- INLET meters feed the district; OUTLET meters are customer/branch meters.
-- Mass balance: Q_in = sum of INLET readings, Σq_out = sum of OUTLET readings.
CREATE TABLE IF NOT EXISTS meters (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    district_id INTEGER NOT NULL REFERENCES districts(id) ON DELETE CASCADE,
    label       TEXT    NOT NULL,
    type        TEXT    NOT NULL CHECK(type IN ('INLET','OUTLET')),
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS flow_readings (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    meter_id    INTEGER NOT NULL REFERENCES meters(id) ON DELETE CASCADE,
    flow_lps    REAL    NOT NULL,   -- litres per second
    recorded_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pressure_readings (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    meter_id     INTEGER NOT NULL REFERENCES meters(id) ON DELETE CASCADE,
    pressure_bar REAL    NOT NULL,
    recorded_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_flow_meter_time
    ON flow_readings(meter_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_pressure_meter_time
    ON pressure_readings(meter_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_meters_district
    ON meters(district_id);
