import { spawn } from "node:child_process";
import { once } from "node:events";
import { createInterface } from "node:readline";
import { parseKaneLine, selectRunEnd, type KaneEvent } from "./events.js";
import type { KaneRunResult } from "./verdict.js";

export interface KaneRunOptions {
  objective?: string;
  testFile?: string;
  url?: string;
  timeoutSeconds?: number;
  headless?: boolean;
  variables?: Record<string, string>;
  kaneBin?: string;
  onEvent?: (event: KaneEvent) => void;
}

const DEFAULT_TIMEOUT_SECONDS = 300;
const DEFAULT_BIN = "kane-cli";

export function buildKaneArgs(options: KaneRunOptions): string[] {
  if (options.objective === undefined && options.testFile === undefined) {
    throw new Error("Kane run needs an objective or a test file");
  }
  if (options.objective !== undefined && options.testFile !== undefined) {
    throw new Error("Kane run takes an objective or a test file, not both");
  }

  const args =
    options.testFile !== undefined
      ? ["testmd", "run", options.testFile]
      : ["run", options.objective as string];

  args.push("--agent");
  if (options.headless !== false) {
    args.push("--headless");
  }
  args.push("--timeout", String(options.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS));
  if (options.url !== undefined) {
    args.push("--url", options.url);
  }
  if (options.variables !== undefined && Object.keys(options.variables).length > 0) {
    args.push("--variables", JSON.stringify(options.variables));
  }
  return args;
}

export async function runKane(options: KaneRunOptions): Promise<KaneRunResult> {
  const args = buildKaneArgs(options);
  const child = spawn(options.kaneBin ?? DEFAULT_BIN, args, {
    stdio: ["ignore", "pipe", "pipe"],
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

  const [exitCode] = (await once(child, "close")) as [number | null];

  return {
    exitCode,
    events,
    runEnd: selectRunEnd(events),
    stderr: Buffer.concat(stderrChunks).toString("utf8"),
  };
}
