import { randomUUID } from "node:crypto";
import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import {
  createDeliveryGate,
  deliveryContextMiddleware,
  getDeliveryUrl,
  setDeliveryUrl,
} from "@shroff/gateway";
import { buildReport, renderReportPage } from "./report.js";

const PORT = Number(process.env["PORT"] ?? 4021);
const NETWORK = "eip155:84532";
const FACILITATOR_URL = process.env["FACILITATOR_URL"] ?? "https://x402.org/facilitator";
const PAY_TO = process.env["SELLER_ADDRESS"];
const KANE_TIMEOUT = Number(process.env["KANE_TIMEOUT"] ?? 300);
const BASE_URL = process.env["PUBLIC_BASE_URL"] ?? `http://localhost:${PORT}`;
const MAX_DELIVERIES = 200;

if (PAY_TO === undefined) {
  console.error("SELLER_ADDRESS is required (0x address receiving testnet USDC)");
  process.exit(1);
}

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

app.get("/verdicts", (_req, res) => {
  res.json(gate.records.slice(-10));
});

app.get("/report/view/:token", (req, res) => {
  const page = deliveries.get(req.params["token"] ?? "");
  if (page === undefined) {
    res.status(404).send("Unknown delivery token");
    return;
  }
  res.type("html").send(page);
});

const gate = createDeliveryGate({
  checkFor: () => {
    const deliveryUrl = getDeliveryUrl();
    return {
      label: "market-report-delivery",
      run: {
        objective:
          `open ${deliveryUrl} and verify the page shows a report titled ` +
          `'Stablecoin Market Snapshot', a table with at least 5 asset rows each ` +
          `having a price and a 24h change, and a generated-at timestamp`,
        timeoutSeconds: KANE_TIMEOUT,
      },
    };
  },
  onVerdict: (record) => {
    console.log(
      `[shroff] verdict=${record.verdict.kind} settleable=${record.verdict.settleable} ` +
        `summary=${JSON.stringify(record.verdict.summary)} evidence=${record.verdict.sessionDir ?? "n/a"}`,
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
  const report = buildReport();
  const token = randomUUID();
  storeDelivery(token, renderReportPage(report));
  const deliveryUrl = `${BASE_URL}/report/view/${token}`;
  setDeliveryUrl(deliveryUrl);
  res.json({ delivery_url: deliveryUrl, title: report.title });
});

app.listen(PORT, () => {
  console.log(`[seller-honest] listening on :${PORT}, payTo=${PAY_TO}`);
});
