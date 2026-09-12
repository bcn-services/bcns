// rotate-smoke --slug [--remove]  (DESIGN.md §5.10, §3.3 F42: the only path that can touch is_smoke rows)
//
// NOTES: "updates the password manager entry and the dashboard repo's CI secret via `gh secret set`"
// is out of scope here (no password-manager integration, no target dashboard repo in this build).
// The new/rotated password is printed once instead.
import { parseArgs } from 'node:util'
import { randomBytes } from 'node:crypto'
import { die, pgClient, serviceClient, clientIdForSlug, isMain, runMain } from './_lib.js'

export async function main(argv: string[]): Promise<void> {
  const { values } = parseArgs({ args: argv, options: { slug: { type: 'string' }, remove: { type: 'boolean' } } })
  const { slug } = values
  if (!slug) die('usage: rotate-smoke --slug <slug> [--remove]')

  const db = pgClient()
  try {
    const clientId = await clientIdForSlug(db, slug)
    const existing = await db.query<{ user_id: string }>(
      'select user_id from data.memberships where client_id = $1 and is_smoke = true',
      [clientId],
    )
    const admin = serviceClient()

    if (values.remove) {
      if (existing.rowCount === 0) die(`no smoke user for ${slug}`)
      const userId = existing.rows[0].user_id
      await db.query('delete from data.memberships where user_id = $1', [userId])
      const { error } = await admin.auth.admin.deleteUser(userId)
      if (error) die(`delete smoke user: ${error.message}`)
      console.log(`removed smoke user for ${slug}`)
      return
    }

    const password = randomBytes(18).toString('base64url')
    if (existing.rowCount === 0) {
      const email = `smoke+${slug}@bcn-services.com`
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
      if (error || !data.user) die(`create smoke user: ${error?.message}`)
      await db.query('insert into data.memberships (user_id, client_id, role, is_smoke) values ($1, $2, $3, true)', [
        data.user.id,
        clientId,
        'member',
      ])
      console.log(`created smoke user: ${email}`)
    } else {
      const { error } = await admin.auth.admin.updateUserById(existing.rows[0].user_id, { password })
      if (error) die(`rotate smoke user password: ${error.message}`)
      console.log(`rotated smoke user password for ${slug}`)
    }
    console.log(`smoke password (save now, shown once): ${password}`)
  } finally {
    await db.end()
  }
}

if (isMain(import.meta.url)) runMain(main)
