import { Catalogue } from "@/components/market/catalogue";

/**
 * The buy side. Everything on this page is client-rendered against the
 * `market_listings` view, because a catalogue is a filter and a filter is a
 * query per interaction — prerendering the first page would only mean showing
 * it twice.
 */
export default function MarketPage() {
  return <Catalogue />;
}
