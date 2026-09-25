// §5.2 step order. Steps 0 and 3 run in every task; the rest only in task 0 and only while it
// holds worker_leases('housekeeping'). A failing step is logged; the next one still runs.
import { randomUUID } from 'node:crypto'
import { acquireLease, envNum, releaseLease, sql, type Tick } from './db.js'
import { claimAndRun } from './run.js'
import { probeAuthFailed, refreshTokens } from './tokens.js'
import { alerts, computeHealth, egressPooled } from './health.js'
import { purge, thumbnails } from './media.js'
import { renormalize } from './renormalize.js'
import { shopRedact } from './privacy.js'

export interface TickOpts {
  taskIndex?: number
  taskCount?: number
  fetch?: typeof globalThis.fetch
  now?: () => Date
  log?: (event: string, data?: Record<string, unknown>) => void
  budgetMs?: number
  claimLimit?: number
  owner?: string
}

export interface TickResult {
  owner: string
  taskIndex: number
  housekeeping: boolean
  steps: Record<string, number>
}

async function reap(t: Tick): Promise<number> {
  const r = await sql(`update data.connector_runs set status = 'error', error = 'lease expired', finished_at = now()
                       where status = 'running' and started_at < now() - interval '20 minutes'`)
  await sql(`update data.connector_schedule set lease_until = null where lease_until < now()`)
  return r.rowCount ?? 0
}

/** Once per day: month+2's partition already existing means today's call would be a no-op. */
async function ensurePartitions(_t: Tick): Promise<number> {
  const have = await sql(
    `select 1 from pg_tables where schemaname = 'data'
     and tablename = 'raw_' || to_char(date_trunc('month', now()) + interval '2 months', 'YYYY_MM')`)
  if (have.rowCount) return 0
  await sql(`select data.ensure_raw_partitions()`)
  return 1
}

export async function tick(opts: TickOpts = {}): Promise<TickResult> {
  const taskIndex = opts.taskIndex ?? Number(process.env.CLOUD_RUN_TASK_INDEX ?? 0)
  const taskCount = opts.taskCount ?? envNum('TASK_COUNT', 2)
  const owner = opts.owner ?? `${taskIndex}:${randomUUID().slice(0, 8)}`
  const log = opts.log ?? ((event, data) => console.log(JSON.stringify({ event, owner, ...data })))
  const t: Tick = {
    taskIndex, taskCount, owner, log,
    fetch: opts.fetch ?? globalThis.fetch,
    stubbed: !!opts.fetch,
    now: opts.now ?? (() => new Date()),
    budgetMs: opts.budgetMs ?? envNum('RUN_BUDGET_MS', 240000),
    claimLimit: opts.claimLimit ?? envNum('CLAIM_LIMIT', 24),
  }

  const steps: Record<string, number> = {}
  const step = async (name: string, fn: () => Promise<number>) => {
    try {
      steps[name] = await fn()
      log('step', { step: name, n: steps[name] })
    } catch (e) {
      log('step_failed', { step: name, error: e instanceof Error ? e.message : String(e) })
    }
  }

  await step('reap', () => reap(t))

  const housekeeping = taskIndex === 0 && await acquireLease('housekeeping', owner)
  if (housekeeping) {
    await step('ensurePartitions', () => ensurePartitions(t))
    await step('refreshTokens', () => refreshTokens(t))
    await step('probeAuthFailed', () => probeAuthFailed(t))
  }

  await step('claimAndRun', () => claimAndRun(t))

  if (housekeeping) {
    await step('computeHealth', () => computeHealth(t))
    // Before alerts: alerts() ends its own call with sendPending(), which flushes every unsent
    // data.notifications row (not just the ones alerts() itself just raised) — so an escalation
    // shopRedact() writes here goes out over email in this same tick instead of waiting one more.
    await step('shopRedact', () => shopRedact(t))
    await step('alerts', () => alerts(t))
    await step('thumbnails', () => thumbnails(t))
    await step('renormalize', () => renormalize(t))
    await step('purge', () => purge(t))
    await step('egressPooled', () => egressPooled(t))
    await releaseLease('housekeeping', owner)
  }

  return { owner, taskIndex, housekeeping, steps }
}
