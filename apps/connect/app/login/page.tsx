import { SectionHeading } from "@bcn-services/ui";
import { requestReset, signIn } from "./actions";
import { FINISH_PATH } from "@/lib/shopify-oauth";
import { BCNS_EMAIL } from "@/lib/request-connection";

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
    <div className="mx-auto w-full max-w-sm">
      <SectionHeading as="h1" align="left" title="Reset your password" description="Enter your email and we'll send a link to choose a new password." />
      <form action={requestReset} className="mt-8 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm font-medium" htmlFor="email">
          Email
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="h-10 rounded-md border border-input bg-background px-3 text-sm font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        <button
          type="submit"
          className="h-10 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Send reset link
        </button>
        <a href="/login" className="rounded-sm text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
          Back to sign in
        </a>
      </form>
    </div>
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
    <div className="mx-auto w-full max-w-sm">
      <SectionHeading
        as="h1"
        align="left"
        title="Sign in"
        description={
          finishingShopify
            ? "Shopify approved the connection. Sign in to your bcns workspace to finish adding your store."
            : "One login for your dashboard, your sources and your team."
        }
      />
      {finishingShopify ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No bcns account yet?{" "}
          <a href={`mailto:${BCNS_EMAIL}?subject=${encodeURIComponent("bcns Connect workspace for my Shopify store")}`} className="font-medium text-primary underline underline-offset-4">
            Email bcns
          </a>{" "}
          and we&apos;ll set up your workspace. Then open bcns Connect from your Shopify admin to finish.
        </p>
      ) : null}
      <form action={signIn} className="mt-8 flex flex-col gap-4">
        {finishingShopify ? <input type="hidden" name="next" value={FINISH_PATH} /> : null}
        <label className="flex flex-col gap-1.5 text-sm font-medium" htmlFor="email">
          Email
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="h-10 rounded-md border border-input bg-background px-3 text-sm font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium" htmlFor="password">
          Password
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="h-10 rounded-md border border-input bg-background px-3 text-sm font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        {resetSent ? (
          <p role="status" className="rounded-md border border-input bg-muted px-3 py-2 text-sm text-foreground">
            {RESET_SENT_MESSAGE}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="rounded-md border border-destructive/40 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          className="h-10 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Sign in
        </button>
        <a href="/login?forgot=1" className="rounded-sm text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
          Forgot password?
        </a>
      </form>
    </div>
  );
}
