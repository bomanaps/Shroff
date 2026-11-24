import { resolve, isAbsolute, normalize } from "node:path";
import express from "express";
import { judgeDelivery } from "@shroff/gateway";
import {
  generateRefereeKeys,
  loadRefereeKeys,
  hashTestFile,
  signVerdict,
  type RefereeKeys,
} from "./signing.js";
import { appendLedger } from "./ledger.js";
import { scoreSellers, sellerOf } from "./score.js";

export interface RefereeServerConfig {
  port: number;
  testRoot: string;
  privateKeyPem?: string;
  ledgerPath?: string;
  kaneTimeoutSeconds?: number;
}

interface VerifyRequestBody {
  delivery_url?: unknown;
  test_file?: unknown;
}

export function startReferee(config: RefereeServerConfig): { keys: RefereeKeys } {
  const keys =
    config.privateKeyPem !== undefined
      ? loadRefereeKeys(config.privateKeyPem)
      : generateRefereeKeys();

  const app = express();
  app.use(express.json());

  app.get("/identity", (_req, res) => {
    res.json({ referee_id: keys.refereeId, public_key: keys.publicKeyPem });
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
      score ?? {
        seller: sellerOf(seller + "/"),
        verdicts: 0,
        score: null,
        band: "unknown",
      },
    );
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

      const verdict = await judgeDelivery({
        run: {
          testFile: relative,
          variables: { delivery_url: body.delivery_url },
          cwd: config.testRoot,
          ...(config.kaneTimeoutSeconds !== undefined
            ? { timeoutSeconds: config.kaneTimeoutSeconds }
            : {}),
        },
      });

      const signed = signVerdict(keys, verdict, body.delivery_url, testHash);
      if (config.ledgerPath !== undefined) {
        appendLedger(config.ledgerPath, signed);
      }
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
    console.log(`[referee] ${keys.refereeId} listening on :${config.port}, tests from ${config.testRoot}`);
  });
  return { keys };
}
