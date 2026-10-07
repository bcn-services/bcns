// Deno entry point. All policy lives in handler.ts; all wiring in _shared/deps.ts.
// Deployed with --no-verify-jwt: the Stripe signature is the only auth (see handler.ts).
import { handle } from "./handler.ts";
import { stripeWebhookDeps } from "../_shared/deps.ts";

Deno.serve((request: Request) => handle(request, Deno.env.get("STRIPE_WEBHOOK_SECRET"), stripeWebhookDeps()));
