// Regenerates api/contract.json from the live local stack. Run only on an intentional additive change.
import { writeFileSync } from 'node:fs'
import { pool, sql } from './helpers.js'

const r = await sql<{ table_name: string; column_name: string; type: string }>(
  `select table_name, column_name, case when data_type = 'USER-DEFINED' or data_type = 'ARRAY' then udt_name else data_type end as type
     from information_schema.columns where table_schema = 'api' order by 1, 2`)
const contract: Record<string, Record<string, string>> = {}
for (const row of r.rows) (contract[row.table_name] ??= {})[row.column_name] = row.type
writeFileSync(new URL('../api/contract.json', import.meta.url), JSON.stringify(contract, null, 2) + '\n')
await pool.end()
console.log(`api/contract.json: ${Object.keys(contract).length} views`)
