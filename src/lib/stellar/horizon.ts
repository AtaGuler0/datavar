import { STELLAR, STROOPS_PER_XLM } from "./config";

/**
 * The small slice of Horizon the browser needs, over plain fetch. The SDK
 * would do this too, but it's half a megabyte of transaction machinery to read
 * one balance — and nothing on the client ever builds or signs a transaction.
 */

export type AccountState =
  | { exists: true; balanceStroops: number }
  | { exists: false; balanceStroops: 0 };

type HorizonAccount = {
  balances?: { asset_type: string; balance: string }[];
};

/**
 * Native XLM balance of an account, in stroops. A 404 isn't an error here: an
 * unfunded account is a real state the operator needs to see named, not a
 * failure to load.
 */
export async function fetchAccount(address: string): Promise<AccountState> {
  const res = await fetch(`${STELLAR.horizonUrl}/accounts/${address}`, {
    cache: "no-store",
  });

  if (res.status === 404) return { exists: false, balanceStroops: 0 };
  if (!res.ok) throw new Error(`Horizon returned ${res.status}`);

  const account = (await res.json()) as HorizonAccount;
  const native = account.balances?.find((b) => b.asset_type === "native");
  return {
    exists: true,
    balanceStroops: Math.round(Number(native?.balance ?? 0) * STROOPS_PER_XLM),
  };
}

/**
 * Tops an account up with test XLM. Testnet's faucet is one-shot per account
 * per funding — a second call on a funded account is rejected, which is why
 * the caller reports rather than retries.
 */
export async function fundWithFriendbot(address: string): Promise<void> {
  const res = await fetch(`${STELLAR.friendbotUrl}?addr=${address}`);
  if (!res.ok) {
    throw new Error(
      res.status === 400
        ? "Friendbot won't fund this account again. Use the Stellar Laboratory to send more."
        : "Friendbot didn't answer. Try again in a moment.",
    );
  }
}
