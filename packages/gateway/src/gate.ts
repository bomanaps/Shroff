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
}

export interface DeliveryGate {
  hook: BeforeSettleHook;
  records: readonly VerdictRecord[];
}

export function createDeliveryGate(config: DeliveryGateConfig): DeliveryGate {
  const records: VerdictRecord[] = [];

  const hook: BeforeSettleHook = async (context) => {
    const check = await config.checkFor(context);
    const result = await runKane(check.run);
    const verdict = triage(result);

    const record: VerdictRecord = {
      label: check.label ?? check.run.testFile ?? check.run.objective ?? "unnamed",
      verdict,
      settledAt: new Date().toISOString(),
    };
    records.push(record);
    await config.onVerdict?.(record);

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
