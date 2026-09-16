import { signIn } from "./actions";

const ERRORS: Record<string, string> = {
  invalid: "Sign-in failed. Check your email and password.",
  unconfigured: "Sign-in is not configured for this app yet.",
  "no-membership": "Your account isn't a member of this workspace. Ask your admin for an invite.",
  "wrong-client": "That account belongs to a different workspace. Sign in with this workspace's account.",
  misconfigured: "This app is not finished being set up. Contact bcns support.",
};

export default function LoginPage({ searchParams }: { searchParams: { error?: string } }) {
  const error = searchParams.error ? (ERRORS[searchParams.error] ?? ERRORS.invalid) : null;
  return (
    <main>
      <h1>Sign in</h1>
      <form action={signIn}>
        <p>
          <label htmlFor="email">Email</label>
          <br />
          <input id="email" name="email" type="email" autoComplete="email" required />
        </p>
        <p>
          <label htmlFor="password">Password</label>
          <br />
          <input id="password" name="password" type="password" autoComplete="current-password" required />
        </p>
        {error ? <p role="alert">{error}</p> : null}
        <button type="submit">Sign in</button>
      </form>
    </main>
  );
}
