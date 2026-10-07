## VERDICT: PASS
Branch: feat/hub-first-run (head 950f130, no test additions needed, nothing committed by QA)
Gate mode: tests+behavioral (signed-in render NOT possible, see Not Verifiable)

## Criteria Checked
- Checklist (source -> first sync -> invite team -> connect AI), real state, self-ticking, hides when all done, owner-only: first-run.test.mjs 12 tests + 6 mutations all RED on the intended test -- PASS
- /access Claude steps + ChatGPT labelled "Not yet hand-verified" + copy button + 3-5 questions per connected source: source read of app/access/page.tsx, CopyUrl, test "3 to 5 each" -- PASS (no visual check)
- Tests wired, count above 314: package.json list ends in tests/first-run.test.mjs; connect test 326 pass / 0 fail (+12); probe-inject (throwing test appended) -> 327 tests / 326 pass / 1 fail, restored byte-identical -- PASS
- Design match: pure logic lib/first-run.ts; api.ai_last_used_at() migration 20261007000300 (max mcp_tool_calls.at for tenant_or_raise, authenticated-only grant); readAiLastUsed returns null on error/throw/non-string; sync ticks only on parseable last_success_at for a HUB_SOURCES row; team = non-smoke, not viewer; hidden when allDone; owner-only -- PASS
- Untouched: git diff da54d22 --stat shows no layout.tsx, app/pending/*, lib/data-views.ts, platform/worker/src/connectors/* -- PASS

## Gates
- connect test 326/326/0; typecheck clean; lint clean; build ok (/ and /access compile, /access 486 B)
- platform test 15 files / 146 / 0 fail (DB-backed skipped locally; new mcp-audit ai_last_used_at cases NOT run here, CI runs them)
- mcp test 272/272/0, tsc clean (data-client changed)

## Mutations (each: cp backup, one condition rewritten, RED, restored, shasum identical, git status clean)
- M1 (required) sync step drops the last_success_at check -> RED: "first sync: needs a non-null last_success_at, not just a row" (expected false, actual true)
- M2 (required) starterQuestions drops .filter(connected) -> RED: "starter questions: none when nothing is connected" + "only connected sources, in hub order, 3 to 5 each"
- Extra, all RED on the matching test, all guarded: smoke member counted (#82 invite team); viewer counted (#79, #82); `&& !allDone` removed (#84 all four done hides); owner-only check removed (#85 members never see); ai step ticks without timestamp (#79, #83, #84); source step ignores connected (#79, #80)
- Probe-inject confirms first-run.test.mjs runs (tests 326 -> 327, fail 0 -> 1)

## Starter questions vs data (cross-checked apps/mcp/src/policy.ts + worker connectors)
- shopify: orders/refund/payout in money_v1, stock in products_v1.inventory_quantity; no best-sellers (line items excluded) -- OK
- meta: spend/clicks per campaign/ad in daily_metrics -- OK; monday: jobs_v1 status/owner/priority/due_on/is_done -- OK
- meet: messages_v1 meeting_note title/body -- OK; drive: media_v1 kind image/video, filename, created_at -- OK
- quickbooks: records_v1 qbo_expense, vendor/account in attributes (attributes kept on records_v1) -- OK
- Jargon: no "MCP/OAuth/sync cursor" in new client-facing copy. Only "mcp" strings are the address URL and the pre-existing Claude Code terminal block ("claude mcp add", "/mcp"), untouched by this item.
- ChatGPT block: visible `.tag` "Not yet hand-verified" plus a sentence saying it is unverified. Copy button: URL is a plain <pre> (user-select: all), button failure shows "Couldn't copy..." text; clipboard error is try/caught.

## Behavioral (dev server on 3123, killed, port confirmed free)
- GET / -> 307 /login?error=unconfigured; GET /access -> 307 /login?error=unconfigured; GET /login -> 200. Redirect only (no env configured); this is NOT a visual check.
- Structural: pages pass firstRun()/starterQuestions() output straight into JSX; copy-url.tsx starts with "use client" and compiled in `next build`; css classes .fr-list/.steps/.tag/.copyurl/.qs exist in globals.css.

## Not Verifiable
- Signed-in render of / and /access, the copy click, tick states against live data (no Supabase stack, no env). Interpretation tested: lib outputs + test suite + build compile.
- Claude/ChatGPT click-through steps match the live claude.ai/ChatGPT UIs: not hand-checked by anyone (ChatGPT labelled as such).
- api.ai_last_used_at() against a real DB: platform DB tests skipped locally; migration not pushed (Nate runs db push; until then step 4 reads not-done by design).

## Notes (non-blocking)
- `sr-only` relies on Tailwind class generation; build passed but unrendered.
