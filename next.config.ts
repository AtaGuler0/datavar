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
};

export default nextConfig;
