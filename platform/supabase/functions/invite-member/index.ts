// Deno entry point. All policy lives in handler.ts; all wiring in _shared/deps.ts.
import { handle } from "./handler.ts";
import { inviteDeps } from "../_shared/deps.ts";

Deno.serve((request: Request) => handle(request, inviteDeps(request)));
