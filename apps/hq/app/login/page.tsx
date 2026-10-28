import Link from "next/link";
import { requestPasswordReset, signInWithPassword } from "./actions";

type Q = { error?: string; email?: string; mode?: string; sent?: string };

const messages = (email: string): Record<string, string> => ({
  unconfigured: "HQ is not configured",
  invalid: `wrong password for ${email}`,
  "no-profile": `no HQ account for ${email}`,
  rate: `too many tries for ${email}, wait a minute`,
  failed: "Something went wrong. Try again.",
  expired:
    "That reset link has expired. Ask for a new one, and open the link in the same browser you request it from.",
});

export default function LoginPage({ searchParams }: { searchParams: Q }) {
  // the query string is anyone's: only a plain address is echoed into the message, anything else is dropped
  const raw = (searchParams.email ?? "").trim();
  const email = raw.length <= 254 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(raw) ? raw : "";
  const who = email || "that email";
  const error = searchParams.error
    ? (messages(who)[searchParams.error] ?? messages(who).failed)
    : null;
  const mode = searchParams.mode === "forgot" ? "forgot" : "in";
  return (
    <main className="login">
      <div className="logo">
        <i>H</i> HQ
      </div>
      {mode === "forgot" ? (
        <form action={requestPasswordReset} className="card loginform">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            defaultValue={email}
            required
          />
          {error ? (
            <p role="alert" className="chip bad">
              {error}
            </p>
          ) : null}
          {searchParams.sent ? (
            <p role="status" className="chip ok">
              If {who} has an HQ account, a reset link is on its way.
            </p>
          ) : null}
          <button type="submit" className="btn pri">
            Send reset link
          </button>
          <Link href="/login" className="loginlink">
            Back to sign in
          </Link>
        </form>
      ) : (
        <form action={signInWithPassword} className="card loginform">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            defaultValue={email}
            required
          />
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
          {error ? (
            <p role="alert" className="chip bad">
              {error}
            </p>
          ) : null}
          <button type="submit" className="btn pri">
            Sign in
          </button>
          <Link href="/login?mode=forgot" className="loginlink">
            Forgot password?
          </Link>
        </form>
      )}
    </main>
  );
}
