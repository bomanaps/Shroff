---
assurance:
  id: t-1
  base: sha256:41a016bda38ef7cb0dbeae8fbb411e00aa9fbb0b4f66bbaca5dcb573d1d44327
---
# Delivered Stablecoin Market Snapshot page meets every report promise

> Open the specified delivery URL in a browser and confirm the exact report title, at least five stablecoin asset rows, a price and 24h change in each row, and a generated-at timestamp.

## Step 1 @verifies ac-4

Open {{delivery_url}} in the browser and view its delivered market report page, then assert the displayed report title equals “Stablecoin Market Snapshot”.

## Step 2 @verifies ac-5

On the delivered report page, inspect the stablecoin asset table and count its asset rows, then assert there are at least 5 asset rows.

## Step 3 @verifies ac-6

On the delivered report page, examine every asset row of the stablecoin table, then assert each row shows a price value.

## Step 4 @verifies ac-7

On the delivered report page, examine every asset row of the stablecoin table, then assert each row shows a 24h change value.

## Step 5 @verifies ac-8

On the delivered report page, inspect its report metadata, then assert a generated-at timestamp is shown.
