#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# E2E test suite for the Water Leak Detection API
# Usage: ./test.sh
# The script starts the server, runs all tests, then tears it down.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# Always run from the project root regardless of where the script is invoked from
cd "$(dirname "$0")"

BASE="http://localhost:3000/api"
DB_FILE="./water.db"
SERVER_PID=""
PASS=0
FAIL=0

# ── Colours ──────────────────────────────────────────────────────────────────
GREEN="\033[0;32m"
RED="\033[0;31m"
CYAN="\033[0;36m"
BOLD="\033[1m"
RESET="\033[0m"

# ── Helpers ──────────────────────────────────────────────────────────────────
section() { echo -e "\n${CYAN}${BOLD}━━━  $1  ━━━${RESET}"; }

pass() {
  PASS=$((PASS + 1))
  echo -e "  ${GREEN}✓${RESET} $1"
}

fail() {
  FAIL=$((FAIL + 1))
  echo -e "  ${RED}✗${RESET} $1"
  echo -e "    ${RED}Got:${RESET} $2"
}

# Assert HTTP status code
assert_status() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$actual" == "$expected" ]]; then
    pass "$label (HTTP $expected)"
  else
    fail "$label" "HTTP $actual (expected $expected)"
  fi
}

# Assert a JSON field equals a value
assert_field() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$actual" == "$expected" ]]; then
    pass "$label (= $expected)"
  else
    fail "$label" "\"$actual\" (expected \"$expected\")"
  fi
}

# Assert a JSON field is not "null" or empty
assert_not_null() {
  local label="$1" actual="$2"
  if [[ -n "$actual" && "$actual" != "null" ]]; then
    pass "$label (present)"
  else
    fail "$label" "null or missing"
  fi
}

# Run curl and capture both body and status code
req() {
  local method="$1" url="$2"
  shift 2
  # remaining args are forwarded (e.g. -d '...' -H '...')
  curl -s -o /tmp/wld_body.json -w "%{http_code}" \
    -X "$method" "$url" \
    -H "Content-Type: application/json" \
    "$@"
}

body() { cat /tmp/wld_body.json; }
# Extract a JSON scalar value by key name using grep + sed.
# Supports dotted paths by extracting the last segment's key.
# Works for string and numeric/boolean values.
jq_val() {
  local key
  key="${1##*.}"   # take the last segment of a dotted path
  body | grep -o "\"${key}\":[^,}]*" | head -1 | sed 's/^"[^"]*"://; s/^[[:space:]]*//; s/"//g; s/[[:space:]]*$//'
}

# ── Server lifecycle ──────────────────────────────────────────────────────────
start_server() {
  # Kill any process already occupying port 3000
  local existing
  existing=$(lsof -ti :3000 2>/dev/null || true)
  if [[ -n "$existing" ]]; then
    echo "Killing existing process on :3000 (PID $existing)"
    kill "$existing" 2>/dev/null || true
    sleep 0.5
  fi

  rm -f "$DB_FILE" "${DB_FILE}-shm" "${DB_FILE}-wal"
  node server.js &>/tmp/wld_server.log &
  SERVER_PID=$!
  # Wait until the port is accepting connections
  local attempts=0
  until curl -sf "$BASE/districts" &>/dev/null; do
    sleep 0.3
    attempts=$((attempts + 1))
    if [[ $attempts -gt 20 ]]; then
      echo "Server failed to start. Log:" && cat /tmp/wld_server.log && exit 1
    fi
  done
  echo -e "${BOLD}Server started (PID $SERVER_PID)${RESET}"
}

stop_server() {
  kill "$SERVER_PID" 2>/dev/null || true
  rm -f "$DB_FILE" "${DB_FILE}-shm" "${DB_FILE}-wal"
  echo -e "${BOLD}Server stopped, test DB cleaned up.${RESET}"
}

trap stop_server EXIT

# ═════════════════════════════════════════════════════════════════════════════
start_server

# ─────────────────────────────────────────────────────────────────────────────
section "1. Districts CRUD"

# Create district
STATUS=$(req POST "$BASE/districts" -d '{"name":"Zone-A"}')
assert_status "Create district" 201 "$STATUS"
assert_field "district name" "Zone-A" "$(jq_val name)"
assert_field "district valve_status" "OPEN" "$(jq_val valve_status)"
DISTRICT_ID=$(jq_val id)
assert_not_null "district id" "$DISTRICT_ID"

# Get district
STATUS=$(req GET "$BASE/districts/$DISTRICT_ID")
assert_status "Get district" 200 "$STATUS"
assert_field "GET district name" "Zone-A" "$(jq_val name)"

# List districts
STATUS=$(req GET "$BASE/districts")
assert_status "List districts" 200 "$STATUS"

# Attempt duplicate name
STATUS=$(req POST "$BASE/districts" -d '{"name":"Zone-A"}')
assert_status "Duplicate district name → 500/409" 500 "$STATUS"

# PATCH district name
STATUS=$(req PATCH "$BASE/districts/$DISTRICT_ID" -d '{"name":"Zone-A-Renamed"}')
assert_status "PATCH district name" 200 "$STATUS"
assert_field "Updated district name" "Zone-A-Renamed" "$(jq_val name)"

# Restore name for subsequent tests
STATUS=$(req PATCH "$BASE/districts/$DISTRICT_ID" -d '{"name":"Zone-A"}')
assert_status "Restore district name" 200 "$STATUS"

# PATCH with invalid valve_status
STATUS=$(req PATCH "$BASE/districts/$DISTRICT_ID" -d '{"valve_status":"MAYBE"}')
assert_status "Invalid valve_status → 400" 400 "$STATUS"

# GET non-existent district
STATUS=$(req GET "$BASE/districts/9999")
assert_status "Non-existent district → 404" 404 "$STATUS"

# ─────────────────────────────────────────────────────────────────────────────
section "2. Meters CRUD"

# Create INLET meter
STATUS=$(req POST "$BASE/meters" -d "{\"district_id\":$DISTRICT_ID,\"label\":\"Main Inlet\",\"type\":\"INLET\"}")
assert_status "Create INLET meter" 201 "$STATUS"
assert_field "meter type" "INLET" "$(jq_val type)"
METER_INLET=$(jq_val id)
assert_not_null "INLET meter id" "$METER_INLET"

# Create OUTLET meter 1
STATUS=$(req POST "$BASE/meters" -d "{\"district_id\":$DISTRICT_ID,\"label\":\"Customer A\",\"type\":\"OUTLET\"}")
assert_status "Create OUTLET meter (Customer A)" 201 "$STATUS"
METER_OUTLET_A=$(jq_val id)

# Create OUTLET meter 2
STATUS=$(req POST "$BASE/meters" -d "{\"district_id\":$DISTRICT_ID,\"label\":\"Customer B\",\"type\":\"OUTLET\"}")
assert_status "Create OUTLET meter (Customer B)" 201 "$STATUS"
METER_OUTLET_B=$(jq_val id)

# List meters filtered by district
STATUS=$(req GET "$BASE/meters?district_id=$DISTRICT_ID")
assert_status "List meters by district" 200 "$STATUS"

# Invalid meter type
STATUS=$(req POST "$BASE/meters" -d "{\"district_id\":$DISTRICT_ID,\"label\":\"Bad\",\"type\":\"SENSOR\"}")
assert_status "Invalid meter type → 400" 400 "$STATUS"

# PATCH meter label
STATUS=$(req PATCH "$BASE/meters/$METER_OUTLET_B" -d '{"label":"Customer B Updated"}')
assert_status "PATCH meter label" 200 "$STATUS"
assert_field "Updated meter label" "Customer B Updated" "$(jq_val label)"

# Meter for non-existent district
STATUS=$(req POST "$BASE/meters" -d '{"district_id":9999,"label":"Ghost","type":"INLET"}')
assert_status "Meter for non-existent district → 404" 404 "$STATUS"

# ─────────────────────────────────────────────────────────────────────────────
section "3. Pressure Readings"

# Post pressure for INLET meter (paired with flow for Algorithm 2)
BATCH_FAIL=0
for p in 4.5 4.3 4.1 3.9 4.2 4.4 4.0 4.1 4.3 4.6; do
  STATUS=$(req POST "$BASE/pressure" -d "{\"meter_id\":$METER_INLET,\"pressure_bar\":$p}")
  [[ "$STATUS" != "201" ]] && BATCH_FAIL=$((BATCH_FAIL+1))
done
[[ $BATCH_FAIL -eq 0 ]] && pass "10× pressure readings ingested for INLET meter" \
                         || fail "Pressure batch" "$BATCH_FAIL inserts failed"

# Invalid pressure
STATUS=$(req POST "$BASE/pressure" -d "{\"meter_id\":$METER_INLET,\"pressure_bar\":-1}")
assert_status "Negative pressure_bar → 400" 400 "$STATUS"

# Pressure for non-existent meter
STATUS=$(req POST "$BASE/pressure" -d '{"meter_id":9999,"pressure_bar":3.0}')
assert_status "Pressure for non-existent meter → 404" 404 "$STATUS"

# List pressure readings
STATUS=$(req GET "$BASE/pressure?meter_id=$METER_INLET&limit=5")
assert_status "List pressure readings" 200 "$STATUS"

# ─────────────────────────────────────────────────────────────────────────────
section "4. Flow Readings — normal operation (L_ratio < 40%)"
# Strategy: post OUTLET readings FIRST.
# When Q_in = 0 the mass balance returns L_ratio=null (no alert).
# Then post INLET readings — with Q_out already present, L_ratio ≈ 0.20 → no shutdown.
# Q_in≈10, q_out≈3+5=8 → L_ratio = (10-8)/10 = 0.20

BATCH_FAIL=0
for f in 2.9 3.1 3.0 3.0 2.8 3.0; do
  STATUS=$(req POST "$BASE/flow" -d "{\"meter_id\":$METER_OUTLET_A,\"flow_lps\":$f}")
  [[ "$STATUS" != "201" ]] && BATCH_FAIL=$((BATCH_FAIL+1))
done
[[ $BATCH_FAIL -eq 0 ]] && pass "6× OUTLET-A flow readings ingested (≈3 L/s)" \
                         || fail "OUTLET-A batch" "$BATCH_FAIL reads failed"

BATCH_FAIL=0
for f in 4.9 5.1 5.0 5.0 4.8 5.0; do
  STATUS=$(req POST "$BASE/flow" -d "{\"meter_id\":$METER_OUTLET_B,\"flow_lps\":$f}")
  [[ "$STATUS" != "201" ]] && BATCH_FAIL=$((BATCH_FAIL+1))
done
[[ $BATCH_FAIL -eq 0 ]] && pass "6× OUTLET-B flow readings ingested (≈5 L/s)" \
                         || fail "OUTLET-B batch" "$BATCH_FAIL reads failed"

BATCH_FAIL=0
for f in 9.8 10.1 10.0 10.2 9.9 10.0; do
  STATUS=$(req POST "$BASE/flow" -d "{\"meter_id\":$METER_INLET,\"flow_lps\":$f}")
  [[ "$STATUS" != "201" ]] && BATCH_FAIL=$((BATCH_FAIL+1))
done
[[ $BATCH_FAIL -eq 0 ]] && pass "6× INLET flow readings ingested (≈10 L/s)" \
                         || fail "INLET batch" "$BATCH_FAIL reads failed"

# Verify valve is still OPEN
STATUS=$(req GET "$BASE/districts/$DISTRICT_ID")
assert_field "Valve still OPEN after 20% leak" "OPEN" "$(jq_val valve_status)"

# Negative flow rejected
STATUS=$(req POST "$BASE/flow" -d "{\"meter_id\":$METER_INLET,\"flow_lps\":-1}")
assert_status "Negative flow_lps → 400" 400 "$STATUS"

# Missing flow_lps
STATUS=$(req POST "$BASE/flow" -d "{\"meter_id\":$METER_INLET}")
assert_status "Missing flow_lps → 400" 400 "$STATUS"

# List flow readings
STATUS=$(req GET "$BASE/flow?meter_id=$METER_INLET&limit=3")
assert_status "List flow readings" 200 "$STATUS"

# Get single flow reading
STATUS=$(req GET "$BASE/flow/1")
assert_status "Get single flow reading" 200 "$STATUS"

# ─────────────────────────────────────────────────────────────────────────────
section "5. Analytics — healthy network state"

# Mass balance: L_ratio ≈ 0.2
STATUS=$(req GET "$BASE/analytics/$DISTRICT_ID/mass-balance")
assert_status "GET mass-balance" 200 "$STATUS"
LEAK_ALERT=$(jq_val leakAlert)
assert_field "leakAlert false at 20% loss" "false" "$LEAK_ALERT"
L_RATIO=$(jq_val L_ratio)
assert_not_null "L_ratio calculated" "$L_RATIO"

# Smoothed flow (SMA)
STATUS=$(req GET "$BASE/analytics/$DISTRICT_ID/smoothed-flow?window=5")
assert_status "GET smoothed-flow" 200 "$STATUS"

# MNF (no night-window data yet — should return empty dailyMNF)
STATUS=$(req GET "$BASE/analytics/$DISTRICT_ID/mnf?days=7")
assert_status "GET mnf" 200 "$STATUS"
assert_field "backgroundLeakageAlert false (no night data)" "false" "$(jq_val backgroundLeakageAlert)"

# Pressure correlation on INLET meter
STATUS=$(req GET "$BASE/analytics/$DISTRICT_ID/pressure-correlation?meter_id=$METER_INLET")
assert_status "GET pressure-correlation" 200 "$STATUS"

# Pressure correlation without meter_id → 400
STATUS=$(req GET "$BASE/analytics/$DISTRICT_ID/pressure-correlation")
assert_status "Pressure-correlation without meter_id → 400" 400 "$STATUS"

# Summary endpoint
STATUS=$(req GET "$BASE/analytics/$DISTRICT_ID/summary")
assert_status "GET summary" 200 "$STATUS"
assert_not_null "summary.massBalance" "$(jq_val massBalance.L_ratio)"
assert_not_null "summary.alerts" "$(jq_val alerts.leakAlert)"

# Analytics for non-existent district
STATUS=$(req GET "$BASE/analytics/9999/mass-balance")
assert_status "Analytics for non-existent district → 404" 404 "$STATUS"

# ─────────────────────────────────────────────────────────────────────────────
section "6. Diurnal / MNF — inject synthetic night-window readings"
# Insert readings with explicit timestamps in the 02:00–04:00 window
# to exercise the MNF SQL query without waiting for midnight.

MIN=10
BATCH_FAIL=0
for f in 3.1 3.5 4.2 2.9 3.8; do
  TS="2026-03-22 02:$(printf '%02d' $MIN):00"
  MIN=$((MIN + 8))
  STATUS=$(req POST "$BASE/flow" \
    -d "{\"meter_id\":$METER_INLET,\"flow_lps\":$f,\"recorded_at\":\"$TS\"}")
  [[ "$STATUS" != "201" ]] && BATCH_FAIL=$((BATCH_FAIL+1))
done
[[ $BATCH_FAIL -eq 0 ]] && pass "5× synthetic night-window INLET flows injected" \
                         || fail "Night-window batch" "$BATCH_FAIL inserts failed (valve may be closed)"

# MNF threshold is 2.0 L/s; our injected values (~3.1–4.2 avg) should trigger
STATUS=$(req GET "$BASE/analytics/$DISTRICT_ID/mnf?days=365")
assert_status "GET mnf after injection" 200 "$STATUS"
assert_field "backgroundLeakageAlert true (avg MNF > 2.0)" "true" "$(jq_val backgroundLeakageAlert)"
assert_not_null "overallMNF computed" "$(jq_val overallMNF)"

# ─────────────────────────────────────────────────────────────────────────────
section "7. Automated Valve Shutdown (L_ratio > 40%)"
# Spike INLET to 20 L/s while outlets stay at 8 L/s → L_ratio ≈ 0.6

STATUS=$(req POST "$BASE/flow" -d "{\"meter_id\":$METER_INLET,\"flow_lps\":20}")
assert_status "POST spike INLET flow → 201" 201 "$STATUS"
SHUTDOWN_ACTION=$(jq_val shutdown.action)
assert_field "Valve auto-closed on spike" "VALVE_CLOSED" "$SHUTDOWN_ACTION"
LEAK_RATIO=$(jq_val shutdown.L_ratio)
assert_not_null "Shutdown L_ratio present" "$LEAK_RATIO"

# Confirm DB state
STATUS=$(req GET "$BASE/districts/$DISTRICT_ID")
assert_status "GET district after shutdown" 200 "$STATUS"
assert_field "valve_status is CLOSED" "CLOSED" "$(jq_val valve_status)"

# ─────────────────────────────────────────────────────────────────────────────
section "8. Valve CLOSED — 403 enforcement"

STATUS=$(req POST "$BASE/flow" -d "{\"meter_id\":$METER_INLET,\"flow_lps\":10}")
assert_status "Flow POST on closed district → 403" 403 "$STATUS"

STATUS=$(req POST "$BASE/flow" -d "{\"meter_id\":$METER_OUTLET_A,\"flow_lps\":3}")
assert_status "OUTLET flow POST on closed district → 403" 403 "$STATUS"

# Pressure readings must still be accepted (diagnostic data needed when valve closed)
STATUS=$(req POST "$BASE/pressure" -d "{\"meter_id\":$METER_INLET,\"pressure_bar\":1.2}")
assert_status "Pressure POST still accepted when valve CLOSED" 201 "$STATUS"

# ─────────────────────────────────────────────────────────────────────────────
section "9. Manual Valve Reopen (operator override)"

STATUS=$(req PATCH "$BASE/districts/$DISTRICT_ID" -d '{"valve_status":"OPEN"}')
assert_status "PATCH reopen valve" 200 "$STATUS"
assert_field "valve_status OPEN after operator override" "OPEN" "$(jq_val valve_status)"

# Flow should be accepted again
STATUS=$(req POST "$BASE/flow" -d "{\"meter_id\":$METER_OUTLET_A,\"flow_lps\":3}")
assert_status "Flow POST accepted after valve reopen" 201 "$STATUS"

# ─────────────────────────────────────────────────────────────────────────────
section "10. CRUD — Delete operations"

# Delete a flow reading
STATUS=$(req DELETE "$BASE/flow/1")
assert_status "DELETE flow reading" 204 "$STATUS"

# Delete non-existent flow reading
STATUS=$(req DELETE "$BASE/flow/9999")
assert_status "DELETE non-existent flow → 404" 404 "$STATUS"

# Delete a pressure reading
STATUS=$(req DELETE "$BASE/pressure/1")
assert_status "DELETE pressure reading" 204 "$STATUS"

# Delete outlet meter (cascades readings)
STATUS=$(req DELETE "$BASE/meters/$METER_OUTLET_B")
assert_status "DELETE meter (cascade)" 204 "$STATUS"

# Verify meter is gone
STATUS=$(req GET "$BASE/meters/$METER_OUTLET_B")
assert_status "Deleted meter → 404" 404 "$STATUS"

# Delete district (cascades meters and readings)
STATUS=$(req DELETE "$BASE/districts/$DISTRICT_ID")
assert_status "DELETE district (cascade)" 204 "$STATUS"

STATUS=$(req GET "$BASE/districts/$DISTRICT_ID")
assert_status "Deleted district → 404" 404 "$STATUS"

# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
TOTAL=$((PASS + FAIL))
if [[ $FAIL -eq 0 ]]; then
  echo -e "${GREEN}${BOLD}  ALL $TOTAL TESTS PASSED${RESET}"
else
  echo -e "${RED}${BOLD}  $FAIL/$TOTAL TESTS FAILED${RESET} — $PASS passed"
fi
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"

[[ $FAIL -eq 0 ]]
