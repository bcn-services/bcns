import { requestReset, signIn } from "./actions";
import { FINISH_PATH } from "@/lib/shopify-oauth";
import { SHOPIFY_FROM } from "@/lib/stripe-billing";
import { BCNS_EMAIL } from "@/lib/request-connection";
import { getConfig } from "@/lib/env";
import { Frame } from "./frame";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  invalid: "Sign-in failed. Check your email and password.",
  unconfigured: "Sign-in is not configured for this app yet.",
  "signed-out": "Please sign in to continue.",
  "no-membership": "Your account isn't a member of any workspace yet. Ask bcns for an invite.",
  "link-expired": "That link has expired or was already used. Request a new one, or ask bcns to resend your invite.",
  "wrong-client": "That account belongs to a different workspace. Sign in with this workspace's account.",
};

const RESET_SENT_MESSAGE = "If that email has an account, we've sent a reset link.";

function ForgotForm() {
  return (
    <Frame
      title={
        <>
          Reset your <b>password</b>
        </>
      }
      description="Enter your email and we'll send a link to choose a new password."
    >
      <form action={requestReset}>
        <label className="field" htmlFor="email">
          Email
          <input id="email" name="email" type="email" autoComplete="email" required />
        </label>
        <button type="submit" className="btn">
          Send reset link
        </button>
        <a href="/login" className="lnk">
          Back to sign in
        </a>
      </form>
    </Frame>
  );
}

export default function LoginPage({ searchParams }: { searchParams: { error?: string; next?: string; ok?: string; forgot?: string } }) {
  const error = searchParams.error ? (ERRORS[searchParams.error] ?? ERRORS.invalid) : null;
  // Set by /api/oauth/shopify/finish after a Shopify-initiated install.
  const finishingShopify = searchParams.next === FINISH_PATH;
  // Same page, ?forgot=1: the tenant middleware lets only the exact loginPath through
  // signed out, so a /login/forgot route would bounce to /login and needs an allowlist entry.
  if (searchParams.forgot) return <ForgotForm />;
  const resetSent = searchParams.ok === "reset-sent";
  return (
    <Frame
      title={
        <>
          Sign <b>in</b>
        </>
      }
      description={
        finishingShopify ? (
          <>
            <p>Shopify approved the connection. Sign in to your bcns workspace to finish adding your store.</p>
            <p>
              No bcns account yet?{" "}
              <a href={`mailto:${BCNS_EMAIL}?subject=${encodeURIComponent("bcns Connect workspace for my Shopify store")}`} className="ul">
                Email bcns
              </a>{" "}
              and we&apos;ll set up your workspace. Then open bcns Connect from your Shopify admin to finish.
            </p>
          </>
        ) : (
          "One login for your dashboard, your sources and your team."
        )
      }
    >
      <form action={signIn}>
        {finishingShopify ? <input type="hidden" name="next" value={FINISH_PATH} /> : null}
        <label className="field" htmlFor="email">
          Email
          <input id="email" name="email" type="email" autoComplete="email" required />
        </label>
        <label className="field" htmlFor="password">
          Password
          <input id="password" name="password" type="password" autoComplete="current-password" required />
        </label>
        {resetSent ? (
          <p role="status" className="note note-plain">
            {RESET_SENT_MESSAGE}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="note note-alert">
            {error}
          </p>
        ) : null}
        <button type="submit" className="btn">
          Sign in
        </button>
        <a href="/login?forgot=1" className="lnk">
          Forgot password?
        </a>
        {getConfig().signupEnabled ? (
          <a href={finishingShopify ? `/signup?from=${SHOPIFY_FROM}` : "/signup"} className="lnk">
            Create account
          </a>
        ) : null}
      </form>
    </Frame>
  );
}
