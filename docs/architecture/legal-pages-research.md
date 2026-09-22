# Legal pages research: privacy policy and terms of service

Research input for the writer who drafts `apps/web/app/privacy/page.tsx` and
`apps/web/app/terms/page.tsx`. It is not the pages themselves. Researched 2026-09-21.
Every external claim has a URL. Every internal fact has a file path. **UNKNOWN** means the
repo does not say, and the pages must not guess.

> **A lawyer should review both pages before bcns relies on them.** This doc is research,
> not legal advice. Several of the conflicts below (retention vs. platform deletion
> deadlines, billing, AI transfers) are judgment calls with liability attached.

---

## (a) Hard requirements, by platform

"Hard" means a platform contract or a statute says it. Good practice is in (b).

### Shopify

| # | Requirement | Source |
|---|---|---|
| S1 | A privacy policy is required, and the App Store listing must link to it. The submission form now makes it a required field. | https://shopify.dev/docs/apps/launch/privacy-requirements ; https://community.shopify.dev/t/privacy-policy-required/31325 |
| S2 | The developer must "have in place and ... present the Merchant with a privacy policy that complies with all applicable privacy laws and provides adequate notice and obtains prior consent as required for the collection, use and storage of the Merchant Data." It must describe (i) the services the app provides, (ii) the Merchant Data it accesses, (iii) how Merchant Data is used and transferred to third parties, and (iv) the developer's contact information. (API License §6.1.3; last updated Feb 27, 2026) | https://www.shopify.com/legal/api-terms |
| S3 | Shopify's recommended policy contents: what you collect through Shopify's APIs, what you collect directly from merchants, what you collect directly from merchants' customers, how you use it, how long you retain it, whether you are established in or process outside Europe, and how merchants can contact you. | https://shopify.dev/docs/apps/launch/privacy-requirements |
| S4 | **Delete all originals, copies and reproductions of Merchant Data within 30 days** when (A) the merchant uninstalls, (B) it is no longer needed to serve the merchant, (C) it is no longer needed for Platform Services, or (D) you receive an enforceable deletion request from a merchant, customer or Shopify. (API License §6.2.3) | https://www.shopify.com/legal/api-terms |
| S5 | Use Merchant Data only as needed to provide the app's services and within the purposes the merchant specifies. Do not transfer data received from Shopify to third parties except as needed to provide the service or if expressly authorized. (§6.2.1, §6.2.2, §6.2.8) | https://www.shopify.com/legal/api-terms |
| S6 | Notify Shopify of an actual or suspected breach of Merchant Data within 24 hours. (§6.2.10) Comply with GDPR, ePrivacy, PIPEDA, the FTC Act and COPPA. (§6.3.1) | https://www.shopify.com/legal/api-terms |
| S7 | Protected customer data, Level 1 (bcns requests Name and Email): process only the minimum personal data; tell merchants what personal data you process and why (in the privacy policy or a data-protection agreement); limit processing to the stated purposes; **make privacy and data-protection agreements with merchants** (transfer mechanism, scope, legal roles, retention, term); apply retention periods; **encrypt data at rest and in transit**. | https://shopify.dev/docs/apps/launch/protected-customer-data |
| S8 | Level 2 (applies if bcns ever requests more fields): encrypted backups, test/prod separation, a data-loss-prevention strategy, limited staff access, strong staff passwords, an access log, and an incident-response policy. | https://shopify.dev/docs/apps/launch/protected-customer-data |
| S9 | Mandatory compliance webhooks: return 401 on a bad HMAC, 200 on receipt, and **complete the action within 30 days**. `shop/redact` arrives 48 hours after uninstall. `customers/redact` may arrive up to six months after the request. | https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance |
| S10 | Billing: "Your app must use Shopify App Pricing or the Shopify Billing API for any app charges." Apps billed off-platform cannot be distributed through the App Store unless Shopify says otherwise. (Req. 1.2 / 1.2.1) The terms page must not describe off-Shopify billing for Shopify-installed merchants until this is settled. | https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements |
| S11 | Add an emergency developer contact in the Partner Dashboard. (Req. 4.5.6) | https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements |

### Meta (Marketing API, `ads_read`)

| # | Requirement | Source |
|---|---|---|
| M1 | "Provide, maintain, and comply with a privacy policy that is available through an active, publicly available, easily accessible ... and non-geoblocked URL" that "clearly explain[s] what data you are Processing, how you are Processing it, the purposes for which you are Processing it, and how Users may request deletion of that data." (Platform Terms §4; last updated Feb 3, 2026) | https://developers.facebook.com/terms/dfc_platform_terms/ |
| M2 | Delete Platform Data when it is no longer needed for a legitimate business purpose, when you stop operating the product, on Meta's request, when a user requests deletion or no longer has an account, and as the law requires. (§3.d) | https://developers.facebook.com/terms/dfc_platform_terms/ |
| M3 | Do not sell, license or buy Platform Data. Do not use it to discriminate, to decide eligibility (housing, employment, insurance and similar), or for surveillance. (§3.a) | https://developers.facebook.com/terms/dfc_platform_terms/ |
| M4 | Service providers that process Platform Data must agree in writing to process it only for you and consistently with the Terms. (§5.a) This covers bcns's own subprocessors (Supabase, Google Cloud, DigitalOcean). | https://developers.facebook.com/terms/dfc_platform_terms/ |
| M5 | Provide a data-deletion callback URL or a deletion-instructions URL. A callback returns JSON `{url, confirmation_code}`. The status URL must give "a human-readable explanation of the status of their request, including a legitimate justification for any refusal to delete." "All apps must inform users in their privacy policy how to request deletion of their data." | https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback |

### Google (Drive API, used by the Drive and "Meet notes" connectors)

| # | Requirement | Source |
|---|---|---|
| G1 | Publish a privacy policy that "fully documents how your application interacts with user data": how the app accesses, uses, stores or shares Google user data. List it in the OAuth client configuration when the app is public. | https://developers.google.com/terms/api-services-user-data-policy |
| G2 | Limited Use: use data only to provide or improve user-facing features that are prominent in the UI. No transfers except for those features (with consent), security, legal compliance, or a merger with explicit prior consent. No human reading except with the user's affirmative agreement, for security, for legal compliance, or aggregated internal operations. Never sell to advertisers or data brokers, and never use it for credit decisions or surveillance. | https://developers.google.com/terms/api-services-user-data-policy |
| G3 | Workspace scopes (Drive is one) must carry this disclosure, verbatim, in the app or on the website (a homepage link or the privacy policy): **"The use of information received from Google Workspace scopes will adhere to the Google User Data Policy, including the Limited Use requirements."** The policy applies to internal apps too. | https://developers.google.com/workspace/workspace-api-user-data-developer-policy |
| G4 | No transfer, sale or use of Workspace user data "to create, train, or improve a machine learning or artificial intelligence model beyond that specific user's personalized model." | https://developers.google.com/workspace/workspace-api-user-data-developer-policy |
| G5 | For verification (a public app), the privacy policy must be hosted on the homepage's domain, linked from the homepage, and the same one linked on the OAuth consent screen. | https://support.google.com/cloud/answer/13464321 |
| G6 | `drive.readonly` is a restricted scope. A public app that requests it needs an annual third-party CASA security assessment. Internal (single-Workspace) apps are exempt from verification. The research and citations are in `docs/architecture/chunk5-google-scope-tiers.md`. | https://support.google.com/cloud/answer/13464325 ; https://support.google.com/cloud/answer/13464323 |

### monday.com

| # | Requirement | Source |
|---|---|---|
| D1 | Developer Terms apply to any use of the API, not only to Marketplace listings. Present users with a privacy policy (and EULA) that complies with applicable law. (§4; last updated Oct 16, 2020) | https://monday.com/l/marketplace-developers/developer-terms/ |
| D2 | On de-authorization or uninstall, **permanently delete all End User Data and metadata within 30 days, or get the end user's express written consent to keep it longer**. (§7(e)) | https://monday.com/l/marketplace-developers/developer-terms/ |
| D3 | Report a security incident to monday.com within 24 hours. (§7(d)) Handle End User Data according to your privacy policy. (§7(b)) | https://monday.com/l/marketplace-developers/developer-terms/ |
| D4 | A Marketplace listing needs a privacy-policy link on the app page. | https://developer.monday.com/apps/docs/app-listing-guidelines |

### US law (California)

| # | Requirement | Source |
|---|---|---|
| C1 | CalOPPA: any commercial website that collects personally identifiable information from California residents (the contact form collects name and email) must post a policy that lists the categories of PII and of third parties it is shared with, explains how users can review and correct their data, explains how material changes are announced, **states an effective date**, **says how the site responds to Do Not Track signals**, and says whether third parties collect data about users across sites. (Bus. & Prof. Code §22575(b)) | https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=BPC&sectionNum=22575 |
| C2 | The CCPA/CPRA applies to a business with more than $26,625,000 in revenue (adjusted from 2025), or that buys, sells or shares the personal information of 100,000+ California residents, or that earns 50%+ of its revenue from selling it. bcns is almost certainly **below** these thresholds today. | https://cppa.ca.gov/faq.html ; https://oag.ca.gov/privacy/ccpa |
| C3 | The B2B exemption ended on January 1, 2023. The CCPA covers business-contact data if bcns ever crosses a threshold. | https://oag.ca.gov/privacy/ccpa |
| C4 | A "service provider" processes personal information for a business under a **written contract** that bars it from selling or sharing the data, using it outside the contracted business purpose or outside the direct relationship, and combining it with other data. The bcns client agreement or DPA must say this so its clients (if they are covered) can treat bcns as a service provider. | https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=CIV&sectionNum=1798.140 |

### GDPR (applies if a client's stores or ad audiences include EU/UK people)

| # | Requirement | Source |
|---|---|---|
| E1 | As a controller (the business owner's own account data), give Art. 13 information: identity and contact; purposes and legal basis; legitimate interests relied on; recipients; transfers outside the EU and the safeguard; retention period or criteria; the rights to access, rectify, erase, restrict, object and port; withdrawing consent; complaining to a supervisory authority; whether the data is required; automated decision-making. | https://gdpr-info.eu/art-13-gdpr/ |
| E2 | As a processor (clients' customer data), bcns needs an Art. 28 contract with each client. It must say that bcns processes only on the client's instructions, keeps staff confidential, applies Art. 32 security, follows the subprocessor rules (prior written authorization, or general authorization with notice of changes and a right to object), helps with data-subject requests and Arts. 32–36, **deletes or returns the data at the end of the service**, and supports audits. | https://gdpr-info.eu/art-28-gdpr/ |
| E3 | A non-EU controller or processor that is caught by Art. 3(2) must appoint an EU representative unless the processing is occasional and low-risk. Whether bcns is caught is a lawyer question. | https://gdpr-info.eu/art-3-gdpr/ ; https://gdpr-info.eu/art-27-gdpr/ |

### Terms-of-service formation (US case law)

| # | Point | Source |
|---|---|---|
| T1 | A sign-in-wrap binds a user when the notice is reasonably conspicuous and the action (e.g. "Register") unambiguously shows assent to linked terms. | Meyer v. Uber, 868 F.3d 66 (2d Cir. 2017): https://law.justia.com/cases/federal/appellate-courts/ca2/16-2750/16-2750-2017-08-17.html |
| T2 | A link near a button is not enough without clear notice that the action means agreement. Plain browsewrap (a footer link only) is weak. | Berman v. Freedom Financial Network, 30 F.4th 849 (9th Cir. 2022): https://cdn.ca9.uscourts.gov/datastore/opinions/2022/04/05/20-16900.pdf |

### Security claims (FTC)

| # | Point | Source |
|---|---|---|
| F1 | The FTC treats overstated security claims as deceptive. Zoom settled over advertising "end-to-end, 256-bit encryption" it did not provide, and over recordings described as encrypted that sat unencrypted for up to 60 days. Shopify's §6.3.1 also binds bcns to the FTC Act. | https://www.ftc.gov/news-events/news/press-releases/2020/11/ftc-requires-zoom-enhance-its-security-practices-part-settlement |

---

## (b) Recommended outlines

### Privacy policy (`bcn-services.com/privacy`)

One policy covers the marketing site, the Connect hub, the MCP server, and custom builds.
Write it in plain English, but keep every heading, because reviewers check for each item.

1. **Effective date and last-updated date** (C1).
2. **Who we are**: legal entity name, address, contact email (S2-iv, E1). *UNKNOWN; Nate decides.*
3. **Two roles, stated plainly.** bcns is the controller for business-owner account data and
   website-visitor data. bcns is a processor / service provider for the data its clients
   connect, and the client is the controller (E1, E2, C4, S7 "legal roles").
4. **What we collect, by source.**
   - Website: the contact form (name, business, email, message) through a third-party form
     service. No analytics and no tracking cookies (see (c)).
   - Accounts: the owner's and members' email addresses and sign-in sessions (Supabase Auth
     cookie on `.bcn-services.com`).
   - Connected sources, one short subsection each, listing the actual fields in (c):
     Shopify (including customer **name and email** on orders, S3/S7), Meta Ads, monday.com,
     Google Drive (file metadata and thumbnails) and meeting notes in a Drive folder (full
     text, which can include the names of people in the meeting).
   - Access tokens for each source, and what they are used for.
5. **How we use it**: only to sync, store and show the client's own data in its dashboard and
   through AI tools the client connects. List what bcns never does: sell data, use it for
   ads, profile people, or train AI models on it (S5, M3, G2, G4).
6. **AI tools / MCP.** When a client connects an AI assistant through the MCP server, the
   client's data goes to the AI provider the client picked, at the client's direction, under
   the client's own agreement with that provider. bcns does not send data to AI providers on
   its own. *Wording needs Nate plus lawyer sign-off (see (e)).*
7. **Who we share it with**: a subprocessor table (name, purpose, location) from (c), plus
   legal disclosures and business transfers (G2 allows a merger transfer only with explicit
   prior consent for Google data).
8. **Google user data**, as its own section: the G3 sentence verbatim, and the Limited Use
   commitments (G2).
9. **Retention and deletion**: while subscribed; what happens after cancellation; what
   happens on a Shopify uninstall, monday.com de-authorization and Meta removal; backups
   (7 days after deletion). This section **must be reconciled with S4/D2 before publishing**
   (see (d) and (e)).
10. **Deletion requests**: how a business, a Shopify customer, or a Meta user asks for
    deletion (email, plus the Meta status URL); the 30-day timeline (M1, M5, S9).
11. **Security**, written with care (see (d)): TLS in transit, encryption at rest at the
    database provider, row-level tenant isolation, restricted operator access. Do not claim
    more.
12. **Your rights**: access, correction, deletion, export. GDPR rights and a supervisory-
    authority complaint for EU/UK people (E1). A California section only if bcns meets C2.
    For processor data, tell end customers to contact the business they bought from.
13. **International transfers**: data is stored and processed in the US (E1). *Supabase and
    Cloud Run regions are UNKNOWN; confirm them.*
14. **Cookies and Do Not Track**: essential sign-in cookies only; the DNT statement (C1).
15. **Children**: not directed at children under 13 (COPPA, through S6).
16. **Changes to this policy**: how material changes are announced (C1).
17. **Contact**.

### Terms of service (`bcn-services.com/terms`)

B2B terms. Custom builds and consulting run under a quote or order form that points to these
terms; the order form controls if the two conflict.

1. **Agreement and acceptance**: who is bound (the business, and the person accepting has
   authority); how acceptance happens (T1/T2; see (e) for the mechanism).
2. **Definitions**: Services, Customer Data, Connected Sources, Order Form, AI Output.
3. **The services**: Connect (subscription), custom builds and consulting (per order form).
4. **Accounts and access**: the owner controls members; keep credentials safe; the client is
   responsible for its users and for agent/MCP logins.
5. **Connected sources**: the client authorizes bcns to access each source it connects,
   confirms it has the right to share that data (including its customers' personal data)
   and that it gave any notices its own customers need. Third-party platforms are
   governed by their own terms, and bcns is not responsible for their outages or API changes.
6. **Customer data ownership**: the client owns its data. bcns gets a limited license to
   process it only to provide the service. No sale, no ad use, no model training.
7. **Data processing**: the DPA is incorporated by reference, or offered on request (E2, C4,
   S7). Point to the privacy policy.
8. **Acceptable use**: no unlawful data, no scraping or reverse engineering, no load
   testing or security probing without permission, no reselling, no use that breaks the
   source platforms' terms.
9. **AI features and output**: AI output can be wrong; the client reviews it before relying
   on it; it is not financial, legal or tax advice; bcns does not control third-party AI
   providers the client connects.
10. **Fees and billing**: $200/month for Connect with no setup fee (per current pricing);
    billing cycle, taxes, late payment, price-change notice. *Leave out or tailor for
    merchants who install through Shopify until S10 is settled.*
11. **Term, cancellation, suspension**: month to month; cancel any time; suspension for
    non-payment or abuse, with notice where practical.
12. **Effect of termination and export**: logins and syncs stop; export on request within a
    stated window; deletion on the schedule in the privacy policy.
13. **Confidentiality** (mutual).
14. **Warranties and disclaimer**: service provided "as is"; no guarantee of uninterrupted
    service or data accuracy from third-party sources. Use capital letters or other
    conspicuous formatting.
15. **Limitation of liability**: exclude indirect and consequential damages; cap at the
    fees paid in the prior 12 months (common for small SaaS). Carve-outs are Nate's call.
16. **Indemnities**: the client covers claims arising from its data and its breach of the
    source platforms' terms. Whether bcns offers an IP indemnity is Nate's call.
17. **Intellectual property**: bcns keeps the platform; custom-build deliverables follow the
    order form.
18. **Changes to the service and the terms**: notice period (for example 30 days by email);
    continued use after notice counts as acceptance, which is weak on its own, so prefer
    re-acceptance for material changes.
19. **Governing law and venue**: *state UNKNOWN; Nate decides.* Arbitration or courts.
20. **General**: entire agreement, order of precedence, assignment, force majeure, notices,
    severability, no waiver.
21. **Contact**.

---

## (c) Fact inventory (from the repo)

### Current pages

- `apps/web/app/privacy/page.tsx`: the heading "{siteConfig.name} Privacy Policy" and one
  paragraph, `[PRIVACY POLICY BODY: Replace with your actual privacy policy before launch.]`.
  **Entirely placeholder.**
- `apps/web/app/terms/page.tsx`: same, `[TERMS OF SERVICE BODY: Replace ...]`. **Entirely
  placeholder.**
- Both use `siteConfig.name`, which is "bcns" (`apps/web/lib/site.ts`). That file has a
  `TODO(rename)` and a `TODO(email)`: `email` is `nseluga@bcn-services.com` and is "consumed
  nowhere" until a real mailbox is confirmed.
- `docs/architecture/w6a-shopify-submission.md` §5 says the placeholder privacy page is the
  one thing blocking the Shopify submission, and it gives the privacy URL as
  `https://bcn-services.com/privacy` and the terms URL as `https://bcn-services.com/terms`.
- The hub (`apps/connect/app`) has no link to the terms or privacy policy and no acceptance
  step. Accounts are created by bcns (`platform/scripts/onboard.ts`, `add-member.ts`, the
  `invite-member` edge function per `apps/connect/DEPLOY.md`).

### Legal entity and contact

- Legal entity name: **UNKNOWN** (no "LLC", "Inc." or state of formation anywhere in the repo).
- Postal address: **UNKNOWN**.
- Contact email: `nseluga@bcn-services.com` (`BCNS_EMAIL`, `apps/connect/lib/request-connection.ts:18`;
  `siteConfig.email`). The support alias is **UNKNOWN** (`w6a-shopify-submission.md` §5 TODO).
- Governing-law state: **UNKNOWN**.

### What each connector reads (all read-only)

| Source | Scopes | Data read | Files |
|---|---|---|---|
| Shopify | `read_all_orders, read_customers, read_inventory, read_orders, read_products, read_reports, read_shopify_payments_accounts, read_shopify_payments_payouts`. No write scopes. | Orders (totals, status, line items, refunds; 13-month backfill), products and variants and prices, inventory quantities, Shopify Payments payouts, ShopifyQL sessions (only when `sessions_mode = shopifyql`). **Customer on each order: `id`, `email`, `displayName` only**, with no phone or address. | `apps/connect/shopify.app.toml`; `apps/connect/lib/shopify-oauth.ts:44`; `platform/worker/src/connectors/shopify.ts:50`; `w6a-shopify-submission.md` §3–4 |
| Meta Ads | `ads_read` | Ad account timezone and currency; campaigns (id, name, status, objective); ads (id, name, ad set, campaign, status, creative including `object_story_spec`); daily insights (spend, impressions, clicks, reach, actions, action values, ROAS); **ad creative images are downloaded and stored** in bcns storage. | `apps/connect/lib/meta-oauth.ts:14`; `platform/worker/src/connectors/meta.ts:36-60` |
| monday.com | `boards:read`, `me:read` | One configured board: board name, columns, groups, and every item's name, dates, group and all column values. Column values can hold people's names or emails if the client keeps them there. | `apps/connect/lib/monday-oauth.ts:16`; `platform/worker/src/connectors/monday.ts:18-24` |
| Google "Meet" | Drive API (restricted `drive.readonly` per `chunk5-google-scope-tiers.md`) | Google Docs in one folder (Gemini meeting notes): name, dates, link, owners, and **full exported text**, which can include participant names and what they said. It does not call the Meet API. | `platform/worker/src/connectors/meet.ts`; `docs/architecture/chunk5-google-scope-tiers.md` ("Correction") |
| Google Drive | same | Files in one folder: name, type, size, dates, link, image dimensions; **thumbnails are copied** into bcns storage. The file contents stay in Drive. | `platform/worker/src/connectors/drive.ts` |

Google apps run as an Internal app inside each client's own Workspace; no public Google app
is planned for now (`docs/architecture/chunk5-windows.md`, "Not in scope, deliberately").
The G2–G4 Limited Use duties still apply to internal apps.

Status: Shopify is ready to submit (`w6a-shopify-submission.md`). Meta `ads_read` review
waits on business verification, and monday.com is not yet submitted (`chunk5-windows.md`
W6b/W6c).

### Where data lives and who processes it

| Processor | Role | Evidence | Region |
|---|---|---|---|
| Supabase (hosted Postgres, Auth, Storage) | All connected-source data, raw payloads, media/thumbnails, user accounts, tokens | `apps/connect/DEPLOY.md` (project `cnsxbglhredokjbvudfd`); `platform/DESIGN.md` | **UNKNOWN** |
| Google Cloud Run (Job `bcns-data-worker`) + Artifact Registry | The sync worker that calls every source API and writes to Supabase | `.github/workflows/deploy-worker.yml` | `GCP_REGION` var, **UNKNOWN** |
| DigitalOcean droplet | Hosts the Connect hub (`connect.bcn-services.com`), the MCP server (`mcp.bcn-services.com`), and Deluxe client apps | `apps/connect/DEPLOY.md`; `apps/mcp/README.md`; `infra/README.md` | **UNKNOWN** |
| DigitalOcean Spaces | Nightly `pg_dump` of client-app databases (`bcns-web-apps-backups`); **archives of a churned client's full export** (`bcns-exports`) | `infra/README.md:13`; `platform/scripts/hard-delete.ts` | **UNKNOWN** |
| Vercel | Hosts the marketing site `bcn-services.com` | `CLAUDE.md:83`; `README.md` "Deploy" | n/a |
| Resend | Sends email (connection requests, Shopify GDPR webhook alerts, Meta deletion alerts) to bcns | `apps/connect/lib/request-connection.ts:23`; `apps/connect/app/api/oauth/meta/data-deletion/route.ts:55` | n/a |
| Web3Forms **or** Formspree | Contact-form delivery (`NEXT_PUBLIC_CONTACT_ENDPOINT`). Which one is live is **UNKNOWN**. | `apps/web/.env.example`; `apps/web/components/contact-form.tsx:16` | n/a |
| Cloudflare | DNS / proxy and Origin CA TLS for some client apps. The hub is *not* proxied (`connect.bcn-services.com` A record, Let's Encrypt). | `infra/README.md:9`; `apps/connect/DEPLOY.md` | n/a |
| UptimeRobot | Backup heartbeat ping only; no personal data | `infra/README.md:13` | n/a |
| Client-chosen AI provider | Receives data only when the client connects an AI assistant to the MCP server with its own login | `apps/mcp/README.md` | n/a |

- Tenant isolation: row-level security through `api` views; the hub and the MCP server hold no
  service-role key (`apps/connect/DEPLOY.md`; `apps/mcp/README.md`). Only the operator (Nate)
  has service-role access (`w6a-shopify-submission.md` §4).

### Tokens

- `data.source_tokens.secret` and `refresh_secret` are **plain `text` columns**
  (`platform/supabase/migrations/20260912000100_schema.sql:64-78`). This is a deliberate
  decision: "Tokens are stored plaintext in `data.source_tokens` (RLS enabled, zero policies →
  service role only) ... Supabase Vault is the upgrade" (`platform/DESIGN.md:31`, D13).
- The only protection is Supabase's disk-level encryption at rest (AES-256 per
  https://supabase.com/security) and access control. There is no application-level
  encryption. The Shopify install hand-off cookie is sealed with AES-256-GCM for 15 minutes
  (`w6a-shopify-submission.md` §1).

### Retention and deletion as built

- While subscribed: raw payloads are kept "forever while `clients.status <> churned`"
  (`platform/DESIGN.md:255`).
- Cancel: status becomes `churned`, syncs and logins stop, and **rows are kept**; export on
  request (`platform/REQUIREMENTS.md:144-148`, R34–R35).
- Hard delete: a bcns-run script that **refuses until 90 days after churn**, **first archives a
  full export to DigitalOcean Spaces `bcns-exports/<slug>/<date>.tar.gz`**, then deletes
  Storage, raw rows, data rows, memberships and auth users (`platform/scripts/hard-delete.ts`;
  R36). No retention period for the Spaces archive exists in the repo.
- Supabase daily backups keep rows 7 days after hard delete; "the contract says so"
  (`platform/REQUIREMENTS.md:149`).
- Media: a deleted upload is purged 30 days later; worker run logs are pruned after 90 days
  (`platform/DESIGN.md:727`, `:1166`).
- Shopify webhooks (`apps/connect/lib/shopify-webhooks.ts`): HMAC verified, recorded, the
  operator is emailed with a deadline (30 days for data_request/customers_redact, 48 h for
  shop_redact), and 200 is returned. **Deletion itself is manual.** The 90-day script cannot
  meet `shop/redact` (`w6a-shopify-submission.md` §4).
- Meta deletion callback: `apps/connect/app/api/oauth/meta/data-deletion/route.ts` verifies
  `signed_request`, emails the operator ("no schema mapping, manual follow-up"), and returns
  a status URL. The status page says: "bcns will erase any data linked to your Meta account
  and confirm by email if you contact [BCNS_EMAIL]." There is a known LOW finding that it
  accepts a `signed_request` of any age (`docs/architecture/chunk5-w5b-meta-monday-review.md` §2).
- monday.com: no uninstall or de-authorization handler found in the repo.

### Cookies and analytics

- **No analytics, tag managers or tracking scripts** anywhere in `apps/` or `packages/`: no gtag,
  GTM, Vercel Analytics, PostHog, Plausible, Hotjar or Clarity (grep, 2026-09-21).
- Cookies: the Supabase auth session cookie on `.bcn-services.com`, shared by the hub and client
  dashboards (`packages/tenant/src/cookies.ts:13`); short-lived OAuth state cookies and the
  sealed `shopify_pending` cookie on `/api/oauth/shopify` (`w6a-shopify-submission.md` §1).
  All are strictly necessary.

---

## (d) Statements the pages MUST NOT make

1. **"Bank-grade", "military-grade", "fully encrypted", "end-to-end encrypted", or "your
   credentials are encrypted."** Tokens are plaintext columns (D13). Safe wording: "data is
   encrypted in transit (TLS) and at rest by our database provider; access tokens are stored in
   a table only our sync service can read." (F1)
2. **Any certification or audit**: SOC 2, ISO 27001, HIPAA, PCI, GDPR-certified, or "CASA
   assessed". None exists in the repo.
3. **"We delete your data when you cancel / immediately / within 30 days"** unless the process
   is changed to match. As built, it is 90 days after churn plus an indefinite Spaces archive
   plus 7 days of backups.
4. **"Deleted everywhere" / "no copies"** while `hard-delete.ts` writes an export archive to
   Spaces before deleting.
5. **"Automatic deletion"** for Shopify redaction, Meta deletion or monday.com. All three are
   manual today.
6. **"Only reads name and email" for all sources.** That is true for Shopify customers only.
   Meet notes include full meeting text, monday.com boards can hold anything, and Meta
   creatives are copied.
7. **"We never store your files."** Drive thumbnails and Meta creative images *are* copied.
8. **"We don't use cookies."** Essential auth cookies exist. "No tracking or advertising
   cookies" is accurate.
9. **"AI features" as a listed feature on the Shopify side** until a reviewer can use it
   (`w6a-shopify-submission.md` §2 wording rule), and nothing that implies bcns trains models on
   client data or sends data to an AI provider by itself.
10. **"Billed through Shopify" or "billed by bcns" for App Store installs** until S10 is
    decided.
11. **CCPA "we do not sell or share" headers presented as if bcns were a covered business**,
    or a "Do Not Sell" link, unless a lawyer says it applies. (The underlying fact, that bcns
    never sells data, *should* be stated.)
12. **An invented entity name, address, state, DPO or EU representative.** Leave a visible
    TODO instead.
13. **Text copied from another company's policy.** It would state practices bcns does not
    follow and could carry copyright problems. Write from the facts in (c).
14. **"HIPAA / financial-grade compliance" or "guaranteed uptime / SLA"**; no SLA exists.
15. **"You can delete your account yourself in the dashboard."** There is no self-serve
    account deletion; deletion is by email request.

---

## (e) Decisions only Nate can make

1. **Legal entity**: exact legal name, entity type, state of formation, and postal address for
   both pages and the Shopify publisher profile.
2. **Contact mailbox**: keep `nseluga@bcn-services.com` or create `privacy@` / `support@`
   (it must exist before it is published).
3. **Governing law and venue**: which state, courts or arbitration, and any class-action waiver.
4. **Retention vs. platform deadlines (the biggest issue).** Shopify §6.2.3 requires deletion
   within 30 days of uninstall, including copies. monday.com §7(e) requires 30 days unless the
   end user gives express written consent. The build keeps data 90 days after churn and then
   archives an export indefinitely. Options: (a) shorten to 30 days for everyone; (b) delete
   Shopify data within 30 days of `shop/redact` or uninstall, and get written consent for a
   longer window in the ToS/order form for the other sources; (c) keep 90 days and accept the
   risk (not recommended for Shopify). Separately: how long does the Spaces export archive
   live, and should it exist at all?
5. **Shopify billing (S10)**: charge Shopify-installed merchants through Shopify App Pricing /
   the Billing API, or ask Shopify for an exception. This changes the fees section.
6. **Whether to offer a DPA**: a standard DPA (Art. 28 + CCPA service-provider terms + Shopify
   Level 1 "privacy agreement") published or linked in the ToS, or only on request.
   Recommended: publish one short DPA and incorporate it, because Shopify Level 1 requires
   privacy agreements with merchants (S7).
7. **Acceptance mechanism**: accounts are created by bcns today, so there is no click. Options:
   a signed quote or order form that references the ToS, and/or a sign-in-wrap line on the
   hub's login or first-run screen ("By signing in you agree to the Terms and Privacy
   Policy") with a stored acceptance timestamp. Adding the hub line is a code change for a
   later PR.
8. **Liability cap and carve-outs**: 12 months of fees (typical) or a fixed floor; whether
   data-breach or confidentiality claims get a higher cap; whether bcns gives an IP indemnity.
9. **AI/MCP position**: confirm the policy says the client, not bcns, directs transfers to
   its AI provider, and decide whether Google (G2/G4) and Meta (S5-style third-party transfer)
   data may flow over MCP at all. Needs a lawyer's view.
10. **Token encryption**: either move `source_tokens` to Supabase Vault before publishing (then
    the security section can say tokens are encrypted), or accept the narrower wording in (d)1.
11. **Contact-form vendor**: confirm whether production uses Web3Forms or Formspree so it can
    be named as a subprocessor.
12. **Hosting regions**: confirm the Supabase project region, `GCP_REGION` and the droplet and
    Spaces regions for the transfers section.
13. **GDPR exposure**: whether bcns targets or will accept EU/UK clients (this drives the
    Art. 27 representative and SCC questions), or states US-only service.
14. **Custom builds and consulting**: covered by these ToS plus an order form, or by a separate
    master services agreement.

**A lawyer should review both pages, and the DPA if one is offered, before bcns relies on
them or submits them to Shopify, Meta, Google or monday.com.**
