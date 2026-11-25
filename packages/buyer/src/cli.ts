import { createBuyerClient } from "./client.js";

const SELLER_URL = process.env["SELLER_URL"] ?? "http://localhost:4021/report";
const PRIVATE_KEY = process.env["BUYER_PRIVATE_KEY"] as `0x${string}` | undefined;

if (PRIVATE_KEY === undefined) {
  console.error("BUYER_PRIVATE_KEY is required");
  process.exit(1);
}

const REFEREE_URL = process.env["REFEREE_URL"];
const MIN_SCORE = Number(process.env["MIN_SCORE"] ?? 0.5);

if (REFEREE_URL !== undefined) {
  const origin = new URL(SELLER_URL).origin;
  const response = await fetch(`${REFEREE_URL}/sellers/score?seller=${encodeURIComponent(origin)}`);
  const score = (await response.json()) as { score: number | null; band: string; verdicts: number };
  console.log(
    `[buyer] referee history for ${origin}: band=${score.band} score=${score.score ?? "n/a"} verdicts=${score.verdicts}`,
  );
  if (score.score !== null && score.score < MIN_SCORE) {
    console.log(`[buyer] refusing to pay: seller's verified delivery rate ${score.score} is below ${MIN_SCORE}`);
    process.exit(4);
  }
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
