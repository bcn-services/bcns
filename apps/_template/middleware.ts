/**
 * middleware.ts — shared-platform mode is the only mode: every request gets
 * its session refreshed and pinned to this app's client via
 * `@bcn-services/tenant`. Env is read inside the handler (not at module top
 * level) so edge bundling never inlines a build-time value.
 */

import type { NextRequest } from "next/server";
import { tenantMiddleware } from "@bcn-services/tenant/middleware";

export const middleware = (req: NextRequest) =>
  tenantMiddleware({ expectedClientId: process.env.EXPECTED_CLIENT_ID })(req);

// Next.js statically extracts `config.matcher` at build time and can't follow
// an imported identifier, so this literal must mirror
// `TENANT_MATCHER` in packages/tenant/src/middleware.ts.
// ponytail: duplicated literal, not a shared const — Next's static analyzer
// requires it inline; upgrade if Next ever supports resolving imports here.
export const config = { matcher: ["/((?!api/health$|_next/static|_next/image|favicon.ico).*)"] };
