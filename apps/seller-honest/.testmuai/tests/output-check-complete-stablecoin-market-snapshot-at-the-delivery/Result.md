---
test: ../check-complete-stablecoin-market-snapshot-at-the-delivery_test.md
status: passed
started: 2026-11-19T16:05:45.243Z
duration_s: 202
session_id: 46204a09-10c8-4d9a-8028-7c5cee15ceb3
---

# Check complete Stablecoin Market Snapshot at the delivery URL — Result

## Step 1 ✓ passed (47.4s)
md5: a4cf92a88fead703c49edc154d685afa
In the browser, open {{delivery_url}} and view the delivered report page, then assert the visible report title equals "Stablecoin Market Snapshot".

## Step 2 ✓ passed (47.5s)
md5: e34d54516db36697b90f6e9a342d1f61
On the delivered report page, inspect the stablecoin asset table, then assert it contains at least five asset rows.

## Step 3 ✓ passed (66s)
md5: c06b41d8d6fa0ff52614016a5e658469
On the delivered report page, inspect every row of the stablecoin asset table, then assert every asset row shows a price value and every asset row shows a 24h change value.

## Step 4 ✓ passed (36.3s)
md5: 918ea5bae26865665080961f08fa5634
On the delivered report page, inspect the report's generated-at information, then assert a generated-at timestamp is shown.
