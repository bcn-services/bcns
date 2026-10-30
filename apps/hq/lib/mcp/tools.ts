/**
 * tools.ts — the HQ MCP's tool surface: 17 tools, each a thin wrapper over the same lib
 * functions the UI uses (via='mcp', actor = the connecting user, so the audit shows "Claude (<handle>)").
 * Claude may only PROPOSE: there is no tool that updates businesses.stage (create_lead only inserts a new lead) or writes finance_inputs, decides a
 * proposal, or deletes anything. Pure of next/* so tests import it with a fake Supabase client.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z, type ZodRawShape } from "zod";
import {
  addLeadNote,
  ALL_STAGES,
  createLead,
  LATE_STAGES,
  lateStagesOn,
  loadExtras,
  parseResearch,
  type Actor,
} from "../leads";
import { CLIENT_FIELDS } from "../clients/fields";
import { CLIENT_SELECT, deriveFor, loadHealthSources, type ClientBase } from "../clients/load";
import { proposeClient } from "../clients/propose";
import { listPendingProposals } from "../proposals";
import {
  addDays,
  addLink,
  AREAS,
  byDue,
  createTask,
  filterTasks,
  isoDay,
  listTasks,
  OWNERS,
  propose,
  STATUSES,
  addNote,
  assertOwners,
  updateTask,
  waitingStatus,
  type Status,
  type Task,
} from "../tasks";
import { buildBoard, COLUMNS, listTracks, updateTrack } from "../tracks";

export interface Ctx {
  sb: SupabaseClient;
  actor: Actor;
}

/** A refusal the model should read as-is. Anything else thrown is clipped DB/lib text. */
export class ToolError extends Error {}

export interface ToolDef {
  name: string;
  title: string;
  description: string;
  readOnly: boolean;
  shape: ZodRawShape;
  /** Parses `raw` with `shape` first, so a direct call is as strict as one through the transport. */
  run(ctx: Ctx, raw: unknown): Promise<unknown>;
}

function tool<S extends ZodRawShape>(def: {
  name: string;
  title: string;
  description: string;
  readOnly: boolean;
  shape: S;
  run(ctx: Ctx, a: z.infer<z.ZodObject<S>>): Promise<unknown>;
}): ToolDef {
  const schema = z.object(def.shape);
  return { ...def, run: async (ctx, raw) => def.run(ctx, schema.parse(raw)) };
}

// ---- contact stripping --------------------------------------------------------------------

// next_contact_at is a date, not a contact detail: only name/person/info keys and bare "contact(s)" go.
const CONTACT_KEY = /phone|e-?mail|mobile|fax|^tel$|^contacts?$|contact_(name|person|info|detail)|owner_name|person_name|decision_maker/i;
const EMAIL_IN_TEXT = /[^\s@<>()"',;]+@[^\s@<>()"',;]+\.[A-Za-z]{2,}/g;
// ponytail: 10-digit NANP (optional +1, parens, space/dot/dash) or +country-code runs; the lookbehind keeps dates,
// timestamps and ids intact. Other local formats (e.g. 8-digit numbers without +) pass — extend if one shows up.
const PHONE_IN_TEXT =
  /(?<![\w.+-])(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}(?![\w-])|(?<![\w.])\+\d[\d\s().-]{8,}\d/g;

/** Drops every phone/email-ish key at any depth (research included) and blanks email addresses and phone numbers in text. */
export function stripContacts(v: unknown): unknown {
  if (typeof v === "string")
    return v.replace(EMAIL_IN_TEXT, "[removed]").replace(PHONE_IN_TEXT, "[removed]");
  if (Array.isArray(v)) return v.map(stripContacts);
  if (v && typeof v === "object")
    return Object.fromEntries(
      Object.entries(v)
        .filter(([k]) => !CONTACT_KEY.test(k))
        .map(([k, x]) => [k, stripContacts(x)])
    );
  return v;
}

// ---- helpers ------------------------------------------------------------------------------

const uuid = z.string().uuid();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
/** One owner or several: a string is a one-element list (the old shape keeps working). */
const owners = z.union([z.enum(OWNERS), z.array(z.enum(OWNERS))]);
const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "client slug");

/** Read result or throw; the row type is named by the caller (the client is untyped). */
function read<T>(r: { data: unknown; error: { message: string } | null }, what: string): T {
  if (r.error) throw new ToolError(`${what}: ${r.error.message}`);
  return r.data as T;
}

const clean = (s: string) =>
  s
    .replace(/[%_\\,()*]/g, " ")
    .trim()
    .slice(0, 100);

const TASK_COLS =
  "id, title, body, owners, area, status, due, waiting_on, business_id, client_slug, created_at";

// ---- tools --------------------------------------------------------------------------------

export const TOOLS: ToolDef[] = [
  tool({
    name: "list_tasks",
    title: "List tasks",
    description:
      "List HQ tasks. Defaults to open tasks owned by claude. owner: nate|brandon|claude|all (tasks that include that owner); status: open|todo|doing|waiting|done|all.",
    readOnly: true,
    shape: {
      owner: z.enum([...OWNERS, "all"]).default("claude"),
      status: z.enum(["open", ...STATUSES, "all"]).default("open"),
      area: z.enum(AREAS).optional(),
    },
    async run({ sb }, a) {
      const tasks = filterTasks(await listTasks(sb), {
        owner: a.owner === "all" ? "" : a.owner,
        status: a.status === "open" ? "" : a.status,
        area: a.area,
      });
      return { tasks: tasks.sort(byDue).slice(0, 100) };
    },
  }),

  tool({
    name: "get_task",
    title: "Get a task",
    description: "One task with its notes and links.",
    readOnly: true,
    shape: { id: uuid },
    async run({ sb }, a) {
      const task = read<Task | null>(
        await sb.from("tasks").select("*").eq("id", a.id).maybeSingle(),
        "task"
      );
      if (!task) throw new ToolError("task not found");
      const [notes, links] = await Promise.all([
        sb
          .from("notes")
          .select("body, actor, via, created_at")
          .eq("task_id", a.id)
          .order("created_at"),
        sb.from("links").select("url, label, created_at").eq("task_id", a.id).order("created_at"),
      ]);
      return { task, notes: read(notes, "notes"), links: read(links, "links") };
    },
  }),

  tool({
    name: "create_task",
    title: "Create a task",
    description:
      "Create a task, e.g. 'add A to B, due C'. owner: nate|brandon|claude, or an array of them for several people (default claude); due: YYYY-MM-DD; client_slug links a client; track_id puts it on a board track (see list_board). Tracks are fixed: Software, Outreach, Marketing, Clients, Ops. Ideally every task gets one; use track_id from list_board.",
    readOnly: false,
    shape: {
      title: z.string().min(1).max(300),
      owner: owners.default("claude"),
      area: z.enum(AREAS).optional(),
      due: day.optional(),
      body: z.string().max(5000).optional(),
      business_id: uuid.optional(),
      client_slug: slug.optional(),
      track_id: uuid.optional(),
    },
    async run({ sb, actor }, a) {
      const t = await createTask(sb, actor.id, "mcp", {
        title: a.title,
        owners: assertOwners(a.owner),
        area: a.area,
        due: a.due,
        body: a.body,
        businessId: a.business_id,
        clientSlug: a.client_slug,
        trackId: a.track_id,
      });
      return { task: t };
    },
  }),

  tool({
    name: "update_task",
    title: "Update a task",
    description:
      "Reassign, reschedule or close a task, e.g. 'assign X to Y', 'mark D done'. Find the id with list_tasks. owner: nate|brandon|claude, or an array of them for several people ([] unassigns); due: YYYY-MM-DD (null clears); also status (doing = Now on the board; a non-empty waiting_on keeps it in Waiting, so clear it), body, waiting_on, client_slug, track_id, resolution. Tracks are fixed: Software, Outreach, Marketing, Clients, Ops. Ideally every task gets one; use track_id from list_board. Ticket tasks (alert_key `ticket:…`): set `resolution` and `status: done` to close the client's ticket with that text on the next sync. status=done or a new owner list: an admin may do it to any task; anyone else only to their own, claude's or unowned tasks, and is refused on another person's task.",
    readOnly: false,
    shape: {
      id: uuid,
      status: z.enum(STATUSES).optional(),
      owner: owners.optional(),
      client_slug: slug.nullable().optional(),
      track_id: uuid.nullable().optional(),
      body: z.string().max(5000).nullable().optional(),
      waiting_on: z.string().max(200).nullable().optional(),
      due: day.nullable().optional(),
      resolution: z.string().max(4000).nullable().optional(),
    },
    async run({ sb, actor }, a) {
      const { id, owner, ...patch } = a;
      const owners = owner === undefined ? undefined : assertOwners(owner);
      // Read the CURRENT row when the owner gates a close or a reassign, or when waiting_on alone must pick the status (as the UI does).
      const byWaiting = a.status === undefined && a.waiting_on !== undefined;
      const gated = a.status === "done" || owner !== undefined || a.resolution !== undefined;
      if (gated || byWaiting) {
        const cur = read<{ owners: string[]; status: Status } | null>(
          await sb.from("tasks").select("owners, status").eq("id", id).maybeSingle(),
          "task"
        );
        if (!cur) throw new ToolError("task not found");
        // The owner rule: an admin changes anything; staff close or reassign tasks they co-own, claude's alone and unowned ones only.
        // Reassigning is gated like closing, or a refused close could be dodged by taking the task first.
        if (gated && cur.owners.some((o) => o !== "claude") && !cur.owners.includes(actor.handle ?? "")) {
          const me = read<{ role: string } | null>(
            await sb.from("profiles").select("role").eq("id", actor.id).maybeSingle(),
            "profile"
          );
          if (me?.role !== "admin")
            throw new ToolError(
              `refused: this task is owned by ${cur.owners.join(" and ")}; only ${cur.owners.filter((o) => o !== "claude").join(" or ")} or an admin can ${
                a.status === "done" ? "mark it done" : owner !== undefined ? "reassign it" : "edit its resolution"
              }. Tell the user and leave it.`
            );
        }
        if (byWaiting) patch.status = waitingStatus(a.waiting_on ?? "", cur.status);
      }
      return { task: await updateTask(sb, actor.id, "mcp", id, { ...patch, owners }) };
    },
  }),

  // ---- board + notes (work item) -----------------------------------------------------------

  tool({
    name: "add_task_note",
    title: "Add a note to a task",
    description:
      "Add a note to a task (id from list_tasks). Name people as nate|brandon|claude and dates as YYYY-MM-DD. Do not put phone numbers or email addresses in it.",
    readOnly: false,
    shape: { id: uuid, body: z.string().min(1).max(5000) },
    async run({ sb, actor }, a) {
      await addNote(sb, actor.id, "mcp", { taskId: a.id, body: a.body });
      return { ok: true };
    },
  }),

  tool({
    name: "list_board",
    title: "List the board",
    description:
      "List the Work board. Tracks are fixed: Software, Outreach, Marketing, Clients, Ops. Columns are task phases: Now (status doing, or due within 7 days incl. overdue), Next (other open tasks), Waiting (status waiting or a waiting_on), Done (done in the last 7 days, newest 5 per track). A track appears in every column it has tasks in; each card lists only that column's steps (tasks). Tasks with no track show on a \"Miscellaneous\" card (id \"unassigned\", last in each column). To move work between columns, update the task (update_task status/due/waiting_on).",
    readOnly: true,
    shape: {},
    async run({ sb }) {
      const board = buildBoard(await listTracks(sb), await listTasks(sb));
      return {
        board: Object.fromEntries(
          COLUMNS.map((c) => [
            c,
            board[c].map(({ track, steps }) => ({
              ...track,
              column: c, // the phase column this card sits in, not the unused stored one
              steps: steps.map((t) => ({
                id: t.id,
                title: t.title,
                status: t.status,
                owners: t.owners,
                due: t.due,
                client_slug: t.client_slug,
              })),
            })),
          ])
        ),
      };
    },
  }),

  tool({
    name: "update_track",
    title: "Update a track",
    description: "Change a board track's area or client_slug (null clears), or rename it to one of the fixed names (Software, Outreach, Marketing, Clients, Ops). Tracks cannot be created or deleted.",
    readOnly: false,
    shape: {
      id: uuid,
      name: z.string().min(1).max(120).optional(),
      area: z.enum(AREAS).nullable().optional(),
      client_slug: slug.nullable().optional(),
    },
    async run({ sb, actor }, a) {
      const { id, ...f } = a;
      return { track: await updateTrack(sb, actor.id, "mcp", id, f) };
    },
  }),

  tool({
    name: "search_leads",
    title: "Search leads",
    description: "Find leads by name, town, trade (contains) and/or exact stage. At most 50.",
    readOnly: true,
    shape: {
      name: z.string().max(100).optional(),
      town: z.string().max(100).optional(),
      trade: z.string().max(100).optional(),
      stage: z.string().max(40).optional(),
      limit: z.number().int().min(1).max(50).default(50),
    },
    async run({ sb }, a) {
      let q = sb
        .from("businesses")
        .select(
          "id, name, trade, town, state, stage, fit_score, assigned_to, next_contact_at, waiting_on"
        );
      for (const col of ["name", "town", "trade"] as const) {
        const v = a[col] && clean(a[col]);
        if (v) q = q.ilike(col, `%${v}%`);
      }
      if (a.stage) q = q.eq("stage", a.stage);
      const leads = read<unknown[]>(await q.order("name").limit(a.limit), "leads");
      return { leads: stripContacts(leads), count: leads.length };
    },
  }),

  tool({
    name: "get_lead",
    title: "Get a lead",
    description:
      "One lead: stage, research, call history, notes and links. Phone and email fields are never returned.",
    readOnly: true,
    shape: { id: uuid },
    async run({ sb }, a) {
      const lead = read<Record<string, unknown> | null>(
        await sb
          .from("businesses")
          .select(
            "id, name, trade, town, state, stage, fit_score, assigned_to, next_contact_at, consult_at, deal_value_cents, waiting_on, domain, research"
          )
          .eq("id", a.id)
          .maybeSingle(),
        "lead"
      );
      if (!lead) throw new ToolError("lead not found");
      const x = (await loadExtras(sb, [a.id])).get(a.id);
      return stripContacts({
        lead: { ...lead, research: parseResearch(lead) },
        calls: x?.calls ?? [],
        notes: x?.notes ?? [],
        links: x?.links ?? [],
      });
    },
  }),

  tool({
    name: "create_lead",
    title: "Create a lead",
    description:
      "Add a business to Leads by hand, e.g. 'add JamSpot, music venue in Pomona'. Refuses a name+town already on file (search_leads first). stage defaults to reached; assigned_to to nate. Then use the returned id with create_task (business_id) or log_lead_note. Business names only in note: no personal names, phone or email.",
    readOnly: false,
    shape: {
      name: z.string().min(1).max(200),
      trade: z.string().max(100).optional(),
      town: z.string().max(100).optional(),
      state: z.string().max(40).optional(),
      phone: z.string().max(40).optional(),
      domain: z.string().max(200).optional(),
      stage: z.string().refine((s) => ALL_STAGES.includes(s), "unknown stage").default("reached"),
      assigned_to: z.enum(["nate", "brandon"]).default("nate"),
      note: z.string().max(5000).optional(),
    },
    async run({ sb, actor }, a) {
      try {
        const id = await createLead(sb, actor, "mcp", a);
        return { id, name: a.name };
      } catch (e) {
        // createLead's refusals (duplicate, late stage, bad phone) are for the model to read as-is
        throw e instanceof ToolError ? e : new ToolError(e instanceof Error ? e.message : "failed");
      }
    },
  }),

  tool({
    name: "log_lead_note",
    title: "Add a note to a lead",
    description: "Append a note to a lead. Do not put phone numbers or email addresses in it.",
    readOnly: false,
    shape: { business_id: uuid, body: z.string().min(1).max(5000) },
    async run({ sb, actor }, a) {
      await addLeadNote(sb, actor, "mcp", { businessId: a.business_id, body: a.body });
      return { ok: true };
    },
  }),

  tool({
    name: "add_link",
    title: "Add a link",
    description:
      "Attach an https link to exactly one of: a task (task_id), a lead (business_id) or a client (client_slug).",
    readOnly: false,
    shape: {
      url: z.string().max(2000),
      label: z.string().max(200).optional(),
      task_id: uuid.optional(),
      business_id: uuid.optional(),
      client_slug: z
        .string()
        .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
        .max(100)
        .optional(),
    },
    async run({ sb, actor }, a) {
      const row = await addLink(sb, actor.id, "mcp", {
        url: a.url,
        label: a.label,
        taskId: a.task_id,
        businessId: a.business_id,
        clientSlug: a.client_slug,
      });
      return { link: row };
    },
  }),

  tool({
    name: "get_client",
    title: "Get a client",
    description: "One client by slug, with its open tasks, notes and links.",
    readOnly: true,
    shape: {
      slug: z
        .string()
        .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
        .max(100),
    },
    async run({ sb }, a) {
      const client = read<unknown>(
        await sb.from("clients").select("*").eq("slug", a.slug).maybeSingle(),
        "client"
      );
      if (!client) throw new ToolError("client not found");
      const [tasks, notes, links] = await Promise.all([
        sb
          .from("tasks")
          .select(TASK_COLS)
          .eq("client_slug", a.slug)
          .neq("status", "done")
          .limit(50),
        sb
          .from("notes")
          .select("body, actor, via, created_at")
          .eq("client_slug", a.slug)
          .order("created_at", { ascending: false })
          .limit(50),
        sb.from("links").select("url, label, created_at").eq("client_slug", a.slug).limit(50),
      ]);
      // health is derived (uptime + connectors + payment), never the clients.health column; the row is untyped
      const { derived } = deriveFor(client as ClientBase, await loadHealthSources(sb));
      return stripContacts({
        client: { ...(client as object), health: derived.health },
        health: { state: derived.health, why: derived.why, sources: derived.sources },
        tasks: read(tasks, "tasks"),
        notes: read(notes, "notes"),
        links: read(links, "links"),
      });
    },
  }),

  tool({
    name: "propose_client",
    title: "Propose a client field change",
    description: `Propose a change to one client field (${CLIENT_FIELDS.join(", ")}). monthly_rate_cents is whole cents; aliases is a list of exact payer names. Only files a pending proposal; an admin approves it. Health is derived and cannot be proposed.`,
    readOnly: false,
    shape: {
      slug: z
        .string()
        .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
        .max(100),
      field: z.enum(CLIENT_FIELDS),
      value: z.union([z.string().max(2000), z.number(), z.array(z.string().max(100)).max(20)]),
      reason: z.string().max(1000).optional(),
    },
    async run({ sb, actor }, a) {
      try {
        const p = await proposeClient(sb, actor.id, "mcp", {
          slug: a.slug,
          field: a.field,
          value: a.value,
          reason: a.reason,
        });
        return { proposal_id: p.id, status: "pending", field: p.field, old: p.old, new: p.new };
      } catch (e) {
        throw new ToolError(e instanceof Error ? e.message : "could not file the proposal");
      }
    },
  }),

  tool({
    name: "today",
    title: "Today",
    description:
      "What Nate's Today page shows: pending approvals, ops fires due within 7 days, tasks waiting on Nate, Nate's open tasks and active clients.",
    readOnly: true,
    shape: {},
    async run({ sb }) {
      // Same reads as components/TodayNate.tsx + lib/fires-tasks.ts, minus the cookie session
      // (a bearer caller has none). Connector/job fires (lib/fires-ops.ts) are not included.
      const now = new Date();
      const today = isoDay(now);
      const [proposals, tasks, fires, clients, sources] = await Promise.all([
        listPendingProposals(sb, now),
        listTasks(sb),
        sb
          .from("tasks")
          .select("id, title, due")
          .eq("area", "ops")
          .neq("status", "done")
          .lte("due", addDays(today, 7))
          .order("due"),
        sb
          .from("clients")
          .select(CLIENT_SELECT)
          .is("churn_date", null)
          .order("display_name"),
        loadHealthSources(sb),
      ]);
      const open = tasks.filter((t) => t.status !== "done");
      return {
        today,
        approvals: proposals,
        fires: read<{ id: string; title: string; due: string }[]>(fires, "fires").map((t) => ({
          task_id: t.id,
          title: t.title,
          due: t.due,
          urgent: t.due < today,
        })),
        waiting_on_nate: open
          .filter((t) => t.waiting_on?.trim().toLowerCase() === "nate")
          .sort(byDue),
        nate_tasks: open.filter((t) => t.owners.includes("nate")).sort(byDue),
        // health is derived (uptime + connectors + payment), never the clients.health column
        clients: read<ClientBase[]>(clients, "clients").map((c) => ({
          slug: c.slug,
          display_name: c.display_name,
          kind: c.kind,
          stage: c.stage,
          health: deriveFor(c, sources, now).derived.health,
          owner: c.owner,
        })),
      };
    },
  }),

  tool({
    name: "propose_lead_stage",
    title: "Propose a lead stage change",
    description:
      "Propose moving a lead to a new stage. This only files a pending proposal for a human to approve; it changes nothing by itself.",
    readOnly: false,
    shape: {
      business_id: uuid,
      stage: z.string().refine((s) => ALL_STAGES.includes(s), "unknown stage"),
      reason: z.string().max(1000).optional(),
    },
    async run({ sb, actor }, a) {
      const cur = read<{ name: string; stage: string } | null>(
        await sb.from("businesses").select("name, stage").eq("id", a.business_id).maybeSingle(),
        "lead"
      );
      if (!cur) throw new ToolError("lead not found");
      if (cur.stage === a.stage) throw new ToolError(`lead is already in stage ${a.stage}`);
      if ((LATE_STAGES as readonly string[]).includes(a.stage) && !lateStagesOn())
        throw new ToolError(`moves to ${a.stage} are off (HQ_LATE_STAGES)`);
      const p = await propose(sb, actor.id, "mcp", {
        kind: "lead_stage",
        targetId: a.business_id,
        field: "stage",
        old: cur.stage,
        new: a.stage,
        reason: a.reason,
      });
      return { proposal_id: p.id, status: "pending", lead: cur.name, from: cur.stage, to: a.stage };
    },
  }),

  tool({
    name: "propose_finance",
    title: "Propose a finance input",
    description:
      "Propose a weekly finance number (week = that Monday, YYYY-MM-DD). Only files a pending proposal; a human approves it. spend_cents/leads/pilots/signed are whole numbers.",
    readOnly: false,
    shape: {
      week: day,
      channel: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/),
      column: z.enum(["spend_cents", "hours", "leads", "pilots", "signed"]),
      value: z.number().min(0).max(1_000_000_000),
      reason: z.string().max(1000).optional(),
    },
    async run({ sb, actor }, a) {
      const d = new Date(`${a.week}T00:00:00Z`);
      if (
        Number.isNaN(d.getTime()) ||
        d.toISOString().slice(0, 10) !== a.week ||
        d.getUTCDay() !== 1
      )
        throw new ToolError("week must be a real Monday, YYYY-MM-DD");
      if (a.column !== "hours" && !Number.isInteger(a.value))
        throw new ToolError(`${a.column} must be a whole number`);
      const cur = read<Record<string, unknown> | null>(
        await sb
          .from("finance_inputs")
          .select(a.column)
          .eq("week", a.week)
          .eq("channel", a.channel)
          .maybeSingle(),
        "finance"
      );
      const old = cur?.[a.column] ?? null;
      const p = await propose(sb, actor.id, "mcp", {
        kind: "finance",
        targetId: a.week,
        field: `${a.channel}/${a.column}`,
        old: old === null ? null : Number(old),
        new: a.value,
        reason: a.reason,
      });
      return {
        proposal_id: p.id,
        status: "pending",
        field: `${a.channel}/${a.column}`,
        old,
        new: a.value,
      };
    },
  }),
];
