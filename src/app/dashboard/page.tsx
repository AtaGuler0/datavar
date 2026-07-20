import { Overview } from "@/components/dashboard/overview";

/**
 * The overview is fully client-side: everything on it is keyed to the wallet,
 * which only exists in the browser. The server shell just routes to it.
 */
export default function DashboardOverview() {
  return <Overview />;
}
