import { test } from "node:test";
import assert from "node:assert/strict";
import { triage } from "./verdict.js";
import type { RunEndEvent } from "./events.js";

function runEnd(partial: Partial<RunEndEvent>): RunEndEvent {
  return {
    v: 1,
    ts: "2026-11-19T12:00:00Z",
    type: "run_end",
    status: "passed",
    summary: "summary",
    ...partial,
  };
}

test("exit 0 with passed run_end is delivered and settleable", () => {
  const verdict = triage({
    exitCode: 0,
    events: [],
    runEnd: runEnd({ status: "passed" }),
    stderr: "",
  });
  assert.equal(verdict.kind, "delivered");
  assert.equal(verdict.settleable, true);
  assert.equal(verdict.disputable, false);
});

test("exit 1 with failed run_end is not delivered and disputable", () => {
  const verdict = triage({
    exitCode: 1,
    events: [],
    runEnd: runEnd({ status: "failed", summary: "paywall never unlocked" }),
    stderr: "",
  });
  assert.equal(verdict.kind, "not_delivered");
  assert.equal(verdict.settleable, false);
  assert.equal(verdict.disputable, true);
});

test("infra_error reason is never disputable even on exit 1", () => {
  const verdict = triage({
    exitCode: 1,
    events: [],
    runEnd: runEnd({ status: "failed", reason: "infra_error.screenshot_failed" }),
    stderr: "",
  });
  assert.equal(verdict.kind, "infra_error");
  assert.equal(verdict.settleable, false);
  assert.equal(verdict.disputable, false);
});

test("exit 2 is an infra error regardless of output", () => {
  const verdict = triage({ exitCode: 2, events: [], runEnd: undefined, stderr: "auth" });
  assert.equal(verdict.kind, "infra_error");
  assert.equal(verdict.settleable, false);
});

test("exit 3 is a timeout", () => {
  const verdict = triage({ exitCode: 3, events: [], runEnd: undefined, stderr: "" });
  assert.equal(verdict.kind, "timed_out");
  assert.equal(verdict.settleable, false);
});

test("missing run_end on exit 0 is incomplete, not delivered", () => {
  const verdict = triage({ exitCode: 0, events: [], runEnd: undefined, stderr: "" });
  assert.equal(verdict.kind, "incomplete");
  assert.equal(verdict.settleable, false);
  assert.equal(verdict.disputable, false);
});

test("exit 0 with a failed run_end does not settle", () => {
  const verdict = triage({
    exitCode: 0,
    events: [],
    runEnd: runEnd({ status: "failed" }),
    stderr: "",
  });
  assert.equal(verdict.kind, "not_delivered");
  assert.equal(verdict.settleable, false);
});
