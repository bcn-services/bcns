# Google OAuth Scope Tiers — Research Findings (as of 2026-09-17)

Sources are Google's live "OAuth App Verification Help Center" (support.google.com/cloud/answer/13463073 and its sub-pages) and the "Google Auth Platform" help section. Every claim below is cited with the exact page and, where useful, an exact quote. Anything I could not confirm from an official page is marked **UNCONFIRMED**.

Note on doc structure: the old standalone "OAuth API Verification FAQ" at `support.google.com/cloud/answer/9110914` now 302-redirects to the "OAuth App Verification Help Center" hub at `support.google.com/cloud/answer/13463073`. That hub's own table of contents ("Support 1 of 10" … "10 of 10") lists these sub-pages, which are the ones cited throughout:
1. OAuth App Verification Help Center — https://support.google.com/cloud/answer/13463073
2. Submitting your app for verification — https://support.google.com/cloud/answer/13461325
3. Verification requirements — https://support.google.com/cloud/answer/13464321
4. When is verification not needed — https://support.google.com/cloud/answer/13464323
5. Security Assessment — https://support.google.com/cloud/answer/13465431
6. Annual Recertification — https://support.google.com/cloud/answer/13463816
7. Changes to approved app — https://support.google.com/cloud/answer/13464018
8. Restricted Scopes — https://support.google.com/cloud/answer/13464325
9. Frequently Asked Questions — https://support.google.com/cloud/answer/13463817
10. Quick Reference Guides — (linked from the hub, not fetched for this research)

Also used: "Manage App Data Access" — https://support.google.com/cloud/answer/15549135 (part of the separate "Google Auth Platform" help section).

---

## 1. Scope classification as of today

**Official three-tier definitions**, quoted verbatim from "Manage App Data Access" (https://support.google.com/cloud/answer/15549135):

> "Non-Sensitive - These scopes relate to access to specific read-only data."
> "Sensitive - Sensitive scopes are scopes that request access to private user data."
> "Restricted - Restricted scopes are scopes that request access to highly sensitive user data. For example, user's email data."

That same page states the only place to see the full scope list is https://developers.google.com/identity/protocols/oauth2/scopes — but I fetched that page's raw HTML directly and it does **not** carry a sensitive/restricted tag next to each scope in static markup; tier tagging is applied live inside the Cloud Console UI when you add a scope to a project ("scope categories … are indicated automatically in the Google Cloud Console" — same source). So the only scope-by-scope tier list Google publishes as a static, fetchable page is the **Restricted Scopes** list:

https://support.google.com/cloud/answer/13464325 — "Restricted Scopes … The following scopes are categorized as 'restricted'"

I fetched that page's full raw HTML. It lists restricted scopes under exactly these API sections, with no others present: **Gmail API, Google Drive API, Google Fit API, Google Chat API, Data Portability API, Photos Ambient API, Google Health API.** There is **no** Calendar, Sheets, Docs, or Meet section on that page at all.

Exact restricted scope strings quoted from that page, for the APIs relevant here:

- Gmail API (restricted): `https://mail.google.com/` (IMAP/SMTP/POP3), `https://www.googleapis.com/auth/gmail.readonly`, `gmail.metadata`, `gmail.modify`, `gmail.insert`, `gmail.compose`, `gmail.settings.basic`, `gmail.settings.sharing`
- Google Drive API (restricted): `https://www.googleapis.com/auth/drive`, `drive.readonly`, `drive.activity`, `drive.activity.readonly`, `drive.metadata`, `drive.metadata.readonly`, `drive.scripts`, `drive.meet.readonly`

Applying that to the requested scopes:

| API / scope | Tier | Source / confidence |
|---|---|---|
| Drive `drive.readonly` | **Restricted** | Listed verbatim on the Restricted Scopes page (13464325). |
| Drive `drive` | **Restricted** | Listed verbatim on the Restricted Scopes page (13464325). |
| Drive `drive.metadata.readonly` | **Restricted** | Listed verbatim on the Restricted Scopes page (13464325). |
| Drive `drive.file` | **Not restricted** — tier below that not confirmed | Absent from the Restricted Scopes page (confirmed by direct grep of the raw page — zero matches for "drive.file"). Whether Google currently buckets it as sensitive or non-sensitive is **UNCONFIRMED** — no official static page states this; it would show in the live Cloud Console scope picker, which I did not have access to. |
| Sheets `spreadsheets` | **Not restricted** — sensitive vs. non-sensitive **UNCONFIRMED** | No "Sheets"/"Google Sheets" section exists anywhere on the Restricted Scopes page. |
| Sheets `spreadsheets.readonly` | **Not restricted** — tier below that **UNCONFIRMED** | Same as above. |
| Calendar `calendar.readonly` | **Not restricted** — tier below that **UNCONFIRMED** | No Calendar section on the Restricted Scopes page. |
| Calendar `calendar.events.readonly` | **Not restricted** — tier below that **UNCONFIRMED** | Same as above. |
| Google Meet REST API `meetings.space.readonly` and conference-records scopes | **Not restricted** — tier below that **UNCONFIRMED** | No Meet REST API section on the Restricted Scopes page. (Note: `drive.meet.readonly` IS restricted, but that is a Drive API scope, not a Meet REST API scope — don't conflate the two.) |
| Docs `documents.readonly` | **Not restricted** — tier below that **UNCONFIRMED** | No Docs section on the Restricted Scopes page. |
| Gmail `gmail.readonly` | **Restricted** | Listed verbatim on the Restricted Scopes page (13464325), under Gmail API. |

**Bottom line for Q1:** Only Drive's `drive`, `drive.readonly`, `drive.metadata.readonly`, and Gmail's `gmail.readonly` are confirmed **restricted** by an official static Google page. Sheets, Calendar, Meet REST API, and Docs read scopes, plus Drive's `drive.file`, are confirmed **not restricted** (absent from the official restricted list), but I could not find any official static page that further distinguishes "sensitive" from "non-sensitive" for those specific scopes — that classification is currently only exposed live in the Cloud Console UI, per Google's own docs.

---

## 2. What each tier requires for an External (public) app to go live

Source: "Verification requirements" — https://support.google.com/cloud/answer/13464321, and FAQ — https://support.google.com/cloud/answer/13463817.

**Non-sensitive:** No mention of any review requirement tied to non-sensitive scopes anywhere in the verification-requirements doc; the doc's whole "Sensitive and Restricted Scope Requirements" section applies only "in addition to Brand Verification Requirements" once sensitive or restricted scopes are involved. (Brand verification — homepage, privacy policy, domain ownership, Google branding — is required for essentially all public apps regardless of scope tier, per the same page's "Brand verification requirements" section.)

**Sensitive — verification review:**
- Process/artifacts required, quoted from 13464321's "Sensitive and Restricted Scope Requirements" section:
  1. App must fit an "appropriate use case" (e.g., productivity purposes) — reviewed manually.
  2. A demonstration video: "Must show the end-to-end flow of your app including the OAuth grant process," must show the same app name/branding as submitted, must show the complete OAuth Consent Screen in English with the exact scopes requested, and must demonstrate the functionality that uses those scopes.
  3. Limited-use data handling commitments (no unauthorized transfers, no ad use, no credit-scoring use, etc.).
  4. Narrowest-scope justification requirement.
  - Brand verification prerequisites apply too: homepage on a verified domain, privacy policy hosted on that domain and linked from both the homepage and the OAuth consent screen, and domain ownership verified via Google Search Console (all from the same page's "Brand verification requirements" section).
- **Turnaround:** per the FAQ (13463817) table — "Sensitive Scope Verification … 10 Business days," with the caveat: "these estimates are not guaranteed and will vary based on developer responsiveness."
- **Fee:** No fee is mentioned anywhere in the Verification requirements page or the FAQ for sensitive scope verification. The FAQ's fee discussion is confined to the Security Assessment section (restricted scopes only, see below).

**Restricted — verification + CASA:**
- Confirmed: restricted scopes require everything sensitive scopes require, **plus** a security assessment. Quoted from 13464321: "Apps requesting access to restricted scopes must meet the additional requirement of secure data handling by submitting to an annual security assessment from a Google empanelled group of security assessors."
- The assessment framework is CASA, quoted from "Security Assessment" (13465431): "To improve and standardize our security assessment process, we are leveraging the industry standard App Defense Alliance and its Cloud App Security Assessment framework (CASA)." Apps are tiered (AL1/AL2 assurance levels; separately the FAQ references Tier 2/Tier 3 assessment scopes) based on "user count, requested scopes, and other application-specific signals." Passing awards a "Letter of Validation (LOV)" (or, per the Annual Recertification page, "Letter of Assessment").
- **Turnaround:** FAQ table — "Restricted Scope Verification … 6 weeks" (again, "not guaranteed").
- **Fee — confirmed CASA is the paid piece, and it is the only one:** FAQ (13463817), verbatim: "Why is Google charging a fee for the security assessment? Google does not charge the developer any fees for security assessment. Security assessments are conducted by CASA authorized independent security assessors. … The cost for such a service is agreed on between the developer and the assessor without any involvement from Google." Also: "If you are in scope for the free tier 2 assessment and choose to reachout to the authorized assessors you will be required to pay the authorized assessor directly" — implying some Tier 2 assessments may be free through a Google-sponsored path, but paying an assessor directly is the norm. No fee is mentioned anywhere for brand verification or sensitive-scope verification, so CASA/the assessor's cost is the only paid step in the whole pipeline per these pages.
- Recertification: "Annual Recertification" (13463816) — a full CASA reassessment ("regardless of any changes made to the app") is required every 12 months, calculated from the prior Letter of Validation's effective date.

---

## 3. Is CASA triggered at the app level or the scope level?

**App level (i.e., the whole OAuth app/project), not scope-by-scope.** Two direct citations:

1. "Verification requirements" (13464321): "**Apps** requesting access to restricted scopes must meet the additional requirement of secure data handling by submitting to an annual security assessment" — the obligation attaches to the app as soon as it requests *any* restricted scope; it is not scoped down to "just review the restricted-scope code path."
2. FAQ (13463817), "What if I have several apps requesting restricted scopes; will they all need to be verified?": "Yes, all Google Cloud projects that access restricted scopes must be submitted for verification. This also means that all OAuth Clients within a project requesting restricted scopes must be ready for verification once submitted." — verification (and by extension CASA) is evaluated at the project/app level; there's no mechanism described for verifying only the restricted-scope portion of an app while leaving the rest unassessed.
3. "Security Assessment" (13465431) reinforces this: "applications requesting access to restricted scopes must undergo an annual security assessment. This assessment verifies that the application can securely handle data and delete user data upon request" — the assessment scope is the whole application's data handling, not a single scope grant.

So in your example — one app requesting both `spreadsheets.readonly` (not restricted per Q1) and `drive.readonly` (restricted) — the presence of the restricted `drive.readonly` scope pulls the **entire app** into restricted-scope verification and CASA. There is no per-scope carve-out described in any of these pages.

---

## 4. Can a developer split scopes across two separate OAuth apps in the same GCP project to keep the sensitive-scope app CASA-free?

**No official page addresses this scenario directly.** What the docs do establish, which bears on it:

- A single Google Cloud project has one OAuth consent screen ("app" identity, branding, and scope list) but can have multiple OAuth Client IDs under it. The FAQ (13463817) treats "project" and "app" as the unit of verification: "all Google Cloud projects that access restricted scopes must be submitted for verification. This also means that all OAuth Clients within a project requesting restricted scopes must be ready for verification once submitted. We suggest you delete or remove OAuth Clients that are not ready for production before submitting a verification request." This implies that if *any* OAuth Client in a project requests a restricted scope, the project as a whole is in the restricted-scope verification pipeline, and Google explicitly recommends removing not-ready clients rather than describing a way to wall off a "sensitive-only" client's scopes from a "restricted" client's scopes within the same project's assessment.
- "Manage App Data Access" (15549135) confirms scopes are managed once per project ("Data Access page") and describes the demo video requirement as covering "all OAuth clients that you assigned to this project" — again suggesting the verification unit is the project, not the individual client.

Neither page states a policy for or against operating two entirely separate GCP projects (which would each have their own consent screen and could in principle be split "sensitive-only" vs. "restricted") as a way to avoid CASA on the sensitive-only project. I found no Google policy page that prohibits multiple OAuth apps/projects for one product, and none that blesses the specific "split to dodge CASA" strategy either. **This is UNCONFIRMED either way** — the docs are simply silent on splitting-as-a-CASA-avoidance-strategy; they only establish that *within* one project, all clients requesting restricted scopes bring that project into restricted-scope verification.

---

## 5. Any exemption from CASA for business-customer-only or in-house/agency use, other than Internal apps?

Source: "When is verification not needed" — https://support.google.com/cloud/answer/13464323. This page is the exhaustive list Google publishes of app scenarios exempt from verification (and therefore from CASA, since CASA is a sub-step of restricted-scope verification). Quoted in full for completeness:

1. **Personal Use apps** (fewer than 100 users) — exempt, but "such apps will need to complete a verification if they want to grow their user base beyond 100."
2. **Development/Testing/Staging apps** — exempt while not in production ("In Production" published status).
3. **Service-owned Data Only** — "The app only accesses its own data (using a Service Account), and not user data (linked to a Google Account)."
4. **Internal Use apps** — "only used by people in your Google Workspace or Cloud Identity organization," consent screen configured for internal use.
5. **Google Workspace admin-trusted or marketplace-installed apps** — an admin can add an unverified app to a trusted list or admin-install an unverified Marketplace app; Google states it "will disclose the app's unverified status during installation, and in the Admin console" — this is an installation workaround for admins, **not** a verification/CASA exemption for the developer; the app's own unverified status is still disclosed and presumably it can still hit the 100-user cap issue described elsewhere.

There is **no** category on this page for "app used only by business customers who own their data" or any general "in-house"/"agency" exemption. The only route resembling that is category 4 (Internal Use), which — as your question already excludes — only works when the app lives *inside* the client's own Workspace/Cloud Identity org, not as a third-party SaaS serving many separate business customers from the developer's own project. **Confirmed: no such exemption exists on Google's official exceptions list.**

---

## Bottom line

- Only four of the requested scopes are confirmed **restricted** by an official static Google page (support.google.com/cloud/answer/13464325): Drive's `drive`, `drive.readonly`, `drive.metadata.readonly`, and Gmail's `gmail.readonly`. Sheets, Calendar, Meet REST API, Docs read scopes, and Drive's `drive.file` are confirmed **not** on that restricted list — but I could not confirm from any official static page whether each of those is "sensitive" or "non-sensitive" specifically; that distinction is only rendered live inside the Cloud Console.
- Sensitive-scope verification (artifacts: privacy policy, homepage, domain verification, demo video, narrowest-scope justification) is free and typically ~10 business days. Restricted-scope verification adds a mandatory annual CASA security assessment (~6 weeks turnaround) whose assessor fee is the only paid step in the entire pipeline — Google itself charges nothing at any tier.
- CASA is triggered at the **app/project level**: if any part of an app requests a restricted scope, the whole app must go through restricted-scope verification and CASA, even if most of its scopes are merely sensitive.
- Google's docs do not explicitly address splitting scopes across separate OAuth apps/projects as a way to avoid CASA on a sensitive-only app — neither endorsed nor forbidden in anything I found.
- The only documented exemption is Internal (Workspace/Cloud Identity)-only apps, plus personal-use (<100 users), dev/test, and service-account-only-data apps. There is no separate exemption for B2B/"business customers own the data" or in-house/agency arrangements.

---

## Correction — what these tiers mean for *our* code (added 2026-09-17)

The tier findings above are about Google's scope classification in the abstract.
Applied to this repo they collapse to one answer: **all Google code we have is
restricted-scope.**

- `platform/worker/src/connectors/meet.ts` does **not** call the Google Meet REST
  API. It calls `https://www.googleapis.com/drive/v3/files` with a folder query and
  `/files/{id}/export` to read Gemini meeting-notes Docs. It is a Drive consumer.
- `platform/worker/src/connectors/drive.ts` — same API, media files.
- `platform/worker/src/tokens.ts:27` — health probe for both is `drive/v3/about`.
- `platform/worker/src/connectors/index.ts:5` — `Source` is exactly
  `'shopify' | 'meta' | 'monday' | 'meet' | 'drive'`. No Sheets, Calendar or Docs
  connector exists.

Consequences:

1. The "Sheets/Calendar/Meet are not restricted, so they're free" reading does not
   apply to us. Those scopes have no connector code behind them, and Google's
   review requires a demo video of the scope's functionality in use — so they
   cannot be submitted for regardless of tier.
2. Both connectors need `drive.readonly` (restricted), not `drive.file`. They list
   whatever is in a folder, including files the user never hand-picked through a
   Picker — the case ruled out in `chunk5-drive-scope-finding.md`.
3. Therefore **no Google OAuth app belongs in chunk 5 W1**. Any Google app we could
   build today is in the CASA tier and has no free scopes to offer.

Unblocking a free Google app would require building a Sheets or Calendar connector
first. That is new scope, not chunk 5.

Naming note for the §9 UX pass: the "Meet" source card is really "Gemini meeting
notes in a Drive folder", which is worth relabelling before a client sees it.
