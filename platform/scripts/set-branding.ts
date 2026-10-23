// set-branding <client_id> --logo <png> [--favicon <png>] [--name <text>] [--accent #rrggbb]
// Uploads the client's logo/favicon to the public `branding` bucket (<client_id>/logo.png, <client_id>/favicon.png)
// with the service role and merges {logo_path, favicon_path, name, accent} into data.clients.branding.
// Everything is validated before anything is written. Env: DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// (local-stack defaults like the sibling scripts); none of them is ever printed.
import { parseArgs } from 'node:util'
import { readFile } from 'node:fs/promises'
import { die, pgClient, serviceClient, isMain, runMain } from './_lib.js'

const USAGE = 'usage: set-branding <client_id> --logo <png> [--favicon <png>] [--name <text>] [--accent #rrggbb]'
const MAX_BYTES = 1024 * 1024 // matches the bucket's file_size_limit
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** Magic bytes, not the file name: a renamed .jpg is not a PNG. */
export const isPng = (b: Uint8Array): boolean => b.length > PNG_MAGIC.length && PNG_MAGIC.every((x, i) => b[i] === x)

async function readPng(flag: string, path: string): Promise<Buffer> {
  const bytes = await readFile(path).catch(() => die(`--${flag}: cannot read ${path}`))
  if (!isPng(bytes)) die(`--${flag}: ${path} is not a PNG (bad magic bytes)`)
  if (bytes.length > MAX_BYTES) die(`--${flag}: ${path} is over 1 MB`)
  return bytes
}

export async function main(argv: string[]): Promise<void> {
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options: {
    logo: { type: 'string' }, favicon: { type: 'string' }, name: { type: 'string' }, accent: { type: 'string' } } })
  const [clientId] = positionals
  if (!clientId || positionals.length > 1 || !values.logo) die(USAGE)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(clientId)) die(`not a client id (uuid): ${clientId}`)
  if (values.accent !== undefined && !/^#[0-9a-fA-F]{6}$/.test(values.accent)) die(`--accent must look like #1a2b3c: ${values.accent}`)
  if (values.name !== undefined && (values.name.trim() === '' || values.name.length > 60)) die('--name must be 1-60 characters')

  const logo = await readPng('logo', values.logo)
  const favicon = values.favicon ? await readPng('favicon', values.favicon) : null

  const db = pgClient()
  try {
    if (!(await db.query('select 1 from data.clients where id = $1', [clientId])).rowCount) die(`no client with id ${clientId}`)

    const bucket = serviceClient().storage.from('branding')
    const put = async (name: string, bytes: Buffer) => {
      const { error } = await bucket.upload(`${clientId}/${name}`, bytes, { contentType: 'image/png', upsert: true })
      if (error) die(`upload ${name} failed: ${error.message}`)
    }
    await put('logo.png', logo)
    if (favicon) await put('favicon.png', favicon)

    const patch: Record<string, string> = { logo_path: `${clientId}/logo.png` }
    if (favicon) patch.favicon_path = `${clientId}/favicon.png`
    if (values.name !== undefined) patch.name = values.name.trim()
    if (values.accent !== undefined) patch.accent = values.accent.toLowerCase()
    await db.query(`update data.clients set branding = coalesce(branding, '{}'::jsonb) || $2::jsonb where id = $1`,
      [clientId, JSON.stringify(patch)])
    console.log(`branding set for ${clientId}: ${Object.keys(patch).join(', ')}`)
  } finally {
    await db.end()
  }
}

if (isMain(import.meta.url)) runMain(main)
