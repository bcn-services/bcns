import { redirect } from "next/navigation";
import { SectionHeading } from "@bcn-services/ui";
import { createServerSupabase } from "@bcn-services/tenant";
import { MIN_PASSWORD_LENGTH, setPasswordGuard } from "@/lib/auth-link";
import { setPassword } from "./actions";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  mismatch: "Those passwords don't match.",
  short: `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
  failed: "Couldn't save that password. Try a different one, or request a new link from the sign-in page.",
};

const INPUT =
  "h-10 rounded-md border border-input bg-background px-3 text-sm font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export default async function SetPasswordPage({ searchParams }: { searchParams: { error?: string } }) {
  const denied = await setPasswordGuard(createServerSupabase());
  if (denied) redirect(denied);
  const error = searchParams.error ? (ERRORS[searchParams.error] ?? ERRORS.failed) : null;
  return (
    <div className="mx-auto w-full max-w-sm">
      <SectionHeading as="h1" align="left" title="Set your password" description="Choose a password for your bcns account." />
      <form action={setPassword} className="mt-8 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm font-medium" htmlFor="password">
          New password
          <span className="text-xs font-normal text-muted-foreground">At least {MIN_PASSWORD_LENGTH} characters.</span>
          <input id="password" name="password" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH} className={INPUT} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium" htmlFor="confirm">
          Confirm password
          <input id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH} className={INPUT} />
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
          Save password
        </button>
      </form>
    </div>
  );
}
