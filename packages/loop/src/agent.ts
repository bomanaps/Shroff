import { spawn } from "node:child_process";
import { once } from "node:events";

export interface AgentConfig {
  bin: string;
  args: string[];
  cwd: string;
  timeoutSeconds: number;
}

export interface AgentResult {
  exitCode: number | null;
  output: string;
}

export async function runRepairAgent(
  config: AgentConfig,
  prompt: string,
): Promise<AgentResult> {
  const child = spawn(config.bin, config.args, {
    cwd: config.cwd,
    stdio: ["pipe", "pipe", "pipe"],
  });
  child.stdin.end(prompt);

  const chunks: Buffer[] = [];
  child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
  child.stderr.on("data", (chunk: Buffer) => chunks.push(chunk));

  const watchdog = setTimeout(() => child.kill("SIGKILL"), config.timeoutSeconds * 1000);
  try {
    const [exitCode] = (await once(child, "close")) as [number | null];
    return { exitCode, output: Buffer.concat(chunks).toString("utf8") };
  } finally {
    clearTimeout(watchdog);
  }
}
