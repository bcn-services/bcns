import Link from "next/link";
import { requestPasswordReset, signInWithPassword } from "./actions";

type Q = { error?: string; email?: string; mode?: string; sent?: string };

const messages = (email: string): Record<string, string> => ({
  unconfigured: "HQ is not configured",
  invalid: `wrong password for ${email}`,
  "no-profile": `no HQ account for ${email}`,
  failed: "Something went wrong. Try again.",
  expired: "That reset link has expired. Ask for a new one.",
});

export default function LoginPage({ searchParams }: { searchParams: Q }) {
  const email = (searchParams.email ?? "").slice(0, 254);
  const error = searchParams.error
    ? (messages(email)[searchParams.error] ?? messages(email).failed)
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
              If {email} has an HQ account, a reset link is on its way.
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
