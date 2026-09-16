import { Card, CardContent, CardDescription, CardHeader, CardTitle, SectionHeading } from "@bcn-services/ui";
import { requireOwner } from "@/lib/session";
import { MintForm } from "./MintForm";

export const dynamic = "force-dynamic";

/** Owner-only: `requireOwner` bounces a member back to Sources with an error. */
export default async function AccessPage() {
  await requireOwner("/");

  return (
    <>
      <SectionHeading
        as="h1"
        align="left"
        title="Access"
        description="Give your own software — or an AI agent — a login of its own."
      />

      <Card>
        <CardHeader>
          <CardTitle>Agent login</CardTitle>
          <CardDescription>What it is, and what it can reach</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <p className="text-sm text-muted-foreground">
            An agent login is an ordinary member account for this workspace that belongs to a
            program instead of a person. It signs in with an email and password like anyone else and
            sees exactly the same data you do, scoped by the same rules — no more, and never another
            client&apos;s. Hand it to a script, a reporting job, or an AI assistant so it can read
            your workspace without anybody sharing a personal password. Minting again rotates the
            password; the old password stops working.
          </p>
          <MintForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>MCP server</CardTitle>
          <CardDescription>Coming soon</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            The hosted MCP server at{" "}
            <code className="font-mono">mcp.bcn-services.com</code> will let Claude and other agent
            products connect to this workspace with the agent login above. It isn&apos;t live yet.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
