import { supabase } from "./client";

/**
 * The Google account attached to the signed-in wallet, if there is one.
 *
 * Read from the browser rather than from a route because row-level security
 * already answers it: the policy on `identities` returns your own row and
 * nobody else's, so the only thing this query can say is which account reaches
 * this wallet. It is shown on the account panel so that a link made on one
 * device is visible on another.
 */
export type LinkedAccount = {
  email: string | null;
  provider: string;
  linked_at: string;
};

export async function readLinkedAccount(): Promise<LinkedAccount | null> {
  const { data, error } = await supabase
    .from("identities")
    .select("email, provider, linked_at")
    .maybeSingle();

  if (error) throw error;
  return (data as LinkedAccount) ?? null;
}
