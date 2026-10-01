import { redirect } from "next/navigation";
import { SectionHeading } from "@bcn-services/ui";
import { currentMembership } from "@/lib/session";
import { signOut } from "../login/actions";

export const dynamic = "force-dynamic";

/**
 * The only page a pending sign-up can reach (the tenant middleware's pendingPath). Once bcns
 * activates the workspace the next token carries a membership, and this page sends it home.
 */
export default async function PendingPage() {
  if (await currentMembership()) redirect("/");
  return (
    <div className="mx-auto w-full max-w-sm">
      <SectionHeading
        as="h1"
        align="left"
        title="Your workspace is pending"
        description="Thanks for signing up. bcns reviews every new workspace before it opens; bcns will be in touch when yours is ready. Then sign in again to get started."
      />
      <form action={signOut} className="mt-8">
        <button
          type="submit"
          className="h-10 rounded-md border border-input px-5 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
