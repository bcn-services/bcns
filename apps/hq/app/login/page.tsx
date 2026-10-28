import Link from "next/link";
import { requestPasswordReset, setNewPassword, signInWithPassword } from "./actions";

type Q = { error?: string; email?: string; mode?: string; code?: string; sent?: string };

const messages = (email: string): Record<string, string> => ({
  unconfigured: "HQ is not configured",
  invalid: `wrong password for ${email}`,
  "no-profile": `no HQ account for ${email}`,
  failed: "Something went wrong. Try again.",
  weak: "Use at least 8 characters.",
  mismatch: "The two passwords do not match.",
  expired: "That reset link has expired. Ask for a new one.",
});

export default function LoginPage({ searchParams }: { searchParams: Q }) {
  const email = (searchParams.email ?? "").slice(0, 254);
  const error = searchParams.error ? (messages(email)[searchParams.error] ?? messages(email).failed) : null;
  const mode = searchParams.mode === "forgot" || (searchParams.mode === "reset" && searchParams.code) ? searchParams.mode : "in";
  return (
    <main className="login">
      <div className="logo">
        <i>H</i> HQ
      </div>
      {mode === "reset" ? (
        <form action={setNewPassword} className="card loginform">
          <input type="hidden" name="code" value={searchParams.code} />
          <label htmlFor="password">New password</label>
          <input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
          <label htmlFor="confirm">Confirm</label>
          <input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
          {error ? <p role="alert" className="chip bad">{error}</p> : null}
          <button type="submit" className="btn pri">Set password</button>
        </form>
      ) : mode === "forgot" ? (
        <form action={requestPasswordReset} className="card loginform">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" defaultValue={email} required />
          {error ? <p role="alert" className="chip bad">{error}</p> : null}
          {searchParams.sent ? (
            <p role="status" className="chip ok">If {email} has an HQ account, a reset link is on its way.</p>
          ) : null}
          <button type="submit" className="btn pri">Send reset link</button>
          <Link href="/login" className="loginlink">Back to sign in</Link>
        </form>
      ) : (
        <form action={signInWithPassword} className="card loginform">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" defaultValue={email} required />
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required />
          {error ? <p role="alert" className="chip bad">{error}</p> : null}
          <button type="submit" className="btn pri">Sign in</button>
          <Link href="/login?mode=forgot" className="loginlink">Forgot password?</Link>
        </form>
      )}
    </main>
  );
}
