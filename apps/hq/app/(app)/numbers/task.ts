export type Result = { ok: true; message: string } | { ok: false; message: string };

/** Runs `fn` unless one for `key` is already in flight: a held key or a double click is a no-op. */
export async function oncePerKey(
  busy: Record<string, boolean>,
  key: string,
  fn: () => Promise<void>
): Promise<void> {
  if (busy[key]) return;
  busy[key] = true;
  try {
    await fn();
  } finally {
    busy[key] = false;
  }
}
