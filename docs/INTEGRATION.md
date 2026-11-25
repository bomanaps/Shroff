# Integrating Shroff

How to put a delivery referee between your x402 (or Stripe) payments and your settlements.

## 1. Run a referee

The referee is a standalone service that owns an Ed25519 identity, runs Kane, signs verdicts, and keeps the ledger.

```bash
TEST_ROOT=path/to/your/seller \
PORT=4040 \
LEDGER_PATH=.shroff/verdicts.ndjson \
npx tsx packages/referee/src/cli.ts
```

- `TEST_ROOT` is the directory that contains your compiled Kane acceptance tests (`.testmuai/tests/*_test.md`) and their variables file.
- On first start it writes its private key to `.shroff/referee-key.pem` (0600). Keep that file stable; sellers pin the public key at connect time and refuse any verdict that does not verify against it.
- The machine needs `kane-cli` installed and logged in (`kane-cli login`, or `kane-cli login --username $LT_USERNAME --access-key $LT_ACCESS_KEY` in CI).

Endpoints: `GET /identity`, `POST /verify`, `GET /sellers`, `GET /sellers/score?seller=<origin>`, `GET /feed`, `GET /events` (SSE), `GET /evidence/:session`, `POST /outcome`, `GET /promise`.

## 2. Compile your delivery promise into a Kane test

Write what the buyer must see, in plain English, in `delivery-spec.md`. Then:

```bash
npx tsx packages/spec-compiler/src/cli.ts path/to/delivery-spec.md
```

This drives Kane's own assurance pipeline (`context ingest` → `design tests` → `context review --approve`) and leaves a criterion-linked `_test.md` under `.testmuai/tests/`. Commit it. Its SHA-256 is bound into every verdict signature, so changing the test invalidates old verdicts.

Reference the delivery URL in the spec as `{{delivery_url}}`; the referee injects it per purchase.

## 3. Gate your x402 seller

```ts
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import {
  deliveryContextMiddleware, setDeliveryUrl, getDeliveryUrl,
} from "@shroff/gateway";
import { connectReferee, createRefereeGate } from "@shroff/referee";

const referee = await connectReferee(process.env.REFEREE_URL);

const gate = createRefereeGate(referee, {
  testFile: ".testmuai/tests/your-acceptance_test.md",
  getDeliveryUrl,                 // per-request, race-free (AsyncLocalStorage)
  rail: "x402-usdc",
  policy: { mode: "always" },     // or { mode: "first", n: 10 } or { mode: "sample", rate: 0.2 }
});

const server = new x402ResourceServer(new HTTPFacilitatorClient({ url: FACILITATOR_URL }))
  .register("eip155:84532", new ExactEvmScheme())
  .onBeforeSettle(gate.hook)      // settlement is impossible without a signed "delivered"
  .onAfterSettle(async (ctx) => { // report the tx back for the public feed
    const signed = gate.records.at(-1);
    if (signed) await referee.reportOutcome(signed.signature, {
      rail: "x402-usdc", status: "settled",
      transaction: (ctx.result as { transaction?: string }).transaction,
    });
  })
  .onSettleFailure(async (ctx) => {
    const signed = gate.records.at(-1);
    if (signed) await referee.reportOutcome(signed.signature, {
      rail: "x402-usdc", status: "settle_failed", detail: ctx.error.message,
    });
  });

app.use(deliveryContextMiddleware);          // BEFORE the payment middleware
app.use(paymentMiddleware(routes, server));

app.get("/your-resource", (req, res) => {
  const url = mintDeliveryUrl();             // whatever the buyer will open
  setDeliveryUrl(url);                       // what Kane will be sent to verify
  res.json({ delivery_url: url });
});
```

Semantics of the hook's abort reasons:

- `delivery_failed` — Kane positively saw a broken promise. Disputable; counts against the seller's score.
- `delivery_unverified` — infra error, timeout, missing verdict, or bad signature. Fails closed; blames no one.

## 4. Gate a fiat (Stripe) seller

Authorize with `capture_method: "manual"`, then let the verdict decide:

```ts
const intent = await stripe.paymentIntents.create({
  amount, currency: "usd", capture_method: "manual",
  confirm: true, payment_method,
});
const signed = await referee.verify(deliveryUrl, TEST_FILE, "stripe-fiat");
if (signed.verdict.settleable) {
  await stripe.paymentIntents.capture(intent.id);
  await referee.reportOutcome(signed.signature, { rail: "stripe-fiat", status: "captured", transaction: intent.id });
} else {
  await stripe.paymentIntents.cancel(intent.id, { cancellation_reason: "fraudulent" });
  await referee.reportOutcome(signed.signature, { rail: "stripe-fiat", status: "cancelled", detail: signed.verdict.summary });
}
```

## 5. Check sellers before you pay (buyer side)

```ts
const r = await fetch(`${REFEREE_URL}/sellers/score?seller=${encodeURIComponent(origin)}`);
const { score, band, verdicts } = await r.json();
if (score !== null && score < 0.5) throw new Error(`seller is ${band}, refusing to pay`);
```

Every point in the score is a signed verdict with a sealed evidence pack behind it, not a self-reported rating.

## 6. Verify the ledger yourself

```bash
npx shroff-verify-ledger .shroff/verdicts.ndjson
```

Each entry carries `prev = sha256(previous entry)`. Any edit, reorder, or deletion breaks the chain and the command exits non-zero. Individual verdicts verify against the referee's public key (`GET /identity`).

## Trust model, stated plainly

The referee is the trusted party; the seller is not. A seller cannot skip verification (settlement requires a verdict signed by the pinned referee key), cannot soften the test (its hash is in the signature), and cannot rewrite history (hash chain). What this does **not** yet cover: a malicious referee, or collusion between referee and seller. The production path is referees run by facilitators or neutral third parties, with buyers pinning referee keys the way browsers pin CAs.
