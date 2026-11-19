import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { runLoop, type LoopConfig } from "./loop.js";
import { buildRepairPrompt } from "./prompt.js";
import type { VerdictRecord } from "@shroff/gateway";

function record(kind: string, summary = "rows missing"): VerdictRecord {
  return {
    label: "test",
    settledAt: "2026-11-19T12:00:00Z",
    verdict: {
      kind,
      settleable: kind === "delivered",
      disputable: kind === "not_delivered",
      summary,
      reason: undefined,
      sessionDir: "/tmp/session",
      creditsConsumed: 1,
      runEnd: undefined,
    },
  } as VerdictRecord;
}

let verdicts: VerdictRecord[] = [];
const server = createServer((_req, res) => {
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(verdicts));
});
server.listen(0);
await once(server, "listening");
const address = server.address();
const port = typeof address === "object" && address !== null ? address.port : 0;
after(() => server.close());

const agent = { bin: "true", args: [], cwd: "/tmp", timeoutSeconds: 5 };

function config(overrides: Partial<LoopConfig>): LoopConfig {
  return {
    sellerUrl: "http://seller.test/report",
    verdictsUrl: `http://localhost:${port}/verdicts`,
    purchase: async () => ({ settled: false }),
    projectDir: "/tmp/project",
    agent,
    maxAttempts: 3,
    ...overrides,
  };
}

test("settles on first success without repairing", async () => {
  let repairs = 0;
  const outcome = await runLoop(
    config({
      purchase: async () => ({ settled: true, transaction: "0xabc" }),
      repair: async () => repairs++,
    }),
    () => {},
  );
  assert.deepEqual(outcome, { kind: "settled", transaction: "0xabc", attempt: 1 });
  assert.equal(repairs, 0);
});

test("repairs on product failure then settles", async () => {
  verdicts = [record("not_delivered")];
  let purchases = 0;
  let repairPrompt = "";
  const outcome = await runLoop(
    config({
      purchase: async () => ({ settled: ++purchases >= 2, transaction: "0xfix" }),
      repair: async (prompt) => {
        repairPrompt = prompt;
        return 0;
      },
    }),
    () => {},
  );
  assert.equal(outcome.kind, "settled");
  assert.equal(outcome.attempt, 2);
  assert.match(repairPrompt, /rows missing/);
  assert.match(repairPrompt, /\/tmp\/project/);
});

test("never repairs on an unverified (infra) failure", async () => {
  verdicts = [record("infra_error")];
  let repairs = 0;
  const outcome = await runLoop(
    config({ repair: async () => repairs++ }),
    () => {},
  );
  assert.equal(outcome.kind, "unverified");
  assert.equal(repairs, 0);
});

test("escalates after maxAttempts product failures", async () => {
  verdicts = [record("not_delivered")];
  let repairs = 0;
  const outcome = await runLoop(
    config({ maxAttempts: 3, repair: async () => repairs++ }),
    () => {},
  );
  assert.equal(outcome.kind, "escalated");
  assert.equal(outcome.attempt, 3);
  assert.equal(repairs, 2);
});

test("repair prompt forbids touching the gate and tests", () => {
  const prompt = buildRepairPrompt(record("not_delivered"), "/srv/app");
  assert.match(prompt, /do not change the verification objective, the gate, or any test/);
  assert.match(prompt, /\/tmp\/session\/evidence/);
});
