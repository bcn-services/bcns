import { notFound } from "next/navigation";
import { SectionHeading } from "@bcn-services/ui";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth-link";
import { getConfig } from "@/lib/env";
import { signUp } from "./actions";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  invalid: "Check the business name, email and password, then try again.",
  short: `Use a password of at least ${MIN_PASSWORD_LENGTH} characters.`,
  unconfigured: "Sign-up is not configured for this app yet.",
  failed: "Something went wrong creating your account. Please try again in a few minutes.",
};

const INPUT =
  "h-10 rounded-md border border-input bg-background px-3 text-sm font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export default function SignupPage({ searchParams }: { searchParams: { error?: string; ok?: string } }) {
  if (!getConfig().signupEnabled) notFound();
  if (searchParams.ok === "check-email") {
    return (
      <div className="mx-auto w-full max-w-sm">
        <SectionHeading as="h1" align="left" title="Check your email" description="If that address can be signed up, we've sent a link to confirm it. Once confirmed, bcns reviews new workspaces before they open." />
      </div>
    );
  }
  const error = searchParams.error ? (ERRORS[searchParams.error] ?? ERRORS.failed) : null;
  return (
    <div className="mx-auto w-full max-w-sm">
      <SectionHeading as="h1" align="left" title="Create account" description="Start a bcns Connect workspace for your business." />
      <form action={signUp} className="mt-8 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm font-medium" htmlFor="name">
          Business name
          <input id="name" name="name" type="text" autoComplete="organization" required maxLength={100} className={INPUT} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium" htmlFor="email">
          Email
          <input id="email" name="email" type="email" autoComplete="email" required className={INPUT} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium" htmlFor="password">
          Password
          <input id="password" name="password" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH} className={INPUT} />
        </label>
        {error ? (
          <p role="alert" className="rounded-md border border-destructive/40 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          className="h-10 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Create account
        </button>
        <a href="/login" className="rounded-sm text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
          Already have an account? Sign in
        </a>
      </form>
    </div>
  );
}
