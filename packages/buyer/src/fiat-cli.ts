const SELLER_URL = process.env["SELLER_URL"] ?? "http://localhost:4023/buy";
const PAYMENT_METHOD = process.env["PAYMENT_METHOD"] ?? "pm_card_visa";

console.log(`[buyer] purchasing ${SELLER_URL} with test card ${PAYMENT_METHOD}`);
const response = await fetch(SELLER_URL, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ payment_method: PAYMENT_METHOD }),
});
const body: unknown = await response.json();
console.log(`[buyer] HTTP ${response.status}`);
console.log(`[buyer] ${JSON.stringify(body, null, 2)}`);

const settled = (body as { settled?: boolean }).settled === true;
if (!settled) {
  console.log("[buyer] delivery verification failed: the card hold was cancelled, customer never charged");
  process.exit(3);
}
