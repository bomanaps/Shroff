---
test: ../check-complete-stablecoin-market-snapshot-at-the-delivery_test.md
status: failed
started: 2026-11-24T23:06:15.155Z
duration_s: 39
session_id: f0f8c5d7-8426-4fcf-91ed-9c606e58ae01
---

# Check complete Stablecoin Market Snapshot at the delivery URL — Result

## Step 1 ✗ failed (18.3s)
md5: a4cf92a88fead703c49edc154d685afa
Reason: The delivered report URL shows only a horoscope page, not the requested report. — bug verdict: Delivered report URL points to horoscope page [automation_bug/config_issue, confidence 0.91]
In the browser, open {{delivery_url}} and view the delivered report page, then assert the visible report title equals "Stablecoin Market Snapshot".

## Step 2 ✓ passed (—)
md5: e34d54516db36697b90f6e9a342d1f61
On the delivered report page, inspect the stablecoin asset table, then assert it contains at least five asset rows.

## Step 3 ✓ passed (—)
md5: c06b41d8d6fa0ff52614016a5e658469
On the delivered report page, inspect every row of the stablecoin asset table, then assert every asset row shows a price value and every asset row shows a 24h change value.

## Step 4 ✓ passed (—)
md5: 918ea5bae26865665080961f08fa5634
On the delivered report page, inspect the report's generated-at information, then assert a generated-at timestamp is shown.
