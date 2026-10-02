import { requireHub } from "@/lib/session";
import { inviteMember, removeMember } from "./actions";

export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  invited: "Invite sent. They'll get an email with a link to set a password.",
  removed: "Member removed.",
};

const ERRORS: Record<string, string> = {
  forbidden: "Only an owner can change the team.",
  "invalid-email": "That doesn't look like an email address.",
  self: "You can't remove your own access.",
  smoke: "That's the automated health-check login; it can't be removed here.",
  "not-found": "That member is already gone.",
  unconfigured: "Team management isn't configured for this app yet.",
  failed: "That didn't work. Try again, or email bcns.",
};

interface MemberRow {
  user_id: string;
  role: string;
  is_smoke: boolean;
  created_at: string | null;
}

export default async function TeamPage({
  searchParams,
}: {
  searchParams: { ok?: string; error?: string };
}) {
  const { api, membership } = await requireHub();
  const isOwner = membership.role === "owner";

  const { data } = await api
    .from("memberships_v1")
    .select("user_id,role,is_smoke,created_at")
    .order("created_at", { ascending: true });
  const members = ((data as MemberRow[] | null) ?? []).filter((m) => !m.is_smoke || isOwner);

  return (
    <>
      <div>
        <h1 className="page-title">
          <b>Team</b>
        </h1>
        <p className="lead">
          {isOwner
            ? "Everyone who can sign in to this workspace. Owners can invite and remove."
            : "Everyone who can sign in to this workspace. Ask an owner to make changes."}
        </p>
      </div>

      {searchParams.ok && MESSAGES[searchParams.ok] ? (
        <p role="status" className="note">
          {MESSAGES[searchParams.ok]}
        </p>
      ) : null}
      {searchParams.error ? (
        <p role="alert" className="note note-alert">
          {ERRORS[searchParams.error] ?? ERRORS.failed}
        </p>
      ) : null}

      <section className="panel" aria-labelledby="members-h">
        <h2 id="members-h">Members</h2>
        <div className="mlist">
          {members.length === 0 ? <p className="sub">No members yet.</p> : null}
          {members.map((member) => (
            <div key={member.user_id} className="mem">
              {/* memberships_v1 carries no email — auth.users is not exposed to members. */}
              <code>{member.user_id.slice(0, 8)}</code>
              <span className={member.user_id === membership.userId ? "chip chip-own" : "chip"}>{member.role}</span>
              {member.is_smoke ? <span className="chip">health check</span> : null}
              {member.user_id === membership.userId ? <span className="you">you</span> : null}
              {isOwner && !member.is_smoke && member.user_id !== membership.userId ? (
                <form action={removeMember}>
                  <input type="hidden" name="user_id" value={member.user_id} />
                  <button type="submit" className="btn btn-out btn-sm">
                    Remove
                  </button>
                </form>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      {isOwner ? (
        <section className="panel" aria-labelledby="invite-h">
          <h2 id="invite-h">Invite someone</h2>
          <form action={inviteMember} className="inv">
            <label className="field" htmlFor="invite-email">
              Email
              <input id="invite-email" name="email" type="email" required />
            </label>
            <button type="submit" className="btn">
              Send invite
            </button>
          </form>
        </section>
      ) : null}
    </>
  );
}
