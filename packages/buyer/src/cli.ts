import { createBuyerClient } from "./client.js";

const SELLER_URL = process.env["SELLER_URL"] ?? "http://localhost:4021/report";
const PRIVATE_KEY = process.env["BUYER_PRIVATE_KEY"] as `0x${string}` | undefined;

if (PRIVATE_KEY === undefined) {
  console.error("BUYER_PRIVATE_KEY is required");
  process.exit(1);
}

const buyer = createBuyerClient(PRIVATE_KEY);
console.log(`[buyer] ${buyer.address} purchasing ${SELLER_URL}`);

const { response, settlement } = await buyer.paidFetch(SELLER_URL);
const body: unknown = await response.json().catch(() => undefined);

console.log(`[buyer] HTTP ${response.status}`);
console.log(`[buyer] body: ${JSON.stringify(body)}`);
if (settlement === undefined) {
  console.log("[buyer] no PAYMENT-RESPONSE header: settlement was withheld");
  process.exit(2);
}
console.log(`[buyer] settlement: ${JSON.stringify(settlement)}`);
if (settlement.success !== true) {
  console.log("[buyer] delivery verification failed: payment was NOT settled, funds never left the wallet");
  process.exit(3);
}
