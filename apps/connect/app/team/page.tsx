import { Badge, Button, Card, CardContent, CardHeader, CardTitle, SectionHeading } from "@bcn-services/ui";
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
      <SectionHeading
        as="h1"
        align="left"
        title="Team"
        description={
          isOwner
            ? "Everyone who can sign in to this workspace. Owners can invite and remove."
            : "Everyone who can sign in to this workspace. Ask an owner to make changes."
        }
      />

      {searchParams.ok && MESSAGES[searchParams.ok] ? (
        <p role="status" className="rounded-md border border-primary/40 bg-primary/10 px-4 py-3 text-sm text-primary">
          {MESSAGES[searchParams.ok]}
        </p>
      ) : null}
      {searchParams.error ? (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {ERRORS[searchParams.error] ?? ERRORS.failed}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col divide-y divide-border">
          {members.length === 0 ? (
            <p className="text-sm text-muted-foreground">No members yet.</p>
          ) : null}
          {members.map((member) => (
            <div key={member.user_id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0">
              {/* memberships_v1 carries no email — auth.users is not exposed to members. */}
              <code className="font-mono text-sm">{member.user_id.slice(0, 8)}</code>
              <Badge className="border-border bg-muted text-muted-foreground">{member.role}</Badge>
              {member.is_smoke ? (
                <Badge className="border-border bg-muted text-muted-foreground">health check</Badge>
              ) : null}
              {member.user_id === membership.userId ? (
                <span className="text-sm text-muted-foreground">you</span>
              ) : null}
              {isOwner && !member.is_smoke && member.user_id !== membership.userId ? (
                <form action={removeMember} className="ml-auto">
                  <input type="hidden" name="user_id" value={member.user_id} />
                  <Button type="submit" variant="outline" size="sm">
                    Remove
                  </Button>
                </form>
              ) : null}
            </div>
          ))}
        </CardContent>
      </Card>

      {isOwner ? (
        <Card>
          <CardHeader>
            <CardTitle>Invite someone</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={inviteMember} className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1.5 text-sm font-medium" htmlFor="invite-email">
                Email
                <input
                  id="invite-email"
                  name="email"
                  type="email"
                  required
                  className="h-10 w-72 max-w-full rounded-md border border-input bg-background px-3 text-sm font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </label>
              <Button type="submit">Send invite</Button>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
