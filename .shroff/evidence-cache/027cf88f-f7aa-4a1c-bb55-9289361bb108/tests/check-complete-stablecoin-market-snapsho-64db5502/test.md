---
assurance:
  id: t-1
  base: sha256:4c3359ffae43ed6d40d7d97468838b242299c81bdb0fbecf495bb10e3cbba710
---
# Check complete Stablecoin Market Snapshot at the delivery URL

> Opening the supplied delivery URL in a browser shows the Stablecoin Market Snapshot title, at least five stablecoin asset rows, a price and a 24h change value on every asset row, and a generated-at timestamp.

## Step 1 @verifies ac-5

In the browser, open {{delivery_url}} and view the delivered report page, then assert the visible report title equals "Stablecoin Market Snapshot".

## Step 2 @verifies ac-6

On the delivered report page, inspect the stablecoin asset table, then assert it contains at least five asset rows.

## Step 3 @verifies ac-7, ac-8

On the delivered report page, inspect every row of the stablecoin asset table, then assert every asset row shows a price value and every asset row shows a 24h change value.

## Step 4 @verifies ac-9

On the delivered report page, inspect the report's generated-at information, then assert a generated-at timestamp is shown.
