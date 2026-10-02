import { notFound } from "next/navigation";
import { getConfig } from "@/lib/env";
import { signUp } from "./actions";
import { Frame } from "../login/frame";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  invalid: "Check the business name and email, then try again.",
  unconfigured: "Sign-up is not configured for this app yet.",
  failed: "Something went wrong creating your account. Please try again in a few minutes.",
};

export default function SignupPage({ searchParams }: { searchParams: { error?: string; ok?: string } }) {
  if (!getConfig().signupEnabled) notFound();
  if (searchParams.ok === "check-email") {
    return (
      <Frame
        title="Check your email"
        description="If that address can be signed up, we've sent a link to confirm it and choose your password. Once confirmed, bcns reviews new workspaces before they open."
      >
        <a href="/login" className="lnk">
          Back to sign in
        </a>
      </Frame>
    );
  }
  const error = searchParams.error ? (ERRORS[searchParams.error] ?? ERRORS.failed) : null;
  return (
    <Frame
      title={
        <>
          Create <b>account</b>
        </>
      }
      description="Start a bcns Connect workspace for your business."
    >
      <form action={signUp}>
        <label className="field" htmlFor="name">
          Business name
          <input id="name" name="name" type="text" autoComplete="organization" required maxLength={100} />
        </label>
        <label className="field" htmlFor="email">
          Email
          <input id="email" name="email" type="email" autoComplete="email" required />
        </label>
        {error ? (
          <p role="alert" className="note note-alert">
            {error}
          </p>
        ) : null}
        <button type="submit" className="btn">
          Create account
        </button>
        <a href="/login" className="lnk">
          Already have an account? Sign in
        </a>
      </form>
    </Frame>
  );
}
