import { getQueueData, getFilterOptions } from "@/lib/tickets";
import { parseQueueFilters } from "@/lib/queue-params";
import QueueView from "@/components/QueueView";

// Always read fresh from the DB (revalidated by the write actions).
export const dynamic = "force-dynamic";

export default async function QueuePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseQueueFilters(await searchParams);
  const [{ tickets, counts, matched, shown, limit }, { products }] =
    await Promise.all([getQueueData(filters), getFilterOptions()]);

  return (
    <QueueView
      tickets={tickets}
      counts={counts}
      filters={filters}
      matched={matched}
      shown={shown}
      limit={limit}
      products={products}
    />
  );
}
