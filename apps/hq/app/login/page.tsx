import { signInWithPassword } from "./actions";

const ERRORS: Record<string, string> = {
  invalid: "Sign-in failed. Check your email and password.",
  unconfigured: "Sign-in is not configured for this app yet.",
  "no-profile": "That account is not set up for HQ.",
};

export default function LoginPage({ searchParams }: { searchParams: { error?: string } }) {
  const error = searchParams.error ? (ERRORS[searchParams.error] ?? ERRORS.invalid) : null;
  return (
    <main className="login">
      <div className="logo">
        <i>H</i> HQ
      </div>
      <form action={signInWithPassword} className="card loginform">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required />
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
        {error ? <p role="alert" className="chip bad">{error}</p> : null}
        <button type="submit" className="btn pri">Sign in</button>
      </form>
    </main>
  );
}
