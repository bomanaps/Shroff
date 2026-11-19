import { resolve } from "node:path";
import { runLoop } from "./loop.js";

const PRIVATE_KEY = process.env["BUYER_PRIVATE_KEY"] as `0x${string}` | undefined;
if (PRIVATE_KEY === undefined) {
  console.error("BUYER_PRIVATE_KEY is required");
  process.exit(1);
}

const sellerBase = process.env["SELLER_BASE"] ?? "http://localhost:4021";
const agentBin = process.env["AGENT_BIN"] ?? "claude";
const agentArgs =
  process.env["AGENT_ARGS"] !== undefined
    ? (JSON.parse(process.env["AGENT_ARGS"]) as string[])
    : ["-p", "--allowedTools", "Read Edit Glob Grep"];
const projectDir = resolve(process.env["PROJECT_DIR"] ?? "apps/seller-honest");

const outcome = await runLoop({
  sellerUrl: `${sellerBase}/report`,
  verdictsUrl: `${sellerBase}/verdicts`,
  buyerPrivateKey: PRIVATE_KEY,
  projectDir,
  agent: {
    bin: agentBin,
    args: agentArgs,
    cwd: projectDir,
    timeoutSeconds: Number(process.env["AGENT_TIMEOUT"] ?? 600),
  },
  maxAttempts: Number(process.env["MAX_ATTEMPTS"] ?? 3),
  settleDelayMs: 3000,
});

console.log(`[loop] outcome: ${JSON.stringify(outcome)}`);
process.exit(outcome.kind === "settled" ? 0 : 1);
