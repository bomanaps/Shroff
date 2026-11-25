import { resolve, isAbsolute, normalize, join, dirname } from "node:path";
import { homedir } from "node:os";
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import express from "express";
import { judgeDelivery } from "@shroff/gateway";
import type { StepEvent } from "@shroff/gateway";
import {
  generateRefereeKeys,
  loadRefereeKeys,
  hashTestFile,
  signVerdict,
  type RefereeKeys,
} from "./signing.js";
import { appendLedger, readLedger } from "./ledger.js";
import { scoreSellers, sellerOf } from "./score.js";
import { LiveBroadcast } from "./live.js";

export interface RefereeServerConfig {
  port: number;
  testRoot: string;
  privateKeyPem?: string;
  ledgerPath?: string;
  kaneTimeoutSeconds?: number;
  demoRoot?: string;
}

interface VerifyRequestBody {
  delivery_url?: unknown;
  test_file?: unknown;
  rail?: unknown;
}

interface OutcomeRequestBody {
  signature?: unknown;
  rail?: unknown;
  status?: unknown;
  transaction?: unknown;
  detail?: unknown;
}

const SESSIONS_ROOT = join(homedir(), ".testmuai", "kaneai", "sessions");
const UI_DIR = resolve(fileURLToPath(new URL("../ui", import.meta.url)));

function isStepEvent(event: unknown): event is StepEvent {
  return (
    typeof event === "object" &&
    event !== null &&
    "step" in event &&
    "status" in event &&
    !("type" in event)
  );
}

interface LiveStep {
  step: number;
  status: "running" | "done" | "failed";
  remark?: string;
}

function toLiveStep(event: unknown): LiveStep | undefined {
  if (isStepEvent(event)) {
    return { step: event.step, status: event.status, remark: event.remark };
  }
  if (typeof event !== "object" || event === null || !("type" in event)) {
    return undefined;
  }
  const e = event as Record<string, unknown>;
  const index = Number(e["index"] ?? e["step_index"]);
  if (!Number.isFinite(index)) {
    return undefined;
  }
  switch (e["type"]) {
    case "test_md_step_start":
      return { step: index, status: "running", remark: String(e["heading"] ?? `Step ${index}`) };
    case "step_start":
      return { step: index, status: "running", remark: String(e["objective"] ?? `Step ${index}`) };
    case "step_event": {
      const kind = e["event"];
      if (kind === "action" || kind === "reasoning") {
        return { step: index, status: "running", remark: String(e["detail"] ?? "") };
      }
      return undefined;
    }
    case "step_end":
      return { step: index, status: e["status"] === "passed" ? "done" : "failed" };
    default:
      return undefined;
  }
}

const KEY_FILE = ".shroff/referee-key.pem";
const EVIDENCE_CACHE = ".shroff/evidence-cache";

function stableKeys(privateKeyPem: string | undefined): RefereeKeys {
  if (privateKeyPem !== undefined) {
    return loadRefereeKeys(privateKeyPem);
  }
  if (existsSync(KEY_FILE)) {
    return loadRefereeKeys(readFileSync(KEY_FILE, "utf8"));
  }
  const keys = generateRefereeKeys();
  mkdirSync(dirname(KEY_FILE), { recursive: true });
  writeFileSync(
    KEY_FILE,
    keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    { mode: 0o600 },
  );
  return keys;
}

function unsealEvidence(session: string): string | undefined {
  const cache = join(EVIDENCE_CACHE, session);
  if (existsSync(cache)) {
    return cache;
  }
  const evidenceDir = join(SESSIONS_ROOT, session, "evidence");
  if (!existsSync(evidenceDir)) {
    return undefined;
  }
  const seal = readdirSync(evidenceDir).find((f) => f.endsWith(".evidence"));
  mkdirSync(cache, { recursive: true });
  if (seal !== undefined) {
    try {
      execFileSync("unzip", ["-o", "-q", join(evidenceDir, seal), "-d", cache]);
    } catch {
      return cache;
    }
    return cache;
  }
  try {
    execFileSync("cp", ["-R", `${evidenceDir}/.`, cache]);
  } catch {
    return cache;
  }
  return cache;
}

function listScreenshots(cache: string): string[] {
  return readdirSync(cache, { recursive: true })
    .map(String)
    .filter((f) => /screenshot\.(jpg|png)$/.test(f) || (/\.(jpg|png)$/.test(f) && !f.includes("annotated")))
    .sort((a, b) => {
      const na = Number(/steps\/(\d+)-/.exec(a)?.[1] ?? 0);
      const nb = Number(/steps\/(\d+)-/.exec(b)?.[1] ?? 0);
      return na - nb || a.localeCompare(b);
    });
}

export function startReferee(config: RefereeServerConfig): { keys: RefereeKeys } {
  const keys = stableKeys(config.privateKeyPem);

  const live = new LiveBroadcast();
  const outcomes = new Map<string, Record<string, unknown>>();

  const app = express();
  app.use(express.json());
  app.use(express.static(UI_DIR));

  app.get("/identity", (_req, res) => {
    res.json({ referee_id: keys.refereeId, public_key: keys.publicKeyPem });
  });

  app.get("/events", (_req, res) => {
    live.attach(res);
  });

  let demoBusy = false;
  let demoRuns = 0;
  let demoLastAt = 0;
  const DEMO_MAX_RUNS = Number(process.env["DEMO_MAX_RUNS"] ?? 1000);
  const DEMO_COOLDOWN_MS = Number(process.env["DEMO_COOLDOWN_SECONDS"] ?? 0) * 1000;
  const DEMO_TARGETS: Record<string, { script: string; env: Record<string, string> }> = {
    honest: {
      script: "packages/buyer/src/cli.ts",
      env: { SELLER_URL: "http://localhost:4021/report", REFEREE_URL: `http://localhost:${String(config.port)}` },
    },
    evil: {
      script: "packages/buyer/src/cli.ts",
      env: { SELLER_URL: "http://localhost:4022/report", REFEREE_URL: `http://localhost:${String(config.port)}` },
    },
    fiat: { script: "packages/buyer/src/fiat-cli.ts", env: { SELLER_URL: "http://localhost:4023/buy" } },
  };

  app.post("/demo/buy", (req, res) => {
    if (config.demoRoot === undefined) {
      res.status(404).json({ error: "demo console is disabled on this referee" });
      return;
    }
    const target = DEMO_TARGETS[(req.body as { target?: string }).target ?? ""];
    if (target === undefined) {
      res.status(400).json({ error: "target must be honest, evil, or fiat" });
      return;
    }
    if (demoBusy) {
      res.status(409).json({ error: "a purchase is already in flight" });
      return;
    }
    if (demoRuns >= DEMO_MAX_RUNS) {
      res.status(429).json({ error: "demo budget exhausted — clone the repo and run it locally" });
      return;
    }
    if (Date.now() - demoLastAt < DEMO_COOLDOWN_MS) {
      res.status(429).json({ error: "cooling down — try again in a couple of minutes" });
      return;
    }
    demoBusy = true;
    demoRuns++;
    demoLastAt = Date.now();
    const child = spawn("npx", ["tsx", target.script], {
      cwd: config.demoRoot,
      env: { ...process.env, ...target.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (chunk: Buffer) => {
      for (const line of chunk.toString().split("\n")) {
        if (!line.startsWith("[buyer]")) continue;
        console.log(`[demo] ${line}`);
        if (line.includes("refusing to pay")) {
          live.emit("outcome", {
            signature: "pre-purchase",
            rail: "trust-check",
            status: "buyer_refused",
            detail: line.replace("[buyer] ", ""),
            at: new Date().toISOString(),
          });
        }
      }
    });
    child.on("close", (code) => {
      demoBusy = false;
      console.log(`[demo] buyer exited ${String(code)}`);
    });
    res.json({ started: true });
  });

  app.get("/promise", (_req, res) => {
    const spec = join(config.testRoot, "delivery-spec.md");
    const test = readdirSync(join(config.testRoot, ".testmuai", "tests")).find((f) =>
      f.endsWith("_test.md"),
    );
    res.type("text/plain").send(
      [
        "THE SELLER'S PROMISE (delivery-spec.md)",
        "=".repeat(48),
        existsSync(spec) ? readFileSync(spec, "utf8") : "(no spec)",
        "",
        "COMPILED KANE ACCEPTANCE TEST (generated by kane-cli assurance, hash-bound into every verdict)",
        "=".repeat(48),
        test !== undefined
          ? readFileSync(join(config.testRoot, ".testmuai", "tests", test), "utf8")
          : "(no test)",
      ].join("\n"),
    );
  });

  app.get("/sellers", (_req, res) => {
    if (config.ledgerPath === undefined) {
      res.json([]);
      return;
    }
    res.json([...scoreSellers(config.ledgerPath).values()]);
  });

  app.get("/sellers/score", (req, res) => {
    const seller = req.query["seller"];
    if (typeof seller !== "string" || config.ledgerPath === undefined) {
      res.status(400).json({ error: "seller query parameter is required" });
      return;
    }
    const score = scoreSellers(config.ledgerPath).get(sellerOf(seller + "/"));
    res.json(
      score ?? { seller: sellerOf(seller + "/"), verdicts: 0, score: null, band: "unknown" },
    );
  });

  app.get("/feed", (_req, res) => {
    if (config.ledgerPath === undefined) {
      res.json([]);
      return;
    }
    res.json(
      readLedger(config.ledgerPath)
        .slice(-50)
        .map((row) => ({ ...row, outcome: outcomes.get(row.entry.signature) })),
    );
  });

  app.post("/outcome", (req, res) => {
    const body = req.body as OutcomeRequestBody;
    if (typeof body.signature !== "string" || typeof body.status !== "string") {
      res.status(400).json({ error: "signature and status are required" });
      return;
    }
    const outcome = {
      rail: typeof body.rail === "string" ? body.rail : "unknown",
      status: body.status,
      transaction: typeof body.transaction === "string" ? body.transaction : undefined,
      detail: typeof body.detail === "string" ? body.detail : undefined,
      at: new Date().toISOString(),
    };
    outcomes.set(body.signature, outcome);
    live.emit("outcome", { signature: body.signature, ...outcome });
    res.json({ ok: true });
  });

  app.get("/evidence/:session", (req, res) => {
    const session = req.params["session"] ?? "";
    if (!/^[0-9a-f-]{8,64}$/.test(session)) {
      res.status(400).json({ error: "bad session id" });
      return;
    }
    const cache = unsealEvidence(session);
    if (cache === undefined) {
      res.json([]);
      return;
    }
    res.json(
      listScreenshots(cache).map(
        (f) => `/evidence/${session}/${f.split("/").map(encodeURIComponent).join("/")}`,
      ),
    );
  });

  app.get("/evidence/:session/:file(*)", (req, res) => {
    const session = req.params["session"] ?? "";
    const file = normalize(req.params["file"] ?? "");
    if (!/^[0-9a-f-]{8,64}$/.test(session) || isAbsolute(file) || file.startsWith("..")) {
      res.status(400).end();
      return;
    }
    res.sendFile(resolve(join(EVIDENCE_CACHE, session, file)));
  });

  app.post("/verify", (req, res) => {
    void (async () => {
      const body = req.body as VerifyRequestBody;
      if (typeof body.delivery_url !== "string" || typeof body.test_file !== "string") {
        res.status(400).json({ error: "delivery_url and test_file are required" });
        return;
      }
      const relative = normalize(body.test_file);
      if (isAbsolute(relative) || relative.startsWith("..")) {
        res.status(400).json({ error: "test_file must be a path inside the referee's test root" });
        return;
      }
      const testPath = resolve(config.testRoot, relative);

      let testHash: string;
      try {
        testHash = hashTestFile(testPath);
      } catch {
        res.status(404).json({ error: `unknown test file: ${relative}` });
        return;
      }

      const rail = typeof body.rail === "string" ? body.rail : "unknown";
      live.emit("run_start", {
        deliveryUrl: body.delivery_url,
        seller: sellerOf(body.delivery_url),
        testHash,
        rail,
      });

      const verdict = await judgeDelivery(
        {
          run: {
            testFile: relative,
            variables: { delivery_url: body.delivery_url },
            cwd: config.testRoot,
            ...(config.kaneTimeoutSeconds !== undefined
              ? { timeoutSeconds: config.kaneTimeoutSeconds }
              : {}),
          },
        },
        (event) => {
          const step = toLiveStep(event);
          if (step !== undefined) {
            live.emit("step", { ...step });
          }
        },
      );

      const signed = signVerdict(keys, verdict, body.delivery_url, testHash);
      if (config.ledgerPath !== undefined) {
        appendLedger(config.ledgerPath, signed);
      }
      live.emit("verdict", {
        kind: signed.verdict.kind,
        settleable: signed.verdict.settleable,
        summary: signed.verdict.summary,
        seller: sellerOf(body.delivery_url),
        signature: signed.signature,
        testHash,
        evidenceSession: verdict.sessionDir?.split("/").at(-1),
        rail,
      });
      console.log(
        `[referee] ${signed.verdict.kind} for ${body.delivery_url} (test ${testHash.slice(0, 18)}…)`,
      );
      res.json(signed);
    })().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    });
  });

  app.listen(config.port, () => {
    console.log(
      `[referee] ${keys.refereeId} listening on :${config.port}, tests from ${config.testRoot}`,
    );
  });
  return { keys };
}
