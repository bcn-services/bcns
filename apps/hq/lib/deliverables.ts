/**
 * deliverables.ts — the Leads Pitch tab's data side. Every step button inserts one `deliverables` row
 * (kind pitch | quote, feedback text) as the signed-in user; the droplet job claims it and writes the
 * files under os clients/<slug>/. Step state is read back from the rows, never held in the UI.
 * No next/* imports: tests import this directly and DB functions take the Supabase client as a parameter.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { isUuid, type Actor } from "./leads";

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
// The step rides in `feedback` (the row has no step column). The job fences it as data and the /demo
// and /quote skills read it; pitchState() reads the same prefixes back to tell the rows apart.
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
  /** Newest row of each step (rows come newest first). */
  protos?: Deliverable;
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
const isDeck = (r: Deliverable) => r.kind === "pitch" && !!r.feedback?.startsWith(TAG.deck);

/** Where each step stands, from the rows (newest first) and the lead. `can` is the one rule both the buttons and the action use. */
export function pitchState(
  rows: Deliverable[],
  lead: { stage: string; consult_at: string | null }
): PitchState {
  const protos = rows.find((r) => r.kind === "pitch" && !isDeck(r));
  const deck = rows.find(isDeck);
  const quote = rows.find((r) => r.kind === "quote");
  const busy = rows.some((r) => r.status === "queued" || r.status === "running");
  const review = protos?.status === "done" && (!deck || deck.status === "failed");
  const pick = /Chosen prototype: demo-([abc])\.html/.exec(deck?.feedback ?? "")?.[1] as Proto | undefined; // the regex allows only a|b|c
  return {
    protos,
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
function must<T extends { error: { message: string } | null }>(res: T): T {
  if (res.error) throw new Error(res.error.message);
  return res;
}

/** Rows for a page of leads' slugs, newest first, grouped by slug (100 slugs per query). */
export async function loadDeliverables(sb: Sb, slugs: string[]): Promise<Map<string, Deliverable[]>> {
  const out = new Map<string, Deliverable[]>();
  const uniq = [...new Set(slugs)];
  for (let i = 0; i < uniq.length; i += 100) {
    const res = must(
      await sb.from("deliverables").select(DELIVERABLE_COLS).in("slug", uniq.slice(i, i + 100)).order("created_at", { ascending: false })
    );
    // untyped client: DELIVERABLE_COLS is the shape
    for (const r of (res.data ?? []) as Deliverable[]) (out.get(r.slug) ?? out.set(r.slug, []).get(r.slug)!).push(r);
  }
  return out;
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

/**
 * Names the lead's slug the first time, so the job's lookup (businesses.os_slug = slug) finds it. The
 * name-only slug is tried first; a clash with another business (unique os_slug) falls back to name + town,
 * then name + id prefix.
 */
async function ensureSlug(sb: Sb, l: LeadFacts): Promise<string> {
  const own = leadSlug(l);
  if (own) return own;
  for (const slug of [slugify(l.name), slugify(`${l.name} ${l.town ?? ""}`), `${slugify(l.name).slice(0, 56)}-${l.id.slice(0, 6)}`]) {
    const r = await sb.from("businesses").update({ os_slug: slug }).eq("id", l.id).is("os_slug", null).select("id");
    if (!r.error && r.data?.length) return slug;
    if (!r.error) {
      // someone named it between our read and write: use theirs
      const cur = await sb.from("businesses").select("os_slug").eq("id", l.id).maybeSingle();
      const s = (cur.data as { os_slug: string | null } | null)?.os_slug;
      if (s && SLUG_RE.test(s)) return s;
    }
  }
  throw new Error("could not name this lead's folder");
}

/** One step button = one queued row, as the signed-in user (RLS: is_hq(), status queued, requested_by = me). */
export async function requestStep(
  sb: Sb,
  actor: Actor,
  input: { businessId: string; step: string; pick?: string; feedback?: string }
): Promise<{ id: string; slug: string; kind: Kind }> {
  const { step } = input;
  if (!(STEPS as readonly string[]).includes(step)) throw new Error("unknown step");
  if (!isUuid(input.businessId)) throw new Error("bad lead id");
  const fb = input.feedback ?? "";
  if (typeof fb !== "string" || fb.length > FEEDBACK_MAX) throw new Error(`feedback is limited to ${FEEDBACK_MAX} characters`);
  if (step === "deck" && !(PROTOS as readonly string[]).includes(String(input.pick))) throw new Error("pick a prototype");
  const kind: Kind = step === "quote" ? "quote" : "pitch";

  const { data } = must(await sb.from("businesses").select(LEAD_FACTS).eq("id", input.businessId).maybeSingle());
  const lead = data as LeadFacts | null;
  if (!lead) throw new Error("lead not found");
  const slug0 = leadSlug(lead); // null = never requested, so no rows
  const rows = slug0 ? ((await loadDeliverables(sb, [slug0])).get(slug0) ?? []) : [];
  if (!pitchState(rows, lead).can[step as Step]) throw new Error("that step is not available yet, or one is still running");

  const slug = await ensureSlug(sb, lead);
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
