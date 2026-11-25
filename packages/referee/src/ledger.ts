import { appendFileSync, existsSync, readFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createHash } from "node:crypto";
import type { SignedVerdict } from "./signing.js";

export interface LedgerEntry {
  seq: number;
  prev: string;
  entry: SignedVerdict;
}

function hashEntry(entry: LedgerEntry): string {
  return "sha256:" + createHash("sha256").update(JSON.stringify(entry)).digest("hex");
}

export function readLedger(path: string): LedgerEntry[] {
  if (!existsSync(path)) {
    return [];
  }
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as LedgerEntry);
}

export function appendLedger(path: string, signed: SignedVerdict): LedgerEntry {
  const entries = readLedger(path);
  const last = entries.at(-1);
  const entry: LedgerEntry = {
    seq: entries.length,
    prev: last === undefined ? "genesis" : hashEntry(last),
    entry: signed,
  };
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, JSON.stringify(entry) + "\n");
  return entry;
}

export function verifyLedger(path: string): { ok: boolean; brokenAt?: number } {
  const entries = readLedger(path);
  for (let i = 0; i < entries.length; i++) {
    const current = entries[i];
    if (current === undefined || current.seq !== i) {
      return { ok: false, brokenAt: i };
    }
    const expectedPrev = i === 0 ? "genesis" : hashEntry(entries[i - 1] as LedgerEntry);
    if (current.prev !== expectedPrev) {
      return { ok: false, brokenAt: i };
    }
  }
  return { ok: true };
}
