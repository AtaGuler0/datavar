/**
 * Where this deployment answers.
 *
 * One constant rather than three copies, because three things have to agree on
 * it: the metadata in the root layout, the absolute URLs in the sitemap, and
 * the sitemap line inside robots.txt. A sitemap naming a host the site does not
 * serve is worse than no sitemap at all — a crawler reads it as a list of dead
 * pages — and the way that happens is a domain moving in one file while the
 * other two keep the old one.
 *
 * Written out rather than read from the platform's own variable. Vercel exposes
 * the deployment URL, but it exposes the *preview* URL on a preview build, and
 * a preview that published its own hostname into a sitemap would be asking to
 * be indexed instead of the real site.
 */
export const SITE_URL = "https://datavar.xyz";
