// Cloud Run Job entry: one tick, then exit. Cloud Scheduler runs the job every 5 minutes (§5.1).
import { closePool } from './db.js'
import { tick } from './tick.js'

const r = await tick().catch(e => {
  console.error(JSON.stringify({ event: 'tick_failed', error: e instanceof Error ? e.message : String(e) }))
  process.exitCode = 1
  return null
})
if (r) console.log(JSON.stringify({ event: 'tick_done', ...r }))
await closePool()
