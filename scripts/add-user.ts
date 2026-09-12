// add-user --slug --email [--owner]  (DESIGN.md §11 N4: owner "add user" stays a bcns script.)
// DESIGN §5.10 only names `add-member`, which already is that script (create auth user + membership,
// service key required). `add-user` is the operator-facing name N4 uses for the same action, so this
// is a thin alias rather than a second implementation.
import { main } from './add-member.js'
import { isMain, runMain } from './_lib.js'

export { main }
if (isMain(import.meta.url)) runMain(main)
