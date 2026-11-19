import { createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { toClientEvmSigner, ExactEvmScheme } from "@x402/evm";
import { wrapFetchWithPayment, x402Client, decodePaymentResponseHeader } from "@x402/fetch";

export const BASE_SEPOLIA_NETWORK = "eip155:84532";

export interface PaidFetchResult {
  response: Response;
  settlement: ReturnType<typeof decodePaymentResponseHeader> | undefined;
}

export interface BuyerClient {
  address: `0x${string}`;
  paidFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<PaidFetchResult>;
}

export function createBuyerClient(privateKey: `0x${string}`): BuyerClient {
  const account = privateKeyToAccount(privateKey);
  const publicClient = createPublicClient({ chain: baseSepolia, transport: http() });
  const signer = toClientEvmSigner(account, publicClient);
  const client = new x402Client().register(BASE_SEPOLIA_NETWORK, new ExactEvmScheme(signer));
  const fetchWithPay = wrapFetchWithPayment(globalThis.fetch, client);

  return {
    address: account.address,
    paidFetch: async (input, init) => {
      const response = await fetchWithPay(input, init);
      const header = response.headers.get("PAYMENT-RESPONSE");
      const settlement =
        header === null ? undefined : decodePaymentResponseHeader(header);
      return { response, settlement };
    },
  };
}
