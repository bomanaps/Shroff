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
  res.json(
    gate.records.slice(-10).map((signed) => ({
      label: "market-report-delivery",
      settledAt: signed.issuedAt,
      signature: signed.signature,
      refereeId: signed.refereeId,
      testHash: signed.testHash,
      verdict: {
        kind: signed.verdict.kind,
        settleable: signed.verdict.settleable,
        disputable: signed.verdict.disputable,
        summary: signed.verdict.summary,
        sessionDir: signed.evidenceDir,
      },
    })),
  );
});

app.get("/report/view/:token", (req, res) => {
  const page = deliveries.get(req.params["token"] ?? "");
  if (page === undefined) {
    res.status(404).send("Unknown delivery token");
    return;
  }
  res.type("html").send(page);
});

const ACCEPTANCE_TEST =
  ".testmuai/tests/check-complete-stablecoin-market-snapshot-at-the-delivery_test.md";
const REFEREE_URL = process.env["REFEREE_URL"] ?? "http://localhost:4040";

const referee = await connectReferee(REFEREE_URL);
console.log(`[seller-honest] trusting referee ${referee.refereeId} at ${REFEREE_URL}`);

const gate = createRefereeGate(referee, {
  testFile: ACCEPTANCE_TEST,
  getDeliveryUrl,
  rail: "x402-usdc",
  onVerdict: (signed) => {
    console.log(
      `[shroff] signed verdict=${signed.verdict.kind} settleable=${signed.verdict.settleable} ` +
        `referee=${signed.refereeId} test=${signed.testHash.slice(0, 18)}… evidence=${signed.evidenceDir ?? "n/a"}`,
    );
  },
});

const facilitator = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
const resourceServer = new x402ResourceServer(facilitator)
  .register(NETWORK, new ExactEvmScheme())
  .onBeforeSettle(gate.hook)
  .onAfterSettle(async (context) => {
    const signed = gate.records.at(-1);
    if (signed !== undefined) {
      const result = context.result as { transaction?: string };
      await referee.reportOutcome(signed.signature, {
        rail: "x402-usdc",
        status: "settled",
        ...(result.transaction !== undefined ? { transaction: result.transaction } : {}),
      });
    }
  })
  .onSettleFailure(async (context) => {
    const signed = gate.records.at(-1);
    if (signed !== undefined) {
      await referee.reportOutcome(signed.signature, {
        rail: "x402-usdc",
        status: "settle_failed",
        detail: context.error.message.slice(0, 200),
      });
    }
  });

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
