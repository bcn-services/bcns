// add-member --slug --email [--owner]  (DESIGN.md §5.10)
//
// NOTES: DESIGN says "invite email via Auth admin API" (auth.admin.inviteUserByEmail). That needs a
// working mail sender; this local stack's inbucket is stopped so the invite 500s and creates no
// user. Tries inviteUserByEmail first (the real path once mail is configured); on failure falls
// back to admin.createUser with a printed one-time password.
import { parseArgs } from 'node:util'
import { randomBytes } from 'node:crypto'
import { die, pgClient, serviceClient, clientIdForSlug, isMain, runMain } from './_lib.js'

export async function main(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: { slug: { type: 'string' }, email: { type: 'string' }, owner: { type: 'boolean' } },
  })
  const { slug, email } = values
  if (!slug || !email) die('usage: add-member --slug <slug> --email <email> [--owner]')
  const role = values.owner ? 'owner' : 'member'

  const db = pgClient()
  try {
    const clientId = await clientIdForSlug(db, slug)
    const admin = serviceClient()

    let userId: string
    const invite = await admin.auth.admin.inviteUserByEmail(email)
    if (invite.data.user) {
      userId = invite.data.user.id
      console.log(`invited ${email}`)
    } else {
      const password = randomBytes(18).toString('base64url')
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
      if (error || !data.user) die(`create user: ${error?.message ?? invite.error?.message}`)
      userId = data.user.id
      console.log(`invite email unavailable (${invite.error?.message}); created ${email} directly`)
      console.log(`temporary password (save now, shown once): ${password}`)
    }

    await db.query(
      `insert into data.memberships (user_id, client_id, role) values ($1, $2, $3)
       on conflict (user_id) do update set client_id = excluded.client_id, role = excluded.role`,
      [userId, clientId, role],
    )
    console.log(`added ${email} to ${slug} as ${role}`)
  } finally {
    await db.end()
  }
}

if (isMain(import.meta.url)) runMain(main)
