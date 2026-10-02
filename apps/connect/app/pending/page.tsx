import { redirect } from "next/navigation";
import { currentMembership } from "@/lib/session";
import { signOut } from "../login/actions";
import { Frame } from "../login/frame";

export const dynamic = "force-dynamic";

/**
 * The only page a pending sign-up can reach (the tenant middleware's pendingPath). Once bcns
 * activates the workspace the next token carries a membership, and this page sends it home.
 */
export default async function PendingPage() {
  if (await currentMembership()) redirect("/");
  return (
    <Frame
      title={
        <>
          Your workspace is <b>pending</b>
        </>
      }
      description="Thanks for signing up. bcns reviews every new workspace before it opens; bcns will be in touch when yours is ready. Then sign in again to get started."
    >
      <form action={signOut}>
        <button type="submit" className="btn btn-out">
          Sign out
        </button>
      </form>
    </Frame>
  );
}
