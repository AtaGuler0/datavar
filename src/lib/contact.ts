/**
 * Where a person reaches us. In one place because the landing page, the footer
 * and the docs all quote it, and a handle that changes in two of three places
 * sends someone to a stranger.
 */
export const CONTACT = {
  telegram: { handle: "@humanthe", href: "https://t.me/humanthe" },
  email: { address: "support@datavar.xyz", href: "mailto:support@datavar.xyz" },
} as const;
