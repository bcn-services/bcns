import { SectionHeading } from "@bcn-services/ui";
import { signIn } from "./actions";
import { FINISH_PATH } from "@/lib/shopify-oauth";
import { BCNS_EMAIL } from "@/lib/request-connection";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  invalid: "Sign-in failed. Check your email and password.",
  unconfigured: "Sign-in is not configured for this app yet.",
  "signed-out": "Please sign in to continue.",
  "no-membership": "Your account isn't a member of any workspace yet. Ask bcns for an invite.",
  "wrong-client": "That account belongs to a different workspace. Sign in with this workspace's account.",
};

export default function LoginPage({ searchParams }: { searchParams: { error?: string; next?: string } }) {
  const error = searchParams.error ? (ERRORS[searchParams.error] ?? ERRORS.invalid) : null;
  // Set by /api/oauth/shopify/finish after a Shopify-initiated install.
  const finishingShopify = searchParams.next === FINISH_PATH;
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
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          className="h-10 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Sign in
        </button>
      </form>
    </div>
  );
}
