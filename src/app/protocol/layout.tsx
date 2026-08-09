import type { ReactNode } from "react";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";

/**
 * The protocol view sits in the marketing shell, not the dashboard's. It needs
 * no wallet to read — that is the whole claim it makes — so putting it behind
 * the contributor rail would have been arguing against itself.
 */
export default function ProtocolLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteNav />
      <main className="flex-1 pt-16">{children}</main>
      <SiteFooter />
    </>
  );
}
