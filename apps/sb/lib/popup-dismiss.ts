/**
 * popup-dismiss.ts — the one rule that closes every `<details className="popup">`:
 * Escape closes all open popups; a click closes each open popup that does not
 * contain the click target (so the summary and the panel itself still work).
 * Pure so tests can drive it with fakes; app/_components/PopupDismiss.tsx is the
 * only caller and listens once for the whole app.
 */

export const OPEN_POPUPS = "details.popup[open]";

export interface PopupLike {
  open: boolean;
  contains(target: unknown): boolean;
}

export function popupsToClose<T extends PopupLike>(open: T[], event: { type: string; key?: string; target: unknown }): T[] {
  if (event.type === "keydown") return event.key === "Escape" ? open : [];
  if (event.type === "click") return open.filter((p) => !p.contains(event.target));
  return [];
}
