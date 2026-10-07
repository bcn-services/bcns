"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/session";
import { changeFolder, resyncSource, type MutationDeps } from "@/lib/source-settings";

// requireOwner redirects a member away before any RPC runs; the database re-checks the role.
const deps: MutationDeps = {
  requireOwner: (denyTo) => requireOwner(denyTo),
  revalidate: (path) => revalidatePath(path),
};

export async function resyncAction(form: FormData) {
  redirect(await resyncSource(form, deps));
}

export async function changeFolderAction(form: FormData) {
  redirect(await changeFolder(form, deps));
}
