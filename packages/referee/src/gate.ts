import type { BeforeSettleHook } from "@x402/core/server";
import type { RefereeClient } from "./client.js";
import type { SignedVerdict } from "./signing.js";

export type VerificationPolicy =
  | { mode: "always" }
  | { mode: "first"; n: number }
  | { mode: "sample"; rate: number };

export interface RefereeGateConfig {
  testFile: string;
  getDeliveryUrl: () => string;
  onVerdict?: (signed: SignedVerdict) => void;
  maxRecords?: number;
  policy?: VerificationPolicy;
}

export interface RefereeGate {
  hook: BeforeSettleHook;
  records: readonly SignedVerdict[];
}

const DEFAULT_MAX_RECORDS = 1000;

function shouldVerify(policy: VerificationPolicy, settlementCount: number): boolean {
  switch (policy.mode) {
    case "always":
      return true;
    case "first":
      return settlementCount < policy.n;
    case "sample":
      return settlementCount < 1 || Math.random() < policy.rate;
  }
}

export function createRefereeGate(client: RefereeClient, config: RefereeGateConfig): RefereeGate {
  const records: SignedVerdict[] = [];
  const maxRecords = config.maxRecords ?? DEFAULT_MAX_RECORDS;
  const policy = config.policy ?? { mode: "always" };
  let settlementCount = 0;

  const hook: BeforeSettleHook = async () => {
    if (!shouldVerify(policy, settlementCount)) {
      settlementCount++;
      return;
    }
    settlementCount++;
    let signed: SignedVerdict;
    try {
      signed = await client.verify(config.getDeliveryUrl(), config.testFile);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { abort: true, reason: "delivery_unverified", message };
    }

    records.push(signed);
    if (records.length > maxRecords) {
      records.splice(0, records.length - maxRecords);
    }
    try {
      config.onVerdict?.(signed);
    } catch (error) {
      console.error("[shroff] onVerdict callback failed:", error);
    }

    if (signed.verdict.settleable) {
      return;
    }
    return {
      abort: true,
      reason: signed.verdict.disputable ? "delivery_failed" : "delivery_unverified",
      message: signed.verdict.summary,
    };
  };

  return { hook, records };
}
