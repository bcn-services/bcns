import Link from "next/link";
import { setNewPassword } from "./actions";

const messages: Record<string, string> = {
  weak: "Use at least 8 characters.",
  mismatch: "The two passwords do not match.",
};

/** The emailed reset link lands here with ?code=. Public (gate.PUBLIC_PATHS): the code is the credential. */
export default function ResetPage({
  searchParams,
}: {
  searchParams: { code?: string; error?: string };
}) {
  const error = searchParams.error
    ? (messages[searchParams.error] ?? "Something went wrong. Try again.")
    : null;
  return (
    <main className="login">
      <div className="logo">
        <i>H</i> HQ
      </div>
      {searchParams.code ? (
        <form action={setNewPassword} className="card loginform">
          <input type="hidden" name="code" value={searchParams.code} />
          <label htmlFor="password">New password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
          <label htmlFor="confirm">Confirm</label>
          <input
            id="confirm"
            name="confirm"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
          {error ? (
            <p role="alert" className="chip bad">
              {error}
            </p>
          ) : null}
          <button type="submit" className="btn pri">
            Set password
          </button>
        </form>
      ) : (
        <div className="card loginform">
          <p role="alert" className="chip bad">
            That reset link is missing its code. Ask for a new one.
          </p>
          <Link href="/login?mode=forgot" className="loginlink">
            Send a new reset link
          </Link>
        </div>
      )}
    </main>
  );
}
