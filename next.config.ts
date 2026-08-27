import type { NextConfig } from "next";

/**
 * Blog images are uploaded to Supabase Storage, so next/image has to be told
 * that host is allowed. It's read from the same variable the client uses
 * rather than written out, so a fork or a second project doesn't silently
 * serve unoptimised images.
 */
const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined;

const isDev = process.env.NODE_ENV === "development";

/**
 * Where the browser is allowed to talk. Written out rather than imported from
 * lib/stellar/config so this file stays loadable before any path alias exists;
 * if the product ever leaves testnet, both places move together.
 *
 * These are here because the wallet kit's own copy of the Stellar SDK is in the
 * client bundle and reaches them directly. Our own contract calls do not need
 * them — those go through the API routes, from the server.
 */
const STELLAR_ORIGINS = [
  "https://horizon-testnet.stellar.org",
  "https://soroban-testnet.stellar.org",
  "https://friendbot.stellar.org",
];

const supabaseOrigins = supabaseHost
  ? [`https://${supabaseHost}`, `wss://${supabaseHost}`]
  : [];

/**
 * Content Security Policy.
 *
 * The reason this exists: the session token lives in localStorage, which is a
 * considered choice with its own reasoning in lib/auth/session-store.ts, but it
 * means a single successful XSS hands over the whole session — and an
 * operator's session can write to `sales`.
 *
 * Deliberately not nonce-based, which is what Next's own guide reaches for
 * first. Nonces require a `proxy.ts` and force *every* page to render
 * dynamically: this site's landing page, blog and docs are prerendered, several
 * with revalidation, and all of that would be given up. Experimental SRI does
 * not close the gap either — it signs external files, while the five inline
 * scripts on every page are the App Router's own streaming payload.
 *
 * So `script-src` keeps `'unsafe-inline'`, and this policy is honest about
 * being defence in depth rather than an XSS cure. What it does buy is the part
 * that matters most for a stolen token: `connect-src`, `img-src` and
 * `form-action` are allowlists, so script that runs still has nowhere to send
 * what it took. Loading an attacker's script from their origin is out too;
 * `object-src`, `base-uri` and `frame-ancestors` close the classic rest.
 *
 * Checked against the four wallets this product loads before being written.
 * Freighter, xBull and Lobstr all talk to their extension over `postMessage`,
 * which no policy here touches. Albedo is a web wallet and opens an iframe to
 * albedo.link, which is why `frame-src` names it — a strict policy without that
 * line would have broken signing for Albedo users only, and quietly.
 */
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  // 'unsafe-eval' in development only: React uses eval there to rebuild
  // server-side error stacks in the browser. Production needs neither.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob:${supabaseHost ? ` https://${supabaseHost}` : ""}`,
  "font-src 'self' data:",
  ["connect-src 'self'", ...supabaseOrigins, ...STELLAR_ORIGINS].join(" "),
  // Albedo signs in an iframe it owns; the other three wallets need nothing.
  "frame-src https://albedo.link",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  // Pointless against a localhost dev server, and it would only confuse things.
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

/**
 * The headers every response carries.
 *
 * HSTS is production-only: served on localhost it would pin the browser to
 * https for a host that does not speak it. `preload` is left off on purpose —
 * getting onto that list is easy and getting off it is not, and it is not this
 * file's decision to make.
 */
const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  // frame-ancestors above says the same thing to browsers that read CSP; this
  // is for the ones that only know the older header.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Nothing here uses a camera, a microphone or a location, and a page that
  // asks for one is a page doing something it was not written to do. `usb` is
  // in the list too: the wallet kit ships a Ledger module, but this product
  // does not load it — if it ever does, this line has to change with it.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  ...(isDev
    ? []
    : [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains",
        },
      ]),
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },

  images: {
    remotePatterns: supabaseHost
      ? [
          {
            protocol: "https",
            hostname: supabaseHost,
            pathname: "/storage/v1/object/public/**",
          },
        ]
      : [],
  },

  /**
   * Sources and Uploads merged into one section. Both old paths were linkable
   * and both are in people's history, so they move rather than 404 —
   * permanently, because the merge is not something we intend to undo.
   */
  async redirects() {
    return [
      { source: "/dashboard/sources", destination: "/dashboard/data", permanent: true },
      { source: "/dashboard/uploads", destination: "/dashboard/data", permanent: true },
      // Consent became a view of the data page rather than a section: a
      // receipt always belongs to a dataset, so the ledger lives with them.
      { source: "/dashboard/consent", destination: "/dashboard/data#consent", permanent: true },
    ];
  },
};

export default nextConfig;
