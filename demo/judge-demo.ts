import { spawn, type ChildProcess } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const REFEREE_PORT = 4040;
const HONEST_PORT = 4021;
const EVIL_PORT = 4022;
const FIAT_PORT = 4023;

const children: ChildProcess[] = [];

function banner(title: string): void {
  console.log(`\n${"=".repeat(64)}\n  ${title}\n${"=".repeat(64)}`);
}

function startService(name: string, script: string, env: Record<string, string>): ChildProcess {
  const child = spawn("npx", ["tsx", script], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", (chunk: Buffer) => {
    for (const line of chunk.toString().split("\n")) {
      if (line.trim() !== "") console.log(`  [${name}] ${line}`);
    }
  });
  children.push(child);
  return child;
}

async function waitForHttp(url: string, label: string): Promise<void> {
  for (let i = 0; i < 40; i++) {
    try {
      await fetch(url);
      return;
    } catch {
      await sleep(500);
    }
  }
  throw new Error(`${label} did not come up at ${url}`);
}

async function runStep(script: string, env: Record<string, string>, args: string[] = []): Promise<number> {
  return new Promise((resolvePromise) => {
    const child = spawn("npx", ["tsx", script, ...args], {
      cwd: ROOT,
      env: { ...process.env, ...env },
      stdio: ["ignore", "inherit", "inherit"],
    });
    child.on("close", (code) => resolvePromise(code ?? 1));
  });
}

function cleanup(): void {
  for (const child of children) {
    child.kill("SIGTERM");
  }
}
process.on("SIGINT", () => {
  cleanup();
  process.exit(130);
});

function loadEnvFile(path: string): void {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const line of text.split("\n")) {
    const match = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (match !== null && process.env[match[1] as string] === undefined) {
      process.env[match[1] as string] = match[2];
    }
  }
}
loadEnvFile(resolve(ROOT, ".env"));
loadEnvFile(resolve(ROOT, ".env.judge"));

if (process.env["BUYER_PRIVATE_KEY"] === undefined || process.env["SELLER_ADDRESS"] === undefined) {
  console.error("Missing keys: .env.judge ships pre-funded Base Sepolia testnet keys and should cover this.");
  process.exit(1);
}

banner("SHROFF — Kane CLI is the referee. Money moves only on its verdict.");
console.log("  Act 1  Honest seller delivers      -> Kane passes  -> USDC settles on-chain");
console.log("  Act 2  Evil seller takes the money -> Kane catches -> settlement refused");
console.log("  Act 3  The market remembers        -> buyer refuses the branded seller");
console.log("  Act 4  Same referee on fiat        -> Stripe capture vs cancel");
console.log("  Act 5  The ledger cannot lie       -> hash chain verified");

banner("Starting the neutral referee and both sellers");
startService("referee", "packages/referee/src/cli.ts", {
  PORT: String(REFEREE_PORT),
  TEST_ROOT: "apps/seller-honest",
  LEDGER_PATH: ".shroff/judge-demo-verdicts.ndjson",
});
await waitForHttp(`http://localhost:${REFEREE_PORT}/identity`, "referee");
startService("honest", "apps/seller-honest/src/server.ts", { PORT: String(HONEST_PORT) });
startService("evil", "apps/seller-evil/src/server.ts", {
  PORT: String(EVIL_PORT),
  FRAUD_MODE: "bait",
});
await waitForHttp(`http://localhost:${HONEST_PORT}/verdicts`, "honest seller");
await sleep(2000);

banner("ACT 1 — The honest seller: pay, verify in a real browser, settle");
const act1 = await runStep("packages/buyer/src/cli.ts", {
  SELLER_URL: `http://localhost:${HONEST_PORT}/report`,
});
console.log(act1 === 0 ? "  ✔ Kane confirmed delivery; USDC settled on Base Sepolia" : "  ✘ unexpected");

banner("ACT 2 — The evil seller: takes payment, delivers a horoscope");
const act2 = await runStep("packages/buyer/src/cli.ts", {
  SELLER_URL: `http://localhost:${EVIL_PORT}/report`,
});
console.log(
  act2 === 3
    ? "  ✔ Kane caught the fraud; settlement refused; funds never left the wallet"
    : "  ✘ unexpected",
);

banner("ACT 3 — The market remembers: scoreboard + pre-purchase refusal");
const scores = (await (await fetch(`http://localhost:${REFEREE_PORT}/sellers`)).json()) as {
  seller: string;
  score: number | null;
  band: string;
  verdicts: number;
}[];
for (const s of scores) {
  console.log(`  ${s.seller}  band=${s.band}  score=${s.score ?? "n/a"}  signed verdicts=${s.verdicts}`);
}
const act3 = await runStep("packages/buyer/src/cli.ts", {
  SELLER_URL: `http://localhost:${EVIL_PORT}/report`,
  REFEREE_URL: `http://localhost:${REFEREE_PORT}`,
});
console.log(act3 === 4 ? "  ✔ Buyer refused to even pay the branded seller" : "  ✘ unexpected");

if (process.env["STRIPE_SECRET_KEY"]?.startsWith("sk_test_") === true) {
  banner("ACT 4 — Same referee, fiat rail: Stripe authorize -> Kane -> capture/cancel");
  startService("fiat", "apps/seller-fiat/src/server.ts", { PORT: String(FIAT_PORT) });
  await waitForHttp(`http://localhost:${FIAT_PORT}/verdicts`, "fiat seller");
  const act4 = await runStep("packages/buyer/src/fiat-cli.ts", {
    SELLER_URL: `http://localhost:${FIAT_PORT}/buy`,
  });
  console.log(act4 === 0 ? "  ✔ Card hold captured only after Kane passed" : "  ✘ unexpected");
} else {
  banner("ACT 4 — skipped (set STRIPE_SECRET_KEY=sk_test_... to run the fiat rail)");
}

banner("ACT 5 — The ledger cannot lie");
await runStep("packages/referee/src/verify-ledger-cli.ts", {}, [".shroff/judge-demo-verdicts.ndjson"]);

banner("DONE — every settlement above moved (or refused to move) on Kane's word");
cleanup();
process.exit(0);
