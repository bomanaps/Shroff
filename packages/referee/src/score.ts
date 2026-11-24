import { readLedger } from "./ledger.js";
import type { SignedVerdict } from "./signing.js";

export interface SellerScore {
  seller: string;
  verdicts: number;
  delivered: number;
  notDelivered: number;
  unverified: number;
  score: number | null;
  band: "trusted" | "suspicious" | "untrusted" | "unknown";
  lastVerdictAt: string | undefined;
  proof: {
    refereeId: string;
    testHashes: string[];
    latestEvidence: string | undefined;
    latestSignature: string | undefined;
  };
}

export function sellerOf(deliveryUrl: string): string {
  try {
    return new URL(deliveryUrl).origin;
  } catch {
    return "invalid";
  }
}

function band(score: number | null, verdicts: number): SellerScore["band"] {
  if (score === null || verdicts === 0) {
    return "unknown";
  }
  if (score >= 0.9) {
    return "trusted";
  }
  if (score >= 0.5) {
    return "suspicious";
  }
  return "untrusted";
}

export function scoreSellers(ledgerPath: string): Map<string, SellerScore> {
  const bySeller = new Map<string, SignedVerdict[]>();
  for (const { entry } of readLedger(ledgerPath)) {
    const seller = sellerOf(entry.deliveryUrl);
    const list = bySeller.get(seller) ?? [];
    list.push(entry);
    bySeller.set(seller, list);
  }

  const scores = new Map<string, SellerScore>();
  for (const [seller, verdicts] of bySeller) {
    const delivered = verdicts.filter((v) => v.verdict.kind === "delivered").length;
    const notDelivered = verdicts.filter((v) => v.verdict.kind === "not_delivered").length;
    const unverified = verdicts.length - delivered - notDelivered;
    const judged = delivered + notDelivered;
    const score = judged === 0 ? null : delivered / judged;
    const latest = verdicts.at(-1);
    scores.set(seller, {
      seller,
      verdicts: verdicts.length,
      delivered,
      notDelivered,
      unverified,
      score,
      band: band(score, judged),
      lastVerdictAt: latest?.issuedAt,
      proof: {
        refereeId: latest?.refereeId ?? "unknown",
        testHashes: [...new Set(verdicts.map((v) => v.testHash))],
        latestEvidence: latest?.evidenceDir,
        latestSignature: latest?.signature,
      },
    });
  }
  return scores;
}
