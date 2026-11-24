# Delivery promise: Stablecoin Market Snapshot

This seller charges $0.10 (USDC, x402) for one market report delivery. After payment,
the buyer receives a delivery URL. Opening that URL in a browser must satisfy every
promise below, otherwise the delivery has failed and the payment must not settle.

## Promises

1. The page shows a report titled "Stablecoin Market Snapshot".
2. The page shows a table of stablecoin assets with at least 5 rows.
3. Every asset row shows a price and a 24h change value.
4. The page shows a generated-at timestamp.

## Verification input

The delivery URL to open is supplied as the variable {{delivery_url}}.
