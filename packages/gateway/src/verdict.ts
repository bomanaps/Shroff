import { homedir } from "node:os";
import { join } from "node:path";
import type { KaneEvent, RunEndEvent, TestMdDoneEvent } from "./events.js";

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
  testMdDone: TestMdDoneEvent | undefined;
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

function nonEmpty(value: string | undefined): string | undefined {
  return value !== undefined && value.trim() !== "" ? value : undefined;
}

function sessionDirFromId(sessionId: string | undefined): string | undefined {
  if (sessionId === undefined) {
    return undefined;
  }
  return join(homedir(), ".testmuai", "kaneai", "sessions", sessionId);
}

export type KaneSurface = "run" | "testmd";

export function triage(result: KaneRunResult, surface: KaneSurface = "run"): DeliveryVerdict {
  const { exitCode, runEnd, testMdDone } = result;
  const base = {
    reason: runEnd?.reason,
    sessionDir: runEnd?.session_dir,
    creditsConsumed: runEnd?.credits_consumed,
    runEnd,
  };

  if (exitCode === null || exitCode === KANE_EXIT.notStarted || exitCode > KANE_EXIT.timedOut || exitCode < 0) {
    return {
      ...base,
      kind: "infra_error",
      settleable: false,
      disputable: false,
      summary:
        exitCode === KANE_EXIT.notStarted
          ? "Kane did not start; delivery is unverified"
          : "Kane was interrupted or exited abnormally; delivery is unverified",
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
  if (runEnd !== undefined && isInfraReason(runEnd.reason)) {
    return {
      ...base,
      kind: "infra_error",
      settleable: false,
      disputable: false,
      summary: runEnd.summary,
    };
  }

  if (surface === "testmd") {
    const testMdBase = {
      ...base,
      sessionDir: base.sessionDir ?? sessionDirFromId(testMdDone?.session_id),
    };
    if (testMdDone === undefined) {
      return {
        ...testMdBase,
        kind: "incomplete",
        settleable: false,
        disputable: false,
        summary: "Kane produced no final test verdict; run is incomplete",
      };
    }
    const shareNote = testMdDone.share_url !== undefined ? ` (report: ${testMdDone.share_url})` : "";
    if (exitCode === KANE_EXIT.passed && testMdDone.overall_status === "passed") {
      return {
        ...testMdBase,
        kind: "delivered",
        settleable: true,
        disputable: false,
        summary: nonEmpty(runEnd?.summary) ?? `Saved acceptance test passed${shareNote}`,
      };
    }
    return {
      ...testMdBase,
      kind: "not_delivered",
      settleable: false,
      disputable: true,
      summary: nonEmpty(runEnd?.summary) ?? `Saved acceptance test failed${shareNote}`,
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
