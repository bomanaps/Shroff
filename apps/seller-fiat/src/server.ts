import { randomUUID } from "node:crypto";
import express from "express";
import Stripe from "stripe";
import type { VerdictRecord } from "@shroff/gateway";
import { connectReferee } from "@shroff/referee";
import { buildReport, renderReportPage } from "./report.js";
import { isFraudMode, renderFraudPage } from "./fraud.js";

const PORT = Number(process.env["PORT"] ?? 4023);
const KANE_TIMEOUT = Number(process.env["KANE_TIMEOUT"] ?? 300);
const BASE_URL = process.env["PUBLIC_BASE_URL"] ?? `http://localhost:${PORT}`;
const PRICE_CENTS = 50;
const MODE = process.env["FRAUD_MODE"];
const STRIPE_KEY = process.env["STRIPE_SECRET_KEY"];
const MAX_DELIVERIES = 200;

if (STRIPE_KEY === undefined) {
  console.error("STRIPE_SECRET_KEY is required");
  process.exit(1);
}
if (!STRIPE_KEY.startsWith("sk_test_")) {
  console.error("Refusing to run with a non-test Stripe key");
  process.exit(1);
}
if (MODE !== undefined && !isFraudMode(MODE)) {
  console.error(`FRAUD_MODE must be blank, bait, or locked (got ${JSON.stringify(MODE)})`);
  process.exit(1);
}

const REFEREE_URL = process.env["REFEREE_URL"] ?? "http://localhost:4040";
const referee = await connectReferee(REFEREE_URL);
console.log(`[seller-fiat] trusting referee ${referee.refereeId} at ${REFEREE_URL}`);

const stripe = new Stripe(STRIPE_KEY);
const app = express();
app.use(express.json());

const deliveries = new Map<string, string>();
const records: VerdictRecord[] = [];

function storeDelivery(token: string, page: string): void {
  deliveries.set(token, page);
  while (deliveries.size > MAX_DELIVERIES) {
    const oldest = deliveries.keys().next().value;
    if (oldest === undefined) break;
    deliveries.delete(oldest);
  }
}

app.get("/report/view/:token", (req, res) => {
  const page = deliveries.get(req.params["token"] ?? "");
  if (page === undefined) {
    res.status(404).send("Unknown delivery token");
    return;
  }
  res.type("html").send(page);
});

app.get("/verdicts", (_req, res) => {
  res.json(records.slice(-10));
});

app.post("/buy", (req, res) => {
  void (async () => {
    const paymentMethod =
      typeof (req.body as { payment_method?: unknown }).payment_method === "string"
        ? ((req.body as { payment_method: string }).payment_method)
        : "pm_card_visa";

    const intent = await stripe.paymentIntents.create({
      amount: PRICE_CENTS,
      currency: "usd",
      capture_method: "manual",
      confirm: true,
      payment_method: paymentMethod,
      automatic_payment_methods: { enabled: true, allow_redirects: "never" },
      description: "Stablecoin Market Snapshot report delivery",
    });
    if (intent.status !== "requires_capture") {
      res.status(402).json({ settled: false, reason: `authorization failed: ${intent.status}` });
      return;
    }

    const token = randomUUID();
    const page = MODE !== undefined && isFraudMode(MODE) ? renderFraudPage(MODE) : renderReportPage(buildReport());
    storeDelivery(token, page);
    const deliveryUrl = `${BASE_URL}/report/view/${token}`;

    const signed = await referee.verify(
      deliveryUrl,
      ".testmuai/tests/check-complete-stablecoin-market-snapshot-at-the-delivery_test.md",
      "stripe-fiat",
    );
    const verdict = {
      kind: signed.verdict.kind,
      settleable: signed.verdict.settleable,
      disputable: signed.verdict.disputable,
      summary: signed.verdict.summary,
      reason: undefined,
      sessionDir: signed.evidenceDir,
      creditsConsumed: undefined,
      runEnd: undefined,
    };
    const record: VerdictRecord = {
      label: `fiat-report-delivery${MODE !== undefined ? `[fraud=${MODE}]` : ""}`,
      verdict,
      settledAt: new Date().toISOString(),
    };
    records.push(record);
    console.log(
      `[shroff] signed verdict=${verdict.kind} settleable=${verdict.settleable} evidence=${verdict.sessionDir ?? "n/a"}`,
    );

    if (verdict.settleable) {
      const captured = await stripe.paymentIntents.capture(intent.id);
      await referee.reportOutcome(signed.signature, {
        rail: "stripe-fiat",
        status: "captured",
        transaction: captured.id,
      });
      res.json({
        settled: true,
        delivery_url: deliveryUrl,
        payment_intent: captured.id,
        amount_captured: captured.amount_received,
      });
      return;
    }
    const cancelled = await stripe.paymentIntents.cancel(intent.id, {
      cancellation_reason: "fraudulent",
    });
    await referee.reportOutcome(signed.signature, {
      rail: "stripe-fiat",
      status: "cancelled",
      transaction: cancelled.id,
      detail: verdict.summary,
    });
    res.status(402).json({
      settled: false,
      delivery_url: deliveryUrl,
      payment_intent: cancelled.id,
      cancellation_status: cancelled.status,
      verdict: { kind: verdict.kind, summary: verdict.summary, evidence: verdict.sessionDir },
    });
  })().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ settled: false, reason: message });
  });
});

app.listen(PORT, () => {
  console.log(`[seller-fiat] listening on :${PORT}, mode=${MODE ?? "honest"}, price=${PRICE_CENTS}c (Stripe test mode)`);
});
