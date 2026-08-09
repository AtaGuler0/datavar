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

const nextConfig: NextConfig = {
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
