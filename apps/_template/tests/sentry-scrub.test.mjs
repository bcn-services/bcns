import test from "node:test";
import assert from "node:assert/strict";
import { scrubEvent } from "../lib/sentry-scrub.ts";

test("scrubEvent drops request, user and request_path", () => {
  const event = {
    message: "boom",
    request: {
      url: "https://x/api/oauth/y?code=OAUTHCODE",
      headers: { authorization: "Bearer SECRET", cookie: "sb-a-auth-token=SECRET" },
      cookies: { "sb-a-auth-token": "SECRET" },
      query_string: "code=OAUTHCODE",
    },
    user: { ip_address: "1.2.3.4" },
    contexts: { nextjs: { request_path: "/api/oauth/y?code=OAUTHCODE", route_type: "route" } },
  };
  const out = scrubEvent(event);
  assert.equal(out.message, "boom");
  assert.ok(!JSON.stringify(out).includes("SECRET"));
  assert.ok(!JSON.stringify(out).includes("OAUTHCODE"));
  assert.equal(out.contexts.nextjs.route_type, "route");
});
