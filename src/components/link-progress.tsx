"use client";

import { useLinkStatus } from "next/link";

/**
 * Feedback for the gap between clicking a link and the page arriving.
 *
 * A post is rendered on demand, so a click that lands before the prefetch does
 * has nothing to show for itself: the row stays exactly as it was until the
 * whole page swaps. These two render inside a `<Link>` and read its pending
 * state, so the wait is visible where the reader is already looking. When the
 * destination is already prefetched there is no pending phase and neither of
 * them ever animates, which is the point — they mark a wait, they don't
 * announce a navigation.
 *
 * Both are `aria-hidden`: the browser already tells assistive tech that a
 * navigation is in flight, and a decorative bar repeating it is noise.
 */
export function LinkProgress() {
  const { pending } = useLinkStatus();
  return (
    <span aria-hidden="true" className="link-progress" data-pending={pending} />
  );
}

/** The pill's leading dot, which turns into a pulse while the post loads. */
export function PendingDot({ className = "" }: { className?: string }) {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden="true"
      className={`pending-dot ${className}`}
      data-pending={pending}
    />
  );
}
