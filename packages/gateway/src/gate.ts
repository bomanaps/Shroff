import type { BeforeSettleHook, SettleContext } from "@x402/core/server";
import { runKane, type KaneRunOptions } from "./kane.js";
import { triage, type DeliveryVerdict } from "./verdict.js";

export interface DeliveryCheck {
  run: KaneRunOptions;
  label?: string;
}

export interface VerdictRecord {
  label: string;
  verdict: DeliveryVerdict;
  settledAt: string;
}

export interface DeliveryGateConfig {
  checkFor: (context: SettleContext) => DeliveryCheck | Promise<DeliveryCheck>;
  onVerdict?: (record: VerdictRecord) => void | Promise<void>;
  maxRecords?: number;
}

export interface DeliveryGate {
  hook: BeforeSettleHook;
  records: readonly VerdictRecord[];
}

const DEFAULT_MAX_RECORDS = 1000;

function infraVerdict(summary: string): DeliveryVerdict {
  return {
    kind: "infra_error",
    settleable: false,
    disputable: false,
    summary,
    reason: undefined,
    sessionDir: undefined,
    creditsConsumed: undefined,
    runEnd: undefined,
  };
}

export function createDeliveryGate(config: DeliveryGateConfig): DeliveryGate {
  const records: VerdictRecord[] = [];
  const maxRecords = config.maxRecords ?? DEFAULT_MAX_RECORDS;

  const hook: BeforeSettleHook = async (context) => {
    let label = "unnamed";
    let verdict: DeliveryVerdict;
    try {
      const check = await config.checkFor(context);
      label = check.label ?? check.run.testFile ?? check.run.objective ?? "unnamed";
      verdict = triage(await runKane(check.run));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      verdict = infraVerdict(`Verification could not run: ${message}`);
    }

    const record: VerdictRecord = {
      label,
      verdict,
      settledAt: new Date().toISOString(),
    };
    records.push(record);
    if (records.length > maxRecords) {
      records.splice(0, records.length - maxRecords);
    }
    try {
      await config.onVerdict?.(record);
    } catch (error) {
      console.error("[shroff] onVerdict callback failed:", error);
    }

    if (verdict.settleable) {
      return;
    }
    return {
      abort: true,
      reason: verdict.disputable ? "delivery_failed" : "delivery_unverified",
      message: verdict.summary,
    };
  };

  return { hook, records };
}
