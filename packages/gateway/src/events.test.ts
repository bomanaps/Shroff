import { test } from "node:test";
import assert from "node:assert/strict";
import { parseKaneLine, selectRunEnd, type KaneEvent } from "./events.js";

const runEndLine = JSON.stringify({
  v: 1,
  ts: "2026-11-19T12:00:00Z",
  type: "run_end",
  status: "passed",
  summary: "All steps completed",
  credits_consumed: 12.5,
  session_dir: "/tmp/session",
});

test("parses a run_end line", () => {
  const event = parseKaneLine(runEndLine);
  assert.ok(event !== undefined);
  assert.equal("type" in event && event.type, "run_end");
});

test("skips non-JSON lines", () => {
  assert.equal(parseKaneLine("npm WARN something"), undefined);
  assert.equal(parseKaneLine(""), undefined);
});

test("skips JSON lines without the versioned envelope", () => {
  assert.equal(parseKaneLine('{"foo": 1}'), undefined);
  assert.equal(parseKaneLine("[1,2,3]"), undefined);
});

test("parses untyped step lines", () => {
  const event = parseKaneLine(
    '{"v":1,"ts":"2026-11-19T12:00:00Z","step":2,"status":"done","remark":"clicked buy"}',
  );
  assert.ok(event !== undefined);
  assert.equal("step" in event && event.step, 2);
});

test("selects run_end by type, not position", () => {
  const events = [
    parseKaneLine(runEndLine),
    parseKaneLine('{"v":1,"ts":"2026-11-19T12:00:01Z","type":"warning","code":"late"}'),
  ].filter((e): e is KaneEvent => e !== undefined);
  const runEnd = selectRunEnd(events);
  assert.ok(runEnd !== undefined);
  assert.equal(runEnd.status, "passed");
});

test("returns undefined when no run_end exists", () => {
  const events = [
    parseKaneLine('{"v":1,"ts":"2026-11-19T12:00:00Z","step":1,"status":"running","remark":"open"}'),
  ].filter((e): e is KaneEvent => e !== undefined);
  assert.equal(selectRunEnd(events), undefined);
});
