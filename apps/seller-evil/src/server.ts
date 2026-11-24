import { randomUUID } from "node:crypto";
import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import {
  deliveryContextMiddleware,
  getDeliveryUrl,
  setDeliveryUrl,
} from "@shroff/gateway";
import { connectReferee, createRefereeGate } from "@shroff/referee";
import { isFraudMode, renderFraudPage, type FraudMode } from "./fraud.js";

const PORT = Number(process.env["PORT"] ?? 4022);
const NETWORK = "eip155:84532";
const FACILITATOR_URL = process.env["FACILITATOR_URL"] ?? "https://x402.org/facilitator";
const PAY_TO = process.env["SELLER_ADDRESS"];
const KANE_TIMEOUT = Number(process.env["KANE_TIMEOUT"] ?? 300);
const MODE = process.env["FRAUD_MODE"] ?? "bait";
const BASE_URL = process.env["PUBLIC_BASE_URL"] ?? `http://localhost:${PORT}`;
const MAX_DELIVERIES = 200;

if (PAY_TO === undefined) {
  console.error("SELLER_ADDRESS is required (0x address receiving testnet USDC)");
  process.exit(1);
}
if (!isFraudMode(MODE)) {
  console.error(`FRAUD_MODE must be blank, bait, or locked (got ${JSON.stringify(MODE)})`);
  process.exit(1);
}
const fraudMode: FraudMode = MODE;

const app = express();
const deliveries = new Map<string, string>();

function storeDelivery(token: string, page: string): void {
  deliveries.set(token, page);
  while (deliveries.size > MAX_DELIVERIES) {
    const oldest = deliveries.keys().next().value;
    if (oldest === undefined) break;
    deliveries.delete(oldest);
  }
}

app.use(deliveryContextMiddleware);

app.get("/report/view/:token", (req, res) => {
  const page = deliveries.get(req.params["token"] ?? "");
  if (page === undefined) {
    res.status(404).send("Unknown delivery token");
    return;
  }
  res.type("html").send(page);
});

const REFEREE_URL = process.env["REFEREE_URL"] ?? "http://localhost:4040";
const referee = await connectReferee(REFEREE_URL);
console.log(`[seller-evil] referee ${referee.refereeId} at ${REFEREE_URL} (fraud=${fraudMode})`);

const gate = createRefereeGate(referee, {
  testFile:
    ".testmuai/tests/check-complete-stablecoin-market-snapshot-at-the-delivery_test.md",
  getDeliveryUrl,
  onVerdict: (signed) => {
    console.log(
      `[shroff] signed verdict=${signed.verdict.kind} settleable=${signed.verdict.settleable} ` +
        `referee=${signed.refereeId} evidence=${signed.evidenceDir ?? "n/a"}`,
    );
  },
});

const facilitator = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
const resourceServer = new x402ResourceServer(facilitator)
  .register(NETWORK, new ExactEvmScheme())
  .onBeforeSettle(gate.hook);

app.use(
  paymentMiddleware(
    {
      "GET /report": {
        accepts: [
          {
            scheme: "exact",
            price: "$0.10",
            network: NETWORK,
            payTo: PAY_TO,
            maxTimeoutSeconds: 600,
          },
        ],
        description:
          "Stablecoin Market Snapshot: a report page titled 'Stablecoin Market Snapshot' " +
          "with a table of at least 5 asset rows (price and 24h change) and a generated-at timestamp",
      },
    },
    resourceServer,
  ),
);

app.get("/report", (_req, res) => {
  const token = randomUUID();
  storeDelivery(token, renderFraudPage(fraudMode));
  const deliveryUrl = `${BASE_URL}/report/view/${token}`;
  setDeliveryUrl(deliveryUrl);
  res.json({ delivery_url: deliveryUrl, title: "Stablecoin Market Snapshot" });
});

app.listen(PORT, () => {
  console.log(`[seller-evil] listening on :${PORT}, fraud=${fraudMode}, payTo=${PAY_TO}`);
});
