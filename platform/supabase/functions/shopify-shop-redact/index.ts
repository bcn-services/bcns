// Deno entry point. All policy lives in handler.ts; all wiring in _shared/deps.ts.
// Deployed with --no-verify-jwt: HMAC is the only auth (see handler.ts).
import { handle } from "./handler.ts";
import { shopRedactDeps } from "../_shared/deps.ts";

Deno.serve((request: Request) => handle(request, Deno.env.get("SHOPIFY_CLIENT_SECRET"), shopRedactDeps()));
