# bcns Landing Template — Progress Log

> Living status file. The agents update this after each work item: move the
> **Current position** pointer, flip the milestone status, and append a dated
> entry to the log. `PLAN.md` is the plan (decisions + task checklist); this file
> tracks *where we are in it*. If the two disagree, `PLAN.md` wins for scope — fix
> this file to match reality.

---

## Current position
- **Status:** Section 1 + Section 2 complete. B1–B4 DONE on experimental-v2. Layout-loop passes V1–V5 DONE on branch layout-loop/bcns-section-2 (awaiting Nate review + merge).
- **Next:** Nate reviews layout-loop branch and merges to experimental-v2. Then: fill [INPUT:] slots (prices, turnaround, founder specifics), deploy to Vercel, set up domain + contact form.
- **Blockers (Needs-Nate):** Fill [INPUT: …] slots (prices, turnaround, founder bios/photos/credentials, whyBcns), first real past-work entry, domain + deploy. None block Section 2.
- **Blockers (Needs-Nate):** Domain, inbox/form provider, real content (INPUT slots), legal text, deploy — all deferred. None block Section 1.
- **Last updated:** 2026-07-14 (v2 plan started — dev-team-auto run)

---

## Milestone status

### v1 Section 1 — Architecture (complete, old plan A1-A4)
| Item | Status | Notes |
|------|--------|-------|
| A1 — Content-model data layer | ✅ done [full] — typed `siteContent` registry in `lib/content.ts`; all 6 sections refactored; [SLOT] placeholders throughout; 3754173 |
| A2 — Scaffold missing sections | ✅ done [full] — 5 new data-driven sections (past-work, reviews, pricing, faq, about-founder), registry extended, nav updated to 10 entries; 0f561f0 |
| A3 — CONTENT.md spec + slot audit | ✅ done [light] — 118-slot CONTENT.md authored, 1:1 verified against registry, guides included; 9a62a62 |
| A4 — Legal pages + config scaffolding | ✅ done [light] — /privacy + /terms stub pages, footer links wired, sitemap updated, site.ts config confirmed; 0b082ee |

### v2 Section 1 — Restructure + copy (dev-team-auto, current run)
| Item | Status | Notes |
|------|--------|-------|
| B1 — Multi-page routing + thin home | ✅ done [full] — 4 new routed pages, thin home (hero+navCards+contact), nav page-links, sitemap updated, 4-card NavCards incl. About, fetch timeout fix; c8ebab4 |
| B2 — Registry rework: nav cards, two-founder about, pricing shape, /work holding state | ✅ done [full] — NavCardsContent, AboutContent (2-founder), HoldingState+ctaHref, 3-tier pricing; e6fc921 |
| B3 — Wire the drafted copy | ✅ done [light] — all [SLOT:] replaced with appendix copy, [INPUT:] slots for unknowns, zero SLOT on rendered pages; 08f533e |
| B4 — CONTENT.md + trackers updated | ✅ done [light] — CONTENT.md rewritten 1:1 with registry (77 fields), flip instructions + [INPUT:] convention documented; e6642bc |

### v2 Section 2 — Visual pass (layout-loop, cowork)
| Item | Status | Notes |
|------|--------|-------|
| V1 — `/` home visual pass | ✅ done — nav card accent circle arrow, hero padding tightened; baa9238 |
| V2 — `/services` visual pass | ✅ done — UseCases before HowItWorks, Sparkles on AI card; 70a87b5 |
| V3 — `/pricing` visual pass | ✅ done — AI consulting card differentiated, feature checkmarks; 97e4af0 |
| V4 — `/about` visual pass | ✅ done — name text-xl, role accent, credential dot bullets, whyBcns centered; 965a5ab |
| V5 — `/work` visual pass | ✅ done — both holding states promoted to bordered panels with icons; 953a7ab |

Legend: ⬜ Not started · 🟡 In progress · ✅ Done · ⛔ Blocked

---

## How to update this file (agent instructions)
1. When you start an item, set **Current position → Next** to it and mark its row 🟡.
2. When you finish, flip the item's `status:` in `PLAN.md` and its row here to `✅ done [track] — [one-line summary + commit hash]`, then append a dated log entry below with what changed and any follow-ups discovered (add follow-ups to `PLAN.md` too).
3. When every Section 1 item is done, advance the pointer to the STOP-HERE marker; Section 2 (layout-loop) is launched separately in cowork.
4. Record decisions made mid-build (registry shape, section naming, etc.) both here (log) and in the relevant `PLAN.md` section.
5. Note blockers in **Blockers** immediately; don't silently stall. A blocked item does not stop the run.

---

## Log (newest first)

- **2026-07-14** — 🔄 **v2 plan started** on branch `experimental-v2`. PLAN.md updated to v2 — multi-page site with real drafted copy. Items A1-A4 (v1 architecture) remain done on prior branch `worktree-experimental-overnight-first-draft`. v2 plan B1-B4 starts fresh from the current single-page-app state on `experimental-v2`. Base: all components + registry + legal pages from A1-A4 work are merged in.

- **2026-07-13** — 📋 **PLAN.md + PROGRESS.md created** via a `/grilling` session on branch `worktree-experimental-overnight-first-draft`. Resolved: company name `bcns` final; `bcns.com` taken (domain/email stay placeholders, Needs-Nate); goal is a reusable/scalable **template** (structure + on-brand visuals, content as labeled `[X GOES HERE]` slots, not finished copy); full IA fixed at 11 sections (added Past work, Reviews, Pricing, FAQ, About/founder; Process folded into How-it-works). Run structured in two sections split by the STOP-HERE marker: Section 1 = `dev-team-auto` architecture-only (structure/data/slots, no styling, `dt-engineer` not `dt-ui`); Section 2 = `layout-loop` full visual first draft in cowork. Content spec lives both in a data registry and a mirrored `CONTENT.md`. Rest of the repo (`templates/`, product-building) explicitly out of scope. No code written yet — awaiting the orchestrated run (prompt pasted into a cowork session).
