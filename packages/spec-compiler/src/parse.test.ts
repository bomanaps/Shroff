import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import {
  assertCompleted,
  extractDesignOutputs,
  extractMintedUseCase,
  maxCredits,
  parseAssuranceStream,
} from "./parse.js";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "..", "test-fixtures");
const ingest = parseAssuranceStream(readFileSync(join(fixtures, "ingest.ndjson"), "utf8"));
const design = parseAssuranceStream(readFileSync(join(fixtures, "design.ndjson"), "utf8"));

test("parses a real captured ingest stream and finds the use-case", () => {
  assertCompleted(ingest, "ingest");
  assert.equal(extractMintedUseCase(ingest), "uc-1");
});

test("parses a real captured design stream into tests and criteria", () => {
  assertCompleted(design, "design");
  const { testIds, criteria } = extractDesignOutputs(design);
  assert.deepEqual(testIds, ["t-1"]);
  assert.deepEqual(criteria, ["ac-5", "ac-6", "ac-7", "ac-8", "ac-9"]);
});

test("credits come from the highest running total", () => {
  assert.ok(maxCredits(ingest) > 0);
});

test("a stream without done fails loudly", () => {
  assert.throws(() => assertCompleted(parseAssuranceStream('{"type":"commit"}'), "x"), /without a done/);
});

test("a failed done fails loudly", () => {
  const events = parseAssuranceStream('{"type":"done","status":"error","exit_code":3}');
  assert.throws(() => assertCompleted(events, "x"), /exit 3/);
});

test("ingest without a use-case fails loudly", () => {
  assert.throws(() => extractMintedUseCase(parseAssuranceStream('{"type":"done","status":"complete","exit_code":0}')), /no use-case/);
});

test("design without tests fails loudly", () => {
  assert.throws(() => extractDesignOutputs(parseAssuranceStream('{"type":"commit","minted":[]}')), /no tests/);
});
