/**
 * /api/oauth/meta/data-deletion — Meta's Data Deletion Request Callback.
 *
 * POST (form-encoded `signed_request`, server-to-server, no cookie): verify the
 * signature with META_CLIENT_SECRET, then answer `{url, confirmation_code}`.
 *
 * Deletion itself: connect_source writes source_tokens.attributes = '{}', so no
 * row anywhere maps a Meta user id to a tenant. There is nothing to look up and
 * nothing this route can safely delete; it records the request (log line + email to
 * bcns; the log is the durable copy if the email fails) and a human matches it by hand. Same
 * notify-a-human posture as the Shopify GDPR webhooks.
 *
 * GET: the status page the returned `url` points to.
 */

import { NextResponse } from "next/server";
import { getConfig } from "@/lib/env";
import { BCNS_EMAIL, REQUEST_FROM, sendMail } from "@/lib/request-connection";
import { confirmationCode, verifySignedRequest } from "@/lib/meta-oauth";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  const config = getConfig();
  // No approval gate: Meta calls this during app review, before the source is live.
  if (!config.metaClientSecret) {
    console.warn("[connect] meta data-deletion rejected: no META_CLIENT_SECRET");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  const result = verifySignedRequest(form?.get("signed_request"), config.metaClientSecret);
  if (!result.ok) {
    console.warn(`[connect] meta data-deletion rejected: ${result.reason}`);
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const code = confirmationCode(result.userId, config.metaClientSecret);
  console.log(`[connect] meta data-deletion request recorded (meta user ${result.userId}, code ${code}); no schema mapping, manual follow-up`);
  await sendMail(
    {
      from: REQUEST_FROM,
      to: [BCNS_EMAIL],
      subject: "Meta data deletion request",
      text: [
        `Meta user id: ${result.userId}`,
        `Confirmation code: ${code}`,
        "",
        "No table maps a Meta user id to a client (source_tokens.attributes is empty),",
        "so nothing was deleted automatically. Match the user to a client by hand and",
        "run the disconnect + erase for their Meta rows.",
      ].join("\n"),
    },
    "meta data-deletion",
    { apiKey: config.resendApiKey }
  );

  return NextResponse.json({
    url: `${config.hubBaseUrl}/api/oauth/meta/data-deletion?code=${code}`,
    confirmation_code: code,
  });
}

export function GET(): NextResponse {
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><title>Data deletion request</title>` +
      `<p>Your Meta data deletion request was received. bcns will erase any data linked to your Meta account and confirm by email if you contact ${BCNS_EMAIL}.</p>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
