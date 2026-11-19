import type { VerdictRecord } from "@shroff/gateway";

export function buildRepairPrompt(record: VerdictRecord, projectDir: string): string {
  const { verdict } = record;
  const lines = [
    "A paid delivery failed browser verification and the payment was not settled.",
    `Verification check: ${record.label}`,
    `Verdict: ${verdict.kind}`,
    `Verifier summary: ${verdict.summary}`,
  ];
  if (verdict.reason !== undefined) {
    lines.push(`Failure reason: ${verdict.reason}`);
  }
  if (verdict.sessionDir !== undefined) {
    lines.push(
      `Evidence pack (per-step screenshots, console and network logs): ${verdict.sessionDir}/evidence`,
    );
  }
  lines.push(
    "",
    `The seller application lives in ${projectDir}.`,
    "Find the bug in the seller code that makes the delivered page fail this check and fix it.",
    "Fix only the application code; do not change the verification objective, the gate, or any test.",
    "Make the minimal correct change.",
  );
  return lines.join("\n");
}
