import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * What a crawler may read.
 *
 * The split is not about secrecy — every path below is defended by a session
 * and row-level security, and a robots file has never kept anybody out of
 * anything. It is about what is worth indexing. The marketing surface, the
 * blog and the docs are written to be found; the dashboard, the operator panel
 * and the ramp are an application, and a search result landing someone on a
 * page that only says "connect a wallet" helps nobody.
 *
 * /api is here for a different reason again: those routes answer with JSON,
 * several of them cost a contract simulation, and a crawler walking them would
 * be paying for it in our rate limits.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/api/", "/auth/", "/dashboard", "/anchor", "/market/licences", "/market/profile"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
