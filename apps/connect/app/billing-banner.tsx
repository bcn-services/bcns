import Link from "next/link";
import { formatDay, type BillingSelf } from "@/lib/stripe-billing";

/** Shown on every hub page while a failed payment is in its grace month. Server-rendered. */
export function BillingBanner({ billing }: { billing: BillingSelf | null }) {
  if (billing?.view !== "grace" || billing.graceUntil === null) return null;
  return (
    <p role="status" className="note note-alert">
      Your last payment didn&apos;t go through. Your workspace stays open until {formatDay(billing.graceUntil)}.{" "}
      {billing.role === "owner" ? <Link href="/pending">Keep it open</Link> : "Ask your workspace owner to update the payment."}
    </p>
  );
}
