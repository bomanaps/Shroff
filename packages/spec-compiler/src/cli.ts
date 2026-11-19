import { resolve, dirname, basename } from "node:path";
import { compileSpec } from "./compile.js";

const specArg = process.argv[2];
if (specArg === undefined) {
  console.error("usage: spec-compiler <delivery-spec.md>");
  process.exit(1);
}

const specPath = resolve(specArg);
const result = await compileSpec(basename(specPath), dirname(specPath));
console.log(
  `[spec-compiler] compiled ${basename(specPath)} -> use-case ${result.useCaseId ?? "?"}, ` +
    `tests [${result.testIds.join(", ")}], approved [${result.approvedCriteria.join(", ")}], ` +
    `credits ${result.creditsConsumed}`,
);
console.log("[spec-compiler] generated tests are in .testmuai/tests/ next to the spec");
