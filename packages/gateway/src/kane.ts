import { spawn } from "node:child_process";
import { once } from "node:events";
import { createInterface } from "node:readline";
import { parseKaneLine, selectRunEnd, selectTestMdDone, type KaneEvent } from "./events.js";
import type { KaneRunResult } from "./verdict.js";

export interface KaneRunOptions {
  objective?: string;
  testFile?: string;
  url?: string;
  timeoutSeconds?: number;
  headless?: boolean;
  variables?: Record<string, string>;
  kaneBin?: string;
  cwd?: string;
  watchdogGraceSeconds?: number;
  onEvent?: (event: KaneEvent) => void;
}

const DEFAULT_TIMEOUT_SECONDS = 300;
const WATCHDOG_GRACE_SECONDS = 30;
const DEFAULT_BIN = "kane-cli";

export function buildKaneArgs(options: KaneRunOptions): string[] {
  if (options.objective === undefined && options.testFile === undefined) {
    throw new Error("Kane run needs an objective or a test file");
  }
  if (options.objective !== undefined && options.testFile !== undefined) {
    throw new Error("Kane run takes an objective or a test file, not both");
  }

  const timeout = options.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS;
  if (!Number.isFinite(timeout) || timeout <= 0) {
    throw new Error(`Kane timeout must be a positive number of seconds, got ${String(timeout)}`);
  }

  const args =
    options.testFile !== undefined
      ? ["testmd", "run", options.testFile]
      : ["run", options.objective as string];

  args.push("--agent");
  if (options.headless !== false) {
    args.push("--headless");
  }
  args.push("--timeout", String(timeout));
  if (options.url !== undefined) {
    args.push("--url", options.url);
  }
  if (options.variables !== undefined && Object.keys(options.variables).length > 0) {
    const payload =
      options.testFile !== undefined
        ? Object.fromEntries(
            Object.entries(options.variables).map(([name, value]) => [name, { value }]),
          )
        : options.variables;
    args.push("--variables", JSON.stringify(payload));
  }
  return args;
}

export async function runKane(options: KaneRunOptions): Promise<KaneRunResult> {
  const args = buildKaneArgs(options);
  const child = spawn(options.kaneBin ?? DEFAULT_BIN, args, {
    stdio: ["ignore", "pipe", "pipe"],
    ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
  });

  const events: KaneEvent[] = [];
  const stderrChunks: Buffer[] = [];

  child.stderr.on("data", (chunk: Buffer) => {
    stderrChunks.push(chunk);
  });

  const lines = createInterface({ input: child.stdout });
  lines.on("line", (line) => {
    const event = parseKaneLine(line);
    if (event !== undefined) {
      events.push(event);
      options.onEvent?.(event);
    }
  });

  const timeoutSeconds = options.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS;
  const grace = options.watchdogGraceSeconds ?? WATCHDOG_GRACE_SECONDS;
  const watchdog = setTimeout(
    () => {
      child.kill("SIGKILL");
    },
    (timeoutSeconds + grace) * 1000,
  );

  try {
    const [exitCode] = (await once(child, "close")) as [number | null];
    return {
      exitCode,
      events,
      runEnd: selectRunEnd(events),
      testMdDone: selectTestMdDone(events),
      stderr: Buffer.concat(stderrChunks).toString("utf8"),
    };
  } finally {
    clearTimeout(watchdog);
  }
}
