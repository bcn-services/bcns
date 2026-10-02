import { redirect } from "next/navigation";
import { createServerSupabase } from "@bcn-services/tenant";
import { MIN_PASSWORD_LENGTH, setPasswordGuard } from "@/lib/auth-link";
import { setPassword } from "./actions";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  mismatch: "Those passwords don't match.",
  short: `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
  weak: "That password is too common or has appeared in a data breach. Choose a longer, less guessable one.",
  failed: "Couldn't save that password. Try a different one, or request a new link from the sign-in page.",
};

export default async function SetPasswordPage({ searchParams }: { searchParams: { error?: string } }) {
  const denied = await setPasswordGuard(createServerSupabase());
  if (denied) redirect(denied);
  const error = searchParams.error ? (ERRORS[searchParams.error] ?? ERRORS.failed) : null;
  return (
    <div className="lg">
      <div className="lcard-wrap">
        <div className="lcard">
          <div className="wm">
            <span className="wm-mark" aria-hidden="true" />
            <span>
              bcns <b>Connect</b>
            </span>
          </div>
          <span className="flow" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            <i />
          </span>
          <h1>
            Set your <b>password</b>
          </h1>
          <p className="d">Choose a password for your bcns account.</p>
          <form action={setPassword}>
            <label className="field" htmlFor="password">
              New password
              <span className="hint">At least {MIN_PASSWORD_LENGTH} characters.</span>
              <input id="password" name="password" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH} />
            </label>
            <label className="field" htmlFor="confirm">
              Confirm password
              <input id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH} />
            </label>
            {error ? (
              <p role="alert" className="note note-alert">
                {error}
              </p>
            ) : null}
            <button type="submit" className="btn">
              Save password
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
