import { verifySignedVerdict, type SignedVerdict } from "./signing.js";

export interface RefereeClient {
  refereeId: string;
  publicKeyPem: string;
  verify: (deliveryUrl: string, testFile: string) => Promise<SignedVerdict>;
}

export async function connectReferee(baseUrl: string): Promise<RefereeClient> {
  const identityResponse = await fetch(`${baseUrl}/identity`);
  if (!identityResponse.ok) {
    throw new Error(`referee identity fetch failed: HTTP ${identityResponse.status}`);
  }
  const identity = (await identityResponse.json()) as {
    referee_id: string;
    public_key: string;
  };

  return {
    refereeId: identity.referee_id,
    publicKeyPem: identity.public_key,
    verify: async (deliveryUrl, testFile) => {
      const response = await fetch(`${baseUrl}/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ delivery_url: deliveryUrl, test_file: testFile }),
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`referee verify failed: HTTP ${response.status} ${body.slice(0, 200)}`);
      }
      const signed = (await response.json()) as SignedVerdict;
      if (!verifySignedVerdict(signed, identity.public_key)) {
        throw new Error("referee returned a verdict with an INVALID signature");
      }
      return signed;
    },
  };
}
