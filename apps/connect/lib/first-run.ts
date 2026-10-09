/**
 * first-run.ts — the Sources-page "get started" checklist and the /access starter questions.
 *
 * Pure, total functions over rows the pages already fetched (same style as sources.ts): no
 * Supabase, no env, no clock. tests/first-run.test.mjs runs them without a database.
 *
 * "Connected" is exactly composeSources' definition (a card with `connected: true`), so the
 * checklist, the cards and the starter questions can never disagree about it.
 */
import { composeSources, HUB_SOURCES, type HealthRow, type HubSource } from "./sources";

/** One row of api.memberships_v1, as app/team/page.tsx reads it. */
export interface MemberRow {
  user_id: string;
  role?: string | null;
  is_smoke?: boolean | null;
}

export type StepId = "source" | "sync" | "team" | "ai";

export interface Step {
  id: StepId;
  /** Short, plain label. */
  label: string;
  /** One line on why it is worth doing. */
  hint: string;
  done: boolean;
  /** Owner-only target; the page renders it as a link. "#sources" is the cards on the same page. */
  href: string;
  cta: string;
}

export interface FirstRunInput {
  health: readonly HealthRow[] | null | undefined;
  members: readonly MemberRow[] | null | undefined;
  /** The signed-in user. */
  viewerUserId: string;
  role: string | null | undefined;
  /** api.ai_last_used_at(): newest AI question for this workspace, or null / unreadable. */
  aiLastUsedAt: string | null | undefined;
}

export interface FirstRun {
  steps: Step[];
  doneCount: number;
  allDone: boolean;
  /** Owners only, and only until every step is done (ai + team done also hides it, see firstRun). Members never see it: two of the
   *  four steps (invite, connect AI) are owner actions they cannot take. */
  visible: boolean;
}

const hasTime = (v: string | null | undefined): boolean => typeof v === "string" && !Number.isNaN(new Date(v).getTime());

export function firstRun(input: FirstRunInput): FirstRun {
  const health = input.health ?? [];
  const aiDone = hasTime(input.aiLastUsedAt);
  // Health rows for sources the hub does not show (e.g. 'platform') never count. A sync time proves a source
  // was connected (the token may be revoked since), so it ticks both steps. An AI question proves neither:
  // ai_last_used_at comes from mcp_tool_calls, which logs failed calls too and survives shop/redact.
  const syncDone = health.some((r) => (HUB_SOURCES as readonly string[]).includes(r.source) && hasTime(r.last_success_at));
  const sourceDone = syncDone || composeSources(health).some((c) => c.connected);
  // teamDone stays live: a removed member leaves no row, so "invited then removed" cannot be told from
  // "never invited" without new state. Removing the invitee re-opens only this step.
  const teamDone = (input.members ?? []).some((m) => !m.is_smoke && m.user_id !== input.viewerUserId);

  const steps: Step[] = [
    { id: "source", label: "Connect a source", hint: "Pick the tool that holds your business data.", done: sourceDone, href: "#sources", cta: "Choose a source" },
    { id: "sync", label: "Get your first data in", hint: "This happens on its own within the hour after you connect.", done: syncDone, href: "#sources", cta: "See status" },
    { id: "team", label: "Invite your team", hint: "Everyone sees the same numbers.", done: teamDone, href: "/team", cta: "Invite someone" },
    { id: "ai", label: "Ask your AI about your data", hint: "Add this workspace to Claude or ChatGPT, then ask a question.", done: aiDone, href: "/access", cta: "Set it up" },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const allDone = doneCount === steps.length;
  // No stored state: disconnecting the only source deletes its health row and un-ticks "source" and "sync",
  // but a finished checklist always had ai + team ticked, so ai + team done keeps it hidden.
  return { steps, doneCount, allDone, visible: input.role === "owner" && !allDone && !(aiDone && teamDone) };
}

/**
 * Plain business questions, each answerable from what that source really syncs (checked against
 * platform/worker/src/connectors and the columns apps/mcp exposes in policy.ts):
 * shopify -> orders, refunds, payouts, products with stock, daily visits; meta -> campaign and ad
 * spend/clicks per day; monday -> tasks with status, owner, priority, due date; meet -> meeting
 * notes; drive -> file names and types; quickbooks -> purchases and bills by vendor and account.
 * Shopify has no "best sellers" question on purpose: order line items are not exposed to the AI.
 */
const QUESTIONS: Record<HubSource, readonly string[]> = {
  shopify: [
    "How much did we sell last week compared with the week before?",
    "How many orders came in each day this month?",
    "How many refunds did we give this month, and what did they add up to?",
    "Which products are low on stock?",
    "How much was our last payout from Shopify?",
  ],
  meta: [
    "How much did we spend on ads last week?",
    "Which campaign spent the most this month?",
    "Which ads got the most clicks last month?",
    "How did our ad spend this month compare with last month?",
  ],
  monday: [
    "Which tasks are overdue?",
    "What is due this week?",
    "How many tasks are done and how many are still open?",
    "Who has the most unfinished tasks?",
    "Which high-priority tasks are not finished yet?",
  ],
  meet: [
    "What were the main points of our latest meeting?",
    "What action items came out of this week's meetings?",
    "Which meetings this month talked about deadlines?",
  ],
  drive: [
    "What files were added to our Drive folder this week?",
    "How many photos and videos are in the folder?",
    "Find the files with \"logo\" in the name.",
  ],
  quickbooks: [
    "What were our biggest expenses last month?",
    "Which vendors did we pay the most this year?",
    "How much did we spend on each expense category last quarter?",
    "Which bills did we enter in the last two weeks?",
  ],
};

export interface StarterGroup {
  source: HubSource;
  title: string;
  questions: readonly string[];
}

/** One group per CONNECTED source, in HUB_SOURCES order. Not-connected sources get nothing. */
export function starterQuestions(health: readonly HealthRow[] | null | undefined): StarterGroup[] {
  return composeSources(health)
    .filter((c) => c.connected)
    .map((c) => ({ source: c.source, title: c.title, questions: QUESTIONS[c.source] }));
}
