"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PINS_COOKIE, cleanPins, sanitizeReturnTo, serializePins } from "@/lib/data-stats";

/**
 * Save which stats are pinned on /data. The choice lives in a cookie, so it is per
 * browser, not per account: another device or browser starts from the defaults.
 * That is deliberate: no table, no service role, nothing to migrate.
 */
export async function savePins(form: FormData): Promise<void> {
  const returnTo = sanitizeReturnTo(form.get("returnTo"));
  const jar = cookies();
  if (form.get("reset")) {
    jar.delete({ name: PINS_COOKIE, path: "/data" });
  } else {
    jar.set(PINS_COOKIE, serializePins(cleanPins(form.getAll("pin"))), {
      httpOnly: true,
      sameSite: "lax",
      path: "/data",
      maxAge: 60 * 60 * 24 * 365,
      secure: process.env.NODE_ENV === "production",
    });
  }
  redirect(returnTo);
}
