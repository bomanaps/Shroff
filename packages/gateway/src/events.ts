export interface KaneEnvelope {
  v: number;
  ts: string;
}

export interface StreamStartEvent extends KaneEnvelope {
  type: "stream_start";
  cli_version: string;
  surface: "run" | "testmd" | "testrun" | "explore";
  pid: number;
  session_dir?: string;
}

export interface StepEvent extends KaneEnvelope {
  step: number;
  status: "running" | "done" | "failed";
  remark: string;
  child_id?: string;
}

export interface ErrorEvent extends KaneEnvelope {
  type: "error";
  message: string;
  code?: string;
  remedy?: string;
  next?: string;
  support_id?: string;
}

export interface WarningEvent extends KaneEnvelope {
  type: "warning";
  code?: string;
  message?: string;
}

export interface RunEndEvent extends KaneEnvelope {
  type: "run_end";
  status: "passed" | "failed";
  summary: string;
  one_liner?: string;
  reason?: string;
  duration?: number;
  credits_consumed?: number;
  final_state?: Record<string, unknown>;
  test_url?: string;
  session_dir?: string;
  result_code?: string;
  verdict?: Record<string, unknown>;
}

export interface TestMdDoneEvent extends KaneEnvelope {
  type: "test_md_done";
  overall_status: "passed" | "failed";
  duration_s?: number;
  session_id?: string;
  share_url?: string;
}

export type KaneEvent =
  | StreamStartEvent
  | StepEvent
  | ErrorEvent
  | WarningEvent
  | RunEndEvent
  | TestMdDoneEvent;

export function parseKaneLine(line: string): KaneEvent | undefined {
  const trimmed = line.trim();
  if (trimmed === "") {
    return undefined;
  }
  let value: unknown;
  try {
    value = JSON.parse(trimmed);
  } catch {
    return undefined;
  }
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (typeof record["v"] !== "number" || typeof record["ts"] !== "string") {
    return undefined;
  }
  return record as unknown as KaneEvent;
}

export function isRunEnd(event: KaneEvent): event is RunEndEvent {
  return "type" in event && event.type === "run_end";
}

export function selectRunEnd(events: readonly KaneEvent[]): RunEndEvent | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (event !== undefined && isRunEnd(event)) {
      return event;
    }
  }
  return undefined;
}

export function isTestMdDone(event: KaneEvent): event is TestMdDoneEvent {
  return "type" in event && event.type === "test_md_done";
}

export function selectTestMdDone(events: readonly KaneEvent[]): TestMdDoneEvent | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (event !== undefined && isTestMdDone(event)) {
      return event;
    }
  }
  return undefined;
}
