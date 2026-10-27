// Qualification: one page fetch pair, at most one Claude call, per business.
//
// Qualify is a fit scorer for the bcns Connect niche, not an email finder. A
// row PASSES only if (a) the site shows at least MIN_SIGNALS of the four
// signals in lib/signals.mjs, detected by CODE from the raw HTML, and (b) it
// has a phone number to dial. Pass -> `qualified` with research.fit_score;
// anything else -> `lost` with research.lost_reason ('unfit' | 'no_phone' |
// 'fetch_failed' | 'qualify_failed').
//
// Scoring: the `claude` CLI adds a niche read on top of the code signals
// (research.scored_by = 'claude'). If the CLI is absent, errors, times out or
// answers with something unparseable, the row is scored by code alone
// (scored_by = 'code'). The gate never depends on the model either way.
//
// `research` is written as a real jsonb object (lib/db.mjs wraps it in
// sql.json); reads tolerate the legacy double-encoded string too.

import { trim } from "./lib/trim.mjs";
import { evidence, countSignals, SIGNAL_KEYS } from "./lib/signals.mjs";
import { TRADES } from "./lib/grid.mjs";

export const CONTACT_PATHS = ["/contact", "/contact-us", "/about"];

// The hard gate: signals detected in the HTML by code. A model-reported signal
// with no code evidence does not count, so an over-eager model cannot pass a row.
export const MIN_SIGNALS = 2;

export const PROMPT = `You are reading the website of a small business for bcns, which builds custom
operations software (online ordering, booking, invoicing, client portals) for
professional-service firms (accounting, bookkeeping, tax, insurance, law,
agencies, consultancies, staffing, architecture/engineering, real estate and
property management) and online small businesses (online stores, DTC brands,
specialty retail, wholesalers).

Return ONLY minified JSON of this exact shape:
{"owner_name": string|null, "facts": string[], "signals": {"store": boolean, "booking": boolean, "payments": boolean, "marketing": boolean}, "headcount_band": "1-5"|"6-20"|"21-50"|"51+"|null, "locations": number|null, "fit_score": number, "reason": string}

Rules:
- "owner_name" is the first name of a named owner/founder ONLY if the page text
  states it explicitly (e.g. "owned by Dave Miller", "founder: Sarah Chen").
  Never infer, guess, or take it from a generic staff/team list without a role
  tying them to ownership. No name stated means null — never a guess.
- "facts" is three to five specific, checkable things about THIS business drawn
  from the page — services, years in business, towns served, named staff,
  certifications. No generic filler. Phrase each fact as a predicate that
  completes the sentence "<business name> ..." and starts with a verb, e.g.
  "has served Milford since 1998", "is GAF Master Elite certified",
  "offers 24-hour emergency repairs". Never start a fact with the business name.
- "signals" says whether the page shows each of: store (online store or
  ordering platform), booking (booking/scheduling widget or client portal/
  login), payments (accounting or online-payment link), marketing (ad/analytics
  tags, email-marketing tools, active social links). Judge only from the text.
- "headcount_band" is your best read of how many people work there; null if the
  page gives no hint. "locations" is the number of physical locations; a
  franchise or national chain counts as 3 or more; null if unclear.
- "fit_score" is 0-100: how well this business matches the niche above and how
  much manual, repeatable work (booking, follow-ups, intake, invoicing, order
  handling) automation could take off their plate. An existing website is
  irrelevant to this. "reason" is one sentence saying why.

PAGE TEXT:
`;

// The page text is stored on the row so `pitch` can build a pitch from what
// qualify already read, months later, without fetching the site again. Capped
// because a research blob is read back into prompts and an uncapped page is an
// uncapped bill; 20k is well above what `trim` returns for a real site.
export const PAGE_TEXT_MAX = 20_000;

// The prompt asks for minified JSON and usually gets it, but a model handed
// something it cannot work with answers in prose about that instead, and a
// helpful one wraps the object in a ```json fence. Neither is a reason to lose
// the row, so the first balanced object in the answer is what counts.
export function parseAnswer(answer) {
  if (typeof answer !== "string") return answer;
  try {
    return JSON.parse(answer);
  } catch {
    const start = answer.indexOf("{");
    const end = answer.lastIndexOf("}");
    if (start === -1 || end <= start) {
      throw new Error(`no JSON in the model's answer: ${answer.slice(0, 200)}`);
    }
    return JSON.parse(answer.slice(start, end + 1));
  }
}

// Reads tolerate both encodings: a real object, or the legacy jsonb string
// holding JSON. Anything else is treated as empty.
function parseResearch(research) {
  let v = research;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return {};
    }
  }
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
}

// --- the score --------------------------------------------------------------
// fit_score, an integer 0-100, written to research.fit_score as a JSON number
// (the digest and the promotion query sort it numerically):
//
//   signals    20 each of the CODE-detected four (a passing row has 2-4: 40-80)
//   niche      0-6    the model's niche read (its 0-100 fit_score * 0.06)
//   headcount  +5     headcount band starts at or below 20 people
//   single     +5     exactly one location
//   geography  +0.3 CT, +0.2 NYC metro (NY/NJ), +0.1 CA, 0 elsewhere
//
// Everything but signals and geography is a whole number and sums to at most
// 16 < 20, so one more signal always outranks every other factor combined.
// Geography totals under 1 point, so it is a pure tiebreak: it can never beat
// a one-point difference in any other factor. A chain or franchise (3+
// locations) is capped at 20, below the 40 floor of any non-chain row that
// passes the gate. Still a JSON number (one decimal), sorted numerically.
export const CHAIN_CAP = 20;

export function fitScore({ signals, nicheScore, headcountBand, locations, state }) {
  const count = countSignals(signals);
  const niche = Math.round(Math.min(100, Math.max(0, Number(nicheScore) || 0)) * 0.06);
  const small = Number.parseInt(String(headcountBand ?? ""), 10) <= 20 ? 5 : 0;
  const single = locations === 1 ? 5 : 0;
  const st = String(state ?? "").toUpperCase();
  // Tenths, so the sum stays exact: 98.3, never 98.30000000000001.
  const geoTenths = st === "CT" ? 3 : st === "NY" || st === "NJ" ? 2 : st === "CA" ? 1 : 0; // ponytail: state-level NYC metro — refine by town if NJ/upstate NY rows crowd the list
  const score = (20 * count + niche + small + single) * 10 + geoTenths;
  return Math.min(100, locations >= 3 ? Math.min(score / 10, CHAIN_CAP) : score / 10);
}

// A site that fails this many ticks running is a dead site, not a flaky one.
export const MAX_QUALIFY_FAILURES = 3;

export const DEFAULT_BUDGET_MS = 20 * 60 * 1000;

// Per-run row cap. The time guard (budgetMs) is what actually bounds a run;
// this only has to sit above what one budget can get through.
export const DEFAULT_LIMIT = 150;

// Target call_due rows promoted per UTC day (the digest-less HQ call queue).
export const CALL_TASKS_PER_DAY = 50;

// Code-only niche read: the grid only sources niche categories, so a row whose
// trade is still in the grid gets a flat middling niche score. No model, no
// headcount or location read. ponytail: flat niche read — refine if code-only
// rows ever dominate the call list.
export const CODE_NICHE = 50;

export async function run({
  sql,
  db,
  fetchPage,
  claude, // optional: absent -> every row is scored by code alone
  limit = DEFAULT_LIMIT,
  contactPaths = CONTACT_PATHS,
  budgetMs = DEFAULT_BUDGET_MS,
  // When the process must be done, set once by main() in jobs/run.mjs. The loop
  // gets min(budgetMs, time left to it) so a slow run cannot be killed
  // mid-qualify with its promotion step never reached. Unset: budgetMs alone.
  deadline,
  clock = () => Date.now(),
  callTasksPerDay = CALL_TASKS_PER_DAY,
} = {}) {
  const log = (kind, detail) => db.logEvent(sql, "qualify", kind, detail);

  // A missing fetcher is a skipped event, never a throw.
  if (!fetchPage) {
    await log("skipped", { reason: "missing deps: fetchPage" });
    return {
      qualified: 0,
      lost: 0,
      errors: 0,
      skipped: ["fetchPage"],
      promoted: 0,
      timedOut: false,
    };
  }

  const businesses = await db.sourcedBacklog(sql, { limit });

  let qualified = 0;
  let lost = 0;
  let skipped = 0;
  let errors = 0;
  let timedOut = false;
  // moved: a stage write for the current row already landed, so a later throw
  // (a log) must not rewrite it. Reset per row.
  let moved = false;
  // The claude CLI is an optional enhancement: the first THROWN call (ENOENT,
  // expired token, usage limit, timeout) is an outage, so the rest of the run
  // is code-only rather than burning a 120 s timeout per row.
  let model = claude ?? null;

  if (!businesses.length) {
    await log("skipped", { reason: "no businesses at stage sourced" });
  }

  // Parks a row that cannot be a call task: stage `lost`, the reason on the
  // row's research so a human (or a later rubric change) can find it again.
  const lose = async (b, reason, detail = {}, extra = {}) => {
    await db.updateBusiness(sql, b.id, {
      stage: "lost",
      research: { ...parseResearch(b.research), ...extra, lost_reason: reason },
    });
    moved = true;
    lost++;
    await log("lost", { business: b.id, reason, ...detail });
  };

  // Counts a failed attempt on the row's research. The write bumps updated_at,
  // which rotates the row to the back of sourcedBacklog; at the cap the row is
  // parked as `lost`. Two separate counters: FETCH is the site's fault (dead,
  // blocked); QUALIFY_ERRORS is everything after a good fetch (parse,
  // validation, DB) and must not be charged to the site. A failing counter
  // write must never mask the original error or end the run.
  const FETCH = {
    counter: "qualify_failures",
    lostReason: "fetch_failed",
    why: "site unreachable",
  };
  const QUALIFY_ERRORS = {
    counter: "qualify_errors",
    lostReason: "qualify_failed",
    why: "qualify failed",
  };
  const recordFailure = async (b, { counter, lostReason, why } = FETCH) => {
    try {
      const research = parseResearch(b.research);
      const failures = (research[counter] ?? 0) + 1;
      if (failures >= MAX_QUALIFY_FAILURES) {
        await db.updateBusiness(sql, b.id, {
          stage: "lost",
          research: { ...research, [counter]: failures, lost_reason: lostReason },
        });
        await log("lost", {
          business: b.id,
          reason: `${why} after ${MAX_QUALIFY_FAILURES} attempts`,
        });
      } else {
        await db.updateBusiness(sql, b.id, { research: { ...research, [counter]: failures } });
      }
    } catch {
      // The row stays at sourced and is retried; the error event is already written.
    }
  };

  const startedAt = clock();
  const budget = deadline == null ? budgetMs : Math.min(budgetMs, deadline - startedAt);

  for (const b of businesses) {
    if (clock() - startedAt >= budget) {
      timedOut = true;
      break;
    }
    // fetched: the fetch phase finished, so a later throw (parsing, DB) is not
    // the site's fault: it counts as a qualify error, not a fetch failure.
    let fetched = false;
    moved = false;
    try {
      // Hard gate 2: a call task with no number to dial is worthless. Checked
      // before any fetch so a phoneless row costs nothing.
      if (!String(b.phone ?? "").trim()) {
        await lose(b, "no_phone");
        continue;
      }
      // No website: no signals to detect, so it cannot clear the signal gate.
      if (!b.domain) {
        await lose(b, "unfit", { detail: "no domain" });
        continue;
      }
      const home = await fetchPage(homepage(b));
      let contact = "";
      for (const path of contactPaths) {
        try {
          contact = await fetchPage(homepage(b) + path);
          if (contact) break;
        } catch {
          // A missing contact page is normal, not a failure of the business.
        }
      }

      const text = `${trim(home)}\n\n${trim(contact)}`.trim();
      fetched = true;

      // No page text is not a business to judge, it is a fetch that failed —
      // a dead site, a bot wall, a redirect loop. The row stays at `sourced`
      // until it has failed MAX_QUALIFY_FAILURES times.
      if (!text) {
        skipped++;
        await log("skipped", {
          business: b.id,
          name: b.name,
          reason: "page fetch returned no text",
        });
        await recordFailure(b);
        continue;
      }

      // Hard gate 1, by code, on the RAW html (pixels and widgets live in the
      // tags `trim` strips). Below the gate the row can never pass whatever the
      // model would say, so the Claude call is not spent.
      const found = evidence(`${home}\n${contact}`);
      const signals = Object.fromEntries(SIGNAL_KEYS.map((k) => [k, found[k].length > 0]));
      if (countSignals(signals) < MIN_SIGNALS) {
        await lose(
          b,
          "unfit",
          { signals: countSignals(signals) },
          { signals, signal_evidence: found }
        );
        continue;
      }

      // The model read, if there is a model and it answers. Any failure here
      // (throw, unparseable answer) drops this row to the code-only score.
      let parsed = null;
      if (model) {
        let answer;
        try {
          answer = await model.ask(PROMPT + text);
        } catch (err) {
          model = null;
          await log("error", {
            business: b.id,
            name: b.name,
            error: `claude unavailable, scoring by code: ${String(err?.message ?? err).slice(0, 200)}`,
          });
        }
        if (answer !== undefined) {
          try {
            parsed = parseAnswer(answer);
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) parsed = null;
          } catch (err) {
            await log("error", {
              business: b.id,
              name: b.name,
              error: `claude answer unusable, scored by code: ${String(err?.message ?? err).slice(0, 200)}`,
            });
          }
        }
      }

      const state = b.state;
      let fields;
      if (parsed) {
        const headcountBand =
          typeof parsed.headcount_band === "string" ? parsed.headcount_band : null;
        const locations = Number.isFinite(parsed.locations) ? parsed.locations : null;
        const nicheScore = Number(parsed.fit_score);
        const ownerName = typeof parsed.owner_name === "string" ? parsed.owner_name.trim() : "";
        fields = {
          scored_by: "claude",
          facts: Array.isArray(parsed.facts) ? parsed.facts : [],
          fit_score: fitScore({ signals, nicheScore, headcountBand, locations, state }),
          // What the model claimed, kept to spot regex gaps; it never gates or scores.
          signals_model: parsed.signals ?? null,
          niche_score: Number.isFinite(nicheScore) ? nicheScore : null,
          headcount_band: headcountBand,
          locations,
          reason: parsed.reason ?? null,
          owner_name: ownerName || null,
        };
      } else {
        const nicheScore = TRADES.includes(b.trade) ? CODE_NICHE : 0;
        fields = {
          scored_by: "code",
          facts: [],
          fit_score: fitScore({ signals, nicheScore, headcountBand: null, locations: null, state }),
          niche_score: nicheScore,
        };
      }

      // fit_score is the number the call queue sorts by: from code, a JSON
      // number. businesses.fit_score is generated from it; never write that.
      await db.updateBusiness(sql, b.id, {
        stage: "qualified",
        research: {
          ...parseResearch(b.research),
          ...fields,
          signals,
          signal_evidence: found,
          page_text: text.slice(0, PAGE_TEXT_MAX),
        },
      });
      moved = true;
      qualified++;
      await log("qualified", {
        business: b.id,
        facts: fields.facts.length,
        signals: countSignals(signals),
        scored_by: fields.scored_by,
      });
    } catch (err) {
      errors++;
      await log("error", { business: b.id, name: b.name, error: String(err?.message ?? err) });
      try {
        // A post-fetch error must rotate the row too, or it sits at the head of
        // sourcedBacklog and burns a Claude call every run forever.
        if (!moved) await recordFailure(b, fetched ? QUALIFY_ERRORS : FETCH);
      } catch {
        // Counting failed; the row stays at sourced and is retried.
      }
    }
  }

  if (timedOut) {
    await log("skipped", {
      reason:
        "time guard — budgetMs or the process deadline exceeded, remaining rows stay at sourced",
    });
  }

  // Promotion runs every run regardless of whether there was a sourced backlog
  // above — the qualified pool fills from many past runs, and the call list has
  // to keep getting fed. Any UTC weekday: top up to callTasksPerDay promoted
  // today (counted from the `promoted` events below), best fit first.
  let promoted = 0;
  const day = new Date(clock()).getUTCDay();
  if (day !== 0 && day !== 6) {
    const [{ count: promotedSoFar = 0 } = {}] = (await db.promotedToday(sql)) ?? [];
    const need = callTasksPerDay - promotedSoFar;
    if (need > 0) {
      const rows = (await db.promoteQualified(sql, { limit: need })) ?? [];
      for (const row of rows) {
        promoted++;
        await log("promoted", { business: row.id });
      }
    }
  }

  return { qualified, lost, skipped, errors, promoted, timedOut };
}

function homepage(b) {
  if (!b.domain) throw new Error(`business ${b.id} has no domain`);
  return b.domain.startsWith("http") ? b.domain.replace(/\/$/, "") : `https://${b.domain}`;
}
