import { spawn } from "node:child_process";
import { once } from "node:events";
import {
  assertCompleted,
  extractDesignOutputs,
  extractMintedUseCase,
  maxCredits,
  parseAssuranceStream,
  type AssuranceEvent,
} from "./parse.js";

export interface CompileResult {
  useCaseId: string;
  testIds: string[];
  approvedCriteria: string[];
  creditsConsumed: number;
}

async function runAssurance(
  args: string[],
  cwd: string,
  log: (line: string) => void,
): Promise<AssuranceEvent[]> {
  const child = spawn("kane-cli", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
  const chunks: Buffer[] = [];
  child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
  const [exitCode] = (await once(child, "close")) as [number | null];

  const command = `kane-cli ${args.join(" ")}`;
  if (exitCode !== 0) {
    throw new Error(`${command} exited ${String(exitCode)}`);
  }
  const events = parseAssuranceStream(Buffer.concat(chunks).toString("utf8"));
  assertCompleted(events, command);
  log(`[spec-compiler] ${args.slice(0, 3).join(" ")}: done`);
  return events;
}

export async function compileSpec(
  specFile: string,
  cwd: string,
  log: (line: string) => void = console.log,
): Promise<CompileResult> {
  const ingest = await runAssurance(["context", "ingest", specFile, "--mode", "agent"], cwd, log);
  const useCaseId = extractMintedUseCase(ingest);

  const design = await runAssurance(
    ["design", "tests", "--use-case", useCaseId, "--mode", "agent", "--max", "1", "--allow-unreviewed"],
    cwd,
    log,
  );
  const { testIds, criteria } = extractDesignOutputs(design);

  for (const criterion of criteria) {
    await runAssurance(["context", "review", "--approve", criterion, "--mode", "agent"], cwd, log);
  }

  return {
    useCaseId,
    testIds,
    approvedCriteria: criteria,
    creditsConsumed: maxCredits([...ingest, ...design]),
  };
}
