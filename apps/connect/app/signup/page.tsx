import { notFound } from "next/navigation";
import { getConfig } from "@/lib/env";
import { PRICE_LABEL, SHOPIFY_FROM } from "@/lib/stripe-billing";
import { confirmSignup, signUp } from "./actions";
import { Frame } from "../login/frame";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  invalid: "Check the business name and email, then try again.",
  unconfigured: "Sign-up is not configured for this app yet.",
  failed: "Something went wrong creating your account. Please try again in a few minutes.",
  billing: "We couldn't open the payment page. Please try again in a few minutes.",
};

type Search = { error?: string; ok?: string; from?: string; paid?: string; canceled?: string; confirm?: string; name?: string; email?: string };

/** Query values come from the URL, so they are re-checked before they are shown or posted. */
const prefill = (s: Search) => ({
  name: typeof s.name === "string" ? s.name.slice(0, 100) : "",
  email: typeof s.email === "string" ? s.email.slice(0, 254) : "",
});

export default function SignupPage({ searchParams }: { searchParams: Search }) {
  if (!getConfig().signupEnabled) notFound();
  if (searchParams.paid === "1") {
    return (
      <Frame
        title="Check your email"
        description="If your payment went through, we've emailed your sign-in link to the address you gave us. Use it to choose your password."
      >
        <a href="/login" className="lnk">
          Back to sign in
        </a>
      </Frame>
    );
  }
  const { name, email } = prefill(searchParams);
  if (searchParams.confirm === "1" && searchParams.from !== SHOPIFY_FROM && name.trim() && email.includes("@")) {
    return (
      <Frame
        title={
          <>
            Confirm your <b>email</b>
          </>
        }
        description={`We'll send your sign-in link to ${email}.`}
      >
        <form action={confirmSignup}>
          <input type="hidden" name="name" value={name} />
          <input type="hidden" name="email" value={email} />
          <p className="sub">
            {name} · {PRICE_LABEL}, billed by Stripe. Your workspace opens as soon as payment goes through.
          </p>
          <button type="submit" className="btn">
            Continue to payment
          </button>
          <a href={`/signup?${new URLSearchParams({ name, email })}`} className="lnk">
            Edit name or email
          </a>
        </form>
      </Frame>
    );
  }
  if (searchParams.ok === "check-email") {
    return (
      <Frame
        title="Check your email"
        description="If that address can be signed up, we've sent a link to confirm it and choose your password. Once confirmed, bcns reviews new workspaces before they open."
      >
        <a href="/login" className="lnk">
          Back to sign in
        </a>
      </Frame>
    );
  }
  const error = searchParams.error ? (ERRORS[searchParams.error] ?? ERRORS.failed) : null;
  const canceled = searchParams.canceled === "1";
  return (
    <Frame
      title={
        <>
          Create <b>account</b>
        </>
      }
      description="Start a bcns Connect workspace for your business."
    >
      <form action={signUp}>
        {/* Reached from /login during a Shopify App Store install: Shopify bills them, not us. */}
        {searchParams.from === SHOPIFY_FROM ? <input type="hidden" name="from" value={SHOPIFY_FROM} /> : null}
        <label className="field" htmlFor="name">
          Business name
          <input id="name" name="name" type="text" autoComplete="organization" required maxLength={100} defaultValue={name} />
        </label>
        <label className="field" htmlFor="email">
          Email
          <input id="email" name="email" type="email" autoComplete="email" required defaultValue={email} />
        </label>
        {canceled && !error ? <p className="note">Checkout was canceled. You haven't been charged and no account was created.</p> : null}
        {error ? (
          <p role="alert" className="note note-alert">
            {error}
          </p>
        ) : null}
        <button type="submit" className="btn">
          {searchParams.from === SHOPIFY_FROM ? "Create account" : "Continue"}
        </button>
        <a href="/login" className="lnk">
          Already have an account? Sign in
        </a>
      </form>
    </Frame>
  );
}
