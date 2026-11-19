import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { runKane } from "./kane.js";
import { triage } from "./verdict.js";
import { createDeliveryGate } from "./gate.js";
import type { SettleContext } from "@x402/core/server";

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), "..", "test-fixtures", "fake-kane.mjs");

function fakeKaneRun(mode: string, timeoutSeconds = 300) {
  process.env["FAKE_KANE_MODE"] = mode;
  return { kaneBin: FIXTURE, objective: "verify the fixture page", timeoutSeconds } as const;
}

const settleContext = {} as SettleContext;

test("gate settles only when the fake kane passes", async () => {
  const gate = createDeliveryGate({ checkFor: () => ({ run: { ...fakeKaneRun("pass") } }) });
  assert.equal(await gate.hook(settleContext), undefined);
  assert.equal(gate.records[0]?.verdict.kind, "delivered");
});

test("gate aborts with delivery_failed on a product failure", async () => {
  const gate = createDeliveryGate({ checkFor: () => ({ run: { ...fakeKaneRun("fail") } }) });
  const outcome = await gate.hook(settleContext);
  assert.deepEqual(outcome, { abort: true, reason: "delivery_failed", message: "fixture fail" });
});

test("gate aborts with delivery_unverified when the kane binary is missing", async () => {
  const gate = createDeliveryGate({
    checkFor: () => ({ run: { objective: "x", kaneBin: "/nonexistent/kane-cli-missing" } }),
  });
  const outcome = await gate.hook(settleContext);
  assert.ok(outcome !== undefined && "abort" in outcome && outcome.abort);
  assert.equal(outcome.reason, "delivery_unverified");
  assert.equal(gate.records[0]?.verdict.kind, "infra_error");
});

test("gate aborts with delivery_unverified when checkFor throws", async () => {
  const gate = createDeliveryGate({
    checkFor: () => {
      throw new Error("no delivery recorded");
    },
  });
  const outcome = await gate.hook(settleContext);
  assert.ok(outcome !== undefined && "abort" in outcome && outcome.abort);
  assert.equal(outcome.reason, "delivery_unverified");
});

test("a throwing onVerdict does not break a settleable outcome", async () => {
  const gate = createDeliveryGate({
    checkFor: () => ({ run: { ...fakeKaneRun("pass") } }),
    onVerdict: () => {
      throw new Error("audit sink down");
    },
  });
  assert.equal(await gate.hook(settleContext), undefined);
});

test("signal-killed kane is infra_error, never a dispute", async () => {
  const result = await runKane(fakeKaneRun("self-kill"));
  assert.equal(result.exitCode, null);
  const verdict = triage(result);
  assert.equal(verdict.kind, "infra_error");
  assert.equal(verdict.disputable, false);
  assert.equal(verdict.settleable, false);
});

test("run_end without trailing newline is still captured", async () => {
  const result = await runKane(fakeKaneRun("pass-no-newline"));
  assert.equal(result.runEnd?.status, "passed");
  assert.equal(triage(result).kind, "delivered");
});

test("watchdog kills a hung kane and the verdict is unverified", async () => {
  const result = await runKane({ ...fakeKaneRun("hang", 0.1), watchdogGraceSeconds: 0.2 });
  assert.equal(result.exitCode, null);
  const verdict = triage(result);
  assert.equal(verdict.settleable, false);
  assert.equal(verdict.disputable, false);
});

test("records are capped at maxRecords", async () => {
  const gate = createDeliveryGate({
    checkFor: () => ({ run: { ...fakeKaneRun("pass") } }),
    maxRecords: 2,
  });
  await gate.hook(settleContext);
  await gate.hook(settleContext);
  await gate.hook(settleContext);
  assert.equal(gate.records.length, 2);
});
