import { resolve } from "node:path";
import { readLedger, verifyLedger } from "./ledger.js";

const path = resolve(process.argv[2] ?? ".shroff/verdicts.ndjson");
const entries = readLedger(path);
const result = verifyLedger(path);

console.log(`ledger: ${path}`);
console.log(`verdicts: ${entries.length}`);
if (result.ok) {
  console.log("chain: INTACT — no verdict has been edited, reordered, or removed");
  process.exit(0);
}
console.log(`chain: BROKEN at entry ${String(result.brokenAt)} — the ledger has been tampered with`);
process.exit(1);
