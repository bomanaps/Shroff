import { createBuyerClient } from "@shroff/buyer";
import type { VerdictRecord } from "@shroff/gateway";
import { runRepairAgent, type AgentConfig } from "./agent.js";
import { buildRepairPrompt } from "./prompt.js";

export interface LoopConfig {
  sellerUrl: string;
  verdictsUrl: string;
  buyerPrivateKey: `0x${string}`;
  projectDir: string;
  agent: AgentConfig;
  maxAttempts: number;
  settleDelayMs?: number;
}

export type AttemptOutcome =
  | { kind: "settled"; transaction: string; attempt: number }
  | { kind: "unverified"; attempt: number; summary: string }
  | { kind: "repaired"; attempt: number }
  | { kind: "escalated"; attempt: number; summary: string };

export async function fetchLatestVerdict(verdictsUrl: string): Promise<VerdictRecord | undefined> {
  const response = await fetch(verdictsUrl);
  if (!response.ok) {
    return undefined;
  }
  const records = (await response.json()) as VerdictRecord[];
  return records.at(-1);
}

export async function runLoop(
  config: LoopConfig,
  log: (line: string) => void = console.log,
): Promise<AttemptOutcome> {
  const buyer = createBuyerClient(config.buyerPrivateKey);

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    log(`[loop] attempt ${attempt}/${config.maxAttempts}: purchasing ${config.sellerUrl}`);
    const { settlement } = await buyer.paidFetch(config.sellerUrl);

    if (settlement?.success === true) {
      log(`[loop] delivery verified, payment settled: ${settlement.transaction}`);
      return { kind: "settled", transaction: settlement.transaction, attempt };
    }

    const record = await fetchLatestVerdict(config.verdictsUrl);
    if (record === undefined || record.verdict.kind !== "not_delivered") {
      const summary = record?.verdict.summary ?? "no verdict available";
      log(`[loop] delivery unverified (${record?.verdict.kind ?? "unknown"}): not a product bug, not repairing`);
      return { kind: "unverified", attempt, summary };
    }

    if (attempt === config.maxAttempts) {
      log(`[loop] attempt limit reached, escalating to a human`);
      return { kind: "escalated", attempt, summary: record.verdict.summary };
    }

    log(`[loop] delivery failed: ${record.verdict.summary}`);
    log(`[loop] invoking repair agent on ${config.projectDir}`);
    const prompt = buildRepairPrompt(record, config.projectDir);
    const result = await runRepairAgent(config.agent, prompt);
    log(`[loop] agent exited ${String(result.exitCode)}`);
    if (config.settleDelayMs !== undefined) {
      await new Promise((resolve) => setTimeout(resolve, config.settleDelayMs));
    }
  }

  return { kind: "escalated", attempt: config.maxAttempts, summary: "attempt limit reached" };
}
