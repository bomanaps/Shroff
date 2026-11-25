import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendLedger } from "./ledger.js";
import { generateRefereeKeys, signVerdict } from "./signing.js";
import { scoreSellers, sellerOf } from "./score.js";
import type { DeliveryVerdict } from "@shroff/gateway";

function verdict(kind: DeliveryVerdict["kind"]): DeliveryVerdict {
  return {
    kind,
    settleable: kind === "delivered",
    disputable: kind === "not_delivered",
    summary: kind,
    reason: undefined,
    sessionDir: "/tmp/e",
    creditsConsumed: 1,
    runEnd: undefined,
  };
}

const keys = generateRefereeKeys();
const dir = mkdtempSync(join(tmpdir(), "shroff-score-"));
const ledger = join(dir, "verdicts.ndjson");

appendLedger(ledger, signVerdict(keys, verdict("delivered"), "http://honest:4021/view/a", "sha256:t"));
appendLedger(ledger, signVerdict(keys, verdict("delivered"), "http://honest:4021/view/b", "sha256:t"));
appendLedger(ledger, signVerdict(keys, verdict("not_delivered"), "http://evil:4022/view/c", "sha256:t"));
appendLedger(ledger, signVerdict(keys, verdict("infra_error"), "http://evil:4022/view/d", "sha256:t"));

test("sellers are scored per origin from the signed ledger", () => {
  const scores = scoreSellers(ledger);
  const honest = scores.get("http://honest:4021");
  const evil = scores.get("http://evil:4022");
  assert.equal(honest?.score, 1);
  assert.equal(honest?.band, "trusted");
  assert.equal(evil?.score, 0);
  assert.equal(evil?.band, "untrusted");
});

test("infra errors count as unverified, not against the seller", () => {
  const evil = scoreSellers(ledger).get("http://evil:4022");
  assert.equal(evil?.unverified, 1);
  assert.equal(evil?.notDelivered, 1);
});

test("unknown sellers have no score", () => {
  assert.equal(scoreSellers(ledger).get("http://nobody:1"), undefined);
  assert.equal(sellerOf("not a url"), "invalid");
});
