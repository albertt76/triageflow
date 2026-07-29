import { getFilterOptions } from "@/lib/tickets";
import NewTicketForm from "@/components/NewTicketForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "New ticket — TriageFlow" };

export default async function NewTicketPage() {
  // Product and type lists come from the data so they can't drift from it.
  const { products, ticketTypes } = await getFilterOptions();
  return <NewTicketForm products={products} ticketTypes={ticketTypes} />;
}
