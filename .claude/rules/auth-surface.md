---
paths:
  - "platform/supabase/functions/**/*.ts"
  - "apps/connect/app/signup/**"
  - "apps/connect/app/auth/**"
  - "apps/connect/lib/signup.ts"
---

# Public auth surface

- A public Edge Function (`--no-verify-jwt`, e.g. `platform/supabase/functions/signup`) needs its own secret gate. A hub env switch does not keep it dark.
- GoTrue checks duplicate addresses before password strength. Answering 400 on `weak_password` leaks whether an address already exists.
- A notice keyed on `verifyOtp type=email` needs an `email_confirmed_at` freshness check.
- The "Confirm signup" email template must link `token_hash` with `type=email` so it reaches `/auth/confirm` (`apps/connect/app/auth/confirm/route.ts`).
