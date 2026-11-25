import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  generateRefereeKeys,
  signVerdict,
  verifySignedVerdict,
  hashTestFile,
} from "./signing.js";
import { appendLedger, verifyLedger, readLedger } from "./ledger.js";
import type { DeliveryVerdict } from "@shroff/gateway";

const verdict: DeliveryVerdict = {
  kind: "delivered",
  settleable: true,
  disputable: false,
  summary: "all promises kept",
  reason: undefined,
  sessionDir: "/tmp/session",
  creditsConsumed: 3,
  runEnd: undefined,
};

const keys = generateRefereeKeys();
const signed = signVerdict(keys, verdict, "http://seller/view/abc", "sha256:aaaa");

test("a signed verdict verifies against the referee's public key", () => {
  assert.equal(verifySignedVerdict(signed, keys.publicKeyPem), true);
});

test("tampering with the verdict breaks the signature", () => {
  const tampered = { ...signed, verdict: { ...signed.verdict, settleable: false } };
  assert.equal(verifySignedVerdict(tampered, keys.publicKeyPem), false);
});

test("softening the acceptance test breaks the signature", () => {
  const tampered = { ...signed, testHash: "sha256:bbbb" };
  assert.equal(verifySignedVerdict(tampered, keys.publicKeyPem), false);
});

test("a different referee's key does not verify", () => {
  const other = generateRefereeKeys();
  assert.equal(verifySignedVerdict(signed, other.publicKeyPem), false);
});

test("test file hashing is content-addressed", () => {
  const dir = mkdtempSync(join(tmpdir(), "shroff-"));
  const file = join(dir, "t_test.md");
  writeFileSync(file, "## Step 1\nassert the truth\n");
  const h1 = hashTestFile(file);
  writeFileSync(file, "## Step 1\nassert nothing\n");
  assert.notEqual(hashTestFile(file), h1);
});

test("ledger chains verdicts and detects edits", () => {
  const dir = mkdtempSync(join(tmpdir(), "shroff-ledger-"));
  const path = join(dir, "verdicts.ndjson");
  appendLedger(path, signed);
  appendLedger(path, signVerdict(keys, verdict, "http://seller/view/def", "sha256:cccc"));
  assert.equal(verifyLedger(path).ok, true);
  assert.equal(readLedger(path).length, 2);

  const lines = readFileSync(path, "utf8").trimEnd().split("\n");
  const first = JSON.parse(lines[0] as string) as { entry: { deliveryUrl: string } };
  first.entry.deliveryUrl = "http://evil/view/zzz";
  writeFileSync(path, [JSON.stringify(first), lines[1]].join("\n") + "\n");
  assert.equal(verifyLedger(path).ok, false);
});
