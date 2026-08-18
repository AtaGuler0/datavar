/**
 * Saying in the log what the caller was not told.
 *
 * Every route here answers a failure with a sentence a person can act on —
 * "couldn't reach the payout contract", "try again". That is the right thing to
 * show someone, and it is also the whole problem: the sentence is the same
 * whether the network blinked, the contract rejected the call, or the server is
 * missing an environment variable. Whoever is looking at the deployment gets no
 * more than the person who is stuck.
 *
 * This is the other half. The caller keeps their sentence; the log gets the
 * reason, the route it came from and what was being attempted.
 *
 * Only the message and the error's class, never the stack and never the value
 * of anything: these routes hold session tokens, signed transactions and — for
 * the ones that mint their own — configuration secrets. An error message names
 * a missing variable; it must not carry one.
 */
export function logFailure(where: string, e: unknown): void {
  console.error(`[${where}] ${describe(e)}`);
}

function describe(e: unknown): string {
  if (!(e instanceof Error)) return String(e);

  // The class is half the diagnosis: an AuthConfigError and a network timeout
  // reach the caller as the same apology.
  //
  // `name` is not enough to get it. The error classes here — AuthConfigError,
  // SorobanError, which payout.ts and consent.ts re-export under their own
  // names — all extend Error without setting `name`, so they arrive calling
  // themselves "Error". The constructor still knows, so ask it, and fall back
  // to the bare message if a build has renamed it.
  const label = e.name === "Error" ? e.constructor?.name : e.name;
  return label && label !== "Error" ? `${label}: ${e.message}` : e.message;
}
