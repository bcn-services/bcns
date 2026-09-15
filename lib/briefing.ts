/**
 * briefing.ts — the Daily Briefing (DESIGN.md "Daily Briefing"): one Messages
 * call (no tools) over a JSON payload of yesterday's rows, gated by AI_ENABLED,
 * the API key, and the monthly budget in AI_MONTHLY_BUDGET_USD.
 *
 * Persistence is two record kinds via save_record:
 *   briefing      external_id `briefing:<day>`  body = the summary text
 *   briefing_run  one per call, unique id        body = {input_tokens, output_tokens, usd}
 * This month's spend is the sum of briefing_run `usd`. Covered by
 * tests/briefing.test.mjs.
 */

import type { DataClient } from "@bcn-services/data-client";
import type { AppConfig } from "./env";
import { maybeGetAiClient } from "./ai";
import { dailyReportLines, loadDailyReport, yesterdayInTimezone, type DailyReport } from "./daily-report";
import { addDaysYmd, todayInTimezone } from "./overview";

export const BRIEFING_KIND = "briefing";
export const BRIEFING_RUN_KIND = "briefing_run";
export const RATE_LIMIT_MS = 15 * 60_000;

/** USD per million tokens. A model missing here is refused, so a default-model
 *  bump in app-core can never be billed at the wrong rate against the cap. */
const PRICES_USD_PER_MTOK: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5": { input: 1, output: 5 },
};

const MAX_TOKENS = 1024;
const ROW_LIMIT = 200;
/** ponytail: one page of this month's runs. Hitting the limit reads as "spend
 *  unknown" (no call) rather than an undercount; page it if a client ever needs
 *  more than this many runs a month. */
const RUN_ROW_LIMIT = 1000;

const SYSTEM_PROMPT = [
  "You write the morning briefing for a small e-commerce business owner about yesterday.",
  "Use only the JSON data in the user message. Never invent or estimate numbers.",
  "Plain text: at most 6 short lines, each starting with '- '. No headings, no markdown.",
  "Lead with money (revenue, orders, ad spend, profit), then notable campaigns, tasks, meetings and activity.",
  "A figure shown as '—' or an empty list means no data: say so briefly instead of guessing.",
].join("\n");

export type SkipReason = "ai_off" | "key_missing" | "cap_unset" | "unpriced" | "spend_unknown" | "cap_reached" | "rate_limited";

/** One line shown in the panel and printed by `pnpm briefing`. */
export const SKIP_NOTES: Record<SkipReason, string> = {
  ai_off: "AI is off. The Daily Financial Report has yesterday's numbers.",
  key_missing: "No Anthropic API key is set. The Daily Financial Report has yesterday's numbers.",
  cap_unset: "No monthly AI budget is set. The Daily Financial Report has yesterday's numbers.",
  unpriced: "The AI model has no known price, so the budget can't be enforced. No briefing was generated.",
  spend_unknown: "This month's AI spend couldn't be checked, so no briefing was generated.",
  cap_reached: "This month's AI budget is used up. The Daily Financial Report has yesterday's numbers.",
  rate_limited: "A briefing was generated in the last 15 minutes. Try again later.",
};

/** The on-demand button's result line, from the `?briefing=` code the action
 *  redirects with. Unknown codes render nothing, so no free text reaches the page. */
export function briefingFlash(code: string | undefined): string | null {
  if (code === "saved") return "Briefing updated.";
  if (code === "failed") return "The briefing couldn't be generated. Try again later.";
  return code && Object.hasOwn(SKIP_NOTES, code) ? SKIP_NOTES[code as SkipReason] : null;
}

/* ------------------------------------------------------------------ gates */

/** The config-only reasons not to call the model, in the order they're checked. */
export function aiGate(config: Pick<AppConfig, "aiEnabled" | "anthropicApiKey" | "aiMonthlyBudgetUsd">): SkipReason | null {
  if (!config.aiEnabled) return "ai_off";
  if (!config.anthropicApiKey) return "key_missing";
  if (config.aiMonthlyBudgetUsd === undefined) return "cap_unset";
  return null;
}

/** At or over the cap stops the call: a cap of $5 with $5 spent is reached. */
export function capReached(spentUsd: number, capUsd: number): boolean {
  return spentUsd >= capUsd;
}

export function isRateLimited(latestRunAt: string | null, now: Date): boolean {
  if (!latestRunAt) return false;
  const t = Date.parse(latestRunAt);
  return Number.isFinite(t) && now.getTime() - t < RATE_LIMIT_MS;
}

export function tokensToUsd(model: string, inputTokens: number, outputTokens: number): number | null {
  const price = PRICES_USD_PER_MTOK[model];
  if (!price) return null;
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}

/* ------------------------------------------------------------------ spend */

export interface RunRow {
  occurred_at: string | null;
  body: string | null;
}

/** A run's recorded cost. ponytail: a malformed body counts as $0 — only this
 *  module writes briefing_run, and failing closed would let one bad row stop
 *  every briefing. */
export function runUsd(body: string | null): number {
  try {
    const usd = Number(JSON.parse(body ?? "")?.usd);
    return Number.isFinite(usd) && usd >= 0 ? usd : 0;
  } catch {
    return 0;
  }
}

function isValidTimestamp(ts: string | null): ts is string {
  return Boolean(ts) && Number.isFinite(Date.parse(ts as string));
}

/** Sum of runs in the client-local calendar month containing `now`. */
export function monthSpendUsd(runs: RunRow[], timezone: string, now: Date): number {
  const month = todayInTimezone(timezone, now).slice(0, 7);
  return runs
    .filter((r) => isValidTimestamp(r.occurred_at) && todayInTimezone(timezone, new Date(r.occurred_at)).startsWith(month))
    .reduce((sum, r) => sum + runUsd(r.body), 0);
}

export interface Spend {
  usd: number;
  latestRunAt: string | null;
}

/** This month's spend and the latest run (for the rate limit), or null when
 *  it can't be known — the caller must not call the model then. */
export async function loadSpend(client: DataClient, timezone: string, now: Date): Promise<Spend | null> {
  const monthStart = `${todayInTimezone(timezone, now).slice(0, 7)}-01`;
  // One UTC day of slack covers any timezone; monthSpendUsd trims to the local month.
  const { data, error } = await client.views
    .records_v1("occurred_at,body")
    .eq("kind", BRIEFING_RUN_KIND)
    .gte("occurred_at", `${addDaysYmd(monthStart, -1)}T00:00:00Z`)
    .order("occurred_at", { ascending: false })
    .limit(RUN_ROW_LIMIT);
  if (error || !data) {
    console.error("briefing: briefing_run read failed", error);
    return null;
  }
  if (data.length >= RUN_ROW_LIMIT) return null;
  const runs = data as RunRow[];
  return { usd: monthSpendUsd(runs, timezone, now), latestRunAt: runs.find((r) => isValidTimestamp(r.occurred_at))?.occurred_at ?? null };
}

/* ---------------------------------------------------------------- payload */

interface CampaignRow {
  day?: string | null;
  campaign_name?: string | null;
  campaign_status?: string | null;
  spend_minor?: number | null;
  impressions?: number | null;
  clicks?: number | null;
  purchases?: number | null;
  purchase_value_minor?: number | null;
  roas?: number | null;
}
interface JobRow {
  title?: string | null;
  status?: string | null;
  priority?: string | null;
  due_on?: string | null;
  is_done?: boolean | null;
  updated_at?: string | null;
}
interface MessageRow {
  kind?: string | null;
  title?: string | null;
  occurred_at?: string | null;
}
interface ActivityRow {
  source?: string | null;
  kind?: string | null;
  title?: string | null;
  occurred_at?: string | null;
}

export interface BriefingRows {
  campaigns: CampaignRow[];
  jobs: JobRow[];
  messages: MessageRow[];
  activity: ActivityRow[];
}

function inLocalDay(ts: string | null | undefined, timezone: string, day: string): boolean {
  return isValidTimestamp(ts ?? null) && todayInTimezone(timezone, new Date(ts as string)) === day;
}

/**
 * The JSON the model sees. Every field is picked by name: no ids, owners,
 * participants, message bodies, activity detail or URLs, so nothing that
 * identifies a person beyond what a title itself says.
 */
export function buildPayload(day: string, report: DailyReport, rows: BriefingRows, timezone: string) {
  return {
    day,
    currency: report.currency,
    financials: Object.fromEntries(dailyReportLines(report).map((l) => [l.label, l.value])),
    campaigns: rows.campaigns
      .filter((c) => c.day === day)
      .map((c) => ({
        campaign: c.campaign_name ?? null,
        status: c.campaign_status ?? null,
        spend_minor: c.spend_minor ?? null,
        impressions: c.impressions ?? null,
        clicks: c.clicks ?? null,
        purchases: c.purchases ?? null,
        purchase_value_minor: c.purchase_value_minor ?? null,
        roas: c.roas ?? null,
      })),
    tasks_updated: rows.jobs
      .filter((j) => inLocalDay(j.updated_at, timezone, day))
      .map((j) => ({ title: j.title ?? null, status: j.status ?? null, priority: j.priority ?? null, due_on: j.due_on ?? null, done: j.is_done ?? null })),
    meetings: rows.messages.filter((m) => inLocalDay(m.occurred_at, timezone, day)).map((m) => ({ kind: m.kind ?? null, title: m.title ?? null })),
    activity: rows.activity
      .filter((a) => inLocalDay(a.occurred_at, timezone, day))
      .map((a) => ({ source: a.source ?? null, kind: a.kind ?? null, title: a.title ?? null })),
  };
}

/** Yesterday's rows from each source. A failed read is named and counts as []. */
export async function loadBriefingRows(client: DataClient, day: string): Promise<{ rows: BriefingRows; errors: string[] }> {
  // Timestamps are UTC; [day-1, day+2) covers the local day in any timezone and
  // buildPayload trims to it.
  const from = `${addDaysYmd(day, -1)}T00:00:00Z`;
  const to = `${addDaysYmd(day, 2)}T00:00:00Z`;
  const results = await Promise.allSettled([
    client.views
      .campaign_daily_v1("day,campaign_name,campaign_status,spend_minor,impressions,clicks,purchases,purchase_value_minor,roas")
      .eq("day", day)
      .limit(ROW_LIMIT),
    client.views
      .jobs_v1("title,status,priority,due_on,is_done,updated_at")
      .is("deleted_at", null)
      .gte("updated_at", from)
      .lt("updated_at", to)
      .limit(ROW_LIMIT),
    client.views.messages_v1("kind,title,occurred_at").gte("occurred_at", from).lt("occurred_at", to).limit(ROW_LIMIT),
    client.views.activity_v1("source,kind,title,occurred_at").gte("occurred_at", from).lt("occurred_at", to).limit(ROW_LIMIT),
  ]);
  const names = ["campaign_daily_v1", "jobs_v1", "messages_v1", "activity_v1"] as const;
  const errors: string[] = [];
  const out = results.map((r, i) => {
    if (r.status === "fulfilled" && !r.value.error && r.value.data) return r.value.data as unknown[];
    errors.push(names[i] ?? `view ${i}`);
    return [];
  });
  return {
    rows: { campaigns: out[0] as CampaignRow[], jobs: out[1] as JobRow[], messages: out[2] as MessageRow[], activity: out[3] as ActivityRow[] },
    errors,
  };
}

/* -------------------------------------------------------------------- run */

/** Structural subset of the Anthropic client (lib/ai.ts) — the single-call
 *  shape this module uses, so it never imports @anthropic-ai/sdk. */
export interface BriefingAi {
  defaultModel: string;
  messages: {
    create(params: {
      model: string;
      max_tokens: number;
      system: string;
      messages: { role: "user"; content: string }[];
    }): Promise<{ content: { type: string; text?: string }[]; usage: { input_tokens: number; output_tokens: number } }>;
  };
}

export type BriefingOutcome =
  | { status: "saved"; day: string; text: string; usd: number }
  | { status: "skipped"; day: string; reason: SkipReason }
  /** `message` is for logs only, never rendered. */
  | { status: "failed"; day: string; message: string };

export interface RunBriefingDeps {
  client: DataClient;
  config: AppConfig;
  timezone: string;
  now?: Date;
  /** The on-demand button: 1 per RATE_LIMIT_MS from the latest briefing_run. The cron run is not limited. */
  onDemand?: boolean;
  /** Test seam; defaults to lib/ai.ts. */
  createAi?: (config: AppConfig) => BriefingAi | null;
}

function defaultAi(config: AppConfig): BriefingAi | null {
  return maybeGetAiClient({ config }) as unknown as BriefingAi | null;
}

export async function runBriefing(deps: RunBriefingDeps): Promise<BriefingOutcome> {
  const { client, config, timezone } = deps;
  const now = deps.now ?? new Date();
  const day = yesterdayInTimezone(timezone, now);
  const skip = (reason: SkipReason): BriefingOutcome => ({ status: "skipped", day, reason });

  const gate = aiGate(config);
  if (gate) return skip(gate);
  const ai = (deps.createAi ?? defaultAi)(config);
  if (!ai) return skip("key_missing");
  const model = ai.defaultModel;
  if (tokensToUsd(model, 0, 0) === null) return skip("unpriced");

  const spend = await loadSpend(client, timezone, now);
  if (!spend) return skip("spend_unknown");
  if (deps.onDemand && isRateLimited(spend.latestRunAt, now)) return skip("rate_limited");
  if (capReached(spend.usd, config.aiMonthlyBudgetUsd as number)) return skip("cap_reached");

  const [daily, extra] = await Promise.all([loadDailyReport(client, day), loadBriefingRows(client, day)]);
  const readErrors = [...daily.errors, ...extra.errors];
  if (readErrors.length) console.error(`briefing: read failed for ${readErrors.join(", ")}`);
  const payload = buildPayload(day, daily.report, extra.rows, timezone);

  let res: Awaited<ReturnType<BriefingAi["messages"]["create"]>>;
  try {
    res = await ai.messages.create({
      model,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: JSON.stringify(payload) }],
    });
  } catch (err) {
    return { status: "failed", day, message: `messages.create failed: ${err instanceof Error ? err.message : String(err)}` };
  }

  const inputTokens = Number(res.usage?.input_tokens) || 0;
  const outputTokens = Number(res.usage?.output_tokens) || 0;
  const usd = tokensToUsd(model, inputTokens, outputTokens) as number;

  // The cost row goes first: a failed summary save must never hide spend.
  try {
    await client.rpc.save_record({
      kind: BRIEFING_RUN_KIND,
      external_id: `briefing_run:${crypto.randomUUID()}`,
      title: `Briefing run for ${day}`,
      occurred_at: now.toISOString(),
      attributes: { day, model, on_demand: Boolean(deps.onDemand) },
      body: JSON.stringify({ input_tokens: inputTokens, output_tokens: outputTokens, usd }),
    });
  } catch (err) {
    console.error("briefing: briefing_run save failed", err instanceof Error ? err.message : err);
  }

  const text = res.content
    .filter((b) => b.type === "text" && b.text)
    .map((b) => b.text)
    .join("\n")
    .trim();
  if (!text) return { status: "failed", day, message: "model returned no text" };

  try {
    await client.rpc.save_record({
      kind: BRIEFING_KIND,
      external_id: `briefing:${day}`,
      title: `Daily Briefing — ${day}`,
      occurred_at: day,
      attributes: { day, model },
      body: text,
    });
  } catch (err) {
    return { status: "failed", day, message: `briefing save failed: ${err instanceof Error ? err.message : String(err)}` };
  }
  return { status: "saved", day, text, usd };
}

/* ----------------------------------------------------------------- stored */

export interface StoredBriefing {
  text: string;
  updatedAt: string | null;
}

/** The saved briefing for `day`, rendered whether or not AI is on now. */
export async function loadStoredBriefing(client: DataClient, day: string): Promise<StoredBriefing | null> {
  const { data, error } = await client.views
    .records_v1("body,updated_at")
    .eq("kind", BRIEFING_KIND)
    .eq("external_id", `briefing:${day}`)
    .order("updated_at", { ascending: false })
    .limit(1);
  if (error) {
    console.error("briefing: stored briefing read failed", error);
    return null;
  }
  const row = (data?.[0] ?? null) as { body: string | null; updated_at: string | null } | null;
  return row?.body?.trim() ? { text: row.body.trim(), updatedAt: row.updated_at } : null;
}
