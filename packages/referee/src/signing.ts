import {
  createHash,
  generateKeyPairSync,
  sign,
  verify,
  createPrivateKey,
  createPublicKey,
  type KeyObject,
} from "node:crypto";
import { readFileSync } from "node:fs";
import type { DeliveryVerdict } from "@shroff/gateway";

export interface SignedVerdict {
  verdict: {
    kind: DeliveryVerdict["kind"];
    settleable: boolean;
    disputable: boolean;
    summary: string;
  };
  deliveryUrl: string;
  testHash: string;
  evidenceDir: string | undefined;
  issuedAt: string;
  refereeId: string;
  signature: string;
}

export interface RefereeKeys {
  privateKey: KeyObject;
  publicKeyPem: string;
  refereeId: string;
}

export function generateRefereeKeys(): RefereeKeys {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  return { privateKey, publicKeyPem, refereeId: fingerprintPublicKey(publicKeyPem) };
}

export function loadRefereeKeys(privateKeyPem: string): RefereeKeys {
  const privateKey = createPrivateKey(privateKeyPem);
  const publicKeyPem = createPublicKey(privateKey)
    .export({ type: "spki", format: "pem" })
    .toString();
  return { privateKey, publicKeyPem, refereeId: fingerprintPublicKey(publicKeyPem) };
}

export function fingerprintPublicKey(publicKeyPem: string): string {
  return createHash("sha256").update(publicKeyPem).digest("hex").slice(0, 16);
}

export function hashTestFile(path: string): string {
  return "sha256:" + createHash("sha256").update(readFileSync(path)).digest("hex");
}

function payloadToSign(v: Omit<SignedVerdict, "signature">): Buffer {
  return Buffer.from(
    JSON.stringify([
      v.verdict.kind,
      v.verdict.settleable,
      v.verdict.disputable,
      v.verdict.summary,
      v.deliveryUrl,
      v.testHash,
      v.issuedAt,
      v.refereeId,
    ]),
  );
}

export function signVerdict(
  keys: RefereeKeys,
  verdict: DeliveryVerdict,
  deliveryUrl: string,
  testHash: string,
): SignedVerdict {
  const unsigned: Omit<SignedVerdict, "signature"> = {
    verdict: {
      kind: verdict.kind,
      settleable: verdict.settleable,
      disputable: verdict.disputable,
      summary: verdict.summary,
    },
    deliveryUrl,
    testHash,
    evidenceDir: verdict.sessionDir,
    issuedAt: new Date().toISOString(),
    refereeId: keys.refereeId,
  };
  const signature = sign(null, payloadToSign(unsigned), keys.privateKey).toString("base64");
  return { ...unsigned, signature };
}

export function verifySignedVerdict(signed: SignedVerdict, publicKeyPem: string): boolean {
  if (signed.refereeId !== fingerprintPublicKey(publicKeyPem)) {
    return false;
  }
  const { signature, ...unsigned } = signed;
  return verify(
    null,
    payloadToSign(unsigned),
    createPublicKey(publicKeyPem),
    Buffer.from(signature, "base64"),
  );
}
