import Inbox from "@/components/Inbox";
import { getCasePayload, getInbox } from "@/components/data";

export const dynamic = "force-dynamic";

// Ordering provider view. Only attending-signed, delivered results ever appear here.
export default async function InboxPage({ searchParams }: { searchParams: Promise<{ case?: string | string[] }> }) {
  const q = (await searchParams).case;
  const wanted = Array.isArray(q) ? q[0] : q;
  const items = getInbox();
  // The selection must be a message in the inbox: an unsigned case can never be opened from here.
  const selectedId = items.find((i) => i.case_id === wanted)?.case_id ?? items[0]?.case_id ?? null;
  const selected = selectedId ? getCasePayload(selectedId) : null;
  return <Inbox items={items} selected={selected} />;
}
