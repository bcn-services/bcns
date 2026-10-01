// Deno entry point. All policy lives in handler.ts; all wiring in _shared/deps.ts.
// Deployed with --no-verify-jwt: a visitor signing up has no JWT (see handler.ts).
import { handle } from "./handler.ts";
import { signupDeps } from "../_shared/deps.ts";

Deno.serve((request: Request) => handle(request, signupDeps()));
