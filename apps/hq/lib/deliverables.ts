/**
 * deliverables.ts — the Leads Pitch tab's data side. Every step button inserts one `deliverables` row
 * (kind pitch | quote, feedback text) as the signed-in user; the droplet job claims it and writes the
 * files under os clients/<slug>/. Step state is read back from the rows, never held in the UI.
 * No next/* imports: tests import this directly and DB functions take the Supabase client as a parameter.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { canLog, isUuid, type Actor } from "./leads";

type Sb = SupabaseClient;

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/; // = deliverables_slug_check (0032)
export const FEEDBACK_MAX = 2000;
export type Kind = "pitch" | "quote";
export type Status = "queued" | "running" | "done" | "failed";
export type Step = "prototypes" | "redo" | "deck" | "quote";
export const STEPS: readonly Step[] = ["prototypes", "redo", "deck", "quote"];
export const PROTOS = ["a", "b", "c"] as const;
export type Proto = (typeof PROTOS)[number];

export interface Deliverable {
  id: string;
  slug: string;
  kind: Kind;
  status: Status;
  feedback: string | null;
  paths: string[];
  error: string | null;
  created_at: string;
  finished_at: string | null;
}
export const DELIVERABLE_COLS = "id, slug, kind, status, feedback, paths, error, created_at, finished_at";

// ---- slug -----------------------------------------------------------------------------------
/** "Bayside Tax & Bookkeeping" -> "bayside-tax-bookkeeping" (matches SLUG_RE; "lead" if nothing is left). */
export function slugify(s: string): string {
  const out = s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, 63)
    .replace(/-+$/, "");
  return out || "lead";
}
/** The folder a lead's files live in: only once HQ (or onboarding) has named it, so a clash can never show another lead's files. */
export const leadSlug = (l: { os_slug?: string | null }): string | null =>
  l.os_slug && SLUG_RE.test(l.os_slug) ? l.os_slug : null;

// ---- what the job is told -------------------------------------------------------------------
// The step rides in `feedback` (the row has no step column). The job (jobs/deliverable.mjs splitFeedback)
// lifts exact-matched TAG / pick lines into a run instruction outside the data fence and fences the rest, so
// TAG must stay byte-identical to the job's STEPS keys (the job test checks it); pitchState() reads the same
// prefixes back to tell the rows apart.
export const TAG = {
  prototypes: "Step: pitch prototypes (3 variants).",
  redo: "Step: redo the 3 pitch prototypes with the feedback below.",
  deck: "Step: final pitch deck (demo.html + video-guide.md).",
  quote: "Step: draft the quote after a good consult.",
} as const;
const CHOSEN = "Chosen prototype: demo-";

export function feedbackFor(step: Step, o: { pick?: Proto; feedback?: string } = {}): string {
  const fb = o.feedback?.trim();
  return [TAG[step], step === "deck" && o.pick ? `${CHOSEN}${o.pick}.html.` : "", fb ? `Feedback: ${fb}` : ""]
    .filter(Boolean)
    .join("\n");
}

// ---- state ----------------------------------------------------------------------------------
export interface PitchState {
  /** Newest row of each step (rows come newest first); protos prefers the newest done row over a newer failed one, so a failed redo never hides the last good demos. */
  protos?: Deliverable;
  /** A failed prototypes row newer than the done `protos` (a failed redo): shown as one line above the thumbnails. */
  redoFailed?: Deliverable;
  deck?: Deliverable;
  quote?: Deliverable;
  /** Prototype the deck was asked from. */
  picked?: Proto;
  busy: boolean;
  can: Record<Step, boolean>;
}
/** A consult is on the books (or already held): the quote step opens. */
export const consultBooked = (l: { stage: string; consult_at: string | null }): boolean =>
  !!l.consult_at || ["consult_scheduled", "consult_done", "quoting"].includes(l.stage);
/** What the deck step offers once the deck is done and no consult is booked: the Log-a-call consult form (it only renders on loggable stages) or, anywhere else, a pointer to the stage control. Never a button with no form behind it. */
export const consultOffer = (l: { stage: string; consult_at: string | null }): "booked" | "book" | "stage" =>
  consultBooked(l) ? "booked" : canLog(l.stage) ? "book" : "stage";
const isDeck = (r: Deliverable) => r.kind === "pitch" && !!r.feedback?.startsWith(TAG.deck);

/** Where each step stands, from the rows (newest first) and the lead. `can` is the one rule both the buttons and the action use. */
export function pitchState(
  rows: Deliverable[],
  lead: { stage: string; consult_at: string | null }
): PitchState {
  const protoRows = rows.filter((r) => r.kind === "pitch" && !isDeck(r));
  const newest = protoRows[0];
  const doneRow = protoRows.find((r) => r.status === "done");
  const protos = newest?.status === "failed" && doneRow ? doneRow : newest;
  const redoFailed = newest?.status === "failed" && doneRow ? newest : undefined;
  const deck = rows.find(isDeck);
  const quote = rows.find((r) => r.kind === "quote");
  const busy = rows.some((r) => r.status === "queued" || r.status === "running");
  const review = protos?.status === "done" && (!deck || deck.status === "failed");
  const pick = /Chosen prototype: demo-([abc])\.html/.exec(deck?.feedback ?? "")?.[1] as Proto | undefined; // the regex allows only a|b|c
  return {
    protos,
    redoFailed,
    deck,
    quote,
    picked: pick,
    busy,
    can: {
      prototypes: !busy && (!protos || protos.status === "failed"),
      redo: !busy && review,
      deck: !busy && review,
      quote: !busy && consultBooked(lead) && deck?.status === "done" && (!quote || quote.status === "failed"),
    },
  };
}

// ---- files ----------------------------------------------------------------------------------
const clean = (slug: string, p: string) =>
  p.startsWith(`clients/${slug}/`) && !p.split("/").some((s) => s === ".." || s === "." || s === "" || s.startsWith("."));

/** The row's own path for a file name when it recorded one, else (pitch files have fixed names) the default. */
export function pathFor(slug: string, row: Deliverable | undefined, file: string, dir: "demo" | "quote"): string | null {
  const own = row?.status === "done" ? row.paths.find((p) => clean(slug, p) && p.endsWith(`/${file}`)) : undefined;
  return own ?? (dir === "demo" ? `clients/${slug}/demo/${file}` : null);
}
/** First recorded path with this extension (quote files are named <DATE>-<slug>.<ext>). */
export const pathExt = (slug: string, row: Deliverable | undefined, ext: string): string | null =>
  (row?.status === "done" && row.paths.find((p) => clean(slug, p) && p.endsWith(ext))) || null;

/** HQ's file route serves clients/... at /files/clients/...; each segment encoded. */
export const fileHref = (path: string): string => "/files/" + path.split("/").map(encodeURIComponent).join("/");

const PRINT_CSS =
  "@media print{@page{margin:12mm}html,body{background:#fff!important}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}.no-print,nav{display:none!important}}";
/** The deck's HTML with a print stylesheet and a script that opens the print dialog once it has loaded. Runs in a sandboxed iframe (no allow-same-origin). */
export function withPrint(html: string): string {
  const inject = `<style>${PRINT_CSS}</style><script>addEventListener("load",function(){setTimeout(function(){window.print()},300)});addEventListener("afterprint",function(){parent.postMessage("hq-print-done","*")})</script>`;
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, () => inject + "</body>") : html + inject;
}

// ---- DB -------------------------------------------------------------------------------------
// keeps the PostgREST/Postgres error code on the thrown Error so callers can tell "no such table" from a real failure
function must<T extends { error: { message: string; code?: string } | null }>(res: T): T {
  if (res.error) throw Object.assign(new Error(res.error.message), { code: res.error.code });
  return res;
}
const MISSING_TABLE = ["42P01", "PGRST205"]; // Postgres undefined_table, PostgREST schema-cache miss
/** The `deliverables` table is not there (0032 not applied): the only load error the Pitch tab may swallow. */
export const isMissingTable = (e: unknown): boolean => e instanceof Error && "code" in e && MISSING_TABLE.includes(String(e.code));

/** Rows for a page of leads' slugs, newest first, grouped by slug (100 slugs per query). */
export async function loadDeliverables(sb: Sb, slugs: string[]): Promise<Map<string, Deliverable[]>> {
  const out = new Map<string, Deliverable[]>();
  const uniq = [...new Set(slugs)];
  const parts: string[][] = [];
  for (let i = 0; i < uniq.length; i += 100) parts.push(uniq.slice(i, i + 100));
  const res = await Promise.all(
    parts.map((part) => sb.from("deliverables").select(DELIVERABLE_COLS).in("slug", part).order("created_at", { ascending: false }))
  );
  for (const r of res)
    // untyped client: DELIVERABLE_COLS is the shape
    for (const d of (must(r).data ?? []) as Deliverable[]) (out.get(d.slug) ?? out.set(d.slug, []).get(d.slug)!).push(d);
  return out;
}

/**
 * The page's Pitch rows. A missing table is an empty history; any other failure comes back as `error`
 * (the tab shows it and turns the steps off) so a lead with a running deck never reads as untouched.
 */
export async function loadPitchRows(sb: Sb, slugs: string[]): Promise<{ rows: Map<string, Deliverable[]>; error: string }> {
  try {
    return { rows: await loadDeliverables(sb, slugs), error: "" };
  } catch (e) {
    return { rows: new Map(), error: isMissingTable(e) ? "" : e instanceof Error ? e.message : "could not load" };
  }
}

interface LeadFacts {
  id: string;
  name: string;
  town: string | null;
  os_slug: string | null;
  stage: string;
  consult_at: string | null;
}
const LEAD_FACTS = "id, name, town, os_slug, stage, consult_at";

/** Does clients/<slug> already exist in the os clone? Injected: only the server action can read the disk (this module also ships to the browser). */
export type FolderExists = (slug: string) => Promise<boolean>;
const badSlug = (s: string) =>
  new Error(`this lead's folder name "${s.slice(0, 80)}" is not a valid slug (lowercase letters, digits and dashes, at most 63); fix businesses.os_slug by hand`);

/**
 * Names the lead's slug the first time, so the job's lookup (businesses.os_slug = slug) finds it. Tries
 * name + town, then name + id prefix, and skips any name that is already an HQ client or an existing
 * folder in the os clone (clients/<slug>): the job would otherwise write into a real client's folder.
 */
async function ensureSlug(sb: Sb, l: LeadFacts, folderExists: FolderExists): Promise<string> {
  const own = leadSlug(l);
  if (own) return own;
  if (l.os_slug) throw badSlug(l.os_slug);
  const cands = [...new Set([slugify(`${l.name} ${l.town ?? ""}`), `${slugify(l.name).slice(0, 56).replace(/-+$/, "")}-${l.id.slice(0, 6)}`])];
  const clients = must(await sb.from("clients").select("slug").in("slug", cands));
  const isClient = new Set(((clients.data ?? []) as { slug: string }[]).map((c) => c.slug)); // untyped client: the select is the shape
  for (const slug of cands) {
    if (isClient.has(slug) || (await folderExists(slug))) continue;
    const r = await sb.from("businesses").update({ os_slug: slug }).eq("id", l.id).is("os_slug", null).select("id");
    if (r.error) {
      if (r.error.code === "23505") continue; // another business already has this os_slug
      throw new Error(r.error.message);
    }
    if (r.data?.length) return slug;
    // someone named it between our read and write: use theirs
    const cur = await sb.from("businesses").select("os_slug").eq("id", l.id).maybeSingle();
    const s = (cur.data as { os_slug: string | null } | null)?.os_slug;
    if (s) {
      if (SLUG_RE.test(s)) return s;
      throw badSlug(s);
    }
  }
  throw new Error("could not name this lead's folder: every candidate is taken");
}

/** One step button = one queued row, as the signed-in user (RLS: is_hq(), status queued, requested_by = me). */
export async function requestStep(
  sb: Sb,
  actor: Actor,
  input: { businessId: string; step: string; pick?: string; feedback?: string },
  folderExists: FolderExists = async () => false
): Promise<{ id: string; slug: string; kind: Kind }> {
  const { step } = input;
  if (!(STEPS as readonly string[]).includes(step)) throw new Error("unknown step");
  if (!isUuid(input.businessId)) throw new Error("bad lead id");
  const fb = input.feedback ?? "";
  if (typeof fb !== "string" || fb.length > FEEDBACK_MAX) throw new Error(`feedback is limited to ${FEEDBACK_MAX} characters`);
  if (step === "redo" && !fb.trim()) throw new Error("say what to change before asking for a redo");
  if (step === "deck" && !(PROTOS as readonly string[]).includes(String(input.pick))) throw new Error("pick a prototype");
  const kind: Kind = step === "quote" ? "quote" : "pitch";

  const { data } = must(await sb.from("businesses").select(LEAD_FACTS).eq("id", input.businessId).maybeSingle());
  const lead = data as LeadFacts | null;
  if (!lead) throw new Error("lead not found");
  if (lead.os_slug && !leadSlug(lead)) throw badSlug(lead.os_slug); // not a silent "step not available"
  const slug0 = leadSlug(lead); // null = never requested, so no rows
  const rows = slug0 ? ((await loadDeliverables(sb, [slug0])).get(slug0) ?? []) : [];
  if (!pitchState(rows, lead).can[step as Step]) throw new Error("that step is not available yet, or one is still running");

  const slug = await ensureSlug(sb, lead, folderExists);
  const ins = await sb
    .from("deliverables")
    .insert({
      slug,
      kind,
      requested_by: actor.id,
      // step and pick were checked against STEPS / PROTOS above
      feedback: feedbackFor(step as Step, { pick: input.pick as Proto, feedback: fb }),
    })
    .select("id")
    .single();
  if (ins.error) throw new Error(ins.error.message);
  return { id: (ins.data as { id: string }).id, slug, kind };
}
