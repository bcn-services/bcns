// Write-back executor for data.source_commands (the queue api.enqueue_source_command fills).
// Runs in every task, before claimAndRun: one command at a time, claimed `for update skip locked` inside a
// transaction, run with the client's stored token exactly like a sync run (contextFor), then marked
// done/failed with a result. A crash mid-command rolls the claim back, so it is retried; every executor
// must therefore be idempotent (set_status_done and set_status_undone are).
import { sql, tx, type Tick } from './db.js'
import { type Json, type Source, connectors, redact } from './connectors/index.js'
import { contextFor } from './run.js'

const PER_TICK = 20

export async function sourceCommands(t: Tick): Promise<number> {
  let n = 0
  for (; n < PER_TICK; n++) if (!await runOneCommand(t)) break
  return n
}

/** Claim and run the oldest queued command; false when the queue is empty. */
async function runOneCommand(t: Tick): Promise<boolean> {
  return tx(async c => {
    const r = await c.query<{ id: string; client_id: string; source: Source; kind: string; payload: Json }>(
      `select sc.id, sc.client_id, sc.source, sc.kind, sc.payload
       from data.source_commands sc join data.clients cl on cl.id = sc.client_id
       where sc.status = 'queued' and cl.status = 'active'
       order by sc.created_at limit 1 for update of sc skip locked`)
    const cmd = r.rows[0]
    if (!cmd) return false

    let status: 'done' | 'failed' = 'done'
    let result: Json
    try {
      const cmds = connectors[cmd.source]?.commands
      const run = cmds && Object.hasOwn(cmds, cmd.kind) ? cmds[cmd.kind] : undefined
      if (!run) throw new Error(`unknown command: ${cmd.source}/${cmd.kind}`)
      result = await run(await contextFor(t, cmd.client_id, cmd.source), cmd.payload)
    } catch (e) {
      status = 'failed'
      result = { error: redact(e instanceof Error ? e.message : String(e)) }
    }
    await c.query(`update data.source_commands set status = $2, result = $3, done_at = now() where id = $1`,
      [cmd.id, status, JSON.stringify(result ?? {})])
    // Make the next sync reflect the write; a failed command changed nothing, so no reason to.
    if (status === 'done') {
      await c.query(`update data.connector_schedule set next_run_at = now() where client_id = $1 and source = $2`,
        [cmd.client_id, cmd.source])
    }
    t.log('source_command', { client: cmd.client_id, source: cmd.source, kind: cmd.kind, status })
    return true
  })
}
