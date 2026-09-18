# Chunk 5 — Drive scope finding

Checked 2026-09-17. Answers both questions from the Drive/CASA research task
(`docs/architecture/platform-v1.md` line 119: "Restricted Drive scope
verification is its own project").

## Q1 — does `drive.file` + Picker folder-pick cover files added later?

**No.** Picking a folder under `drive.file` does not grant ongoing access to
files added to that folder afterward — only to files the user has explicitly
picked (or created/opened through the app).

No single official Google page states this exact scenario in one sentence —
I checked and none of the following do:
- [Choose Google Drive API scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth) — defines `drive.file` as: "Create new Drive files, or modify existing files, that you open with an app or that the user shares with an app while using the Google Picker API or the app's file picker." Per-file grant language, no folder-inheritance clause.
- [Overview of the Google Picker](https://developers.google.com/workspace/drive/picker/guides/overview) — confirms `drive.file` is the *only* scope allowed in the desktop/mobile Picker flow and "cannot be combined with other scopes," consistent with it being a narrow, per-file scope rather than a folder-subtree grant.
- [Display the Google Picker](https://developers.google.com/workspace/drive/api/guides/picker) and [Select Google Drive files and folders with Google Picker](https://developers.google.com/workspace/add-ons/studio/drive-picker) — describe folder *views* for browsing/selecting, not what access is granted afterward.

The "no" conclusion rests on: (a) `drive.file`'s definition is inherently
per-file, not per-container, and (b) converging independent practitioner
reports (Google Apps Script community threads, Stack Overflow) all describe
the same behavior — selecting a folder returns its ID, but the app has no
standing grant over files placed in it later; listing the folder's children
still 403s unless each child was separately picked/opened. This is also *why*
`drive.file` avoids CASA: a scope that silently expanded to a whole folder
subtree would be sensitive/restricted, not the "non-sensitive, no security
assessment" scope Google documents it as.

**Conclusion for our use case:** this does not give us a path off the
Internal-app model. Our indexer needs unattended, ongoing access to a folder
whose contents change over time with no user in the loop — `drive.file`
cannot do that regardless of Picker UX. Stopping here per the task's
guardrail; no `drive.ts` or connect-flow sketch follows.

## Q2 — current CASA tiers and cost (checked 2026-09-17)

Google's own restricted-scope page doesn't publish tiers or pricing itself —
it defers to the App Defense Alliance:
- [Restricted scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification) — "we use the App Defense Alliance and the cloud application security assessment framework (CASA)," no tier/price detail.

The ADA's own framework page confirms the model changed from named "Tiers" to
**Assurance Levels**, with only two levels now, both third-party lab
assessments (no free self-assessment tier remains):
- [CASA Assurance Levels](https://appdefensealliance.dev/casa/casa-tiering) (page itself dated "Last updated 2026-06-27 UTC"):
  - **AL1** — "Lab Tested - Lab Verified." Contact an ADA-authorized lab.
  - **AL2** — "Lab Tested - Lab Verified," more comprehensive: tests the app, its deployment infra, and any user-data storage location against every CASA requirement.
  - Google (the "framework user"), not the developer, decides which level an app must meet, based on data sensitivity/user count/risk tolerance.
  - Revalidation required every 12 months.
  - **No pricing published on this page or anywhere else on appdefensealliance.dev** — `/casa/casa-accelerator` exists (lets an assessor shortcut re-checks for existing certifications) but also has no prices; `/casa/authorized-assessors`, `/casa/overview`, `/casa/requirements` 404 under that path structure.

Since Google/ADA don't price it, actual cost is set per authorized assessor.
One current, named, live example — TAC Security, an ADA-authorized CASA
assessor — as of 2026-09-17:
- [TAC Security — Google CASA pricing](https://tacsecurity.com/google-casa-cloud-application-security-assessment/):
  - **AL1 Basic** — $675 one-time (2 cycle revalidations included)
  - **AL1 Premium** — $855 one-time (unlimited revalidation)
  - **AL1 Enterprise** — $4,500 (unlimited assessments/revalidation, dedicated account manager)
  - **AL2 Enterprise** — $5,400 (unlimited revalidation, dedicated account manager)
  - Add-on SOC 2 Type I bundles exist at the same or a small markup on the Enterprise tiers.

Treat the TAC figures as one assessor's rate card, not a Google-set price —
other ADA-authorized labs may price differently, and this is a paid annual
recurring cost either way (12-month revalidation cycle) regardless of which
lab is used.

## Bottom line

Internal-app path stays the only option for the content-library indexer.
Any move to onboard clients without their own Workspace still requires an
External app on `drive.readonly` (or broader), which still requires AL1 or
AL2 CASA — a real, recurring, paid line item (roughly $700–$5,400+/yr per the
one rate card checked), not a one-time fee. Not scheduled for v1.
