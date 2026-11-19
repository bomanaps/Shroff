export interface AssuranceEvent {
  type?: string;
  verb?: string;
  status?: string;
  exit_code?: number;
  total_credits?: number;
  minted?: { logical_id?: string }[];
  awaiting_approval?: { test?: string; criterion?: string }[];
}

export function parseAssuranceStream(raw: string): AssuranceEvent[] {
  const events: AssuranceEvent[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") {
      continue;
    }
    let value: unknown;
    try {
      value = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (typeof value === "object" && value !== null) {
      events.push(value as AssuranceEvent);
    }
  }
  return events;
}

export function assertCompleted(events: AssuranceEvent[], command: string): void {
  const done = events.findLast((e) => e.type === "done");
  if (done === undefined) {
    throw new Error(`${command}: stream ended without a done event`);
  }
  if (done.exit_code !== 0 || done.status !== "complete") {
    throw new Error(
      `${command}: finished with status ${String(done.status)} exit ${String(done.exit_code)}`,
    );
  }
}

export function extractMintedUseCase(events: AssuranceEvent[]): string {
  const minted = events.findLast((e) => e.type === "commit")?.minted ?? [];
  const useCaseId = minted.find((m) => m.logical_id?.startsWith("uc-"))?.logical_id;
  if (useCaseId === undefined) {
    throw new Error("ingest minted no use-case; the spec file may be empty or unreadable");
  }
  return useCaseId;
}

export interface DesignOutputs {
  testIds: string[];
  criteria: string[];
}

export function extractDesignOutputs(events: AssuranceEvent[]): DesignOutputs {
  const commit = events.findLast((e) => e.type === "commit");
  const testIds = (commit?.minted ?? [])
    .map((m) => m.logical_id)
    .filter((id): id is string => id !== undefined && id.startsWith("t-"));
  if (testIds.length === 0) {
    throw new Error("design minted no tests; the use-case may be too thin to test");
  }
  const criteria = [
    ...new Set(
      (commit?.awaiting_approval ?? [])
        .map((entry) => entry.criterion)
        .filter((c): c is string => c !== undefined),
    ),
  ];
  return { testIds, criteria };
}

export function maxCredits(events: AssuranceEvent[]): number {
  return events.reduce((max, e) => Math.max(max, e.total_credits ?? 0), 0);
}
