import { resolve } from "node:path";
import { startReferee } from "./server.js";

startReferee({
  port: Number(process.env["PORT"] ?? 4040),
  testRoot: resolve(process.env["TEST_ROOT"] ?? "."),
  ...(process.env["REFEREE_PRIVATE_KEY"] !== undefined
    ? { privateKeyPem: process.env["REFEREE_PRIVATE_KEY"].replace(/\\n/g, "\n") }
    : {}),
  ledgerPath: resolve(process.env["LEDGER_PATH"] ?? ".shroff/verdicts.ndjson"),
  kaneTimeoutSeconds: Number(process.env["KANE_TIMEOUT"] ?? 300),
  ...(process.env["DEMO_ROOT"] !== undefined ? { demoRoot: resolve(process.env["DEMO_ROOT"]) } : {}),
});
