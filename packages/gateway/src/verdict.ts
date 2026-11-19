import type { KaneEvent, RunEndEvent } from "./events.js";

export const KANE_EXIT = {
  passed: 0,
  failed: 1,
  notStarted: 2,
  timedOut: 3,
} as const;

export type VerdictKind =
  | "delivered"
  | "not_delivered"
  | "infra_error"
  | "timed_out"
  | "incomplete";

export interface KaneRunResult {
  exitCode: number | null;
  events: readonly KaneEvent[];
  runEnd: RunEndEvent | undefined;
  stderr: string;
}

export interface DeliveryVerdict {
  kind: VerdictKind;
  settleable: boolean;
  disputable: boolean;
  summary: string;
  reason: string | undefined;
  sessionDir: string | undefined;
  creditsConsumed: number | undefined;
  runEnd: RunEndEvent | undefined;
}

function isInfraReason(reason: string | undefined): boolean {
  return reason !== undefined && reason.startsWith("infra_error.");
}

export function triage(result: KaneRunResult): DeliveryVerdict {
  const { exitCode, runEnd } = result;
  const base = {
    reason: runEnd?.reason,
    sessionDir: runEnd?.session_dir,
    creditsConsumed: runEnd?.credits_consumed,
    runEnd,
  };

  if (exitCode === KANE_EXIT.notStarted) {
    return {
      ...base,
      kind: "infra_error",
      settleable: false,
      disputable: false,
      summary: "Kane did not start; delivery is unverified",
    };
  }
  if (exitCode === KANE_EXIT.timedOut) {
    return {
      ...base,
      kind: "timed_out",
      settleable: false,
      disputable: false,
      summary: "Kane timed out before reaching a verdict",
    };
  }
  if (runEnd === undefined) {
    return {
      ...base,
      kind: "incomplete",
      settleable: false,
      disputable: false,
      summary: "Kane produced no final verdict; run is incomplete",
    };
  }
  if (isInfraReason(runEnd.reason)) {
    return {
      ...base,
      kind: "infra_error",
      settleable: false,
      disputable: false,
      summary: runEnd.summary,
    };
  }
  if (exitCode === KANE_EXIT.passed && runEnd.status === "passed") {
    return {
      ...base,
      kind: "delivered",
      settleable: true,
      disputable: false,
      summary: runEnd.summary,
    };
  }
  return {
    ...base,
    kind: "not_delivered",
    settleable: false,
    disputable: true,
    summary: runEnd.summary,
  };
}
