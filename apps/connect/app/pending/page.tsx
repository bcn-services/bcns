import { redirect } from "next/navigation";
import { currentMembership } from "@/lib/session";
import { getConfig } from "@/lib/env";
import { BCNS_EMAIL } from "@/lib/request-connection";
import { formatDay, loadBilling, PRICE_LABEL, stripeReady, type BillingSelf } from "@/lib/stripe-billing";
import { signOut } from "../login/actions";
import { Frame } from "../login/frame";
import { finishActivation, openBillingPortal, startCheckout } from "./actions";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  billing: "We couldn't open the payment page just now. Please try again in a minute.",
  owner: "Only the workspace owner can pay or change the card.",
};

function Notice({ error }: { error?: string }) {
  const text = error ? ERRORS[error] : undefined;
  return text ? (
    <p role="alert" className="note note-alert">
      {text}
    </p>
  ) : null;
}

/** Pay, and (once there is a card on file) Update card. Owners only. */
function PayButtons({ billing }: { billing: BillingSelf }) {
  return (
    <>
      <form action={startCheckout}>
        <button type="submit" className="btn">
          Pay {PRICE_LABEL}
        </button>
      </form>
      {billing.customerId ? (
        <form action={openBillingPortal}>
          <button type="submit" className="btn btn-out">
            Update card
          </button>
        </form>
      ) : null}
    </>
  );
}

const SignOut = () => (
  <form action={signOut}>
    <button type="submit" className="btn btn-out">
      Sign out
    </button>
  </form>
);

/** A live workspace whose payment failed: still open until graceUntil, then paused. */
function GraceCard({ billing, canPay, error }: { billing: BillingSelf; canPay: boolean; error?: string }) {
  return (
    <section className="sc">
      <div className="sc-h">
        <h1 className="sc-t">Keep your workspace open</h1>
      </div>
      <p className="meta">
        Your last payment didn&apos;t go through. Your workspace stays open until <b>{formatDay(billing.graceUntil ?? 0)}</b>, then it pauses
        until it&apos;s paid. Your data stays safe either way.
      </p>
      <Notice error={error} />
      {billing.role !== "owner" ? (
        <p className="meta">Ask your workspace owner to update the payment.</p>
      ) : canPay ? (
        <div className="flex flex-wrap gap-3">
          <PayButtons billing={billing} />
        </div>
      ) : (
        <p className="meta">
          Email <a href={`mailto:${BCNS_EMAIL}`}>{BCNS_EMAIL}</a> and we&apos;ll sort it out.
        </p>
      )}
    </section>
  );
}

/**
 * The page a sign-up without an open workspace lands on (the tenant middleware's pendingPath):
 * pay to open it, pay to resume a paused one, or wait for bcns. Members of a live workspace
 * only see it while their payment is in its grace month; anyone else is sent home.
 */
export default async function PendingPage({ searchParams }: { searchParams: { paid?: string; waiting?: string; error?: string } }) {
  const membership = await currentMembership();
  const billing = await loadBilling();
  const canPay = stripeReady(getConfig());

  if (membership) {
    if (billing?.view !== "grace") redirect("/");
    return <GraceCard billing={billing} canPay={canPay} error={searchParams.error} />;
  }

  if (searchParams.paid === "1") {
    return (
      <Frame
        title={
          <>
            Payment <b>received</b>
          </>
        }
        description={
          searchParams.waiting === "1"
            ? "Stripe is still confirming your payment. This usually takes less than a minute, so give it a moment and try again."
            : "Thanks! Your workspace is ready to open."
        }
      >
        <form action={finishActivation}>
          <button type="submit" className="btn">
            Open my workspace
          </button>
        </form>
        <SignOut />
      </Frame>
    );
  }

  if (billing?.view === "pay" && canPay) {
    const paused = billing.status === "paused";
    return (
      <Frame
        title={
          paused ? (
            <>
              Your workspace is <b>paused</b>
            </>
          ) : (
            <>
              Open your <b>workspace</b>
            </>
          )
        }
        description={
          paused
            ? `Your last payment didn't go through, so your workspace is paused. Your data is safe. Pay ${PRICE_LABEL} to pick up where you left off.`
            : `bcns Connect is ${PRICE_LABEL}, with no setup fee. Pay securely through Stripe and your workspace opens right away.`
        }
      >
        <Notice error={searchParams.error} />
        {billing.role === "owner" ? <PayButtons billing={billing} /> : <p className="meta">Ask your workspace owner to pay to open it.</p>}
        <SignOut />
      </Frame>
    );
  }

  if (billing?.status === "paused") {
    return (
      <Frame
        title={
          <>
            Your workspace is <b>paused</b>
          </>
        }
        description={
          <>
            Your data is safe. Email <a href={`mailto:${BCNS_EMAIL}`}>{BCNS_EMAIL}</a> to turn it back on.
          </>
        }
      >
        <SignOut />
      </Frame>
    );
  }

  return (
    <Frame
      title={
        <>
          Your workspace is <b>pending</b>
        </>
      }
      description="Thanks for signing up. bcns reviews every new workspace before it opens; bcns will be in touch when yours is ready. Then sign in again to get started."
    >
      <SignOut />
    </Frame>
  );
}
